import assert from "node:assert/strict";
import test from "node:test";
import { Group, LineBasicMaterial, Vector3 } from "three";
import { createSourceInterference, interferenceBurst } from "../assets/hero/source-interference.js";
import { createSystemDetail } from "../assets/hero/system-detail.js";

const palette = [0xb6a9ff, 0x8de0df, 0xf3cf83];

test("source exchanges are intermittent and staggered, not constantly connected", () => {
  assert.equal(interferenceBurst(0, 0).alpha, 0);
  assert.ok(interferenceBurst(0.65, 0).alpha > 0.9);
  assert.equal(interferenceBurst(1.5, 0).alpha, 0);
  assert.ok(interferenceBurst(1.45, 1).alpha > 0.9);
  assert.ok(interferenceBurst(3.1, 0).cycle > 0);
  for (let t = 0; t < 12; t += 0.05) {
    const samples = [0, 1, 2].map(lane => interferenceBurst(t, lane));
    assert.ok(samples.every(sample => sample.alpha >= 0 && sample.alpha <= 1));
    assert.ok(samples.filter(sample => sample.alpha > 0).length <= 2);
  }
});

test("cross-system wires follow real anchors, keep continuous segments, and vanish after merging", () => {
  const hubs = [0, 1, 2].map(i => {
    const mesh = new Group();
    mesh.position.set(i * 3, i - 1, 0.2);
    mesh.scale.setScalar(0.7);
    return { mesh, detail: { getAnchor: (index, target) => target.set(index * 0.01, 0.2, -0.1) } };
  });
  const material = new LineBasicMaterial();
  const exchange = createSourceInterference({ hubs, palette, material });
  exchange.update(0.65, [0, 0, 0]);
  assert.equal(exchange.root.visible, true);
  const { position, aLink } = exchange.root.geometry.attributes;
  const a = new Vector3().fromBufferAttribute(position, 0);
  const b = new Vector3().fromBufferAttribute(position, 13);
  assert.ok(a.distanceTo(new Vector3(0, -0.86, 0.13)) < 1e-6);
  assert.ok(b.distanceTo(new Vector3(3.063, 0.14, 0.13)) < 1e-6);
  for (let i = 1; i < 7; i++) {
    assert.deepEqual(Array.from(position.array.slice(i * 6 - 3, i * 6)), Array.from(position.array.slice(i * 6, i * 6 + 3)));
  }
  const before = position.array.slice();
  exchange.update(0.65, [0, 0, 0]);
  assert.deepEqual(position.array, before);
  exchange.update(0.65, [1, 1, 1]);
  assert.equal(exchange.root.visible, false);
  assert.ok(aLink.array.every(value => value === 0));
  exchange.root.geometry.dispose();
  material.dispose();
});

test("instrument rings translate independently and their packets stay on the moving tracks", () => {
  const detail = createSystemDetail({ tint: palette[2], palette, lite: true, core: true });
  const orbits = detail.root.children[1];
  const rings = orbits.children.filter(child => child.isLineSegments);
  const packets = orbits.children.find(child => child.isPoints);
  detail.update(12, 1);
  const before = rings.map(ring => ring.position.clone());
  detail.update(14, 1);
  assert.ok(rings.every((ring, i) => ring.position.distanceTo(before[i]) > 0.07), "Ring motion should be apparent within two seconds");
  detail.update(35, 1);
  for (let i = 0; i < rings.length; i++) {
    assert.ok(rings[i].position.distanceTo(before[i]) > 0.01);
    assert.ok(rings[i].position.length() < 0.2);
    const local = new Vector3().fromBufferAttribute(packets.geometry.attributes.position, i).sub(rings[i].position);
    assert.ok(Math.abs(local.length() - [0.82, 1.03, 1.24][i]) < 1e-6);
  }
  assert.ok(rings[0].position.distanceTo(rings[1].position) > 0.05);
  detail.root.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
});
