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
    for (const k of ['sand', 'rock', 'pit', 'water', 'street', 'brick']) L.push(['tile-' + k + '-' + v, 'assets/tile-' + k + '-' + v + '.png']);
  }
  for (const lv in D.v3) for (const v of D.v3[lv].tods || []) for (const k of ['far', 'mid', 'near']) L.push([k + '-' + lv + '-' + v, 'assets/' + k + '-' + lv + '-' + v + '.png']);
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
  boing() { if (!this.on || !this.ac) return; const a = this.ac, t0 = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'square';
    o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(620, t0 + .12); o.frequency.exponentialRampToValueAtTime(420, t0 + .2);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.035, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + .24); o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + .26); },
  scatter() { if (!this.on || !this.ac) return; const a = this.ac, n = a.sampleRate * .18, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * .18;
    const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; s.connect(f); f.connect(a.destination); s.start(a.currentTime + .05);
    [1480, 1760, 1320].forEach((q, i) => this.tone(q, .06, 'triangle', .03, .08 + i * .05)); },
  joy() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, .4, 'triangle', .05, i * .09)); },
};

// ---------------- levels ----------------

// ======================= v3: difficulty, levels, scrolls =======================
// Jump physics: tap = a short hop, hold = a big jump (lower gravity while held), and a mid-air second
// hop on Easy and Normal. Every required gap and step below is sized from these numbers with a margin.
const DIFFS = {
  easy: { key: 'easy', name: 'EASY', col: 'mintlight', speed: 60, g: 440, gh: 100, v0: 135, hold: .28, dbl: 130, off: 1, startW: 14, drainW: 11, drainD: 22, jug: 3, pick: 900, hz: .5, gap: .8, sinkDelay: .7, sinkRate: 6, cps: 4, fall: 1, hit: 1, wind: .42 },
  normal: { key: 'normal', name: 'NORMAL', col: 'goldlight', speed: 76, g: 560, gh: 120, v0: 130, hold: .25, dbl: 125, off: .75, startW: 10, drainW: 6, drainD: 16, jug: 2, pick: 1200, hz: 1, gap: 1, sinkDelay: .4, sinkRate: 10, cps: 3, fall: 2, hit: 1, wind: .62 },
  wise: { key: 'wise', name: 'WISE', col: 'coral', speed: 92, g: 600, gh: 130, v0: 135, hold: .25, dbl: 0, off: .4, startW: 10, drainW: 6.5, drainD: 14, jug: 2, pick: 1500, hz: 1.4, gap: 1.12, sinkDelay: .2, sinkRate: 18, cps: 2, fall: 3, hit: 2, wind: .8 },
};
const STEP_UP = 6, HW = 7;
let DIF = DIFFS[localStorage.getItem('rtb3-diff') || 'normal'] || DIFFS.normal;

const LORDER = ['lv1', 'lv2', 'lv3', 'lv4', 'market', 'beth', 'home'];
const LCFG = {
  lv1: { n: 1, title: 'THE EAST', short: 'THE EAST', len: D.v3.lv1.len, theme: 'desert', strip: 'lv1',
    tod: [[0, 'night'], [.55, 'night'], [.75, 'dawn'], [.9, 'day'], [9, 'day']], night: f => f < .7, star: f => f < .72 },
  lv2: { n: 2, title: 'ALONG THE EUPHRATES', short: 'EUPHRATES', len: D.v3.lv2.len, theme: 'river', strip: 'lv2', tod: [[0, 'dawn'], [.12, 'dawn'], [.25, 'day'], [9, 'day']], night: () => false },
  lv3: { n: 3, title: 'THE SYRIAN DESERT', short: 'SYRIAN DESERT', len: D.v3.lv3.len, theme: 'storm', strip: 'lv3', storm: [.32, .52],
    tod: [[0, 'day'], [.28, 'day'], [.32, 'storm'], [.57, 'storm'], [.66, 'dusk'], [.85, 'night'], [9, 'night']], night: f => f > .8 },
  lv4: { n: 4, title: 'DAMASCUS TO THE JORDAN', short: 'TO THE JORDAN', len: D.v3.lv4.len, theme: 'hills', strip: 'lv4',
    tod: [[0, 'night'], [.06, 'night'], [.14, 'dawn'], [.24, 'day'], [.76, 'day'], [.9, 'dusk'], [9, 'dusk']], night: f => f < .1 },
  market: { n: 5, title: 'JERUSALEM', short: 'JERUSALEM', len: D.v3.market.len, theme: 'market', tod: [[0, 'day'], [9, 'day']], night: () => false },
  beth: { n: 6, title: 'THE ROAD TO BETHLEHEM', short: 'TO BETHLEHEM', len: D.v3.beth.len, theme: 'beth', tod: [[0, 'night'], [9, 'night']], night: () => true },
  home: { n: 7, title: 'HOME ANOTHER WAY', short: 'HOME', len: D.v3.home.len, theme: 'home', strip: 'home', tod: [[0, 'dawn'], [.35, 'dawn'], [.6, 'day'], [9, 'day']], night: () => false },
};
// Three hidden travel scrolls per level: one-line notes of plain history.
const SCROLLS = {
  lv1: ['Babylon stood on the Euphrates, in what is now Iraq.', "Matthew says only that the wise men came 'from the east'.", 'Babylonian astronomers kept records of the stars for centuries.'],
  lv2: ['The Euphrates is the longest river of western Asia.', 'Date palms have grown along the Euphrates for thousands of years.', 'Rafts floated on inflated animal skins were used on the Euphrates.'],
  lv3: ['Tadmor was a caravan city on the road between the Euphrates and Damascus.', "Greeks and Romans called Tadmor 'Palmyra', a name often linked to its palms.", 'Camels can travel for days with little water.'],
  lv4: ['Damascus is one of the oldest cities in the world still lived in.', "The Bible calls Jericho 'the city of palm trees' (Deuteronomy 34:3).", 'The Jordan flows from the Sea of Galilee down to the Dead Sea.'],
  market: ['Herod the Great rebuilt the Temple in Jerusalem on a grand scale.', 'Herod ruled Judea as a king under Rome.', 'Jerusalem stands on hills about 2,500 feet above the sea.'],
  beth: ['Bethlehem is about six miles south of Jerusalem.', 'Bethlehem was the home town of King David (1 Samuel 16).', 'Frankincense and myrrh are fragrant resins from trees.'],
  home: ["Matthew 2:12 says only that they went home 'another way'.", "The King's Highway was an old road east of the Jordan (Numbers 20:17).", 'The shores of the Dead Sea are the lowest dry land on Earth.'],
};
const MAT = { none: 0, sand: 1, rock: 2, brick: 3, street: 4, crate: 5, cart: 6, post: 7 };

