import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { createSpatialField } from "../assets/hero/spatial-field.js";

function dispose(field) {
  field.root.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
}

test("spatial field uses bounded, depth-safe layers with a smaller mobile tier", () => {
  for (const lite of [false, true]) {
    const field = createSpatialField({ lite });
    assert.equal(field.root.children.length, lite ? 2 : 3);
    for (const mesh of field.root.children) {
      assert.equal(mesh.geometry.attributes.position.count, 4);
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.material.depthTest, false);
      assert.equal(mesh.material.transparent, true);
      assert.ok(mesh.renderOrder < 0);
    }
    assert.ok(field.root.children[0].rotation.x < -0.8, "Grid must actually recede in 3D");
    dispose(field);
  }
});

test("the reference grid stays fixed while the haze follows the merging nucleus", () => {
  const field = createSpatialField({ lite: false });
  const anchor = new Vector3(2, 1, 0);
  field.configure(anchor, 0.58, 0.2, true);
  const grid = field.root.children[0];
  const position = grid.position.clone(), rotation = grid.rotation.clone();
  field.update(0.8, 0);
  field.update(12, 1, 0.5);
  assert.deepEqual(grid.position, position);
  assert.ok(grid.rotation.equals(rotation));
  assert.deepEqual(field.root.position, anchor);
  for (const mesh of field.root.children.slice(1)) {
    assert.ok(Math.abs(mesh.position.y * field.root.scale.y - 0.5) < 1e-8);
    assert.equal(mesh.material.uniforms.uMerged.value, 1);
    assert.equal(mesh.material.uniforms.uMobile.value, 1);
  }
  assert.notEqual(field.root.children[1].position.z, field.root.children[2].position.z);
  field.update(0.8, 0, 0);
  assert.equal(field.root.children[1].position.y, 0, "Poster rewind must restore the opening haze position");
  assert.deepEqual(anchor, new Vector3(2, 1, 0));
  dispose(field);
});
