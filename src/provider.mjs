import { BlockList, isIP } from "node:net";

const PRIVATE_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]
]) PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10]]) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export class TweetProviderError extends Error {
  constructor(message, { status = 502, code = "PROVIDER_ERROR" } = {}) {
    super(message);
    this.name = "TweetProviderError";
    this.status = status;
    this.code = code;
  }
}

const STATUS_URL = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fixupx\.com|fxtwitter\.com)\/([^/?#]+)\/status(?:es)?\/(\d+)(?:[/?#].*)?$/i;

export function parseTweetUrl(value) {
  if (typeof value !== "string") {
    throw new TweetProviderError("请提供推文链接", { status: 400, code: "INVALID_URL" });
  }
  const input = value.trim();
  const match = input.match(STATUS_URL);
  if (!match) {
    throw new TweetProviderError("仅支持 x.com 或 twitter.com 的推文永久链接", {
      status: 400,
      code: "INVALID_URL"
    });
  }
  return {
    id: match[2],
    screenName: match[1],
    canonicalUrl: `https://x.com/${match[1]}/status/${match[2]}`
  };
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeMedia(media = {}) {
  const items = Array.isArray(media.all)
    ? media.all
    : [...(media.photos || []), ...(media.videos || [])];
  return items.slice(0, 4).map((item) => ({
    type: item.type || "photo",
    url: item.type === "video" || item.type === "gif"
      ? (item.thumbnail_url || item.url)
      : item.url,
    width: numberOrZero(item.width),
    height: numberOrZero(item.height),
    alt: item.altText || ""
  })).filter((item) => typeof item.url === "string" && item.url.startsWith("https://"));
}

function normalizeAuthor(author = {}) {
  return {
    name: author.name || author.screen_name || "未知用户",
    screenName: author.screen_name || "unknown",
    avatarUrl: author.avatar_url || "",
    verified: Boolean(author.verification?.verified || author.verification?.type)
  };
}

export function normalizeStatus(status, focalId) {
  if (!status || status.type === "tombstone" || !status.id) return null;
  return {
    id: String(status.id),
    url: status.url || `https://x.com/i/status/${status.id}`,
    focal: String(status.id) === String(focalId),
    text: status.text || status.raw_text?.text || "",
    lang: status.lang || null,
    createdAt: status.created_at || null,
    author: normalizeAuthor(status.author),
    counts: {
      replies: numberOrZero(status.replies),
      reposts: numberOrZero(status.reposts),
      likes: numberOrZero(status.likes),
      views: status.views == null ? null : numberOrZero(status.views)
    },
    media: normalizeMedia(status.media),
    quote: status.quote ? normalizeStatus(status.quote, "") : null,
    replyingTo: status.replying_to?.screen_name || status.replying_to || null
  };
}

function uniqueStatuses(statuses) {
  const seen = new Set();
  return statuses.filter((status) => {
    if (!status || seen.has(status.id)) return false;
    seen.add(status.id);
    return true;
  });
}

export function normalizeProviderResponse(payload, parsed) {
  if (!payload || payload.code !== 200 || !payload.status) {
    const message = payload?.message || "推文不存在、已删除或暂时无法读取";
    throw new TweetProviderError(message, { status: 404, code: "TWEET_NOT_FOUND" });
  }
  const thread = Array.isArray(payload.thread) ? payload.thread : [];
  const normalized = uniqueStatuses([
    ...thread.map((item) => normalizeStatus(item, parsed.id)),
    normalizeStatus(payload.status, parsed.id)
  ]);
  normalized.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
  const focalIndex = normalized.findIndex((item) => item.focal);
  return {
    id: parsed.id,
    canonicalUrl: payload.status.url || parsed.canonicalUrl,
    focalIndex: focalIndex >= 0 ? focalIndex : Math.max(0, normalized.length - 1),
    tweets: normalized
  };
}

export class FxTwitterProvider {
  constructor({
    fetchImpl = globalThis.fetch,
    baseUrl = process.env.TWEET_PROVIDER_URL || "https://api.fxtwitter.com/2/status",
    timeoutMs = Number(process.env.TWEET_PROVIDER_TIMEOUT_MS || 15000)
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  async fetchTweet(url) {
    const parsed = parseTweetUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${parsed.id}`, {
        headers: {
          accept: "application/json",
          "user-agent": "TweetToaster/2.0 (+https://github.com/cn-matsuri/TweetToaster)"
        },
        signal: controller.signal
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? "推文数据源响应超时" : "无法连接推文数据源";
      throw new TweetProviderError(message, { status: 503, code: "PROVIDER_UNAVAILABLE" });
    } finally {
      clearTimeout(timer);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new TweetProviderError("推文数据源返回了无效响应", { status: 502 });
    }
    if (!response.ok && payload?.code !== 200) {
      throw new TweetProviderError(payload?.message || `推文数据源错误 (${response.status})`, {
        status: response.status === 404 ? 404 : 502
      });
    }
    return normalizeProviderResponse(payload, parsed);
  }
}

export function isPrivateHostname(hostname) {
  const name = hostname.toLowerCase();
  if (name === "localhost" || name.endsWith(".local")) return true;
  const mapped = name.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return PRIVATE_ADDRESSES.check(mapped[1], "ipv4");
  const family = isIP(name);
  if (!family) return false;
  return PRIVATE_ADDRESSES.check(name, family === 4 ? "ipv4" : "ipv6");
}
