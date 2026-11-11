// A sparse final mesh with an acyclic routing backbone and quieter secondary bonds.
export function sampleOrganizedPosition(node, time, scale, position) {
  const phase = node.lobe * 2.1 + node.x * 1.7 - node.y * 0.9;
  const drift = node.source === 0 ? 0 : 1;
  position.x = (node.x + Math.sin(time * 0.48 + phase) * 0.065 * drift) * scale;
  position.y = (node.y + Math.cos(time * 0.39 + phase) * 0.045 * drift) * scale;
  position.z = (node.z + Math.sin(time * 0.55 + phase) * 0.09 * drift) * scale;
  return position;
}

export function buildOrganizedNetwork(sourceNodes) {
  const nodes = [{ source: 0, x: 0, y: 0, z: 0, lobe: -1, parent: 0 }];
  const parent = new Int32Array(sourceNodes.length);
  const targets = sourceNodes.map(() => ({ x: 0, y: 0, z: 0 }));
  const retained = new Set([0]);
  const leaves = [];
  const edges = [];
  const secondaryEdges = [];
  const branchSources = [];
  // Parent indices are local to each branch. Uneven depth, reach and leaf counts
  // preserve a legible hierarchy without suggesting three identical systems.
  const branches = [
    { angle: 2.28, points: [
      [1.48, 0, -1, 0.06], [2.18, -0.24, 0, -0.08],
      [3.12, -0.42, 1, 0.14], [2.78, -0.1, 1, -0.12],
      [2.36, 0.25, 0, 0.12], [3.19, 0.39, 4, 0.02],
      [2.63, -0.59, 1, 0.3], [2.89, 0.17, 4, -0.28],
    ], bonds: [[2, 3], [3, 7], [2, 6]] },
    { angle: 0.15, points: [
      [1.52, 0, -1, -0.06], [2.2, -0.27, 0, 0.1],
      [2.94, -0.43, 1, 0.04], [3.28, -0.15, 1, -0.1],
      [2.31, 0.27, 0, -0.12], [3.15, 0.16, 4, 0.08],
      [3.32, 0.4, 4, -0.04], [2.86, 0.64, 4, 0.16],
      [2.73, 0.02, 1, 0.28],
    ], bonds: [[3, 8], [5, 6]] },
    { angle: 4.34, points: [
      [1.56, 0, -1, 0.08], [2.33, -0.16, 0, -0.12],
      [3.26, -0.24, 1, 0.04], [2.85, 0.36, 0, 0.14],
      [2.53, 0.12, 0, -0.2], [2.86, -0.5, 1, 0.3],
    ], bonds: [[2, 5], [3, 4]] },
  ];

  branches.forEach(({ angle, points, bonds }, lobe) => {
    const available = sourceNodes.map((node, index) => ({ node, index }))
      .filter(({ node, index }) => index && node.lobe === lobe);
    if (available.length < points.length) throw new Error(`Source cluster ${lobe} needs ${points.length} nodes to organize`);
    const localSources = [];
    points.forEach(([radius, offset, parentIndex, z], localIndex) => {
      const theta = angle + offset;
      const parentSource = parentIndex < 0 ? 0 : localSources[parentIndex];
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius * 0.68;
      available.sort((a, b) => Math.hypot(a.node.x - x, a.node.y - y) - Math.hypot(b.node.x - x, b.node.y - y));
      const { index } = available.shift();
      const size = parentIndex < 0 ? 0.27 : 0.16 + (localIndex % 4) * 0.026;
      const node = { source: index, x, y, z, size, lobe, parent: parentSource };
      nodes.push(node);
      retained.add(index);
      targets[index] = node;
      parent[index] = parentSource;
      edges.push([parentSource, index]);
      if (!points.some(point => point[2] === localIndex)) leaves.push(index);
      localSources.push(index);
    });
    branchSources.push(localSources);
    bonds.forEach(([a, b]) => secondaryEdges.push([localSources[a], localSources[b]]));
    const destinations = nodes.filter(node => node.lobe === lobe);
    for (const { node, index } of available) {
      const nearest = destinations.reduce((best, candidate) =>
        Math.hypot(node.x - candidate.x, node.y - candidate.y) < Math.hypot(node.x - best.x, node.y - best.y) ? candidate : best);
      targets[index] = nearest;
    }
  });
  secondaryEdges.push([branchSources[0][1], branchSources[1][7]], [branchSources[1][1], branchSources[2][4]]);
  return { nodes, targets, retained, parent, leaves, edges, secondaryEdges };
}
