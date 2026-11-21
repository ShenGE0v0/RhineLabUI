import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { decryptionFrame, DecryptionController } from "../src/decryption.ts";
import {
  frostedTransmissionLod,
  FROSTED_ROUGHNESS,
  CLEAR_ROUGHNESS,
  glassRevealGLSL,
  frostedTransmissionGLSL,
} from "../src/glass-reveal.ts";

// Frost occupies the same fraction of a cover across viewport sizes. Clearing
// must never briefly increase its blur, and both original endpoints survive.
for (const scale of [0.5, 1, 2]) {
  const pixels = 400 * scale,
    width = 1920 * scale;
  assert.ok(
    Math.abs(
      2 ** frostedTransmissionLod(pixels, width, FROSTED_ROUGHNESS) / pixels -
        0.01,
    ) < 1e-10,
  );
  let prior = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const roughness =
      CLEAR_ROUGHNESS + ((FROSTED_ROUGHNESS - CLEAR_ROUGHNESS) * i) / 100;
    const lod = frostedTransmissionLod(pixels, width, roughness);
    assert.ok(lod >= prior - 1e-10, "Clearing monotonically reduces blur");
    prior = lod;
    assert.equal(
      frostedTransmissionLod(pixels, width, roughness, 0),
      Math.log2(width) * roughness * (1.46 * 2 - 2),
    );
  }
  assert.ok(
    Math.abs(
      frostedTransmissionLod(pixels, width, CLEAR_ROUGHNESS) -
        Math.log2(width) * CLEAR_ROUGHNESS * (1.46 * 2 - 2),
    ) < 1e-10,
  );
}

assert.ok(glassRevealGLSL.includes("glassRevealAtHeight"));
assert.ok(frostedTransmissionGLSL.includes("archiveTransmissionLod"));

const length = (frame) =>
  frame.intervals.reduce((n, [a, b]) => n + b - a, 0);
let previous = 0;
for (let t = 34.24; t < 36.04; t += 0.001) {
  const f = decryptionFrame(t),
    current = length(f);
  assert.ok(current >= previous - 1e-10 && current <= 1);
  if (f.intervals.length)
    assert.ok(Math.abs(f.intervals[0][1] + f.intervals[1][0] - 1) < 1e-10);
  previous = current;
}
assert.deepEqual(decryptionFrame(36.04).intervals, [[0, 1]]);
assert.equal(length(decryptionFrame(37.71)), 1);
previous = 1;
for (let t = 37.72; t < 38.84; t += 0.001) {
  const f = decryptionFrame(t),
    current = length(f);
  assert.ok(current <= previous + 1e-10 && current >= 0);
  assert.ok(Math.abs(f.intervals[0][0] + f.intervals[0][1] - 1) < 1e-10);
  assert.equal(f.clarity, 0);
  previous = current;
}
assert.equal(length(decryptionFrame(38.84)), 0);
assert.equal(decryptionFrame(38.84).clarity, 0);
assert.equal(decryptionFrame(39.56).clarity, 1);
assert.ok(length(decryptionFrame(34.64)) > 0.5, "Joining is eased, not linear");

const a = new DecryptionController();
a.enter();
a.update(3, false, false);
assert.equal(a.frame.phase, "waiting");
a.update(0, true, false);
for (let i = 0; i < 120; i++) a.update(1 / 30, true, false);
assert.equal(a.clarity, 1);
a.leave();
assert.equal(a.frame.intervals.length, 0);
a.update(0.1, false, false);
const returning = a.clarity;
a.enter();
a.update(0, true, false);
assert.equal(a.clarity, returning);
a.update(0.1, true, true);
assert.equal(a.clarity, 1);
assert.equal(a.frame.intervals.length, 0);
a.select();
assert.equal(a.clarity, 0);
a.update(0, false, false, 35);
assert.equal(a.frame.phase, "joining");
a.update(0, false, false, 39.56);
assert.equal(a.clarity, 1);
a.update(0, false, false, 34);
assert.equal(a.clarity, 0, "Reference seeking is reversible");

// The REF front panel must exist and span the same height the shader uses.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({
  width: 1,
  height: 1,
  close() {},
});
const bytes = await readFile(
  new URL("../public/assets/archive-assembly.glb", import.meta.url),
);
const asset = (
  await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  )
).scene;
asset.updateMatrixWorld(true);
let glass;
asset.traverse((mesh) => {
  if (
    mesh.isMesh &&
    mesh.material.name.replace(/\.\d+$/, "") === "REF_Glass"
  )
    glass = mesh;
});
assert.ok(glass, "REF_Glass is present in the delivered assembly");
const box = new THREE.Box3().setFromObject(glass);
assert.ok(box.min.z > 0.04 && box.max.z < 0.06);
assert.ok(
  box.min.y > 0 && box.max.y < 3.7,
  "Glass height stays inside the shader's 0..3.7 panel range",
);

console.log(
  JSON.stringify(
    {
      passed: true,
      glassDepth: [box.min.z, box.max.z],
      glassHeight: [box.min.y, box.max.y],
      reveal: "frosted → top-to-bottom clear",
      timeline: "joining → connected → retracting → revealing → clear",
    },
    null,
    2,
  ),
);
