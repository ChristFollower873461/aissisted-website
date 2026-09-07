import assert from "node:assert/strict";
import test from "node:test";
import { buildOrganizedNetwork, sampleOrganizedPosition } from "../assets/hero/organized-network.js";

const source = [{ x: 0, y: 0, z: 0, lobe: -1 }, ...Array.from({ length: 231 }, (_, i) => ({
  x: Math.cos(i * 2.4) * (1 + i % 6), y: Math.sin(i * 2.4) * 3, z: 0, lobe: i % 3,
}))];

test("hero organization keeps 24 irregular junctions with a sparse routing backbone", () => {
  const result = buildOrganizedNetwork(source);
  assert.equal(result.nodes.length, 24);
  assert.equal(result.retained.size, 24);
  assert.equal(result.edges.length, 23);
  assert.equal(result.leaves.length, 15);
  assert.deepEqual([0, 1, 2].map(lobe => result.leaves.filter(index => result.targets[index].lobe === lobe).length), [5, 6, 4]);
  assert.ok(new Set(result.leaves.map(index => Math.hypot(result.targets[index].x, result.targets[index].y))).size > 6);
  assert.ok(result.nodes.every(node => Math.abs(node.z) <= 0.3));
  assert.ok(new Set(result.nodes.slice(1).map(node => node.size)).size > 3);
});

test("every organized signal route reaches the core in at most three hops", () => {
  const result = buildOrganizedNetwork(source);
  for (const { source: start } of result.nodes) {
    let current = start, hops = 0;
    while (current && hops <= 3) { current = result.parent[current]; hops++; }
    assert.equal(current, 0);
    assert.ok(hops <= 3);
  }
  for (const [a, b] of result.edges) {
    assert.ok(result.retained.has(a) && result.retained.has(b));
    assert.equal(result.parent[b], a);
  }
});

test("unneeded nodes coalesce into their own source branch without mutating the source", () => {
  const before = structuredClone(source);
  const result = buildOrganizedNetwork(source);
  assert.deepEqual(source, before);
  for (let i = 1; i < source.length; i++) {
    assert.equal(result.targets[i].lobe, source[i].lobe);
    assert.ok(result.retained.has(result.targets[i].source));
    assert.ok(Number.isFinite(result.targets[i].x) && Number.isFinite(result.targets[i].y));
  }
  assert.deepEqual(buildOrganizedNetwork(source), result);
});

test("undersized source clusters cannot silently produce invalid routes", () => {
  assert.throws(() => buildOrganizedNetwork(source.slice(0, 7)), /needs 8 nodes/);
});

test("primary organized paths have no crossings except shared junctions", () => {
  const { edges, targets } = buildOrganizedNetwork(source);
  const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i], [c, d] = edges[j];
      if ([a, b].includes(c) || [a, b].includes(d)) continue;
      const crosses = turn(targets[a], targets[b], targets[c]) * turn(targets[a], targets[b], targets[d]) < 0
        && turn(targets[c], targets[d], targets[a]) * turn(targets[c], targets[d], targets[b]) < 0;
      assert.equal(crosses, false);
    }
  }
});

test("secondary bonds make local loops and cross-system connections without changing signal parents", () => {
  const result = buildOrganizedNetwork(source);
  assert.equal(result.secondaryEdges.length, 9);
  const key = ([a, b]) => [a, b].sort((a, b) => a - b).join(":");
  const seen = new Set(result.edges.map(key));
  for (const edge of result.secondaryEdges) {
    const [a, b] = edge;
    assert.ok(result.retained.has(a) && result.retained.has(b));
    assert.notEqual(a, b);
    assert.equal(seen.has(key(edge)), false);
    seen.add(key(edge));
  }
  assert.equal(result.secondaryEdges.filter(([a, b]) => result.targets[a].lobe !== result.targets[b].lobe).length, 2);
});

test("settled junctions drift within bounded neighborhoods while the nucleus stays fixed", () => {
  const { nodes } = buildOrganizedNetwork(source);
  for (const time of [0, 12, 14, 35, 120]) {
    assert.deepEqual(sampleOrganizedPosition(nodes[0], time, 1, {}), { x: 0, y: 0, z: 0 });
    for (const node of nodes.slice(1)) {
      const point = sampleOrganizedPosition(node, time, 0.52, {});
      assert.ok(Math.abs(point.x / 0.52 - node.x) <= 0.066);
      assert.ok(Math.abs(point.y / 0.52 - node.y) <= 0.046);
      assert.ok(Math.abs(point.z / 0.52 - node.z) <= 0.091);
      assert.deepEqual(point, sampleOrganizedPosition(node, time, 0.52, {}));
    }
  }
  assert.notDeepEqual(sampleOrganizedPosition(nodes[1], 12, 1, {}), sampleOrganizedPosition(nodes[1], 14, 1, {}));
});
