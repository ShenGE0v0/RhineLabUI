import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { glassRevealAtHeight as reveal } from "../src/glass-reveal.ts";
import { decryptionFrame } from "../src/decryption.ts";

// The REF asset embeds its card texture. Geometry checks only need a decoder
// placeholder so GLTFLoader can finish parsing the material.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({
  width: 1,
  height: 1,
  close() {},
});

async function load(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  const scene = (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
  ).scene;
  scene.updateMatrixWorld(true);
  return scene;
}

const assembly = await load("../public/assets/archive-assembly.glb");
const boxes = new Map();
const meshes = new Map();
const names = new Set();
assembly.traverse((mesh) => {
  if (!mesh.isMesh) return;
  const name = mesh.material.name.replace(/\.\d+$/, "");
  names.add(name);
  if (!boxes.has(name)) boxes.set(name, []);
  boxes.get(name).push(new THREE.Box3().setFromObject(mesh));
  if (!meshes.has(name)) meshes.set(name, []);
  meshes.get(name).push(mesh);
});

for (const name of [
  "REF_Acrylic",
  "REF_Glass",
  "REF_FrameMint",
  "REF_FrameMintIn",
  "REF_CardPrint",
  "REF_PanelWhite",
  "REF_BackPlate",
  "REF_Ruler",
  "REF_FrameInk",
  "REF_SealTape",
])
  assert.ok(names.has(name), `Missing REF surface: ${name}`);

const glass = boxes.get("REF_Glass")[0];
const card = boxes.get("REF_CardPrint")[0];
const frame = boxes.get("REF_FrameMint")[0];
const acrylic = boxes.get("REF_Acrylic")[0];

const seals = meshes.get("REF_SealTape");
assert.equal(seals.length, 1, "The seal is a single unprinted paper band");
assert.ok(!names.has("REF_SealPaper"), "The old applied label is removed");
assert.equal(seals[0].userData.assemblyPart, "body");
const seal = boxes.get("REF_SealTape")[0];
const sealSize = seal.getSize(new THREE.Vector3());
assert.ok(Math.abs(sealSize.x - 0.22) < 0.001);
assert.ok(sealSize.y > 0.22 && sealSize.y < 0.24);
assert.ok(Math.abs(seal.getCenter(new THREE.Vector3()).x + 6.73358) < 0.001);
assert.ok(seal.max.y > frame.max.y && seal.min.y < frame.max.y);
assert.ok(seal.max.z > frame.max.z && seal.min.z < frame.min.z, "The seal folds over both rims");
assert.ok(glass.min.z > card.max.z, "Glass sits in front of the printed card");
assert.ok(frame.max.z > glass.max.z, "Mint frame sits proud of the glass");
assert.ok(acrylic.min.z < card.min.z, "Acrylic tube wraps behind the card");
assert.ok(
  Math.abs(frame.max.z - acrylic.max.z - 0.005) < 1e-3 &&
    Math.abs(acrylic.min.z - frame.min.z - 0.005) < 1e-3,
  "The hollow acrylic wall ends behind the front and rear rims",
);
const acrylicMesh = meshes.get("REF_Acrylic")[0];
const acrylicPosition = acrylicMesh.geometry.attributes.position;
let centerVertices = 0;
for (let i = 0; i < acrylicPosition.count; i++) {
  const x = acrylicPosition.getX(i);
  const y = acrylicPosition.getY(i);
  if (x > -6.5 && x < -2.5 && y > 0.5 && y < 3.2) centerVertices++;
}
assert.equal(
  centerVertices,
  0,
  "Acrylic body has an open center rather than a full front/back cap",
);
assert.ok(
  acrylicPosition.count > 100,
  "Acrylic body is a perimeter ring, not a 16-vertex solid box",
);
assert.ok(
  Math.abs(card.getSize(new THREE.Vector3()).x - 4.09) < 0.01,
  "Card width matches the REF layout",
);
assert.ok(
  Math.abs(card.getSize(new THREE.Vector3()).y - 3.058) < 0.01,
  "Card height matches the REF layout",
);
for (let h = 0; h <= 1; h += 0.01) {
  assert.equal(reveal(0, h), 0);
  assert.equal(reveal(1, h), 1);
  let last = 0;
  for (let p = 0; p <= 1; p += 0.01) {
    const next = reveal(p, h);
    assert.ok(next >= last);
    last = next;
  }
}
assert.equal(reveal(0.5, 0.9), 1);
assert.equal(reveal(0.5, 0.1), 0);

let last = 0;
for (let t = 38.84; t <= 39.56; t += 0.001) {
  const p = decryptionFrame(t).clarity;
  assert.ok(p >= last);
  last = p;
}
assert.equal(decryptionFrame(38.84).clarity, 0);
assert.equal(decryptionFrame(39.56).clarity, 1);

console.log(
  JSON.stringify(
    {
      passed: true,
      surfaces: [...names].sort(),
      glassDepth: [glass.min.z, glass.max.z],
      cardDepth: [card.min.z, card.max.z],
      frameDepth: [frame.min.z, frame.max.z],
      acrylicDepth: [acrylic.min.z, acrylic.max.z],
      acrylicCenterVertices: centerVertices,
      reveal: "fully frosted → top to bottom → fully clear",
    },
    null,
    2,
  ),
);
