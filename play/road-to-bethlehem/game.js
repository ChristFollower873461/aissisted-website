/* The Road to Bethlehem: a playable side-scroller of the wise men's journey (Matthew 2:1-12, KJV).
   Plain JS + Canvas 2D. No network calls beyond loading files in this folder.
   Art is exported from F-wise-men-v2 (tools/export_assets.py). Every verse on screen is checked
   against assets/data.js `kjv` (fetched from bible-api.com, KJV) at boot and in tools/verse_check.mjs. */
(() => {
'use strict';
const D = window.WM_DATA, LV = D.level;
const W = 320, H = 180;
const QS = new URLSearchParams(location.search);
const TS = Math.max(0.1, Math.min(8, parseFloat(QS.get('ts') || '1')));
const view = document.getElementById('view');
const vctx = view.getContext('2d');
const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');
let ctx = bctx;
const ovl = document.createElement('canvas'); ovl.width = W; ovl.height = H;
const octx = ovl.getContext('2d');
const music = document.getElementById('music');
const verseEl = document.getElementById('verse');
document.body.style.background = D.palette.ink;

// ---------------- verses: [reference, exact KJV words shown on screen] ----------------
const Q = {
  east: ['Matthew 2:2', 'we have seen his star in the east, and are come to worship him.'],
  came: ['Matthew 2:1', 'behold, there came wise men from the east to Jerusalem,'],
  ask: ['Matthew 2:2', 'Where is he that is born King of the Jews? for we have seen his star in the east, and are come to worship him.'],
  troubled: ['Matthew 2:3', 'When Herod the king had heard these things, he was troubled, and all Jerusalem with him.'],
  answer: ['Matthew 2:5', 'In Bethlehem of Judaea: for thus it is written by the prophet,'],
  micah: ['Matthew 2:6', 'And thou Bethlehem, in the land of Juda, art not the least among the princes of Juda: for out of thee shall come a Governor, that shall rule my people Israel.'],
  sent: ['Matthew 2:8', 'Go and search diligently for the young child; and when ye have found him, bring me word again, that I may come and worship him also.'],
  departed: ['Matthew 2:9', 'When they had heard the king, they departed;'],
  went: ['Matthew 2:9', 'the star, which they saw in the east, went before them,'],
  stood: ['Matthew 2:9', 'till it came and stood over where the young child was.'],
  joy: ['Matthew 2:10', 'When they saw the star, they rejoiced with exceeding great joy.'],
  house: ['Matthew 2:11', 'And when they were come into the house,'],
  saw: ['Matthew 2:11', 'they saw the young child with Mary his mother,'],
  fell: ['Matthew 2:11', 'and fell down, and worshipped him:'],
  opened: ['Matthew 2:11', 'and when they had opened their treasures,'],
  gifts: ['Matthew 2:11', 'they presented unto him gifts; gold, and frankincense, and myrrh.'],
  dream: ['Matthew 2:12', 'And being warned of God in a dream that they should not return to Herod,'],
  away: ['Matthew 2:12', 'they departed into their own country another way.'],
};
const verseProblems = [];
for (const k in Q) { const src = D.kjv[Q[k][0]]; if (!src || !src.includes(Q[k][1])) verseProblems.push(k); }
if (verseProblems.length) console.warn('verse mismatch', verseProblems);
const shownVerses = new Set();

// ---------------- utils ----------------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ss = (a, b, x) => { const v = clamp((x - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };
const hsh = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const mod = (a, n) => ((a % n) + n) % n;
const BAY = D.bayer;
const COL = D.palette;
const RGB = {}; for (const k in COL) { const h = COL[k]; RGB[k] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
let fillCache = '';
function fs(c) { const v = COL[c] || c; if (v !== fillCache) { ctx.fillStyle = v; fillCache = v; } }
function R(x0, y0, x1, y1, c) { fs(c); x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); }
function px(x, y, c) { fs(c); ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
function hline(x0, x1, y, c) { if (x1 < x0) [x0, x1] = [x1, x0]; R(x0, y, x1, y, c); }
function vline(x, y0, y1, c) { if (y1 < y0) [y0, y1] = [y1, y0]; R(x, y0, x, y1, c); }
function line(x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; fs(c);
  for (let n = 0; n < 400; n++) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function poly(pts, c) { // convex scanline fill, pixel exact
  let y0 = 1e9, y1 = -1e9; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  fs(c);
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    let a = 1e9, b = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const [xa, ya] = pts[i], [xb, yb] = pts[(i + 1) % pts.length];
      if ((y >= Math.min(ya, yb) - .5) && (y <= Math.max(ya, yb) + .5)) {
        let x; if (Math.abs(yb - ya) < 1e-6) { a = Math.min(a, xa, xb); b = Math.max(b, xa, xb); continue; }
        const t = clamp((y - ya) / (yb - ya), 0, 1); x = xa + (xb - xa) * t; a = Math.min(a, x); b = Math.max(b, x);
      }
    }
    if (b >= a) ctx.fillRect(Math.round(a), y, Math.round(b) - Math.round(a) + 1, 1);
  }
}

// ---------------- pixel font ----------------
const FONT = D.font;
function tw(s, sc = 1) { let w = 0; for (const ch of s) w += ((FONT[ch] || FONT['?'])[0].length + 1); return Math.max(0, w - 1) * sc; }
const textCache = new Map();
function textImg(s, c, sc) {
  const key = s + '\u0001' + c + '\u0001' + sc; let cv = textCache.get(key); if (cv) return cv;
  if (textCache.size > 600) textCache.clear();
  cv = document.createElement('canvas'); cv.width = Math.max(1, tw(s, sc)); cv.height = 10 * sc;
  const g = cv.getContext('2d'); g.fillStyle = COL[c] || c; let x = 0;
  for (const ch of s) { const gl = FONT[ch] || FONT['?']; for (let j = 0; j < gl.length; j++) for (let i = 0; i < gl[j].length; i++) if (gl[j][i] === '1') g.fillRect(x + i * sc, j * sc, sc, sc); x += (gl[0].length + 1) * sc; }
  textCache.set(key, cv); return cv;
}
function T(s, x, y, c = 'white', sc = 1, center = false, shadow = null, g = ctx) {
  if (!s) return; x = center ? Math.trunc(x - Math.floor(tw(s, sc) / 2)) : Math.trunc(x); y = Math.trunc(y);
  if (shadow) g.drawImage(textImg(s, shadow, sc), x + sc, y + sc);
  g.drawImage(textImg(s, c, sc), x, y);
}
function wrap(s, width) { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = (cur + ' ' + w).trim(); if (tw(t) > width && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; }

// ---------------- images ----------------
const IMG = {};
function loadImg(key, src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[key] = im; res(); }; im.onerror = () => rej(new Error('load ' + src)); im.src = src; }); }
const VARS = ['day', 'night', 'dusk', 'dawn', 'storm'];
function assetList() {
  const L = [];
  for (const v of VARS) {
    L.push(['atlas-' + v, 'assets/atlas-' + v + '.png'], ['sky-' + v, 'assets/sky-' + v + '.png']);
    for (const k of ['far', 'mid', 'near']) L.push([k + '-' + v, 'assets/' + k + '-' + v + '.png']);
    for (const k of ['sand', 'rock', 'pit', 'water', 'street']) L.push(['tile-' + k + '-' + v, 'assets/tile-' + k + '-' + v + '.png']);
  }
  L.push(['bhills', 'assets/bhills-night.png'], ['bhuts', 'assets/bhuts-night.png'], ['jerfar', 'assets/jer-far.png'], ['jermid', 'assets/jer-mid.png'], ['endcard', 'assets/endcard.png']);
  for (const k in D.clips) L.push(['clip-' + k, 'assets/clips/' + k + '.png']);
  return L;
}
const AT = D.atlas;
function spr(name, x, y, v = 'day', flip = false, raw = false) {
  const m = AT[name]; if (!m) return; const [ax, ay, w, h] = m; const im = IMG['atlas-' + v];
  let X = Math.round(x) - (raw ? 0 : 1), Y = Math.round(y) - (raw ? 0 : 1);
  if (X > W || Y > H || X + w < 0 || Y + h < 0) return;
  if (!flip) ctx.drawImage(im, ax, ay, w, h, X, Y, w, h);
  else { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(im, ax, ay, w, h, -X - w, Y, w, h); ctx.restore(); }
}
// draw something in time-of-day variant A, then crossfade variant B on top
let TOD = { a: 'day', b: 'day', p: 0 };
function tinted(fn, map) {
  const a = map ? map(TOD.a) : TOD.a, b = map ? map(TOD.b) : TOD.b;
  fn(a);
  if (TOD.p > 0.02 && b !== a) { ctx.globalAlpha = TOD.p; fn(b); ctx.globalAlpha = 1; }
}
const lit = v => v === 'night' ? 'dawn' : v === 'dusk' ? 'dawn' : v;   // lantern-lit caravan

