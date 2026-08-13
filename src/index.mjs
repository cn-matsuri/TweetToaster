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
  renderBot: (payload) => renderer.render(payload)
});

server.listen(port, host, () => {
  const browserHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  renderer = new BotRenderer({ origin: `http://${browserHost}:${port}`, cacheDir });
  console.log(`TweetToaster listening on http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close();
  await renderer?.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
