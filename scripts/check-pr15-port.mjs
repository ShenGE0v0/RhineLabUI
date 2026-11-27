// Adapted checks from PR #15 performance.test.mjs, credited in docs/PR15-ATTRIBUTION.md.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ArchiveDrawCoverage,
  ArchiveShadowCoverage,
} from "../src/archive-draw-coverage.ts";
import { SharedDepthBokeh } from "../src/shared-depth.ts";
test("visible edge bounds and independent offscreen shadow transforms", () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 100);
  camera.position.set(0, 0, 20);
  camera.updateMatrixWorld();
  const coverage = new ArchiveDrawCoverage();
  coverage.update(camera);
  assert.equal(coverage.contains(0, -2, 0), true);
  assert.equal(coverage.contains(100, -2, 0), false);
  assert.equal(
    coverage.contains((Math.tan(Math.PI / 8) * 20 * 16) / 9 + 2, -2, 0),
    true,
  );
  const geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshBasicMaterial();
  const source = new THREE.InstancedMesh(geometry, material, 1);
  source.castShadow = true;
  const shadow = new ArchiveShadowCoverage(source),
    matrix = new THREE.Matrix4();
  shadow.begin();
  shadow.add(matrix);
  shadow.add(matrix.makeTranslation(100, 0, 0));
  assert.equal(shadow.commit(), true);
  assert.equal(source.castShadow, false);
  assert.equal(shadow.mesh.count, 2);
  assert.equal(shadow.mesh.instanceMatrix.array[28], 100);
  shadow.mesh.onBeforeRender();
  assert.equal(shadow.mesh.count, 0);
  shadow.mesh.onAfterRender();
  assert.equal(shadow.mesh.count, 2);
  shadow.begin();
  shadow.add(matrix.identity());
  shadow.add(matrix.makeTranslation(100, 0, 0));
  assert.equal(shadow.commit(), false);
  shadow.begin();
  shadow.add(matrix.identity());
  assert.equal(shadow.commit(), true);
  assert.equal(shadow.mesh.count, 1);
  shadow.mesh.dispose();
  source.dispose();
  geometry.dispose();
  material.dispose();
});
test("SharedDepthBokeh constructs, resizes, and disposes with hardware-depth support", () => {
  const pass = new SharedDepthBokeh(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(30, 1, 5, 300),
    { focus: 25, aperture: 0.0018, maxblur: 0.011 },
  );
  pass.setSize(800, 600);
  assert.ok(pass.materialBokeh.fragmentShader.includes("abs( dofblur.x ) < 0.00025"));
  pass.dispose();
});
