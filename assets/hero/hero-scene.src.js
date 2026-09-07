/*
 * AIssisted hero stage: three nodes become one.
 *
 * The logo is a constellation with one gold core. This scene tells how it forms. Three medium nodes
 * sit scattered across the stage, each with its own small cluster. They travel inward, the clusters
 * knit together edge by edge, and the three land on one point, which becomes the gold core: bigger
 * than any of them, ringed, pulsing. From then on signals leave the outer nodes and walk the graph
 * home to the core, which flares on every arrival. Work flows in; one human-owned decision sits at
 * the center.
 *
 * Variants: "home" plays the convergence from the start; "page" (subpage stages) starts already
 * merged. The poster for each variant is a frame of this scene (see .review/shoot.mjs poster), so
 * the crossfade from poster to canvas is seamless.
 *
 * Bundled with esbuild from the vendored Three.js r184 (assets/vendor, MIT) into hero-scene.min.js.
 * Loaded lazily by assets/site/site.js only when motion is allowed, Save-Data is off, WebGL exists
 * and the page has finished loading. Anything that fails leaves the static poster in place.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  HalfFloatType,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "../vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/postprocessing/OutputPass.js";

const DEG = Math.PI / 180;
const FOV = 34;
const CAMERA_Z = 10;
const AURORA_Z = -9;
const SEED = 20260906;

const INK = 0x06080f;
const PERI = 0x8a8bdd;
const PERI_DEEP = 0x5f62d6;
const GOLD = 0xe8b94e;

// The story clock. Hubs hold at HOLD_UNTIL, travel for TRAVEL seconds (staggered), then merge.
const HOLD_UNTIL = 1.4;
const TRAVEL = 3.6;
const HUB_STAGGER = 0.3;
const MERGED_AT = HOLD_UNTIL + HUB_STAGGER * 2 + TRAVEL;
const POSTER_TIME = { home: 0.8, page: 16 };
const BLOOM_BASE = 0.9;

// Where the core sits in normalized device coordinates, the group scale relative to the stage,
// how hard the copy column gets darkened, and where the three hubs start (also NDC fractions).
const LAYOUTS = {
  home: {
    desktop: { anchor: [0.46, 0.1], scale: 1, leftDark: 1, scatter: [[-0.36, 0.48], [0.86, 0.46], [0.5, -0.42]] },
    mobile: { anchor: [0.12, 0.38], scale: 0.58, leftDark: 0.15, scatter: [[-0.55, 0.84], [0.8, 0.72], [0.66, 0.02]] },
  },
  page: {
    desktop: { anchor: [0.58, 0.02], scale: 0.86, leftDark: 0.9, scatter: [[-0.36, 0.48], [0.86, 0.46], [0.5, -0.42]] },
    mobile: { anchor: [0.3, 0.3], scale: 0.55, leftDark: 0.2, scatter: [[-0.55, 0.84], [0.8, 0.72], [0.66, 0.02]] },
  },
};

const HUB_TINTS = [0xc7c6ff, 0xe6ecff, 0xf3d68a];

const AURORA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const AURORA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAspect;
  uniform float uLeftDark;
  uniform float uMerged;
  uniform vec3 uInk;
  uniform vec3 uPeri;
  uniform vec3 uGold;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float t = uTime * 0.04;
    float n1 = fbm(p * 1.1 + vec2(t * 0.6, -t * 0.4));
    float n2 = fbm(p * 1.7 - vec2(t * 0.5, t * 0.55) + 4.2);
    float n3 = fbm(p * 0.8 + vec2(-t * 0.3, t * 0.2) + 8.5);

    // A periwinkle nebula sweeps the upper right; a warm gold pool grows low once the core exists.
    float peri = smoothstep(0.44, 0.86, n1) * (0.35 + 0.65 * smoothstep(0.1, 0.9, uv.x * 0.6 + uv.y * 0.5));
    float gold = smoothstep(0.52, 0.9, n2) * smoothstep(0.2, 0.95, uv.x) * smoothstep(0.85, 0.2, uv.y);
    float haze = smoothstep(0.5, 0.95, n3) * 0.5;

    vec3 col = uInk;
    col += uPeri * (peri * 0.44 + haze * 0.14);
    col += uGold * gold * (0.12 + 0.24 * uMerged);

    // Keep the copy column deep for contrast.
    col *= mix(1.0, 0.35, uLeftDark * smoothstep(0.62, 0.02, uv.x));
    float vig = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(1.1, 1.5)));
    col *= 0.55 + 0.45 * vig;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Nodes and signals: soft-haloed points. The pointer lifts whatever it passes over.
const NODE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uMaxSize;
  uniform float uFocus;
  uniform float uLeftDark;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float near = distance(ndc * vec2(uAspect, 1.0), uPointer * vec2(uAspect, 1.0));
    float lift = smoothstep(0.55, 0.0, near) * uPointerStrength;
    gl_PointSize = min(uMaxSize, aSize * uScale / max(dist, 0.5)) * (1.0 + 0.55 * lift);
    float twinkle = 0.78 + 0.22 * sin(uTime * 1.1 + aPhase * 19.0);
    float depth = mix(1.0, 0.42, smoothstep(uFocus - 1.5, uFocus + 4.5, dist));
    float sx = ndc.x * 0.5 + 0.5;
    vAlpha = twinkle * depth * mix(1.0, 0.3, uLeftDark * smoothstep(0.6, 0.05, sx)) * (1.0 + 1.3 * lift);
    vColor = aColor;
  }
`;

const NODE_FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float halo = pow(1.0 - r, 2.4);
    float core = 1.0 - smoothstep(0.0, 0.3, r);
    vec3 col = vColor * (halo * 0.85 + core * 1.5);
    gl_FragColor = vec4(col, (halo * 0.9 + core) * vAlpha * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const LINE_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aLink;
  uniform float uTime;
  uniform float uFocus;
  uniform float uLeftDark;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float near = distance(ndc * vec2(uAspect, 1.0), uPointer * vec2(uAspect, 1.0));
    float lift = smoothstep(0.55, 0.0, near) * uPointerStrength;
    float pulse = 0.6 + 0.4 * sin(uTime * 0.45 + aPhase * 6.2831);
    float depth = mix(1.0, 0.3, smoothstep(uFocus - 1.5, uFocus + 4.5, dist));
    float sx = ndc.x * 0.5 + 0.5;
    vAlpha = aLink * pulse * depth * mix(1.0, 0.3, uLeftDark * smoothstep(0.6, 0.05, sx)) * (1.0 + 1.6 * lift);
    vColor = aColor;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha * uAlpha);
    #include <colorspace_fragment>
  }
`;

// The corona: a soft glow with slow rays, drawn on a camera-facing plane over the core.
const CORONA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORONA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);
    float glow = pow(1.0 - r, 3.2);
    float rays = pow(abs(sin(ang * 7.0 + uTime * 0.32)), 16.0) * pow(1.0 - r, 1.8) * 0.5
      + pow(abs(sin(ang * 3.0 - uTime * 0.21 + 1.3)), 24.0) * pow(1.0 - r, 1.3) * 0.32;
    float a = (glow * 1.5 + rays) * uPower;
    gl_FragColor = vec4(uColor * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Deterministic PRNG (mulberry32) so the live scene starts where the poster was rendered.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-6);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Node cloud: three lobes around the core, more density near the center, the whole thing wider than
// it is tall so it fills a landscape stage. Each node belongs to the lobe whose sector it sits in;
// that lobe is the cluster it arrives with.
function buildGraph(count, rand) {
  const centers = [
    [0, 0, 0, 0.24, 1.7],
    [-3.1, 1.3, -0.7, 0.14, 1.1],
    [3.0, -1.1, 0.5, 0.14, 1.1],
    [-1.8, -1.8, 1.1, 0.11, 0.9],
    [3.6, 1.7, -1.0, 0.11, 0.9],
    [-4.8, -0.5, 0.3, 0.09, 0.8],
    [5.1, 0.3, 0.8, 0.09, 0.8],
    [0.6, 2.6, -1.4, 0.08, 0.8],
  ];
  const nodes = [{ x: 0, y: 0, z: 0, core: true, lobe: -1 }];
  while (nodes.length < count) {
    let roll = rand();
    let c = centers[0];
    for (const center of centers) {
      roll -= center[3];
      if (roll <= 0) {
        c = center;
        break;
      }
    }
    const spread = c[4];
    const node = {
      x: c[0] + gaussian(rand) * spread * 1.25,
      y: c[1] + gaussian(rand) * spread * 0.7,
      z: c[2] + gaussian(rand) * spread * 0.75,
      core: false,
      lobe: 0,
    };
    if (Math.abs(node.x) > 7.2 || Math.abs(node.y) > 3.6 || Math.abs(node.z) > 3.2) continue;
    const dCore = Math.hypot(node.x, node.y, node.z);
    if (dCore < 0.55) continue;
    // Sector around the core: three lobes of 120 degrees, rotated so none splits the copy column.
    const angle = Math.atan2(node.y, node.x) + Math.PI * 0.62;
    node.lobe = ((Math.floor((angle / (Math.PI * 2)) * 3) % 3) + 3) % 3;
    nodes.push(node);
  }

  const n = nodes.length;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const adjacency = Array.from({ length: n }, () => new Set());
  const link = (a, b) => {
    if (a === b) return;
    adjacency[a].add(b);
    adjacency[b].add(a);
  };
  // k nearest neighbours within reach.
  for (let i = 0; i < n; i += 1) {
    const order = [];
    for (let j = 0; j < n; j += 1) if (j !== i) order.push([dist(nodes[i], nodes[j]), j]);
    order.sort((p, q) => p[0] - q[0]);
    const k = nodes[i].core ? 7 : 2 + (rand() < 0.45 ? 1 : 0);
    let added = 0;
    for (const [d, j] of order) {
      if (added >= k) break;
      if (!nodes[i].core && d > 2.3) break;
      link(i, j);
      added += 1;
    }
  }
  // Make every node reachable from the core so signals always have a road home.
  const nextHop = new Int32Array(n).fill(-1);
  const bfs = () => {
    nextHop.fill(-1);
    nextHop[0] = 0;
    const queue = [0];
    while (queue.length) {
      const a = queue.shift();
      for (const b of adjacency[a]) {
        if (nextHop[b] === -1) {
          nextHop[b] = a;
          queue.push(b);
        }
      }
    }
  };
  bfs();
  for (let pass = 0; pass < 8; pass += 1) {
    let fixed = false;
    for (let i = 1; i < n; i += 1) {
      if (nextHop[i] !== -1) continue;
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < n; j += 1) {
        if (nextHop[j] === -1) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best !== -1) {
        link(i, best);
        fixed = true;
      }
    }
    if (!fixed) break;
    bfs();
  }
  const edges = [];
  for (let a = 0; a < n; a += 1) for (const b of adjacency[a]) if (a < b) edges.push([a, b]);

  // Lobe centroids: the point each cluster is carried from during the convergence.
  const lobes = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  for (const node of nodes) {
    if (node.core) continue;
    const l = lobes[node.lobe];
    l.x += node.x;
    l.y += node.y;
    l.z += node.z;
    l.n += 1;
  }
  for (const l of lobes) {
    if (!l.n) continue;
    l.x /= l.n;
    l.y /= l.n;
    l.z /= l.n;
  }
  return { nodes, edges, adjacency, nextHop, lobes };
}

function buildNodeGeometry(nodes, rand) {
  const n = nodes.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);
  const tint = new Color();
  const white = new Color(0xe9e8ff);
  const peri = new Color(PERI);
  const gold = new Color(GOLD);
  for (let i = 0; i < n; i += 1) {
    const node = nodes[i];
    positions[i * 3] = node.x;
    positions[i * 3 + 1] = node.y;
    positions[i * 3 + 2] = node.z;
    const roll = rand();
    if (node.core) {
      tint.copy(gold).multiplyScalar(2.6);
      sizes[i] = 0;
      node.size = 2.3;
    } else if (roll < 0.075) {
      tint.copy(gold).multiplyScalar(1.9);
      sizes[i] = 0.34 + rand() * 0.16;
      node.gold = true;
    } else if (roll < 0.5) {
      tint.copy(white).multiplyScalar(1.5);
      sizes[i] = 0.16 + rand() * 0.14;
    } else {
      tint.copy(peri).multiplyScalar(1.45);
      sizes[i] = 0.13 + rand() * 0.12;
    }
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
    phases[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  return geometry;
}

function buildEdgeGeometry(nodes, edges, rand) {
  const positions = new Float32Array(edges.length * 6);
  const colors = new Float32Array(edges.length * 6);
  const phases = new Float32Array(edges.length * 2);
  const links = new Float32Array(edges.length * 2);
  const peri = new Color(PERI_DEEP);
  const gold = new Color(GOLD);
  const tint = new Color();
  edges.forEach(([a, b], i) => {
    const na = nodes[a];
    const nb = nodes[b];
    positions.set([na.x, na.y, na.z, nb.x, nb.y, nb.z], i * 6);
    const toCore = na.core || nb.core;
    tint.copy(toCore ? gold : peri).multiplyScalar(toCore ? 0.95 : 0.66);
    colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], i * 6);
    const phase = rand();
    phases[i * 2] = phase;
    phases[i * 2 + 1] = phase;
    // Edges inside one lobe exist from the start; bridges between lobes and to the core are knit
    // during the convergence (see stepStory).
    const bridge = toCore || na.lobe !== nb.lobe;
    links[i * 2] = bridge ? 0 : 1;
    links[i * 2 + 1] = bridge ? 0 : 1;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aLink", new BufferAttribute(links, 1));
  return geometry;
}

// Background sparkle: a distant field so the constellation has depth behind it.
function buildDust(count, rand) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tint = new Color();
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rand() * 2 - 1) * 14;
    positions[i * 3 + 1] = (rand() * 2 - 1) * 7;
    positions[i * 3 + 2] = -3 - rand() * 5;
    tint.set(rand() < 0.2 ? GOLD : 0xc9c8ff).multiplyScalar(0.55 + rand() * 0.4);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
    sizes[i] = 0.05 + rand() * 0.07;
    phases[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  return geometry;
}

function makePointMaterial(alpha) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 300 },
      uMaxSize: { value: 160 },
      uFocus: { value: CAMERA_Z },
      uAlpha: { value: alpha },
      uLeftDark: { value: 1 },
      uAspect: { value: 1 },
      uPointer: { value: new Vector2(9, 9) },
      uPointerStrength: { value: 0 },
    },
    vertexShader: NODE_VERTEX,
    fragmentShader: NODE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
}

function makeRing(inner, outer, color, opacity) {
  const material = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: AdditiveBlending, side: DoubleSide });
  const mesh = new Mesh(new RingGeometry(inner, outer, 128), material);
  mesh.frustumCulled = false;
  return mesh;
}

export function mountHeroScene(host) {
  if (!host || host.dataset.heroMounted) return null;

  const variant = host.dataset.heroVariant === "page" ? "page" : "home";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const lite = coarse || (navigator.hardwareConcurrency || 8) <= 4;
  const maxPixelRatio = lite ? 1.25 : 1.5;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-hero-canvas", "");
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: lite ? "default" : "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(INK, 1);

  const rand = makeRandom(SEED);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 60);
  camera.position.set(0, 0, CAMERA_Z);

  const auroraMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uLeftDark: { value: 1 },
      uMerged: { value: 0 },
      uInk: { value: new Color(INK) },
      uPeri: { value: new Color(PERI_DEEP) },
      uGold: { value: new Color(0xc8952d) },
    },
    vertexShader: AURORA_VERTEX,
    fragmentShader: AURORA_FRAGMENT,
    depthWrite: false,
  });
  const aurora = new Mesh(new PlaneGeometry(1, 1), auroraMaterial);
  aurora.position.z = AURORA_Z;
  aurora.frustumCulled = false;
  scene.add(aurora);

  const dustMaterial = makePointMaterial(0.55);
  const dust = new Points(buildDust(lite ? 260 : 620, rand), dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  const graph = buildGraph(lite ? 104 : 176, rand);
  const group = new Group();
  scene.add(group);

  const edgeMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFocus: { value: CAMERA_Z },
      uAlpha: { value: lite ? 0.55 : 0.46 },
      uLeftDark: { value: 1 },
      uAspect: { value: 1 },
      uPointer: { value: new Vector2(9, 9) },
      uPointerStrength: { value: 0 },
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const edgeGeometry = buildEdgeGeometry(graph.nodes, graph.edges, rand);
  const edges = new LineSegments(edgeGeometry, edgeMaterial);
  edges.frustumCulled = false;
  group.add(edges);

  const nodeMaterial = makePointMaterial(1);
  const nodeGeometry = buildNodeGeometry(graph.nodes, rand);
  const nodes = new Points(nodeGeometry, nodeMaterial);
  nodes.frustumCulled = false;
  group.add(nodes);

  // The core: corona, two orbit rings, and a solid gold sphere under the big glowing point.
  const coronaMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uColor: { value: new Color(GOLD).multiplyScalar(lite ? 1.1 : 1.4) } },
    vertexShader: CORONA_VERTEX,
    fragmentShader: CORONA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const corona = new Mesh(new PlaneGeometry(3.2, 3.2), coronaMaterial);
  corona.frustumCulled = false;
  group.add(corona);

  const orbitA = makeRing(1.02, 1.035, 0xf2d27a, 0);
  const orbitB = makeRing(1.42, 1.432, 0xa9a8ff, 0);
  orbitA.rotation.set(1.15, 0.2, 0);
  orbitB.rotation.set(-0.9, 0.5, 0.3);
  group.add(orbitA, orbitB);

  const coreMaterial = new MeshBasicMaterial({ color: new Color(GOLD).multiplyScalar(lite ? 1.35 : 2.3) });
  const core = new Mesh(new SphereGeometry(0.22, 40, 28), coreMaterial);
  core.scale.setScalar(0.0001);
  group.add(core);

  // Shockwaves: one ring per arrival, expanding and fading.
  const waves = [0, 1, 2].map((i) => {
    const ring = makeRing(0.9, 1, i === 2 ? 0xf3d68a : 0xd9d8ff, 0);
    ring.scale.setScalar(0.0001);
    group.add(ring);
    return { ring, t: -1 };
  });

  // The three hubs: medium spheres with a glow point each, carried from their scatter positions.
  const hubs = [0, 1, 2].map((i) => {
    const tint = new Color(HUB_TINTS[i]);
    const mesh = new Mesh(new SphereGeometry(0.13, 32, 20), new MeshBasicMaterial({ color: tint.clone().multiplyScalar(lite ? 1.25 : 2.1) }));
    group.add(mesh);
    return { mesh, tint, start: new Vector3(), arrived: false };
  });
  const hubGlowPositions = new Float32Array(9);
  const hubGlowColors = new Float32Array(9);
  const hubGlowSizes = new Float32Array(3);
  const hubGlowPhases = new Float32Array([0.1, 0.5, 0.9]);
  hubs.forEach((hub, i) => {
    const c = hub.tint.clone().multiplyScalar(2.4);
    hubGlowColors.set([c.r, c.g, c.b], i * 3);
    hubGlowSizes[i] = 1.5;
  });
  const hubGlowGeometry = new BufferGeometry();
  hubGlowGeometry.setAttribute("position", new BufferAttribute(hubGlowPositions, 3));
  hubGlowGeometry.setAttribute("aColor", new BufferAttribute(hubGlowColors, 3));
  hubGlowGeometry.setAttribute("aSize", new BufferAttribute(hubGlowSizes, 1));
  hubGlowGeometry.setAttribute("aPhase", new BufferAttribute(hubGlowPhases, 1));
  const hubGlowMaterial = makePointMaterial(1);
  const hubGlow = new Points(hubGlowGeometry, hubGlowMaterial);
  hubGlow.frustumCulled = false;
  group.add(hubGlow);

  // Signals: bright travellers that walk the graph toward the core once it exists.
  const SIGNALS = lite ? 6 : 12;
  const signalPositions = new Float32Array(SIGNALS * 3);
  const signalColors = new Float32Array(SIGNALS * 3);
  const signalSizes = new Float32Array(SIGNALS);
  const signalPhases = new Float32Array(SIGNALS);
  const signalGeometry = new BufferGeometry();
  signalGeometry.setAttribute("position", new BufferAttribute(signalPositions, 3));
  signalGeometry.setAttribute("aColor", new BufferAttribute(signalColors, 3));
  signalGeometry.setAttribute("aSize", new BufferAttribute(signalSizes, 1));
  signalGeometry.setAttribute("aPhase", new BufferAttribute(signalPhases, 1));
  const signalMaterial = makePointMaterial(1);
  const signals = new Points(signalGeometry, signalMaterial);
  signals.frustumCulled = false;
  group.add(signals);

  const signalState = [];
  const outer = graph.nodes.map((node, i) => i).filter((i) => i > 0 && Math.hypot(graph.nodes[i].x, graph.nodes[i].y, graph.nodes[i].z) > 2.4);
  const spawnAt = (i, wait) => {
    const start = outer[Math.floor(rand() * outer.length)] || 1;
    signalState[i] = { from: start, to: graph.nextHop[start], t: 0, speed: 0.9 + rand() * 0.6, wait };
    const tint = new Color(rand() < 0.35 ? GOLD : 0xffffff).multiplyScalar(2.4);
    signalColors.set([tint.r, tint.g, tint.b], i * 3);
    signalSizes[i] = 0;
    signalPhases[i] = rand();
    signalPositions.set([graph.nodes[start].x, graph.nodes[start].y, graph.nodes[start].z], i * 3);
  };
  for (let i = 0; i < SIGNALS; i += 1) spawnAt(i, rand() * 4);
  let corePulse = 0;
  let bloomSpike = 0;

  const a = new Vector3();
  const b = new Vector3();
  function stepSignals(dt, merged) {
    for (let i = 0; i < SIGNALS; i += 1) {
      const s = signalState[i];
      if (!merged || s.wait > 0) {
        if (merged) s.wait -= dt;
        signalSizes[i] = 0;
        continue;
      }
      const from = graph.nodes[s.from];
      const to = graph.nodes[s.to];
      a.set(from.x, from.y, from.z);
      b.set(to.x, to.y, to.z);
      const length = Math.max(a.distanceTo(b), 0.05);
      s.t += (dt * s.speed) / length;
      if (s.t >= 1) {
        if (s.to === 0) {
          corePulse = 1;
          spawnAt(i, 0.8 + rand() * 3.2);
          continue;
        }
        s.from = s.to;
        s.to = graph.nextHop[s.to];
        s.t = 0;
      }
      a.lerp(b, Math.min(s.t, 1));
      signalPositions.set([a.x, a.y, a.z], i * 3);
      // Grow as the signal nears the core so arrivals feel like a landing.
      const near = s.to === 0 ? s.t : 0;
      signalSizes[i] = 0.26 + near * 0.32;
    }
    signalGeometry.attributes.position.needsUpdate = true;
    signalGeometry.attributes.aSize.needsUpdate = true;
    signalGeometry.attributes.aColor.needsUpdate = true;
  }

  // The story: hub progress, node positions, bridge links, core birth, waves.
  const nodePositions = nodeGeometry.attributes.position.array;
  const nodeSizes = nodeGeometry.attributes.aSize.array;
  const edgePositions = edgeGeometry.attributes.position.array;
  const edgeLinks = edgeGeometry.attributes.aLink.array;
  const progress = [0, 0, 0];
  let storyDone = false;
  let lastStoryT = -1;

  function hubProgress(t, i) {
    const start = HOLD_UNTIL + i * HUB_STAGGER;
    return easeInOut(clamp01((t - start) / TRAVEL));
  }

  function stepStory(t, dt) {
    const merged = t >= MERGED_AT;
    if (storyDone && merged) return 1;
    for (let i = 0; i < 3; i += 1) progress[i] = hubProgress(t, i);

    // Nodes: carried from the scattered cluster to their constellation position.
    const n = graph.nodes.length;
    for (let i = 1; i < n; i += 1) {
      const node = graph.nodes[i];
      const hub = hubs[node.lobe];
      const lobe = graph.lobes[node.lobe];
      const e = progress[node.lobe];
      const sx = hub.start.x + (node.x - lobe.x) * 0.62;
      const sy = hub.start.y + (node.y - lobe.y) * 0.62;
      const sz = hub.start.z + (node.z - lobe.z) * 0.62;
      nodePositions[i * 3] = sx + (node.x - sx) * e;
      nodePositions[i * 3 + 1] = sy + (node.y - sy) * e;
      nodePositions[i * 3 + 2] = sz + (node.z - sz) * e;
    }
    nodeGeometry.attributes.position.needsUpdate = true;

    // Edges follow their nodes; bridges knit in as both ends come home.
    graph.edges.forEach(([p, q], i) => {
      edgePositions[i * 6] = nodePositions[p * 3];
      edgePositions[i * 6 + 1] = nodePositions[p * 3 + 1];
      edgePositions[i * 6 + 2] = nodePositions[p * 3 + 2];
      edgePositions[i * 6 + 3] = nodePositions[q * 3];
      edgePositions[i * 6 + 4] = nodePositions[q * 3 + 1];
      edgePositions[i * 6 + 5] = nodePositions[q * 3 + 2];
      const np = graph.nodes[p];
      const nq = graph.nodes[q];
      if (np.core || nq.core || np.lobe !== nq.lobe) {
        const ep = np.core ? 1 : progress[np.lobe];
        const eq = nq.core ? 1 : progress[nq.lobe];
        const link = smooth(0.72, 1, Math.min(ep, eq));
        edgeLinks[i * 2] = link;
        edgeLinks[i * 2 + 1] = link;
      }
    });
    edgeGeometry.attributes.position.needsUpdate = true;
    edgeGeometry.attributes.aLink.needsUpdate = true;

    // Hubs travel to the core along a slight arc, then vanish into it. Each arrival is an event.
    let birth = 0;
    hubs.forEach((hub, i) => {
      const e = progress[i];
      const arc = Math.sin(e * Math.PI) * 0.6 * (i === 1 ? -1 : 1);
      const x = hub.start.x * (1 - e);
      const y = hub.start.y * (1 - e) + arc;
      const z = hub.start.z * (1 - e);
      hub.mesh.position.set(x, y, z);
      const shrink = 1 - smooth(0.9, 1, e);
      hub.mesh.scale.setScalar(Math.max(0.0001, shrink));
      hubGlowPositions.set([x, y, z], i * 3);
      hubGlowSizes[i] = 1.5 * shrink;
      const landed = smooth(0.94, 1, e);
      birth += landed / 3;
      if (!hub.arrived && e >= 0.97) {
        hub.arrived = true;
        corePulse = 1;
        bloomSpike = 1;
        waves[i].t = 0;
      }
    });
    hubGlowGeometry.attributes.position.needsUpdate = true;
    hubGlowGeometry.attributes.aSize.needsUpdate = true;
    nodeSizes[0] = graph.nodes[0].size * birth;
    nodeGeometry.attributes.aSize.needsUpdate = true;

    if (merged) storyDone = true;
    return birth;
  }

  // Post: bloom on capable devices; the lite tier renders straight to the canvas.
  let composer = null;
  let bloomPass = null;
  if (!lite) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new Vector2(1, 1), BLOOM_BASE, 0.78, 0.5);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  // State.
  let time = POSTER_TIME[variant];
  let last = 0;
  let lastDraw = 0;
  let raf = 0;
  let visible = true;
  let disposed = false;
  let pointerX = 9;
  let pointerY = 9;
  let smoothX = 9;
  let smoothY = 9;
  let pointerIn = 0;
  let layout = LAYOUTS[variant].desktop;

  function step(t, dt) {
    auroraMaterial.uniforms.uTime.value = t;
    coronaMaterial.uniforms.uTime.value = t;
    for (const material of [nodeMaterial, edgeMaterial, dustMaterial, signalMaterial, hubGlowMaterial]) material.uniforms.uTime.value = t;

    const ease = Math.min(1, dt * 2.6);
    smoothX += (pointerX - smoothX) * ease;
    smoothY += (pointerY - smoothY) * ease;
    const strength = finePointer ? pointerIn : 0;
    for (const material of [nodeMaterial, edgeMaterial, signalMaterial]) {
      material.uniforms.uPointer.value.set(smoothX, -smoothY);
      material.uniforms.uPointerStrength.value = strength;
    }
    const tiltX = finePointer ? smoothX * pointerIn : 0;
    const tiltY = finePointer ? smoothY * pointerIn : 0;

    const birth = stepStory(t, dt);
    const merged = t >= MERGED_AT;
    auroraMaterial.uniforms.uMerged.value = birth;

    group.rotation.y = t * 0.03 + tiltX * 0.16;
    group.rotation.x = Math.sin(t * 0.09) * 0.08 - tiltY * 0.1;
    group.rotation.z = Math.sin(t * 0.05) * 0.04;

    stepSignals(dt, merged);
    corePulse = Math.max(0, corePulse - dt * 1.6);
    bloomSpike = Math.max(0, bloomSpike - dt * 1.4);
    const pulse = birth * (1 + Math.sin(t * 1.3) * 0.05 + corePulse * 0.5);
    core.scale.setScalar(Math.max(0.0001, pulse));
    coronaMaterial.uniforms.uPower.value = birth * (0.8 + corePulse * 0.9 + Math.sin(t * 0.9) * 0.08);
    corona.rotation.z = t * 0.02;
    orbitA.material.opacity = 0.26 * birth;
    orbitB.material.opacity = 0.16 * birth;
    orbitA.rotation.y = t * 0.22;
    orbitB.rotation.x = -0.9 + Math.sin(t * 0.17) * 0.25;
    orbitB.rotation.z = t * 0.12;
    for (const wave of waves) {
      if (wave.t < 0) continue;
      wave.t += dt;
      const w = wave.t / 1.4;
      if (w >= 1) {
        wave.t = -1;
        wave.ring.material.opacity = 0;
        continue;
      }
      wave.ring.scale.setScalar(0.15 + Math.pow(w, 0.6) * 5.2);
      wave.ring.material.opacity = (1 - w) * (1 - w) * 0.9;
    }
    if (bloomPass) bloomPass.strength = BLOOM_BASE + bloomSpike * 0.9;

    camera.position.x = Math.sin(t * 0.06) * 0.25;
    camera.position.y = Math.cos(t * 0.045) * 0.15;
    camera.position.z = CAMERA_Z + Math.sin(t * 0.035) * 0.3;
    camera.lookAt(group.position.x * 0.3, group.position.y * 0.3, 0);
  }

  function draw() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function frame(now) {
    raf = 0;
    if (disposed) return;
    if (lite && now - lastDraw < 31) {
      raf = window.requestAnimationFrame(frame);
      return;
    }
    // RAF timestamps can trail performance.now(); never let the story run backwards.
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    lastDraw = now;
    time += dt;
    step(time, dt);
    draw();
    raf = window.requestAnimationFrame(frame);
  }

  function sync() {
    const wanted = visible && !document.hidden && !disposed;
    if (wanted && !raf) {
      last = performance.now();
      raf = window.requestAnimationFrame(frame);
    } else if (!wanted && raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function applySize(width, height, pixelRatio) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    }
    layout = LAYOUTS[variant][width < 760 ? "mobile" : "desktop"];
    const halfH = Math.tan((FOV / 2) * DEG) * CAMERA_Z;
    const halfW = halfH * camera.aspect;
    group.position.set(layout.anchor[0] * halfW, layout.anchor[1] * halfH, 0);
    group.scale.setScalar(layout.scale);
    // Scatter positions are stage fractions; convert to group space so hubs start where the eye
    // expects them regardless of aspect.
    hubs.forEach((hub, i) => {
      const [fx, fy] = layout.scatter[i];
      hub.start.set(
        (fx * halfW - group.position.x) / layout.scale,
        (fy * halfH - group.position.y) / layout.scale,
        [-0.5, 0.35, 0.7][i],
      );
    });
    storyDone = false;
    const auroraHeight = 2 * (CAMERA_Z - AURORA_Z) * Math.tan((FOV / 2) * DEG) * 1.3;
    aurora.scale.set(auroraHeight * camera.aspect, auroraHeight, 1);
    auroraMaterial.uniforms.uAspect.value = camera.aspect;
    auroraMaterial.uniforms.uLeftDark.value = layout.leftDark;
    const pointScale = height * pixelRatio * 0.6 * layout.scale;
    for (const material of [nodeMaterial, signalMaterial, hubGlowMaterial]) {
      material.uniforms.uScale.value = pointScale;
      material.uniforms.uMaxSize.value = 220 * pixelRatio;
      material.uniforms.uLeftDark.value = layout.leftDark;
      material.uniforms.uAspect.value = camera.aspect;
    }
    dustMaterial.uniforms.uScale.value = height * pixelRatio * 0.6;
    dustMaterial.uniforms.uMaxSize.value = 40 * pixelRatio;
    dustMaterial.uniforms.uLeftDark.value = layout.leftDark;
    dustMaterial.uniforms.uAspect.value = camera.aspect;
    edgeMaterial.uniforms.uLeftDark.value = layout.leftDark;
    edgeMaterial.uniforms.uAspect.value = camera.aspect;
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    applySize(width, height, Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    if (!raf) {
      step(time, 0);
      draw();
    }
  }

  // Poster rendering hook (used by .review/shoot.mjs poster): render one frame at a fixed CSS size,
  // pixel ratio and story time, return it as a data URL, then restore the live state.
  function snapshot(width, height, at = POSTER_TIME[variant], quality = 0.82, pixelRatio = 1) {
    const liveW = Math.max(1, host.clientWidth);
    const liveH = Math.max(1, host.clientHeight);
    const livePr = renderer.getPixelRatio();
    const wasIn = pointerIn;
    pointerIn = 0;
    applySize(width, height, pixelRatio);
    hubs.forEach((hub) => { hub.arrived = at >= MERGED_AT; });
    for (let i = 0; i < 40; i += 1) step(Math.max(0, at - 1) + i * 0.025, 0.025);
    corePulse = 0;
    bloomSpike = 0;
    step(at, 0);
    draw();
    const url = canvas.toDataURL("image/webp", quality);
    pointerIn = wasIn;
    applySize(liveW, liveH, livePr);
    hubs.forEach((hub) => { hub.arrived = time >= MERGED_AT; });
    step(time, 0);
    draw();
    return url;
  }

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    }, { threshold: 0 })
    : null;
  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(resize) : null;

  const onVisibility = () => sync();
  const onPointer = (event) => {
    const rect = host.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointerIn = 1;
  };
  const onPointerLeave = () => { pointerIn = 0; };
  const onContextLost = (event) => {
    event.preventDefault();
    host.classList.remove("is-ready");
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const onContextRestored = () => {
    host.classList.add("is-ready");
    sync();
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    observer?.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("pagehide", dispose);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    host.classList.remove("is-ready");
    delete host.dataset.heroMounted;
    delete host.heroScene;
    scene.traverse((node) => {
      node.geometry?.dispose();
      if (node.material && node !== aurora) node.material.dispose?.();
    });
    auroraMaterial.dispose();
    bloomPass?.dispose();
    composer?.renderTarget1.dispose();
    composer?.renderTarget2.dispose();
    renderer.dispose();
    canvas.remove();
  }

  host.appendChild(canvas);
  host.dataset.heroMounted = "1";
  resize();
  if (variant === "page") {
    hubs.forEach((hub) => { hub.arrived = true; });
    // Warm the signals so the first frame already has travellers in flight.
    for (let i = 0; i < 120; i += 1) step(time - 3 + i * 0.025, 0.025);
  }
  step(time, 0);
  draw();
  host.classList.add("is-ready");

  observer?.observe(host);
  resizeObserver?.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  if (finePointer) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
  }
  window.addEventListener("pagehide", dispose, { once: true });
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  sync();

  const controller = { snapshot, dispose, resize, lite, variant, bloom: Boolean(bloomPass), mergedAt: MERGED_AT, get time() { return time; }, get running() { return raf !== 0; } };
  host.heroScene = controller;
  return controller;
}
