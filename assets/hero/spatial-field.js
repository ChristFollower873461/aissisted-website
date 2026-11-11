import { AdditiveBlending, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from "three";

const VERTEX = /* glsl */ `
  varying vec2 vPlane;
  varying vec4 vClip;
  void main() {
    vPlane = position.xy;
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }
`;

const VISIBILITY = /* glsl */ `
  uniform float uLeftDark;
  uniform float uMobile;
  varying vec2 vPlane;
  varying vec4 vClip;
  float copyClearance() {
    vec2 screen = vClip.xy / vClip.w * 0.5 + 0.5;
    float desktop = mix(1.0, 0.12 + 0.88 * smoothstep(0.32, 0.65, screen.x), uLeftDark);
    return mix(desktop, smoothstep(0.55, 0.73, screen.y), uMobile);
  }
`;

const GRID = /* glsl */ `
  uniform float uMerged;
  uniform vec3 uPeri;
  uniform vec3 uGold;
  ${VISIBILITY}
  float grid(vec2 p) {
    vec2 width = max(fwidth(p), vec2(0.0001));
    vec2 distance = abs(fract(p - 0.5) - 0.5) / width;
    return 1.0 - min(min(distance.x, distance.y), 1.0);
  }
  void main() {
    vec2 p = vPlane - vec2(0.0, 0.6);
    float falloff = exp(-dot(p * vec2(0.2, 0.18), p * vec2(0.2, 0.18)))
      * (1.0 - smoothstep(5.5, 8.0, length(p)));
    float nearCore = exp(-dot(p * vec2(0.48, 0.42), p * vec2(0.48, 0.42)));
    float line = grid(vPlane / 0.72) * 0.16 + grid(vPlane / 2.88) * 0.08;
    vec3 color = mix(uPeri, uGold, nearCore * uMerged * 0.5);
    gl_FragColor = vec4(color, line * falloff * copyClearance());
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HAZE = /* glsl */ `
  uniform float uTime;
  uniform float uMerged;
  uniform float uLayer;
  uniform float uStrength;
  uniform vec3 uPeri;
  uniform vec3 uGold;
  ${VISIBILITY}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vPlane;
    float t = uTime * 0.055;
    float grain = noise(p * 0.95 + vec2(t, -t * 0.4) + uLayer * 3.7) * 0.65
      + noise(p * 2.1 - vec2(t * 0.7, t) + uLayer) * 0.35;
    vec2 extent = mix(vec2(0.24, 0.33), vec2(0.34, 0.45), uMerged);
    vec2 warped = p + vec2(grain - 0.5, noise(p + t) - 0.5) * 0.65;
    float field = exp(-dot(warped * extent, warped * extent) * 1.8);
    float edge = (1.0 - smoothstep(3.6, 4.5, abs(p.x)))
      * (1.0 - smoothstep(2.3, 3.2, abs(p.y)));
    float warmth = exp(-dot(p * vec2(0.7, 0.8), p * vec2(0.7, 0.8))) * uMerged;
    vec3 color = mix(uPeri, uGold, warmth * 0.85);
    float density = field * (0.5 + grain * 0.5) * (0.07 + uMerged * 0.1);
    gl_FragColor = vec4(color, density * edge * uStrength * copyClearance());
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSpatialField({ lite }) {
  const root = new Group();
  const uniformSet = () => ({
    uTime: { value: 0 }, uMerged: { value: 0 }, uLayer: { value: 0 },
    uStrength: { value: lite ? 1 : 0.65 }, uLeftDark: { value: 1 }, uMobile: { value: 0 },
    uPeri: { value: new Color(0x586780) }, uGold: { value: new Color(0xb99c67) },
  });
  const gridMaterial = new ShaderMaterial({
    uniforms: uniformSet(), vertexShader: VERTEX, fragmentShader: GRID,
    transparent: true, depthWrite: false, depthTest: false, side: DoubleSide, blending: AdditiveBlending,
  });
  const grid = new Mesh(new PlaneGeometry(16, 16), gridMaterial);
  grid.position.set(0, -1.3, -3.4);
  grid.rotation.set(-0.95, -0.12, 0.05);
  grid.renderOrder = -30;
  grid.frustumCulled = false;
  root.add(grid);

  const haze = Array.from({ length: lite ? 1 : 2 }, (_, i) => {
    const material = new ShaderMaterial({
      uniforms: uniformSet(), vertexShader: VERTEX, fragmentShader: HAZE,
      transparent: true, depthWrite: false, depthTest: false,
    });
    material.uniforms.uLayer.value = i;
    const mesh = new Mesh(new PlaneGeometry(9, 6.4), material);
    mesh.position.set(i * 0.15, 0, -1.4 - i * 0.7);
    mesh.rotation.z = i * -0.14;
    mesh.renderOrder = -20 - i;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  });
  const materials = [gridMaterial, ...haze.map(mesh => mesh.material)];

  return {
    root,
    configure(anchor, scale, leftDark, mobile) {
      root.position.copy(anchor);
      root.scale.setScalar(scale);
      materials.forEach(material => {
        material.uniforms.uLeftDark.value = leftDark;
        material.uniforms.uMobile.value = mobile ? 1 : 0;
      });
    },
    update(time, merged, lift = 0) {
      materials.forEach(material => {
        material.uniforms.uTime.value = time;
        material.uniforms.uMerged.value = merged;
      });
      // The reference plane stays put while the illuminated volume follows the nucleus.
      haze.forEach(mesh => { mesh.position.y = lift / root.scale.y; });
    },
  };
}
