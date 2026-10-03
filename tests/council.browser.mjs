// Manual browser proof: node tests/council.browser.mjs (requires Playwright Chromium).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.COUNCIL_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.COUNCIL_QA_DIR || "/tmp/aissisted-council-qa";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Outside root");
    res.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
    res.setHeader("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal"] : [] });
const proof = [];
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 320 ? "reduce" : "no-preference" });
    const page = await context.newPage(), errors = [], gameRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => { if (new URL(req.url()).hostname === "play.dripcouncil.org") gameRequests.push(req.url()); });
    await page.route("https://play.dripcouncil.org/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Synthetic game destination</title>Ship ready" }));
    await page.goto(base, { waitUntil: "networkidle" });
    const paw = page.getByRole("link", { name: "Discover the Drip Council" });
    await paw.scrollIntoViewIfNeeded();
    const box = await paw.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/footer-${width}.png`, animations: "disabled" });
    await paw.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "You found the Council." });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await page.locator(".council-sail").evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator(".council-close").evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".council-sail").evaluate((node) => node === document.activeElement), true);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 900);
    if (width === 320) {
      assert.equal(await dialog.evaluate((node) => getComputedStyle(node).animationName), "none");
      assert.equal(await paw.evaluate((node) => getComputedStyle(node, "::after").animationName), "none");
    }
    await page.screenshot({ path: `${output}/dialog-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await paw.evaluate((node) => node === document.activeElement), true);
    await paw.click(); await page.getByRole("button", { name: "Back to AIssisted" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await paw.evaluate((node) => node === document.activeElement), true);
    await paw.click();
    assert.deepEqual(gameRequests, [], "opening the dialog must not fetch the game");
    assert.deepEqual(errors, []);
    await page.getByRole("link", { name: "Set sail" }).click();
    await page.waitForURL("https://play.dripcouncil.org/");
    assert.equal(gameRequests.length, 1);
    proof.push({ width, keyboardFocus: true, escapeClose: true, buttonClose: true, noGameRequestsBeforeEntry: true, noOverflow: true, errors });
    await context.close();
  }
  for (const mode of ["no-javascript", "no-dialog"]) {
    const context = await browser.newContext({ javaScriptEnabled: mode !== "no-javascript", reducedMotion: "reduce" });
    if (mode === "no-dialog") await context.addInitScript(() => { HTMLDialogElement.prototype.showModal = undefined; });
    const page = await context.newPage();
    await page.route("https://play.dripcouncil.org/**", (route) => route.fulfill({ contentType: "text/html", body: "Ship ready" }));
    await page.goto(base);
    await page.getByRole("link", { name: "Discover the Drip Council" }).click();
    await page.waitForURL("https://play.dripcouncil.org/");
    proof.push({ mode, fallbackNavigation: true });
    await context.close();
  }
  await writeFile(`${output}/proof.json`, JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify({ output, proof }, null, 2));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
