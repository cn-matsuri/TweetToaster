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

const SERVICE_HOST = "(?:www\\.|mobile\\.)?(?:x\\.com|twitter\\.com|fixupx\\.com|fxtwitter\\.com)";
const STATUS_URL = new RegExp(`^(?:https?://)?${SERVICE_HOST}/([^/?#]+)/status(?:es)?/(\\d+)(?:[/?#].*)?$`, "i");
const PROFILE_URL = new RegExp(`^(?:https?://)?${SERVICE_HOST}/@?([A-Za-z0-9_]{1,15})(?:[/?#].*)?$`, "i");
const HANDLE = /^@?([A-Za-z0-9_]{1,15})$/;
const RESERVED_PROFILE_PATHS = new Set(["compose", "explore", "home", "i", "intent", "messages", "notifications", "search", "settings"]);

export function parseTweetInput(value) {
  if (typeof value !== "string") {
    throw new TweetProviderError("请输入 X 用户名、主页或推文链接", { status: 400, code: "INVALID_INPUT" });
  }
  const input = value.trim();
  const statusMatch = input.match(STATUS_URL);
  if (statusMatch) {
    return {
      kind: "status",
      id: statusMatch[2],
      screenName: statusMatch[1],
      canonicalUrl: `https://x.com/${statusMatch[1]}/status/${statusMatch[2]}`
    };
  }

  const profileMatch = input.match(PROFILE_URL) || input.match(HANDLE);
  const screenName = profileMatch?.[1];
  if (screenName && !RESERVED_PROFILE_PATHS.has(screenName.toLowerCase())) {
    return {
      kind: "profile",
      id: null,
      screenName,
      canonicalUrl: `https://x.com/${screenName}`
    };
  }

  throw new TweetProviderError("请输入 @用户名、X 主页，或具体推文链接；https:// 可以省略", {
    status: 400,
    code: "INVALID_INPUT"
  });
}

