import dns from "node:dns/promises";
import { isPrivateHostname } from "./provider.mjs";
import { cancelResponseBody, readLimitedBody, requestScope } from "./request.mjs";

const IMAGE_HOSTS = new Set([
  "pbs.twimg.com",
  "video.twimg.com",
  "abs.twimg.com",
  "img.youtube.com",
  "i.ytimg.com"
]);
const TEMPLATE_HOSTS = new Set((process.env.TEMPLATE_ALLOWED_HOSTS || "tweet.wudifeixue.com,raw.githubusercontent.com")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));

async function assertPublicUrl(value, { imageOnly = false, allowedTemplateHosts = TEMPLATE_HOSTS, signal } = {}) {
  signal?.throwIfAborted();
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
    // OS lookup is not cancellable. Await it rather than orphaning work with a
    // Promise.race, and never start the download if its deadline passed meanwhile.
    const addresses = await dns.lookup(url.hostname, { all: true });
    signal?.throwIfAborted();
    if (addresses.some(({ address }) => isPrivateHostname(address))) throw new Error("不允许访问内网地址");
  }
  return url;
}

export async function fetchTemplate(value, { fetchImpl = globalThis.fetch, maxBytes = 64 * 1024, allowedTemplateHosts, signal } = {}) {
  const scope = requestScope({ signal, timeoutMs: 10000, timeoutMessage: "模板下载超时" });
  let response;
  try {
    const url = await assertPublicUrl(value, { allowedTemplateHosts, signal: scope.signal });
    scope.signal.throwIfAborted();
    response = await fetchImpl(url, { signal: scope.signal, redirect: "error" });
    scope.signal.throwIfAborted();
    if (!response.ok) throw new Error(`模板下载失败 (${response.status})`);
    return (await readLimitedBody(response, maxBytes, { signal: scope.signal })).toString("utf8");
  } catch (error) {
    scope.abort(error);
    signal?.throwIfAborted();
    throw error;
  } finally {
    await cancelResponseBody(response);
    scope.dispose();
  }
}

export async function fetchImage(value, { fetchImpl = globalThis.fetch, maxBytes = 12 * 1024 * 1024, signal } = {}) {
  const scope = requestScope({ signal, timeoutMs: 15000, timeoutMessage: "图片下载超时" });
  let response;
  try {
    const url = await assertPublicUrl(value, { imageOnly: true, signal: scope.signal });
    scope.signal.throwIfAborted();
    response = await fetchImpl(url, { signal: scope.signal, redirect: "follow" });
    scope.signal.throwIfAborted();
    if (!response.ok) throw new Error(`图片下载失败 (${response.status})`);
    const contentType = (response.headers.get("content-type") || "").split(";")[0];
    if (!contentType.startsWith("image/")) throw new Error("远程内容不是图片");
    const bytes = await readLimitedBody(response, maxBytes, { signal: scope.signal });
    return { bytes, contentType, cacheControl: "public, max-age=86400" };
  } catch (error) {
    scope.abort(error);
    signal?.throwIfAborted();
    throw error;
  } finally {
    await cancelResponseBody(response);
    scope.dispose();
  }
}
