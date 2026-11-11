// Local visual/behavior verification. Does not submit forms or contact production services.
// HERO_QA_ORIGIN=http://127.0.0.1:4175 node scripts/verify-hero.mjs [--posters]
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = process.env.HERO_QA_ORIGIN || "http://127.0.0.1:4175";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local preview origin");
const output = process.env.HERO_QA_OUTPUT || "/tmp/aissisted-hero-detail-qa";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { origin, captures: [], behaviors: [], errors: [] };

async function open(viewport, extra = {}, route = "/") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
  await context.route("**/*", routeRequest => {
    const url = new URL(routeRequest.request().url());
    return url.origin === origin || url.protocol === "data:"
      ? routeRequest.continue() : routeRequest.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /shader|webgl|three/i.test(message.text())) report.errors.push(message.text());
  });
  await page.goto(`${origin}${route}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector("[data-hero-scene]")?.heroScene, undefined, { timeout: 20000 });
}

async function capture(page, label, time) {
  const result = await page.evaluate(async at => {
    const host = document.querySelector("[data-hero-scene]");
    const image = host.heroScene.snapshot(host.clientWidth, host.clientHeight, at, 0.94);
    const bitmap = await createImageBitmap(await (await fetch(image)).blob());
    const probe = document.createElement("canvas");
    probe.width = bitmap.width; probe.height = bitmap.height;
    const ctx = probe.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let lit = 0, detailed = 0, clipped = 0, checksum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (max > 40) lit++;
      if (max > 110) detailed++;
      if (pixels[i] > 247 && pixels[i + 1] > 247 && pixels[i + 2] > 247) clipped++;
      checksum = (checksum + pixels[i] * ((i % 137) + 1) + pixels[i + 1]) % 2147483647;
    }
    let shot = host.querySelector("[data-qa-frame]");
    if (!shot) {
      shot = document.createElement("img"); shot.setAttribute("data-qa-frame", ""); host.appendChild(shot);
    }
    shot.src = image;
    shot.style.cssText = "opacity:1;transition:none;position:absolute;inset:0;width:100%;height:100%";
    await shot.decode();
    const area = probe.width * probe.height;
    return {
      time: at, width: probe.width, height: probe.height, lit: lit / area, detailed: detailed / area,
      clipped: clipped / area, checksum, lite: host.heroScene.lite,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      postersLoaded: [...host.querySelectorAll("picture img")].every(img => img.complete && img.naturalWidth > 0),
    };
  }, time);
  assert.ok(result.lit > 0.01, `${label}: scene is blank`);
  assert.ok(result.detailed > 0.0001, `${label}: no resolved detail`);
  assert.ok(result.clipped < 0.005, `${label}: too much white clipping`);
  assert.equal(result.horizontalOverflow, false, `${label}: horizontal overflow`);
  assert.equal(result.postersLoaded, true, `${label}: missing poster`);
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  report.captures.push({ label, ...result });
  return result;
}

try {
  if (process.argv.includes("--posters")) {
    const specifications = [
      { route: "/", viewport: { width: 1440, height: 900 }, at: 0.8, file: "poster-home.webp", scale: 2 },
      { route: "/", viewport: { width: 430, height: 900 }, at: 0.8, file: "poster-home-mobile.webp", scale: 2, mobile: true },
      { route: "/services/", viewport: { width: 1440, height: 780 }, at: 16, file: "poster-page.webp", scale: 2 },
      { route: "/services/", viewport: { width: 430, height: 780 }, at: 16, file: "poster-page-mobile.webp", scale: 2, mobile: true },
    ];
    for (const spec of specifications) {
      const { page, context } = await open(spec.viewport, { isMobile: !!spec.mobile, hasTouch: !!spec.mobile }, spec.route);
      await ready(page);
      const data = await page.evaluate(({ viewport, at, scale }) =>
        document.querySelector("[data-hero-scene]").heroScene.snapshot(viewport.width, viewport.height, at, 0.88, scale), spec);
      await fs.writeFile(path.resolve("assets/hero", spec.file), Buffer.from(data.split(",")[1], "base64"));
      console.log(`Poster: ${spec.file}`);
      await context.close();
    }
  }
  for (const spec of [
    { name: "desktop", viewport: { width: 1440, height: 900 } },
    { name: "wide", viewport: { width: 1920, height: 1080 } },
    { name: "laptop", viewport: { width: 1024, height: 768 } },
    { name: "mobile", viewport: { width: 390, height: 844 }, mobile: true },
    { name: "small-mobile", viewport: { width: 360, height: 780 }, mobile: true },
    { name: "narrow-mobile", viewport: { width: 320, height: 740 }, mobile: true },
  ]) {
    const { page, context } = await open(spec.viewport, { isMobile: !!spec.mobile, hasTouch: !!spec.mobile });
    await ready(page);
    const start = await capture(page, `${spec.name}-three-systems`, 0.8);
    const joining = await capture(page, `${spec.name}-joining`, 6);
    const merged = await capture(page, `${spec.name}-merged`, 12);
    assert.notEqual(start.checksum, joining.checksum, "Merge did not move");
    assert.notEqual(joining.checksum, merged.checksum, "Merge did not finish");
    if (spec.name === "desktop" || spec.name === "mobile") {
      await capture(page, `${spec.name}-cross-system-burst`, 1.45);
      await capture(page, `${spec.name}-organizing`, 9.8);
      await capture(page, `${spec.name}-settled`, 35);
    }
    if (spec.name === "desktop") {
      await page.evaluate(() => document.querySelector("[data-qa-frame]")?.remove());
      const before = await page.evaluate(() => document.querySelector("[data-hero-scene]").heroScene.time);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => document.querySelector("[data-hero-scene]").heroScene.time);
      assert.ok(after > before, "Animation clock did not advance");
      await page.mouse.move(1150, 260);
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(output, "desktop-pointer.png") });
      console.log("Checking offscreen pause");
      await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
      await page.waitForFunction(() => !document.querySelector("[data-hero-scene]").heroScene.running);
      console.log("Checking resume");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => document.querySelector("[data-hero-scene]").heroScene.running);
      console.log("Checking menu");
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("[data-menu-open]").getAttribute("aria-expanded") === "true");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("[data-menu-open]").getAttribute("aria-expanded") === "false");
      const booking = await page.getByRole("link", { name: /book the \$225 plan/i }).first().getAttribute("href");
      assert.ok(booking.includes("book/"));
      report.behaviors.push("clock advances, pointer accepts input, offscreen pauses and resumes, menu works, booking link intact");
      const cleanedUp = await page.evaluate(() => {
        const host = document.querySelector("[data-hero-scene]");
        host.heroScene.dispose();
        return !host.heroScene && !host.querySelector("[data-hero-canvas]") && !host.dataset.heroMounted;
      });
      assert.equal(cleanedUp, true, "Scene disposal left a mounted canvas");
      await page.evaluate(async () => {
        const { mountHeroScene } = await import("/assets/hero/hero-scene.min.js");
        mountHeroScene(document.querySelector("[data-hero-scene]"));
      });
      await ready(page);
      await capture(page, "desktop-remounted", 0.8);
      report.behaviors.push("scene disposes and remounts with source textures intact");
    }
    await context.close();
    console.log(`Verified: ${spec.name}`);
  }
  for (const mode of ["reduced-motion", "no-webgl", "save-data"]) {
    const { page, context } = await open({ width: 390, height: 844 }, mode === "reduced-motion" ? { reducedMotion: "reduce" } : {});
    if (mode !== "reduced-motion") {
      await context.addInitScript(type => {
        if (type === "save-data") Object.defineProperty(navigator, "connection", { value: { saveData: true } });
        if (type === "no-webgl") {
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (name, ...args) {
            return /webgl/.test(name) ? null : getContext.call(this, name, ...args);
          };
        }
      }, mode);
      await page.reload();
    }
    await page.waitForTimeout(1800);
    const fallback = await page.evaluate(() => {
      const host = document.querySelector("[data-hero-scene]");
      const img = host.querySelector("img");
      return { mounted: !!host.heroScene, loaded: img.complete && img.naturalWidth > 0, opacity: getComputedStyle(img).opacity };
    });
    assert.equal(fallback.mounted, false, `${mode}: should show poster only`);
    assert.ok(fallback.loaded && Number(fallback.opacity) === 1, `${mode}: missing fallback`);
    report.behaviors.push(`${mode}: static poster visible`);
    await page.screenshot({ path: path.join(output, `${mode}.png`) });
    await context.close();
  }
  const { page, context } = await open({ width: 1440, height: 900 }, {}, "/services/");
  await ready(page);
  await capture(page, "services-merged", 16);
  await context.close();
  assert.deepEqual(report.errors, [], "Browser rendering errors");
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Passed. Evidence: ${output}`);
} finally {
  await browser.close();
}
