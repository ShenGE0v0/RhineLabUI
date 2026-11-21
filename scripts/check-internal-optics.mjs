import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The REF cassette has no old optical-core / optical-lenses subassembly. Its
// "internal" stack is the printed card sandwiched between the acrylic tube,
// the front glass and the mint frame. Keep that contract explicit so a future
// export cannot silently drop the glass again.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({
  width: 1,
  height: 1,
  close() {},
});

const bytes = await readFile(
  new URL("../public/assets/archive-assembly.glb", import.meta.url),
);
const scene = (
  await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  )
).scene;
scene.updateMatrixWorld(true);

const layers = [];
const parts = new Map();
scene.traverse((mesh) => {
  if (!mesh.isMesh) return;
  const name = mesh.material.name.replace(/\.\d+$/, "");
  const part = mesh.userData.assemblyPart;
  parts.set(part, (parts.get(part) ?? 0) + 1);
  if (["REF_Acrylic", "REF_CardPrint", "REF_Glass", "REF_FrameMint"].includes(name))
    layers.push({ name, box: new THREE.Box3().setFromObject(mesh) });
});

assert.deepEqual([...parts.keys()].sort(), ["body", "card"]);
assert.ok(parts.get("body") >= 9);
assert.ok(parts.get("card") >= 1);
assert.ok(!parts.has("optical-core"));
assert.ok(!parts.has("optical-lenses"));

const byName = (name) => layers.filter((layer) => layer.name === name);
const acrylic = byName("REF_Acrylic");
const card = byName("REF_CardPrint");
const glass = byName("REF_Glass");
const frame = byName("REF_FrameMint");
assert.equal(acrylic.length, 1);
assert.equal(card.length, 1);
assert.equal(glass.length, 1);
assert.ok(frame.length >= 1);

const cardBox = card[0].box;
const glassBox = glass[0].box;
const acrylicBox = acrylic[0].box;
assert.ok(cardBox.min.z > acrylicBox.min.z);
assert.ok(glassBox.min.z > cardBox.max.z);
assert.ok(
  Math.abs(glassBox.min.z - 0.049) < 1e-3 &&
    Math.abs(glassBox.max.z - 0.0505) < 1e-3,
  "REF_Glass keeps its thin front-panel depth",
);
assert.ok(
  Math.abs(cardBox.min.z + 0.03) < 1e-3 &&
    Math.abs(cardBox.max.z - 0.048) < 1e-3,
  "REF_CardPrint spans both the front and back printed faces",
);
assert.ok(
  frame.some(
    ({ box }) =>
      box.max.z > glassBox.max.z && box.min.z < cardBox.min.z,
  ),
  "Mint frame wraps both the front glass and the rear card",
);

console.log(
  JSON.stringify(
    {
      passed: true,
      parts: Object.fromEntries(parts),
      cardDepth: [cardBox.min.z, cardBox.max.z],
      glassDepth: [glassBox.min.z, glassBox.max.z],
      acrylicDepth: [acrylicBox.min.z, acrylicBox.max.z],
      retiredParts: ["optical-core", "optical-lenses"],
    },
    null,
    2,
  ),
);
