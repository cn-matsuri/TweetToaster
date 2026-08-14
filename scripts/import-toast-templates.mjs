import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, "Matsuri_translation/frontend/template"));
const outputRoot = path.join(repositoryRoot, "Matsuri_translation/frontend/templates");
const catalog = JSON.parse(await readFile(path.join(sourceRoot, "catalog.json"), "utf8"));
const assets = new Set();

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "img"), { recursive: true });

for (const item of catalog.templates) {
  const source = await readFile(path.join(sourceRoot, item.file), "utf8");
  const normalized = source.replaceAll("/template/", "/templates/");
  for (const match of normalized.matchAll(/\/templates\/img\/([A-Za-z0-9_.-]+)/g)) assets.add(match[1]);
  await writeFile(path.join(outputRoot, item.file), normalized);
  assets.add(path.basename(item.logo));
}

for (const name of [...assets].sort()) {
  await copyFile(path.join(sourceRoot, "img", name), path.join(outputRoot, "img", name));
}

await writeFile(path.join(outputRoot, "catalog.json"), `${JSON.stringify({
  ...catalog,
  source: "https://github.com/cn-matsuri/toastTemplates"
}, null, 2)}\n`);
await writeFile(path.join(outputRoot, "README.md"),
  "# Bundled toast templates\n\nGenerated from `cn-matsuri/toastTemplates` with `npm run templates:sync`. Do not edit this directory by hand.\n");

console.log(`Imported ${catalog.templates.length} templates and ${assets.size} assets.`);
