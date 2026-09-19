import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTweetToasterServer } from "./app.mjs";
import { MemoryJobQueue } from "./jobs.mjs";
import { FxTwitterProvider } from "./provider.mjs";
import { BotRenderer } from "./renderer.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "Matsuri_translation/frontend");
const cacheDir = path.join(publicDir, "cache");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8082);

const provider = new FxTwitterProvider();
const jobs = new MemoryJobQueue();
let renderer;

const server = createTweetToasterServer({
  provider,
  jobs,
  publicDir,
  renderBot: (payload, options) => renderer.render(payload, options)
});

server.listen(port, host, () => {
  const browserHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  renderer = new BotRenderer({ origin: `http://${browserHost}:${port}`, cacheDir });
  console.log(`TweetToaster listening on http://${host}:${port}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down`);
  server.close();
  // Disconnect direct HTTP work as well as aborting queued jobs. Wait for the
  // renderer to reap its owned Chromium process before the parent exits.
  server.closeAllConnections();
  await Promise.all([jobs.close(), renderer?.close()]);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
