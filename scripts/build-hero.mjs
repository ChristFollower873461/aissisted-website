// Usage: npm run build:hero
// Bundles assets/hero/hero-scene.src.js with the vendored Three.js (tree-shaken, minified, ESM)
// into assets/hero/hero-scene.min.js and prints the byte budget.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "assets/hero/hero-scene.src.js");
const outfile = path.join(root, "assets/hero/hero-scene.min.js");
const BUDGET_GZIP = 150 * 1024;

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "chrome90", "safari15", "firefox90"],
  legalComments: "none",
  banner: {
    js: "/* AIssisted hero scene. Built by scripts/build-hero.mjs from assets/hero/hero-scene.src.js and the vendored Three.js r184 (MIT, assets/vendor/THREE-LICENSE.txt). Do not edit; run `npm run build:hero`. */",
  },
});

const raw = readFileSync(outfile);
const gz = gzipSync(raw, { level: 9 });
const line = `${path.relative(root, outfile)}: ${raw.length} bytes minified, ${gz.length} bytes gzipped (budget ${BUDGET_GZIP})`;
console.log(line);
if (gz.length > BUDGET_GZIP) {
  console.error("hero bundle exceeds the gzipped budget");
  process.exit(1);
}