function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mkRng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function genLevel(name, dk) {
  const cfg = LCFG[name], Dd = DIFFS[dk], r = mkRng(hashStr(name + ':' + dk));
  const base = name === 'market' ? 165 : name === 'beth' ? 160 : 140;
  const L = { name, cfg, n: cfg.n, len: cfg.len, base, blocks: [], plats: [], water: [], hazards: [], picks: [], scrolls: [], cairns: [], cps: [], banners: [[230, 'LEVEL ' + cfg.n + ': ' + cfg.title]], decor: [], roofs: [], stalls: [] };
  let x = 0, gy = base;
  const theme = cfg.theme, mat0 = theme === 'market' ? 'street' : theme === 'beth' ? 'sand' : 'sand';
  const ground = (x0, x1, y, mat = mat0, extra = {}) => { if (x1 > x0) L.blocks.push(Object.assign({ x0: Math.round(x0), x1: Math.round(x1), y: Math.round(y), mat }, extra)); };
  const gw = w => Math.round(w * Dd.gap);
  const pick = (px, py, kind) => L.picks.push({ x: px, y: py, kind: kind || (r() < .6 ? 'jug' : 'dates'), got: false });
  const offPick = (px, py) => { if (r() < Dd.off) pick(px, py); };
  const scrollAt = (px, py) => { if (L.scrolls.length < 3) L.scrolls.push({ x: px, y: py, i: L.scrolls.length, got: false }); };
  const stormAt = px => cfg.storm && px > cfg.storm[0] * cfg.len - 150 && px < cfg.storm[1] * cfg.len + 150;
  const hz = (px, w = 16) => { if (!stormAt(px)) L.hazards.push({ x: px, w, h: 10, y: gy, kind: 'thorn' }); };   // no thorns in the storm's gust zones
  const maxR = maxRise(Dd); L.towers = []; L.jugDrop = [false, false];
  // FIX-V3-1 #2: hidden things sit above anything the low road can reach with the best possible jump
  const needS = Math.min(84 + 66, Math.ceil(maxR + 70 + 8)), needP = Math.min(84 + 62, Math.ceil(maxR + 66 + 6));
  let nextPick = 600, scrollPlan = [.2, .48, .74].map(f => f * cfg.len);
  const wantScroll = () => scrollPlan.length && x >= scrollPlan[0] ? (scrollPlan.shift(), true) : false;
  const cpFracs = Array.from({ length: Dd.cps - 1 }, (_, i) => (i + 1) / Dd.cps * cfg.len); L.cps.push(200);
  const pathPick = () => { if (x > nextPick) { pick(x + 20, gy - 38); nextPick = x + Dd.pick * (.8 + .4 * r()); } };
  const inStorm = () => cfg.storm && x > cfg.storm[0] * cfg.len && x < cfg.storm[1] * cfg.len;

  const C = {
    run(len) { if (!len) len = 160 + Math.round(r() * 200); ground(x, x + len, gy); pathPick(); if (theme !== 'market' && r() < .25) L.decor.push({ x: x + len * r(), kind: 'tuft' }); x += len; },
    camp() { ground(x, x + 160, gy); L.cps.push(x + 60); pick(x + 120, gy - 38, 'jug'); x += 160; },
    rocks() { const h = 12 + Math.round(r() * 12), w = 30 + Math.round(r() * 30); ground(x, x + 30, gy); ground(x + 30, x + 30 + w, gy - h, 'rock');
      if (r() < .4) offPick(x + 30 + w / 2, gy - h - 34); x += 30 + w; ground(x, x + 40, gy); x += 40; },
    gap(kind) { ground(x, x + 50, gy); x += 50; let w = Dd.key === 'wise' && r() < .35 ? 50 + Math.round(r() * 6) : gw(24 + r() * 20); if (stormAt(x)) { w = Math.min(28, Math.round(w * .8)); L.cairns.push(x - 30); }   // the wind shortens jumps, so storm gaps stay short
      if (kind === 'channel') L.water.push({ x0: x, x1: x + w, y: gy + 8, kind: 'channel' }); else L.decor.push({ x, w, kind: 'pit' });
      if (r() < .35) offPick(x + w / 2, gy - 52); x += w; ground(x, x + 50, gy); x += 50; },
    thorns() { ground(x, x + 220, gy); hz(x + 70); if (Dd.key === 'wise') { hz(x + 160); } else if (r() < Dd.hz - .4) hz(x + 160); x += 220; },
    steps() { const n = 2 + Math.round(r()), up = []; ground(x, x + 30, gy); x += 30;
      for (let i = 0; i < n; i++) { const h = 12 + Math.round(r() * 10); gy -= h; up.push(h); const w = 60 + Math.round(r() * 40); ground(x, x + w, gy, 'rock'); x += w; }
      offPick(x - 30, gy - 40);
      for (let i = n - 1; i >= 0; i--) { gy += up[i]; const w = 40 + Math.round(r() * 30); ground(x, x + w, i ? gy - 0 : gy, i ? 'rock' : mat0); x += w; } },
    highlow() { // low road: ground with thorns and a few dates; high road: a deliberate climb of three tiers
      // (each 28 px, so it takes a held jump) to a top run with the water jugs and, if due, a travel scroll
      const len = 560; ground(x, x + len, gy); const sc = wantScroll(); const kind = theme === 'market' ? 'roof' : 'ledge';
      const tiers = [[50, 72, 28], [138, 72, 56], [226, 150, 84], [392, 56, 56], [464, 56, 28]];
      for (const [dx, w, h] of tiers) { L.plats.push({ x0: x + dx, x1: x + dx + w, y: gy - h, kind }); if (kind === 'roof') L.roofs.push({ x: x + dx, w, y: gy - h, gy }); }
      if (sc) scrollAt(x + 300, gy - needS);
      pick(x + 250, gy - needP, 'jug');
      const half = x < cfg.len / 2 ? 0 : 1; if (Dd.key !== 'wise' || L.jugDrop[half]) pick(x + 350, gy - needP, 'jug'); else L.jugDrop[half] = true;   // Wise: one lean tower per half
      pick(x + 270, gy - 38, 'dates');
      hz(x + 160); hz(x + 320, 20); if (Dd.hz > 1) hz(x + 480);
      L.towers.push({ x0: x, x1: x + len }); x += len; },
    stones(n) { ground(x, x + 60, gy); x += 60; const wy = gy + 8, x0 = x; const wise = Dd.key === 'wise';
      const small = { easy: 20, normal: 22, wise: 23 }[Dd.key], sw = { easy: 50, normal: 46, wise: 54 }[Dd.key]; let sx = x + small + Math.round(r() * 3);
      for (let i = 0; i < n; i++) { const w_ = wise && i % 4 === 2 ? 34 : sw; L.plats.push({ x0: sx, x1: sx + w_, y: gy + 1, kind: 'stone', st: { sinkT: null } });
        // stones are wide enough to land, look and jump again; Wise chains are longer and mix short hops with long held jumps
        sx += w_ + (wise && i % 3 === 1 ? 56 + Math.round(r() * 3) : small + Math.round(r() * 2)); }   // the long Wise gaps need a held jump
      L.water.push({ x0, x1: sx, y: wy, kind: 'river' }); x = sx; ground(x, x + 60, gy); x += 60; },
    raft() { ground(x, x + 70, gy); ground(x + 64, x + 70, gy - 24, 'post'); x += 70; const w = 190, x0 = x;
      L.water.push({ x0, x1: x0 + w, y: gy + 8, kind: 'river' });
      L.plats.push({ x0: x0 + 4, x1: x0 + 68, bx0: x0, bx1: x0 + w, y: gy, kind: 'raft', a: x0 + 4, b: x0 + w - 68, ph: r() * 6 });
      x = x0 + w; ground(x, x + 70, gy); offPick(x0 + w / 2, gy - 50); x += 70; },
    dune() { for (let i = 0; i < 5; i++) { gy -= 5; ground(x, x + 30, gy); x += 30; } ground(x, x + 60, gy); x += 60; for (let i = 0; i < 5; i++) { gy += 5; ground(x, x + 30, gy); x += 30; } },
    // ---- Jerusalem market: hop onto carts, up to the awnings, over the rooftops ----
    stall() { ground(x, x + 40, gy); x += 40; ground(x, x + 46, gy - 22, 'cart'); const ax = x + 50;
      L.plats.push({ x0: ax, x1: ax + 54, y: gy - 44, kind: 'awning' }); L.stalls.push({ x: ax, y: gy - 46 });
      offPick(ax + 27, gy - 76);
      ground(x + 46, x + 140, gy); x += 140; },
    crates() { ground(x, x + 40, gy); x += 40; const n = 1 + Math.round(r() * (Dd.hz > 1 ? 2 : 1)); for (let i = 0; i < n; i++) { ground(x, x + 24, gy - 16, 'crate'); x += 24; ground(x, x + 50 + r() * 30, gy); x = L.blocks[L.blocks.length - 1].x1; } },
    roofs() { ground(x, x + 40, gy); x += 40; ground(x, x + 46, gy - 22, 'cart'); let rx = x + 56;
      for (let i = 0; i < 3; i++) { const ry = gy - 44 - (i % 2) * 14; const w = 52; L.plats.push({ x0: rx, x1: rx + w, y: ry, kind: 'roof' }); L.roofs.push({ x: rx, w, y: ry, gy });
        offPick(rx + w / 2, ry - 30); rx += w + gw(30 + r() * 10); }
      ground(x + 46, rx + 20, gy); x = rx + 20; },
    cistern() { ground(x, x + 60, gy); x += 60; const w = gw(22 + r() * 10); L.decor.push({ x, w, kind: 'pit' }); x += w; ground(x, x + 60, gy); x += 60; },
    // ---- Bethlehem: terraced hillsides ----
    terrace() { const h = 12 + Math.round(r() * 12); ground(x, x + 40, gy); x += 40; gy -= h; ground(x, x + 120, gy, 'brick'); if (r() < .5) hz(x + 70); x += 120; gy += h; ground(x, x + 40, gy); x += 40; },
  };
  const T = {
    desert: [['run', 3], ['rocks', 3], ['gap', 3], ['thorns', 2], ['highlow', 1.4], ['steps', 1.2], ['dune', 1]],
    river: [['run', 2], ['stones', 2.6], ['raft', 1.3], ['gap', 2], ['rocks', 2], ['highlow', 1.2], ['thorns', 1]],
    storm: [['run', 3], ['rocks', 2], ['gap', 2.6], ['thorns', 1.6], ['dune', 2], ['highlow', 1], ['steps', .8]],
    hills: [['run', 2], ['steps', 3], ['rocks', 2], ['gap', 2.4], ['thorns', 1.4], ['highlow', 1.2]],
    market: [['run', 2], ['stall', 3], ['crates', 2.4], ['roofs', 1.6], ['cistern', 1.6], ['highlow', .8]],
    beth: [['run', 2.4], ['terrace', 3], ['thorns', 1.6], ['gap', 1.6], ['rocks', 1.6], ['highlow', 1]],
    home: [['run', 3], ['rocks', 3], ['gap', 2.4], ['thorns', 2], ['highlow', 1.2], ['steps', 1]],
  };
  const pickChunk = list => { const tot = list.reduce((a, b) => a + b[1], 0); let q = r() * tot; for (const [n, w] of list) { if ((q -= w) <= 0) return n; } return list[0][0]; };
  C.run(420); let last = '';
  while (x < cfg.len - 500) {
    if (cpFracs.length && x >= cpFracs[0]) { cpFracs.shift(); C.camp(); continue; }
    let list = T[theme];
    if (name === 'lv4' && x > cfg.len * .82) list = [['run', 1], ['stones', 3], ['rocks', 1]];          // the Jordan ford near Jericho
    if (name === 'lv4' && x < cfg.len * .12) list = [['run', 2], ['rocks', 2], ['thorns', 1]];        // leaving Damascus
    let c = pickChunk(list); if (c === last && c !== 'run') c = 'run'; last = c;
    if (scrollPlan.length && x >= scrollPlan[0]) c = 'highlow';
    if (x > cfg.len - 1300 && ['stones', 'highlow', 'raft', 'steps'].includes(c)) c = 'run';   // nothing long may run past the end of the level
    if (c === 'gap') C.gap(theme === 'river' ? 'channel' : 'pit'); else if (c === 'stones') C.stones(Dd.key === 'wise' ? 7 + Math.round(r() * 2) : name === 'lv4' ? 6 : 4 + Math.round(r() * 3)); else C[c]();
    if (c !== 'run' && c !== 'camp') C.run(80 + Math.round(r() * 120));
  }
  ground(x, cfg.len + 600, gy = base); x = cfg.len + 600;
  if (L.scrolls.length < 3) console.warn('level ' + name + ' has only ' + L.scrolls.length + ' scrolls');
  if (cfg.storm) { L.storm = [cfg.storm[0] * cfg.len, cfg.storm[1] * cfg.len]; for (let cx = L.storm[0] + 80; cx < L.storm[1]; cx += 260) L.cairns.push(cx); }
  // theme banners
  const firstOf = kind => { const p = L.plats.find(q => q.kind === kind); return p ? p.x0 - 160 : null; };
  if (name === 'lv1') L.banners.push([700, 'THE CARAVAN SETS OUT']);
  if (name === 'lv2') { const s = firstOf('stone'); if (s) L.banners.push([s, 'STEPPING STONES: THEY SINK!']); const f = firstOf('raft'); if (f) L.banners.push([f - 60, 'WAIT FOR THE RAFT, THEN JUMP']); }
  if (L.storm) { L.banners.push([L.storm[0] - 100, 'SANDSTORM! FOLLOW THE CAIRNS']); L.banners.push([L.storm[1] + 60, 'THE STORM HAS PASSED']); L.banners.push([cfg.len - 900, 'TADMOR (PALMYRA) AHEAD']); }
  if (name === 'lv4') { L.banners.push([cfg.len * .3, 'THE HILL ROAD SOUTH']); L.banners.push([cfg.len * .82, 'THE JORDAN FORD, NEAR JERICHO']); }
  if (name === 'market') { L.banners.push([900, 'HOP ONTO CARTS AND AWNINGS']); L.banners.push([cfg.len - 500, "HEROD'S PALACE"]); }
  if (name === 'beth') L.banners.push([cfg.len - 900, 'BETHLEHEM']);
  // Jerusalem market: a fixed set of shoppers and merchants (decoration only: no collision, never in a needed path)
  if (name === 'market') { const pr = mkRng(hashStr('people:' + dk)); L.people = [];
    const busy = px => L.hazards.some(h => Math.abs(h.x - px) < 40) || L.decor.some(d => d.kind === 'pit' && px > d.x - 30 && px < d.x + d.w + 30) || L.blocks.some(b => (b.mat === 'cart' || b.mat === 'crate') && px > b.x0 - 24 && px < b.x1 + 24);
    for (let px = 300, k = 0; px < cfg.len - 200; px += 110 + Math.round(pr() * 70), k++) { if (busy(px)) continue;
      L.people.push({ x: px, k: k % 7, c: k % 3, walk: pr() < .5, ph: pr() * 6.28, range: 14 + Math.round(pr() * 14), st: 0 }); } }
  // index the world for fast lookups
  const N = Math.ceil(cfg.len + 700); L.N = N; L.gt = new Float32Array(N).fill(Infinity); L.gm = new Uint8Array(N); L.gb = new Float32Array(N).fill(Infinity);
  for (const b of L.blocks) for (let i = Math.max(0, b.x0); i < Math.min(N, b.x1); i++) { L.gt[i] = b.y; L.gm[i] = MAT[b.mat]; L.gb[i] = b.mat === 'crate' || b.mat === 'cart' || b.mat === 'post' ? base : b.y; }
  // object blocks keep the terrain under them for drawing
  for (const b of L.blocks) if (b.mat === 'crate' || b.mat === 'cart' || b.mat === 'post') { const prev = L.blocks.find(q => q.x1 >= b.x0 && q.x0 < b.x0 && q !== b && q.mat !== b.mat); b.base = prev ? prev.y : base; for (let i = b.x0; i < b.x1; i++) L.gb[i] = b.base; }
  L.plats.sort((a, b) => a.x0 - b.x0); L.plats.forEach((p, i) => { p.i = i; if (p.bx0 == null) { p.bx0 = p.x0; p.bx1 = p.x1; } });
  L.bucket = []; for (const p of L.plats) for (let k = Math.floor(p.bx0 / 64); k <= Math.floor(p.bx1 / 64); k++) (L.bucket[k] = L.bucket[k] || []).push(p);
  L.picks.sort((a, b) => a.x - b.x);
  placeCritters(L, Dd, name);
  return L;
}
// moving and sinking platforms (functions of time and stand state, shared by the game and the bot's look-ahead)
function raftPos(p, t) {
  const P = 6.4, u = ((t + p.ph) % P + P) % P; let f;
  if (u < 1.4) f = 0; else if (u < 3.2) f = ss(1.4, 3.2, u); else if (u < 4.6) f = 1; else f = 1 - ss(4.6, 6.4, u);
  return { x0: p.a + (p.b - p.a) * f, dwellFar: u >= 3.2 && u < 4.6, f };
}
function maxRise(Dd) {   // the highest the feet can get from flat ground: full hold, then the best-timed second hop
  let best = 0; const dt = 1 / 240;
  for (const tp of [null].concat(Dd.dbl ? Array.from({ length: 50 }, (_, i) => i * .02) : [])) {
    let vy = -Dd.v0, y = 0, t = 0, held = 0, used = false;
    for (let k = 0; k < 3000; k++) {
      if (tp != null && !used && t >= tp) { vy = -Dd.dbl; used = true; held = Dd.hold; }
      if (held < Dd.hold && vy < 0) { held += dt; vy += Dd.gh * dt; } else vy += Dd.g * dt;
      y += vy * dt; t += dt; best = Math.max(best, -y); if (y > 0) break;
    }
  }
  return best;
}
function stoneOff(p, st, t) {
  if (st.sinkT == null) return 0;
  const full = DIF.sinkDelay + 24 / DIF.sinkRate;
  if (t - st.sinkT > full + 2.5) { st.sinkT = null; return 0; }          // the stone bobs back up
  return clamp((t - st.sinkT - DIF.sinkDelay) * DIF.sinkRate, 0, 24);
}