// ---------------- v2 UI helpers (ported from scenes.py / art.py) ----------------
function panel(x, y, x2, y2, fill = 'navy', accent = 'gold') {
  R(x + 2, y + 3, x2 + 2, y2 + 3, 'ink'); R(x, y, x2, y2, 'ink'); R(x + 1, y + 1, x2 - 1, y2 - 1, accent); R(x + 3, y + 3, x2 - 3, y2 - 3, fill);
  R(x + 4, y + 4, x + 5, y + 5, 'white'); R(x2 - 5, y + 4, x2 - 4, y + 5, 'white');
}
function sparkle(x, y, f = 0, c = 'goldlight') { f = mod(Math.trunc(f), 3); const l = [1, 2, 3][f]; x = Math.round(x); y = Math.round(y); hline(x - l, x + l, y, c); vline(x, y - l, y + l, c); px(x, y, 'white'); }
let lastVerse = '';
function caption(s, ref, o = {}) {
  const width = o.width || 296; const rows = wrap(s, width - 22); const h = rows.length * 12 + 12;
  const x0 = o.x0 == null ? Math.floor((320 - width) / 2) : o.x0; const y0 = o.top == null ? (o.bottom || 174) - h : o.top;
  panel(x0, y0, x0 + width, y0 + h, 'navy', 'gold');
  rows.forEach((r, i) => T(r, x0 + Math.floor(width / 2), y0 + 8 + i * 12, 'white', 1, true));
  const w = tw(ref) + 12;
  R(x0 + width - w - 10, y0 - 7, x0 + width - 10, y0 + 4, 'ink'); R(x0 + width - w - 9, y0 - 6, x0 + width - 11, y0 + 3, 'goldshade'); R(x0 + width - w - 8, y0 - 5, x0 + width - 12, y0 + 2, 'ink');
  T(ref, x0 + width - w - 4, y0 - 4, 'goldlight');
  noteVerse(s, ref);
}
const VNOW = { s: '', ref: '', t: -9 };
function noteVerse(s, ref) { const key = ref + '|' + s; shownVerses.add(key); VNOW.s = s; VNOW.ref = ref; VNOW.t = S.t; if (key !== lastVerse) { lastVerse = key; verseEl.textContent = s + ' (' + ref + ', KJV)'; } }
function banner(s, p) {
  if (!(p > 0 && p < 1)) return; const k = Math.min(1, p / .12, (1 - p) / .12); const w = tw(s) + 26; const y = Math.trunc(8 + 18 * k);
  panel(160 - Math.floor(w / 2), y, 160 + Math.floor(w / 2), y + 16, 'ink', 'goldlight'); T(s, 160, y + 5, 'goldlight', 1, true);
}
function bubble(x, y, kind) {
  R(x, y, x + 16, y + 11, 'ink'); R(x + 1, y + 1, x + 15, y + 10, 'white'); poly([[x + 3, y + 11], [x + 7, y + 11], [x + 3, y + 15]], 'ink'); poly([[x + 4, y + 10], [x + 6, y + 10], [x + 4, y + 13]], 'white');
  if (kind === 'ex') T('!', x + 8, y + 2, 'red'); else if (kind === 'q') T('?', x + 6, y + 2, 'navy');
  else if (kind === 'heart') { R(x + 5, y + 3, x + 7, y + 5, 'coral'); R(x + 9, y + 3, x + 11, y + 5, 'coral'); poly([[x + 5, y + 5], [x + 11, y + 5], [x + 8, y + 8]], 'coral'); }
}
function popup(x, y, age, txt = '+1', c = 'white') {
  if (!(age >= 0 && age < .9)) return; const yy = y - Math.trunc(age * 22);
  if (age < .5) for (let k = 0; k < 6; k++) { const a = k * 1.047 + age * 3, r = 4 + age * 16; sparkle(x + 6 + Math.cos(a) * r, y + 6 + Math.sin(a) * r, Math.trunc(age * 10) + k); }
  T(txt, x + 2, yy, c, 1, false, 'ink');
}
// sky stars + the Star
let seed = 2026; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const STARS = []; for (let k = 0; k < 110; k++) STARS.push([Math.floor(rnd() * 320), 21 + Math.floor(rnd() * 97), rnd() * 6.28, 1.5 + rnd() * 2.5, Math.floor(rnd() * 10)]);
function stars(t, alpha = 1, ox = 0) {
  for (let k = 0; k < STARS.length; k++) {
    if (k >= alpha * STARS.length) break; let [x, y, ph, sp, kind] = STARS[k]; x = mod(x - Math.trunc(ox), 320); const v = Math.sin(t * sp + ph);
    if (v < -.55) continue; px(x, y, v > .5 ? 'white' : kind > 3 ? 'mist' : 'silver');
    if (kind === 0 && v > .7) { px(x + 1, y, 'silver'); px(x - 1, y, 'silver'); px(x, y + 1, 'silver'); px(x, y - 1, 'silver'); }
  }
}
function bigStar(x, y, t, size = 1, burst = 0) {
  x = Math.round(x); y = Math.round(y);
  const pul = Math.sin(t * 5), L = Math.trunc((15 + 2 * pul) * size), Lh = Math.trunc((11 + 1.5 * pul) * size), Ld = Math.trunc(6 * size), r = Math.trunc(13 * size);
  const t6 = Math.trunc(t * 6);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= r && mod(x + dx + y + dy + t6, 2) === 0 && BAY[mod(y + dy, 4)][mod(x + dx, 4)] < (1 - d / r) * .75) px(x + dx, y + dy, d > r * .55 ? 'gold' : 'goldlight');
  }
  if (burst > 0) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + t * .8, l0 = 10 * size, l1 = (22 + 26 * burst) * size; for (let s = Math.trunc(l0); s < Math.trunc(l1); s++) if (mod(s + Math.trunc(t * 30), 4) < 2) px(x + Math.cos(a) * s, y + Math.sin(a) * s, k % 2 ? 'goldlight' : 'paper'); }
  for (let k = 1; k <= Ld; k++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) px(x + sx * k, y + sy * k, k < Ld - 1 ? 'goldlight' : 'gold');
  poly([[x - 2, y], [x, y - L], [x + 2, y], [x, y + Math.trunc(L * 1.5)]], 'goldlight'); poly([[x, y - 2], [x + Lh, y], [x, y + 2], [x - Lh, y]], 'goldlight');
  vline(x, y - L + 3, y + Math.trunc(L * 1.5) - 4, 'paper'); hline(x - Lh + 3, x + Lh - 3, y, 'paper');
  R(x - 2, y - 2, x + 2, y + 2, 'paper'); R(x - 1, y - 3, x + 1, y + 3, 'white'); R(x - 3, y - 1, x + 3, y + 1, 'white');
}
function beam(x, y, gx, gy, t, wd = 22) {
  const n = Math.max(1, Math.trunc(gy - y)); const t8 = Math.trunc(t * 8);
  for (let k = 6; k < n; k++) {
    const f = k / n, cx = x + (gx - x) * f, hw = 1 + wd * f, yy = Math.trunc(y + k); if (yy < 0 || yy >= H) continue;
    const x0 = Math.max(0, Math.trunc(cx - hw)), x1 = Math.min(W, Math.trunc(cx + hw) + 1);
    for (let xs = x0; xs < x1; xs++) { const d = Math.abs(xs - cx) / hw; if (BAY[mod(yy + t8, 4)][xs & 3] < (1 - d) * .62 * (1 - .35 * f)) px(xs, yy, d < .35 ? 'paper' : 'goldlight'); }
  }
}
function inBeam(xx, yy, b) { if (!b) return false; const n = b.gy - b.y; const f = (yy - b.y) / n; if (f < 0 || f > 1) return false; const cx = b.x + (b.gx - b.x) * f; return Math.abs(xx - cx) < 1 + b.wd * f + 3; }
const FADE = []; for (let q = 0; q <= 16; q++) { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = COL.ink; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAY[y][x] < q / 16) g.fillRect(x, y, 1, 1); FADE.push(ctx.createPattern(c, 'repeat')); }
function inkfade(p, g = ctx) { const q = Math.round(clamp(p, 0, 1) * 16); if (q <= 0) return; g.fillStyle = FADE[q]; fillCache = ''; g.fillRect(0, 0, W, H); }

// ---------------- HUD ----------------

// ---------------- HUD ----------------
const ROADLEN = LV.ROAD_END - LV.START, MKLEN = LV.MARKET_END - LV.START, BTLEN = LV.BETH_END - LV.START;
const TOTAL = ROADLEN + MKLEN + BTLEN;
const JER_F = (ROADLEN + MKLEN) / TOTAL;
function hud(t, o) {
  const off = o.off || 0; if (off >= 20) return; const y0 = -off;
  R(0, y0, 319, 19 + y0, 'ink'); R(0, 18 + y0, 319, 19 + y0, 'gold');
  T('THE WISE MEN', 6, 6 + y0, 'goldlight');
  spr(o.night ? 'icon_moon' : 'icon_sun', 85, 4 + y0); T(o.month ? 'MONTH ' + o.month : 'HOMEWARD', 99, 6 + y0, 'white');
  spr('jug', 152, 1 + y0); T(String(o.water).padStart(2, '0'), 168, 6 + y0, o.flash === 'jug' ? 'goldlight' : o.flashLow === 'jug' ? 'coral' : 'white');
  spr('dates', 190, 1 + y0); T(String(o.dates).padStart(2, '0'), 206, 6 + y0, o.flash === 'dates' ? 'goldlight' : o.flashLow === 'dates' ? 'coral' : 'white');
  if (o.low && Math.trunc(t * 4) % 2) T('LOW', 222, 6 + y0, 'coral');
  // FIX-2 #2: after the house the gifts have been given, so the gift HUD is hidden on the way home
  if (!o.home) for (let i = 0; i < 3; i++) {
    const x = 258 + i * 20, ok = o.safe[i], gl = ok && Math.trunc(t * 3 + i) % 4 !== 0;
    R(x, 1 + y0, x + 15, 16 + y0, gl ? 'goldlight' : ok ? 'gold' : 'slate'); R(x + 1, 2 + y0, x + 14, 15 + y0, ok ? 'navy' : 'plum');
    spr('gift_' + i, x + 3, y0 + (ok ? 0 : Math.trunc(t * 20) % 2));
    if (gl && Math.trunc(t * 6 + i * 2) % 5 === 0) px(x + 13, 3 + y0, 'white');
  }
  const b = 167 + off; const BW = 190;
  R(0, b, 319, 179 + off, 'ink'); R(0, b, 319, b, 'gold');
  T(o.home ? 'HOME' : 'TO BETHLEHEM', 6, b + 4, 'goldlight'); R(86, b + 5, 86 + BW, b + 8, 'slate'); R(86, b + 5, 86 + BW, b + 5, 'navy');
  const pw = Math.trunc(BW * clamp(o.prog, 0, 1)); R(86, b + 5, 86 + pw, b + 8, o.home ? 'mint' : 'goldlight'); R(86, b + 5, 86 + pw, b + 5, 'paper');
  if (!o.home) spr('icon_tower', 86 + Math.trunc(BW * JER_F) - 5, b + 1);
  // the star only where Matthew shows it (level 1, the east; level 6, the road to Bethlehem); a house otherwise
  if (o.star) spr('icon_star', 280, b + 1 + Math.trunc(t * 3) % 2); else spr('icon_house', 280, b + 1);
  spr('icon_camel', 86 + pw - 5, b + 1);
}
function muteIcon(g = ctx) { // bottom-right corner, always available
  const x = 300, y = 169, on = Snd.on; const c = 'silver';
  if (g !== ctx) return;
  R(x - 3, y - 2, x + 16, y + 10, 'ink');
  R(x, y + 2, x + 2, y + 6, c); poly([[x + 3, y + 2], [x + 7, y - 1], [x + 7, y + 9], [x + 3, y + 6]], c);
  if (on) { vline(x + 9, y + 2, y + 6, 'goldlight'); vline(x + 11, y + 1, y + 7, 'goldlight'); }
  else { line(x + 9, y + 1, x + 13, y + 7, 'coral'); line(x + 13, y + 1, x + 9, y + 7, 'coral'); }
}
const inMute = (x, y) => x >= 294 && y >= 164;

// ---------------- sound ----------------
const Snd = {
  on: localStorage.getItem('rtb-sound') !== 'off', started: false, ac: null,
  start() { if (this.started) return; this.started = true; try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; } this.apply(); },
  toggle() { this.on = !this.on; localStorage.setItem('rtb-sound', this.on ? 'on' : 'off'); if (!this.started) this.start(); else this.apply(); },
  apply() { music.volume = 0.55; if (this.on && this.started) { const p = music.play(); if (p && p.catch) p.catch(() => {}); } else music.pause(); },
  tone(f, d, type = 'sine', vol = .08, when = 0) {
    if (!this.on || !this.ac) return; const a = this.ac, t0 = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + .02);
  },
  chime() { this.tone(1318.5, .25, 'triangle', .07); this.tone(1975.5, .3, 'triangle', .05, .07); },
  jump() { this.tone(392, .12, 'square', .025); },
  hit() { this.tone(130, .25, 'triangle', .12); this.tone(98, .3, 'sine', .1, .05); },
  splash() { if (!this.on || !this.ac) return; const a = this.ac, n = a.sampleRate * .3, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2 * .25; const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; s.connect(f); f.connect(a.destination); s.start(); },
  joy() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, .4, 'triangle', .05, i * .09)); },
};

// ---------------- levels ----------------

