import { BufferAttribute, BufferGeometry, Color, LineSegments, Vector3 } from "three";

const SEGMENTS = 7;
const PAIRS = [[0, 1], [1, 2], [2, 0]];

export function interferenceBurst(time, lane) {
  const elapsed = time - 0.35 - lane * 0.71;
  const cycle = Math.max(0, Math.floor(elapsed / 2.4));
  const age = elapsed - cycle * 2.4;
  const duration = 0.62 + ((cycle + lane) % 3) * 0.13;
  const phase = Math.max(0, Math.min(1, age / duration));
  return { cycle, phase, alpha: age > 0 && age < duration ? Math.sin(phase * Math.PI) ** 0.6 : 0 };
}

// Brief, crooked exchanges between real source nodes. Geometry is reused, not
// spawned per burst; the same time always produces the same preview and poster.
export function createSourceInterference({ hubs, palette, material }) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(PAIRS.length * SEGMENTS * 6);
  const colors = new Float32Array(positions.length);
  const links = new Float32Array(positions.length / 3);
  const phases = new Float32Array(links.length);
  PAIRS.forEach(([from, to], lane) => {
    const a = new Color(palette[from]), b = new Color(palette[to]);
    for (let segment = 0; segment < SEGMENTS; segment++) {
      for (let end = 0; end < 2; end++) {
        const vertex = (lane * SEGMENTS + segment) * 2 + end;
        const color = a.clone().lerp(b, (segment + end) / SEGMENTS).multiplyScalar(1.2);
        colors.set([color.r, color.g, color.b], vertex * 3);
        phases[vertex] = lane * 0.2;
      }
    }
  });
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aLink", new BufferAttribute(links, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  const root = new LineSegments(geometry, material);
  root.frustumCulled = false;
  const a = new Vector3(), b = new Vector3(), point = new Vector3();

  function update(time, progress) {
    let visible = false;
    PAIRS.forEach(([from, to], lane) => {
      const burst = interferenceBurst(time, lane);
      const fade = Math.max(0, Math.min(1, (0.92 - Math.max(progress[from], progress[to])) / 0.25));
      const alpha = burst.alpha * fade;
      visible ||= alpha > 0.001;
      const source = hubs[from], destination = hubs[to];
      source.detail.getAnchor(burst.cycle * 11 + lane * 7, a).multiplyScalar(source.mesh.scale.x).add(source.mesh.position);
      destination.detail.getAnchor(burst.cycle * 17 + lane * 5 + 9, b).multiplyScalar(destination.mesh.scale.x).add(destination.mesh.position);
      const twitch = Math.floor(time * 8) + burst.cycle * 13 + lane * 3;
      for (let segment = 0; segment < SEGMENTS; segment++) {
        for (let end = 0; end < 2; end++) {
          const vertex = (lane * SEGMENTS + segment) * 2 + end;
          const u = (segment + end) / SEGMENTS;
          const bend = Math.sin(u * Math.PI) * 0.2;
          point.copy(a).lerp(b, u);
          point.x += Math.sin((segment + end) * 2.7 + twitch) * bend;
          point.y += Math.cos((segment + end) * 1.9 + twitch * 1.3) * bend;
          point.z += Math.sin((segment + end) * 3.1 + twitch) * bend;
          point.toArray(positions, vertex * 3);
          const impulse = Math.max(0, 1 - Math.abs(u - burst.phase) * 5);
          links[vertex] = alpha * (0.9 + impulse * 1.8);
        }
      }
    });
    root.visible = visible;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aLink.needsUpdate = true;
  }
  return { root, update };
}