// ======================= v4: critters to bounce on =======================
// Nothing dies. Land on top = a bounce (higher than a jump) and the animal is scared off in a puff of sand.
// Touch one from the side = lose a few dates and flash. Motion is a pure function of time and the lead
// camel's x, so the bot's look-ahead (stepC with sim=true) sees exactly what the game does.
const CRK = {
  frog: { w: 20, h: 16, mv: 'hop', sc: 2 }, snake: { w: 30, h: 10, mv: 'patrol', range: 16, spd: 12, sc: 2 },
  scorp: { w: 24, h: 18, mv: 'patrol', range: 12, spd: 10, sc: 2 }, viper: { w: 30, h: 10, mv: 'patrol', range: 20, spd: 16, sc: 2 },
  jackal: { w: 34, h: 22, mv: 'dash', run: 90, k: .8, sc: 2 }, boar: { w: 36, h: 26, mv: 'dash', run: 70, k: .6, sc: 2 },
  locust: { w: 26, h: 16, mv: 'hover', sc: 2 }, thief: { w: 20, h: 31, mv: 'patrol', range: 14, spd: 14, sc: 2 }, vulture: { w: 28, h: 18, mv: 'swoop', sc: 2 },
};
const CRSET = { lv1: ['frog', 'snake'], lv2: ['frog', 'snake'], lv3: ['scorp', 'viper', 'jackal'], lv4: ['boar', 'locust'], market: ['thief'], beth: ['vulture'], home: ['vulture'] };
const CRTUNE = {   // count, speed, extra stomp width, stomp window (px below the top that still counts), date cost
  easy: { n: 4, sp: .55, xw: 5, win: 10, cost: 1, sep: 650 }, normal: { n: 6, sp: 1, xw: 2, win: 7, cost: 2, sep: 420 }, wise: { n: 8, sp: 1.3, xw: 1, win: 6, cost: 2, sep: 300 },
};
// result-card line per level (plain, checkable natural history)
const CRFACT = {
  lv1: 'Frogs and water snakes live along the rivers of Mesopotamia.', lv2: 'Frogs and water snakes live along the Euphrates.',
  lv3: 'Jackals, scorpions and sand vipers live in the Syrian Desert.', lv4: 'Wild boar lived in the thickets of the Jordan Valley.',
  market: 'Thieves were a real danger to travelers and caravans.', beth: 'Griffon vultures still nest in the Judean Desert.',
  home: 'Griffon vultures are among the largest birds of the Middle East.',
};
const bounceV = Dd => Dd.v0 * 1.3;
function crFlat(L, a, b, rl = 1) {
  a = Math.round(a); b = Math.round(b); if (a < 1 || b >= L.N) return false; const g = L.gt[a]; if (!isFinite(g)) return false;
  for (let i = a; i <= b; i++) if (L.gt[i] !== g) return false;
  if (L.water.some(w => w.x1 > a - 30 && w.x0 < b + 30)) return false;
  if (L.plats.some(p => (p.kind === 'stone' || p.kind === 'raft') && p.bx1 > a - 60 && p.bx0 < b + 60)) return false;
  if (L.hazards.some(h => h.x + h.w / 2 > a - 70 * rl && h.x - h.w / 2 < b + 70 * rl)) return false;
  if ((L.towers || []).some(q => q.x1 + 30 > a && q.x0 - 60 < b)) return false;
  if (L.storm && b > L.storm[0] - 260 && a < L.storm[1] + 220) return false;     // never in the lantern dark
  if (L.cps.some(c => c > a - 90 * rl && c < b + 90 * rl)) return false;
  return true;
}
function placeCritters(L, Dd, name) {
  const kinds = CRSET[name]; L.crits = []; if (!kinds) return;
  const tu = CRTUNE[Dd.key], r = mkRng(hashStr('crit:' + name + ':' + Dd.key)), S_ = Math.round(Dd.speed * 2 * bounceV(Dd) / Dd.g);
  const add = (kind, x, extra) => { const k = CRK[kind]; const c = Object.assign({ kind, x0: x, gy: L.gt[Math.round(x)], w: k.w, h: k.h, ph: r() * 6.28, hp: 1, i: L.crits.length }, extra || {}); L.crits.push(c); return c; };
  const span = kind => { const k = CRK[kind]; return [140 + (k.run || 0) + (k.range || 0), 180 + (k.range || 0)]; };
  let last = -1e9; const end = L.len - 450;
  const far = (x, sep) => L.crits.every(c => Math.abs(c.x0 - x) >= sep);
  const findFrom = (x, kind, extraAfter = 0, sep = tu.sep, rl = 1) => { let [b, a] = span(kind); if (rl < 1) { b = 100 + (b - 140); a = 140 + (a - 180); } for (; x < end; x += 8) if (far(x, sep) && far(x + extraAfter, sep) && crFlat(L, x - b, x + a + extraAfter, rl)) return x; return null; };
  let x = name === 'lv1' ? 1000 : 650;
  if (name === 'lv1') { let ix = findFrom(x, 'frog'); const ir = findFrom(x, 'frog', 0, tu.sep, .6); if (ir != null && (ix == null || ir < ix - 600)) ix = ir; if (ix != null) { L.intro = add('frog', ix, { still: true }); last = ix; x = ix + tu.sep; } }   // the first one, alone on flat ground
  // one bounce chain per level: three still critters spaced by one passive bounce
  const chainKind = { lv1: 'frog', lv2: 'frog', lv3: 'scorp', lv4: 'locust', market: 'thief', beth: 'vulture', home: 'vulture' }[name];
  const chainAt = L.len * (name === 'lv1' ? .55 : .4);
  const n = tu.n; const step = (end - x) / n; let k = 0, chained = false;
  for (let tgt = x; L.crits.length < n + (L.intro ? 1 : 0) && tgt < end; tgt += step, k++) {
    if (!chained && tgt >= chainAt) { const cx = findFrom(tgt, chainKind, 2 * S_ + 20); if (cx != null) { for (let j = 0; j < 3; j++) add(chainKind, cx + j * S_, { still: true, chain: true }); last = cx + 2 * S_; chained = true; continue; } }
    const kind = kinds[k % kinds.length]; const cx = findFrom(Math.max(tgt, last + tu.sep), kind); if (cx == null) continue;
    const c = add(kind, cx); last = cx; if (Dd.key === 'wise' && L.crits.length % 3 === 0) c.hp = 2;   // Wise: some need two bounces
  }
  if (!chained) for (const [from, rl] of [[chainAt * .5, 1], [L.intro ? L.intro.x0 + 300 : 700, .6]]) { const cx = findFrom(from, chainKind, 2 * S_ + 20, tu.sep * .45, rl); if (cx != null) { for (let j = 0; j < 3; j++) add(chainKind, cx + j * S_, { still: true, chain: true }); chained = true; break; } }
  // short of the target (towers, storm and rivers leave little flat ground)? fill in with a closer spacing
  const want = Math.max(4, n - (Dd.key === 'easy' ? 1 : 0)) + (L.intro ? 1 : 0);
  for (let pass = 0, k2 = 0; pass < 3 && L.crits.length < want; pass++) for (let tgt = (L.intro ? L.intro.x0 + 300 : 700) + pass * 97; tgt < end && L.crits.length < want; tgt += 211, k2++) {
    const kind = kinds[k2 % kinds.length]; const cx = findFrom(tgt, kind, 0, tu.sep * (pass ? .45 : .65), pass === 2 ? .6 : 1); if (cx == null) break; if (cx > tgt + 300) { tgt = cx - 211; }
    const c = add(kind, cx); if (Dd.key === 'wise' && L.crits.length % 3 === 0) c.hp = 2; }
  L.crits.sort((a, b) => a.x0 - b.x0); L.crits.forEach((c, i) => c.i = i);
  L.chainS = S_;
}
function crState(c, sts) { if (!sts) return c; const k = 'c' + c.i; return sts[k] || (sts[k] = { hp: c.hp, gone: c.gone, fx: c.fx, fa: c.fa }); }
// position at time t for a lead camel at cx: centre x, bottom y, top y
function crPos(c, t, cx, s) {
  const k = CRK[c.kind], sp = CRTUNE[DIF.key].sp; let x = c.x0, alt = 0;
  if (s && s.fx != null) { x = s.fx; alt = s.fa || 0; }
  else if (!c.still) {
    if (k.mv === 'hop') alt = Math.max(0, Math.sin(t * 3.2 * sp + c.ph)) * 6;
    else if (k.mv === 'patrol') x = c.x0 + Math.sin(t * k.spd * sp / k.range + c.ph) * k.range;
    else if (k.mv === 'dash') x = c.x0 - Math.min(k.run, Math.max(0, cx - (c.x0 - 150)) * k.k * sp);
    else if (k.mv === 'hover') { x = c.x0 + Math.sin(t * 1.3 + c.ph) * 8; alt = 3 + 2 * Math.sin(t * 5 + c.ph); }
    else if (k.mv === 'swoop') { const d = c.x0 - cx; alt = d > 230 ? 52 : d > 70 ? 4 + 48 * (d - 70) / 160 : 4; x = c.x0 - clamp((230 - d) * .35 * sp, 0, 60); }
  } else if (k.mv === 'hover') alt = 3;
  const bot = c.gy - alt; return { x, bot, top: bot - c.h, alt };
}
// in the air, falling: did the feet come down on a critter's back this step?
function crBounce(L, C, y0, y1, t, sts) {
  if (!L.crits || C.vy <= 0) return null; const tu = CRTUNE[DIF.key];
  for (const c of L.crits) { if (Math.abs(c.x0 - C.x) > 160) continue; const s = crState(c, sts); if (s.gone) continue;
    const p = crPos(c, t, C.x, s); if (Math.abs(p.x - C.x) < c.w / 2 + 8 + tu.xw && y0 <= p.top + tu.win && y1 >= p.top - 1) return { c, s, p }; }
  return null;
}
function crSide(L, C, t, sts) {
  if (!L.crits) return null;
  for (const c of L.crits) { if (Math.abs(c.x0 - C.x) > 160) continue; const s = crState(c, sts); if (s.gone) continue;
    const p = crPos(c, t, C.x, s); if (Math.abs(p.x - C.x) < c.w / 2 + 8 && C.y > p.top + 1 && C.y - 34 < p.bot) return { c, s, p }; }
  return null;
}
function crDoBounce(C, b, t) {   // shared by game and sim
  const Dd = DIF; C.y = b.p.top; C.vy = -bounceV(Dd); C.air = true; C.holding = true; C.holdT = 0; C.dbl = !!Dd.dbl; C.on = null; C.chain = (C.chain || 0) + 1;
  b.s.hp = (b.s.hp == null ? b.c.hp : b.s.hp) - 1;
  if (b.s.hp <= 0) { b.s.gone = true; b.s.goneT = t; b.s.gx = b.p.x; b.s.gb = b.p.bot; } else { b.s.fx = b.p.x; b.s.fa = b.p.alt; b.s.dazeT = t; }
}
function addPop(L, p) {   // stack a new pop-up above any live one it would overlap
  for (let k = 0; k < 6; k++) { const hit = L.pops.some(q => { const a = Math.max(0, S.t - q.t); return a < .9 && Math.abs(q.x - p.x) < 70 && Math.abs((q.y - a * 22) - p.y) < 11; }); if (!hit) break; p.y -= 11; }
  L.pops.push(p);
}
// game-side effects of a bounce or a side hit
function crEvents(L, C, ev, st) {
  const b = C.lastB, h = C.lastH;
  if (ev.includes('bounce') && b) { st.bounces = (st.bounces || 0) + 1; Snd.boing();
    const sx = b.p.x - L.cam - 6, sy = b.p.top - L.cy - 10;
    if (!b.s.gone) addPop(L, { x: sx, y: sy, t: S.t, txt: 'DAZED!', c: 'goldlight' });
    else { Snd.scatter(); st.scared = (st.scared || 0) + 1; const give = b.c.kind === 'vulture' ? 2 : 1; RUN.dates = Math.min(30, RUN.dates + give); hudFlash('dates');
      addPop(L, { x: sx, y: sy, t: S.t, txt: b.c.kind === 'thief' ? 'GIFT SAVED! +' + give : b.c.kind === 'vulture' ? 'GOT DATES BACK! +' + give : 'DATES! +' + give, c: 'white' }); }
    if (C.chain === 3) { RUN.water = Math.min(30, RUN.water + DIF.jug); st.chains = (st.chains || 0) + 1; hudFlash('jug'); Snd.joy(); addPop(L, { x: sx - 30, y: sy - 4, t: S.t, txt: '3 BOUNCES! +' + DIF.jug + ' WATER', c: 'mintlight' }); }
  }
  if (ev.includes('chit') && h) { st.chits = (st.chits || 0) + 1; Snd.hit(); const n = CRTUNE[DIF.key].cost; RUN.dates = Math.max(0, RUN.dates - n); hudFlash('ldates');
    addPop(L, { x: C.x - L.cam - 62, y: C.y - 104 - L.cy, t: S.t, txt: (h.c.kind === 'thief' ? 'GRABBED! -' : h.c.kind === 'vulture' ? 'STOLEN! -' : 'OOPS! -') + n + ' DATES', c: 'coral' }); }
}

// ---- drawing (pixel art in the game palette; facing left, toward the caravan) ----
function flipX(x, fn) { ctx.save(); ctx.translate(2 * Math.round(x) + 1, 0); ctx.scale(-1, 1); fn(); ctx.restore(); }
const CRDRAW = {
  frog(x, y, f) { const b = 'palmlt', d = 'palm';
    if (f === 1) { R(x - 5, y - 9, x + 4, y - 5, b); R(x - 4, y - 12, x - 1, y - 9, b); px(x - 3, y - 11, 'ink'); line(x + 3, y - 5, x + 6, y - 1, d); line(x - 4, y - 5, x - 6, y - 2, d); hline(x - 4, x + 3, y - 6, 'mintlight'); return; }
    R(x - 5, y - 5, x + 5, y - 1, b); R(x - 6, y - 2, x - 3, y, d); R(x + 3, y - 2, x + 6, y, d); R(x - 5, y - 8, x - 2, y - 5, b); R(x + 1, y - 8, x + 4, y - 5, b);
    px(x - 4, y - 7, 'white'); px(x + 2, y - 7, 'white'); px(x - 3, y - 7, 'ink'); px(x + 3, y - 7, 'ink'); hline(x - 4, x + 4, y - 3, 'mintlight'); px(x - 1, y - 4, d); px(x + 1, y - 4, d); },
  snake(x, y, f) { snakeBody(x, y, f, 'palm', 'palmlt'); },
  viper(x, y, f) { snakeBody(x, y, f, 'woodlight', 'woodshade'); },
  _snake(x, y, f, c1, c2) { for (let i = 0; i < 18; i++) { const yy = y - 2 - Math.round(Math.sin(i * .7 + f * 1.6) * 1.5); R(x - 9 + i, yy - 1, x - 9 + i, yy + 1, i % 4 < 2 ? c1 : c2); }
    const hy = y - 2 - Math.round(Math.sin(f * 1.6) * 1.5); R(x - 11, hy - 2, x - 8, hy + 1, c1); px(x - 10, hy - 1, 'ink'); if (f % 2) px(x - 12, hy, 'coral'); },
  scorp(x, y, f) { const b = 'woodshade', d = 'brown'; R(x - 4, y - 4, x + 4, y - 1, b); hline(x - 4, x + 4, y - 4, 'wood');
    for (let i = 0; i < 4; i++) { const lx = x - 3 + i * 2; vline(lx + (f && i % 2 ? 1 : 0), y - 1, y, d); }
    R(x - 7, y - 4, x - 5, y - 2, b); px(x - 8, y - 4, d); px(x - 8, y - 2, d);   // claws
    R(x + 5, y - 5, x + 6, y - 3, b); R(x + 6, y - 8, x + 7, y - 6, b); R(x + 4, y - 10, x + 6, y - 9, b); px(x + 3, y - 9, 'coral'); },
  jackal(x, y, f) { const b = 'woodlight', d = 'wood', s = 'woodshade'; R(x - 6, y - 10, x + 6, y - 6, b); hline(x - 6, x + 6, y - 6, d); R(x - 10, y - 13, x - 5, y - 9, b); R(x - 12, y - 11, x - 10, y - 10, b); px(x - 12, y - 11, 'ink');
    px(x - 7, y - 15, s); px(x - 9, y - 15, s); R(x - 8, y - 14, x - 7, y - 13, s); px(x - 8, y - 12, 'ink');
    const a = f % 2 ? 2 : 0; vline(x - 5 + a, y - 5, y, s); vline(x - 3 - a, y - 5, y, d); vline(x + 4 - a, y - 5, y, s); vline(x + 6 + a, y - 5, y, d);
    line(x + 7, y - 9, x + 10, y - 6 + (f % 2), s); px(x + 10, y - 5 + (f % 2), 'paper'); },
  boar(x, y, f) { const b = 'hair', d = 'brown'; R(x - 8, y - 12, x + 8, y - 4, b); hline(x - 6, x + 8, y - 12, 'woodshade'); hline(x - 7, x + 8, y - 5, 'brown'); for (let q = -6; q < 8; q += 3) px(x + q, y - 13, 'woodshade');
    R(x - 12, y - 10, x - 8, y - 5, b); R(x - 13, y - 7, x - 12, y - 5, 'pink'); px(x - 10, y - 9, 'ink'); px(x - 12, y - 9, 'white'); px(x - 13, y - 10, 'white');
    const a = f % 2 ? 1 : 0; for (const [lx, o] of [[-6, a], [-3, -a], [4, -a], [7, a]]) vline(x + lx + o, y - 4, y, d); px(x + 9, y - 10, d); px(x + 10, y - 9, d); },
  locust(x, y, f, t) { for (let k = 0; k < 9; k++) { const a = k * 2.4 + t * (5 + k % 3), rx = Math.cos(a) * (5 + k % 3 * 1.5), ry = Math.sin(a * 1.3) * 3;
      const cx = Math.round(x + rx), cy = Math.round(y - 5 + ry); hline(cx - 1, cx + 1, cy, k % 2 ? 'palm' : 'goldshade'); px(cx - 1, cy, 'ink'); if ((Math.trunc(t * 20) + k) % 2) hline(cx, cx + 1, cy - 1, 'mist'); else px(cx + 1, cy + 1, 'palmlt'); } },
  thief(x, y, f, t, _p, stt) { const a = f % 2; R(x - 4, y - 13, x + 3, y - 4, 'plum'); R(x - 3, y - 16, x + 2, y - 12, 'violet'); R(x - 4, y - 13, x - 2, y - 11, 'skinshade'); px(x - 3, y - 12, 'ink');
    vline(x - 2 + a, y - 4, y, 'brown'); vline(x + 1 - a, y - 4, y, 'brown'); R(x - 8, y - 10, x - 5, y - 9, 'skinshade');   // reaching hand
    if (stt !== 'run') { R(x + 2, y - 11, x + 8, y - 5, 'ink'); R(x + 3, y - 10, x + 7, y - 6, 'gold'); hline(x + 3, x + 7, y - 8, 'red'); vline(x + 5, y - 10, y - 6, 'red'); px(x + 4, y - 11, 'goldlight'); px(x + 6, y - 11, 'goldlight'); px(x + 2, y - 7, 'skinshade'); } },
  vulture(x, y, f, t, perched) { const b = 'brown', d = 'rockdk'; R(x - 4, y - 7, x + 5, y - 2, b); R(x - 7, y - 9, x - 4, y - 6, 'pink'); px(x - 6, y - 8, 'ink'); px(x - 8, y - 7, 'paper');
    R(x - 4, y - 7, x - 2, y - 6, 'paper');   // ruff
    if (perched) { R(x - 1, y - 9, x + 6, y - 5, d); vline(x - 1, y - 2, y, 'woodshade'); vline(x + 2, y - 2, y, 'woodshade'); return; }
    if (f % 2) { R(x - 3, y - 14, x + 5, y - 8, d); hline(x - 4, x + 7, y - 14, b); } else { R(x - 3, y - 4, x + 9, y - 2, d); hline(x + 6, x + 11, y - 1, d); } },
};
function snakeBody(x, y, f, c1, c2) { CRDRAW._snake(x, y, f, c1, c2); }
function drawCrit(c, sx, by, f, t, flip, stt) {   // small animals are drawn at 2x so they read next to the camels
  const sc = CRK[c.kind].sc || 1; sx = Math.round(sx); by = Math.round(by);
  ctx.save(); ctx.translate(sx, by); ctx.scale(flip ? -sc : sc, sc); ctx.translate(-sx, -by);
  CRDRAW[c.kind](sx, by, f, t, c.kind === 'vulture' && (c.still || stt === 'daze'), stt); ctx.restore();
}
function puff(x, y, age) {   // a puff of sand
  if (age < 0 || age > .5) return; const r = 3 + age * 26;
  for (let k = 0; k < 12; k++) { const a = k * .5236 + age * 2; px(x + Math.cos(a) * r, y - 4 + Math.sin(a) * r * .6, k % 3 ? 'sandhi' : 'paper'); if (age < .3) px(x + Math.cos(a) * r * .5, y - 4 + Math.sin(a) * r * .3, 'woodlight'); }
}
function drawCritters() {
  const L = LVL; if (!L.crits) return; const cam = L.cam, cy = L.cy, t = S.t, C = L.c;
  for (const c of L.crits) {
    if (c.x0 - cam < -260 || c.x0 - cam > 360) continue;
    if (c.gone) { const age = t - c.goneT; if (age > 2) continue; puff(c.gx - cam, c.gb - cy, age);
      const fly = CRK[c.kind].mv === 'swoop' || c.kind === 'locust';
      const fx = c.gx - cam - age * (fly ? 120 : 170), fy = c.gb - cy - (fly ? age * 70 : Math.abs(Math.sin(age * 14)) * 3);
      if (age > .12 && fx > -30) drawCrit(c, fx, fy, Math.trunc(t * 12) % 2, t, false, 'run');
      if (c.kind === 'thief' && age < 1.2) { const gx = c.gx - cam + 4, gy = c.gb - cy - 6 + Math.min(6, age * age * 60); R(gx - 2, gy - 3, gx + 1, gy, 'gold'); hline(gx - 2, gx + 1, gy - 2, 'goldlight'); if (age > .3) sparkle(gx, gy - 6, Math.trunc(t * 8)); }   // the dropped gift
      continue; }
    const p = crPos(c, t, C.x, c), sx = p.x - cam, by = p.bot - cy; if (sx < -30 || sx > 340) continue;
    const k = CRK[c.kind]; let f = 0;
    if (c.fx != null) f = 0; else if (k.mv === 'hop') f = p.alt > 1.5 ? 1 : 0; else if (k.mv === 'swoop' && !c.still) f = Math.trunc(t * 6) % 2; else f = Math.trunc(t * (k.mv === 'dash' && p.x < c.x0 - 1 ? 10 : 3) + c.ph) % 2;
    const flip = k.mv === 'patrol' && Math.cos(t * k.spd * CRTUNE[DIF.key].sp / k.range + c.ph) > 0 && c.fx == null && !c.still;
    if (c.hp > 1 && c.fx == null) { const blink = Math.trunc(t * 3) % 2; if (blink) { px(sx - 1, p.top - cy - 4, 'coral'); px(sx + 1, p.top - cy - 4, 'coral'); } }   // a tough one (needs 2)
    drawCrit(c, sx, by, f, t, flip, c.fx != null ? 'daze' : '');
    if (c.fx != null) for (let q = 0; q < 3; q++) { const a = t * 6 + q * 2.1; sparkle(sx + Math.cos(a) * 7, p.top - cy - 5 + Math.sin(a) * 2, Math.trunc(t * 8) + q); }
    if (c === L.intro && p.x - C.x < 230 && p.x - C.x > -10) { const ay = p.top - cy - 10 + Math.round(Math.sin(t * 6) * 2); T('V', sx, ay - 8, 'goldlight', 1, true, 'ink'); }
  }
}
function critHint() { const L = LVL, C = L.c; if (L.intro && !L.intro.gone && L.intro.x0 - C.x < 230 && L.intro.x0 - C.x > -20) { R(110, 26, 210, 40, 'ink'); T('JUMP ON IT!', 160, 30, 'goldlight', 1, true); } }