// ---------------- levels: the Fertile Crescent caravan road ----------------
const SPEED = () => (G.easy ? 56 : 72);
const SP = 56;                       // spacing of the caravan camels
const G = { easy: localStorage.getItem('rtb-easy') === '1', best: parseFloat(localStorage.getItem('rtb-best') || '0') || 0 };
const OB = { // hitbox half-width, height, sprite, draw offset
  rock0: { hw: 7, h: 9, s: 'rock_0', dx: -9, dy: -10 }, rock1: { hw: 11, h: 13, s: 'rock_1', dx: -13, dy: -14 }, rock2: { hw: 5, h: 6, s: 'rock_2', dx: -6, dy: -7 },
  thorn: { hw: 7, h: 10, s: 'thorn', dx: -11, dy: -15 }, crate: { hw: 9, h: 11, s: 'crate', dx: -12, dy: -17 }, jars: { hw: 10, h: 12, s: 'jars', dx: -13, dy: -17 },
  basket: { hw: 9, h: 10, s: 'basket', dx: -11, dy: -12 }, wall: { hw: 13, h: 10, s: 'wall', dx: -15, dy: -12 }, bush: { hw: 7, h: 8, s: 'bush', dx: -9, dy: -10 },
};
const ROADLV = {
  lv1: { n: 1, x0: LV.START, x1: LV.L1, cps: [LV.START, 900], banners: [[230, 'LEVEL 1: THE EAST'], [640, 'THE CARAVAN SETS OUT']] },
  lv2: { n: 2, x0: LV.L1, x1: LV.L2, cps: [LV.L1, 2250, 3080], banners: [[LV.L1 + 30, 'LEVEL 2: ALONG THE EUPHRATES'], [2190, 'CROSSING THE RIVER']] },
  lv3: { n: 3, x0: LV.L2, x1: LV.L3, cps: [LV.L2, 4360, 5200], banners: [[LV.L2 + 30, 'LEVEL 3: THE SYRIAN DESERT'], [3900, 'THE DESERT ROAD'], [LV.STORM0, 'SANDSTORM! STAY ON THE ROAD'], [5860, 'THE STORM HAS PASSED'], [6200, 'TADMOR (PALMYRA) AHEAD']] },
  lv4: { n: 4, x0: LV.L3, x1: LV.ROAD_END, cps: [LV.L3, 7500, 8480], banners: [[LV.L3 + 30, 'LEVEL 4: DAMASCUS TO THE JORDAN'], [LV.PASS0, 'THE HILL ROAD SOUTH'], [8440, 'THE JORDAN FORD, NEAR JERICHO']] },
};
const PLAY = new Set(['lv1', 'lv2', 'lv3', 'lv4', 'market', 'beth', 'home']);
function obsList(a) { return a.map(([x, k]) => ({ x, k, hit: false })); }
function makePicks(L, x0, x1, gap = 170) {
  const picks = []; let n = 0;
  for (let x = x0 + 180; x < x1 - 160; x += gap + Math.floor(hsh(x) * 90)) {
    if ((L.RAV || []).some(r => Math.abs(x - r) < 40)) continue;
    const ob = L.obs.find(o => Math.abs(o.x - x) < 34);
    let hgt = ob ? 78 : (n % 3 === 2 ? 92 : 56);
    if (L.STONES && x > L.R0 - 20 && x < L.R1 + 20) { const s = L.STONES.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a); if (Math.abs(s - x) > 24) continue; x = s; hgt = 60; }
    picks.push({ x, kind: n % 2 ? 'dates' : 'jug', hgt, got: false }); n++;
  }
  return picks;
}
function makeRoad() {
  const N = LV.ROAD_END + 700; const gb = new Float32Array(N), kind = new Uint8Array(N);
  const P0 = LV.PASS0, P1 = LV.PASS1, D0 = LV.DUNE0;
  const RAV = [1150, 7600]; const STONES = []; for (let k = 0; k < LV.NST; k++) STONES.push(LV.R0 + 26 + k * LV.STEP);
  const R0 = LV.R0, R1 = STONES[LV.NST - 1] + 30;
  for (let x = 0; x < N; x++) {
    let y = 140 + 2.5 * Math.sin(x / 70) + 1.5 * Math.sin(x / 31 + 1) - 40 * ss(D0, D0 + 200, x) + 40 * ss(D0 + 260, D0 + 380, x);
    for (let k = 0; k < 4; k++) y -= 10 * ss(P0 + 60 + k * 120, P0 + 90 + k * 120, x);
    for (let k = 0; k < 4; k++) y += 10 * ss(P0 + 800 + k * 110, P0 + 830 + k * 110, x);
    y += 7 * ss(LV.J0 - 14, LV.J0 + 6, x) * (1 - ss(LV.J1 - 6, LV.J1 + 14, x));
    gb[x] = y; kind[x] = (x > P0 - 40 + 8 * hsh(x) && x < P1 + 8 * hsh(x)) ? 1 : 0;
    for (const rv of RAV) if (Math.abs(x - rv) < 13) kind[x] = 2;
    if (x > R0 && x < R1) kind[x] = 3;
    if (x > LV.J0 && x < LV.J1) kind[x] = 5;
  }
  const L = {
    name: 'road', isRoad: true, N, gb, kind, WL: gb[R0 - 10] + 6, JWL: gb[LV.J0 - 24] + 1, STONES, R0, R1, RAV,
    obs: obsList([[520, 'rock2'], [760, 'rock0'], [980, 'thorn'], [1380, 'rock0'], [1500, 'thorn'],
      [1800, 'rock0'], [1980, 'thorn'], [2150, 'rock2'], [3200, 'rock0'], [3380, 'thorn'], [3560, 'rock1'],
      [3820, 'rock2'], [4500, 'rock0'], [4700, 'thorn'], [4880, 'rock1'], [5060, 'rock2'], [5240, 'rock0'], [5420, 'thorn'], [5600, 'rock1'], [5800, 'rock0'], [6000, 'thorn'], [6200, 'rock2'],
      [6800, 'rock0'], [P0 + 140, 'rock2'], [P0 + 260, 'rock0'], [P0 + 380, 'thorn'], [7800, 'rock1'], [7950, 'rock2'], [8150, 'rock0'], [8380, 'thorn'], [8720, 'rock2'], [8860, 'rock2'], [9100, 'rock0']]),
    tod: [[0, 'night'], [1150, 'night'], [1550, 'dawn'], [1850, 'day'], [4300, 'day'], [4520, 'storm'], [5600, 'storm'], [5900, 'dusk'], [6250, 'night'], [6700, 'night'], [6950, 'dawn'], [7250, 'day'], [8250, 'day'], [8650, 'dusk'], [1e9, 'dusk']],
    night: x => x < 1400 || (x > 6150 && x < 6900),
    storm: x => ss(LV.STORM0, LV.STORM0 + 140, x) * (1 - ss(LV.STORM1 - 100, LV.STORM1 + 100, x)),
  };
  L.picks = makePicks(L, LV.START, LV.ROAD_END);
  return L;
}
function makeMarket() {
  const N = LV.MARKET_END + 500, gb = new Float32Array(N).fill(165), kind = new Uint8Array(N).fill(4);
  const L = { name: 'market', N, gb, kind, end: LV.MARKET_END, cps: [LV.START, 1400], banners: [[230, 'LEVEL 5: JERUSALEM'], [1100, 'THE MARKET'], [2260, "HEROD'S PALACE"]], tod: [[0, 'day'], [1e9, 'day']], night: () => false, GATE: LV.MARKET_END + 86 };
  L.obs = obsList([[480, 'basket'], [700, 'crate'], [930, 'jars'], [1150, 'basket'], [1340, 'crate'], [1560, 'jars'], [1760, 'basket'], [1960, 'crate'], [2180, 'jars'], [2380, 'basket']]);
  L.picks = makePicks(L, LV.START, LV.MARKET_END);
  L.stalls = []; let sx = 20, k = 0; while (sx < LV.MARKET_END + 300) { if (Math.abs(sx - 760) > 70 && Math.abs(sx - 1720) > 70) L.stalls.push([sx, k++ % 4]); sx += 64 + Math.floor(hsh(sx) * 60); }
  L.back = []; L.front = []; L.lane = [];
  for (let i = 0; i < 34; i++) L.back.push({ x: hsh(i + 1) * (LV.MARKET_END + 400), k: i % 7, c: i % 3, v: (hsh(i + 9) < .5 ? -1 : 1) * (8 + hsh(i + 4) * 14) });
  for (let i = 0; i < 9; i++) L.front.push({ x: 200 + hsh(i + 40) * (LV.MARKET_END), k: (i + 3) % 7, c: (i + 1) % 3, v: (hsh(i + 19) < .5 ? -1 : 1) * (10 + hsh(i + 14) * 12) });
  for (let i = 0; i < 9; i++) L.lane.push({ x: 600 + i * 230 + hsh(i + 70) * 60, k: (i + 5) % 7, c: i % 3, v: 14, step: 0 });
  return L;
}
function makeBeth() {
  const N = LV.BETH_END + 600, gb = new Float32Array(N), kind = new Uint8Array(N);
  for (let x = 0; x < N; x++) gb[x] = 161 + 1.5 * Math.sin(x / 40);
  const L = { name: 'beth', N, gb, kind, end: LV.BETH_END, cps: [LV.START], banners: [[230, 'LEVEL 6: THE ROAD TO BETHLEHEM']], tod: [[0, 'night'], [1e9, 'night']], night: () => true, HOUSE: LV.BETH_END + 43 };
  L.obs = obsList([[520, 'wall'], [760, 'bush'], [980, 'wall'], [1200, 'bush'], [1430, 'wall'], [1640, 'bush']]);
  L.picks = makePicks(L, LV.START, LV.BETH_END - 150);
  return L;
}
function makeHome() {
  const N = LV.HOME_END + 600, gb = new Float32Array(N), kind = new Uint8Array(N);
  for (let x = 0; x < N; x++) gb[x] = 140 + 2.5 * Math.sin(x / 70) + 1.5 * Math.sin(x / 31 + 1);
  const L = { name: 'home', isRoad: true, home: true, N, gb, kind, RAV: [], STONES: null, R0: -1e9, R1: -1e9, WL: 0, JWL: 0, stripOff: LV.HOME_OFF, end: LV.HOME_END, cps: [LV.START],
    banners: [[230, 'HOME ANOTHER WAY']], tod: [[0, 'dawn'], [700, 'dawn'], [1150, 'day'], [1e9, 'day']], night: () => false, storm: () => 0 };
  L.obs = obsList([[520, 'rock2'], [760, 'thorn'], [1000, 'rock0'], [1240, 'rock2']]);
  L.picks = makePicks(L, LV.START, LV.HOME_END, 200);
  return L;
}
function todAt(lv, x) { const K = lv.tod; for (let k = 0; k < K.length - 1; k++) { const [t0, a] = K[k], [t1, b] = K[k + 1]; if (x < t1) return a === b ? { a, b, p: 0 } : { a, b, p: ss(t0, t1, x) }; } return { a: 'night', b: 'night', p: 0 }; }

