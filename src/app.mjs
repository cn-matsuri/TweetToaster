import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TweetProviderError } from "./provider.mjs";
import { fetchImage, fetchTemplate } from "./remote.mjs";

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN"
};

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function errorJson(response, error) {
  const declaredStatus = Number(error?.status);
  const status = declaredStatus || 500;
  json(response, status, {
    error: {
      code: error?.code || (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST"),
      message: declaredStatus ? error.message : "服务器暂时无法处理请求"
    }
  });
}

async function readJson(request, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("请求内容过大");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("请求 JSON 格式无效");
    error.status = 400;
    throw error;
  }
}

async function serveStatic(requestPath, response, publicDir) {
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relative);
  const root = `${path.resolve(publicDir)}${path.sep}`;
  if (!filePath.startsWith(root)) return false;
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "content-length": info.size,
    "cache-control": relative.startsWith("cache/") ? "public, max-age=86400" : "no-cache"
  });
  if (response.req?.method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
  return true;
}

async function readLocalTemplate(value, publicDir, maxBytes = 64 * 1024) {
  const relative = value.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relative);
  const root = `${path.resolve(publicDir)}${path.sep}`;
  if (!filePath.startsWith(root)) {
    const error = new Error("模板路径无效");
    error.status = 400;
    throw error;
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    const error = new Error("模板不存在");
    error.status = 400;
    throw error;
  }
  if (!info.isFile() || info.size > maxBytes) {
    const error = new Error("模板不存在或文件过大");
    error.status = 400;
    throw error;
  }
  return readFile(filePath, "utf8");
}

function validateAutoEvent(event) {
  if (!event || typeof event !== "object") throw new TweetProviderError("缺少任务内容", { status: 400 });
  if (typeof event.tweet !== "string") throw new TweetProviderError("缺少 tweet 输入", { status: 400 });
  return {
    tweet: event.tweet,
    translate: typeof event.translate === "string" ? event.translate : "",
    template: typeof event.template === "string" ? event.template : "",
    noLikes: Boolean(event.noLikes),
    logo: typeof event.logo === "string" ? event.logo : "official",
    customLogo: typeof event.customLogo === "string" ? event.customLogo : "",
    fontSize: Number(event.fontSize) || 26,
    selection: validateSelection(event.selection, { optional: true })
  };
}

function validateSelection(value, { optional = false } = {}) {
  if (value == null && optional) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new TweetProviderError("请至少选择一条、最多选择 30 条推文", { status: 400, code: "INVALID_SELECTION" });
  }
  const seen = new Set();
  return value.map((item) => {
    const id = String(item?.id || "");
    const translation = typeof item?.translation === "string" ? item.translation : "";
    if (!/^\d{2,20}$/.test(id) || seen.has(id) || translation.length > 10000) {
      throw new TweetProviderError("选中的推文或翻译内容无效", { status: 400, code: "INVALID_SELECTION" });
    }
    seen.add(id);
    return { id, translation };
  });
}

function validateRenderEvent(event) {
  const normalized = validateAutoEvent(event);
  normalized.selection = validateSelection(event.selection);
  if (normalized.template.length > 64 * 1024) {
    throw new TweetProviderError("模板文件过大", { status: 413, code: "TEMPLATE_TOO_LARGE" });
  }
  if (!new Set(["official", "keke", "magic", "none", "custom"]).has(normalized.logo)) {
    throw new TweetProviderError("Logo 选项无效", { status: 400, code: "INVALID_LOGO" });
  }
  if (normalized.logo === "custom" && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(normalized.customLogo)) {
    throw new TweetProviderError("自定义 Logo 仅支持 PNG、JPEG 或 WebP", { status: 400, code: "INVALID_LOGO" });
  }
  if (normalized.customLogo.length > 3 * 1024 * 1024) {
    throw new TweetProviderError("自定义 Logo 请控制在 2 MB 以内", { status: 413, code: "LOGO_TOO_LARGE" });
  }
  normalized.fontSize = Math.min(36, Math.max(18, normalized.fontSize));
  return normalized;
}

async function resolveTemplate(value, { fetchImpl, publicDir }) {
  if (/^https:\/\//i.test(value)) return fetchTemplate(value, { fetchImpl });
  if (/^(?:\/?template\/|\/).+\.txt$/i.test(value)) return readLocalTemplate(value, publicDir);
  return value;
}

export function createTweetToasterServer({
  provider,
  jobs,
  renderBot,
  publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../Matsuri_translation/frontend"),
  cacheDir = path.join(publicDir, "cache"),
  fetchImpl = globalThis.fetch
}) {
  if (!provider || !jobs || !renderBot) throw new Error("provider、jobs 和 renderBot 均为必填项");

  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        return json(response, 200, { status: "ok", version: "2.0.0" });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/tweet") {
        const body = await readJson(request);
        const data = await provider.fetchTweet(body.url ?? body.input);
        return json(response, 200, data);
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/auto") {
        const event = validateAutoEvent(await readJson(request));
        const taskId = jobs.add(async () => {
          const data = await provider.fetchTweet(event.tweet);
          const template = await resolveTemplate(event.template, { fetchImpl, publicDir });
          return renderBot({ data, ...event, template });
        });
        return json(response, 200, { task_id: taskId });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/render") {
        const event = validateRenderEvent(await readJson(request, 4 * 1024 * 1024));
        const taskId = jobs.add(async () => {
          const data = await provider.fetchTweet(event.tweet);
          const template = await resolveTemplate(event.template, { fetchImpl, publicDir });
          return renderBot({ data, ...event, template });
        });
        return json(response, 200, { task_id: taskId });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/tasks") {
        const body = await readJson(request);
        const taskId = jobs.add(async () => JSON.stringify(await provider.fetchTweet(body.url)));
        return json(response, 200, { task_id: taskId });
      }

      if (request.method === "GET" && requestUrl.pathname.startsWith("/api/get_task=")) {
        const taskId = requestUrl.pathname.slice("/api/get_task=".length);
        const task = jobs.get(taskId);
        return json(response, 200, {
          task_id: taskId,
          state: task.state,
          result: task.result,
          error: task.error || undefined
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/media") {
        const remote = requestUrl.searchParams.get("url") || "";
        const image = await fetchImage(remote, { fetchImpl });
        response.writeHead(200, {
          ...SECURITY_HEADERS,
          "content-type": image.contentType,
          "content-length": image.bytes.length,
          "cache-control": image.cacheControl
        });
        return response.end(image.bytes);
      }

      if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname.startsWith("/cache/") &&
          await serveStatic(requestUrl.pathname.slice("/cache".length), response, cacheDir)) {
        return;
      }

      if ((request.method === "GET" || request.method === "HEAD") && await serveStatic(requestUrl.pathname, response, publicDir)) {
        return;
      }

      json(response, 404, { error: { code: "NOT_FOUND", message: "接口不存在" } });
    } catch (error) {
      if ((Number(error?.status) || 500) >= 500) console.error(error);
      errorJson(response, error);
    }
  });
}