// ======================= v3: state, physics, flow, bot =======================
const S = { mode: 'loading', t: 0, u: 0, cu: 0, fade: 0, next: null };
let LVL = null, RUN = null;
const SP = 56;
const PLAY = new Set(LORDER);
const SEQ = ['title', 'eastclip', 'lv1', 'map1', 'lv2', 'map2', 'lv3', 'camp', 'map3', 'lv4', 'map4', 'market', 'palace', 'map5', 'beth', 'house', 'dream', 'away', 'map6', 'home', 'end'];
const nextOf = m => SEQ[SEQ.indexOf(m) + 1];
const SAVE = {
  best: (() => { try { return JSON.parse(localStorage.getItem('rtb3-best') || '{}'); } catch (e) { return {}; } })(),
  unlock: parseInt(localStorage.getItem('rtb3-unlock') || '1', 10) || 1,
  put(lv, res) { const d = this.best[DIF.key] = this.best[DIF.key] || {}; const o = d[lv]; let nb = false;
    if (!o || res.lamps > o.lamps || (res.lamps === o.lamps && res.time < o.time)) { d[lv] = res; nb = true; }
    this.unlock = Math.max(this.unlock, LORDER.indexOf(lv) + 2); localStorage.setItem('rtb3-best', JSON.stringify(this.best)); localStorage.setItem('rtb3-unlock', String(this.unlock)); return nb; },
};
function newRun() { RUN = { water: DIF.startW, dates: 8, scrolls: {}, stats: {} }; }
function lvlProg(L, x) { return clamp((x - 200) / (L.len - 260), 0, 1); }
function todAt(L, x) { const f = lvlProg(L, x), K = L.cfg.tod; for (let k = 0; k < K.length - 1; k++) { const [t0, a] = K[k], [t1, b] = K[k + 1]; if (f < t1) return a === b ? { a, b, p: 0 } : { a, b, p: ss(t0, t1, f) }; } return { a: 'day', b: 'day', p: 0 }; }

function startLevel(name, fromX, keep) {
  const L = genLevel(name, DIF.key); LVL = L; L.c0 = S.t;
  const st = RUN.stats[name] = (keep && RUN.stats[name]) || { time: 0, falls: 0, hits: 0, outs: 0, bounces: 0, chits: 0, scared: 0, chains: 0, t0: S.t };
  const x = fromX == null ? 200 : fromX;
  for (const p of L.picks) if (p.x < x) p.got = true;
  const found = RUN.scrolls[name] = RUN.scrolls[name] || [false, false, false];
  for (const s of L.scrolls) s.got = found[s.i];
  L.rec = new Float32Array(L.N); for (let i = 0; i < L.N; i++) L.rec[i] = isFinite(L.gt[i]) ? L.gt[i] : L.base;
  const C = { x, y: L.gt[Math.round(x)], vy: 0, air: false, holding: false, holdT: 0, buf: 0, dbl: false, lastGround: S.t, inv: 0, resp: 0, on: null, ride: false };
  L.c = C; L.cam = x - LV.LEAD_SX; L.cy = 0; L.pops = []; L.bannerT = {}; L.splashes = []; L.note = null; L.flash = null; L.flashT = -9;
  for (const [bx] of L.banners) if (bx < x - 20) L.bannerT[bx] = -99;
  L.cpIdx = 0; for (let i = 0; i < L.cps.length; i++) if (L.cps[i] <= x + 1) L.cpIdx = i;
  RUN.cp = { lvl: name, x: L.cps[L.cpIdx], water: Math.max(RUN.water, Math.ceil(DIF.startW * .7)) };
  L.drainW = 0; L.drainD = 0; L.arrive = null; L.jumps = 0;
}

// ---- surfaces ----
function platsNear(L, x) { return L.bucket[Math.floor(x / 64)] || []; }
function platTop(L, p, t, sts) {
  if (p.kind === 'stone') { const off = stoneOff(p, sts ? sts[p.i] || p.st : p.st, t); return off > 8 ? Infinity : p.y + off; }
  return p.y;
}
function platX0(p, t) { return p.kind === 'raft' ? raftPos(p, t).x0 : p.x0; }
// highest surface under [x-HW, x+HW] that the feet (at prevY) can stand on
function support(L, x, prevY, t, sts) {
  let best = Infinity, on = null;
  const a = Math.max(0, Math.floor(x - HW)), b = Math.min(L.N - 1, Math.ceil(x + HW));
  for (let i = a; i <= b; i++) { const g = L.gt[i]; if (g < best && g >= prevY - STEP_UP) best = g; }
  for (const p of platsNear(L, x)) {
    const x0 = platX0(p, t), x1 = x0 + (p.x1 - p.x0); if (x + HW * .7 < x0 || x - HW * .7 > x1) continue;
    const top = platTop(L, p, t, sts); if (top >= prevY - 1.5 && top < best) { best = top; on = p; }
  }
  return { y: best, on: best === Infinity ? null : on };
}
function waterAt(L, x) { for (const w of L.water) if (x > w.x0 && x < w.x1) return w; return null; }
function windAt(L, x, t) { if (!L.storm || x < L.storm[0] || x > L.storm[1]) return 0; const g = .5 + .5 * Math.sin(t * .9 + x * .0021) * Math.sin(t * .37 + 1.3); return Math.min(DIF.speed * .55, DIF.speed * DIF.wind * (.4 + .8 * g)); }   // capped at 55% of camel speed

// One physics step for the lead camel. Shared by the game and the bot's look-ahead (sim=true: no side effects).
// inp: { edge: pressed this step, down: held }. Returns events.
function stepC(L, C, inp, dt, t, sim, sts) {
  const Dd = DIF; const ev = [];
  if (C.resp > 0) { C.resp -= dt; return ev; }
  C.inv = Math.max(0, C.inv - dt);
  // horizontal speed: walking, wind, tired camels, riding a raft
  let vx = Dd.speed * (C.tired ? .85 : 1) - windAt(L, C.x, t);
  const near = L.len - C.x; if (near < 90) vx *= clamp(near / 90, 0, 1) * .85 + .15;
  if (C.x >= L.len) vx = 0;
  let ridingMove = 0;
  if (!C.air && C.on && C.on.kind === 'raft') { const r0 = raftPos(C.on, t - dt), r1 = raftPos(C.on, t); ridingMove = r1.x0 - r0.x0; if (!r1.dwellFar) vx = 0; }
  if (L.arrive) vx = Math.min(vx, Math.max(0, (L.len - C.x) * 2));
  // jump input (with a short buffer and coyote time)
  if (inp.edge) C.buf = .12;
  if (C.buf > 0) {
    if (!C.air || t - C.lastGround < .09) { C.vy = -Dd.v0; C.air = true; C.holding = true; C.holdT = 0; C.buf = 0; C.dbl = !!Dd.dbl; C.on = null; if (!sim) { L.jumps++; Snd.jump(); } }
    else if (C.dbl && inp.edge) { C.vy = -Dd.dbl; C.dbl = false; C.holding = false; C.buf = 0; if (!sim) Snd.jump(); }
  }
  C.buf -= dt;
  // move horizontally, stopped by walls taller than a step
  let nx = C.x + vx * dt + ridingMove;
  if (vx > 0) { for (let i = Math.ceil(C.x + HW); i <= Math.ceil(nx + HW) && i < L.N; i++) if (L.gt[i] < C.y - STEP_UP) { nx = Math.min(nx, i - HW - .01); if (!C.air) C.blocked = true; break; } }
  else if (vx < 0) { for (let i = Math.floor(C.x - HW); i >= Math.floor(nx - HW) && i >= 0; i--) if (L.gt[i] < C.y - STEP_UP) { nx = Math.max(nx, i + 1 + HW + .01); break; } }
  C.x = Math.max(0, nx);
  // vertical
  if (C.air) {
    if (C.holding && inp.down && C.vy < 0 && C.holdT < Dd.hold) { C.holdT += dt; C.vy += Dd.gh * dt; } else { C.holding = false; C.vy += Dd.g * dt; }
    const ny = C.y + C.vy * dt; const s = support(L, C.x, C.y, t, sts);
    const cb = C.vy > 0 && L.crits && L.crits.length ? crBounce(L, C, C.y, Math.min(ny, s.y), t, sts) : null;
    if (cb) { crDoBounce(C, cb, t); C.lastB = cb; ev.push('bounce'); }
    else if (C.vy >= 0 && ny >= s.y) { C.y = s.y; C.air = false; C.vy = 0; C.on = s.on; C.lastGround = t; C.chain = 0; ev.push('land'); }
    else C.y = ny;
  } else {
    const s = support(L, C.x, C.y, t, sts);
    if (s.y <= C.y + 2) { C.y = s.y; C.on = s.on; C.lastGround = t; C.chain = 0; } else { C.air = true; C.vy = 0; C.on = null; C.dbl = !!Dd.dbl; }
  }
  if (!C.air && C.on && C.on.kind === 'stone') { const st = sts ? (sts[C.on.i] = sts[C.on.i] || { sinkT: C.on.st.sinkT }) : C.on.st; if (st.sinkT == null) st.sinkT = t; }
  // falls: a pit, or into the river
  const w = waterAt(L, C.x);
  if ((w && C.y > w.y + 5) || C.y > L.base + 60) ev.push(w ? 'splash' : 'fall');
  // thorns
  if (C.inv <= 0) for (const h of L.hazards) if (Math.abs(h.x - C.x) < h.w / 2 + 8 && C.y > h.y - h.h + 2) { ev.push('hit'); break; }
  // v4 critters: touched from the side or front
  if (C.inv <= 0 && L.crits && L.crits.length && !ev.includes('bounce')) { const ch = crSide(L, C, t, sts); if (ch) { C.inv = 1.0; C.lastH = ch; ev.push('chit'); } }
  return ev;
}
function respawnFrom(L, C, fx) {
  // back to firm ground before the gap or river (behind a mooring post)
  let i = Math.round(fx); const w = waterAt(L, fx); if (w) i = Math.round(w.x0) - 1;
  while (i > 0 && !isFinite(L.gt[i])) i--;
  while (i > 0 && L.gm[i] === MAT.post) i--;
  // every stone of this river (and any river close by) comes back up at once
  for (const p of L.plats) if (p.kind === 'stone' && p.x1 > i - 40 && p.x0 < i + 700) p.st.sinkT = null;
  // about one second of run-up on level, thorn-free ground before the edge
  const want = Math.round(DIF.speed * 1.0);
  let x = i - HW - 1; const g0 = L.gt[i];
  while (x > 1 && i - x < want && isFinite(L.gt[x - 1]) && L.gt[x - 1] === g0 && !L.hazards.some(h => Math.abs(h.x - (x - 1)) < h.w / 2 + 10)) x--;
  if (x < 1 || !isFinite(L.gt[x])) x = i;
  C.x = x; C.y = L.gt[x]; C.vy = 0; C.air = false; C.on = null; C.resp = .7; C.inv = 1.6; C.dbl = false; C.chain = 0; C.holding = false; C.buf = 0;
}
function hudFlash(kind) { LVL.flash = kind; LVL.flashT = S.t; }
function loseWater(n, txt) { const L = LVL, C = L.c; RUN.water = Math.max(0, RUN.water - n); hudFlash('low'); L.pops.push({ x: C.x - L.cam - 62, y: C.y - 104 - L.cy, t: S.t, txt: txt || ('-' + n), c: 'coral' }); }

