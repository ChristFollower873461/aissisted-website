/*
 * AIssisted homepage hero scene.
 *
 * A slow-drifting node-and-edge "workflow constellation" with three low-poly hubs,
 * drawn in the site's accent colors on the homepage paper tone. Bundled with esbuild
 * from the vendored Three.js (assets/vendor, r184) into hero-scene.min.js.
 *
 * Loaded lazily by main.js (initHeroScene) only when: motion is allowed, Save-Data is off,
 * WebGL exists, and the page has finished loading. Anything that fails leaves the static
 * poster (assets/hero/hero-poster.webp, rendered from this same scene) in place.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "../vendor/three.module.js";

const PAPER = 0xf7f1e6;
const SIGNAL = 0xe0ad3f;
const SEED = 20260905;
const POSTER_TIME = 2.5;
const NODE_COLORS = [
  [0xc8952d, 0.36], // gold
  [0x2e5874, 0.26], // blue
  [0x2f7d5b, 0.22], // green
  [0x8a6817, 0.09], // deep gold
  [0x171b24, 0.07], // ink
];

const CONFIGS = {
  desktop: {
    nodes: 112,
    halfW: 8.2,
    halfH: 3.9,
    halfD: 2.2,
    linkDist: 2.6,
    links: 2,
    signals: 6,
    hubs: [
      { color: 0xc8952d, pos: [3.55, 2.45, 0.2], radius: 0.62, spin: 1 },
      { color: 0x2e5874, pos: [5.0, -1.35, -0.4], radius: 0.5, spin: -1 },
      { color: 0x2f7d5b, pos: [0.85, 2.0, -0.4], radius: 0.4, spin: 1 },
    ],
  },
  mobile: {
    nodes: 46,
    halfW: 2.0,
    halfH: 6.4,
    halfD: 1.6,
    linkDist: 2.4,
    links: 2,
    signals: 3,
    hubs: [
      { color: 0xc8952d, pos: [1.1, 4.3, 0.1], radius: 0.3, spin: 1 },
      { color: 0x2e5874, pos: [-1.05, 0.9, -0.5], radius: 0.24, spin: -1 },
      { color: 0x2f7d5b, pos: [0.2, 2.4, -0.6], radius: 0.2, spin: 1 },
    ],
  },
};

// One world unit renders as ~128 CSS px at z=0 regardless of hero height, so the field keeps
// the same visual density from a 793px desktop hero to a 1500px stacked mobile hero.
const REFERENCE_HEIGHT = 794;

const POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    gl_PointSize = aSize * uScale / dist;
    vColor = color;
    vFade = 1.0 - smoothstep(6.5, 12.5, dist);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uPaper;
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float disc = 1.0 - smoothstep(0.6, 1.0, r);
    float core = 1.0 - smoothstep(0.0, 0.6, r);
    float depth = 0.3 + 0.7 * vFade;
    vec3 col = mix(uPaper, vColor, depth);
    gl_FragColor = vec4(col, disc * (0.5 + 0.5 * core) * depth * uAlpha);
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

function pickColor(rand) {
  let roll = rand();
  for (const [hex, weight] of NODE_COLORS) {
    roll -= weight;
    if (roll <= 0) return hex;
  }
  return NODE_COLORS[0][0];
}

function smoothstep(v) {
  const c = Math.min(Math.max(v, 0), 1);
  return c * c * (3 - 2 * c);
}

function buildField(cfg, rand) {
  const hubCount = cfg.hubs.length;
  const n = cfg.nodes + hubCount;
  const base = new Float32Array(n * 3);
  const amp = new Float32Array(n * 3);
  const freq = new Float32Array(n * 3);
  const phase = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const tint = new Color();

  for (let i = 0; i < cfg.nodes; i += 1) {
    base[i * 3] = (rand() * 2 - 1) * cfg.halfW;
    base[i * 3 + 1] = (rand() * 2 - 1) * cfg.halfH;
    base[i * 3 + 2] = (rand() * 2 - 1) * cfg.halfD;
    for (let k = 0; k < 3; k += 1) {
      amp[i * 3 + k] = 0.05 + rand() * 0.09;
      freq[i * 3 + k] = 0.16 + rand() * 0.26;
      phase[i * 3 + k] = rand() * Math.PI * 2;
    }
    tint.set(pickColor(rand));
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
    sizes[i] = 0.05 + rand() * 0.075 + (rand() < 0.12 ? 0.06 : 0);
  }

  // Hubs join the field as static anchor nodes (size 0: drawn as meshes, not points).
  cfg.hubs.forEach((hub, h) => {
    const i = cfg.nodes + h;
    base.set(hub.pos, i * 3);
    tint.set(hub.color);
    colors.set([tint.r, tint.g, tint.b], i * 3);
    sizes[i] = 0;
  });

  // Edges: each node links to its nearest neighbours within linkDist.
  const edges = [];
  const adjacency = Array.from({ length: n }, () => []);
  const seen = new Set();
  const dist = (i, j) => Math.hypot(base[i * 3] - base[j * 3], base[i * 3 + 1] - base[j * 3 + 1], base[i * 3 + 2] - base[j * 3 + 2]);
  for (let i = 0; i < n; i += 1) {
    const candidates = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const d = dist(i, j);
      if (d < cfg.linkDist) candidates.push([d, j]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    const wanted = i >= cfg.nodes ? cfg.links + 1 : cfg.links;
    for (let m = 0; m < Math.min(wanted, candidates.length); m += 1) {
      const j = candidates[m][1];
      const key = i < j ? i * n + j : j * n + i;
      if (seen.has(key)) continue;
      seen.add(key);
      adjacency[i].push(edges.length);
      adjacency[j].push(edges.length);
      edges.push([i, j]);
    }
  }

  return { n, base, amp, freq, phase, colors, sizes, edges, adjacency };
}

export function mountHeroScene(host) {
  if (!host || host.dataset.heroMounted) return null;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-hero-canvas", "");
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  } catch {
    return null;
  }

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const cfg = CONFIGS[host.clientWidth < 760 ? "mobile" : "desktop"];
  const rand = makeRandom(SEED);
  const field = buildField(cfg, rand);
  const paper = new Color(PAPER);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new Scene();
  scene.background = paper;
  scene.fog = new Fog(PAPER, 7, 13.5);

  const camera = new PerspectiveCamera(38, 1, 0.5, 40);
  camera.position.set(0, 0, 9);

  const world = new Group();
  scene.add(world);

  // Nodes.
  const nodePositions = new Float32Array(field.base);
  const nodeGeometry = new BufferGeometry();
  const nodePositionAttr = new BufferAttribute(nodePositions, 3).setUsage(DynamicDrawUsage);
  nodeGeometry.setAttribute("position", nodePositionAttr);
  nodeGeometry.setAttribute("color", new BufferAttribute(field.colors, 3));
  nodeGeometry.setAttribute("aSize", new BufferAttribute(field.sizes, 1));
  const pointMaterial = new ShaderMaterial({
    uniforms: { uScale: { value: 300 }, uPaper: { value: paper }, uAlpha: { value: 1 } },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const nodes = new Points(nodeGeometry, pointMaterial);
  nodes.frustumCulled = false;
  world.add(nodes);

  // Edges.
  const edgeCount = field.edges.length;
  const edgePositions = new Float32Array(edgeCount * 6);
  const edgeColors = new Float32Array(edgeCount * 6);
  const mixA = new Color();
  const mixB = new Color();
  field.edges.forEach(([a, b], e) => {
    mixA.setRGB(field.colors[a * 3], field.colors[a * 3 + 1], field.colors[a * 3 + 2]);
    mixB.setRGB(field.colors[b * 3], field.colors[b * 3 + 1], field.colors[b * 3 + 2]);
    mixA.lerp(mixB, 0.5).lerp(paper, 0.42);
    edgeColors.set([mixA.r, mixA.g, mixA.b, mixA.r, mixA.g, mixA.b], e * 6);
  });
  const edgeGeometry = new BufferGeometry();
  const edgePositionAttr = new BufferAttribute(edgePositions, 3).setUsage(DynamicDrawUsage);
  edgeGeometry.setAttribute("position", edgePositionAttr);
  edgeGeometry.setAttribute("color", new BufferAttribute(edgeColors, 3));
  const edges = new LineSegments(edgeGeometry, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62 }));
  edges.frustumCulled = false;
  world.add(edges);

  // Signals: small bright points travelling along edges.
  const signalCount = edgeCount ? cfg.signals : 0;
  const signalPositions = new Float32Array(signalCount * 3);
  const signalColors = new Float32Array(signalCount * 3);
  const signalSizes = new Float32Array(signalCount);
  const signalTint = new Color(SIGNAL);
  const signals = [];
  for (let s = 0; s < signalCount; s += 1) {
    signalColors.set([signalTint.r, signalTint.g, signalTint.b], s * 3);
    signalSizes[s] = 0.15;
    signals.push({ edge: Math.floor(rand() * edgeCount), dir: rand() < 0.5 ? 1 : 0, t: rand(), speed: 0.2 + rand() * 0.2 });
  }
  const signalGeometry = new BufferGeometry();
  const signalPositionAttr = new BufferAttribute(signalPositions, 3).setUsage(DynamicDrawUsage);
  signalGeometry.setAttribute("position", signalPositionAttr);
  signalGeometry.setAttribute("color", new BufferAttribute(signalColors, 3));
  signalGeometry.setAttribute("aSize", new BufferAttribute(signalSizes, 1));
  const signalMaterial = pointMaterial.clone();
  signalMaterial.uniforms.uScale = pointMaterial.uniforms.uScale;
  signalMaterial.uniforms.uAlpha.value = 0.95;
  const signalPoints = new Points(signalGeometry, signalMaterial);
  signalPoints.frustumCulled = false;
  world.add(signalPoints);

  // Hubs: low-poly icosahedra with a wireframe shell.
  const hubs = cfg.hubs.map((hub, h) => {
    const group = new Group();
    group.position.set(hub.pos[0], hub.pos[1], hub.pos[2]);
    const shell = new Mesh(
      new IcosahedronGeometry(hub.radius, 1),
      new MeshBasicMaterial({ color: hub.color, wireframe: true, transparent: true, opacity: 0.3 })
    );
    const core = new Mesh(
      new IcosahedronGeometry(hub.radius * 0.56, 0),
      new MeshLambertMaterial({ color: hub.color, flatShading: true })
    );
    group.add(shell, core);
    world.add(group);
    return { group, shell, core, baseY: hub.pos[1], spin: hub.spin, phase: h * 1.7 };
  });

  scene.add(new HemisphereLight(0xffffff, 0xd8c39d, 1.7));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 8);
  scene.add(key);

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

  function updateField(t) {
    const { base, amp, freq, phase } = field;
    for (let i = 0; i < field.n; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const idx = i * 3 + k;
        nodePositions[idx] = base[idx] + amp[idx] * Math.sin(t * freq[idx] + phase[idx]);
      }
    }
    nodePositionAttr.needsUpdate = true;
    for (let e = 0; e < edgeCount; e += 1) {
      const [a, b] = field.edges[e];
      edgePositions[e * 6] = nodePositions[a * 3];
      edgePositions[e * 6 + 1] = nodePositions[a * 3 + 1];
      edgePositions[e * 6 + 2] = nodePositions[a * 3 + 2];
      edgePositions[e * 6 + 3] = nodePositions[b * 3];
      edgePositions[e * 6 + 4] = nodePositions[b * 3 + 1];
      edgePositions[e * 6 + 5] = nodePositions[b * 3 + 2];
    }
    edgePositionAttr.needsUpdate = true;
  }

  function updateSignals(dt) {
    for (let s = 0; s < signalCount; s += 1) {
      const sig = signals[s];
      sig.t += dt * sig.speed;
      while (sig.t >= 1) {
        sig.t -= 1;
        const [a, b] = field.edges[sig.edge];
        const end = sig.dir ? b : a;
        const options = field.adjacency[end].filter((e) => e !== sig.edge);
        if (options.length) {
          sig.edge = options[Math.floor(rand() * options.length)];
          sig.dir = field.edges[sig.edge][0] === end ? 1 : 0;
        } else {
          sig.dir = sig.dir ? 0 : 1;
        }
        sig.speed = 0.2 + rand() * 0.2;
      }
      const [a, b] = field.edges[sig.edge];
      const from = sig.dir ? a : b;
      const to = sig.dir ? b : a;
      const k = smoothstep(sig.t);
      for (let c = 0; c < 3; c += 1) {
        signalPositions[s * 3 + c] = nodePositions[from * 3 + c] + (nodePositions[to * 3 + c] - nodePositions[from * 3 + c]) * k;
      }
    }
    if (signalCount) signalPositionAttr.needsUpdate = true;
  }

  function updateHubs(t, dt) {
    hubs.forEach((hub) => {
      hub.group.position.y = hub.baseY + Math.sin(t * 0.32 + hub.phase) * 0.07;
      hub.shell.rotation.y += dt * 0.11 * hub.spin;
      hub.shell.rotation.x += dt * 0.06;
      hub.core.rotation.y -= dt * 0.08 * hub.spin;
      hub.core.rotation.z += dt * 0.05;
    });
  }

  function updateCamera(t, dt) {
    const ease = Math.min(1, dt * 2.5);
    smoothX += (pointerX - smoothX) * ease;
    smoothY += (pointerY - smoothY) * ease;
    world.rotation.y = Math.sin(t * 0.06) * 0.1 + smoothX * 0.05;
    world.rotation.x = Math.sin(t * 0.045) * 0.04 + smoothY * 0.03;
    camera.position.x = Math.sin(t * 0.11) * 0.18 + smoothX * 0.25;
    camera.position.y = Math.cos(t * 0.09) * 0.12 - smoothY * 0.15;
    camera.lookAt(0, 0, 0);
  }

  function step(t, dt) {
    updateField(t);
    updateSignals(dt);
    updateHubs(t, dt);
    updateCamera(t, dt);
  }

  function draw() {
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = 0;
    if (disposed) return;
    if (coarse && now - lastDraw < 31) {
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
    const worldScale = Math.min(1.2, Math.max(0.45, REFERENCE_HEIGHT / height));
    world.scale.setScalar(worldScale);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    pointMaterial.uniforms.uScale.value = height * pixelRatio * 0.5 * worldScale;
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    applySize(width, height, Math.min(window.devicePixelRatio || 1, 1.5));
    if (!raf) {
      step(time, 0);
      draw();
    }
  }

  // Poster rendering hook (used by .review/render-poster.mjs): render one frame at a
  // fixed CSS size, pixel ratio and time, return it as a data URL, then restore the live size.
  function snapshot(width, height, at = POSTER_TIME, quality = 0.82, pixelRatio = 1) {
    const liveW = Math.max(1, host.clientWidth);
    const liveH = Math.max(1, host.clientHeight);
    const livePr = renderer.getPixelRatio();
    applySize(width, height, pixelRatio);
    const wasX = pointerX;
    const wasY = pointerY;
    pointerX = pointerY = smoothX = smoothY = 0;
    step(at, 0);
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
    nodeGeometry.dispose();
    edgeGeometry.dispose();
    signalGeometry.dispose();
    pointMaterial.dispose();
    signalMaterial.dispose();
    edges.material.dispose();
    hubs.forEach((hub) => {
      hub.shell.geometry.dispose();
      hub.shell.material.dispose();
      hub.core.geometry.dispose();
      hub.core.material.dispose();
    });
    renderer.dispose();
    canvas.remove();
  }

  host.appendChild(canvas);
  host.dataset.heroMounted = "1";
  resize();
  step(time, 0);
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

  const controller = { snapshot, dispose, resize, get running() { return raf !== 0; } };
  host.heroScene = controller;
  return controller;
}
