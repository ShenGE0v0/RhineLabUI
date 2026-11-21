import * as THREE from "three";

const surfaces: Record<string, string> = {
  Frosted_Polymer: "#6b6257", Ivory_Edges: "#7a6e60", Optical_Diffuser: "#1e1a16",
  Titanium_Fasteners: "#b9ab97", Index_Inlay: "#b49a7b", Printed_Label: "#332d26",
  Subsurface_Optics: "#a89a89", Optical_Edges: "#c7b8a5", Carbon_Ink: "#c2b29f",
  // A 版模型的材质名。缺了这几行，暗色主题下新模型会退成中性灰。
  Shell_White: "#786c5e", A_Frame: "#6b5f52", CardA_Print: "#332d26",
  A_IndexInlay: "#b49a7b", A_Fastener: "#b9ab97",
  // ref 版模型的材质名。
  REF_Acrylic: "#6b6257", REF_Glass: "#6b6257", REF_FrameMint: "#6b5f52", REF_FrameMintIn: "#6b5f52",
  REF_CardPrint: "#332d26", REF_PanelWhite: "#786c5e", REF_BackPlate: "#786c5e",
  REF_Steel: "#b9ab97", REF_Slot: "#b9ab97", REF_Ruler: "#c7b8a5", REF_FrameInk: "#c7b8a5",
  REF_Tape: "#b49a7b", REF_SealTape: "#b49a7b", REF_SealPaper: "#e8dcc8",
};
/** 印刷品在暗色下按亮度反相，白纸变深、墨字变浅。 */
const PRINTED = new Set(["Printed_Canvas", "CardA_Print", "REF_CardPrint"]);
/** Extend existing optical shaders; one float per instance avoids new meshes or passes. */
export function themeMaterial(material: THREE.Material, name: string, instanced = false, subduedIndex = { value: 0 }) {
  const amount = { value: 0 };
  const before = material.onBeforeCompile;
  const cache = material.customProgramCacheKey.bind(material)();
  const color = new THREE.Color(surfaces[name] ?? (name.includes("Orange") ? "#bb8850" : "#969f9f"));
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.rhineTheme = amount;
    shader.uniforms.rhineDarkSurface = { value: color };
    shader.uniforms.rhineSubduedIndex = subduedIndex;
    if (instanced) {
      shader.vertexShader = "attribute float archiveTheme; varying float vRhineTheme;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRhineTheme = archiveTheme;");
      shader.fragmentShader = "varying float vRhineTheme;\n" + shader.fragmentShader;
    }
    shader.fragmentShader = "uniform float rhineTheme; uniform vec3 rhineDarkSurface; uniform float rhineSubduedIndex;\n" + shader.fragmentShader;
    const mix = instanced ? "vRhineTheme" : "rhineTheme";
    const printed = PRINTED.has(name);
    // 印刷品按亮度反相：白纸变深、墨字变浅。纯亮度反相会把青绿压成中性灰，
    // 所以对**明显有色的**像素再把色度叠回去；中性纸面的色度接近 0，
    // 用 step 挡掉，避免深色底被微弱的偏色放大成整片绿。
    const luma = "dot(diffuseColor.rgb, vec3(.2126,.7152,.0722))";
    const chroma = "max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b)";
    const printedDark =
      `clamp(mix(vec3(0.023, 0.019, 0.015), vec3(0.78, 0.73, 0.65), 1.0 - smoothstep(0.12, 0.65, ${luma}))` +
      ` + (diffuseColor.rgb - vec3(${luma})) * 0.5 * step(0.12, ${chroma}), 0.0, 1.0)`;
    const anchor = printed ? "#include <opaque_fragment>" : "#include <roughnessmap_fragment>";
    const dark = printed
      ? printedDark
      : (name === "Frosted_Polymer" || name === "REF_Glass") && !instanced
        ? "mix(rhineDarkSurface, vec3(0.98, 0.94, 0.88), glassRevealAtHeight(archiveClarity, vArchiveHeight))"
        : name === "Index_Inlay" ? "mix(rhineDarkSurface, vec3(0.035, 0.028, 0.022), rhineSubduedIndex)" : "rhineDarkSurface";
    const output = printed ? "outgoingLight" : "diffuseColor.rgb";
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${output} = mix(${output}, ${dark}, ${mix});\n${anchor}`);
  };
  material.customProgramCacheKey = () => `${cache}-rhine-theme-${name}-${instanced}`;
  return amount;
}

type Baseline = { background: THREE.Color; fog?: THREE.Color; intensity: number; exposure: number; lights: { light: THREE.Light; intensity: number }[]; floor?: { material: THREE.MeshStandardMaterial; color: THREE.Color } };
const scenes = new WeakMap<THREE.Scene, Baseline>();
const background = new THREE.Color("#171411"), floorColor = new THREE.Color("#211d18"), mistColor = new THREE.Color("#2b251f");
export function themeEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, amount: number) {
  let baseline = scenes.get(scene);
  if (!baseline) {
    const lights: Baseline["lights"] = [];
    scene.traverse(object => { if (object instanceof THREE.Light) lights.push({ light: object, intensity: object.intensity }); });
    const floor = scene.getObjectByName("archive-floor") as THREE.Mesh | undefined;
    const material = floor?.material as THREE.MeshStandardMaterial | undefined;
    baseline = { background: (scene.background as THREE.Color).clone(), fog: scene.fog?.color.clone(), intensity: scene.environmentIntensity,
      exposure: renderer.toneMappingExposure, lights, floor: material ? { material, color: material.color.clone() } : undefined };
    scenes.set(scene, baseline);
  }
  (scene.background as THREE.Color).copy(baseline.background).lerp(background, amount);
  if (scene.fog && baseline.fog) scene.fog.color.copy(baseline.fog).lerp(mistColor, amount);
  if (baseline.floor) baseline.floor.material.color.copy(baseline.floor.color).lerp(floorColor, amount);
  scene.environmentIntensity = THREE.MathUtils.lerp(baseline.intensity, .32, amount);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(baseline.exposure, .98, amount);
  for (const { light, intensity } of baseline.lights) light.intensity = intensity * (1 - .35 * amount);
}