// ---------------- game state ----------------
const S = { mode: 'loading', t: 0, u: 0, cu: 0, fade: 0, next: null };
let LVL = null, RUN = null;
const SEQ = ['title', 'eastclip', 'lv1', 'map1', 'lv2', 'map2', 'lv3', 'camp', 'map3', 'lv4', 'map4', 'market', 'palace', 'map5', 'beth', 'house', 'dream', 'away', 'map6', 'home', 'end'];
function progressOf(L, x) {
  const f = Math.max(0, x - LV.START);
  if (L.home) return Math.min(1, f / (LV.HOME_END - LV.START));
  if (L.isRoad) return Math.min(ROADLEN, f) / TOTAL; if (L.name === 'market') return (ROADLEN + Math.min(MKLEN, f)) / TOTAL; return (ROADLEN + MKLEN + Math.min(BTLEN, f)) / TOTAL;
}
// "about four months": Ezra 7:9 gives four months from Babylon to Jerusalem; the HUD counts months along the road
function monthOf(L, x) { if (L.home) return 0; if (L.isRoad) return 1 + Math.floor(clamp((x - LV.START) / ROADLEN, 0, .999) * 4); return 4; }
function newRun() { RUN = { hits: 0, water: 6, dates: 6, drain: 0, cp: null, cpSup: [6, 6] }; }
function startLevel(name, fromX) {
  if (ROADLV[name]) { const cfg = ROADLV[name]; LVL = makeRoad(); LVL.name = name; LVL.n = cfg.n; LVL.end = cfg.x1; LVL.cps = cfg.cps; LVL.banners = cfg.banners; LVL.x0 = cfg.x0; }
  else LVL = name === 'market' ? makeMarket() : name === 'beth' ? makeBeth() : makeHome();
  const x = fromX == null ? (LVL.x0 || LV.START) : fromX;
  LVL.rec = new Float32Array(LVL.N);
  for (let i = 0; i < LVL.N; i++) LVL.rec[i] = surfaceY(i, true);
  const C = { x, fy: surfaceY(x, true), vy: 0, air: false, hold: false, holdT: 0, lastGround: 0, inv: 0, auto: null };
  LVL.c = C; LVL.cy = camY(x); LVL.cam = x - LV.LEAD_SX; LVL.flash = null; LVL.flashT = 0; LVL.pops = []; LVL.bannerT = {}; LVL.splashes = [];
  for (const o of LVL.obs) if (o.x < x) o.hit = true;
  for (const p of LVL.picks) if (p.x < x + 20) p.got = true;
  for (const [bx] of LVL.banners) if (bx < x - 20) LVL.bannerT[bx] = -99;
  LVL.cpIdx = 0; for (let i = 0; i < LVL.cps.length; i++) if (LVL.cps[i] <= x) LVL.cpIdx = i;
  LVL.started = S.t; LVL.jumps = 0; LVL.arrive = null;
  RUN.cp = { lvl: name, x: LVL.cps[LVL.cpIdx] }; RUN.cpSup = [Math.max(6, RUN.water), Math.max(6, RUN.dates)];
}
function stoneAt(x) { if (!LVL.STONES) return null; for (const s of LVL.STONES) if (Math.abs(x - s) <= (G.easy ? 21 : 18)) return s; return null; }
function surfaceY(x, visual) {
  const i = clamp(Math.round(x), 0, LVL.N - 1), k = LVL.kind[i];
  if (k === 2) return visual ? LVL.gb[i] : LVL.gb[i] + 90;
  if (k === 3) { if (visual) return LVL.WL - 3; return stoneAt(x) != null ? LVL.WL - 3 : LVL.WL + 8; }
  return LVL.gb[i];
}
function groundBase(x) { return LVL.gb[clamp(Math.round(x), 0, LVL.N - 1)]; }
function camY(x) { if (!LVL.isRoad) return 0; let s = 0; for (let k = -4; k <= 4; k++) s += groundBase(x + k * 17.5); return s / 9 - 140; }

