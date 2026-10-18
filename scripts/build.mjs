import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
const site = join(root, "_site");

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "campus-buildings.js"]) {
  await cp(join(root, file), join(site, file));
}
await cp(join(root, "assets"), join(site, "assets"), { recursive: true });