export function parseTweetUrl(value) {
  const parsed = parseTweetInput(value);
  if (parsed.kind !== "status") {
    throw new TweetProviderError("这里需要具体推文链接", { status: 400, code: "INVALID_URL" });
  }
  return parsed;
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

export function normalizeStatus(status, focalId = "", relation = "context") {
  if (!status || status.type === "tombstone" || !status.id) return null;
  const replyingTo = typeof status.replying_to === "object"
    ? status.replying_to?.screen_name
    : status.replying_to;
  const replyingToStatusId = typeof status.replying_to === "object"
    ? status.replying_to?.status
    : status.replying_to_status;
  return {
    id: String(status.id),
    url: status.url || `https://x.com/i/status/${status.id}`,
    focal: String(status.id) === String(focalId),
    relation: String(status.id) === String(focalId) ? "target" : relation,
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
    quote: status.quote ? normalizeStatus(status.quote, "", "quote") : null,
    replyingTo: replyingTo || null,
    replyingToStatusId: replyingToStatusId ? String(replyingToStatusId) : null
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

function chronological(statuses) {
  return [...statuses].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
}

function assertStatusPayload(payload) {
  if (!payload || payload.code !== 200 || !payload.status) {
    const message = payload?.message || "推文不存在、已删除或暂时无法读取";
    throw new TweetProviderError(message, { status: 404, code: "TWEET_NOT_FOUND" });
  }
}

export function normalizeProviderResponse(payload, parsed) {
  assertStatusPayload(payload);
  const thread = Array.isArray(payload.thread) ? payload.thread : [];
  const normalized = chronological(uniqueStatuses([
    ...thread.map((item) => normalizeStatus(item, parsed.id, "context")),
    normalizeStatus(payload.status, parsed.id, "context")
  ]));
  const focalIndex = normalized.findIndex((item) => item.focal);
  return {
    id: parsed.id,
    canonicalUrl: payload.status.url || parsed.canonicalUrl,
    mode: "conversation",
    query: { kind: "status", screenName: parsed.screenName, canonicalUrl: parsed.canonicalUrl },
    focalIndex: focalIndex >= 0 ? focalIndex : Math.max(0, normalized.length - 1),
    tweets: normalized
  };
}

export function normalizeConversationResponse(payload, parsed, { maxReplies = 20 } = {}) {
  assertStatusPayload(payload);
  const thread = Array.isArray(payload.thread) ? payload.thread : [];
  const replies = Array.isArray(payload.replies) ? payload.replies : [];
  const context = chronological(uniqueStatuses([
    ...thread.map((item) => normalizeStatus(item, parsed.id, "context")),
    normalizeStatus(payload.status, parsed.id, "context")
  ]));
  const seen = new Set(context.map((tweet) => tweet.id));
  const normalizedReplies = uniqueStatuses(replies
    .map((item) => normalizeStatus(item, parsed.id, "reply")))
    .filter((item) => item && !seen.has(item.id))
    .slice(0, maxReplies);
  const tweets = [...context, ...normalizedReplies];
  const focalIndex = tweets.findIndex((item) => item.focal);
  return {
    id: parsed.id,
    canonicalUrl: payload.status.url || parsed.canonicalUrl,
    mode: "conversation",
    query: { kind: "status", screenName: parsed.screenName, canonicalUrl: parsed.canonicalUrl },
    focalIndex: focalIndex >= 0 ? focalIndex : 0,
    tweets
  };
}

function flattenTimelineResults(results) {
  return results.flatMap((item) => {
    if (!item || item.type === "tombstone") return [];
    if (item.type !== "thread") return [item];
    return [...(Array.isArray(item.thread) ? item.thread : []), item.status].filter(Boolean);
  });
}

export function normalizeTimelineResponse(payload, parsed, { maxStatuses = 12 } = {}) {
  const results = Array.isArray(payload?.results) ? flattenTimelineResults(payload.results) : [];
  const raw = uniqueStatuses(results.map((item) => item?.id ? { id: String(item.id), raw: item } : null))
    .map((item) => item.raw)
    .slice(0, maxStatuses);
  if (payload?.code !== 200 || !raw.length) {
    throw new TweetProviderError(payload?.message || "该主页暂时没有可读取的公开推文", {
      status: 404,
      code: "TIMELINE_NOT_FOUND"
    });
  }
  const focalId = String(raw[0].id);
  const tweets = raw.map((item) => normalizeStatus(item, focalId, "timeline")).filter(Boolean);
  return {
    id: focalId,
    canonicalUrl: parsed.canonicalUrl,
    mode: "timeline",
    query: { kind: "profile", screenName: parsed.screenName, canonicalUrl: parsed.canonicalUrl },
    focalIndex: 0,
    tweets
  };
}

function providerRoot(value) {
  return String(value || "https://api.fxtwitter.com/2")
    .replace(/\/+$/, "")
    .replace(/\/status$/i, "");
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

export class FxTwitterProvider {
  constructor({
    fetchImpl = globalThis.fetch,
    baseUrl = process.env.TWEET_PROVIDER_URL || "https://api.fxtwitter.com/2",
    timeoutMs = Number(process.env.TWEET_PROVIDER_TIMEOUT_MS || 15000),
    timelineCount = Number(process.env.TWEET_TIMELINE_COUNT || 12),
    replyCount = Number(process.env.TWEET_REPLY_COUNT || 20)
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = providerRoot(baseUrl);
    this.timeoutMs = boundedInteger(timeoutMs, 15000, 1000, 60000);
    this.timelineCount = boundedInteger(timelineCount, 12, 1, 20);
    this.replyCount = boundedInteger(replyCount, 20, 0, 30);
  }

  async #request(pathname) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
        headers: {
          accept: "application/json",
          "user-agent": "TweetToaster/2.0 (+https://github.com/cn-matsuri/TweetToaster)"
        },
        signal: controller.signal
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? "公开推文数据源响应超时" : "无法连接公开推文数据源";
      throw new TweetProviderError(message, { status: 503, code: "PROVIDER_UNAVAILABLE" });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return { code: 204, results: [] };
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new TweetProviderError("公开推文数据源返回了无效响应", { status: 502 });
    }
    if (!response.ok && payload?.code !== 200) {
      throw new TweetProviderError(payload?.message || `公开推文数据源错误 (${response.status})`, {
        status: response.status === 404 ? 404 : 502
      });
    }
    return payload;
  }

  async fetchTweet(input) {
    const parsed = parseTweetInput(input);
    if (parsed.kind === "profile") {
      const query = new URLSearchParams({ count: String(this.timelineCount) });
      const payload = await this.#request(`/profile/${encodeURIComponent(parsed.screenName)}/statuses?${query}`);
      return normalizeTimelineResponse(payload, parsed, { maxStatuses: this.timelineCount });
    }

    try {
      const payload = await this.#request(`/conversation/${parsed.id}?ranking_mode=likes`);
      return normalizeConversationResponse(payload, parsed, { maxReplies: this.replyCount });
    } catch (conversationError) {
      try {
        const payload = await this.#request(`/status/${parsed.id}`);
        return normalizeProviderResponse(payload, parsed);
      } catch (statusError) {
        statusError.cause = conversationError;
        throw statusError;
      }
    }
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