// ---------------- input ----------------
const IN = { down: false, pressT: -9, consumed: true };
function press() { if (!IN.down) { IN.down = true; IN.pressT = S.t; IN.consumed = false; onTap(); } }
function release() { IN.down = false; }
function canvasXY(e) { const r = view.getBoundingClientRect(); const dpr = view.width / r.width; return [((e.clientX - r.left) * dpr - LAY.ox) / LAY.s, ((e.clientY - r.top) * dpr - LAY.oy) / LAY.s]; }
const BTN_EASY = [28, 152, 150, 168], BTN_ABOUT = [170, 152, 292, 168];
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function toggleEasy() { G.easy = !G.easy; localStorage.setItem('rtb-easy', G.easy ? '1' : '0'); }
view.addEventListener('pointerdown', e => {
  e.preventDefault(); Snd.start();
  const [x, y] = canvasXY(e);
  if (inMute(x, y) && y < 181) { Snd.toggle(); return; }
  if (S.mode === 'title' && !S.next) {
    if (inBox(x, y, BTN_EASY)) { toggleEasy(); return; }
    if (inBox(x, y, BTN_ABOUT)) { go('about'); return; }
  }
  try { view.setPointerCapture(e.pointerId); } catch (_) {}
  press();
}, { passive: false });
view.addEventListener('pointerup', e => { e.preventDefault(); release(); }, { passive: false });
view.addEventListener('pointercancel', release);
view.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
window.addEventListener('keydown', e => {
  if (e.repeat) { if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) e.preventDefault(); return; }
  if ([' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(e.key)) { e.preventDefault(); Snd.start(); press(); }
  else if (e.key === 'm' || e.key === 'M') { Snd.start(); Snd.toggle(); }
  else if ((e.key === 'e' || e.key === 'E') && S.mode === 'title') toggleEasy();
  else if ((e.key === 'a' || e.key === 'A') && S.mode === 'title') go('about');
});
window.addEventListener('keyup', e => { if ([' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(e.key)) release(); });
window.addEventListener('blur', release);

const CLIPOF = { eastclip: 'east', map1: 'map1', map2: 'map2', map3: 'map3', map4: 'map4', map5: 'map5', map6: 'map6', house: 'house', dream: 'dream', away: 'away' };
const CLIPLEN = { eastclip: 6.9, map1: 3.0, map2: 2.6, map3: 2.6, map4: 6.3, map5: 2.6, map6: 3.0, house: 12.5, dream: 6.7, away: 5.3 };
// FIX-2 #9: every caption stays up for at least (words x 0.45 s + 2 s), 50% longer in easy mode, and then
// until the player taps ("TAP TO CONTINUE"). The cutscene holds its last frame while it waits.
const HOLDS = {
  eastclip: [[1.9, 6.8, 'east']], map4: [[.5, 6.2, 'came']],
  house: [[.5, 2.5, 'house'], [2.8, 4.6, 'saw'], [4.9, 7.3, 'fell'], [7.5, 8.7, 'opened'], [8.9, 12.4, 'gifts']],
  dream: [[.6, 6.6, 'dream']], away: [[0, 5.2, 'away']],
};
function minRead(s) { return (s.trim().split(/\s+/).length * .45 + 2) * (G.easy ? 1.5 : 1); }
const CAP = { k: -1, t0: 0, rel: false };
function holdIdx() { const H = HOLDS[S.mode]; if (!H) return -1; return H.findIndex(([a, b]) => S.cu >= a && S.cu <= b); }
function canContinue() {
  const m = S.mode; if (S.next) return false;
  if (HOLDS[m]) { const k = holdIdx(); return k >= 0 && CAP.k === k && !CAP.rel && S.u - CAP.t0 >= minRead(Q[HOLDS[m][k][2]][1]); }
  if (m === 'palace') return palaceReady();
  if (m === 'beth') return bethReady();
  return false;
}
function bethReady() { const L = LVL; return !!(L && L.name === 'beth' && L.cap && L.cap.i === 3 && S.t - L.cap.t0 >= minRead(Q.joy[1])); }
function onTap() {
  const m = S.mode; if (S.next) return;
  if (m === 'title') { Snd.start(); newRun(); go('eastclip'); }
  else if (m === 'about') { if (S.u > .4) go('title'); }
  else if (HOLDS[m]) { if (canContinue()) CAP.rel = true; }
  else if (m.startsWith('map')) { if (S.u > 0.8) go(nextOf(m)); }
  else if (m === 'beth') { if (bethReady()) go('house'); }
  else if (m === 'camp') { if (S.u > 2.6) go('map3'); }
  else if (m === 'palace') dialogTap();
  else if (m === 'rest') { if (S.u > 0.8) restart(); }
  else if (m === 'end') { if (S.u > 1.2) go('title'); }
}
const nextOf = m => SEQ[SEQ.indexOf(m) + 1];
function go(m) { if (S.next) return; S.next = m; S.fade = 0; }
function enter(m) {
  S.mode = m; S.u = 0; S.cu = 0; CAP.k = -1; CAP.rel = false; release(); IN.consumed = true;
  if (PLAY.has(m)) { startLevel(m, RUN.resumeX); RUN.resumeX = null; }
  if (m === 'camp') { RUN.campFrom = [RUN.water, RUN.dates]; }
  if (m === 'palace') { DLG.step = 0; DLG.t0 = 0; DLG.st = 0; }
  if (m === 'end') { G.best = 1; localStorage.setItem('rtb-best', '1'); }
}
function restart() { RUN.water = RUN.cpSup[0]; RUN.dates = RUN.cpSup[1]; RUN.resumeX = RUN.cp.x; S.next = RUN.cp.lvl; S.fade = 0; }

// ---------------- play update ----------------
const V0 = 170, HOLD_MAX = .2; const GRAVN = () => G.easy ? 480 : 560, GRAVH = () => G.easy ? 260 : 300;
function hitSupplies() {
  if (G.easy) { if (RUN.water >= RUN.dates) RUN.water = Math.max(0, RUN.water - 1); else RUN.dates = Math.max(0, RUN.dates - 1); }
  else { RUN.water = Math.max(0, RUN.water - 1); RUN.dates = Math.max(0, RUN.dates - 1); }
  LVL.flashLow = RUN.water <= RUN.dates ? 'jug' : 'dates'; LVL.flashLowT = S.t;
}
function hurt(txt) {
  const C = LVL.c; if (C.inv > 0) return false; C.inv = 1.5; RUN.hits++; hitSupplies(); Snd.hit();
  LVL.pops.push({ x: C.x - LVL.cam + 4, y: C.fy - 70, t: S.t, txt: txt || (G.easy ? '-1' : '-2'), c: 'coral' });
  return true;
}
function autoHop(C, target, ty) {
  const sp = SPEED(); const T = clamp((target - C.x) / sp, .45, 1.2);
  C.vy = (ty - C.fy - .5 * GRAVN() * T * T) / T; C.air = true; C.auto = { target }; C.hold = false;
}
function updatePlay(dt) {
  const C = LVL.c, L = LVL; const sp = SPEED();
  let mul = 1;
  if (L.name === 'beth') {
    if (!L.arrive && C.x >= L.end - 170) L.arrive = { t: S.t, stopT: null };
    if (L.arrive) mul = clamp((L.end - C.x) / 170, 0, 1) * .9 + (C.x < L.end ? .1 : 0);
    const seq = ['departed', 'went', 'stood']; if (!L.cap) L.cap = { i: -1, t0: 0 };
    const since = S.t - L.started, held = S.t - L.cap.t0;
    if (L.cap.i === -1 && since > 2.6) L.cap = { i: 0, t0: S.t };
    else if ((L.cap.i === 0 || L.cap.i === 1) && held >= minRead(Q[seq[L.cap.i]][1])) L.cap = { i: L.cap.i + 1, t0: S.t };
    else if (L.cap.i === 2 && L.starStop && held >= minRead(Q.stood[1])) L.cap = { i: 3, t0: S.t };
  } else if (C.x >= L.end - 90) mul = clamp((L.end - C.x) / 90, 0, 1) * .85 + (C.x < L.end ? .15 : 0);
  const kNow = L.kind[clamp(Math.round(C.x), 0, L.N - 1)];
  if (kNow === 5 && !C.air) mul *= .78;                 // wading the ford
  const prevX = C.x;
  C.x = Math.min(L.end, C.x + sp * mul * dt);
  const moving = C.x - prevX > 0.001;
  const locked = L.arrive || C.x >= L.end - 30 || !!C.auto;
  const grounded = !C.air;
  if (!locked && !IN.consumed && S.t - IN.pressT < .14 && (grounded || S.t - C.lastGround < .09)) {
    IN.consumed = true; C.air = true; C.vy = -V0; C.hold = true; C.holdT = 0; L.jumps++; Snd.jump();
  }
  if (C.air) {
    if (C.hold && IN.down && C.vy < 0 && C.holdT < HOLD_MAX) { C.holdT += dt; C.vy += GRAVH() * dt; } else { C.hold = false; C.vy += GRAVN() * dt; }
    C.fy += C.vy * dt;
    const sy = surfaceY(C.x);
    if (C.vy > 0 && C.fy >= sy) { C.fy = sy; C.air = false; C.vy = 0; C.auto = null; C.lastGround = S.t; if (L.kind[clamp(Math.round(C.x), 0, L.N - 1)] === 5) L.splashes.push({ x: C.x, t: S.t, y: L.JWL }); }
  } else {
    const sy = surfaceY(C.x);
    if (sy - C.fy > 5) { C.air = true; C.vy = 20; } else { C.fy = sy; C.lastGround = S.t; }
  }
  const k = L.kind[clamp(Math.round(C.x), 0, L.N - 1)];
  if (!C.auto) {
    if (k === 3 && C.fy >= L.WL + 4) {
      L.splashes.push({ x: C.x, t: S.t, y: L.WL }); Snd.splash(); hurt();
      const nxt = L.STONES.find(s => s > C.x + 6) || (L.R1 + 30); const ty = nxt > L.R1 ? groundBase(nxt) : L.WL - 3;
      autoHop(C, nxt, ty);
    } else if (k === 2 && C.fy >= groundBase(C.x) + 10) {
      hurt(); let e = C.x; while (L.kind[Math.round(e)] === 2) e++; autoHop(C, e + 22, groundBase(e + 22));
    }
  }
  const LEG = G.easy ? 7 : 10;
  for (const o of L.obs) {
    if (o.hit || Math.abs(o.x - C.x) > 40) continue; const d = OB[o.k];
    if (C.x + LEG > o.x - d.hw && C.x - LEG < o.x + d.hw && C.fy > groundBase(o.x) - d.h + 2) { o.hit = true; hurt(); }
    if (o.x < C.x - 30) o.hit = true;
  }
  for (const p of L.picks) {
    if (p.got || Math.abs(p.x - C.x) > 50) continue; const gy = surfaceY(p.x, true), py = gy - p.hgt;
    if (p.x + 6 > C.x - 20 && p.x - 6 < C.x + 35 && py + 15 > C.fy - 68 && py < C.fy - 4) {
      p.got = true; if (p.kind === 'jug') RUN.water = Math.min(99, RUN.water + 1); else RUN.dates = Math.min(99, RUN.dates + 1);
      L.flash = p.kind; L.flashT = S.t; Snd.chime(); L.pops.push({ x: p.x - L.cam - 6, y: py, t: S.t, txt: '+1', c: 'white' });
    }
  }
  if (!G.easy && moving) { RUN.drain += dt; if (RUN.drain > 14) { RUN.drain = 0; if (RUN.water >= RUN.dates) RUN.water = Math.max(0, RUN.water - 1); else RUN.dates = Math.max(0, RUN.dates - 1); L.flashLow = RUN.water <= RUN.dates ? 'jug' : 'dates'; L.flashLowT = S.t; } }
  C.inv = Math.max(0, C.inv - dt);
  const xi = Math.round(C.x); for (let i = Math.round(prevX); i <= xi; i++) if (i >= 0 && i < L.N) L.rec[i] = C.fy;
  for (let i = L.cpIdx + 1; i < L.cps.length; i++) if (C.x >= L.cps[i]) { L.cpIdx = i; RUN.cp = { lvl: L.name, x: L.cps[i] }; RUN.cpSup = [Math.max(6, RUN.water), Math.max(6, RUN.dates)]; }
  for (const [bx] of L.banners) if (C.x >= bx && L.bannerT[bx] == null) L.bannerT[bx] = S.t;
  if (L.name === 'market') { for (const p of L.lane) { const d = p.x - C.x; if (d < 120 && p.step < 1) p.step = Math.min(1, p.step + dt * 2.2); p.x += p.v * dt * (p.step > 0 ? .3 : 1); } for (const p of L.back) p.x += p.v * dt; for (const p of L.front) p.x += p.v * dt; }
  L.cam = C.x - LV.LEAD_SX; L.cy += (camY(C.x) - L.cy) * Math.min(1, dt * 3);
  if (!L.home) { const prog = progressOf(L, C.x); if (prog > G.best && G.best < 1) { G.best = prog; if (Math.random() < .02) localStorage.setItem('rtb-best', String(prog)); } }
  if (RUN.water + RUN.dates <= 0 && !L.arrive) { localStorage.setItem('rtb-best', String(G.best)); S.mode = 'rest'; S.u = 0; return; }
  if (C.x >= L.end - .5 && !C.air) {
    if (L.name === 'beth') { if (!L.arrive.stopT) { L.arrive.stopT = S.t; Snd.joy(); localStorage.setItem('rtb-best', String(G.best)); } }
    else if (!L.endT) L.endT = S.t; else if (S.t - L.endT > .6) { localStorage.setItem('rtb-best', String(G.best)); go(L.name === 'lv3' ? 'camp' : nextOf(L.name)); }
  }
}

// ---------------- bot (test only: ?bot=1) ----------------
const BOT = { on: QS.get('bot') === '1', holdUntil: 0 };
function botStep() {
  if (BOT.on && (canContinue() || S.mode === 'camp' && S.u > 3.4 || S.mode === 'rest' && S.u > 1.5)) { press(); release(); return; }
  if (!BOT.on || !LVL || !PLAY.has(S.mode)) return;
  const C = LVL.c; const sp = SPEED();
  if (IN.down && S.t > BOT.holdUntil) release();
  if (C.air || C.auto) return;
  let want = 0;
  for (const o of LVL.obs) { if (o.hit) continue; const d = OB[o.k]; const gap = (o.x - d.hw) - (C.x + (G.easy ? 7 : 10)); if (gap > -4 && gap < sp * .08) { want = d.h > 9 ? .22 : .03; break; } }
  for (const r of LVL.RAV || []) { const gap = (r - 13) - C.x; if (gap > 0 && gap < sp * .12) want = .2; }
  if (LVL.STONES && C.x > LVL.R0 - 40 && C.x < LVL.R1) { const s = stoneAt(C.x); if (s != null && C.x > s + 4) want = .02; if (s == null && C.x < LVL.R0 && LVL.R0 - C.x < 12) want = .02; }
  if (want) { press(); BOT.holdUntil = S.t + want; }
}

// ---------------- drawing: play ----------------
function drawStrip(key, f, y, v) { const im = IMG[key + '-' + v] || IMG[key]; const sx = clamp(Math.floor((LVL.cam + (LVL.stripOff || 0)) * f), 0, im.width - W); ctx.drawImage(im, sx, 0, W, H, 0, Math.round(y), W, H); }
function drawGround(v) {
  const L = LVL, cam = L.cam, cy = L.cy;
  const ts = IMG['tile-sand-' + v], tr = IMG['tile-rock-' + v], tp = IMG['tile-pit-' + v], twt = IMG['tile-water-' + v];
  for (let sx = 0; sx < W; sx++) {
    const wx = Math.floor(sx + cam); const i = clamp(wx, 0, L.N - 1); const k = L.kind[i];
    if (k === 3) {
      const wy = Math.round(L.WL - cy); ctx.drawImage(twt, mod(wx - Math.trunc(S.t * 16), 76), 0, 1, 13, sx, wy, 1, 13);
      const top = wy + 13; ctx.drawImage(ts, mod(wx, 116), 6, 1, H - top, sx, top, 1, H - top); continue;
    }
    const top = Math.round(L.gb[i] - cy); if (top >= H) continue; const h = Math.min(140, H - top);
    if (k === 2) { const rv = L.RAV.find(r => Math.abs(wx - r) < 13); ctx.drawImage(tp, clamp(wx - (rv - 13), 0, 25), 0, 1, h, sx, top, 1, h); }
    else ctx.drawImage(k === 1 ? tr : ts, mod(wx, k === 1 ? 760 : 116), 0, 1, h, sx, top, 1, h);
    if (k === 5) { const wy = Math.round(L.JWL - cy); ctx.drawImage(twt, mod(wx - Math.trunc(S.t * 10), 76), 0, 1, top - wy + 3, sx, wy, 1, top - wy + 3); }
  }
}
function fordOverlay(v) { // shallow Jordan water over the camels' legs
  const L = LVL; if (!L.isRoad || L.home) return; const cam = L.cam, cy = L.cy; const twt = IMG['tile-water-' + v]; ctx.globalAlpha = .85;
  for (let sx = 0; sx < W; sx++) { const wx = Math.floor(sx + cam); if (L.kind[clamp(wx, 0, L.N - 1)] !== 5) continue; const wy = Math.round(L.JWL - cy); const top = Math.round(L.gb[wx] - cy); ctx.drawImage(twt, mod(wx - Math.trunc(S.t * 10), 76), 0, 1, top - wy, sx, wy, 1, top - wy); }
  ctx.globalAlpha = 1;
}
function drawCaravan(poseFor) {
  const L = LVL, C = L.c, cam = L.cam, cy = L.cy;
  for (let i = 3; i >= 0; i--) {     // three wise men and a servant leading the pack camel
    const cx = C.x - SP * i; const fy = i === 0 ? C.fy : L.rec[clamp(Math.round(cx), 0, L.N - 1)];
    const gy = surfaceY(cx, true); const jy = gy - fy;
    let pose = 'walk';
    const stopped = C.x >= L.end - 1;
    if (jy > 1.5 || (i === 0 && C.air)) pose = 'jump';
    else if (groundBase(cx + 8) - groundBase(cx - 8) > 6) pose = 'slide';
    let hop = 0; if (L.arrive && L.arrive.stopT) { const tt = S.t - L.arrive.stopT - i * .14; if (tt > 0 && tt < 2.4) { hop = 9 * Math.abs(Math.sin(tt * Math.PI / .6)); if (hop > 2) pose = 'jump'; } }
    const sx = cx - 28 - cam, sy = fy - 50 - cy - hop;
    if (sx > 330 || sx < -80) continue;
    if (i === 0 && C.inv > 0 && Math.trunc(S.t * 12) % 2) continue;
    const fr = mod(Math.trunc(cx / 2.8), 8);
    if (pose === 'walk' && !stopped && L.kind[clamp(Math.round(cx), 0, L.N - 1)] !== 5) for (let q = 0; q < 3; q++) { const age = (S.t * 2.6 + q / 3 + i * .2) % 1; if (age < .7) { px(sx + 10 - age * 10, gy - cy - 1 - age * 4, 'sandhi'); px(sx + 9 - age * 10, gy - cy - age * 4, 'paper'); } }
    if (pose === 'slide') for (let q = 0; q < 10; q++) { const age = (S.t * 3 + q / 10) % 1; px(sx + 44 + age * 18 + hsh(q) * 6, gy - cy - 1 - Math.sin(age * 3.14) * (8 + hsh(q + 3) * 8), q % 2 ? 'sandhi' : 'paper'); }
    const name = pose === 'walk' ? (stopped ? `camel_walk_${i}_2` : `camel_walk_${i}_${fr}`) : `camel_${pose}_${i}`;
    const bob = (pose === 'walk' && !stopped && fr % 4 < 2) ? 1 : 0;
    if (i === 3) tinted(v => { spr(name, sx, sy, v); spr('merchant_2', sx + 19, sy - 10 + bob, v); }, lit);
    else { const rp = poseFor(i, pose); tinted(v => { spr(name, sx, sy, v); spr(`rider_${i}_${rp}`, sx + 15, sy - 16 + bob, v); }, lit); }
  }
}
function riderPose(i, pose) {
  const t = S.t, L = LVL;
  if (L.home) return 'ridenog_' + (Math.trunc(t * 2) + (i === 1 ? 1 : 0)) % 2;   // FIX-2 #2: the gifts were given
  if (L.arrive && L.arrive.stopT && S.t - L.arrive.stopT < 3.2) return 'joy_' + (Math.trunc(t * 6) + i) % 2;
  if (i === 0 && (pose === 'jump' || pose === 'slide')) return 'clutch_0';
  if (i === 2 && L.name === 'lv3' && L.c.x > 3880 && L.c.x < 4300) return 'wave_' + Math.trunc(t * 6) % 2;
  return 'ride_' + (Math.trunc(t * 2) + (i === 1 ? 1 : 0)) % 2;
}
function drawObs(v) { const L = LVL, cam = L.cam, cy = L.cy; for (const o of L.obs) { const sx = o.x - cam; if (sx < -40 || sx > 350) continue; const d = OB[o.k]; spr(d.s, sx + d.dx, groundBase(o.x) - cy + d.dy, v); } }
function drawPicks() {
  const L = LVL, cam = L.cam, cy = L.cy;
  for (const p of L.picks) { if (p.got) continue; const sx = p.x - cam - 6; if (sx < -20 || sx > 340) continue; const y = surfaceY(p.x, true) - cy - p.hgt; spr(p.kind, sx, y + Math.round(1.5 * Math.sin(S.t * 5 + p.x))); sparkle(sx + 12, y - 1, Math.trunc(S.t * 8 + p.x)); }
}
function drawPops() { const L = LVL; L.pops = L.pops.filter(p => S.t - p.t < .9); for (const p of L.pops) popup(p.x, p.y, S.t - p.t, p.txt, p.c); }
function drawBanners() { const L = LVL; for (const [bx, s] of L.banners) { const t0 = L.bannerT[bx]; if (t0 != null && t0 > 0) banner(s, (S.t - t0) / 2.4); } }
function bannerUp() { const L = LVL; for (const [bx] of L.banners) { const t0 = L.bannerT[bx]; if (t0 != null && t0 > 0 && S.t - t0 < 2.4) return true; } return false; }
function hint(s, y = 150) { if (Math.trunc(S.t * 2.5) % 3 === 2) return; T(s, 160, y, 'white', 1, true, 'ink'); }
function hudFor(L) {
  const C = L.c; const night = L.night(C.x);
  const flash = S.t - L.flashT < .9 ? L.flash : null; const flashLow = S.t - (L.flashLowT || -9) < 1.2 ? L.flashLow : null;
  const unsafe = C.inv > 0 && Math.trunc(S.t * 10) % 2;
  hud(S.t, { month: monthOf(L, C.x), home: !!L.home, star: L.name === 'lv1' || L.name === 'beth', night, water: RUN.water, dates: RUN.dates, prog: progressOf(L, C.x), safe: [unsafe ? 0 : 1, unsafe ? 0 : 1, unsafe ? 0 : 1], flash, flashLow, low: RUN.water + RUN.dates <= 4, off: L.hudOff || 0 });
}
let SHAKE = [0, 0];
const VEIL = (() => { const c = document.createElement('canvas'); c.width = W; c.height = 148; const g = c.getContext('2d'); return { c, g, img: g.createImageData(W, 148) }; })();
function drawRoad() {
  const L = LVL, C = L.c, cam = L.cam, cy = L.cy, t = S.t; TOD = todAt(L, C.x);
  ctx.drawImage(IMG['sky-' + TOD.a], 0, 0); if (TOD.p > .02 && TOD.b !== TOD.a) { ctx.globalAlpha = TOD.p; ctx.drawImage(IMG['sky-' + TOD.b], 0, 0); ctx.globalAlpha = 1; }
  const STA = { night: 1, dusk: .4, dawn: .2, day: 0, storm: 0 }, SV = { night: 1, dusk: 1, dawn: 1, day: 0, storm: 0 };
  stars(t, STA[TOD.a] * (1 - TOD.p) + STA[TOD.b] * TOD.p, cam * .02);
  const sv = SV[TOD.a] * (1 - TOD.p) + SV[TOD.b] * TOD.p; const sa = L.storm(C.x);
  // "we have seen his star in the east" (Mt 2:2): the Star shines over level 1 only; Matthew next
  // shows it going before them from Jerusalem to Bethlehem (Mt 2:9), so the road between shows none.
  if (L.name === 'lv1' && sv > .5) bigStar(258, 44, t, 1, 0);
  tinted(v => { drawStrip('far', .07, -cy * .04, v); drawStrip('mid', .28, -cy * .12, v); });
  // a trade caravan passing on the far road, behind the near hills and dimmed; the youngest wise man waves
  if (L.name === 'lv3' && C.x > 3820 && C.x < 4320) { ctx.globalAlpha = .7;
    const base = 330 + .6 * (3820 - LV.LEAD_SX);
    for (let k = 0; k < 3; k++) {
      const nxw = base + k * 70 - (C.x - 3820) * .5; const sx = nxw - cam * .6;
      const gy = 129 - 5 * Math.sin(nxw / 57 + 2) - 3 * Math.sin(nxw / 19) - cy * .35 + 5;
      if (sx > -80 && sx < 330) { spr(`camel_walk_${3 + k % 2}_${mod(Math.trunc(-nxw / 2.8), 8)}`, sx, gy - 50, 'dusk', true); spr(`merchant_${k + 3}`, sx + 26, gy - 59, 'dusk', true); }
    }
    ctx.globalAlpha = 1;
  }
  tinted(v => drawStrip('near', .6, -cy * .35, v));
  tinted(v => drawGround(v));
  if (L.STONES) for (let k = 0; k < L.STONES.length; k++) {
    const s = L.STONES[k], sx = s - cam; if (sx < -30 || sx > 350) continue;
    const near = [0, 1, 2, 3].some(i => Math.abs(C.x - SP * i - s) < 14); const bob = near ? 0 : Math.round(1.5 + 1.5 * Math.sin(t * 4 + k * 1.7));
    tinted(v => spr('stone', sx - 16, L.WL - cy - 4 + bob, v));
    for (let q = -14; q <= 14; q += 3) if (mod(q + Math.trunc(t * 5), 2)) px(sx + q, L.WL - cy + 1, 'white');
  }
  for (let k = 0; k < 400; k++) {
    const x = 120 + k * 27 + Math.trunc(hsh(k + 7) * 20); const sx = x - cam; if (sx < -10 || sx > 330) continue;
    const kd = L.kind[clamp(x, 0, L.N - 1)]; if (kd === 2 || kd === 3 || kd === 5 || (x > L.R0 - 8 && x < L.R1 + 8)) continue;
    const gy = groundBase(x) - cy;
    if (kd === 1) { R(sx, gy - 2, sx + 3, gy, 'rockdk'); px(sx + 1, gy - 2, 'silver'); }
    else if (hsh(k + 3) < .6) { R(sx, gy - 1, sx + 2, gy, 'wood'); px(sx, gy - 1, 'paper'); }
    else for (const q of [-2, 0, 2]) line(sx, gy, sx + q, gy - 4 - Math.floor(Math.abs(q) / 2), k % 2 ? 'palmlt' : 'goldshade');
  }
  if (!L.home) for (const x of [L.R0 - 30, L.R0 - 14, L.R1 + 8, L.R1 + 26, LV.J0 - 40, LV.J0 - 22, LV.J1 + 10, LV.J1 + 30]) { const sx = x - cam; if (sx < -20 || sx > 330) continue; tinted(v => spr('reeds', sx - 8, groundBase(x) - cy - 17, v)); }
  if (!L.home) for (const [x, k] of [[6330, 0], [6400, 1], [6490, 2], [6560, 0], [8480, 1], [8560, 2], [9020, 0], [9120, 1]]) { const sx = x - cam; if (sx > -60 && sx < 330) tinted(v => spr(`palm_${k}_${mod(Math.trunc(t * 2 + k), 4)}`, sx, groundBase(x) - cy - 62, v)); }
  tinted(v => drawObs(v));
  for (let k = 0; k < 14; k++) { const sx = mod(hsh(k) * 400 - t * (60 + hsh(k + 9) * 70) - cam * .9, 360) - 20; const gy = groundBase(sx + cam) - cy - 1 - hsh(k + 4) * 5; hline(sx, sx + 3 + k % 4, gy, k % 3 ? 'paper' : 'sandhi'); }
  drawPicks();
  L.splashes = L.splashes.filter(s => t - s.t < .5); for (const s of L.splashes) spr('splash_' + Math.min(2, Math.trunc((t - s.t) * 6)), s.x - cam - 15, s.y - cy - 15);
  // sandstorm: the star cannot be seen; the lanterns and the road's cairns keep them on the way
  if (sa > 0) {
    const lx = C.x - cam + 52, ly = C.fy - cy - 34, lr2 = (64 + 6 * Math.sin(t * 9)) ** 2;
    const img = VEIL.img; const d = img.data; d.fill(0); const cov = sa * .58; const sh = Math.trunc(t * 40) % 4, t30 = Math.trunc(t * 30);
    const A = RGB.wood, B = RGB.woodlight;
    for (let y = 0; y < 148; y++) { const yy = y + 19; const by = BAY[yy & 3]; const dy2 = (yy - ly) ** 2; for (let x = 0; x < W; x++) { const near = (x - lx) ** 2 * .55 + dy2; let c = cov; if (near < lr2) c = cov * (.15 + .85 * near / lr2); if (by[(x + sh) & 3] >= c) continue; const band = mod(yy + Math.trunc(x * .15) + t30, 14) < 7 ? A : B; const o = (y * W + x) * 4; d[o] = band[0]; d[o + 1] = band[1]; d[o + 2] = band[2]; d[o + 3] = 255; } }
    VEIL.g.putImageData(img, 0, 0); ctx.drawImage(VEIL.c, 0, 19);
    for (let x = LV.STORM0 + 60; x < LV.STORM1; x += 130) { const sx = x - cam; if (sx < -20 || sx > 330) continue; const gy = groundBase(x) - cy; tinted(v => spr('cairn', sx - 6, gy - 15, v)); if (Math.trunc(t * 3 + x) % 3) sparkle(sx, gy - 16, Math.trunc(t * 6), 'paper'); }
    for (let k = 0; k < Math.trunc(70 * sa); k++) { const x = mod(hsh(k) * 420 - t * (260 + hsh(k + 5) * 200), 380) - 30; const y = 22 + hsh(k + 11) * 140 + Math.sin(t * 3 + k) * 4; const l = 5 + Math.trunc(hsh(k + 2) * 12); line(x, y, x + l, y - 1, ['sandhi', 'paper', 'woodlight'][k % 3]); }
    SHAKE = [Math.round(Math.sin(t * 47) * 2.4 * sa), Math.round(Math.sin(t * 61 + 1) * 1.6 * sa)];
  } else SHAKE = [0, 0];
  drawCaravan(riderPose);
  tinted(v => fordOverlay(v));
  const onWater = x => (x > L.R0 - 80 && x < L.R1 + 20) || (x > LV.J0 - 80 && x < LV.J1 + 20) || L.RAV.some(r => Math.abs(x + 30 - r) < 70);
  for (let k = 0; k < 40; k++) { const fx = 500 + k * 330 + Math.trunc(hsh(k + 31) * 150); const sx = fx - cam * 1.5; if (sx > -70 && sx < 330 && (L.home || !onWater(sx + cam))) tinted(v => spr('fg_' + (k % 2), sx, 151, v)); }
  drawPops(); drawBanners();
  if (L.name === 'lv1' && C.x < 760 && L.jumps < 2) hint('TAP, CLICK OR SPACE TO JUMP');
  else if (L.name === 'lv2' && C.x > 3420 && C.x < 3540) hint('HOLD TO JUMP HIGHER');
  else if (L.name === 'lv2' && C.x > 2240 && C.x < 2330) hint('JUMP FROM STONE TO STONE');
  else if (L.name === 'lv4' && C.x > 8520 && C.x < 8640) hint('WADE ACROSS THE FORD');
  hudFor(L);
}
function drawMarket() {
  const L = LVL, C = L.c, cam = L.cam, t = S.t; TOD = { a: 'day', b: 'day', p: 0 };
  ctx.drawImage(IMG['sky-day'], 0, 0);
  for (let k = 0; k < 5; k++) { const x = mod(k * 97 - cam * .05 - t * 2, 420) - 60; spr('cloud', x, 28 + k % 3 * 14); }
  const jf = IMG.jerfar, jm = IMG.jermid;
  for (let x = -mod(40 + cam * .15, 640); x < W; x += 640) ctx.drawImage(jf, Math.round(x), 62);
  for (let x = -mod(20 + cam * .5, 900); x < W; x += 900) ctx.drawImage(jm, Math.round(x), 56);
  const st = IMG['tile-street-day']; for (let x = -mod(cam, 22); x < W; x += 22) ctx.drawImage(st, Math.round(x), 150);
  R(0, 139, 319, 149, 'woodlight'); R(0, 139, 319, 139, 'paper'); R(0, 148, 319, 149, 'wood');      // the far sidewalk (FIX-2 #4)
  for (const [x, k] of L.stalls) { const sx = x - cam * .8; if (sx > -60 && sx < 330) {
    R(sx - 1, 141, sx + 54, 144, 'wood'); spr('stall_' + k, sx, 94); R(sx + 2, 136, sx + 51, 141, 'woodshade'); R(sx + 2, 136, sx + 51, 136, 'wood');
    for (const lx of [sx + 3, sx + 48]) R(lx, 120, lx + 2, 141, 'brown'); } }
  for (const x of [760, 1720]) { const sx = x - cam; if (sx > -60 && sx < 330) spr('fountain_' + Math.trunc(t * 8) % 3, sx - 24, 114); }
  const gx = L.GATE - cam; if (gx < 340) { spr('gate', gx, 22); for (const x of [L.GATE - 34, L.GATE + 116]) { const sx = x - cam; R(sx, 134, sx + 7, 151, 'rock'); R(sx - 2, 130, sx + 9, 134, 'rockdk'); spr('fire_' + mod(Math.trunc(t * 9) + x, 4), sx - 7, 110); } }
  for (const p of L.back) { const sx = p.x - cam; if (sx > -20 && sx < 330) spr(`person_${p.k}_${Math.trunc(t * 5 + p.k) % 2}_${p.c}`, sx, 121 + (p.k % 3) * 2, 'day', p.v < 0); }
  const laneDraw = (behind) => { for (const p of L.lane) { const sx = p.x - cam; if (sx < -20 || sx > 330) continue; const y = 135 - p.step * 14; if ((p.step > .5) !== behind) continue; spr(`person_${p.k}_${Math.trunc(t * 5 + p.k) % 2}_${p.c}`, sx, y); if (p.step > 0 && p.step < 1) bubble(sx + 2, y - 16, 'ex'); } };
  laneDraw(true); drawObs('day'); drawPicks(); laneDraw(false);
  drawCaravan(riderPose);
  for (const p of L.front) { const sx = p.x - cam * 1.25 + 60; if (sx > -20 && sx < 330 && !L.obs.some(o => !o.hit && Math.abs(o.x - cam - sx - 8) < 26)) spr(`person_${(p.k + 3) % 7}_${Math.trunc(t * 5 + p.k) % 2}_${p.c}`, sx, 139, 'day', p.v < 0); }
  drawPops(); drawBanners();
  hudFor(L);
}
function drawBeth() {
  const L = LVL, C = L.c, cam = L.cam, t = S.t; TOD = { a: 'night', b: 'night', p: 0 };
  ctx.drawImage(IMG['sky-night'], 0, 0); stars(t, 1, cam * .02);
  const hx = L.HOUSE - cam;
  let stx = 262, sty = 40; if (hx + 45 < stx) stx = hx + 45;
  const sinceStart = t - L.started; const reburst = sinceStart < 2.6 ? Math.max(0, 1.2 - sinceStart / 2.2) : 0;
  const stopped = hx + 45 <= 262.5; if (stopped && !L.starStop) L.starStop = t;
  const joyB = L.starStop ? Math.max(0, 1 - (t - L.starStop) / 2.4) : 0;
  bigStar(stx, sty, t, Math.min(1.25, .3 + sinceStart * 1.2), Math.max(reburst, joyB));
  ctx.drawImage(IMG.bhills, clamp(Math.floor(cam * .25), 0, IMG.bhills.width - W), 0, W, H, 0, 0, W, H);
  const ux = clamp(Math.floor(cam * .5), 0, IMG.bhuts.width - W); ctx.drawImage(IMG.bhuts, ux, 0, W, H, 0, 0, W, H);
  D.bethWindows.forEach(([x, y], k) => { const sx = x - ux; if (sx > -8 && sx < 330) { R(sx, y, sx + 5, y + 5, (k + Math.trunc(t * .7)) % 5 ? 'goldlight' : 'gold'); R(sx, y, sx + 5, y, 'brown'); } });
  drawGround('night');
  for (let k = 0; k < 24; k++) { const x = 90 + k * 118; const sx = x - cam; if (sx > -30 && sx < 330 && Math.abs(x - (L.HOUSE + 48)) > 80) spr('olive', sx, 137, 'night'); }
  if (hx > -100 && hx < 330) spr('house', hx, 90, 'dawn');
  drawObs('night'); drawPicks();
  if (L.starStop) { const f = ss(0, 1.4, t - L.starStop); beam(stx, sty + 6, hx + 45, 104, t, Math.trunc(16 * f)); }
  drawCaravan(riderPose);
  if (L.starStop && t - L.starStop < 2.6) for (let k = 0; k < 16; k++) { const s = t - L.starStop; const r = 12 + mod(s * 46 + k * 9, 70); const a = k * .39 + s * .4; sparkle(stx + Math.cos(a) * r, sty + Math.sin(a) * r * .7, Math.trunc(t * 10) + k, k % 2 ? 'goldlight' : 'paper'); }
  drawPops(); drawBanners();
  const cap = { width: 196, x0: 8, top: 30 };
  if (L.cap && L.cap.i >= 0) { const key = ['departed', 'went', 'stood', 'joy'][L.cap.i]; caption(Q[key][1], Q[key][0], cap); }
  L.hudOff = L.starStop ? Math.trunc(24 * ss(0, 1, t - L.starStop)) : 0;
  hudFor(L);
}

// ---------------- cutscenes, camp, palace, about, rest, title, end ----------------
function clip(name, u, loop = false) {
  const m = D.clips[name]; let k = Math.floor(u * m.fps); k = loop ? mod(k, m.n) : clamp(k, 0, m.n - 1);
  ctx.drawImage(IMG['clip-' + name], (k % m.cols) * W, Math.floor(k / m.cols) * H, W, H, 0, 0, W, H);
}
function button(b, label, on, onCol) { panel(b[0], b[1], b[2], b[3], on ? 'deepteal' : 'navy', on ? 'mint' : 'silver'); T(label, (b[0] + b[2]) / 2, b[1] + 5, on ? onCol : 'white', 1, true); }
function drawTitle() {
  clip('title', S.u, true); const t = S.t;
  T('THE ROAD TO', 160, 9, 'paper', 2, true, 'ink');
  T('BETHLEHEM', 160, 26, 'goldlight', 4, true, 'goldshade');
  T('THE JOURNEY OF THE WISE MEN', 160, 58, 'paper', 1, true, 'ink');
  T('TAP OR PRESS SPACE TO START', 160, 69, 'white', 1, true, 'ink');
  if (G.best > 0.001) T(G.best >= 1 ? 'BEST: REACHED BETHLEHEM' : 'BEST: ' + Math.round(G.best * 100) + '% OF THE WAY', 160, 80, 'silver', 1, true, 'ink');
  button(BTN_EASY, 'EASY MODE: ' + (G.easy ? 'ON' : 'OFF'), G.easy, 'mintlight');
  button(BTN_ABOUT, 'ABOUT THIS STORY', false);
  for (const [x, y, ph] of [[30, 24, 0], [292, 70, 2], [22, 70, 4]]) if ((Math.trunc(t * 5) + ph) % 6 < 3) sparkle(x, y, Math.trunc(t * 5));
}
const ABOUT = [
  'This game follows Matthew 2:1-12. Scripture quotations are from the King James Version.',
  'Wise men from the east saw his star and came to Jerusalem. Herod asked the chief priests and scribes, and they answered from the prophet Micah: Bethlehem. The star went before them to the house of the young child and Mary his mother.',
  'The Bible does not say how many wise men there were, or their names. It names three gifts: gold, frankincense and myrrh.',
  'The levels show one possible caravan route; the Bible does not give the route. They go up the Euphrates, by Tadmor (Palmyra), through Damascus, over the Jordan near Jericho. The Bible does not say which way they went home.',
  "The Bible does not say how long the wise men travelled. The game counts four months, like Ezra's journey (Ezra 7:9).",
];
function drawAbout() {
  R(0, 0, 319, 179, 'navy');
  T('ABOUT THIS STORY', 160, 6, 'goldlight', 1, true, 'ink');
  let y = 17;
  for (const p of ABOUT) { for (const row of wrap(p, 306)) { T(row, 7, y, 'white'); y += 8; } y += 3; }
  T('TAP TO GO BACK', 160, 171, 'goldlight', 1, true);
}
function drawClip() {
  const m = S.mode, u = S.cu; clip(CLIPOF[m], m === 'dream' ? S.u : u, m === 'dream');
  const k = holdIdx();
  if (k >= 0) { const key = HOLDS[m][k][2]; const o = m === 'map4' ? { top: 14 } : (m === 'house' || m === 'dream') ? { top: 10 } : {}; caption(Q[key][1], Q[key][0], o); }
  if (u > CLIPLEN[m]) go(nextOf(m));
}
const CAMP_POPS = [[1.0, 'jug', 214, 128], [1.4, 'dates', 264, 100], [1.8, 'jug', 224, 128], [2.2, 'dates', 286, 106]];
function drawCamp() {
  const u = S.u; clip('camp', u, true);
  const [w0, d0] = RUN.campFrom; const f = ss(.6, 2.4, u); RUN.water = Math.max(w0, Math.round(w0 + (Math.max(12, w0) - w0) * f)); RUN.dates = Math.max(d0, Math.round(d0 + (Math.max(12, d0) - d0) * f));
  let flash = null; for (const [tp, kind, x, y] of CAMP_POPS) { if (u >= tp && u - tp < .9) { popup(x, y, u - tp); flash = kind; } if (Math.abs(u - tp) < 1 / 60 && Snd.on) Snd.chime(); }
  banner('THE OASIS OF TADMOR (PALMYRA)', (u - .2) / 2.4);
  if (u > 2.6) { panel(8, 26, 112, 52, 'ink', 'goldlight'); T('SUPPLIES FULL', 60, 32, 'goldlight', 1, true); T('TAP TO GO ON', 60, 42, 'white', 1, true); }
  hud(S.t, { month: 3, star: false, night: true, water: RUN.water, dates: RUN.dates, prog: (LV.L3 - LV.START) / TOTAL, safe: [1, 1, 1], flash });
  RUN.cp = { lvl: 'lv4', x: LV.L3 }; RUN.cpSup = [Math.max(6, RUN.water), Math.max(6, RUN.dates)];
}
// Herod's palace (Mt 2:2-8). Herod is shown plainly, as the king who asks questions.
const PSTEPS = [
  { who: 'wise', label: 'THE WISE MEN', key: 'ask' },
  { who: 'narr', key: 'troubled' },
  { who: 'scribe', label: 'THE CHIEF PRIESTS AND SCRIBES', key: 'answer' },
  { who: 'scribe', label: 'THE CHIEF PRIESTS AND SCRIBES', sub: '(QUOTING THE PROPHET MICAH)', key: 'micah' },
  { who: 'herod', label: 'HEROD THE KING', key: 'sent' },
];
const SPK = { wise: [84, 96], scribe: [176, 106], herod: [280, 80] };
const CPS = 30;
const DLG = { step: 0, t0: 0, st: 0 };
function palaceReady() {
  const st = PSTEPS[DLG.step]; if (!st || S.u < 2.2) return false; const s = Q[st.key][1];
  return (S.u - DLG.t0) * CPS >= s.length && S.u - DLG.st >= minRead(s);
}
function dialogTap() {
  const st = PSTEPS[DLG.step]; if (!st || S.u < 2.2) return; const s = Q[st.key][1]; const shown = (S.u - DLG.t0) * CPS;
  if (shown < s.length) { DLG.t0 = S.u - s.length / CPS - .01; return; }
  if (!palaceReady()) return;
  DLG.step++; DLG.t0 = DLG.st = S.u; if (DLG.step >= PSTEPS.length) go('map5');
}
function drawPalace() {
  clip('palace', S.u, true);
  banner("HEROD'S PALACE, JERUSALEM", (S.u - .1) / 2.4);
  if (S.u < 2.2) { DLG.t0 = DLG.st = S.u; return; }
  const st = PSTEPS[DLG.step]; if (!st) return;
  const [ref, s] = Q[st.key]; const loc = S.u - DLG.t0; const narr = st.who === 'narr';
  const tx = narr ? 18 : 64, twd = narr ? 284 : 238; const rows = wrap(s, twd); const ty = st.sub ? 38 : 28; const h = Math.max(narr ? 30 : 64, ty - 4 + rows.length * 11 + 4);
  panel(7, 6, 312, 6 + h, narr ? 'ink' : 'navy', 'gold');
  if (!narr) { panel(13, 12, 56, 66, 'deepteal', 'silver'); spr(st.who === 'wise' ? 'portrait_wise' : st.who === 'herod' ? 'portrait_herod' : 'portrait_scribe', st.who === 'scribe' ? 20 : 19, st.who === 'scribe' ? 22 : 12, 'day', false, true); }
  if (st.label) T(st.label, tx, 14, 'goldlight');
  if (st.sub) T(st.sub, tx, 24, 'silver');
  T(ref, 304 - tw(ref), st.sub ? 24 : 14, 'silver');
  let left = Math.trunc(loc * CPS); rows.forEach((row, i) => { T(row.slice(0, Math.max(0, left)), tx, ty + i * 11, 'white'); left -= row.length + 1; });
  if (Math.trunc(S.t * 2) % 2 === 0) poly([[298, 6 + h - 9], [304, 6 + h - 9], [301, 6 + h - 5]], 'goldlight');
  if (!narr) { const [mx, my] = SPK[st.who]; const b = Math.trunc(S.t * 4) % 2; poly([[mx - 3, my - 5 + b], [mx + 3, my - 5 + b], [mx, my - 1 + b]], 'goldlight'); }
  noteVerse(s, ref);
}
function drawRest() {
  if (LVL.isRoad) drawRoad(); else if (LVL.name === 'market') drawMarket(); else drawBeth();
  inkfade(.5); panel(40, 46, 280, 122, 'navy', 'gold');
  T('REST AT CAMP', 160, 56, 'goldlight', 2, true, 'ink');
  T('The camels need water and dates.', 160, 80, 'white', 1, true);
  T('Pick up jugs and dates on the road.', 160, 92, 'mist', 1, true);
  T('TAP TO SET OUT FROM THE LAST CAMP', 160, 108, 'goldlight', 1, true);
}
const END_TW = []; { let s2 = 77; const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; }; for (let k = 0; k < 46; k++) { const x = 4 + Math.floor(r2() * 312), y = 4 + Math.floor(r2() * 172); if (x > 46 && x < 274 && y > 8) continue; END_TW.push([x, y, r2() * 6.28, 1.5 + r2() * 2.5, k]); } }
function drawEndOverlay() {
  const g = octx; g.clearRect(0, 0, W, H); const t = S.t;
  for (const [x, y, ph, sp, k] of END_TW) { const v = Math.sin(t * sp + ph); if (v < -.3) continue; g.fillStyle = COL[k % 3 === 0 ? 'goldlight' : 'mist']; g.fillRect(x, y, 1, 1); if (v > .6) { g.fillStyle = COL[k % 3 === 0 ? 'gold' : 'slate']; g.fillRect(x + 1, y, 1, 1); g.fillRect(x - 1, y, 1, 1); g.fillRect(x, y + 1, 1, 1); g.fillRect(x, y - 1, 1, 1); } }
  if (S.u > 1.2) ctxSwap(g, () => { panel(122, 160, 198, 175, 'navy', 'goldlight'); T('PLAY AGAIN', 160, 165, 'goldlight', 1, true); });
}
function ctxSwap(g, fn) { const save = ctx; ctx = g; fillCache = ''; fn(); ctx = save; fillCache = ''; }

// ---------------- layout ----------------
const LAY = { s: 1, ox: 0, oy: 0, portrait: false };
function layout() {
  const dpr = Math.min(3, window.devicePixelRatio || 1); const cw = Math.round(view.clientWidth * dpr), ch = Math.round(view.clientHeight * dpr);
  if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
  const fit = Math.min(cw / W, ch / H); const fl = Math.floor(fit); const s = (fl >= 1 && fl / fit > .88) ? fl : fit;
  LAY.s = s; LAY.dpr = dpr; LAY.portrait = ch > cw * 1.1; LAY.ox = Math.round((cw - W * s) / 2); LAY.oy = Math.round(LAY.portrait ? Math.max(0, (ch - H * s) * .14) : (ch - H * s) / 2);
}
function present() {
  layout(); const s = LAY.s, g = vctx; g.imageSmoothingEnabled = false;
  g.fillStyle = COL.ink; g.fillRect(0, 0, view.width, view.height);
  if (S.mode === 'end') {
    g.fillStyle = 'rgb(14,24,48)'; g.fillRect(LAY.ox, LAY.oy, W * s, H * s); g.imageSmoothingEnabled = true; const es = .86; g.drawImage(IMG.endcard, LAY.ox + W * s * (1 - es) / 2, LAY.oy + H * s * .01, W * s * es, H * s * es); g.imageSmoothingEnabled = false;
    drawEndOverlay(); g.drawImage(ovl, LAY.ox, LAY.oy, W * s, H * s);
  } else g.drawImage(buf, LAY.ox + SHAKE[0] * s, LAY.oy + SHAKE[1] * s, W * s, H * s);
  if (LAY.portrait) {
    // Phone portrait: the game strip is small, so the current verse is repeated below it in large
    // pixel type and the hints sit at the bottom. Cap height = 7 font px x ts device px.
    const dpr = LAY.dpr, avail = view.width - 24 * dpr;
    const tsH = Math.max(Math.ceil(11 / 7 * dpr), 1);                  // hints >= 11 CSS px
    const tsMin = Math.max(Math.ceil(9 / 7 * dpr), 1);                 // verses >= 9 CSS px, larger if room
    const vy0 = LAY.oy + H * s + 14 * dpr, hintTop = view.height - 5 * 14 * tsH - 10 * dpr;
    let vrows = [], tsV = tsMin;
    if (S.t - VNOW.t < .15 && VNOW.s) {
      const txt = VNOW.s + ' (' + VNOW.ref + ')';
      for (let k = Math.max(tsMin, Math.ceil(16 / 7 * dpr)); k >= tsMin; k--) {
        const rows = wrap(txt, Math.floor(avail / k));
        if (vy0 + rows.length * 12 * k <= hintTop - 8 * dpr) { tsV = k; vrows = rows; break; }
      }
      if (!vrows.length) vrows = wrap(txt, Math.floor(avail / tsMin));
      vrows.forEach((r, i) => { const im = textImg(r, 'white', 1); g.drawImage(im, Math.round(view.width / 2 - im.width * tsV / 2), vy0 + i * 12 * tsV, im.width * tsV, im.height * tsV); });
    }
    LAY.verseCssPx = vrows.length ? 7 * tsV / dpr : LAY.verseCssPx; LAY.hintCssPx = 7 * tsH / dpr;
    const playing = PLAY.has(S.mode) && !(LVL && LVL.arrive);
    const top2 = playing ? ['TAP ANYWHERE TO JUMP', 'HOLD FOR A HIGHER JUMP'] : canContinue() ? ['TAP TO CONTINUE', ''] : S.mode === 'title' ? ['TAP TO START', ''] : ['', ''];
    const lines = [...top2, '', 'TURN YOUR PHONE SIDEWAYS', 'FOR A BIGGER VIEW'];
    lines.forEach((l, i) => { if (!l) return; const im = textImg(l, i < 2 ? 'goldlight' : 'silver', 1); g.drawImage(im, Math.round(view.width / 2 - im.width * tsH / 2), hintTop + i * 14 * tsH, im.width * tsH, im.height * tsH); });
  }
}

// ---------------- main loop ----------------
const STEP = 1 / 120; let acc = 0, last = performance.now(); const PERF = { frames: 0, sum: 0, max: 0 };
function render() {
  ctx.globalAlpha = 1; SHAKE = [0, 0]; const m = S.mode;
  if (m === 'loading') { R(0, 0, 319, 179, 'ink'); T('LOADING...', 160, 86, 'goldlight', 1, true); return; }
  if (m === 'title') drawTitle(); else if (m === 'about') drawAbout();
  else if (m === 'market') drawMarket(); else if (m === 'beth') drawBeth(); else if (PLAY.has(m)) drawRoad();
  else if (m === 'camp') drawCamp(); else if (m === 'palace') drawPalace(); else if (m === 'rest') drawRest();
  else if (m === 'end') { /* drawn in present() */ }
  else drawClip();
  if (canContinue()) { R(104, 166, 216, 178, 'ink'); T('TAP TO CONTINUE', 160, 168, 'goldlight', 1, true); }
  if (m !== 'end') muteIcon();
  if (S.next) inkfade(S.fade / .25);
  else if (S.u < .25 && m !== 'title' && m !== 'rest') inkfade(1 - S.u / .25);
}
function update(dt) {
  S.t += dt; S.u += dt;
  if (S.next) { S.fade += dt; if (S.fade >= .25) { const n = S.next; S.next = null; enter(n); } return; }
  if (CLIPOF[S.mode]) {
    const H = HOLDS[S.mode]; let ncu = S.cu + dt;
    if (H) { const k = holdIdx(); if (k >= 0) { if (CAP.k !== k) { CAP.k = k; CAP.t0 = S.u; CAP.rel = false; } if (!CAP.rel && ncu > H[k][1]) ncu = H[k][1]; } }
    S.cu = ncu;
  }
  botStep();
  if (PLAY.has(S.mode)) updatePlay(dt);
}
function frame(now) {
  const t0 = performance.now(); let dt = Math.min(.1, (now - last) / 1000) * TS; last = now; acc += dt; let n = 0;
  while (acc >= STEP && n < 60) { update(STEP); acc -= STEP; n++; }
  ctx = bctx; render(); present();
  const ms = performance.now() - t0; PERF.frames++; PERF.sum += ms; PERF.max = Math.max(PERF.max, ms);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else Snd.apply(); last = performance.now(); });
window.addEventListener('resize', layout);

// test / review hooks (read-only state + jump to a beat)
window.WM = {
  get state() { const C = LVL && LVL.c; return { mode: S.mode, u: CLIPOF[S.mode] ? S.cu : S.u, cont: canContinue(), t: S.t, lvl: LVL && LVL.name, x: C ? C.x : null, air: C ? C.air : null, jumps: LVL ? LVL.jumps : 0, hits: RUN ? RUN.hits : 0, water: RUN && RUN.water, dates: RUN && RUN.dates, easy: G.easy, best: G.best, sound: Snd.on, musicPlaying: !music.paused, dlg: DLG.step, verseCssPx: LAY.verseCssPx || null, hintCssPx: LAY.hintCssPx || null }; },
  verses: () => [...shownVerses], Q, verseProblems, perf: PERF,
  jump(mode, x) { if (!RUN) newRun(); RUN.resumeX = x == null ? null : x; S.next = null; enter(mode); },
  press, release, bot: BOT, setSupplies(w, d) { RUN.water = w; RUN.dates = d; },
};
requestAnimationFrame(frame);
Promise.all(assetList().map(([k, s]) => loadImg(k, s))).then(() => { S.mode = 'title'; S.u = 0; const st = QS.get('start'); if (st) { newRun(); window.WM.jump(st, QS.get('x') ? parseFloat(QS.get('x')) : null); } })
  .catch(e => { console.error(e); S.mode = 'loading'; });
})();
