/*
 * AIssisted hero stage (visual pass v2).
 *
 * A translucent glass sculpture floats over a live aurora, inside a depth-of-field particle
 * field, with bloom, a slow camera drift and gentle pointer parallax. Each page mounts a
 * different composition from the same material family:
 *   home      -> torus knot + glowing core + orbiting shards + two light rings
 *   services  -> ring-and-orb system
 *   about     -> beveled crystal shard cluster
 *
 * Bundled with esbuild from the vendored Three.js r184 (assets/vendor, MIT) into hero-scene.min.js.
 * Loaded lazily by main.js (initHeroScene) only when motion is allowed, Save-Data is off, WebGL
 * exists and the page has finished loading. Anything that fails leaves the static poster in place;
 * the poster is rendered from this scene at POSTER_TIME (see .review/v2-render-poster.mjs), so the
 * poster-to-canvas crossfade is seamless.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OctahedronGeometry,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector2,
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
const AURORA_Z = -8;
const POSTER_TIME = 6;
const SEED = 20260905;

const INK = 0x070b16;
const GOLD = 0xe6b54a;
const BLUE = 0x4a9be6;
const GREEN = 0x3fae7c;

// Per-page composition. `anchor` is where the sculpture sits in normalized device coordinates
// (x, y in -1..1), `scale` is its size relative to the hero height, `leftDark` darkens the aurora
// under the copy column and `core` is where the aurora's brightest pool sits (0..1 uv).
const VARIANTS = {
  home: {
    build: buildKnot,
    particles: { full: 2600, lite: 900 },
    desktop: { anchor: [0.61, 0.06], scale: 0.94, leftDark: 1, core: [0.83, 0.46] },
    mobile: { anchor: [0.74, 0.6], scale: 0.5, leftDark: 0.2, core: [0.82, 0.8] },
  },
  services: {
    build: buildOrbit,
    particles: { full: 1800, lite: 700 },
    desktop: { anchor: [0.56, 0.0], scale: 0.74, leftDark: 1, core: [0.81, 0.48] },
    mobile: { anchor: [0.62, 0.5], scale: 0.38, leftDark: 0.2, core: [0.8, 0.75] },
  },
  about: {
    build: buildCluster,
    particles: { full: 1800, lite: 700 },
    desktop: { anchor: [0.5, 0.0], scale: 0.88, leftDark: 1, core: [0.78, 0.48] },
    mobile: { anchor: [0.66, 0.5], scale: 0.44, leftDark: 0.2, core: [0.8, 0.75] },
  },
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
  uniform vec2 uCore;
  uniform vec3 uInk;
  uniform vec3 uGold;
  uniform vec3 uBlue;
  uniform vec3 uGreen;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
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
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float t = uTime * 0.05;
    float n1 = fbm(p * 1.25 + vec2(t * 0.7, -t * 0.45));
    float n2 = fbm(p * 1.9 - vec2(t * 0.55, t * 0.6) + 3.7);
    float n3 = fbm(p * 0.85 + vec2(-t * 0.3, t * 0.25) + 9.1);

    // Three slow bands: gold rises toward the right, blue sweeps the upper field, green pools low.
    float gold = smoothstep(0.42, 0.8, n1) * smoothstep(0.05, 0.85, uv.x + 0.2 * n3);
    float blue = smoothstep(0.5, 0.88, n2) * (0.45 + 0.55 * uv.y);
    float green = smoothstep(0.56, 0.92, n3) * smoothstep(0.0, 0.7, 1.0 - uv.y) * 0.85;

    vec3 col = uInk;
    col += uGold * gold * 0.9;
    col += uBlue * blue * 0.95;
    col += uGreen * green * 0.7;

    // A soft pool of light where the sculpture sits, so the glass has something to refract.
    vec2 d = (uv - uCore) * vec2(1.0, 1.35);
    float core = exp(-dot(d, d) * 11.0);
    col += (uGold * 0.72 + uBlue * 0.46) * core * (0.75 + 0.25 * n2);

    // Keep the copy column deep for contrast.
    col *= mix(1.0, 0.3, uLeftDark * smoothstep(0.58, 0.02, uv.x));

    float vig = smoothstep(1.3, 0.3, length((uv - 0.5) * vec2(1.15, 1.5)));
    col *= 0.6 + 0.4 * vig;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uFocus;
  uniform float uMaxSize;
  uniform float uLeftDark;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  void main() {
    vec3 pos = position;
    pos.y += sin(uTime * 0.22 + aPhase * 6.2831) * 0.2;
    pos.x += cos(uTime * 0.16 + aPhase * 4.1) * 0.14;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = -mv.z;
    // Depth of field: points away from the focus plane grow into soft bokeh discs and fade.
    float blur = smoothstep(0.0, 6.5, abs(dist - uFocus));
    float size = aSize * (1.0 + blur * 3.6);
    gl_PointSize = min(uMaxSize, size * uScale / max(dist, 0.5));
    float twinkle = 0.72 + 0.28 * sin(uTime * 1.4 + aPhase * 21.0);
    vAlpha = twinkle * mix(1.0, 0.14, blur) * smoothstep(0.6, 3.0, dist);
    gl_Position = projectionMatrix * mv;
    // Dim the field under the copy column so text never sits on a bright point.
    float sx = gl_Position.x / gl_Position.w * 0.5 + 0.5;
    vAlpha *= mix(1.0, 0.3, uLeftDark * smoothstep(0.62, 0.05, sx));
    vSoft = blur;
    vColor = aColor;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float edge = mix(0.38, 0.04, vSoft);
    float disc = 1.0 - smoothstep(edge, 1.0, r);
    float core = (1.0 - smoothstep(0.0, 0.32, r)) * (1.0 - vSoft);
    vec3 col = vColor * (disc + core * 0.9);
    gl_FragColor = vec4(col, disc * vAlpha * uAlpha);
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

// Small procedural studio: warm gold key panel, cool blue rim panel, a white strip for crisp
// highlights and a green floor bounce. Baked to a PMREM so the glass reflects and refracts it.
function buildEnvironment(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  const env = new Scene();
  const room = new Mesh(new SphereGeometry(24, 24, 16), new MeshBasicMaterial({ color: 0x0a1120, side: BackSide }));
  env.add(room);
  const panel = (hex, intensity, pos, size) => {
    const mesh = new Mesh(
      new PlaneGeometry(size[0], size[1]),
      new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(intensity), side: DoubleSide })
    );
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(0xffd27a, 7, [7, 8, 5], [10, 4]);
  panel(0x6fb4ff, 5, [-9, 2, -4], [7, 9]);
  panel(0xffffff, 10, [0, 11, -2], [12, 1.2]);
  panel(0x8fe4bd, 3, [3, -9, 3], [8, 3]);
  panel(0xe6b54a, 4, [9, -3, 7], [3, 7]);
  const texture = pmrem.fromScene(env, 0.035).texture;
  env.traverse((node) => {
    node.geometry?.dispose();
    node.material?.dispose();
  });
  pmrem.dispose();
  return texture;
}

function makeGlass(overrides = {}) {
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.09,
    transmission: 1,
    thickness: 1.6,
    ior: 1.46,
    attenuationColor: new Color(0xf5d9a0),
    attenuationDistance: 3.2,
    iridescence: 0.85,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [140, 520],
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    specularIntensity: 1,
    ...overrides,
  });
}

function makeLine(hex, intensity) {
  return new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(intensity) });
}

function buildKnot(mat, lite) {
  const group = new Group();
  const knot = new Mesh(new TorusKnotGeometry(1.42, 0.4, lite ? 170 : 300, lite ? 24 : 44, 2, 3), mat.glass);
  const core = new Mesh(new SphereGeometry(0.64, 48, 32), mat.core);
  const ringA = new Mesh(new TorusGeometry(2.55, 0.02, 10, 220), mat.gold);
  const ringB = new Mesh(new TorusGeometry(2.95, 0.013, 10, 240), mat.blue);
  ringA.rotation.set(1.25, 0.2, 0);
  ringB.rotation.set(0.55, 0.9, 0.3);
  const shards = [0, 1, 2, 3].map((i) => {
    const shard = new Mesh(new OctahedronGeometry(0.24 + i * 0.05, 0), mat.glass);
    shard.scale.set(1, 1.7, 1);
    return shard;
  });
  group.add(knot, core, ringA, ringB, ...shards);
  return {
    group,
    update(t) {
      knot.rotation.y = t * 0.12;
      knot.rotation.x = Math.sin(t * 0.17) * 0.35;
      knot.rotation.z = Math.cos(t * 0.11) * 0.2;
      core.scale.setScalar(1 + Math.sin(t * 0.9) * 0.04);
      ringA.rotation.z = t * 0.08;
      ringA.rotation.x = 1.25 + Math.sin(t * 0.13) * 0.25;
      ringB.rotation.z = -t * 0.06;
      ringB.rotation.y = 0.9 + Math.cos(t * 0.1) * 0.3;
      shards.forEach((shard, i) => {
        const a = t * (0.16 + i * 0.035) + i * 1.7;
        const r = 2.55 + i * 0.28;
        shard.position.set(Math.cos(a) * r, Math.sin(a * 0.7 + i) * 1.35, Math.sin(a) * r * 0.6);
        shard.rotation.x = t * 0.5 + i;
        shard.rotation.y = t * 0.4;
      });
    },
  };
}

function buildOrbit(mat, lite) {
  const group = new Group();
  const orb = new Mesh(new SphereGeometry(1.12, lite ? 40 : 72, lite ? 28 : 48), mat.glass);
  const core = new Mesh(new SphereGeometry(0.5, 40, 28), mat.core);
  const rings = [1.85, 2.2, 2.55].map((r, i) => new Mesh(new TorusGeometry(r, 0.13 - i * 0.03, lite ? 16 : 28, lite ? 110 : 180), mat.glass));
  rings[0].rotation.set(1.1, 0.3, 0);
  rings[1].rotation.set(0.5, 1.2, 0.4);
  rings[2].rotation.set(1.9, -0.6, 0.2);
  const thin = new Mesh(new TorusGeometry(2.9, 0.016, 10, 240), mat.gold);
  thin.rotation.set(1.4, 0.4, 0);
  const moons = [0, 1, 2].map((i) => new Mesh(new SphereGeometry(0.16 + i * 0.05, 24, 16), mat.glass));
  group.add(orb, core, ...rings, thin, ...moons);
  return {
    group,
    update(t) {
      orb.rotation.y = t * 0.1;
      core.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05);
      rings.forEach((ring, i) => {
        ring.rotation.z += 0;
        ring.rotation.y = (i % 2 ? -1 : 1) * t * (0.09 + i * 0.03) + i;
        ring.rotation.x = [1.1, 0.5, 1.9][i] + Math.sin(t * 0.15 + i) * 0.2;
      });
      thin.rotation.z = t * 0.07;
      moons.forEach((moon, i) => {
        const a = t * (0.32 - i * 0.05) + i * 2.1;
        const r = 1.85 + i * 0.35;
        moon.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.42, Math.sin(a + i) * r * 0.5);
      });
    },
  };
}

function buildCluster(mat, lite) {
  const group = new Group();
  const rand = makeRandom(SEED + 7);
  const shards = [];
  // Crystal shards: a brighter, warmer glass than the knot so the facets catch the gold key.
  const crystal = mat.glass.clone();
  crystal.roughness = 0.04;
  crystal.attenuationColor = new Color(0xf7d58c);
  crystal.attenuationDistance = 1.6;
  crystal.iridescence = 1;
  crystal.envMapIntensity = 2;
  const heartMaterial = mat.core.clone();
  heartMaterial.emissiveIntensity = 1.1;
  for (let i = 0; i < 8; i += 1) {
    const size = 0.4 + rand() * 0.46;
    const shard = new Mesh(new IcosahedronGeometry(size, 0), crystal);
    shard.scale.set(0.55 + rand() * 0.2, 1.5 + rand() * 0.9, 0.55 + rand() * 0.2);
    const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
    const r = 0.8 + rand() * 1.3;
    shard.position.set(Math.cos(a) * r, (rand() - 0.5) * 1.6, Math.sin(a) * r);
    shard.rotation.set(rand() * 1.2 - 0.6, a, rand() * 0.8 - 0.4);
    shard.userData.spin = 0.05 + rand() * 0.08;
    shards.push(shard);
  }
  const heart = new Mesh(new IcosahedronGeometry(1.05, lite ? 1 : 2), heartMaterial);
  const ringA = new Mesh(new TorusGeometry(2.7, 0.018, 10, 220), mat.gold);
  const ringB = new Mesh(new TorusGeometry(2.3, 0.012, 10, 200), mat.blue);
  ringA.rotation.set(1.35, 0.2, 0);
  ringB.rotation.set(0.4, 1.1, 0.5);
  group.add(heart, ringA, ringB, ...shards);
  return {
    group,
    update(t) {
      group.rotation.y = t * 0.09;
      heart.rotation.y = -t * 0.2;
      heart.rotation.x = Math.sin(t * 0.3) * 0.4;
      heart.scale.setScalar(1 + Math.sin(t * 0.7) * 0.04);
      shards.forEach((shard, i) => {
        shard.rotation.y += 0;
        shard.position.y += Math.sin(t * 0.5 + i) * 0.0009;
        shard.rotation.z = Math.sin(t * shard.userData.spin * 4 + i) * 0.35;
      });
      ringA.rotation.z = t * 0.06;
      ringB.rotation.z = -t * 0.05;
    },
  };
}

function buildParticles(count, rand) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const palette = [
    [0xfff1cf, 0.42],
    [0xffcf6a, 0.24],
    [0x86bfff, 0.22],
    [0x8fe8bf, 0.12],
  ];
  const tint = new Color();
  for (let i = 0; i < count; i += 1) {
    const foreground = rand() < 0.12;
    positions[i * 3] = (rand() * 2 - 1) * 9.5;
    positions[i * 3 + 1] = (rand() * 2 - 1) * 5;
    positions[i * 3 + 2] = foreground ? 5 + rand() * 2.5 : -7 + rand() * 12;
    let roll = rand();
    let hex = palette[0][0];
    for (const [c, w] of palette) {
      roll -= w;
      if (roll <= 0) {
        hex = c;
        break;
      }
    }
    tint.set(hex);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
    sizes[i] = 0.05 + rand() * 0.11 + (rand() < 0.06 ? 0.16 : 0);
    phases[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  return geometry;
}

export function mountHeroScene(host) {
  if (!host || host.dataset.heroMounted) return null;

  const variant = VARIANTS[host.dataset.heroVariant] || VARIANTS.home;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const lite = coarse || (navigator.hardwareConcurrency || 8) <= 4;
  const maxPixelRatio = lite ? 1.25 : 1.5;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-hero-canvas", "");
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: lite,
      alpha: false,
      powerPreference: lite ? "default" : "high-performance",
    });
  } catch {
    return null;
  }
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.transmissionResolutionScale = lite ? 0.5 : 0.75;
  renderer.setClearColor(INK, 1);

  const rand = makeRandom(SEED);
  const scene = new Scene();
  const envTexture = buildEnvironment(renderer);
  scene.environment = envTexture;

  const camera = new PerspectiveCamera(FOV, 1, 0.5, 60);
  camera.position.set(0, 0, CAMERA_Z);

  // Aurora: an opaque, frustum-filling plane behind everything, so the glass can refract it.
  const auroraMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uLeftDark: { value: 1 },
      uCore: { value: new Vector2(0.72, 0.5) },
      uInk: { value: new Color(INK) },
      uGold: { value: new Color(0xc8952d) },
      uBlue: { value: new Color(0x2e6fa8) },
      uGreen: { value: new Color(0x2f8a5e) },
    },
    vertexShader: AURORA_VERTEX,
    fragmentShader: AURORA_FRAGMENT,
    depthWrite: false,
  });
  const aurora = new Mesh(new PlaneGeometry(1, 1), auroraMaterial);
  aurora.position.z = AURORA_Z;
  aurora.frustumCulled = false;
  scene.add(aurora);

  // Materials shared by every variant.
  const materials = {
    glass: makeGlass(),
    core: makeGlass({
      color: 0xffe3a6,
      roughness: 0.18,
      thickness: 0.8,
      transmission: 0.85,
      emissive: new Color(0xe6b54a),
      emissiveIntensity: 0.55,
      iridescence: 0.4,
    }),
    gold: makeLine(GOLD, 2.6),
    blue: makeLine(BLUE, 2.2),
  };
  const sculpture = variant.build(materials, lite);
  scene.add(sculpture.group);

  const particleGeometry = buildParticles(lite ? variant.particles.lite : variant.particles.full, rand);
  const particleMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 300 },
      uFocus: { value: CAMERA_Z },
      uMaxSize: { value: 180 },
      uAlpha: { value: 0.9 },
      uLeftDark: { value: 1 },
    },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const particles = new Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  scene.add(particles);

  const key = new DirectionalLight(0xffd58a, 2.4);
  key.position.set(5, 6, 7);
  const rim = new DirectionalLight(0x6fb0ff, 1.9);
  rim.position.set(-6, -3, -4);
  const fill = new DirectionalLight(0x8fe8bf, 0.5);
  fill.position.set(0, -6, 3);
  scene.add(key, rim, fill);

  // Post: bloom on capable devices; the lite tier renders straight to the canvas.
  let composer = null;
  let bloomPass = null;
  if (!lite) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    // Strength/threshold kept modest so the ring highlights glow without blowing out the glass panels.
    bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.36, 0.6, 0.84);
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
  let layout = variant.desktop;

  function step(t, dt) {
    sculpture.update(t);
    auroraMaterial.uniforms.uTime.value = t;
    particleMaterial.uniforms.uTime.value = t;
    const ease = Math.min(1, dt * 2.2);
    smoothX += (pointerX - smoothX) * ease;
    smoothY += (pointerY - smoothY) * ease;
    camera.position.x = Math.sin(t * 0.07) * 0.28 + smoothX * 0.5;
    camera.position.y = Math.cos(t * 0.05) * 0.18 - smoothY * 0.34;
    camera.position.z = CAMERA_Z + Math.sin(t * 0.04) * 0.25;
    camera.lookAt(sculpture.group.position.x * 0.35, sculpture.group.position.y * 0.35, 0);
  }

  function draw() {
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
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
    layout = width < 760 ? variant.mobile : variant.desktop;
    const halfH = Math.tan((FOV / 2) * DEG) * CAMERA_Z;
    const halfW = halfH * camera.aspect;
    sculpture.group.position.set(layout.anchor[0] * halfW, layout.anchor[1] * halfH, 0);
    sculpture.group.scale.setScalar(layout.scale);
    const auroraHeight = 2 * (CAMERA_Z - AURORA_Z) * Math.tan((FOV / 2) * DEG) * 1.3;
    aurora.scale.set(auroraHeight * camera.aspect, auroraHeight, 1);
    auroraMaterial.uniforms.uAspect.value = camera.aspect;
    auroraMaterial.uniforms.uLeftDark.value = layout.leftDark;
    auroraMaterial.uniforms.uCore.value.set(layout.core[0], layout.core[1]);
    particleMaterial.uniforms.uScale.value = height * pixelRatio * 0.62;
    particleMaterial.uniforms.uMaxSize.value = 150 * pixelRatio;
    particleMaterial.uniforms.uLeftDark.value = layout.leftDark;
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

  // Poster rendering hook (used by .review/v2-render-poster.mjs): render one frame at a fixed
  // CSS size, pixel ratio and time, return it as a data URL, then restore the live size.
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
    scene.traverse((node) => {
      node.geometry?.dispose();
      if (node.material && !Object.values(materials).includes(node.material)) node.material.dispose();
    });
    Object.values(materials).forEach((material) => material.dispose());
    auroraMaterial.dispose();
    particleMaterial.dispose();
    envTexture.dispose();
    bloomPass?.dispose();
    composer?.renderTarget1.dispose();
    composer?.renderTarget2.dispose();
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

  const controller = { snapshot, dispose, resize, lite, get running() { return raf !== 0; } };
  host.heroScene = controller;
  return controller;
}
