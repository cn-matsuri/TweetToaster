import dns from "node:dns/promises";
import { isPrivateHostname } from "./provider.mjs";

const IMAGE_HOSTS = new Set([
  "pbs.twimg.com",
  "video.twimg.com",
  "abs.twimg.com",
  "img.youtube.com",
  "i.ytimg.com"
]);
const TEMPLATE_HOSTS = new Set((process.env.TEMPLATE_ALLOWED_HOSTS || "tweet.wudifeixue.com,raw.githubusercontent.com")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));

async function readLimitedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("远程文件过大");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new Error("远程文件过大");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

async function assertPublicUrl(value, { imageOnly = false, allowedTemplateHosts = TEMPLATE_HOSTS } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("无效的远程地址");
  }
  if (url.protocol !== "https:") throw new Error("远程地址必须使用 HTTPS");
  if (imageOnly) {
    if (!IMAGE_HOSTS.has(url.hostname)) throw new Error("不支持的图片来源");
  } else {
    if (!allowedTemplateHosts.has(url.hostname.toLowerCase())) throw new Error("不支持的模板来源");
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateHostname(address))) throw new Error("不允许访问内网地址");
  }
  return url;
}

export async function fetchTemplate(value, { fetchImpl = globalThis.fetch, maxBytes = 64 * 1024, allowedTemplateHosts } = {}) {
  const url = await assertPublicUrl(value, { allowedTemplateHosts });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`模板下载失败 (${response.status})`);
    return (await readLimitedBody(response, maxBytes)).toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchImage(value, { fetchImpl = globalThis.fetch, maxBytes = 12 * 1024 * 1024 } = {}) {
  const url = await assertPublicUrl(value, { imageOnly: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) throw new Error(`图片下载失败 (${response.status})`);
    const contentType = (response.headers.get("content-type") || "").split(";")[0];
    if (!contentType.startsWith("image/")) throw new Error("远程内容不是图片");
    const bytes = await readLimitedBody(response, maxBytes);
    return { bytes, contentType, cacheControl: "public, max-age=86400" };
  } finally {
    clearTimeout(timer);
  }
}
