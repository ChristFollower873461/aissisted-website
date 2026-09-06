/*
 * AIssisted hero stage: the constellation.
 *
 * The logo is a constellation: nodes, the lines between them, and one gold "AI" core. This scene
 * is that mark alive in three dimensions. ~160 nodes drift in a slow orbit, joined by faint
 * periwinkle edges. Bright signals leave the outer nodes and travel edge by edge toward the gold
 * core, which pulses on every arrival: work flows in, a human-owned decision sits at the center.
 *
 * Bundled with esbuild from the vendored Three.js r184 (assets/vendor, MIT) into hero-scene.min.js.
 * Loaded lazily by assets/site/home.js only when motion is allowed, Save-Data is off, WebGL exists
 * and the page has finished loading. Anything that fails leaves the static poster in place; the
 * poster is rendered from this scene at POSTER_TIME (see .review/render-poster.mjs).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  HalfFloatType,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
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
const POSTER_TIME = 14;
const SEED = 20260906;

const INK = 0x06080f;
const PERI = 0x8a8bdd;
const PERI_DEEP = 0x5f62d6;
const GOLD = 0xe8b94e;

// Where the core sits in normalized device coordinates, the group scale relative to the stage,
// and how hard the copy column gets darkened.
const LAYOUTS = {
  desktop: { anchor: [0.46, 0.1], scale: 1, leftDark: 1 },
  mobile: { anchor: [0.12, 0.38], scale: 0.58, leftDark: 0.15 },
};

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

    // A periwinkle nebula sweeps the upper right; a warm gold pool sits low where the core lives.
    float peri = smoothstep(0.46, 0.86, n1) * (0.35 + 0.65 * smoothstep(0.1, 0.9, uv.x * 0.6 + uv.y * 0.5));
    float gold = smoothstep(0.55, 0.9, n2) * smoothstep(0.2, 0.95, uv.x) * smoothstep(0.85, 0.2, uv.y);
    float haze = smoothstep(0.5, 0.95, n3) * 0.5;

    vec3 col = uInk;
    col += uPeri * (peri * 0.34 + haze * 0.12);
    col += uGold * gold * 0.22;

    // Keep the copy column deep for contrast.
    col *= mix(1.0, 0.35, uLeftDark * smoothstep(0.62, 0.02, uv.x));
    float vig = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(1.1, 1.5)));
    col *= 0.55 + 0.45 * vig;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const NODE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uMaxSize;
  uniform float uFocus;
  uniform float uLeftDark;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    gl_PointSize = min(uMaxSize, aSize * uScale / max(dist, 0.5));
    float twinkle = 0.78 + 0.22 * sin(uTime * 1.1 + aPhase * 19.0);
    float depth = mix(1.0, 0.42, smoothstep(uFocus - 1.5, uFocus + 4.5, dist));
    gl_Position = projectionMatrix * mv;
    float sx = gl_Position.x / gl_Position.w * 0.5 + 0.5;
    vAlpha = twinkle * depth * mix(1.0, 0.3, uLeftDark * smoothstep(0.6, 0.05, sx));
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
  uniform float uTime;
  uniform float uFocus;
  uniform float uLeftDark;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    float pulse = 0.6 + 0.4 * sin(uTime * 0.45 + aPhase * 6.2831);
    float depth = mix(1.0, 0.3, smoothstep(uFocus - 1.5, uFocus + 4.5, dist));
    float sx = gl_Position.x / gl_Position.w * 0.5 + 0.5;
    vAlpha = pulse * depth * mix(1.0, 0.3, uLeftDark * smoothstep(0.6, 0.05, sx));
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

// Node cloud: a handful of loose clusters around the core, more density near the center, the
// whole thing wider than it is tall so it fills a landscape stage.
function buildGraph(count, rand) {
  const centers = [
    [0, 0, 0, 0.26, 1.7],
    [-3.1, 1.3, -0.7, 0.13, 1.1],
    [3.0, -1.1, 0.5, 0.13, 1.1],
    [-1.8, -1.8, 1.1, 0.11, 0.9],
    [3.6, 1.7, -1.0, 0.11, 0.9],
    [-4.8, -0.5, 0.3, 0.09, 0.8],
    [5.1, 0.3, 0.8, 0.09, 0.8],
    [0.6, 2.6, -1.4, 0.08, 0.8],
  ];
  const nodes = [{ x: 0, y: 0, z: 0, core: true }];
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
    };
    if (Math.abs(node.x) > 7.2 || Math.abs(node.y) > 3.6 || Math.abs(node.z) > 3.2) continue;
    const dCore = Math.hypot(node.x, node.y, node.z);
    if (dCore < 0.55) continue;
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
  return { nodes, edges, adjacency, nextHop };
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
      sizes[i] = 1.9;
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
  const peri = new Color(PERI_DEEP);
  const gold = new Color(GOLD);
  const tint = new Color();
  edges.forEach(([a, b], i) => {
    const na = nodes[a];
    const nb = nodes[b];
    positions.set([na.x, na.y, na.z, nb.x, nb.y, nb.z], i * 6);
    const toCore = na.core || nb.core;
    tint.copy(toCore ? gold : peri).multiplyScalar(toCore ? 0.9 : 0.62);
    colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], i * 6);
    const phase = rand();
    phases[i * 2] = phase;
    phases[i * 2 + 1] = phase;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
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

function makeNodeMaterial(alpha) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 300 },
      uMaxSize: { value: 160 },
      uFocus: { value: CAMERA_Z },
      uAlpha: { value: alpha },
      uLeftDark: { value: 1 },
    },
    vertexShader: NODE_VERTEX,
    fragmentShader: NODE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
}

export function mountHeroScene(host) {
  if (!host || host.dataset.heroMounted) return null;

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

  const dustMaterial = makeNodeMaterial(0.55);
  const dust = new Points(buildDust(lite ? 260 : 620, rand), dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  const graph = buildGraph(lite ? 96 : 168, rand);
  const group = new Group();
  scene.add(group);

  const edgeMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFocus: { value: CAMERA_Z },
      uAlpha: { value: lite ? 0.5 : 0.42 },
      uLeftDark: { value: 1 },
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const edges = new LineSegments(buildEdgeGeometry(graph.nodes, graph.edges, rand), edgeMaterial);
  edges.frustumCulled = false;
  group.add(edges);

  const nodeMaterial = makeNodeMaterial(1);
  const nodes = new Points(buildNodeGeometry(graph.nodes, rand), nodeMaterial);
  nodes.frustumCulled = false;
  group.add(nodes);

  // The core: a solid gold sphere under the big glowing point so it reads even before bloom.
  const coreMaterial = new MeshBasicMaterial({ color: new Color(GOLD).multiplyScalar(lite ? 1.3 : 2.2) });
  const core = new Mesh(new SphereGeometry(0.17, 32, 24), coreMaterial);
  group.add(core);

  // Signals: bright travellers that walk the graph toward the core.
  const SIGNALS = lite ? 5 : 9;
  const signalPositions = new Float32Array(SIGNALS * 3);
  const signalColors = new Float32Array(SIGNALS * 3);
  const signalSizes = new Float32Array(SIGNALS);
  const signalPhases = new Float32Array(SIGNALS);
  const signalGeometry = new BufferGeometry();
  signalGeometry.setAttribute("position", new BufferAttribute(signalPositions, 3));
  signalGeometry.setAttribute("aColor", new BufferAttribute(signalColors, 3));
  signalGeometry.setAttribute("aSize", new BufferAttribute(signalSizes, 1));
  signalGeometry.setAttribute("aPhase", new BufferAttribute(signalPhases, 1));
  const signalMaterial = makeNodeMaterial(1);
  const signals = new Points(signalGeometry, signalMaterial);
  signals.frustumCulled = false;
  group.add(signals);

  const signalState = [];
  const outer = graph.nodes.map((node, i) => i).filter((i) => i > 0 && Math.hypot(graph.nodes[i].x, graph.nodes[i].y, graph.nodes[i].z) > 2.4);
  const spawnAt = (i, wait) => {
    const start = outer[Math.floor(rand() * outer.length)] || 1;
    signalState[i] = { from: start, to: graph.nextHop[start], t: 0, speed: 0.9 + rand() * 0.6, wait, done: false };
    const tint = new Color(rand() < 0.35 ? GOLD : 0xffffff).multiplyScalar(2.4);
    signalColors.set([tint.r, tint.g, tint.b], i * 3);
    signalSizes[i] = 0.3;
    signalPhases[i] = rand();
    signalPositions.set([graph.nodes[start].x, graph.nodes[start].y, graph.nodes[start].z], i * 3);
  };
  for (let i = 0; i < SIGNALS; i += 1) spawnAt(i, rand() * 4);
  let corePulse = 0;

  const a = new Vector3();
  const b = new Vector3();
  function stepSignals(dt) {
    for (let i = 0; i < SIGNALS; i += 1) {
      const s = signalState[i];
      if (s.wait > 0) {
        s.wait -= dt;
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
      signalSizes[i] = 0.26 + near * 0.3;
    }
    signalGeometry.attributes.position.needsUpdate = true;
    signalGeometry.attributes.aSize.needsUpdate = true;
    signalGeometry.attributes.aColor.needsUpdate = true;
  }

  // Post: bloom on capable devices; the lite tier renders straight to the canvas.
  let composer = null;
  let bloomPass = null;
  if (!lite) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.75, 0.52);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  // State.
  let time = POSTER_TIME;
  let last = 0;
  let lastDraw = 0;
  let raf = 0;
  let visible = true;
  let disposed = false;
  let pointerX = 0;
  let pointerY = 0;
  let smoothX = 0;
  let smoothY = 0;
  let layout = LAYOUTS.desktop;

  function step(t, dt) {
    auroraMaterial.uniforms.uTime.value = t;
    nodeMaterial.uniforms.uTime.value = t;
    edgeMaterial.uniforms.uTime.value = t;
    dustMaterial.uniforms.uTime.value = t;
    signalMaterial.uniforms.uTime.value = t;
    const ease = Math.min(1, dt * 2.2);
    smoothX += (pointerX - smoothX) * ease;
    smoothY += (pointerY - smoothY) * ease;
    group.rotation.y = t * 0.03 + smoothX * 0.16;
    group.rotation.x = Math.sin(t * 0.09) * 0.08 - smoothY * 0.1;
    group.rotation.z = Math.sin(t * 0.05) * 0.04;
    stepSignals(dt);
    corePulse = Math.max(0, corePulse - dt * 1.6);
    const pulse = 1 + Math.sin(t * 1.3) * 0.05 + corePulse * 0.55;
    core.scale.setScalar(pulse);
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
    const dt = Math.min((now - last) / 1000, 0.05);
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
    layout = width < 760 ? LAYOUTS.mobile : LAYOUTS.desktop;
    const halfH = Math.tan((FOV / 2) * DEG) * CAMERA_Z;
    const halfW = halfH * camera.aspect;
    group.position.set(layout.anchor[0] * halfW, layout.anchor[1] * halfH, 0);
    group.scale.setScalar(layout.scale);
    const auroraHeight = 2 * (CAMERA_Z - AURORA_Z) * Math.tan((FOV / 2) * DEG) * 1.3;
    aurora.scale.set(auroraHeight * camera.aspect, auroraHeight, 1);
    auroraMaterial.uniforms.uAspect.value = camera.aspect;
    auroraMaterial.uniforms.uLeftDark.value = layout.leftDark;
    const pointScale = height * pixelRatio * 0.6 * layout.scale;
    for (const material of [nodeMaterial, signalMaterial]) {
      material.uniforms.uScale.value = pointScale;
      material.uniforms.uMaxSize.value = 200 * pixelRatio;
      material.uniforms.uLeftDark.value = layout.leftDark;
    }
    dustMaterial.uniforms.uScale.value = height * pixelRatio * 0.6;
    dustMaterial.uniforms.uMaxSize.value = 40 * pixelRatio;
    dustMaterial.uniforms.uLeftDark.value = layout.leftDark;
    edgeMaterial.uniforms.uLeftDark.value = layout.leftDark;
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

  // Poster rendering hook (used by .review/render-poster.mjs): render one frame at a fixed CSS
  // size, pixel ratio and time, return it as a data URL, then restore the live size.
  function snapshot(width, height, at = POSTER_TIME, quality = 0.82, pixelRatio = 1) {
    const liveW = Math.max(1, host.clientWidth);
    const liveH = Math.max(1, host.clientHeight);
    const livePr = renderer.getPixelRatio();
    applySize(width, height, pixelRatio);
    const wasX = pointerX;
    const wasY = pointerY;
    pointerX = pointerY = smoothX = smoothY = 0;
    for (let i = 0; i < 40; i += 1) step(at - 1 + i * 0.025, 0.025);
    draw();
    const url = canvas.toDataURL("image/webp", quality);
    pointerX = wasX;
    pointerY = wasY;
    applySize(liveW, liveH, livePr);
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
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  };
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
    window.removeEventListener("pagehide", dispose);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    host.classList.remove("is-ready");
    delete host.dataset.heroMounted;
    delete host.heroScene;
    scene.traverse((node) => {
      node.geometry?.dispose();
    });
    [auroraMaterial, dustMaterial, edgeMaterial, nodeMaterial, signalMaterial, coreMaterial].forEach((m) => m.dispose());
    bloomPass?.dispose();
    composer?.renderTarget1.dispose();
    composer?.renderTarget2.dispose();
    renderer.dispose();
    canvas.remove();
  }

  host.appendChild(canvas);
  host.dataset.heroMounted = "1";
  resize();
  // Warm the signals so the first frame already has travellers in flight.
  for (let i = 0; i < 120; i += 1) step(time - 3 + i * 0.025, 0.025);
  draw();
  host.classList.add("is-ready");

  observer?.observe(host);
  resizeObserver?.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pagehide", dispose, { once: true });
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  sync();

  const controller = { snapshot, dispose, resize, lite, get running() { return raf !== 0; } };
  host.heroScene = controller;
  return controller;
}