function updatePlay(dt) {
  const L = LVL, C = L.c, st = RUN.stats[L.name];
  if (L.done) return;
  st.time += dt;
  C.tired = RUN.dates <= 0;
  const ev = stepC(L, C, { edge: !IN.consumed && (IN.consumed = true), down: IN.down }, dt, S.t, false, null);
  for (const e of ev) {
    if (e === 'hit') { C.inv = 1.4; st.hits++; Snd.hit(); loseWater(DIF.hit); }
    if (e === 'fall' || e === 'splash') { if (QS.get('debug')) console.log('FALL', e, Math.round(C.x), Math.round(C.y), C.vy, C.air); st.falls++; if (e === 'splash') { L.splashes.push({ x: C.x, t: S.t, y: (waterAt(L, C.x) || {}).y || C.y }); Snd.splash(); } else Snd.hit(); respawnFrom(L, C, C.x); loseWater(DIF.fall, 'TRY AGAIN'); break; }
    if (e === 'land' && C.on && C.on.kind === 'stone') { /* sinks soon */ }
  }
  if (ev.includes('bounce') || ev.includes('chit')) crEvents(L, C, ev, st);
  // supplies drain over time
  if (C.resp <= 0 && !L.arrive) {
    L.drainW += dt; L.drainD += dt;
    if (L.drainW >= DIF.drainW) { L.drainW = 0; RUN.water = Math.max(0, RUN.water - 1); if (RUN.water <= 3) hudFlash('low'); }
    if (L.drainD >= DIF.drainD) { L.drainD = 0; RUN.dates = Math.max(0, RUN.dates - 1); }
  }
  // pickups and scrolls
  for (const p of L.picks) { if (p.got || p.x < C.x - 30) continue; if (p.x > C.x + 40) break;
    if (Math.abs(p.x - C.x) < 22 && p.y > C.y - 66 && p.y < C.y + 4) { p.got = true; if (p.kind === 'jug') RUN.water = Math.min(30, RUN.water + DIF.jug); else RUN.dates = Math.min(30, RUN.dates + 2); hudFlash(p.kind); Snd.chime(); L.pops.push({ x: p.x - L.cam - 6, y: p.y - L.cy, t: S.t, txt: '+' + (p.kind === 'jug' ? DIF.jug : 2), c: 'white' }); } }
  for (const s of L.scrolls) if (!s.got && Math.abs(s.x - C.x) < 22 && s.y > C.y - 70 && s.y < C.y + 4) { s.got = true; RUN.scrolls[L.name][s.i] = true; Snd.joy(); L.note = { s: SCROLLS[L.name][s.i], t: S.t }; L.pops.push({ x: s.x - L.cam - 6, y: s.y - L.cy, t: S.t, txt: 'SCROLL!', c: 'goldlight' }); }
  // the followers walk where the lead camel walked
  if (!C.resp) { const xi = Math.round(C.x); for (let i = Math.max(0, xi - 3); i <= Math.min(L.N - 1, xi); i++) L.rec[i] = C.y; }
  // checkpoints and banners
  for (let i = L.cpIdx + 1; i < L.cps.length; i++) if (C.x >= L.cps[i]) { L.cpIdx = i; RUN.cp = { lvl: L.name, x: L.cps[i], water: Math.max(RUN.water, Math.ceil(DIF.startW * .6)) }; L.pops.push({ x: C.x - L.cam, y: C.y - 80 - L.cy, t: S.t, txt: 'CAMP REACHED', c: 'mintlight' }); Snd.chime(); }
  for (const [bx] of L.banners) if (C.x >= bx && L.bannerT[bx] == null) L.bannerT[bx] = S.t;
  // camera
  L.cam = C.x - LV.LEAD_SX; if (!C.air) L.cy += (clamp(C.y - L.base, -110, 10) * .8 - L.cy) * Math.min(1, dt * 2.5);
  // Bethlehem: the star's captions, then the arrival
  if (L.name === 'beth') bethCaptions(L, C);
  if (RUN.water <= 0) { st.outs++; S.mode = 'rest'; S.u = 0; return; }
  if (C.x >= L.len - 1 && !C.air) {
    if (L.name === 'beth') { if (!L.arrive) { L.arrive = { stopT: S.t }; Snd.joy(); } }
    else if (!L.endT) L.endT = S.t; else if (S.t - L.endT > .5) finishLevel();
  }
}
function finishLevel() {
  const L = LVL, st = RUN.stats[L.name]; L.done = true;
  const sc = RUN.scrolls[L.name].filter(Boolean).length; const lamps = 1 + (sc === 3 ? 1 : 0) + (RUN.water >= 8 ? 1 : 0);
  const res = { time: Math.round(st.time), water: RUN.water, scrolls: sc, lamps, falls: st.falls, hits: st.hits, outs: st.outs, bounces: st.bounces || 0, chits: st.chits || 0, scared: st.scared || 0, chains: st.chains || 0 };
  RUN.last = Object.assign({ lvl: L.name, newBest: SAVE.put(L.name, res) }, res);
  go('result');
}
function bethCaptions(L, C) {
  const seq = ['departed', 'went', 'stood']; if (!L.cap) L.cap = { i: -1, t0: 0 };
  const since = S.t - L.c0, held = S.t - L.cap.t0;
  if (L.cap.i === -1 && since > 2.6) L.cap = { i: 0, t0: S.t };
  else if (L.cap.i === 0 && held >= minRead(Q.departed[1])) L.cap = { i: 1, t0: S.t };
  else if (L.cap.i === 1 && held >= minRead(Q.went[1])) L.cap = { i: -2, t0: S.t };
  else if (L.cap.i === -2 && C.x > L.len - 700) L.cap = { i: 2, t0: S.t };
  else if (L.cap.i === 2 && L.starStop && held >= minRead(Q.stood[1])) L.cap = { i: 3, t0: S.t };
}
function bethReady() { const L = LVL; return !!(L && L.name === 'beth' && L.cap && L.cap.i === 3 && S.t - L.cap.t0 >= minRead(Q.joy[1])); }

