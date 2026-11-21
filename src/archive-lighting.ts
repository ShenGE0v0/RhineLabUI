import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type LightingLook = "baseline" | "refined";

// The archive and its independent viewer use the same studio illumination.
// Each renderer needs its own PMREM render target / WebGL texture.
export function createArchiveLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  look: LightingLook = "baseline",
) {
  const refined = look === "refined";
  renderer.toneMappingExposure = refined ? 0.98 : 1.0;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  // Keep the room probe only for glass and metal reflections. The actual
  // modelling light is the low side key below; no hemisphere wash.
  scene.environmentIntensity = refined ? 0.2 : 0.18;
  const key = new THREE.SpotLight(
    "#ffd8ba",
    refined ? 980 : 900,
    120,
    0.5,
    0.85,
    1.65,
  );
  key.position.set(-30, 8, 20);
  key.target.position.set(0, 0, 0);
  // A broad, soft cone keeps the array covered while the inverse-square
  // falloff still separates the near files from the rows behind them.
  key.castShadow = true;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 120;
  key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(
    "#f4e8d8",
    refined ? 0.07 : 0.08,
  );
  fill.position.set(18, 9, -14);
  scene.add(key.target);
  scene.add(key, fill);
  return { key, fill };
}
