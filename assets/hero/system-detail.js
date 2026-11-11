/* Layered, signal-carrying geometry shared by the three source systems and their joined core. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, EdgesGeometry,
  Euler, Group, IcosahedronGeometry, LineSegments, Mesh, Points, ShaderMaterial,
  SphereGeometry, Vector3,
} from "three";

const TAU = Math.PI * 2;
const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;

const SURFACE = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  uniform vec3 uTint;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - facing, 2.1);
    vec2 grid = abs(fract(vUv * vec2(12.0, 6.0)) - 0.5);
    float trace = smoothstep(0.43, 0.49, max(grid.x, grid.y));
    float sweep = pow(0.5 + 0.5 * sin(vUv.y * 12.0 - uTime * 1.1), 18.0);
    float longitude = pow(0.5 + 0.5 * cos(vUv.x * 18.8496 + uTime * 0.45), 26.0);
    vec3 color = vec3(0.015, 0.018, 0.032) + uTint *
      (rim * 0.72 + trace * (0.12 + sweep * 0.4) + longitude * 0.08 + uPulse * 0.1);
    gl_FragColor = vec4(color, uReveal);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const LINE_VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vPhase;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = color;
    vPhase = aPhase;
    vDepth = clamp(1.2 + position.z * 0.4, 0.4, 1.4);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  varying vec3 vColor;
  varying float vPhase;
  varying float vDepth;
  void main() {
    float signal = pow(0.5 + 0.5 * sin(vPhase * 18.8496 - uTime * 1.7), 24.0);
    gl_FragColor = vec4(vColor * (0.75 + signal * 1.15),
      uReveal * (0.38 + signal * 0.58 + uPulse * 0.15) * vDepth);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const POINT_VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 1.0, 32.0);
    vColor = color;
  }
`;
const POINT_FRAGMENT = /* glsl */ `
  uniform float uReveal;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float dot = 1.0 - smoothstep(0.12, 0.45, r);
    float halo = pow(1.0 - r, 3.0);
    gl_FragColor = vec4(vColor * (dot + halo * 0.3), (dot + halo * 0.5) * uReveal);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function lineMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
}

function finishLines(positions, colors, phases) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute("aPhase", new BufferAttribute(new Float32Array(phases), 1));
  return geometry;
}

export function createSystemDetail({ tint, palette, lite, seed = 0, core = false }) {
  const root = new Group();
  const shell = new Group();
  const orbits = new Group();
  root.add(shell, orbits);
  const color = new Color(tint);
  const materials = [];

  const surfaceMaterial = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uReveal: { value: 0 }, uPulse: { value: 0 }, uTint: { value: color },
    },
    vertexShader: VERTEX, fragmentShader: SURFACE, transparent: true, depthWrite: false,
  });
  const sphere = new Mesh(new SphereGeometry(0.36, lite ? 32 : 48, 24), surfaceMaterial);
  shell.add(sphere);
  materials.push(surfaceMaterial);

  // Nested geodesic shells give the center a readable silhouette even at the brightest arrival.
  for (const [radius, detail, strength] of [[0.55, 0, 0.42]]) {
    const poly = new IcosahedronGeometry(radius, detail);
    const edges = new EdgesGeometry(poly);
    const positions = Array.from(edges.attributes.position.array);
    const colors = [];
    const phases = [];
    const c = color.clone().multiplyScalar(strength);
    for (let i = 0; i < positions.length / 3; i += 1) {
      colors.push(c.r, c.g, c.b);
      phases.push(i / 18);
    }
    const material = lineMaterial();
    const lines = new LineSegments(finishLines(positions, colors, phases), material);
    shell.add(lines);
    materials.push(material);
    edges.dispose();
    poly.dispose();
  }

  const rings = [
    { radius: 0.82, tilt: new Euler(0.45, 0.12, 0), speed: 0.34 },
    { radius: 1.03, tilt: new Euler(0.45, 0.12, 0), speed: 0.29 },
    { radius: 1.24, tilt: new Euler(0.45, 0.12, 0), speed: 0.38 },
  ];
  const temp = new Vector3();
  const orbitMaterial = lineMaterial();
  materials.push(orbitMaterial);
  rings.forEach((ring, r) => {
    const positions = [], colors = [], phases = [];
    const segment = (radius, angle, c, phase) => {
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      colors.push(c.r, c.g, c.b);
      phases.push(phase);
    };
    ring.color = new Color(palette[r]).multiplyScalar(core ? 1.05 : 0.85);
    const steps = lite ? 120 : 192;
    for (let i = 0; i < steps; i += 1) {
      // Precisely spaced gaps and fine radial ticks make these read as connected systems.
      if (i % (steps / 3) < 3) continue;
      segment(ring.radius, i / steps * TAU, ring.color, i / steps);
      segment(ring.radius, (i + 1) / steps * TAU, ring.color, (i + 1) / steps);
    }
    const ticks = lite ? 12 : 24;
    for (let i = 0; i < ticks; i += 1) {
      const angle = i / ticks * TAU;
      const major = i % 5 === 0;
      segment(ring.radius + 0.025, angle, ring.color, i / ticks);
      segment(ring.radius + (major ? 0.095 : 0.055), angle, ring.color, i / ticks);
    }
    ring.mesh = new LineSegments(finishLines(positions, colors, phases), orbitMaterial);
    orbits.add(ring.mesh);
  });

  const packetCount = 6;
  const packetPositions = new Float32Array(packetCount * 3);
  const packetColors = new Float32Array(packetCount * 3);
  const packetSizes = new Float32Array(packetCount);
  for (let i = 0; i < packetCount; i += 1) {
    const c = rings[i % 3].color;
    packetColors.set([c.r, c.g, c.b], i * 3);
    packetSizes[i] = i < 3 ? 0.17 : 0.08;
  }
  const packetsGeometry = new BufferGeometry();
  packetsGeometry.setAttribute("position", new BufferAttribute(packetPositions, 3));
  packetsGeometry.setAttribute("color", new BufferAttribute(packetColors, 3));
  packetsGeometry.setAttribute("aSize", new BufferAttribute(packetSizes, 1));
  const packetMaterial = new ShaderMaterial({
    uniforms: { uReveal: { value: 0 }, uScale: { value: 300 } },
    vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const packets = new Points(packetsGeometry, packetMaterial);
  packets.frustumCulled = false;
  orbits.add(packets);

  function update(time, reveal, pulse = 0) {
    root.visible = reveal > 0.002;
    if (!root.visible) return;
    shell.rotation.set(time * 0.025 + seed, time * -0.035 + seed * 0.3, time * 0.012);
    orbits.rotation.set(0, 0, time * 0.055 + seed * 0.4);
    materials.forEach(material => {
      material.uniforms.uTime.value = time + seed;
      material.uniforms.uReveal.value = reveal;
      material.uniforms.uPulse.value = pulse;
    });
    packetMaterial.uniforms.uReveal.value = reveal;
    rings.forEach((ring, r) => {
      const phase = time * (0.72 + r * 0.105) + r * 2.1 + seed;
      ring.mesh.position.set(Math.cos(phase) * 0.12, Math.sin(phase * 0.83) * 0.1, Math.sin(phase) * 0.09);
      ring.tilt.set(0.45 + Math.sin(phase * 0.72) * 0.24, 0.12 + Math.cos(phase) * 0.2, Math.sin(phase * 0.6) * 0.14);
      ring.mesh.rotation.copy(ring.tilt);
    });
    for (let i = 0; i < packetCount; i += 1) {
      const ring = rings[i % 3];
      const angle = time * ring.speed + Math.floor(i / 3) * 1.0472 + seed;
      temp.set(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0).applyEuler(ring.tilt).add(ring.mesh.position);
      packetPositions.set([temp.x, temp.y, temp.z], i * 3);
    }
    packetsGeometry.attributes.position.needsUpdate = true;
  }

  return {
    root, update,
    setPointScale(value) { packetMaterial.uniforms.uScale.value = value; },
  };
}