// ---- input ----
const IN = { down: false, pressT: -9, consumed: true };
function press() { if (!IN.down) { IN.down = true; IN.pressT = S.t; IN.consumed = false; onTap(); } }
function release() { IN.down = false; }
function canvasXY(e) { const r = view.getBoundingClientRect(); const dpr = view.width / r.width; return [((e.clientX - r.left) * dpr - LAY.ox) / LAY.s, ((e.clientY - r.top) * dpr - LAY.oy) / LAY.s]; }
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const BTN = { pause: [268, 166, 292, 180], resume: [100, 78, 220, 96], plevels: [100, 104, 220, 122], easy: [26, 128, 104, 142], normal: [121, 128, 199, 142], wise: [216, 128, 294, 142], play: [26, 150, 104, 166], levels: [121, 150, 199, 166], about: [216, 150, 294, 166] };
function setPause(on) {   // freezes world time, drain, rafts and sinking stones together (update() skips while paused)
  S.paused = on; release(); IN.consumed = true; IN.pressT = -9; if (LVL && LVL.c) LVL.c.buf = 0; BOT.plan = null;
}
function setDiff(k) { DIF = DIFFS[k]; localStorage.setItem('rtb3-diff', k); }
function levelRowBox(i) { return [40, 30 + i * 18, 280, 45 + i * 18]; }
view.addEventListener('pointerdown', e => {
  e.preventDefault(); Snd.start();
  const [x, y] = canvasXY(e);
  if (inMute(x, y) && y < 181) { Snd.toggle(); return; }
  if (LAY.portrait && LAY.pui && LAY.pui.length) {      // the big portrait controls
    const r = view.getBoundingClientRect(), dx = (e.clientX - r.left) * (view.width / r.width), dy = (e.clientY - r.top) * (view.height / r.height);
    const hit = LAY.pui.find(b => dx >= b.x0 && dx <= b.x1 && dy >= b.y0 && dy <= b.y1);
    if (hit) { hit.act(); return; }
    if (S.mode === 'about' || S.mode === 'levels' || S.mode === 'title' || S.paused) return;
  }
  if (S.paused) { if (inBox(x, y, BTN.resume)) setPause(false); else if (inBox(x, y, BTN.plevels)) { setPause(false); go('levels'); } return; }
  if (PLAY.has(S.mode) && inBox(x, y, BTN.pause) && LVL && !LVL.done) { setPause(true); return; }
  if (!S.next && S.mode === 'title') {
    for (const k of ['easy', 'normal', 'wise']) if (inBox(x, y, BTN[k])) { setDiff(k); return; }
    if (inBox(x, y, BTN.levels)) { go('levels'); return; }
    if (inBox(x, y, BTN.about)) { go('about'); return; }
  }
  if (!S.next && S.mode === 'levels') {
    for (let i = 0; i < LORDER.length; i++) if (inBox(x, y, levelRowBox(i)) && i < SAVE.unlock) { newRun(); RUN.fromSelect = true; go(LORDER[i]); return; }
    if (y > 160) { go('title'); return; }
    return;
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
  else if (S.mode === 'title' && '123'.includes(e.key)) setDiff(['easy', 'normal', 'wise']['123'.indexOf(e.key)]);
  else if (S.mode === 'title' && (e.key === 'l' || e.key === 'L')) go('levels');
  else if (S.mode === 'title' && (e.key === 'a' || e.key === 'A')) go('about');
  else if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && PLAY.has(S.mode) && !S.next && LVL && !LVL.done) setPause(!S.paused);
  else if (S.mode === 'levels' && e.key === 'Escape') go('title');
});
window.addEventListener('keyup', e => { if ([' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(e.key)) release(); });
window.addEventListener('blur', release);

const CLIPOF = { eastclip: 'east', map1: 'map1', map2: 'map2', map3: 'map3', map4: 'map4', map5: 'map5', map6: 'map6', house: 'house', dream: 'dream', away: 'away' };
const CLIPLEN = { eastclip: 6.9, map1: 3.0, map2: 2.6, map3: 2.6, map4: 6.3, map5: 2.6, map6: 3.0, house: 12.5, dream: 6.7, away: 5.3 };
// every caption stays up for at least (words x 0.45 s + 2 s), 50% longer on Easy, and then until a tap
const HOLDS = {
  eastclip: [[1.9, 6.8, 'east']], map4: [[.5, 6.2, 'came']],
  house: [[.5, 2.5, 'house'], [2.8, 4.6, 'saw'], [4.9, 7.3, 'fell'], [7.5, 8.7, 'opened'], [8.9, 12.4, 'gifts']],
  dream: [[.6, 6.6, 'dream']], away: [[0, 5.2, 'away']],
};
function minRead(s) { return (s.trim().split(/\s+/).length * .45 + 2) * (DIF.key === 'easy' ? 1.5 : 1); }
const CAP = { k: -1, t0: 0, rel: false };
function holdIdx() { const H = HOLDS[S.mode]; if (!H) return -1; return H.findIndex(([a, b]) => S.cu >= a && S.cu <= b); }
function canContinue() {
  const m = S.mode; if (S.next) return false;
  if (HOLDS[m]) { const k = holdIdx(); return k >= 0 && CAP.k === k && !CAP.rel && S.u - CAP.t0 >= minRead(Q[HOLDS[m][k][2]][1]); }
  if (m === 'palace') return palaceReady();
  if (m === 'beth') return bethReady();
  if (m === 'result') return S.u > 1.2;
  return false;
}
function onTap() {
  const m = S.mode; if (S.next) return;
  if (m === 'title') { Snd.start(); newRun(); go('eastclip'); }
  else if (m === 'about') { if (S.u > .4) go('title'); }
  else if (HOLDS[m]) { if (canContinue()) CAP.rel = true; }
  else if (m.startsWith('map')) { if (S.u > 0.8) go(nextOf(m)); }
  else if (m === 'beth') { if (bethReady()) finishLevel(); }
  else if (m === 'camp') { if (S.u > 2.6) go('map3'); }
  else if (m === 'palace') dialogTap();
  else if (m === 'rest') { if (S.u > 0.8) restartFromCamp(); }
  else if (m === 'result') { if (S.u > 1.2) go(RUN.last.lvl === 'beth' ? 'house' : nextOf(RUN.last.lvl)); }
  else if (m === 'end') { if (S.u > 1.2) go('title'); }
}
function go(m) { if (S.next) return; S.next = m; S.fade = 0; }
function enter(m) {
  S.paused = false; S.mode = m; S.u = 0; S.cu = 0; CAP.k = -1; CAP.rel = false; release(); IN.consumed = true;
  if (PLAY.has(m)) { if (!RUN) newRun(); if (RUN.levelStart !== m || RUN.resumeX == null) { RUN.water = DIF.startW; RUN.dates = Math.max(RUN.dates, 8); } RUN.levelStart = m; startLevel(m, RUN.resumeX, RUN.resumeX != null); RUN.resumeX = null; }
  if (m === 'camp') RUN.campFrom = [RUN.water, RUN.dates];
  if (m === 'palace') { DLG.step = 0; DLG.t0 = 0; DLG.st = 0; }
}
function restartFromCamp() { RUN.water = Math.max(6, RUN.cp.water); RUN.dates = Math.max(6, RUN.dates); RUN.resumeX = RUN.cp.x; RUN.levelStart = RUN.cp.lvl; S.next = RUN.cp.lvl; S.fade = 0; }

// ---------------- bot (tests: ?bot=1) ----------------
// A look-ahead planner: from where the lead camel stands it tries "do nothing", taps, held jumps and
// (on Easy/Normal) a second hop, simulates each with the real physics, and picks the safest progress.
const BOT = { on: QS.get('bot') === '1', low: QS.get('lowroad') === '1', plan: null, nextPlanT: 0, airPlanT: 0 };
function simRun(L, C0, sched, T, t0) {
  const C = Object.assign({}, C0); const sts = {}; let score = 0, got = new Set(); const dt = STEP; let landed = false, tl = 0;   // same step as the game, so the look-ahead matches it exactly
  for (let k = 0; k * dt < T; k++) {
    const tau = k * dt; let edge = false, down = false;
    for (const a of sched) { if (tau >= a.at && tau < a.at + dt) edge = true; if (tau >= a.at && tau < a.at + a.h) down = true; }
    const ev = stepC(L, C, { edge, down }, dt, t0 + tau, true, sts);
    if (ev.includes('fall') || ev.includes('splash')) return { score: -1000 + C.x * .01, C };
    if (ev.includes('hit')) { score -= 70; C.inv = 1.4; }
    if (ev.includes('chit')) score -= 60;
    if (ev.includes('bounce')) score += BOT.low ? 0 : (C.chain >= 3 ? 50 : 30);
    for (const p of L.picks) { if (p.x > C.x + 30) break; if (!p.got && !got.has(p) && Math.abs(p.x - C.x) < 22 && p.y > C.y - 66 && p.y < C.y + 4) { got.add(p); score += BOT.low ? 0 : 22; } }
    for (const s of L.scrolls) if (!s.got && !got.has(s) && Math.abs(s.x - C.x) < 22 && s.y > C.y - 70 && s.y < C.y + 4) { got.add(s); score += BOT.low ? 0 : 60; }
    if (ev.includes('land')) { landed = true; tl = tau; }
    if (landed && tau - tl > .5 && sched.length) break;
  }
  const inT = L.towers && L.towers.some(q => C.x > q.x0 && C.x < q.x1);
  if (inT && !C.air) score += (L.base - C.y) * (BOT.low ? -2 : 3);
  return { score: score + (C.x - C0.x) + (C.air ? -3 : 2), C };
}
function botStep() {
  if (!BOT.on) return;
  if ((canContinue() && S.mode !== 'result') || S.mode === 'camp' && S.u > 3.4 || S.mode === 'rest' && S.u > 1.5 || S.mode === 'result' && S.u > (+QS.get('resultHold') || 1.5)) { press(); release(); return; }
  if (!LVL || !PLAY.has(S.mode) || LVL.done || LVL.arrive) return;
  const C = LVL.c; if (C.resp > 0) return;
  // execute the current plan
  const P = BOT.plan;
  if (P) { const tau = S.t - P.t0; let downNow = false;
    for (const a of P.sched) { if (!a.fired && tau >= a.at) { a.fired = true; release(); press(); } if (tau >= a.at && tau < a.at + a.h) downNow = true; }
    if (!downNow && IN.down) release();
    if (P.sched.every(a => a.fired) && !downNow && !C.air) BOT.plan = null;
    if (BOT.plan && tau > 2.5) BOT.plan = null;
    if (BOT.plan && C.air && DIF.dbl && C.dbl && !P.sched.some(a => a.dbl) && S.t > BOT.airPlanT) { BOT.airPlanT = S.t + .05;
      const keep = simRun(LVL, C, [], 1.2, S.t), dbl = simRun(LVL, C, [{ at: 0, h: .2 }], 1.2, S.t);
      if (dbl.score > keep.score + 5) { P.sched.push({ at: tau, h: .2, dbl: true }); } }
    return;
  }
  if (C.air || S.t < BOT.nextPlanT) return;
  BOT.nextPlanT = S.t + (LVL.towers && LVL.towers.some(q => C.x > q.x0 - 60 && C.x < q.x1) ? 0 : 1 / 20);
  const cands = [[]];
  for (const h of [.03, .12, .3]) { cands.push([{ at: 0, h }]); if (DIF.dbl) for (const d of [.26, .4]) cands.push([{ at: 0, h }, { at: d, h: .2, dbl: true }]); }
  let best = null, bs = -1e9;
  // in a tower, also weigh jumping a little later: if a later jump is best, wait and plan again next step
  const inTower = LVL.towers && LVL.towers.some(q => C.x > q.x0 - 60 && C.x < q.x1);
  if (inTower) for (const at of [.12, .25, .4, .6]) for (const h of [.12, .3]) { cands.push([{ at, h }]); if (DIF.dbl) cands.push([{ at, h }, { at: at + .3, h: .2, dbl: true }]); }
  const T = inTower ? 2.2 : 1.5;
  for (const sc of cands) { const r = simRun(LVL, C, sc, T, S.t); const s = r.score - sc.length * .5; if (s > bs) { bs = s; best = sc; } }
  if (best && best.length && best[0].at > 0) return;
  if (best && best.length) BOT.plan = { t0: S.t, sched: best.map(a => Object.assign({ fired: false }, a)) };
}

// ======================= v3: drawing the levels =======================
const MATTILE = [null, 'sand', 'rock', 'brick', 'street', 'sand', 'sand', 'sand'];
let SHAKE = [0, 0];
const VEIL = (() => { const c = document.createElement('canvas'); c.width = W; c.height = 148; const g = c.getContext('2d'); return { c, g, img: g.createImageData(W, 148) }; })();
function stripImg(key, v) { return IMG[key + '-' + LVL.cfg.strip + '-' + v] || IMG[key + '-' + LVL.cfg.strip + '-' + LVL.cfg.tod[0][1]]; }
function drawStrip(key, f, y, v) { const im = stripImg(key, v); if (!im) return; const sx = clamp(Math.floor(LVL.cam * f), 0, im.width - W); ctx.drawImage(im, sx, 0, W, H, 0, Math.round(y), W, H); }
function tileFor(code, v) { const m = MATTILE[code] || 'sand'; return IMG['tile-' + (LVL.cfg.theme === 'market' && code === 1 ? 'street' : m) + '-' + v]; }
function drawGround(v) {
  const L = LVL, cam = L.cam, cy = L.cy, twt = IMG['tile-water-' + v], tp = IMG['tile-pit-' + v];
  for (let sx = 0; sx < W; sx++) {
    const wx = Math.floor(sx + cam); if (wx < 0 || wx >= L.N) continue; const g = L.gt[wx];
    if (!isFinite(g)) {
      const w = waterAt(L, wx);
      if (w) { const wy = Math.round(w.y - cy); ctx.drawImage(twt, mod(wx - Math.trunc(S.t * 16), 76), 0, 1, 40, sx, wy, 1, H - wy); }
      else { let k = wx; while (k > 0 && !isFinite(L.gt[k])) k--; const top = Math.round(L.gt[k] - cy) + 2; ctx.drawImage(tp, 6 + (wx % 14), 0, 1, Math.min(140, H - top), sx, top, 1, H - top); }
      continue;
    }
    const code = L.gm[wx], base = L.gb[wx]; const top = Math.round(base - cy); if (top >= H) continue;
    const tl = tileFor(code === 5 || code === 6 || code === 7 ? (L.cfg.theme === 'market' ? 4 : 1) : code, v);
    if (tl) ctx.drawImage(tl, mod(wx, tl.width), 0, 1, Math.min(tl.height, H - top), sx, top, 1, Math.min(tl.height, H - top));
  }
}
function drawObjects(v) {   // crates, carts, posts, ledges, stones, rafts, thorns, cairns, camps, decor
  const L = LVL, cam = L.cam, cy = L.cy, t = S.t;
  for (const b of L.blocks) { if (b.x1 < cam - 50 || b.x0 > cam + 340) continue; const sx = b.x0 - cam;
    if (b.mat === 'crate') spr('crate', sx - 1, b.y - cy - 2, v); else if (b.mat === 'cart') spr('cart', sx, b.y - cy, v); else if (b.mat === 'post') spr('post', sx - 1, b.y - cy, v); }
  for (const p of L.plats) { const x0 = platX0(p, t); if (x0 > cam + 340 || x0 + (p.x1 - p.x0) < cam - 40) continue; const sx = x0 - cam;
    if (p.kind === 'ledge') { const w = p.x1 - p.x0; for (let q = 0; q < w; q += 32) spr('ledge_32', sx + Math.min(q, w - 32), p.y - cy, v); }
    else if (p.kind === 'awning' || p.kind === 'roof') { R(sx, p.y - cy - 1, sx + p.x1 - p.x0 - 1, p.y - cy, 'white'); R(sx, p.y - cy + 1, sx + p.x1 - p.x0 - 1, p.y - cy + 1, 'goldlight'); }
    else if (p.kind === 'stone') { const off = stoneOff(p, p.st, t); const y = p.y + off - cy; for (let q = 0; q < p.x1 - p.x0 - 6; q += 24) spr('stone', sx - 3 + Math.min(q, p.x1 - p.x0 - 29), y - 2, v); if (off > 0 && off < 9) for (let q = 0; q < 4; q++) px(sx + 4 + q * 6, y + 1 + (Math.trunc(t * 20) + q) % 2, 'white'); }
    else if (p.kind === 'raft') { spr('raft', sx - 1, p.y - cy - 1 + Math.round(Math.sin(t * 3)), v); } }
  const dark = v === 'night' || v === 'dusk';
  for (const h of L.hazards) { const sx = h.x - cam; if (sx > -30 && sx < 340) { if (dark) spr('thorn_lit', sx - 12, h.y - cy - 16, 'day'); spr('thorn', sx - 11, h.y - cy - 15, dark ? 'dawn' : v); } }
  for (const cx of L.cairns) { const sx = cx - cam; if (sx > -20 && sx < 340) { const gy = (isFinite(L.gt[Math.round(cx)]) ? L.gt[Math.round(cx)] : L.base) - cy; spr('cairn_tall', sx - 8, gy - 31, v); } }
  for (let i = 1; i < L.cps.length; i++) { const sx = L.cps[i] - cam; if (sx > -30 && sx < 340) { const gy = L.gt[Math.round(L.cps[i])] - cy; spr('cpfire_' + Math.trunc(t * 4) % 2, sx - 4, gy - 33, v); } }
  for (const d of L.decor) { const sx = d.x - cam; if (sx < -30 || sx > 340) continue; if (d.kind === 'tuft') { const gy = L.gt[Math.round(d.x)] - cy; for (const q of [-2, 0, 2]) line(sx, gy, sx + q, gy - 4 - Math.abs(q) / 2, 'palmlt'); } }
}
function drawPeople() {
  const L = LVL, C = L.c, cam = L.cam, cy = L.cy, t = S.t;
  for (const p of L.people || []) {
    const ahead = p.x - C.x; const want = ahead > -50 && ahead < 110 ? 1 : 0;          // step aside as the caravan nears
    p.st += (want - p.st) * Math.min(1, (S.paused ? 0 : 1) * 1 / 60 * 5);
    const off = p.walk && p.st < .2 ? Math.sin(t * .6 + p.ph) * p.range : 0, dir = p.walk ? Math.cos(t * .6 + p.ph) : 0;
    const wx = p.x + off, sx = wx - cam - 9; if (sx < -20 || sx > 330) continue;
    const gb = L.gb[clamp(Math.round(wx), 0, L.N - 1)], gy = (isFinite(gb) ? gb : L.base) - cy;
    const f = p.walk && p.st < .2 ? Math.trunc(t * 4 + p.ph) % 2 : 0;
    spr(`person_${p.k}_${f}_${p.c}`, sx, gy - 30 - Math.round(p.st * 9), 'day', dir < 0 || (p.st > .5 && ahead > 0));
    if (p.st > .3 && p.st < .9 && ahead > 0) bubble(sx + 2, gy - 48 - Math.round(p.st * 9), 'ex');
  }
}
function drawPicks() {
  const L = LVL, cam = L.cam, cy = L.cy;
  for (const p of L.picks) { if (p.got) continue; const sx = p.x - cam - 6; if (sx < -20 || sx > 340) continue; const y = p.y - cy - 7; spr(p.kind, sx, y + Math.round(1.5 * Math.sin(S.t * 5 + p.x))); sparkle(sx + 12, y - 1, Math.trunc(S.t * 8 + p.x)); }
  for (const s of L.scrolls) { if (s.got) continue; const sx = s.x - cam - 6; if (sx < -20 || sx > 340) continue; const y = s.y - cy - 5 + Math.round(2 * Math.sin(S.t * 3 + s.x)); spr('scroll', sx, y); for (let k = 0; k < 3; k++) sparkle(sx + 6 + Math.cos(S.t * 2 + k * 2.1) * 9, y + 5 + Math.sin(S.t * 2 + k * 2.1) * 7, Math.trunc(S.t * 6) + k, 'paper'); }
}
function drawCaravan() {
  const L = LVL, C = L.c, cam = L.cam, cy = L.cy;
  for (let i = 3; i >= 0; i--) {
    const cx = C.x - SP * i; if (cx < 0) continue; const ix = clamp(Math.round(cx), 0, L.N - 1);
    const fy = i === 0 ? C.y : L.rec[ix]; const gy = isFinite(L.gt[ix]) ? L.gt[ix] : fy;
    let pose = 'walk'; const stopped = (C.x >= L.len - 1) || (C.blocked && i === 0) || (C.on && C.on.kind === 'raft' && i === 0);
    if (i === 0 ? C.air : gy - fy > 2) pose = 'jump';
    let hop = 0; if (L.arrive) { const tt = S.t - L.arrive.stopT - i * .14; if (tt > 0 && tt < 2.4) { hop = 9 * Math.abs(Math.sin(tt * Math.PI / .6)); if (hop > 2) pose = 'jump'; } }
    const sx = cx - 28 - cam, sy = fy - 50 - cy - hop;
    if (sx > 330 || sx < -80) continue;
    if (i === 0 && (C.inv > 0 || C.resp > 0) && Math.trunc(S.t * 12) % 2) continue;
    const fr = mod(Math.trunc(cx / 2.8), 8);
    if (pose === 'walk' && !stopped) for (let q = 0; q < 3; q++) { const age = (S.t * 2.6 + q / 3 + i * .2) % 1; if (age < .7) { px(sx + 10 - age * 10, fy - cy - 1 - age * 4, 'sandhi'); } }
    const name = pose === 'walk' ? (stopped ? `camel_walk_${i}_2` : `camel_walk_${i}_${fr}`) : `camel_${pose}_${i}`;
    const bob = (pose === 'walk' && !stopped && fr % 4 < 2) ? 1 : 0;
    const rp = L.name === 'home' ? 'ridenog_' + (Math.trunc(S.t * 2) + i) % 2 : (L.arrive && S.t - L.arrive.stopT < 3.2) ? 'joy_' + (Math.trunc(S.t * 6) + i) % 2 : (i === 0 && pose === 'jump') ? 'clutch_0' : 'ride_' + (Math.trunc(S.t * 2) + (i === 1 ? 1 : 0)) % 2;
    if (i === 3) tinted(v => { spr(name, sx, sy, v); spr('merchant_2', sx + 19, sy - 10 + bob, v); }, lit);
    else tinted(v => { spr(name, sx, sy, v); spr(`rider_${i}_${rp}`, sx + 15, sy - 16 + bob, v); }, lit);
  }
}
function drawPops() { const L = LVL; L.pops = L.pops.filter(p => S.t - p.t < .9); for (const p of L.pops) popup(p.x, p.y, S.t - p.t, p.txt, p.c); }
function drawBanners() { const L = LVL; for (const [bx, s] of L.banners) { const t0 = L.bannerT[bx]; if (t0 != null && t0 > 0) banner(s, (S.t - t0) / 2.4); } }
function hint(s, y = 150) { T(s, 160, y, 'white', 1, true, 'ink'); }
function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function hudPlay() {
  const L = LVL, C = L.c, t = S.t, y0 = -(L.hudOff || 0); if (L.hudOff >= 20) return;
  R(0, y0, 319, 19 + y0, 'ink'); R(0, 18 + y0, 319, 19 + y0, 'gold');
  T('L' + L.n, 5, 6 + y0, 'goldlight'); T(DIF.name, 20, 6 + y0, DIF.col);
  const night = L.cfg.night(lvlProg(L, C.x)); spr(night ? 'icon_moon' : 'icon_sun', 66, 4 + y0);
  T(L.name === 'home' ? 'HOMEWARD' : 'MONTH ' + Math.min(4, L.n), 80, 6 + y0, 'white');
  const fl = S.t - L.flashT < 1 ? L.flash : null, low = RUN.water <= 3;
  spr('jug', 138, 1 + y0); T(String(RUN.water).padStart(2, '0'), 153, 6 + y0, fl === 'jug' ? 'goldlight' : (low || fl === 'low') && Math.trunc(t * 4) % 2 ? 'coral' : 'white');
  spr('dates', 172, 1 + y0); T(String(RUN.dates).padStart(2, '0'), 187, 6 + y0, fl === 'dates' ? 'goldlight' : fl === 'ldates' && Math.trunc(t * 8) % 2 ? 'coral' : RUN.dates <= 0 ? 'coral' : 'white');
  const f = RUN.scrolls[L.name] || [];
  for (let i = 0; i < 3; i++) { const x = 205 + i * 14; if (f[i]) spr('scroll', x, 4 + y0); else { R(x + 2, 6 + y0, x + 9, 12 + y0, 'slate'); R(x + 3, 7 + y0, x + 8, 11 + y0, 'ink'); } }
  if (L.name !== 'home') for (let i = 0; i < 3; i++) { const x = 255 + i * 21; R(x, 1 + y0, x + 15, 16 + y0, 'gold'); R(x + 1, 2 + y0, x + 14, 15 + y0, 'navy'); spr('gift_' + i, x + 3, y0); }
  const b = 167 + (L.hudOff || 0); R(0, b, 319, 179, 'ink'); R(0, b, 319, b, 'gold');
  T(L.cfg.short, 5, b + 4, 'goldlight'); const bx = 92, BW = 128;
  R(bx, b + 5, bx + BW, b + 8, 'slate'); const pw = Math.trunc(BW * lvlProg(L, C.x)); R(bx, b + 5, bx + pw, b + 8, L.name === 'home' ? 'mint' : 'goldlight');
  for (let i = 1; i < L.cps.length; i++) { const cx = bx + Math.trunc(BW * lvlProg(L, L.cps[i])); R(cx, b + 3, cx, b + 10, i <= L.cpIdx ? 'mintlight' : 'silver'); }
  spr('icon_camel', bx + pw - 5, b + 1); spr(L.name === 'lv1' || L.name === 'beth' ? 'icon_star' : 'icon_house', bx + BW + 4, b + 1);
  T(fmtT(RUN.stats[L.name].time), 238, b + 4, 'white');
  R(272, b + 2, 288, b + 11, 'navy'); R(277, b + 4, 278, b + 9, 'paper'); R(282, b + 4, 283, b + 9, 'paper');   // pause button
}
function drawPlay() {
  const L = LVL, C = L.c, cam = L.cam, cy = L.cy, t = S.t, th = L.cfg.theme; TOD = todAt(L, C.x);
  // sky and background
  ctx.drawImage(IMG['sky-' + TOD.a], 0, 0); if (TOD.p > .02 && TOD.b !== TOD.a) { ctx.globalAlpha = TOD.p; ctx.drawImage(IMG['sky-' + TOD.b], 0, 0); ctx.globalAlpha = 1; }
  const STA = { night: 1, dusk: .4, dawn: .2, day: 0, storm: 0 }; stars(t, STA[TOD.a] * (1 - TOD.p) + STA[TOD.b] * TOD.p, cam * .02);
  if (th === 'market') {
    for (let k = 0; k < 5; k++) { const x = mod(k * 97 - cam * .05 - t * 2, 420) - 60; spr('cloud', x, 28 + k % 3 * 14); }
    for (let x = -mod(40 + cam * .15, 640); x < W; x += 640) ctx.drawImage(IMG.jerfar, Math.round(x), 62 - cy * .2);
    for (let x = -mod(20 + cam * .5, 900); x < W; x += 900) ctx.drawImage(IMG.jermid, Math.round(x), 56 - cy * .4);
    for (const r of L.roofs) { const sx = r.x - cam; if (sx < -60 || sx > 330) continue; const ry = r.y - cy; R(sx + 2, ry + 3, sx + r.w - 3, r.gy - cy, 'woodlight'); R(sx + r.w - 9, ry + 3, sx + r.w - 3, r.gy - cy, 'wood'); R(sx, ry, sx + r.w - 1, ry + 3, 'paper'); R(sx, ry + 3, sx + r.w - 1, ry + 3, 'wood'); R(sx + 12, ry + 10, sx + 18, ry + 17, 'brown'); R(sx + 32, ry + 10, sx + 38, ry + 17, 'goldlight'); }
    for (const s of L.stalls) { const sx = s.x - cam; if (sx > -60 && sx < 330) { R(sx - 1, L.base - cy - 3, sx + 54, L.base - cy, 'wood'); spr('merchant_' + (Math.round(s.x / 53) % 7), sx + 18, s.y - cy + 13); spr('stall_' + (Math.round(s.x / 97) % 4), sx, s.y - cy); } }
  } else if (th === 'beth') {
    const hx = L.len + 43 - cam; let stx = 262, sty = 40; if (hx + 45 < stx) stx = hx + 45;
    const since = t - L.c0, reb = since < 2.6 ? Math.max(0, 1.2 - since / 2.2) : 0; if (hx + 45 <= 262.5 && !L.starStop) L.starStop = t;
    bigStar(stx, sty, t, Math.min(1.25, .3 + since * 1.2), Math.max(reb, L.starStop ? Math.max(0, 1 - (t - L.starStop) / 2.4) : 0)); L.stx = stx; L.sty = sty;
    ctx.drawImage(IMG.bhills, clamp(Math.floor(cam * .25), 0, IMG.bhills.width - W), 0, W, H, 0, -cy * .2, W, H);
    const ux = clamp(Math.floor(cam * .5), 0, IMG.bhuts.width - W); ctx.drawImage(IMG.bhuts, ux, 0, W, H, 0, -cy * .4, W, H);
  } else {
    if (L.cfg.star && L.cfg.star(lvlProg(L, C.x))) bigStar(258, 44, t, 1, 0);
    tinted(v => { drawStrip('far', .07, -cy * .04, v); drawStrip('mid', .28, -cy * .12, v); drawStrip('near', .6, -cy * .35, v); });
  }
  if (L.name === 'lv4') { const wx0 = 240 - cam, gy = L.base - cy; if (wx0 < 330 && wx0 + 520 > -10) { tinted(v => {
      R(wx0, gy - 46, wx0 + 520, gy - 1, 'woodshade'); R(wx0, gy - 46, wx0 + 520, gy - 44, 'woodlight');
      for (let q = 0; q < 520; q += 14) R(wx0 + q, gy - 52, wx0 + q + 7, gy - 46, 'woodshade');
      for (let yy = gy - 40; yy < gy; yy += 8) for (let q = (yy & 8) ? 0 : 7; q < 520; q += 14) R(wx0 + q, yy, wx0 + q, yy + 7, 'wood');
      const gx = wx0 + 70; R(gx - 10, gy - 66, gx + 50, gy - 1, 'woodshade'); for (let q = 0; q < 60; q += 12) R(gx - 10 + q, gy - 72, gx - 4 + q, gy - 66, 'woodshade');
      poly([[gx + 6, gy - 1], [gx + 6, gy - 34], [gx + 20, gy - 46], [gx + 34, gy - 34], [gx + 34, gy - 1]], 'ink'); R(gx - 10, gy - 66, gx + 50, gy - 64, 'woodlight'); });
      panel(wx0 + 42, gy - 98, wx0 + 138, gy - 80, 'ink', 'goldlight'); T('DAMASCUS', wx0 + 90, gy - 93, 'goldlight', 1, true); } }
  const gv = th === 'market' ? 'day' : th === 'beth' ? 'night' : null;
  if (gv) { drawGround(gv); if (th === 'market') drawPeople(); drawObjects(gv); } else tinted(v => { drawGround(v); drawObjects(v); });
  if (th === 'beth') { const hx = L.len + 43 - cam; if (hx > -100 && hx < 330) spr('house', hx, L.base - 71 - cy, 'dawn'); if (L.starStop) beam(L.stx, L.sty + 6, hx + 45, L.base - 57 - cy, t, Math.trunc(16 * ss(0, 1.4, t - L.starStop))); }
  drawPicks(); drawCritters();
  L.splashes = L.splashes.filter(s => t - s.t < .5); for (const s of L.splashes) spr('splash_' + Math.min(2, Math.trunc((t - s.t) * 6)), s.x - cam - 15, s.y - cy - 15);
  // sandstorm: low visibility, wind; the lanterns and the cairns show the way
  const sa = L.storm ? ss(L.storm[0] - 150, L.storm[0], C.x) * (1 - ss(L.storm[1], L.storm[1] + 150, C.x)) : 0;
  if (sa > 0) {
    const lx = C.x - cam + 40, ly = C.y - cy - 34, lrad = 76 + 4 * Math.sin(t * 9), lr2 = lrad ** 2;
    const img = VEIL.img; const d = img.data; d.fill(0); const cov = sa * .62; const sh = Math.trunc(t * 40) % 4, t30 = Math.trunc(t * 30);
    const A = RGB.wood, B = RGB.woodlight;
    for (let y = 0; y < 148; y++) { const yy = y + 19; const by = BAY[yy & 3]; const dy2 = (yy - ly) ** 2; for (let x = 0; x < W; x++) { const near = (x - lx) ** 2 * .5 + dy2; let c = cov; if (near < lr2) c = near < lr2 * .55 ? 0 : cov * ((near / lr2 - .55) / .45); if (by[(x + sh) & 3] >= c) continue; const band = mod(yy + Math.trunc(x * .15) + t30, 14) < 7 ? A : B; const o = (y * W + x) * 4; d[o] = band[0]; d[o + 1] = band[1]; d[o + 2] = band[2]; d[o + 3] = 255; } }
    VEIL.g.putImageData(img, 0, 0); ctx.drawImage(VEIL.c, 0, 19);
    for (let a = 0; a < 6.283; a += .025) { const qx = lx + Math.cos(a) * lrad * 1.414 * .74, qy = ly + Math.sin(a) * lrad * .74; if (qy > 20 && qy < 165 && (Math.trunc(a * 24 + t * 10) % 3)) { const c = (Math.trunc(a * 10 + t * 4) & 1) ? 'goldlight' : 'paper'; px(qx, qy, c); px(qx + 1, qy, c); } }
    for (const cx of L.cairns) { const sx = cx - cam; if (sx < -20 || sx > 330) continue; const gy = (isFinite(L.gt[Math.round(cx)]) ? L.gt[Math.round(cx)] : L.base) - cy; spr('cairn_tall', sx - 8, gy - 31, 'day'); sparkle(sx, gy - 33, Math.trunc(t * 6), 'white'); }
    for (let k = 0; k < Math.trunc(70 * sa); k++) { const x = mod(hsh(k) * 420 - t * (260 + hsh(k + 5) * 200), 380) - 30; const y = 22 + hsh(k + 11) * 140 + Math.sin(t * 3 + k) * 4; const l = 5 + Math.trunc(hsh(k + 2) * 12); line(x, y, x + l, y - 1, ['sandhi', 'paper', 'woodlight'][k % 3]); }
    SHAKE = [Math.round(Math.sin(t * 47) * 2 * sa), Math.round(Math.sin(t * 61 + 1) * 1.3 * sa)];
  } else SHAKE = [0, 0];
  drawCaravan();
  drawPops(); drawBanners();
  if (L.note && S.t - L.note.t < 5) caption(L.note.s, 'TRAVEL SCROLL', { width: 296, top: 26 });
  if (th === 'beth' && L.cap && L.cap.i >= 0) { const key = ['departed', 'went', 'stood', 'joy'][L.cap.i]; const hx = L.len + 43 - cam;
    caption(Q[key][1], Q[key][0], L.cap.i === 3 || hx < 340 ? { width: 196, x0: 8, top: 24 } : { width: 122, x0: 194, top: 68 }); }
  critHint();
  if (L.n === 1 && C.x < 900 && L.jumps < 3) hint('TAP: HOP   HOLD: BIG JUMP' + (DIF.dbl ? '   TAP AGAIN IN THE AIR' : ''));
  L.hudOff = L.arrive ? Math.trunc(24 * ss(0, 1, t - L.arrive.stopT)) : 0;
  hudPlay();
}
function drawResult() {
  const R0 = RUN.last; drawPlay(); inkfade(.55);
  panel(30, 18, 290, 164, 'navy', 'gold');
  T('LEVEL ' + LCFG[R0.lvl].n + ' COMPLETE', 160, 26, 'goldlight', 1, true); T(LCFG[R0.lvl].title, 160, 38, 'white', 1, true);
  for (let i = 0; i < 3; i++) spr(i < R0.lamps ? 'lamp_on' : 'lamp_off', 132 + i * 20, 50);
  T('TIME  ' + fmtT(R0.time), 48, 68, 'white'); T('WATER LEFT  ' + R0.water, 48, 80, 'white'); T('SCROLLS  ' + R0.scrolls + ' / 3', 180, 68, 'white'); T('FALLS  ' + R0.falls, 180, 80, 'white');
  T('SCARED OFF  ' + (R0.scared || 0) + (R0.chains ? '   CHAIN x' + R0.chains : ''), 48, 92, 'white'); if (R0.newBest) T('NEW BEST!', 236, 92, 'mintlight', 1, true);
  const f = RUN.scrolls[R0.lvl]; let y = 104;
  for (let i = 0; i < 3; i++) { const s = f[i] ? SCROLLS[R0.lvl][i] : '? (a hidden scroll is still out there)'; for (const row of wrap(s, 232)) { T(row, 48, y, f[i] ? 'paper' : 'slate'); y += 9; } spr(f[i] ? 'scroll' : 'lamp_off', 34, y - 10); y += 2; }
}
function drawLevels() {
  R(0, 0, 319, 179, 'navy'); T('CHOOSE A LEVEL   (' + DIF.name + ')', 160, 12, 'goldlight', 1, true);
  const best = SAVE.best[DIF.key] || {};
  LORDER.forEach((lv, i) => { const b = levelRowBox(i), open = i < SAVE.unlock;
    panel(b[0], b[1], b[2], b[3], open ? 'ink' : 'slate', open ? 'goldlight' : 'silver');
    T(open ? (i + 1) + '  ' + LCFG[lv].title : (i + 1) + '  LOCKED', b[0] + 8, b[1] + 5, open ? 'white' : 'silver');
    const r = best[lv]; if (r) { for (let k = 0; k < 3; k++) spr(k < r.lamps ? 'lamp_on' : 'lamp_off', b[2] - 74 + k * 11, b[1] + 2); T(fmtT(r.time), b[2] - 34, b[1] + 5, 'silver'); } });
  T('TAP A LEVEL TO PLAY   TAP HERE TO GO BACK', 160, 168, 'goldlight', 1, true);
}

// ======================= portrait phone menus (FIX-V3-2 M1) =======================
// In portrait the 320x180 game is a thin strip. Title, About, level select, result cards and the pause
// menu are redrawn below it as large pixel text (cap height >= 14 CSS px) with tall buttons (>= 46 CSS px).
// The landscape layout is untouched.
const PUI = { aboutPage: 0 };
function portraitUI(g, s) {
  const m = S.mode, dpr = LAY.dpr;
  const want = m === 'title' || m === 'about' || m === 'levels' || m === 'result' || (PLAY.has(m) && S.paused);
  if (!want || S.next) return false;
  const W2 = view.width, top = LAY.oy + H * s + 12 * dpr, bot = view.height - 14 * dpr;
  const ts = Math.ceil(15 / 7 * dpr), lh = 12 * ts, pad = 14 * dpr, BH = 50 * dpr;   // ~15 CSS px caps, 50 CSS px buttons
  LAY.puiTextCss = 7 * ts / dpr;
  const charW = 6 * ts, cols = Math.floor((W2 - 2 * pad) / charW);
  const text = (str, x, y, col = 'white', center = false, k = ts) => { const im = textImg(str, col, 1); g.drawImage(im, Math.round(center ? x - im.width * k / 2 : x), Math.round(y), im.width * k, im.height * k); };
  const box = (x0, y0, x1, y1, fill, edge) => { g.fillStyle = COL[edge]; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = COL[fill]; g.fillRect(x0 + 2 * dpr, y0 + 2 * dpr, x1 - x0 - 4 * dpr, y1 - y0 - 4 * dpr); };
  const button = (label, x0, y0, x1, y1, act, on = false, col = 'white') => { box(x0, y0, x1, y1, on ? 'deepteal' : 'navy', on ? 'mint' : 'goldlight'); text(label, (x0 + x1) / 2, (y0 + y1) / 2 - 3.5 * ts, col, true); LAY.pui.push({ x0, y0, x1, y1, act, label }); };
  g.fillStyle = COL.ink; g.fillRect(0, top - 4 * dpr, W2, view.height - top + 4 * dpr);
  let y = top;
  if (m === 'title') {
    const third = (W2 - 2 * pad - 2 * 8 * dpr) / 3;
    ['easy', 'normal', 'wise'].forEach((k, i) => { const x0 = pad + i * (third + 8 * dpr); button(DIFFS[k].name, x0, y, x0 + third, y + BH, () => setDiff(k), DIF.key === k, DIF.key === k ? DIFFS[k].col : 'white'); });
    y += BH + 10 * dpr;
    const tip = { easy: 'SLOWER, DOUBLE HOP, LOTS OF WATER', normal: 'DOUBLE HOP, LESS WATER', wise: 'FAST, NO DOUBLE HOP, ONE CAMP' }[DIF.key];
    for (const row of wrap(tip, cols * 6)) { text(row, W2 / 2, y, DIF.col, true); y += lh; }
    y += 10 * dpr;
    button('PLAY', pad, y, W2 - pad, y + BH * 1.2, () => { Snd.start(); newRun(); go('eastclip'); }, false, 'goldlight'); y += BH * 1.2 + 12 * dpr;
    const half = (W2 - 2 * pad - 10 * dpr) / 2;
    button('LEVELS', pad, y, pad + half, y + BH, () => go('levels')); button('ABOUT', W2 - pad - half, y, W2 - pad, y + BH, () => { PUI.aboutPage = 0; go('about'); });
    return true;
  }
  if (m === 'about') {
    const lines = []; for (const p of ABOUT) { for (const row of wrap(p, cols * 6)) lines.push(row); lines.push(''); }
    text('ABOUT THIS STORY', W2 / 2, y, 'goldlight', true); y += lh * 1.4;
    const per = Math.max(3, Math.floor((bot - BH - 16 * dpr - y) / lh)); const pages = Math.ceil(lines.length / per);
    PUI.aboutPage = clamp(PUI.aboutPage, 0, pages - 1);
    lines.slice(PUI.aboutPage * per, PUI.aboutPage * per + per).forEach((l, i) => text(l, pad, y + i * lh));
    const by = bot - BH, half = (W2 - 2 * pad - 10 * dpr) / 2;
    button('BACK', pad, by, pad + half, bot, () => go('title'));
    if (PUI.aboutPage < pages - 1) button('NEXT ' + (PUI.aboutPage + 1) + '/' + pages, W2 - pad - half, by, W2 - pad, bot, () => { PUI.aboutPage++; });
    else button('START AGAIN', W2 - pad - half, by, W2 - pad, bot, () => { PUI.aboutPage = 0; });
    return true;
  }
  if (m === 'levels') {
    text('CHOOSE A LEVEL (' + DIF.name + ')', W2 / 2, y, 'goldlight', true); y += lh * 1.3;
    const best = SAVE.best[DIF.key] || {}, rh = Math.min(BH, (bot - BH - 12 * dpr - y) / LORDER.length - 6 * dpr);
    LORDER.forEach((lv, i) => { const open = i < SAVE.unlock, r = best[lv]; const y0 = y + i * (rh + 6 * dpr);
      const label = open ? (i + 1) + ' ' + LCFG[lv].short + (r ? '  ' + r.lamps + '/3 LAMPS' : '') : (i + 1) + ' LOCKED';
      if (open) button(label, pad, y0, W2 - pad, y0 + rh, () => { newRun(); RUN.fromSelect = true; go(lv); });
      else { box(pad, y0, W2 - pad, y0 + rh, 'slate', 'silver'); text(label, W2 / 2, y0 + rh / 2 - 3.5 * ts, 'silver', true); } });
    button('BACK', pad, bot - BH, W2 - pad, bot, () => go('title'));
    return true;
  }
  if (m === 'result') {
    const R0 = RUN.last, f = RUN.scrolls[R0.lvl];
    text('LEVEL ' + LCFG[R0.lvl].n + ' COMPLETE', W2 / 2, y, 'goldlight', true); y += lh;
    text(LCFG[R0.lvl].short, W2 / 2, y, 'white', true); y += lh * 1.2;
    text('LAMPS ' + R0.lamps + ' / 3' + (R0.newBest ? '  NEW BEST!' : ''), pad, y, 'goldlight'); y += lh;
    text('TIME ' + fmtT(R0.time) + '   FALLS ' + R0.falls, pad, y); y += lh;
    text('WATER LEFT ' + R0.water + '   SCROLLS ' + R0.scrolls + '/3', pad, y); y += lh;
    text('SCARED OFF ' + (R0.scared || 0) + (R0.chains ? '   CHAIN x' + R0.chains : ''), pad, y); y += lh * 1.3;
    const k2 = Math.max(ts - 1, Math.ceil(14 / 7 * dpr)), lh2 = 12 * k2, cols2 = Math.floor((W2 - 2 * pad) / (6 * k2));
    for (let i = 0; i < 3; i++) { const str = f[i] ? SCROLLS[R0.lvl][i] : '? a hidden scroll is still out there'; for (const row of wrap(str, cols2 * 6)) { if (y + lh2 > bot - BH - 8 * dpr) break; text(row, pad, y, f[i] ? 'paper' : 'silver', false, k2); y += lh2; } y += 6 * dpr; }
    if (CRFACT[R0.lvl]) for (const row of wrap(CRFACT[R0.lvl], cols2 * 6)) { if (y + lh2 > bot - BH - 8 * dpr) break; text(row, pad, y, 'mintlight', false, k2); y += lh2; }
    button('CONTINUE', pad, bot - BH, W2 - pad, bot, () => { if (S.u > .6) go(R0.lvl === 'beth' ? 'house' : nextOf(R0.lvl)); }, false, 'goldlight');
    return true;
  }
  // paused
  text('PAUSED', W2 / 2, y, 'goldlight', true); y += lh * 1.6;
  button('RESUME', pad, y, W2 - pad, y + BH, () => setPause(false), false, 'goldlight'); y += BH + 14 * dpr;
  button('LEVELS', pad, y, W2 - pad, y + BH, () => { setPause(false); go('levels'); });
  return true;
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
  T('TAP PLAY OR PRESS SPACE TO START', 160, 69, 'white', 1, true, 'ink');

  for (const k of ['easy', 'normal', 'wise']) { const b = BTN[k], on = DIF.key === k; panel(b[0], b[1], b[2], b[3], on ? 'deepteal' : 'navy', on ? 'mint' : 'silver'); T(DIFFS[k].name, (b[0] + b[2]) / 2, b[1] + 4, on ? DIFFS[k].col : 'white', 1, true); }
  const tip = { easy: 'EASY: SLOWER, DOUBLE HOP, LOTS OF WATER', normal: 'NORMAL: DOUBLE HOP, LESS WATER', wise: 'WISE: FAST, NO DOUBLE HOP, ONE CAMP' }[DIF.key];
  R(40, 113, 280, 124, 'ink'); T(tip, 160, 115, DIF.col, 1, true);
  for (const [k, lab] of [['play', 'PLAY'], ['levels', 'LEVELS'], ['about', 'ABOUT']]) { const b = BTN[k]; panel(b[0], b[1], b[2], b[3], k === 'play' ? 'ink' : 'navy', k === 'play' ? 'goldlight' : 'silver'); T(lab, (b[0] + b[2]) / 2, b[1] + 5, k === 'play' ? 'goldlight' : 'white', 1, true); }
  for (const [x, y, ph] of [[30, 24, 0], [292, 70, 2], [22, 70, 4]]) if ((Math.trunc(t * 5) + ph) % 6 < 3) sparkle(x, y, Math.trunc(t * 5));
}
const ABOUT = [
  'This game follows Matthew 2:1-12. Scripture quotations are from the King James Version.',
  'Wise men from the east saw his star and came to Jerusalem. The chief priests and scribes answered Herod from the prophet Micah: Bethlehem. The star went before them to the young child and Mary his mother.',
  "Matthew says only 'from the east'; starting in Mesopotamia is one common view.",
  'The Bible does not say how many wise men there were, or their names. It names three gifts: gold, frankincense and myrrh.',
  'The levels show one possible caravan route; the Bible does not give the route (Euphrates, Tadmor, Damascus, the Jordan near Jericho), or say which way they went home.',
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
  banner('TADMOR (PALMYRA)', Math.min(.5, (u - .2) / 2.4));          // slides in and stays: the place is named
  if (u > 2.6) { panel(206, 50, 312, 76, 'ink', 'goldlight'); T('SUPPLIES FULL', 259, 56, 'goldlight', 1, true); T('TAP TO GO ON', 259, 66, 'white', 1, true); }
  // header and footer as in play: level and mode, water and dates, the level name
  R(0, 0, 319, 19, 'ink'); R(0, 18, 319, 19, 'gold'); T('L3', 5, 6, 'goldlight'); T(DIF.name, 20, 6, DIF.col); spr('icon_moon', 66, 4); T('MONTH 3', 80, 6, 'white');
  spr('jug', 138, 1); T(String(RUN.water).padStart(2, '0'), 153, 6, flash === 'jug' ? 'goldlight' : 'white'); spr('dates', 172, 1); T(String(RUN.dates).padStart(2, '0'), 187, 6, flash === 'dates' ? 'goldlight' : 'white');
  for (let i = 0; i < 3; i++) { const x = 255 + i * 21; R(x, 1, x + 15, 16, 'gold'); R(x + 1, 2, x + 14, 15, 'navy'); spr('gift_' + i, x + 3, 0); }
  R(0, 167, 319, 179, 'ink'); R(0, 167, 319, 167, 'gold'); T('THE SYRIAN DESERT: CAMP AT TADMOR', 5, 171, 'goldlight');
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
  drawPlay();
  inkfade(.5); panel(40, 46, 280, 122, 'navy', 'gold');
  T('REST AT CAMP', 160, 56, 'goldlight', 2, true, 'ink');
  T('The water has run out.', 160, 80, 'white', 1, true);
  T('Pick up water jugs on the way!', 160, 92, 'mist', 1, true);
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
  LAY.pui = [];
  if (LAY.portrait && portraitUI(g, s)) { /* big portrait menus drawn */ }
  else if (LAY.portrait) {
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
  else if (PLAY.has(m)) drawPlay(); else if (m === 'result') drawResult(); else if (m === 'levels') drawLevels();
  else if (m === 'camp') drawCamp(); else if (m === 'palace') drawPalace(); else if (m === 'rest') drawRest();
  else if (m === 'end') { /* drawn in present() */ }
  else drawClip();
  if (S.paused) { inkfade(.5); panel(80, 50, 240, 132, 'navy', 'gold'); T('PAUSED', 160, 60, 'goldlight', 1, true);
    for (const [b, l] of [[BTN.resume, 'RESUME'], [BTN.plevels, 'LEVELS']]) { panel(b[0], b[1], b[2], b[3], 'ink', 'goldlight'); T(l, 160, b[1] + 6, 'white', 1, true); } }
  if (canContinue()) { R(104, 166, 216, 178, 'ink'); T('TAP TO CONTINUE', 160, 168, 'goldlight', 1, true); }
  if (m !== 'end') muteIcon();
  if (S.next) inkfade(S.fade / .25);
  else if (S.u < .25 && m !== 'title' && m !== 'rest') inkfade(1 - S.u / .25);
}
function update(dt) {
  if (S.paused) return;
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
  get state() { const C = LVL && LVL.c; const st = RUN && LVL && RUN.stats[LVL.name]; return { mode: S.mode, u: CLIPOF[S.mode] ? S.cu : S.u, cont: canContinue(), t: S.t, lvl: LVL && LVL.name, x: C ? C.x : null, y: C ? C.y : null, air: C ? C.air : null, chain: C ? C.chain || 0 : 0, inv: C ? C.inv : 0, len: LVL && LVL.len,
    water: RUN && RUN.water, dates: RUN && RUN.dates, diff: DIF.key, onKind: C && !C.air ? (C.on ? C.on.kind : ['none', 'sand', 'rock', 'brick', 'street', 'crate', 'cart', 'post'][LVL.gm[Math.round(C.x)]]) : null, nearWater: !!(C && LVL.water.some(w => w.x1 > C.x - 120 && w.x0 < C.x + 160)), stats: st ? Object.assign({}, st) : null, last: RUN && RUN.last, scrolls: RUN && LVL ? RUN.scrolls[LVL.name] : null, sound: Snd.on, musicPlaying: !music.paused, dlg: DLG.step, paused: !!S.paused, pui: LAY.pui ? LAY.pui.map(b => [b.label, Math.round((b.y1 - b.y0) / LAY.dpr)]) : [], puiTextCss: LAY.puiTextCss || null, verseCssPx: LAY.verseCssPx || null, hintCssPx: LAY.hintCssPx || null }; },
  verses: () => [...shownVerses], Q, verseProblems, perf: PERF,
  jump(mode, x) { if (!RUN) newRun(); RUN.resumeX = x == null ? null : x; S.next = null; enter(mode); },
  press, release, bot: BOT, setSupplies(w, d) { RUN.water = w; RUN.dates = d; }, setDiff, levels: LORDER, gen: genLevel,
  puiBoxes: () => (LAY.pui || []).map(b => ({ label: b.label, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })), scrollText: lv => SCROLLS[lv],
  critters: () => (LVL && LVL.crits || []).map(c => { const p = crPos(c, S.t, LVL.c.x, c); return { kind: c.kind, i: c.i, x0: c.x0, x: p.x, top: p.top, bot: p.bot, w: c.w, hp: c.hp, gone: !!c.gone, dazed: c.fx != null, still: !!c.still, chain: !!c.chain, intro: c === LVL.intro }; }),
  critPlan: (lv, d) => { const L = genLevel(lv, d); return { chainS: L.chainS, crits: L.crits.map(c => ({ kind: c.kind, x0: c.x0, hp: c.hp, chain: !!c.chain, still: !!c.still, gy: c.gy })), len: L.len }; },
  people: () => (LVL && LVL.people || []).length, peopleOnScreen: () => (LVL && LVL.people || []).filter(p => p.x - LVL.cam > -10 && p.x - LVL.cam < 330).length, peopleAhead: () => (LVL && LVL.people || []).filter(p => p.x - LVL.cam > 200 && p.x - LVL.cam < 310).length,
  world: () => LVL ? { t: S.t, drainW: LVL.drainW, stones: LVL.plats.filter(p => p.kind === 'stone').map(p => p.st.sinkT), rafts: LVL.plats.filter(p => p.kind === 'raft').map(p => Math.round(raftPos(p, S.t).x0 * 10)) } : null, sim(sched, T) { const r = simRun(LVL, LVL.c, sched || [], T || 1.5, S.t); return { score: r.score, x: r.C.x, y: r.C.y, air: r.C.air }; },
};
requestAnimationFrame(frame);
Promise.all(assetList().map(([k, s]) => loadImg(k, s))).then(() => { S.mode = 'title'; S.u = 0; if (QS.get('diff')) setDiff(QS.get('diff')); const st = QS.get('start'); if (st) { newRun(); window.WM.jump(st, QS.get('x') ? parseFloat(QS.get('x')) : null); } })
  .catch(e => { console.error(e); S.mode = 'loading'; });
})();
