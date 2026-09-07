/* Restless source networks; their inner nodes also anchor the surrounding constellation. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  EdgesGeometry, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments,
  Points, PointsMaterial,
} from "three";

function pointTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.2, "#ffffff");
  glow.addColorStop(0.4, "rgba(255,255,255,0.4)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

export function createSourceCluster({ tint, seed, lite }) {
  const root = new Group();
  const tintColor = new Color(tint);
  let state = (seed + 1) * 747796405;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const count = lite ? 30 : 48;
  const seeds = Array.from({ length: count }, () => {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2;
    const radius = 0.16 + Math.pow(random(), 0.65) * 0.82;
    const xy = Math.sqrt(1 - z * z) * radius;
    return {
      x: Math.cos(angle) * xy, y: Math.sin(angle) * xy, z: z * radius,
      phase: random() * Math.PI * 2, speed: 0.55 + random() * 1.4,
    };
  });
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new BufferAttribute(colors, 3));
  const dot = pointTexture();
  const pointMaterial = new PointsMaterial({
    map: dot, size: lite ? 0.13 : 0.105, transparent: true, depthWrite: false,
    blending: AdditiveBlending, vertexColors: true,
  });
  const nodes = new Points(pointGeometry, pointMaterial);
  nodes.frustumCulled = false;
  root.add(nodes);

  // Local bonds plus a few cross-cluster links produce an irregular tangle, not a regular cage.
  const unique = new Set();
  const links = [];
  const link = (a, b) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (a !== b && !unique.has(key)) { unique.add(key); links.push([a, b]); }
  };
  seeds.forEach((node, i) => {
    const closest = seeds.map((other, j) => ({ j, distance: Math.hypot(node.x - other.x, node.y - other.y, node.z - other.z) }))
      .filter(other => other.j !== i).sort((a, b) => a.distance - b.distance);
    closest.slice(0, 3).forEach(other => link(i, other.j));
    if (i % 4 === 0) link(i, Math.floor(random() * count));
  });
  const edgePositions = new Float32Array(links.length * 6);
  const wireGeometry = new BufferGeometry();
  wireGeometry.setAttribute("position", new BufferAttribute(edgePositions, 3));
  const wireMaterial = new LineBasicMaterial({ color: tintColor, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending });
  const wires = new LineSegments(wireGeometry, wireMaterial);
  wires.frustumCulled = false;
  root.add(wires);

  const poly = new IcosahedronGeometry(1.03, 1);
  const shellMaterial = new LineBasicMaterial({ color: tintColor, transparent: true, opacity: 0.12, depthWrite: false, blending: AdditiveBlending });
  const shell = new LineSegments(new EdgesGeometry(poly), shellMaterial);
  poly.dispose();
  root.add(shell);

  function update(time, reveal, progress) {
    root.visible = reveal > 0.002;
    if (!root.visible) return;
    const agitation = 0.15 * (1 - progress * 0.8);
    seeds.forEach((node, i) => {
      const t = time * node.speed + node.phase;
      positions[i * 3] = node.x + Math.sin(t * 1.3) * agitation;
      positions[i * 3 + 1] = node.y + Math.cos(t * 0.93 + i) * agitation;
      positions[i * 3 + 2] = node.z + Math.sin(t * 1.12 + i * 0.7) * agitation;
      const brightness = 0.8 + Math.pow(0.5 + 0.5 * Math.sin(t), 5) * 1.3;
      colors[i * 3] = tintColor.r * brightness;
      colors[i * 3 + 1] = tintColor.g * brightness;
      colors[i * 3 + 2] = tintColor.b * brightness;
    });
    links.forEach(([a, b], i) => {
      for (let axis = 0; axis < 3; axis += 1) {
        edgePositions[i * 6 + axis] = positions[a * 3 + axis];
        edgePositions[i * 6 + 3 + axis] = positions[b * 3 + axis];
      }
    });
    pointGeometry.attributes.position.needsUpdate = true;
    pointGeometry.attributes.color.needsUpdate = true;
    wireGeometry.attributes.position.needsUpdate = true;
    pointMaterial.opacity = reveal;
    wireMaterial.opacity = 0.4 * reveal;
    shellMaterial.opacity = 0.12 * reveal;
    shell.rotation.set(time * 0.06 + seed, time * -0.08, seed * 0.4);
  }

  return {
    root, update,
    getAnchor(index, target) { return target.fromArray(positions, (index % count) * 3); },
    dispose() { dot.dispose(); },
  };
}
