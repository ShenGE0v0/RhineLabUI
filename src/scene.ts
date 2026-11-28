import * as THREE from "three";
import { ArchiveVisibility } from "./archive-visibility";
import {
  ArchiveDrawCoverage,
  ArchiveShadowCoverage,
} from "./archive-draw-coverage";
import { InstanceUpdates } from "./instance-updates";
import { RenderState } from "./render-state";
import { SharedDepthBokeh } from "./shared-depth";
import { disposeThreeTree } from "./three-resources";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createArchiveLighting, type LightingLook } from "./archive-lighting";
import {
  applyOverviewLook,
  installOverviewSealFill,
} from "./archive-overview-look";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import {
  matchingPreset,
  normalizeQuality,
  OVERVIEW_TRANSMISSION_LIMIT,
  type RenderQuality,
} from "./render-quality";
import { applyTextureQuality, resizeQuality } from "./quality-renderer";
import { CardAppearance } from "./appearance";
import { configureInternalOptics } from "./internal-optics";
import {
  ARRAY_ROLES,
  REVEAL_ROLE,
  surfaceName,
  surfaceRole,
  type SurfaceRole,
} from "./archive-surfaces";
import {
  ArchiveSlotUnderlights,
  MAX_OVERVIEW_SLOT_LIGHTS,
} from "./archive-slot-underlight";
import {
  archiveColumns,
  fileLocation,
  records,
  resolveRecordCover,
  resolveRecordPrompt,
  type ArchiveCardStats,
  type ArchiveRecord,
} from "./data";
import {
  FACE_COVER_RECT,
  FACE_NOTE_RECT,
  PULLOUT_CANVAS_H,
  PULLOUT_CANVAS_W,
  PULLOUT_CARD_H,
  PULLOUT_CARD_W,
  STICKER_CANVAS_H,
  STICKER_CANVAS_W,
  STICKER_H,
  STICKER_LOCAL_X,
  STICKER_LOCAL_Y,
  STICKER_SHADOW_H,
  STICKER_SHADOW_W,
  STICKER_TILT_Z,
  STICKER_W,
  TOGGLE_CANVAS_H,
  TOGGLE_CANVAS_W,
  TOGGLE_LOCAL_X,
  TOGGLE_LOCAL_Y,
  TOGGLE_PLANE_H,
  TOGGLE_PLANE_W,
  drawDetailToggleTrigger,
  drawFaceHoverAccents,
  drawIndustrialDieCutSticker,
  drawPulloutDetailCard,
  drawStandaloneDetailToggle,
  drawStickerBackMask,
  drawStickerContactShadow,
  hitTestDetailFace,
  hitTestPulloutCard,
  hitTestStickerFace,
  type DetailHotspot,
  type DetailSurfaceState,
  type PulloutCardLayout,
  type RectBox,
  type ShowcaseStatRects,
} from "./detail-card-surface";
import {
  modelProvider,
  modelProviderAssetPath,
  type ModelProvider,
} from "./model-provider";
import {
  cellKey,
  sameCell,
  selectionCell,
  fileAtCell,
  poolCell,
  LOOP_COLUMNS,
  LOOP_ROWS,
  COLUMN_SPACING,
  ROW_SPACING,
  type ArchiveCell,
  type ArchiveNavigation,
} from "./archive-loop";
import { labelMarkSvg } from "./brand";
import { archiveFraming } from "./viewport-layout";
import {
  ArchiveDrag,
  ArchivePlaneMomentum,
  type DragAxis,
  type DragProjection,
  type DragPosition,
} from "./archive-drag";
import { assetUrl as publicAsset } from "./asset-url";
import {
  fullMotion,
  reducedMotion,
  type MotionPreferences,
} from "./motion-preferences";
import {
  baselineSelectionWave,
  rippleEnvelope,
  settlingWave,
  damp,
  columnStrength,
  idleWave,
  INSPECTION_LIFT,
  returnStep,
} from "./motion";
import {
  MIST_HIDE_DURATION_MS,
  MIST_RETURN_DURATION_MS,
  MIST_SWITCH_DURATION_MS,
  clamp01,
  easeMistReveal,
  easeOutCubic,
  easeOutQuad,
} from "./mist-etch-dissolve";

interface MistDissolveShaderUniforms {
  uProgress: { value: number };
  uHiding: { value: number };
  uActive: { value: number };
  uModeSwitch: { value: number };
  uSeed: { value: number };
  uTexelSize: { value: THREE.Vector2 };
}

function glslFloat(value: number) {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

function snapSpring(
  spring: { value: number; velocity: number },
  target: number,
  valueEps = 0.0005,
  velEps = 0.002,
) {
  if (
    Math.abs(spring.value - target) < valueEps &&
    Math.abs(spring.velocity) < velEps
  ) {
    spring.value = target;
    spring.velocity = 0;
  }
}

let rectAreaLightsInitialized = false;
function ensureRectAreaLightSupport() {
  if (rectAreaLightsInitialized) return;
  RectAreaLightUniformsLib.init();
  rectAreaLightsInitialized = true;
}

/** Authored label layout; the canvas is this size multiplied by LABEL_SCALE. */
const LABEL_WIDTH = 1024;
const LABEL_HEIGHT = 440;
const LABEL_SCALE = 2;
/** Full-face RGBA plate mapped to REF_Glass (x: -2.362..2.362, y: 0.139..3.565).
 *  Transparent margins preserve the frosted glass and warm amber underlight,
 *  while opaque regions render the model badge, replaceable showcase photo,
 *  and bottom status/metric tags cleanly on the front surface. */
const OVERVIEW_BADGE_WIDTH = 2048;
const OVERVIEW_BADGE_HEIGHT = 1485;
const OVERVIEW_BADGE_SCALE = 1;
const OVERVIEW_SETTLE_SCALE = 0.5;
const OVERVIEW_HEADER_SCALE = 0.5;
const OVERVIEW_HEADER_HEIGHT = 386;
const OVERVIEW_HEADER_FRACTION = OVERVIEW_HEADER_HEIGHT / OVERVIEW_BADGE_HEIGHT;
const MAX_OVERVIEW_HEADER_CACHE = 12;
const MAX_OVERVIEW_FULL_CACHE = 12;
const OVERVIEW_BADGE_SETTLE_SECONDS = 0.42;
const HOVER_BADGE_HEIGHT = 192;
const HOVER_BADGE_SCALE = 0.5;
const MAX_HOVER_BADGE_CACHE = 24;
const HOVER_STICKER_SCALE = 0.5;
const MAX_HOVER_STICKER_CACHE = 16;
/** 贴纸组沿玻璃法线抬离 `glassFrontZ` 的距离（局部单位），贴纸正面据此贴附在
 *  玻璃外侧。 */
const STICKER_PLATE_LIFT = 0.01;
/** 接触投影层相对贴纸组原点的局部 z；负值表示位于贴纸正面之后，取值范围必须
 *  落在 (-STICKER_PLATE_LIFT, 0) 之内，才能既压住正面片又留在玻璃前表面之前
 *  （当前局部 -0.0025，即玻璃前 +0.0075）。这里不使用 polygonOffset：它的斜率
 *  项在斜视时会超过这点净距，把整片阴影推到玻璃背后并被深度测试吃掉。 */
const STICKER_CONTACT_SHADOW_LOCAL_Z = -0.0025;
/** 卷翘角顺序，与着色器 uPeel 的 x/y/z/w 分量及顶点变形一致：右上、右下、左下、左上。 */
const STICKER_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];
/** 静置时唯一保留轻卷的角（右下）；其余三个角一开始必须完全平整。 */
const STICKER_REST_CORNER = 1;
/** 指针停在贴纸上时，离指针最近的角掀起到的幅度。 */
const STICKER_HOVER_PEEL = 0.78;
const ARCHIVAL_NOTE_GAP = 48;
const HOVER_STICKER_SHADED_COLOR = new THREE.Color("#a89179");
const HOVER_STICKER_LIT_COLOR = new THREE.Color("#ebe7df");
const HOVER_STICKER_SHADED_EMISSIVE = new THREE.Color("#7f664d");
const HOVER_STICKER_LIT_EMISSIVE = new THREE.Color("#f7f4ec");
const DETAIL_TOGGLE_INK_COLOR = new THREE.Color("#4c4338");
const DETAIL_TOGGLE_HOVER_COLOR = new THREE.Color("#221d17");

/** 卷翘抬升幅度：0.028 的常数项在 p→0 时会让角部残留一整块抬升，用 0.1 的
 *  包络把起落拉回零；p >= 0.1 的静置/掀起外观与旧实现完全一致。几何变形与
 *  换角门限共用这一个公式，避免两处走散。 */
function stickerPeelLift(peel: number) {
  const p = THREE.MathUtils.clamp(peel, 0, 1);
  return (0.028 + p * 0.082) * THREE.MathUtils.smoothstep(p, 0, 0.1);
}

/** GLB 首次加载可能撞上开发服务器重启或瞬时网络抖动；重试 3 次后再交给启动兜底页。 */
async function loadGltfWithRetry(url: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await new GLTFLoader().loadAsync(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * (attempt + 1)),
        );
      }
    }
  }
  throw lastError;
}

function deformStickerGeometry(
  geom: THREE.PlaneGeometry,
  base: Float32Array,
  peels: ArrayLike<number>,
) {
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const halfW = STICKER_W / 2;
  const halfH = STICKER_H / 2;

  for (let i = 0; i < arr.length; i += 3) {
    const bx = base[i];
    const by = base[i + 1];
    // 一个顶点可能同时落在两个角的卷翘范围内（过渡瞬间），取抬升更大的一角。
    let bestCurl = 0;
    let bestSignX = 1;
    let bestSignY = -1;
    for (let corner = 0; corner < STICKER_CORNERS.length; corner++) {
      const p = THREE.MathUtils.clamp(peels[corner] ?? 0, 0, 1);
      if (p <= 0.0001) continue;
      const signX = STICKER_CORNERS[corner][0];
      const signY = STICKER_CORNERS[corner][1];
      const radius = THREE.MathUtils.lerp(0.22, 0.38, p);
      const maxLift = stickerPeelLift(p);
      // 以该角为原点、朝纸面内侧的两条轴距。
      const dx = halfW - signX * bx;
      const dy = halfH - signY * by;
      const s = dx * 0.72 + dy * 0.69;
      if (s >= radius) continue;
      const u = 1 - s / radius;
      const curve = u * u * (0.45 + 0.55 * u);
      const curlZ = maxLift * curve;
      if (curlZ > bestCurl) {
        bestCurl = curlZ;
        bestSignX = signX;
        bestSignY = signY;
      }
    }
    if (bestCurl > 0) {
      arr[i] = bx - bestSignX * bestCurl * 0.52;
      arr[i + 1] = by - bestSignY * bestCurl * 0.52;
      arr[i + 2] = base[i + 2] + bestCurl;
    } else {
      arr[i] = bx;
      arr[i + 1] = by;
      arr[i + 2] = base[i + 2];
    }
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
}

/** 贴纸局部坐标落在哪个角：0 右上、1 右下、2 左下、3 左上。 */
function stickerCornerAt(localX: number, localY: number): number {
  if (localY >= 0) return localX >= 0 ? 0 : 3;
  return localX >= 0 ? 1 : 2;
}

/** The reference is a single warm ivory family; structure is separated by
 *  value and soft shadow instead of a contrasting mint outline. */
const WARM = {
  field: "#f3eee5",
  floor: "#e8ddd2",
  shell: "#f7efe7",
  frame: "#e2d2c3",
  frameInner: "#d6c4b3",
  frameInk: "#b8a68e",
  ruler: "#c8b8a1",
  edge: "#f5eee3",
  arrayEdge: "#e2d5c3",
  card: "#f8f2e8",
  label: "#faf5ec",
  diffuser: "#e4d6c8",
  ceramic: "#e3d6c4",
  glass: "#fffaf2",
  glassAttenuation: "#f1e3cf",
  acrylicAttenuation: "#f0e2cf",
  opticsBody: "#d9cbb8",
  opticsEdge: "#e8dccb",
  accent: "#c9b69e",
  fastener: "#8c7b67",
  slot: "#d8c8b1",
  ink: "#2b2823",
  mutedInk: "#8c7a63",
} as const;

const OVERVIEW_MIST = new THREE.Color("#f3eee8");
const LIGHT_OVERVIEW_KEY_POSITION = new THREE.Vector3(-23, 21, 5);
const LIGHT_OVERVIEW_KEY_TARGET = new THREE.Vector3(-2.0, -1.0, -3.5);
const LIGHT_OVERVIEW_KEY_COLOR = new THREE.Color("#ffead6");
const LIGHT_OVERVIEW_FILL_POSITION = new THREE.Vector3(16, 14, 24);
const LIGHT_OVERVIEW_FILL_COLOR = new THREE.Color("#ffead8");
const UNSELECTED_OVERVIEW_BASE_GAIN = 0.84;
const OVERVIEW_AZIMUTH = THREE.MathUtils.degToRad(60.5);
const OVERVIEW_ELEVATION = THREE.MathUtils.degToRad(21);
const OVERVIEW_LIFT = 0.4;
const OVERVIEW_VISUAL_LIFT = 0.4;
const HOVER_PREVIEW_LIFT = 0.38;
const LIGHT_OVERVIEW_ROLL = THREE.MathUtils.degToRad(1.25);
const LIGHT_OVERVIEW_HORIZONTAL_SCALE = 0.97;
const LIGHT_OVERVIEW_VERTICAL_SCALE = 1.02;
const SELECTED_ROW_ANCHOR_Z = -2.17;
const LIGHT_OVERVIEW_FOCUS_HEIGHT = 3.45;
const DETAIL_FRAME_HEIGHT = 0.72;
const DETAIL_FRAME_ABSOLUTE_MAX_WIDTH = 0.84;
const DETAIL_FRAME_EDGE_SAFE = 0.08;
const DETAIL_FRAME_CENTER_X = 0.42;
const DETAIL_FRAME_CENTER_Y = 0.47;
const DETAIL_TARGET_AZIMUTH = THREE.MathUtils.degToRad(28);
const DETAIL_TARGET_ELEVATION = THREE.MathUtils.degToRad(11);
const DETAIL_CAMERA_LEAD_START = OVERVIEW_LIFT + 0.02;
const DETAIL_CAMERA_LEAD_END = OVERVIEW_LIFT + 0.34;
const DETAIL_CAMERA_AIM_OPEN_RATE = 4.5;
const DETAIL_CAMERA_ORBIT_OPEN_RATE = 4.3;
const DETAIL_CAMERA_CLOSE_RATE = 4.6;
const DETAIL_LIFT_OPEN_RATE = 3.8;
const OVERVIEW_APERTURE = 0.0003;
const LIGHT_OVERVIEW_APERTURE_DELTA = 0.00006;
const OVERVIEW_RECT_LIGHT_WIDTH = 36;
const OVERVIEW_RECT_LIGHT_HEIGHT = 0.29;
const OVERVIEW_RECT_LIGHT_Y = -3.35;
const OVERVIEW_RECT_LIGHT_Z_OFFSET = 0.12;
const OVERVIEW_RECT_LIGHT_INTENSITY = 30;
const REFERENCE_ROW_SPACING = 0.43;
const MAX_OUTGOING_POOL = 4;
const OUTGOING_NORMAL_RETURN_COUNT = 3;
const OUTGOING_CATCH_UP_RATE = 18;
const MIN_OUTGOING_SPAWN_LIFT = 0.035;
const OUTGOING_FINISH_LIFT = 0.002;
const UNDERLIGHT_SLOT_STRENGTH: Partial<Record<SurfaceRole, number>> = {
  acrylic: 0.03,
  glass: 0.024,
  frame: 0.026,
  shell: 0.019,
  edge: 0.024,
  card: 0.012,
  diffuser: 0.016,
  index: 0.015,
};
/** Constant low strip. Acceptance gain never multiplies this term. */
const UNDERLIGHT_BASE_STRENGTH = 0.125;
const UNDERLIGHT_ACTIVE_STRENGTH: Partial<Record<SurfaceRole, number>> = {
  acrylic: 0.48,
  glass: 0.276,
  frame: 0.34,
  shell: 0.18,
  edge: 0.15,
  card: 0.08,
  diffuser: 0.06,
  index: 0.04,
  engrave: 0.26,
};
const UNDERLIGHT_END_STRENGTH: Partial<Record<SurfaceRole, number>> = {
  acrylic: 1.32,
  glass: 0.56,
  frame: 0.92,
  shell: 0.32,
  edge: 0.275,
  engrave: 0.68,
};
const UNDERLIGHT_REFLECTION_STRENGTH: Partial<Record<SurfaceRole, number>> = {
  acrylic: 0.38,
  glass: 0.2,
  frame: 0.32,
  shell: 0.14,
  edge: 0.26,
  card: 0.04,
  diffuser: 0.04,
  index: 0.02,
};
const UNDERLIGHT_LATERAL_STRENGTH: Partial<Record<SurfaceRole, number>> = {
  acrylic: 0.44,
  glass: 0.32,
  frame: 0.34,
  shell: 0.22,
  card: 0.16,
  edge: 0.12,
};
type OverviewSlotLightUniforms = {
  direct: { value: number };
  reflection: { value: number };
  lateral: { value: number };
  topRail: { value: number };
};

/** Blender 导出的最新 REF 资产把物体原点留在左侧；生产相机按模型居中构图。
 *  加载时把 X 归中、Y 落到 0，避免模型在阵列和详情里整体偏出画面。 */
function normalizeArchiveScene(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    offset: new THREE.Vector3(
      -(bounds.min.x + bounds.max.x) / 2,
      -bounds.min.y,
      0,
    ),
    centerY: size.y / 2,
  };
}

/** Wrap a label string into at most two lines that fit the column.
 *  Long English titles break at a space instead of shrinking, so the printed
 *  size stays readable. When the last allowed line still has words left, they
 *  are folded into it rather than dropped. */
function wrapLabelText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines = 2,
) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return [] as string[];
  if (context.measureText(text).width <= maxWidth) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? line + " " + word : word;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      // This is the last line we may emit: fold the rest in so nothing is lost.
      if (lines.length === maxLines - 1) {
        lines.push([line, ...words.slice(i)].join(" "));
        return lines;
      }
      lines.push(line);
    }
    line = word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Fit one line to the column. The returned text is guaranteed to fit; the
 *  caller can draw it without leaving a clip state behind. */
function fitOneLine(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  minSize?: number,
) {
  const text = value.trim();
  if (!text || context.measureText(text).width <= maxWidth) return text;
  const size = parseFloat(context.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "0");
  if (size > 0) {
    const scaled = Math.max(
      minSize ?? size * 0.5,
      size * (maxWidth / context.measureText(text).width),
    );
    context.font = context.font.replace(
      /(\d+(?:\.\d+)?)px/,
      `${Math.floor(scaled)}px`,
    );
    if (context.measureText(text).width <= maxWidth) return text;
  }
  // The font floor is still too wide for a pathological string. Keep the
  // result inside the column instead of leaving a clip that affects later rows.
  let end = text.length;
  while (
    end > 1 &&
    context.measureText(text.slice(0, end) + "…").width > maxWidth
  )
    end--;
  return end > 1 ? text.slice(0, end).trimEnd() + "…" : "…";
}

/** Draw wrapped lines with the last line anchored to the given baseline. */
function fillLabelLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  lastBaseline: number,
  lineHeight: number,
) {
  const firstBaseline = lastBaseline - (lines.length - 1) * lineHeight;
  lines.forEach((line, i) =>
    context.fillText(line, x, firstBaseline + i * lineHeight),
  );
}

/** Matches the platform double-click window closely enough to feel native. */
const DOUBLE_PRESS_MS = 300;
const SELECTION_WAVE_STOP_FADE_SECONDS = 0.24;
const MAX_FROZEN_SELECTION_PULSES = 12;
const COLUMN_SWITCH_WAVE_START = 7.4;
const COLUMN_SWITCH_WAVE_SPEED = 11.5;
const COLUMN_SWITCH_WAVE_WIDTH = 2.1;
const COLUMN_SWITCH_WAVE_AMPLITUDE = 0.85;
const OVERVIEW_RIGHT_X = Math.cos(OVERVIEW_AZIMUTH);
const OVERVIEW_RIGHT_Z = Math.sin(OVERVIEW_AZIMUTH);
// 4-stage overview entrance: flat hold -> right-to-left wave raising the
// terrace -> amber bar glide from left-back -> direct full lift unlock once
// the bar reaches the selected slot (no pre-select half-lift stage).
const INTRO_FLAT_HOLD = 0.5;
const INTRO_WAVE_START = 9.5;
const INTRO_WAVE_SPEED = 13.0;
const INTRO_WAVE_WIDTH = 2.2;
const INTRO_WAVE_AMPLITUDE = 1.05;
const INTRO_TERRACE_FALLBACK_START = 1.85;
const INTRO_TERRACE_FALLBACK_SECONDS = 0.55;
const INTRO_LIGHT_START = 1.35;
const INTRO_LIGHT_DURATION = 0.85;
const INTRO_BAR_START_OFFSET = 22;
const INTRO_FULL_LIFT_THRESHOLD = 0.35;
const INTRO_TOTAL_DURATION = 3.2;
const INTRO_RELEASE_DURATION = 0.35;
const OVERVIEW_WARMUP_BUDGET_MS = 1500;
/** Terrace weight and transient crest for one cell during the intro.
 *  The terrace rises on the leading slope of the wave so the crest flings
 *  each column straight into (and slightly past) its starting height, then
 *  settles smoothly down onto the terrace with zero post-crest lift. */
function introField(rightOffset: number, t: number, terraceTarget: number) {
  const waveAge = t - INTRO_FLAT_HOLD;
  if (waveAge <= 0) return { crest: 0, terrace: 0 };
  const front = INTRO_WAVE_START - waveAge * INTRO_WAVE_SPEED;
  const delta = rightOffset - front;
  const enter = ease(waveAge / 0.18);
  const fallback = ease(
    (t - INTRO_TERRACE_FALLBACK_START) / INTRO_TERRACE_FALLBACK_SECONDS,
  );
  const wake =
    ease((delta + INTRO_WAVE_WIDTH * 1.65) / (INTRO_WAVE_WIDTH * 1.85)) * enter;
  const terrace = Math.max(wake, fallback);
  const overshootScale =
    1 - 0.6 * Math.max(0, Math.min(1, terraceTarget / 2.15));
  const crest =
    INTRO_WAVE_AMPLITUDE *
    overshootScale *
    enter *
    (1 - fallback) *
    Math.exp(-0.5 * (delta / INTRO_WAVE_WIDTH) ** 2);
  return { crest, terrace };
}

type SelectionWavePulse = { row: number; lane: number; time: number };
type FrozenSelectionWavePulse = SelectionWavePulse & { stoppedAt: number };
type FixedDetailCameraPose = {
  aim: THREE.Vector3;
  azimuth: number;
  elevation: number;
  distance: number;
  roll: number;
  fov: number;
  projectionScaleX: number;
  projectionScaleY: number;
  focusDepth: number;
};
type FixedDetailCameraBasis = {
  index: number;
  x: number;
  y: number;
  z: number;
  aspect: number;
  drawer: number;
};

const ease = (t: number) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Right-to-left sweeping swell for cross-column switches so the wave rises
 *  smoothly from the right side of the viewport and glides leftward. */
function columnSwitchWave(
  row: number,
  lane: number,
  originRow: number,
  originLane: number,
  age: number,
) {
  if (age <= 0 || age > 2.4) return 0;
  const rightOffset =
    (lane - originLane) * COLUMN_SPACING * OVERVIEW_RIGHT_X +
    (row - originRow) * ROW_SPACING * OVERVIEW_RIGHT_Z;
  const front = COLUMN_SWITCH_WAVE_START - age * COLUMN_SWITCH_WAVE_SPEED;
  const delta = rightOffset - front;
  const enter = ease(age / 0.14);
  const decay = Math.exp(-age * 0.72);
  const crest = Math.exp(-0.5 * (delta / COLUMN_SWITCH_WAVE_WIDTH) ** 2);
  return COLUMN_SWITCH_WAVE_AMPLITUDE * enter * decay * crest;
}
export class ArchiveScene {
  private inputEvents = new AbortController();
  revealImmediately() {
    this.reveal = this.targetReveal;
  }
  get isIntroActive() {
    return this.intro !== null;
  }
  playIntro() {
    if (
      !this.motion.selectionTransition ||
      !this.motion.selectionWave ||
      this.targetDetail > 0 ||
      this.detail > 0.01 ||
      this.fixedDetailCameraHeld ||
      this.returnY !== null ||
      this.rotation !== 0
    ) {
      this.finishIntro();
      if (
        this.targetDetail <= 0 &&
        this.detail <= 0.01 &&
        !this.fixedDetailCameraHeld &&
        this.returnY === null &&
        this.rotation === 0
      ) {
        const chosen = this.cellPosition(this.selectedCell);
        this.columnCamera = { value: chosen.x, velocity: 0 };
        this.rail = { value: SELECTED_ROW_ANCHOR_Z - chosen.z, velocity: 0 };
        this.shoulder = { value: this.selectedCell.row, velocity: 0 };
        this.laneFocus = { value: this.selectedCell.lane, velocity: 0 };
        if (!this.motion.selectionTransition) {
          this.lift = {
            value: OVERVIEW_LIFT * this.targetReveal,
            velocity: 0,
          };
        }
        this.renderState.invalidate();
      }
      return;
    }
    this.cancelPointer();
    for (const { group } of this.outgoing) {
      this.releaseOutgoingGroup(group);
    }
    this.outgoing.length = 0;
    this.introRelease = null;
    const chosen = this.cellPosition(this.selectedCell);
    this.columnCamera = { value: chosen.x, velocity: 0 };
    this.rail = { value: SELECTED_ROW_ANCHOR_Z - chosen.z, velocity: 0 };
    this.shoulder = { value: this.selectedCell.row, velocity: 0 };
    this.laneFocus = { value: this.selectedCell.lane, velocity: 0 };
    this.lift = { value: 0, velocity: 0 };
    this.pulses = [];
    this.frozenPulses = [];
    this.pendingPulse = null;
    this.slotUnderlights.select(this.selectedCell, true);
    this.slotUnderlights.setBarRow(
      this.selectedCell.row - INTRO_BAR_START_OFFSET,
    );
    this.slotUnderlights.setIntroGain(0);
    this.intro = { elapsed: 0, fullLiftUnlocked: false, started: false };
    this.pendingOverviewBadgeRefresh = false;
    this.cameraInitialized = false;
    this.idleGain = 0;
    this.lastInteraction = this.clock;
    this.renderState.invalidate();
    this.onIntroChange?.(true);
  }
  finishIntro(snapBar = false, skipBadgeRefresh = false) {
    if (!this.intro) return;
    const barHidden = this.intro.elapsed < INTRO_LIGHT_START;
    if (this.intro.started && this.intro.elapsed < INTRO_TOTAL_DURATION) {
      this.introRelease = {
        elapsed: this.intro.elapsed,
        age: 0,
        cell: { ...this.selectedCell },
      };
    }
    this.intro = null;
    this.slotUnderlights.setIntroGain(1);
    if (snapBar || barHidden) {
      this.slotUnderlights.select(this.selectedCell, true);
    }
    if (this.pendingOverviewBadgeRefresh) {
      this.pendingOverviewBadgeRefresh = false;
      if (!skipBadgeRefresh) {
        if (this.isDetailBadgeActive())
          this.drawFullOverviewBadge(this.selectedIndex);
        else this.bindOverviewFullBadge(this.selectedIndex);
      }
    }
    this.renderState.invalidate();
    this.onIntroChange?.(false);
  }
  private async waitInitialProviderLogo(timeoutMs = 300) {
    const modelName = records[this.selectedIndex]?.en ?? "";
    this.getModelProviderLogo(modelName);
    const provider = modelProvider(modelName);
    const img = provider ? this.modelProviderImages.get(provider) : undefined;
    if (!img || img.complete) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    });
  }
  async warmUpOverview() {
    if (
      !this.loaded ||
      this.disposed ||
      this.container.clientWidth <= 0 ||
      this.container.clientHeight <= 0
    ) {
      return;
    }
    await this.waitInitialProviderLogo();
    if (
      !this.loaded ||
      this.disposed ||
      this.container.clientWidth <= 0 ||
      this.container.clientHeight <= 0
    ) {
      return;
    }
    // Pass 1: warm up the active overview state (lifted selected card with
    // clearcoat/transmission and visible underlight strip) behind #loading so
    // no shader programs compile mid-intro.
    this.targetReveal = 1;
    this.reveal = 1;
    this.finishIntro(true);
    this.introRelease = null;
    const chosen = this.cellPosition(this.selectedCell);
    this.columnCamera = { value: chosen.x, velocity: 0 };
    this.rail = { value: SELECTED_ROW_ANCHOR_Z - chosen.z, velocity: 0 };
    this.shoulder = { value: this.selectedCell.row, velocity: 0 };
    this.laneFocus = { value: this.selectedCell.lane, velocity: 0 };
    this.lift = {
      value: OVERVIEW_LIFT,
      velocity: 0,
    };
    this.slotUnderlights.select(this.selectedCell, true);
    this.slotUnderlights.setIntroGain(1);
    this.cameraInitialized = false;
    this.last = null;
    this.renderState.invalidate();
    const warmCell = {
      lane: this.selectedCell.lane + 1,
      row: this.selectedCell.row,
    };
    const warmOutgoing = this.bakedCardTexture
      ? this.acquireOutgoingGroup()
      : null;
    if (warmOutgoing) {
      this.appearance.apply(
        warmOutgoing,
        this.appearanceInSlot(
          OVERVIEW_LIFT * 0.5,
          this.slotUnderlights.directFor(warmCell),
        ),
      );
      this.appearance.setClarity(warmOutgoing, 0);
      this.scene.add(warmOutgoing);
      this.outgoing.push({
        group: warmOutgoing,
        slot: fileLocation(fileAtCell(warmCell, this.coordinateOrigin.row))
          .slot,
        cell: warmCell,
        lift: { value: OVERVIEW_LIFT * 0.5, velocity: 0 },
        returnY: null,
      });
    }
    this.warmingUp = true;
    try {
      this.update(performance.now() / 1000);
    } finally {
      this.warmingUp = false;
      if (warmOutgoing) {
        const idx = this.outgoing.findIndex((o) => o.group === warmOutgoing);
        if (idx >= 0) this.outgoing.splice(idx, 1);
        this.releaseOutgoingGroup(warmOutgoing);
      }
    }

    // Pass 2: reset back to the flat intro frame 0 before revealing the stage.
    this.playIntro();
    this.last = null;
    this.update(performance.now() / 1000);
    const gl = this.renderer.getContext();
    if ("fenceSync" in gl && typeof gl.fenceSync === "function") {
      try {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          try {
            gl.flush();
            const deadline = performance.now() + OVERVIEW_WARMUP_BUDGET_MS;
            while (
              !this.disposed &&
              performance.now() < deadline &&
              gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED
            ) {
              await new Promise<void>((resolve) => setTimeout(resolve, 16));
            }
          } finally {
            gl.deleteSync(sync);
          }
        }
      } catch (error) {
        console.warn("Overview GPU warm-up wait failed", error);
      }
    }
    if (this.disposed) return;
    this.last = null;
    if (this.intro) {
      this.intro.elapsed = 0;
      this.intro.fullLiftUnlocked = false;
      this.intro.started = false;
    }
  }
  dispose() {
    this.disposed = true;
    if (this.detailCopiedTimer) {
      window.clearTimeout(this.detailCopiedTimer);
      this.detailCopiedTimer = 0;
    }
    this.detailPulloutTexture = undefined;
    this.detailPulloutGroup = undefined;
    this.detailPulloutLayout = null;
    this.detailStickerTexture = undefined;
    this.detailStickerBackTexture = undefined;
    this.detailStickerShadowTexture = undefined;
    this.detailStickerShadowPeel.value.set(0, 0.24, 0, 0);
    this.detailStickerHoverCorner = -1;
    this.detailStickerGroup = undefined;
    this.detailStickerGeom = undefined;
    this.detailStickerBasePos = undefined;
    this.detailStickerFrontMat = undefined;
    this.detailStickerBackMat = undefined;
    this.detailStickerShadowMat = undefined;
    for (const entry of this.hoverStickerCache.values()) {
      if (entry.texture !== this.hoverStickerFrontMat?.map) entry.texture.dispose();
    }
    this.hoverStickerCache.clear();
    this.hoverStickerIndex = -1;
    this.hoverStickerCell = null;
    this.hoverStickerGroup = undefined;
    this.hoverStickerFrontMat = undefined;
    this.hoverStickerShadowMat = undefined;
    this.detailToggleInTexture = undefined;
    this.detailToggleOutTexture = undefined;
    this.detailToggleGroup = undefined;
    this.detailToggleInMesh = undefined;
    this.detailToggleOutMesh = undefined;
    this.detailToggleInUniforms = undefined;
    this.detailToggleOutUniforms = undefined;
    this.inputEvents.abort();
    this.cancelPointer();
    for (const prewarm of this.outgoingPrewarm) {
      this.appearance.dispose(prewarm);
      prewarm.clear();
    }
    this.outgoingPrewarm = [];
    for (const pooled of this.outgoingPool) {
      this.appearance.dispose(pooled);
      pooled.clear();
    }
    this.outgoingPool = [];
    disposeThreeTree(this.scene);
    this.overviewBadgeTexture?.dispose();
    this.overviewBadgeTexture = undefined;
    for (const entry of this.overviewHeaderCache.values()) {
      entry.texture.dispose();
    }
    this.overviewHeaderCache.clear();
    for (const entry of this.overviewFullCache.values()) {
      entry.texture.dispose();
    }
    this.overviewFullCache.clear();
    this.overviewBadgeUniform.value = undefined;
    for (const entry of this.hoverBadgeCache.values()) {
      entry.texture.dispose();
    }
    this.hoverBadgeCache.clear();
    this.hoverBadgeFallback?.dispose();
    this.hoverBadgeFallback = undefined;
    this.hoverBadgeUniform.value = undefined;
    for (const image of this.modelProviderImages.values()) image.onload = null;
    this.modelProviderImages.clear();
    this.cardPhotos.clear();
    this.cardPhotoSrc.clear();
    this.cardPhotoTokens.clear();
    this.cardStatsOverrides.clear();
    this.appearance.disposeSources();
    this.model.clear();
    this.outgoing = [];
    this.instances = [];
    this.light.shadow.map?.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.loaded = false;
  }
  private superPerformance = false;
  setSuperPerformance(enabled: boolean) {
    if (this.superPerformance === enabled) return;
    this.superPerformance = enabled;
    for (const inst of this.instances) {
      const original = (inst.userData.fullMaterial ??=
        inst.material) as THREE.MeshPhysicalMaterial;
      if (enabled && !inst.userData.fastMaterial) {
        const fast = original.clone();
        fast.onBeforeCompile = original.onBeforeCompile;
        fast.customProgramCacheKey =
          original.customProgramCacheKey.bind(original);
        fast.transmission = 0;
        fast.clearcoat = 0;
        fast.roughness = Math.max(0.45, original.roughness);
        inst.userData.fastMaterial = fast;
      }
      inst.material = enabled ? inst.userData.fastMaterial : original;
      inst.visible =
        !enabled || surfaceRole(surfaceName(original.name)) !== "fastener";
    }
    this.resize();
  }
  /** Draw fixed low strips plus the gliding active slot light on the
   *  shared floor material using the continuous bar coordinates. */
  private installOverviewFloorLight(material: THREE.MeshStandardMaterial) {
    const before = material.onBeforeCompile;
    const cache = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.uniforms.archiveBottomLight = this.arrayBottomLight;
      shader.uniforms.archiveTrackOffset = this.overviewTrackOffset;
      shader.uniforms.archiveSlotLightGain = this.overviewSlotLightGain;
      shader.uniforms.archiveSlotLights = this.overviewSlotLightsUniform;
      shader.vertexShader =
        "varying vec3 vArchiveFloorWorldPosition;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n" +
            "vArchiveFloorWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader =
        "uniform float archiveBottomLight;\n" +
        "uniform vec2 archiveTrackOffset;\n" +
        "uniform float archiveSlotLightGain;\n" +
        `uniform vec3 archiveSlotLights[${MAX_OVERVIEW_SLOT_LIGHTS}];\n` +
        "varying vec3 vArchiveFloorWorldPosition;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_end>",
        "#include <lights_fragment_end>\n" +
          "float archiveLaneLocal = vArchiveFloorWorldPosition.x + archiveTrackOffset.x;\n" +
          `float archiveLaneIndex = floor(archiveLaneLocal / ${glslFloat(COLUMN_SPACING)} + 0.5);\n` +
          `float archiveLaneDistance = abs(archiveLaneLocal - archiveLaneIndex * ${glslFloat(COLUMN_SPACING)});\n` +
          "float archiveRowLocal = vArchiveFloorWorldPosition.z - archiveTrackOffset.y;\n" +
          `float archiveRowIndex = floor(archiveRowLocal / ${glslFloat(ROW_SPACING)});\n` +
          `float archiveRowDistance = abs(archiveRowLocal - (archiveRowIndex + 0.5) * ${glslFloat(ROW_SPACING)});\n` +
          "float archiveLaneAA = max(fwidth(archiveLaneLocal), 0.0005);\n" +
          "float archiveRowAA = max(fwidth(archiveRowLocal), 0.0005);\n" +
          "float archiveSlotX = 1.0 - smoothstep(2.08 - archiveLaneAA, 2.28 + archiveLaneAA, archiveLaneDistance);\n" +
          "float archiveSlotZ = 1.0 - smoothstep(0.055 - archiveRowAA, 0.12 + archiveRowAA, archiveRowDistance);\n" +
          "float archiveSlotGlow = archiveSlotX * archiveSlotZ;\n" +
          "float archiveActiveGlow = 0.0;\n" +
          `for (int archiveLightIndex = 0; archiveLightIndex < ${MAX_OVERVIEW_SLOT_LIGHTS}; archiveLightIndex++) {\n` +
          "  vec3 archiveLight = archiveSlotLights[archiveLightIndex];\n" +
          "  if (archiveLight.z <= 0.0001) continue;\n" +
          `  float archiveLightLane = (archiveLight.x - 2.0) * ${glslFloat(COLUMN_SPACING)};\n` +
          `  float archiveLightRow = (archiveLight.y - 15.5) * ${glslFloat(ROW_SPACING)};\n` +
          "  float archiveLightX = abs(archiveLaneLocal - archiveLightLane);\n" +
          "  float archiveLightZ = abs(archiveRowLocal - archiveLightRow);\n" +
          "  float archiveCoreX = 1.0 - smoothstep(2.12 - archiveLaneAA, 2.24 + archiveLaneAA, archiveLightX);\n" +
          "  float archiveCoreZ = 1.0 - smoothstep(0.045, 0.075, archiveLightZ);\n" +
          "  float archiveHaloX = 1.0 - smoothstep(2.24, 2.55, archiveLightX);\n" +
          "  float archiveHaloZ = 1.0 - smoothstep(0.075, 0.28, archiveLightZ);\n" +
          "  archiveActiveGlow += archiveLight.z * (\n" +
          "    archiveCoreX * archiveCoreZ * 0.16 +\n" +
          "    archiveHaloX * archiveHaloZ * 0.025\n" +
          "  );\n" +
          "}\n" +
          "vec3 archiveSlotColor = vec3(1.0, 0.84, 0.65);\n" +
          "totalEmissiveRadiance += archiveSlotColor * archiveBottomLight *\n" +
          "  (archiveSlotGlow * 0.025 + archiveSlotLightGain * archiveActiveGlow);",
      );
    };
    material.customProgramCacheKey = () =>
      `${cache()}-archive-floor-underlight`;
    material.needsUpdate = true;
  }
  /** A low strip remains in every slot. Each slot's underlight values arrive
   *  through an instance attribute or per-card uniform, modulated as the
   *  selection light bar glides across the array. */
  private installOverviewUnderlight(
    material: THREE.MeshStandardMaterial,
    role: SurfaceRole,
    mode: "selected" | "neighbor",
    instanced = false,
  ): OverviewSlotLightUniforms | undefined {
    const bottomLight =
      mode === "selected" ? this.overviewBottomLight : this.arrayBottomLight;
    const slotProximity =
      mode === "selected" ? this.overviewSelectedSlotProximity : undefined;
    // The authored top seal uses scene lighting plus an overview-only minimum
    // fill. Install it on each final material because Three material clones do
    // not retain onBeforeCompile.
    if (role === "seal") {
      installOverviewSealFill(material, bottomLight, !instanced);
      return undefined;
    }
    const flag =
      mode === "selected"
        ? "archiveSelectedUnderlight"
        : "archiveNeighborUnderlight";
    if (material.userData[flag]) {
      return material.userData.archiveSlotLightValues as
        OverviewSlotLightUniforms | undefined;
    }
    material.userData[flag] = true;
    const before = material.onBeforeCompile;
    const cache = material.customProgramCacheKey.bind(material);
    const badgeSurface = surfaceName(material.name) === "REF_Glass";
    const hoverBadge =
      badgeSurface && instanced
        ? {
            instance: this.hoverBadgeInstance,
            heightFraction: HOVER_BADGE_HEIGHT / OVERVIEW_BADGE_HEIGHT,
          }
        : undefined;
    const badge = hoverBadge
      ? this.hoverBadgeUniform
      : badgeSurface && mode === "selected"
        ? this.overviewBadgeUniform
        : undefined;
    const slotStrength = UNDERLIGHT_SLOT_STRENGTH[role] ?? 0.012;
    const baseStrength = UNDERLIGHT_BASE_STRENGTH + slotStrength;
    const activeStrength = UNDERLIGHT_ACTIVE_STRENGTH[role] ?? 0.06;
    const endStrength = UNDERLIGHT_END_STRENGTH[role] ?? 0;
    const reflectionStrength = UNDERLIGHT_REFLECTION_STRENGTH[role] ?? 0;
    const lateralStrength = UNDERLIGHT_LATERAL_STRENGTH[role] ?? 0;
    // The acrylic tube is an open perimeter. Its visible end cap starts beyond
    // the ordinary lower strip, so give that narrow wall a separate active-only
    // coupling while keeping the constant floor strip at its existing width.
    const activeOuterX =
      role === "acrylic" || role === "glass" || role === "frame" ? 2.46 : 2.36;
    const activeHeight =
      role === "acrylic"
        ? "pow(max(1.0 - archiveLocalY, 0.0), 0.88) *\n" +
          "  (0.82 + 0.18 * (1.0 - smoothstep(0.04, 0.35, archiveLocalY)))"
        : role === "glass" || role === "frame"
          ? "pow(max(1.0 - archiveLocalY, 0.0), 1.15) *\n" +
            "  (0.82 + 0.18 * (1.0 - smoothstep(0.04, 0.35, archiveLocalY)))"
          : "0.16 + 0.84 * exp(-archiveLocalY * 1.55)";
    const endZoneStart =
      role === "glass" ? 2.26 : role === "acrylic" ? 2.24 : 2.28;
    const endZoneEnd =
      role === "glass" ? 2.38 : role === "acrylic" ? 2.45 : 2.46;
    const endHeight =
      role === "glass"
        ? "(0.85 + 0.15 * archiveBottomLip) * (1.0 - smoothstep(0.55, 0.82, archiveLocalY))"
        : role === "acrylic" ||
            role === "frame" ||
            role === "engrave" ||
            role === "shell"
          ? "(0.85 + 0.15 * archiveBottomLip) * (1.0 - smoothstep(0.56, 0.84, archiveLocalY))"
          : "0.0";
    const reflectionZoneStart =
      role === "glass" || role === "shell" || role === "card"
        ? 2.26
        : role === "acrylic"
          ? 2.2
          : 2.22;
    const reflectionZoneEnd =
      role === "glass" || role === "shell" || role === "card"
        ? 2.38
        : role === "acrylic"
          ? 2.46
          : 2.44;
    const slotLight = instanced
      ? undefined
      : ({
          direct:
            material.userData.archiveSlotLight ??
            (material.userData.archiveSlotLight = { value: 0 }),
          reflection:
            material.userData.archiveSlotReflection ??
            (material.userData.archiveSlotReflection = { value: 0 }),
          lateral:
            material.userData.archiveSlotLateral ??
            (material.userData.archiveSlotLateral = { value: 0 }),
          topRail:
            material.userData.archiveSlotTopRail ??
            (material.userData.archiveSlotTopRail = { value: 0 }),
        } as OverviewSlotLightUniforms);
    if (slotLight) material.userData.archiveSlotLightValues = slotLight;
    const slotInput = instanced
      ? "attribute float archiveSlotLight;\n" +
        "attribute float archiveSlotReflection;\n" +
        "attribute float archiveSlotLateral;\n" +
        "attribute float archiveSlotTopRail;\n"
      : "uniform float archiveSlotLight;\n" +
        "uniform float archiveSlotReflection;\n" +
        "uniform float archiveSlotLateral;\n" +
        "uniform float archiveSlotTopRail;\n";
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.uniforms.archiveBottomLight = bottomLight;
      shader.uniforms.archiveSlotLightGain = this.overviewSlotLightGain;
      if (slotProximity) {
        shader.uniforms.archiveSlotProximity = slotProximity;
      }
      if (slotLight) {
        shader.uniforms.archiveSlotLight = slotLight.direct;
        shader.uniforms.archiveSlotReflection = slotLight.reflection;
        shader.uniforms.archiveSlotLateral = slotLight.lateral;
        shader.uniforms.archiveSlotTopRail = slotLight.topRail;
      }
      shader.vertexShader =
        slotInput +
        "varying float vArchiveSlotLight;\n" +
        "varying float vArchiveSlotReflection;\n" +
        "varying float vArchiveSlotLateral;\n" +
        "varying float vArchiveSlotTopRail;\n" +
        "varying float vArchiveUnderlightLocalX;\n" +
        "varying vec3 vArchiveUnderlightLocalNormal;\n" +
        "varying float vArchiveUnderlightHeight;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n" +
          "vArchiveSlotLight = archiveSlotLight;\n" +
          "vArchiveSlotReflection = archiveSlotReflection;\n" +
          "vArchiveSlotLateral = archiveSlotLateral;\n" +
          "vArchiveSlotTopRail = archiveSlotTopRail;\n" +
          "vArchiveUnderlightLocalX = position.x;\n" +
          "vArchiveUnderlightLocalNormal = normal;\n" +
          "vArchiveUnderlightHeight = max(position.y, 0.0) / 3.7;",
      );
      shader.fragmentShader =
        "uniform float archiveBottomLight;\n" +
        "uniform float archiveSlotLightGain;\n" +
        (slotProximity ? "uniform float archiveSlotProximity;\n" : "") +
        "varying float vArchiveSlotLight;\n" +
        "varying float vArchiveSlotReflection;\n" +
        "varying float vArchiveSlotLateral;\n" +
        "varying float vArchiveSlotTopRail;\n" +
        "varying float vArchiveUnderlightLocalX;\n" +
        "varying vec3 vArchiveUnderlightLocalNormal;\n" +
        "varying float vArchiveUnderlightHeight;\n" +
        shader.fragmentShader;
      // Lighting studio mode: allow all cards to receive real scene lights.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_end>",
        "#include <lights_fragment_end>\n" +
          "float archiveUnselectedBase = archiveBottomLight *\n" +
          "  (1.0 - clamp(max(vArchiveSlotLight, vArchiveSlotTopRail), 0.0, 1.0));\n" +
          `float archiveUnselectedGain = mix(1.0, ${glslFloat(UNSELECTED_OVERVIEW_BASE_GAIN)}, archiveUnselectedBase);\n` +
          "reflectedLight.indirectDiffuse *= archiveUnselectedGain;\n" +
          "reflectedLight.indirectSpecular *= archiveUnselectedGain;\n" +
          "float archiveLocalY = max(vArchiveUnderlightHeight, 0.0);\n" +
          "vec3 archiveWorldNormal = inverseTransformDirection(normal, viewMatrix);\n" +
          "vec3 archiveLocalNormal = normalize(vArchiveUnderlightLocalNormal);\n" +
          "float archiveVerticalFace = 0.62 + 0.38 * smoothstep(0.12, 0.88, 1.0 - abs(archiveWorldNormal.y));\n" +
          "float archiveBottomX = 1.0 - smoothstep(2.08, 2.34, abs(vArchiveUnderlightLocalX));\n" +
          `float archiveActiveX = 1.0 - smoothstep(2.08, ${glslFloat(activeOuterX)}, abs(vArchiveUnderlightLocalX));\n` +
          "float archiveBottomLip = 1.0 - smoothstep(0.035, 0.19, archiveLocalY);\n" +
          "float archiveSlotStrip = archiveBottomX * archiveVerticalFace;\n" +
          "float archiveActiveStrip = archiveActiveX * archiveVerticalFace;\n" +
          "float archiveDefaultHeight = 0.22 + 0.78 * (1.0 - smoothstep(0.06, 0.72, archiveLocalY));\n" +
          `float archiveActiveHeight = ${activeHeight};\n` +
          "float archiveDefaultGlow = archiveSlotStrip * archiveDefaultHeight * (\n" +
          "  0.28 + 0.72 * archiveBottomLip\n" +
          ");\n" +
          "float archiveActiveGlow = archiveActiveStrip * archiveActiveHeight * vArchiveSlotLight;\n" +
          "float archiveLeftEndBias = mix(0.08, 1.0, smoothstep(-0.35, 0.35, -vArchiveUnderlightLocalX));\n" +
          `float archiveEndZone = archiveLeftEndBias * smoothstep(${glslFloat(endZoneStart)}, ${glslFloat(endZoneEnd)}, abs(vArchiveUnderlightLocalX));\n` +
          "float archiveEndSide = smoothstep(0.32, 0.88, abs(archiveLocalNormal.x));\n" +
          "float archiveEndRim = smoothstep(0.62, 0.94, abs(archiveLocalNormal.z));\n" +
          "float archiveEndHorizontal = smoothstep(0.70, 0.95, abs(archiveLocalNormal.y));\n" +
          "float archiveEndCoupling = archiveEndZone * max(\n" +
          "  archiveEndSide,\n" +
          "  max(archiveEndRim * 0.86, archiveEndHorizontal * 0.58)\n" +
          ");\n" +
          `float archiveEndHeight = ${endHeight};\n` +
          "float archiveEndGlow = archiveEndCoupling * archiveEndHeight * vArchiveSlotLight;\n" +
          `float archiveReflectionX = archiveLeftEndBias * smoothstep(${glslFloat(reflectionZoneStart)}, ${glslFloat(reflectionZoneEnd)}, abs(vArchiveUnderlightLocalX));\n` +
          "float archiveReflectionCoupling = archiveReflectionX * max(\n" +
          "  archiveEndSide,\n" +
          "  max(archiveEndRim * 0.32, archiveEndHorizontal * 0.22)\n" +
          ");\n" +
          "float archiveReflectionHeight =\n" +
          "  (0.36 + 0.64 * pow(max(1.0 - archiveLocalY, 0.0), 1.05)) *\n" +
          "  (1.0 - smoothstep(0.84, 0.99, archiveLocalY));\n" +
          "float archiveReflectionGlow = archiveReflectionCoupling *\n" +
          "  archiveReflectionHeight * vArchiveSlotReflection;\n" +
          "float archiveLateralAmount = smoothstep(\n" +
          "  0.04, 0.22, abs(vArchiveSlotLateral)\n" +
          ");\n" +
          "float archiveLateralLocalX = vArchiveSlotLateral >= 0.0\n" +
          "  ? vArchiveUnderlightLocalX\n" +
          "  : -vArchiveUnderlightLocalX;\n" +
          "float archiveLateralSide = smoothstep(0.82, 2.46, archiveLateralLocalX);\n" +
          "float archiveLateralSurface = max(\n" +
          "  archiveEndSide,\n" +
          "  max(archiveEndRim * 0.90, archiveEndHorizontal * 0.82)\n" +
          ");\n" +
          "float archiveLateralVerticalHeight =\n" +
          "  (0.58 + 0.42 * (1.0 - smoothstep(0.10, 0.72, archiveLocalY))) *\n" +
          "  (1.0 - smoothstep(0.82, 1.0, archiveLocalY));\n" +
          "float archiveLateralTopHeight =\n" +
          "  0.54 + 0.46 * (1.0 - smoothstep(0.12, 0.92, archiveLocalY));\n" +
          "float archiveLateralHeight = mix(\n" +
          "  archiveLateralVerticalHeight,\n" +
          "  archiveLateralTopHeight,\n" +
          "  archiveEndHorizontal\n" +
          ");\n" +
          "float archiveLateralGlow = archiveLateralSide *\n" +
          "  archiveLateralSurface * archiveLateralHeight * archiveLateralAmount;\n" +
          "vec3 archiveWarmWhite = vec3(1.0, 0.84, 0.66);\n" +
          "vec3 archiveActiveWarmWhite = vec3(1.0, 0.68, 0.34);\n" +
          "vec3 archiveReflectionWhite = vec3(1.0, 0.76, 0.56);\n" +
          "vec3 archiveLateralWhite = vec3(1.0, 0.70, 0.38);\n" +
          (slotProximity
            ? `totalEmissiveRadiance += archiveWarmWhite * archiveBottomLight * archiveSlotProximity * archiveDefaultGlow * ${glslFloat(baseStrength)};\n` +
              `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotProximity * archiveSlotLightGain * archiveActiveGlow * ${glslFloat(activeStrength * 0.75)};\n` +
              `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotProximity * archiveSlotLightGain * archiveEndGlow * ${glslFloat(endStrength * 0.65)};\n` +
              `totalEmissiveRadiance += archiveReflectionWhite * archiveBottomLight * archiveSlotProximity * archiveSlotLightGain * archiveReflectionGlow * ${glslFloat(reflectionStrength * 0.3)};\n` +
              `totalEmissiveRadiance += archiveLateralWhite * archiveBottomLight * archiveSlotProximity * archiveSlotLightGain * archiveLateralGlow * ${glslFloat(lateralStrength)};`
            : `totalEmissiveRadiance += archiveWarmWhite * archiveBottomLight * archiveDefaultGlow * ${glslFloat(baseStrength)};\n` +
              `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotLightGain * archiveActiveGlow * ${glslFloat(activeStrength * 0.75)};\n` +
              `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotLightGain * archiveEndGlow * ${glslFloat(endStrength * 0.65)};\n` +
              `totalEmissiveRadiance += archiveReflectionWhite * archiveBottomLight * archiveSlotLightGain * archiveReflectionGlow * ${glslFloat(reflectionStrength * 0.3)};\n` +
              `totalEmissiveRadiance += archiveLateralWhite * archiveBottomLight * archiveSlotLightGain * archiveLateralGlow * ${glslFloat(lateralStrength)};`),
      );
      applyOverviewLook(
        shader,
        role,
        badge,
        hoverBadge,
        badge === this.overviewBadgeUniform
          ? this.overviewBadgeHeadingEdge
          : undefined,
        badge === this.overviewBadgeUniform
          ? this.overviewBadgeHeightFraction
          : undefined,
        slotProximity,
      );
    };
    material.customProgramCacheKey = () =>
      `${cache()}-archive-underlight-${mode}-${role}-${instanced}-${Boolean(badge)}`;
    material.needsUpdate = true;
    return slotLight;
  }
  private applyOverviewUnderlight(
    group: THREE.Group,
    mode: "selected" | "neighbor",
  ) {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const role = surfaceRole(child.userData.surface as string);
      if (
        mode === "selected" &&
        role !== "glass" &&
        role !== "acrylic" &&
        role !== "frame" &&
        role !== "shell" &&
        role !== "card" &&
        role !== "edge" &&
        role !== "seal" &&
        role !== "engrave"
      )
        return;
      const material = child.material;
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      const slotLight = this.installOverviewUnderlight(material, role, mode);
      if (slotLight) child.userData.slotLight = slotLight;
    });
  }
  private setGroupSlotLight(
    group: THREE.Group,
    direct: number,
    reflection: number,
    lateral: number,
    topRail: number,
  ) {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const slotLight = child.userData.slotLight as
        OverviewSlotLightUniforms | undefined;
      if (!slotLight) return;
      slotLight.direct.value = direct;
      slotLight.reflection.value = reflection;
      slotLight.lateral.value = lateral;
      slotLight.topRail.value = topRail;
    });
  }
  private prepareOutgoingPrewarm(name: string) {
    const prewarm = this.model.clone(true);
    prewarm.name = name;
    prewarm.visible = false;
    this.appearance.prepare(prewarm);
    this.applyOverviewUnderlight(prewarm, "neighbor");
    this.appearance.apply(prewarm, 1);
    this.appearance.setClarity(prewarm, 0);
    prewarm.updateMatrixWorld(true);
    return prewarm;
  }
  private async prewarmOutgoingPrograms() {
    if (!this.bakedCardTexture || this.outgoingPrewarm.length) return;
    // The first departing card uses a non-instanced neighbor material graph
    // that the visible array never compiles. Compiling it during load keeps the
    // first row navigation from blocking on shader compilation.
    const front = this.prepareOutgoingPrewarm("archive-outgoing-prewarm-front");
    const back = this.prepareOutgoingPrewarm("archive-outgoing-prewarm-back");
    // Three renders double-sided transmissive materials a second time with
    // BackSide during its transmission prepass. Those FLIP_SIDED programs are
    // otherwise first created by the departing card on the input frame.
    back.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (
        material instanceof THREE.MeshPhysicalMaterial &&
        material.side === THREE.DoubleSide &&
        material.transmission > 0
      ) {
        material.side = THREE.BackSide;
        material.needsUpdate = true;
      }
    });
    const pool = new THREE.Group();
    pool.name = "archive-outgoing-prewarm";
    pool.visible = false;
    pool.add(front, back);
    this.scene.add(pool);
    const compileQuality = async (quality: number) => {
      this.appearance.apply(front, quality);
      this.appearance.apply(back, quality);
      const previousTarget = this.renderer.getRenderTarget();
      const previousCubeFace = this.renderer.getActiveCubeFace();
      const previousMipmapLevel = this.renderer.getActiveMipmapLevel();
      let ready: Promise<THREE.Object3D>;
      try {
        // Beauty and transmission both use a non-XR render target, so they
        // share the same output colorspace and NoToneMapping program bits.
        this.renderer.setRenderTarget(this.composer.readBuffer);
        try {
          ready = this.renderer.compileAsync(pool, this.camera, this.scene);
        } finally {
          // compileAsync creates programs synchronously. Restore before await
          // so the application is not left bound to the composer target.
          this.renderer.setRenderTarget(
            previousTarget,
            previousCubeFace,
            previousMipmapLevel,
          );
        }
        await ready;
      } catch (error) {
        console.warn(
          `[archive] outgoing shader prewarm failed at quality ${quality}`,
          error,
        );
        throw error;
      }
    };
    try {
      // REF_Glass has clearcoat=0 at the fully extracted endpoint and a
      // nonzero clearcoat while returning. Applying both values to the same
      // retained materials keeps both boolean program variants alive.
      await compileQuality(1);
      await compileQuality(0.5);
      this.outgoingPrewarm = [front, back];
    } catch (error) {
      for (const prewarm of [front, back]) {
        this.appearance.dispose(prewarm);
        prewarm.clear();
      }
    } finally {
      this.scene.remove(pool);
      pool.clear();
    }
  }
  /** Override the moving slot highlight only. The constant low underlight
   *  remains visible for same-camera A/B acceptance. */
  setOverviewSlotLightGain(gain: number) {
    const value = THREE.MathUtils.clamp(Number.isFinite(gain) ? gain : 1, 0, 2);
    this.overviewSlotLightGain.value = value;
    this.renderState.invalidate();
    return value;
  }
  private appearanceInSlot(lift: number, directLight: number) {
    const illuminated = THREE.MathUtils.smoothstep(
      directLight * this.overviewSlotLightGain.value,
      0,
      1,
    );
    return ease(lift / OVERVIEW_LIFT) * illuminated;
  }
  private syncOverviewSlotLights() {
    const bar = this.slotUnderlights.barPosition;
    const barIntensity = this.slotUnderlights.barIntensity;
    for (let i = 0; i < this.overviewSlotLightsUniform.value.length; i++) {
      const target = this.overviewSlotLightsUniform.value[i];
      if (i === 0 && barIntensity > 0.001) {
        target.set(bar.lane, bar.row, barIntensity);
      } else {
        target.set(0, 0, 0);
      }
    }
  }
  private slotLightAttribute?: THREE.InstancedBufferAttribute;
  private neighborLightAttribute?: THREE.InstancedBufferAttribute;
  private lateralLightAttribute?: THREE.InstancedBufferAttribute;
  private topRailLightAttribute?: THREE.InstancedBufferAttribute;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // The reference uses a long lens 72–140 units from the cassette. A 0.1 near
  // plane quantizes adjacent optical layers to the same depth (visible shimmer).
  // All visible foreground geometry is beyond 5; retain the framing and lens.
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 5, 300);
  private composer: EffectComposer;
  private bokeh: BokehPass;
  private readonly overviewBottomLight = { value: 1 };
  private readonly overviewSelectedSlotProximity = { value: 1 };
  private readonly arrayBottomLight = { value: 1 };
  private readonly overviewTrackOffset = { value: new THREE.Vector2() };
  private readonly overviewSlotLightGain = { value: 1 };
  private readonly overviewSlotLightsUniform = {
    value: Array.from(
      { length: MAX_OVERVIEW_SLOT_LIGHTS },
      () => new THREE.Vector3(),
    ),
  };
  private readonly overviewAreaLight = new THREE.RectAreaLight(
    "#ffba60",
    0,
    OVERVIEW_RECT_LIGHT_WIDTH,
    OVERVIEW_RECT_LIGHT_HEIGHT,
  );
  private readonly overviewLightStripMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#ffd28a"),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly overviewLightStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 0.22),
    this.overviewLightStripMaterial,
  );
  private readonly studioSkyLight = new THREE.HemisphereLight(
    "#fff3e8",
    "#b88b68",
    0,
  );
  private instances: THREE.InstancedMesh[] = [];
  private outgoingPrewarm: THREE.Group[] = [];
  private outgoingPool: THREE.Group[] = [];
  private matrixUpdates?: InstanceUpdates;
  private slotLightUpdates?: InstanceUpdates;
  private neighborLightUpdates?: InstanceUpdates;
  private lateralLightUpdates?: InstanceUpdates;
  private topRailLightUpdates?: InstanceUpdates;
  private renderState = new RenderState();
  private shadowState = new RenderState();
  private shadowTick = 0;
  private shadowStale = false;
  private warmingUp = false;
  private idleNow = false;
  // -Infinity keeps the first press from ever matching; the archive index is
  // stored rather than the cell so a rebase cannot invalidate a pending press.
  private lastPress = { file: -1, time: -Infinity };
  private renderedFrames = 0;
  private reusedFrames = 0;
  private visibility = new ArchiveVisibility();
  private drawCoverage = new ArchiveDrawCoverage();
  private shadowCoverage?: ArchiveShadowCoverage;
  private instanceCapacity = Math.max(LOOP_COLUMNS * LOOP_ROWS, 640);
  private drawnCells: ArchiveCell[] = [];
  private readonly hiddenCellKeys = new Set<string>();
  private model = new THREE.Group();
  private appearance = new CardAppearance();
  private cursor = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private readonly pickInvMatrix = new THREE.Matrix4();
  private readonly pickInstMatrix = new THREE.Matrix4();
  private readonly pickIdentityMatrix = new THREE.Matrix4();
  private readonly pickLocalRay = new THREE.Ray();
  private readonly pickHitPoint = new THREE.Vector3();
  private readonly focalPointScratch = new THREE.Vector3();
  private cachedCanvasRect: DOMRect | null = null;
  private lastInspectionState = "";
  private dummy = new THREE.Object3D();
  private cells: ArchiveCell[] = [];
  private selectedCell: ArchiveCell = { lane: 2, row: 12 };
  private readonly slotUnderlights = new ArchiveSlotUnderlights(
    this.selectedCell,
  );
  private coordinateOrigin: ArchiveCell = { lane: 0, row: 0 };
  private lift = { value: 0, velocity: 0 };
  private rail = { value: 0, velocity: 0 };
  private shoulder = { value: 12, velocity: 0 };
  private laneFocus = { value: 2, velocity: 0 };
  private columnCamera = { value: 0, velocity: 0 };
  private returnY: number | null = null;
  private canInspect = false;
  private clearance = 0;
  private pulseGain = 1;
  private idleGain = 0;
  private lastInteraction = 0;
  private cameraAim = new THREE.Vector3();
  private fixedDetailCameraHeld = false;
  private detailCameraMove = { value: 0, velocity: 0 };
  private detailCameraAimMove = { value: 0, velocity: 0 };
  private fixedDetailCameraPose?: FixedDetailCameraPose;
  private fixedDetailTargetPose?: FixedDetailCameraPose;
  private fixedDetailLiftTarget?: number;
  private fixedDetailCameraBasis?: FixedDetailCameraBasis;
  private overviewCameraReady = false;
  private cameraInitialized = false;
  private disposed = false;
  private lastRenderedFocusDepth?: number;
  private readonly modelBounds = new THREE.Box3();
  private outgoing: {
    group: THREE.Group;
    slot: number;
    cell: ArchiveCell;
    lift: { value: number; velocity: number };
    returnY: number | null;
  }[] = [];
  private pulses: SelectionWavePulse[] = [];
  private frozenPulses: FrozenSelectionWavePulse[] = [];
  private pendingPulse: ArchiveCell | null = null;
  private selectedSlot = 76;
  private detail = 0;
  private targetDetail = 0;
  private reveal = 0;
  private targetReveal = 0;
  private intro: {
    elapsed: number;
    fullLiftUnlocked: boolean;
    started: boolean;
  } | null = null;
  private introRelease: {
    elapsed: number;
    age: number;
    cell: ArchiveCell;
  } | null = null;
  private last: number | null = null;
  private pointer = new THREE.Vector2();
  private dragging = false;
  private hoverCell: ArchiveCell | null = null;
  private hoverLifts = new Map<string, number>();
  private archiveDrag = new ArchiveDrag();
  private dragTrack: DragPosition | null = null;
  private navigatingDrag = false;
  private archiveMomentum: {
    motion: ArchivePlaneMomentum;
    time: number;
  } | null = null;
  private holdingArchive = false;
  private cancelPointer = () => {};
  private pendingHover: Pick<
    PointerEvent,
    "clientX" | "clientY" | "pointerType"
  > | null = null;
  private flushHover = () => {};
  private rotation = 0;
  private targetRotation = 0;
  private light: THREE.SpotLight;
  private fillLight: THREE.DirectionalLight;
  private clock = 0;
  private pulseClock = 0;
  private loaded = false;
  private labelCanvas = document.createElement("canvas");
  private labelTexture?: THREE.CanvasTexture;
  private overviewBadgeCanvas = document.createElement("canvas");
  private overviewBadgeTexture?: THREE.CanvasTexture;
  private readonly overviewBadgeUniform = {
    value: undefined as THREE.Texture | undefined,
  };
  private readonly overviewBadgeHeadingEdge = { value: 1 };
  private readonly overviewBadgeHeightFraction = { value: 1 };
  private overviewBadgeFullHeadingEdge = 1;
  private overviewBadgeFullIndex = -1;
  private overviewBadgeFullDirty = true;
  private overviewBadgeFullAfter = 0;
  private overviewBadgeDirty = false;
  private overviewHeaderCache = new Map<
    number,
    {
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
      headingEdge: number;
      providerLoaded: boolean;
    }
  >();
  private overviewFullCache = new Map<
    number,
    {
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
      headingEdge: number;
      providerLoaded: boolean;
      hasPhoto: boolean;
    }
  >();
  private pendingOverviewBadgeRefresh = false;
  private hoverBadgeFallback?: THREE.CanvasTexture;
  private hoverBadgeCache = new Map<
    number,
    {
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
    }
  >();
  private readonly hoverBadgeUniform = {
    value: undefined as THREE.CanvasTexture | undefined,
  };
  private readonly hoverBadgeInstance = { value: -1 };
  private hoverBadgeIndex = -1;
  private readonly modelProviderImages = new Map<
    ModelProvider,
    HTMLImageElement
  >();
  private cardPhotos = new Map<number, HTMLImageElement | null>();
  private cardPhotoSrc = new Map<number, string>();
  private cardPhotoTokens = new Map<number, number>();
  private cardPhotoSeq = 0;
  private cardStatsOverrides = new Map<number, ArchiveCardStats>();
  /** GLB 里烘焙的 REF 卡面贴图（用于无运行时纹理时的兜底引用）。 */
  private bakedCardTexture?: THREE.Texture;
  private selectedIndex = 0;
  /** 卡面前表面的模型局部 Z；旧模型没有 card 角色时保留旧铭牌平面值。 */
  private cardPlaneZ = 0.255;
  private glassFrontZ = 0.0505;
  private lastShowcaseStatRects: ShowcaseStatRects = {};
  private detailHoveredHotspot: DetailHotspot | null = null;
  private detailDrawerOpen = false;
  private detailDrawer = { value: 0, velocity: 0 };
  private detailCardScrollY = 0;
  private detailCopiedRecord?: ArchiveRecord;
  private detailCopiedTimer = 0;
  private detailPulloutGroup?: THREE.Group;
  private detailPulloutCanvas = document.createElement("canvas");
  private detailPulloutTexture?: THREE.CanvasTexture;
  private detailPulloutLayout: PulloutCardLayout | null = null;
  private detailStickerGroup?: THREE.Group;
  private detailStickerGeom?: THREE.PlaneGeometry;
  private detailStickerBasePos?: Float32Array;
  /** 四角卷翘弹簧，顺序与 STICKER_CORNERS 一致；只有右下角在静置时保留轻卷。 */
  private readonly detailStickerCornerPeel = STICKER_CORNERS.map((_, corner) => ({
    value: corner === STICKER_REST_CORNER ? 0.24 : 0,
    velocity: 0,
  }));
  private readonly detailStickerPeelScratch = new Float32Array(
    STICKER_CORNERS.length,
  );
  private detailStickerLastPeels = [-1, -1, -1, -1];
  /** 指针当前落在哪个角（-1 表示不在贴纸上），仅在贴纸上时参与掀起。 */
  private detailStickerHoverCorner = -1;
  private detailStickerShadowPeel = {
    value: new THREE.Vector4(0, 0.24, 0, 0),
  };
  private detailStickerCanvas = document.createElement("canvas");
  private detailStickerTexture?: THREE.CanvasTexture;
  private detailStickerBackTexture?: THREE.CanvasTexture;
  private detailStickerShadowTexture?: THREE.CanvasTexture;
  private detailStickerFrontMat?: THREE.MeshPhysicalMaterial;
  private detailStickerBackMat?: THREE.MeshPhysicalMaterial;
  private detailStickerShadowMat?: THREE.MeshBasicMaterial;
  private hoverStickerGroup?: THREE.Group;
  private hoverStickerFrontMat?: THREE.MeshPhysicalMaterial;
  private hoverStickerShadowMat?: THREE.MeshBasicMaterial;
  private hoverStickerCell: ArchiveCell | null = null;
  private hoverStickerIndex = -1;
  private hoverStickerCache = new Map<
    number,
    { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }
  >();
  private readonly hoverStickerMatrix = new THREE.Matrix4();
  private readonly hoverStickerPos = new THREE.Vector3();
  private readonly hoverStickerQuat = new THREE.Quaternion();
  private detailToggleGroup?: THREE.Group;
  private detailToggleInMesh?: THREE.Mesh;
  private detailToggleOutMesh?: THREE.Mesh;
  private detailToggleInCanvas = document.createElement("canvas");
  private detailToggleOutCanvas = document.createElement("canvas");
  private detailToggleInTexture?: THREE.CanvasTexture;
  private detailToggleOutTexture?: THREE.CanvasTexture;
  private detailToggleInUniforms?: MistDissolveShaderUniforms;
  private detailToggleOutUniforms?: MistDissolveShaderUniforms;
  private detailToggleMode: "hidden" | "reveal" | "visible" | "hide" = "hidden";
  private detailToggleElapsed = 0;
  private detailToggleDuration = MIST_RETURN_DURATION_MS / 1000;
  private detailToggleVisibility = 0;
  private detailToggleLabelOpen = false;
  private detailToggleSwitchActive = false;
  private detailToggleSwitchElapsed = 0;
  private readonly hoverStickerScale = new THREE.Vector3();
  private readonly detailPickPlane = new THREE.Plane();
  private readonly detailPickPoint = new THREE.Vector3();
  private readonly detailClipPlane = new THREE.Plane(
    new THREE.Vector3(1, 0, 0),
    -2.495,
  );
  private labelMark = new Image();
  private motion: MotionPreferences = fullMotion();
  private quality = normalizeQuality(undefined);
  private appliedQuality = "";
  private smaa = new SMAAPass();
  onSelect?: (index: number, cell?: ArchiveCell) => void;
  /** A second press on the already selected card within the double-press window. */
  onOpen?: (index: number) => void;
  onHover?: (index: number | null) => void;
  onNavigate?: (axis: "row" | "lane", direction: number) => void;
  onIntroChange?: (active: boolean) => void;
  onCopyPrompt?: (text: string) => Promise<boolean>;
  onDetailCardOpenChange?: () => void;
  constructor(
    private container: HTMLElement,
    private readonly selectionPulse = baselineSelectionWave,
    private readonly deferSelectionPulse = false,
    private readonly lightingLook: LightingLook = "baseline",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.localClippingEnabled = true;
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.5) *
        Math.min(innerWidth / 1920, innerHeight / 1080),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    // All composer passes see the same geometry within one application frame.
    // Generate the shadow map in the beauty pass and reuse it in depth/normal passes.
    this.renderer.shadowMap.autoUpdate = false;
    // PCFSoftShadowMap 在 Three.js r18x 已弃用，运行时会被自动降级到 PCFShadowMap，
    // 这里直接设成 PCFShadowMap，避免以后版本移除后报错。
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三维研究档案阵列，点击选择，左右拖动切列，上下拖动或滚轮切换列内档案",
    );
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      () => {
        this.renderState.invalidate();
        this.shadowState.invalidate();
        this.shadowStale = false;
        this.shadowTick = 0;
      },
      { signal: this.inputEvents.signal },
    );
    this.scene.background = new THREE.Color(WARM.field);
    // The frame updates world matrices once after simulation; subsequent
    // beauty, normal, depth and transmission renders reuse those same matrices.
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.fog = new THREE.Fog(WARM.field, 22, 47);
    ensureRectAreaLightSupport();
    const { key, fill } = createArchiveLighting(
      this.renderer,
      this.scene,
      lightingLook,
    );
    this.light = key;
    this.fillLight = fill;
    this.light.castShadow = true;
    this.light.target.position.set(0, -2.2, 0);
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = 120;
    this.light.shadow.camera.updateProjectionMatrix();
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.normalBias = lightingLook === "refined" ? 0.018 : 0.035;
    this.light.shadow.bias = lightingLook === "refined" ? -0.00012 : -0.0003;
    this.light.shadow.radius = 4;
    // Rotate local -Z onto world +Y once. The long local X edge stays on X.
    this.overviewAreaLight.rotation.x = Math.PI / 2;
    this.overviewAreaLight.position.set(
      (this.selectedCell.lane - 2) * COLUMN_SPACING,
      OVERVIEW_RECT_LIGHT_Y,
      (this.selectedCell.row - 15.5) * ROW_SPACING +
        OVERVIEW_RECT_LIGHT_Z_OFFSET,
    );
    this.scene.add(this.overviewAreaLight);
    this.overviewLightStrip.rotation.x = -Math.PI / 2;
    this.overviewLightStrip.position.set(
      (this.selectedCell.lane - 2) * COLUMN_SPACING,
      -4.52,
      (this.selectedCell.row - 15.5) * ROW_SPACING +
        OVERVIEW_RECT_LIGHT_Z_OFFSET,
    );
    this.overviewLightStrip.name = "archive-overview-light-strip";
    this.scene.add(this.overviewLightStrip);
    this.scene.add(this.studioSkyLight);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: WARM.floor,
      roughness: 0.95,
    });
    this.installOverviewFloorLight(floorMaterial);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = "archive-floor";
    floor.position.y = -4.63;
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    this.scene.add(floor);
    this.camera.position.set(-62.26, 35.98, 43.28);
    this.cameraAim.set(-0.5, 1.1, 0.4);
    this.camera.fov = 6.15;
    this.camera.lookAt(this.cameraAim);
    const composerSize = this.renderer.getDrawingBufferSize(
      new THREE.Vector2(),
    );
    const composerDepth = new THREE.DepthTexture(
      Math.max(1, composerSize.x),
      Math.max(1, composerSize.y),
    );
    composerDepth.format = THREE.DepthFormat;
    composerDepth.type = THREE.UnsignedIntType;
    const composerTarget = new THREE.WebGLRenderTarget(
      Math.max(1, composerSize.x),
      Math.max(1, composerSize.y),
      {
        type: THREE.HalfFloatType,
        depthTexture: composerDepth,
      },
    );
    this.composer = new EffectComposer(this.renderer, composerTarget);
    const logicalSize = this.renderer.getSize(new THREE.Vector2());
    this.composer.setSize(
      Math.max(1, logicalSize.x),
      Math.max(1, logicalSize.y),
    );
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new SharedDepthBokeh(this.scene, this.camera, {
      focus: 25,
      aperture: 0.0018,
      maxblur: 0.011,
    });
    this.composer.addPass(this.bokeh);
    this.smaa.enabled = false;
    this.composer.addPass(this.smaa);
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.18,
        0.5,
        0.88,
      ),
    );
    this.composer.addPass(new OutputPass());
    this.bindPointer();
  }
  async load(assetUrl = publicAsset("assets/archive-cassette.glb")) {
    this.labelMark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(labelMarkSvg)}`;
    // A failed decode leaves the mark out of the label; the archive still loads.
    await this.labelMark
      .decode()
      .catch((error) => console.warn("[label] mark decode failed", error));
    const gltf = await loadGltfWithRetry(assetUrl);
    gltf.scene.updateMatrixWorld(true);
    const normalized = normalizeArchiveScene(gltf.scene);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const poolCount = LOOP_COLUMNS * LOOP_ROWS;
    const capacity = this.instanceCapacity;
    for (let index = 0; index < poolCount; index++) {
      const cell = poolCell(index);
      this.cells.push(cell);
    }
    // 新模型把整张卡面印在贴纸上，旧模型把铭牌单独做成一块小板。
    // 有卡面角色时不再叠加独立标签平面，否则两层文字会互相盖住。
    let hasCardSurface = false;
    let cardPlaneZ = -Infinity;
    let glassFrontZ = -Infinity;
    for (const mesh of meshes) {
      const geom = mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld)
        .translate(
          normalized.offset.x,
          normalized.offset.y,
          normalized.offset.z,
        )
        .scale(1, 1, 1);
      const source = mesh.material as THREE.MeshStandardMaterial;
      const name = surfaceName(source.name);
      const role = surfaceRole(name);
      if (role === "glass") {
        if (!geom.boundingBox) geom.computeBoundingBox();
        if (geom.boundingBox) {
          glassFrontZ = Math.max(glassFrontZ, geom.boundingBox.max.z);
        }
      }
      if (role === "card") {
        geom.computeBoundingBox();
        if (geom.boundingBox)
          cardPlaneZ = Math.max(cardPlaneZ, geom.boundingBox.max.z);
      }
      if (role === "card" && !this.bakedCardTexture && source.map) {
        this.bakedCardTexture = source.map;
      }
      const mat = source.clone() as THREE.MeshPhysicalMaterial;
      mat.envMapIntensity = 0.6;
      if (role === "glass") {
        mat.color.set(WARM.glass);
        mat.transmission = 0.9;
        mat.thickness = 0.12;
        mat.roughness = 0.21;
        mat.ior = 1.46;
        mat.clearcoat = 0.28;
        mat.clearcoatRoughness = 0.18;
        mat.attenuationColor = new THREE.Color(WARM.glassAttenuation);
        mat.attenuationDistance = 2;
      }
      if (role === "acrylic") {
        // 空心亚克力侧壁：壁厚约 0.02，光学厚度不能按整盒深度算。
        mat.color.set(WARM.glass);
        mat.transmission = 0.88;
        mat.thickness = 0.02;
        mat.roughness = 0.08;
        mat.ior = 1.49;
        mat.attenuationColor = new THREE.Color(WARM.acrylicAttenuation);
        mat.attenuationDistance = 0.6;
      }
      if (role === "ceramic") {
        mat.color.set(WARM.ceramic);
        mat.roughness = 0.6;
      }
      if (role === "label") mat.color.set(WARM.label);
      if (role === "edge") {
        mat.color.set(WARM.edge);
        mat.roughness = 0.31;
        mat.transmission = 0.65;
        mat.thickness = 0.04;
      }
      if (role === "shell") {
        // 单块白色厚板：不透明，留一点粗糙度让高光散开。
        mat.color.set(WARM.shell);
        mat.transmission = 0;
        mat.thickness = 0;
        mat.roughness = 0.44;
        mat.metalness = 0;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 2;
        mat.polygonOffsetUnits = 2;
      }
      if (role === "frame") {
        // 边框只比主体深一档，靠明度而不是高对比描边塑形。
        mat.color.set(
          name === "REF_FrameMintIn" ? WARM.frameInner : WARM.frame,
        );
        mat.transmission = 0;
        mat.thickness = 0;
        mat.roughness = 0.58;
        mat.metalness = 0;
        if (name === "REF_FrameMintIn") {
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 1;
        }
      }
      if (role === "card") {
        // 印刷纸面：覆膜用 clearcoat，不用 transmission。
        // 颜色压到比主体低一档，否则贴纸和白板在明亮场景里糊成一片，
        // 读不出「卡 + 标签」两层。设计稿里这个差是 5–7 级。
        // clearcoat 只留一点：0.42 的高光会把卡面上的深色文字冲成浅灰。
        mat.color.set(WARM.card);
        mat.transmission = 0;
        mat.thickness = 0;
        mat.roughness = 0.72;
        mat.metalness = 0;
        mat.clearcoat = 0.1;
        mat.clearcoatRoughness = 0.3;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 2;
        mat.polygonOffsetUnits = 2;
        hasCardSurface = true;
      }
      if (role === "diffuser") {
        mat.color.set(WARM.diffuser);
        mat.transmission = 0;
        mat.roughness = 0.7;
      }
      if (role === "optics-body") {
        mat.color.set(WARM.opticsBody);
        mat.roughness = 0.48;
        mat.metalness = 0.05;
      }
      if (role === "optics-edge") {
        // Internal refractive shoulders must be in the opaque capture: WebGL's
        // screen-space transmission cannot recursively sample another glass mesh.
        mat.transmission = 0;
        mat.color.set(WARM.opticsEdge);
        mat.roughness = 0.26;
        mat.metalness = 0.08;
      }
      if (role === "engrave") {
        mat.color.set(name === "REF_FrameInk" ? WARM.frameInk : WARM.ruler);
        mat.transmission = 0;
        mat.roughness = 0.62;
        mat.metalness = 0;
      }
      if (role === "fastener") {
        mat.color.set(name === "REF_Slot" ? WARM.slot : WARM.fastener);
        mat.roughness = 0.42;
        mat.metalness = name === "REF_Slot" ? 0.08 : 0.34;
      }
      if (role === "index") {
        mat.color.set(WARM.slot);
        mat.roughness = 0.56;
        mat.metalness = 0.02;
      }
      if (role === "optics-accent") mat.color.set(WARM.accent);
      if (role === "index-accent") mat.color.set(WARM.accent);
      configureInternalOptics(name, mat);
      if (role === "ink") continue;
      const selectedMesh = new THREE.Mesh(geom, mat);
      selectedMesh.userData.surface = name;
      selectedMesh.castShadow =
        role === "diffuser" || role === "shell" || role === "frame";
      selectedMesh.receiveShadow =
        role === "shell" ||
        role === "frame" ||
        role === "card" ||
        role === "seal";
      if (mat.transmission === 0) selectedMesh.renderOrder = -5;
      this.model.add(selectedMesh);
      // Keep the readable shell, frame, optical edge, card, seal and fastener
      // layers in tightly packed rows. Sub-millimetre typography stays selected.
      if (!ARRAY_ROLES.has(role)) {
        this.appearance.register(name, mat);
        continue;
      }
      if (!geom.boundingBox) geom.computeBoundingBox();
      // Stacked overview cards completely occlude background printed card faces and rear shells/frames.
      // Register mat as both high & low so CardAppearance keeps these non-instanced exterior parts opaque.
      if (
        role === "card" ||
        ((role === "shell" || role === "frame") &&
          geom.boundingBox &&
          geom.boundingBox.max.z < 0)
      ) {
        this.appearance.register(name, mat, mat);
        continue;
      }
      const arrayMat = mat.clone();
      arrayMat.side = THREE.FrontSide;
      if (role === "glass") {
        arrayMat.transmission = 0.78;
        if (this.lightingLook === "refined") {
          // Longer oblique paths pick up the warm body tint, while the thin
          // edges and the extracted clear cover retain a brighter response.
          arrayMat.thickness = 0.28;
          arrayMat.attenuationColor.set(WARM.glassAttenuation);
          arrayMat.attenuationDistance = 1.2;
        }
        arrayMat.transparent = false;
        arrayMat.color.set(WARM.glass);
        arrayMat.onBeforeCompile = (shader) => {
          shader.vertexShader =
            "varying float vPanelHeight;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvPanelHeight = position.y / 3.7;",
          );
          shader.fragmentShader =
            "varying float vPanelHeight;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n" +
              "vec3 archivePanelTint = mix(vec3(0.72, 0.64, 0.53), vec3(1.0, 0.98, 0.94), smoothstep(0.1, 1.0, vPanelHeight));\n" +
              "archivePanelTint = mix(archivePanelTint, vec3(1.0, 0.98, 0.94), archiveBottomLight);\n" +
              "diffuseColor.rgb *= archivePanelTint;",
          );
        };
        arrayMat.roughness = 0.28;
        arrayMat.clearcoat = 0;
        arrayMat.clearcoatRoughness = 0.25;
      }
      if (role === "acrylic") {
        arrayMat.transmission = 0.76;
        arrayMat.thickness = 0.028;
        arrayMat.roughness = 0.16;
        arrayMat.color.set(WARM.glass);
      }
      if (role === "diffuser") arrayMat.color.set(WARM.diffuser);
      if (role === "edge") {
        arrayMat.transmission = 0;
        arrayMat.color.set(WARM.arrayEdge);
        arrayMat.roughness = 0.38;
      }
      if (role === "index") {
        arrayMat.color.set(WARM.slot);
        arrayMat.metalness = 0.05;
      }
      this.appearance.register(name, mat, arrayMat);
      this.slotLightAttribute ??= new THREE.InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      this.neighborLightAttribute ??= new THREE.InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      this.lateralLightAttribute ??= new THREE.InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      this.topRailLightAttribute ??= new THREE.InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("archiveSlotLight", this.slotLightAttribute);
      geom.setAttribute("archiveSlotReflection", this.neighborLightAttribute);
      geom.setAttribute("archiveSlotLateral", this.lateralLightAttribute);
      geom.setAttribute("archiveSlotTopRail", this.topRailLightAttribute);
      this.installOverviewUnderlight(arrayMat, role, "neighbor", true);
      const inst = new THREE.InstancedMesh(geom, arrayMat, capacity);
      // All surfaces move rigidly together; share the transform buffer on the GPU.
      inst.instanceMatrix =
        this.instances[0]?.instanceMatrix ??
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow =
        role === "diffuser" || role === "shell" || role === "frame";
      inst.receiveShadow =
        role === "shell" || role === "frame" || role === "seal";
      inst.frustumCulled = false;
      inst.userData.surfaceRole = role;
      inst.renderOrder =
        arrayMat.transmission > 0
          ? 0
          : role === "frame" || role === "seal"
            ? -4
            : role === "shell"
              ? -3
              : -2;
      this.instances.push(inst);
      this.scene.add(inst);
    }
    this.glassFrontZ = Number.isFinite(glassFrontZ) ? glassFrontZ : 0.0505;
    this.cardPlaneZ = Number.isFinite(cardPlaneZ) ? cardPlaneZ : 0.255;
    // 投影来源按角色兜底：旧模型用 diffuser，新模型没有这个件，退到主体或卡面。
    // 旧代码用非空断言取第一个 castShadow 网格，换模型会直接抛错。
    const largestArea = (meshes: THREE.InstancedMesh[]) => {
      let best: THREE.InstancedMesh | undefined;
      let bestArea = -1;
      for (const mesh of meshes) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const area = box
          ? (box.max.x - box.min.x) * (box.max.y - box.min.y)
          : 0;
        if (area > bestArea) {
          bestArea = area;
          best = mesh;
        }
      }
      return best;
    };
    const shadowSource =
      this.instances.find((mesh) => mesh.userData.surfaceRole === "diffuser") ??
      largestArea(
        this.instances.filter((mesh) => mesh.userData.surfaceRole === "shell"),
      ) ??
      largestArea(
        this.instances.filter((mesh) => mesh.userData.surfaceRole === "frame"),
      ) ??
      this.instances[0];
    if (shadowSource) {
      this.shadowCoverage = new ArchiveShadowCoverage(shadowSource);
      this.scene.add(this.shadowCoverage.mesh);
      for (const inst of this.instances) inst.castShadow = false;
    } else {
      console.warn("[archive] asset has no array surface; shadows skipped");
    }
    this.appearance.prepare(this.model);
    this.applyOverviewUnderlight(this.model, "selected");
    this.appearance.apply(this.model, 0);
    // 铭牌画布始终准备好：独立查看器的拆解模型仍然需要它。
    // 2x the authored layout: the label plane is sampled at roughly a fifth of
    // its texture width in the detail shot, so 1024 px read as a smudge.
    this.labelCanvas.width = LABEL_WIDTH * LABEL_SCALE;
    this.labelCanvas.height = LABEL_HEIGHT * LABEL_SCALE;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();
    this.overviewBadgeCanvas.width =
      OVERVIEW_BADGE_WIDTH * OVERVIEW_BADGE_SCALE;
    this.overviewBadgeCanvas.height =
      OVERVIEW_BADGE_HEIGHT * OVERVIEW_BADGE_SCALE;
    this.overviewBadgeTexture = new THREE.CanvasTexture(
      this.overviewBadgeCanvas,
    );
    // Hardware sRGB decoding keeps badge filtering in linear light.
    this.overviewBadgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.overviewBadgeTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();
    this.overviewBadgeUniform.value = this.overviewBadgeTexture;
    const hoverFallbackCanvas = document.createElement("canvas");
    hoverFallbackCanvas.width = 4;
    hoverFallbackCanvas.height = 4;
    const hoverBadge = new THREE.CanvasTexture(hoverFallbackCanvas);
    hoverBadge.colorSpace = THREE.SRGBColorSpace;
    hoverBadge.anisotropy = this.overviewBadgeTexture.anisotropy;
    this.hoverBadgeFallback = hoverBadge;
    this.hoverBadgeUniform.value = hoverBadge;
    if (hasCardSurface) {
      // 总览与离场副本共享 GLB 的烘焙卡面。记录卡面只在打开详情时创建，
      // 避免每次行切换同步分配、重绘并上传 2000 × 1480 画布。
      this.drawLabel(0);
      this.drawFullOverviewBadge(0);
    } else {
      // 旧模型：单独一块铭牌平面，贴在盖板前面。
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.99, 0.46),
        new THREE.MeshBasicMaterial({
          map: this.labelTexture,
          toneMapped: false,
          transparent: true,
          depthWrite: false,
        }),
      );
      label.position.set(-1.36, 3.04, 0.255);
      this.model.add(label);
      this.drawLabel(0);
      this.drawFullOverviewBadge(0);
    }
    this.model.updateMatrixWorld(true);
    this.modelBounds.setFromObject(this.model);
    this.initPulloutCardMesh();
    this.initDetailStickerMesh();
    this.initHoverStickerMesh();
    this.initDetailToggleMesh();
    this.scene.add(this.model);
    this.model.position.copy(this.cellPosition(this.selectedCell));
    await this.prewarmOutgoingPrograms();
    this.loaded = true;
    this.redrawDetailSticker();
  }

  private createDetailSurfaceTexture(canvas: HTMLCanvasElement) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.repeat.y = -1;
    texture.offset.y = 1;
    return texture;
  }
  private initPulloutCardMesh() {
    if (this.detailPulloutGroup) return;
    this.detailPulloutCanvas.width = PULLOUT_CANVAS_W;
    this.detailPulloutCanvas.height = PULLOUT_CANVAS_H;
    const tex = this.createDetailSurfaceTexture(this.detailPulloutCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.detailPulloutTexture = tex;

    const group = new THREE.Group();
    group.name = "DetailPulloutCard";
    group.position.set(0.45, 1.85, 0);
    group.visible = false;

    const bodyGeom = new THREE.BoxGeometry(
      PULLOUT_CARD_W,
      PULLOUT_CARD_H,
      0.016,
    );
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: "#f4eee2",
      emissive: "#f4eee2",
      emissiveIntensity: 0.16,
      roughness: 0.78,
      metalness: 0,
      transmission: 0,
      thickness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
      clippingPlanes: [this.detailClipPlane],
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.z = -0.008;
    bodyMesh.castShadow = false;
    bodyMesh.receiveShadow = false;

    const frontGeom = new THREE.PlaneGeometry(PULLOUT_CARD_W, PULLOUT_CARD_H);
    const frontMat = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      map: tex,
      emissive: "#ffffff",
      emissiveMap: tex,
      emissiveIntensity: 0.34,
      roughness: 0.86,
      metalness: 0,
      transmission: 0,
      thickness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0,
      clippingPlanes: [this.detailClipPlane],
    });
    const frontMesh = new THREE.Mesh(frontGeom, frontMat);
    frontMesh.position.z = 0.003;
    frontMesh.receiveShadow = false;

    group.add(bodyMesh, frontMesh);
    this.detailPulloutGroup = group;
    this.scene.add(group);
  }
  private initDetailStickerMesh() {
    if (this.detailStickerGroup) return;
    this.detailStickerCanvas.width = STICKER_CANVAS_W;
    this.detailStickerCanvas.height = STICKER_CANVAS_H;
    const stickerTex = this.createDetailSurfaceTexture(this.detailStickerCanvas);
    stickerTex.colorSpace = THREE.SRGBColorSpace;
    stickerTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.detailStickerTexture = stickerTex;

    const backCanvas = document.createElement("canvas");
    drawStickerBackMask(backCanvas);
    const backTex = this.createDetailSurfaceTexture(backCanvas);
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.detailStickerBackTexture = backTex;

    const shadowCanvas = document.createElement("canvas");
    drawStickerContactShadow(shadowCanvas);
    const shadowTex = this.createDetailSurfaceTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    shadowTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.detailStickerShadowTexture = shadowTex;

    const group = new THREE.Group();
    group.name = "DetailDieCutSticker";
    group.visible = false;

    const shadowGeom = new THREE.PlaneGeometry(
      STICKER_SHADOW_W,
      STICKER_SHADOW_H,
    );
    const shadowSizeUniform = {
      value: new THREE.Vector2(STICKER_SHADOW_W, STICKER_SHADOW_H),
    };
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      color: 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: 0.72,
      fog: true,
    });
    shadowMat.customProgramCacheKey = () => "detail-sticker-peel-shadow-v3";
    shadowMat.onBeforeCompile = (shader) => {
      shader.uniforms.uPeel = this.detailStickerShadowPeel;
      shader.uniforms.uShadowSize = shadowSizeUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `uniform vec4 uPeel;
uniform vec2 uShadowSize;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// signs 指向该角在纸面内的外法线方向：右上 (1,1)、右下 (1,-1)、左下 (-1,-1)、左上 (-1,1)。
float stickerPeelShadow(vec2 localPos, vec2 signs, float peel) {
  float p = clamp(peel, 0.0, 1.0);
  if (p <= 0.0005) return 0.0;
  float radius = max(mix(0.22, 0.38, p), 0.001);
  // 翻起的纸角把阴影投到背离主光的一侧（左上主光 → 右下偏移），四个角共用同一方向。
  vec2 shift = vec2(0.010 + 0.022 * p, -(0.014 + 0.028 * p));
  vec2 pShifted = localPos - shift;
  float rx = 1.02 - signs.x * pShifted.x;
  float ry = 0.33 - signs.y * pShifted.y;
  float s = rx * 0.72 + ry * 0.69;
  float u = clamp(1.0 - s / radius, 0.0, 1.0);
  vec2 halfSize = vec2(1.0127, 0.3227);
  float sdfFoot = sdRoundedBox(localPos, halfSize, 0.040);
  float sdfCast = sdRoundedBox(pShifted, halfSize, 0.040);
  float blurW = mix(0.010, 0.034, u * (0.4 + 0.6 * p));
  float insideWedge = 1.0 - smoothstep(-blurW * 0.4, blurW, min(sdfFoot, sdfCast));
  float creaseFade = smoothstep(0.0, 0.28, u);
  float lipFocus = 0.75 + 0.25 * smoothstep(0.10, 0.75, u);
  // 与几何一致的 0.1 包络，避免极小 peel 时还留着一层硬阴影。
  float envelope = smoothstep(0.0, 0.1, p);
  return insideWedge * creaseFade * lipFocus * mix(0.18, 0.76, pow(p, 0.58)) * envelope;
}

void main() {`,
        )
        .replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
  vec4 baseShadow = texture2D(map, vMapUv);
  vec2 localPos = (vec2(vMapUv.x, 1.0 - vMapUv.y) - 0.5) * uShadowSize;
  float peelAlpha = max(
    max(stickerPeelShadow(localPos, vec2(1.0, 1.0), uPeel.x),
        stickerPeelShadow(localPos, vec2(1.0, -1.0), uPeel.y)),
    max(stickerPeelShadow(localPos, vec2(-1.0, -1.0), uPeel.z),
        stickerPeelShadow(localPos, vec2(-1.0, 1.0), uPeel.w)));
  float combinedA = 1.0 - (1.0 - baseShadow.a) * (1.0 - peelAlpha);
  vec3 peelRgb = vec3(0.018, 0.012, 0.008);
  vec3 finalRgb = combinedA > 0.0005
    ? (baseShadow.rgb * baseShadow.a + peelRgb * peelAlpha * (1.0 - baseShadow.a)) / combinedA
    : peelRgb;
  diffuseColor *= vec4(finalRgb, combinedA);
#endif`,
        );
    };
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.position.z = STICKER_CONTACT_SHADOW_LOCAL_Z;
    shadowMesh.renderOrder = 2;
    shadowMesh.castShadow = false;
    shadowMesh.receiveShadow = false;
    shadowMesh.userData.stickerShadowPeel = this.detailStickerShadowPeel;
    this.detailStickerShadowMat = shadowMat;

    const stickerGeom = new THREE.PlaneGeometry(STICKER_W, STICKER_H, 48, 24);
    const posAttr = stickerGeom.attributes.position as THREE.BufferAttribute;
    this.detailStickerBasePos = new Float32Array(posAttr.array as Float32Array);
    this.detailStickerGeom = stickerGeom;
    // 哨兵值保证首次 applyStickerPeel 一定会把几何从平面变形到静置卷翘。
    this.detailStickerLastPeels = [-1, -1, -1, -1];

    const frontMat = new THREE.MeshPhysicalMaterial({
      color: "#ebe7df",
      map: stickerTex,
      emissive: "#f7f4ec",
      emissiveMap: stickerTex,
      emissiveIntensity: 0.46,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.36,
      transmission: 0,
      thickness: 0,
      transparent: true,
      alphaTest: 0,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    frontMat.customProgramCacheKey = () => "detail-sticker-fold-shade-v2";
    frontMat.onBeforeCompile = (shader) => {
      shader.uniforms.uPeel = this.detailStickerShadowPeel;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `uniform vec4 uPeel;

// 返回 (折痕压暗, 弯折提亮)；signs 指向该角在纸面内的外法线方向。
vec2 stickerCornerFold(vec2 b, vec2 signs, float peel) {
  float p = clamp(peel, 0.0, 1.0);
  if (p <= 0.0005) return vec2(0.0);
  float foldRadius = max(mix(0.22, 0.38, p), 0.001);
  float foldS = (1.02 - signs.x * b.x) * 0.72 + (0.33 - signs.y * b.y) * 0.69;
  float foldU = clamp(1.0 - foldS / foldRadius, 0.0, 1.0);
  float foldStrength = 0.45 + 0.55 * p;
  float crease = smoothstep(0.0, 0.26, foldU) * (1.0 - smoothstep(0.26, 0.62, foldU)) * 0.065 * foldStrength;
  float bend = sin(smoothstep(0.12, 0.92, foldU) * 3.14159265) * 0.075 * foldStrength;
  // 与几何/阴影一致的 0.1 包络，避免极小 peel 时折痕仍然满强度。
  return vec2(crease, bend) * smoothstep(0.0, 0.1, p);
}

void main() {`,
        )
        .replace(
          "#include <opaque_fragment>",
          `#ifdef USE_MAP
{
  vec2 b = vec2((vMapUv.x - 0.5) * 2.04, (0.5 - vMapUv.y) * 0.66);
  vec2 fold = stickerCornerFold(b, vec2(1.0, 1.0), uPeel.x)
            + stickerCornerFold(b, vec2(1.0, -1.0), uPeel.y)
            + stickerCornerFold(b, vec2(-1.0, -1.0), uPeel.z)
            + stickerCornerFold(b, vec2(-1.0, 1.0), uPeel.w);
  outgoingLight = outgoingLight * (1.0 - fold.x) + vec3(fold.y);
}
#endif
#include <opaque_fragment>`,
        );
    };
    const frontMesh = new THREE.Mesh(stickerGeom, frontMat);
    frontMesh.renderOrder = 4;
    frontMesh.castShadow = false;
    frontMesh.receiveShadow = false;
    frontMesh.userData.stickerShadowPeel = this.detailStickerShadowPeel;
    this.detailStickerFrontMat = frontMat;

    const backMat = new THREE.MeshPhysicalMaterial({
      color: "#ebe6dc",
      map: backTex,
      emissive: "#f2ede3",
      emissiveIntensity: 0.48,
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0,
      transmission: 0,
      thickness: 0,
      transparent: true,
      alphaTest: 0,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const backMesh = new THREE.Mesh(stickerGeom, backMat);
    backMesh.renderOrder = 3;
    backMesh.castShadow = false;
    backMesh.receiveShadow = false;
    this.detailStickerBackMat = backMat;

    group.add(shadowMesh, frontMesh, backMesh);
    this.detailStickerGroup = group;
    for (let corner = 0; corner < STICKER_CORNERS.length; corner++) {
      this.detailStickerPeelScratch[corner] =
        this.detailStickerCornerPeel[corner].value;
    }
    this.applyStickerPeel(this.detailStickerPeelScratch);
    this.scene.add(group);
  }
  private initHoverStickerMesh() {
    // 悬停贴纸复用详情贴纸的接触投影纹理，因此必须在 initDetailStickerMesh()
    // 之后调用；纹理尚未就绪时直接返回，避免创建出缺投影的悬停贴纸。
    if (this.hoverStickerGroup || !this.detailStickerShadowTexture) return;
    const group = new THREE.Group();
    group.name = "HoverDieCutSticker";
    group.visible = false;

    const shadowGeom = new THREE.PlaneGeometry(
      STICKER_SHADOW_W,
      STICKER_SHADOW_H,
    );
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.detailStickerShadowTexture,
      color: 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: 0,
      fog: true,
    });
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.position.z = STICKER_CONTACT_SHADOW_LOCAL_Z;
    shadowMesh.renderOrder = 2;
    shadowMesh.castShadow = false;
    shadowMesh.receiveShadow = false;
    this.hoverStickerShadowMat = shadowMat;

    const stickerGeom = new THREE.PlaneGeometry(STICKER_W, STICKER_H, 16, 8);
    const basePos = new Float32Array(
      (stickerGeom.attributes.position as THREE.BufferAttribute)
        .array as Float32Array,
    );
    deformStickerGeometry(stickerGeom, basePos, [0, 0.1, 0, 0]);

    const frontMat = new THREE.MeshPhysicalMaterial({
      color: "#ebe7df",
      emissive: "#f7f4ec",
      emissiveIntensity: 0.25,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
      transmission: 0,
      thickness: 0,
      transparent: true,
      alphaTest: 0,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const frontMesh = new THREE.Mesh(stickerGeom, frontMat);
    frontMesh.renderOrder = 4;
    frontMesh.castShadow = false;
    frontMesh.receiveShadow = false;
    this.hoverStickerFrontMat = frontMat;

    group.add(shadowMesh, frontMesh);
    this.hoverStickerGroup = group;
    this.scene.add(group);
  }
  private bindHoverStickerTexture(index: number) {
    if (!this.hoverStickerFrontMat || index === this.hoverStickerIndex) return;
    let entry = this.hoverStickerCache.get(index);
    if (entry) {
      this.hoverStickerCache.delete(index);
      this.hoverStickerCache.set(index, entry);
      this.hoverStickerFrontMat.map = entry.texture;
      this.hoverStickerFrontMat.emissiveMap = entry.texture;
      this.hoverStickerFrontMat.needsUpdate = true;
      this.hoverStickerIndex = index;
      return;
    }
    if (this.hoverStickerCache.size >= MAX_HOVER_STICKER_CACHE) {
      const oldestKey = this.hoverStickerCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.hoverStickerCache.get(oldestKey);
        this.hoverStickerCache.delete(oldestKey);
        if (oldest) entry = oldest;
      }
    }
    if (!entry) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(STICKER_CANVAS_W * HOVER_STICKER_SCALE);
      canvas.height = Math.round(STICKER_CANVAS_H * HOVER_STICKER_SCALE);
      const texture = this.createDetailSurfaceTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.badgeAnisotropy();
      entry = { canvas, texture };
    }
    drawIndustrialDieCutSticker(
      entry.canvas,
      records[index],
      this.currentDetailSurfaceState(false),
      HOVER_STICKER_SCALE,
    );
    entry.texture.needsUpdate = true;
    this.hoverStickerCache.set(index, entry);
    this.hoverStickerFrontMat.map = entry.texture;
    this.hoverStickerFrontMat.emissiveMap = entry.texture;
    this.hoverStickerFrontMat.needsUpdate = true;
    this.hoverStickerIndex = index;
  }
  private createMistEtchMaterial(
    texture: THREE.CanvasTexture,
    seed: number,
  ): {
    material: THREE.MeshBasicMaterial;
    uniforms: MistDissolveShaderUniforms;
  } {
    const uniforms: MistDissolveShaderUniforms = {
      uProgress: { value: 1 },
      uHiding: { value: 0 },
      uActive: { value: 0 },
      uModeSwitch: { value: 0 },
      uSeed: { value: seed },
      uTexelSize: {
        value: new THREE.Vector2(1 / TOGGLE_CANVAS_W, 1 / TOGGLE_CANVAS_H),
      },
    };
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: DETAIL_TOGGLE_INK_COLOR.clone(),
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: true,
    });
    material.customProgramCacheKey = () => "detail-toggle-mist-etch-v2";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = uniforms.uProgress;
      shader.uniforms.uHiding = uniforms.uHiding;
      shader.uniforms.uActive = uniforms.uActive;
      shader.uniforms.uModeSwitch = uniforms.uModeSwitch;
      shader.uniforms.uSeed = uniforms.uSeed;
      shader.uniforms.uTexelSize = uniforms.uTexelSize;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `uniform float uProgress;
uniform float uHiding;
uniform float uActive;
uniform float uModeSwitch;
uniform float uSeed;
uniform vec2 uTexelSize;

float mistEaseOutQuad(float t) {
  float inv = 1.0 - t;
  return 1.0 - inv * inv;
}
float mistEaseOutCubic(float t) {
  float inv = 1.0 - t;
  return 1.0 - inv * inv * inv;
}
float mistCellHash(float col, float row, float seed) {
  return fract(sin(dot(vec3(col + 1.0, row + 1.0, seed), vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

void main() {`,
        )
        .replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
  if (uActive < 0.5) {
    diffuseColor.a *= texture2D(map, vMapUv).a;
  } else {
    float localT = clamp(uProgress, 0.0, 1.0);
    float motionT = uHiding > 0.5 ? mistEaseOutQuad(localT) : mistEaseOutCubic(localT);
    float blurMax = uModeSwitch > 0.5 ? (uHiding > 0.5 ? 5.0 : 4.8) : (uHiding > 0.5 ? 6.5 : 5.5);
    float blurPx = (uHiding > 0.5 ? motionT : (1.0 - motionT)) * blurMax * 1.8;
    vec2 stepUv = uTexelSize * blurPx;
    float blurAlpha =
      texture2D(map, vMapUv).a * 0.24 +
      (
        texture2D(map, vMapUv + vec2(stepUv.x, 0.0)).a +
        texture2D(map, vMapUv - vec2(stepUv.x, 0.0)).a +
        texture2D(map, vMapUv + vec2(0.0, stepUv.y)).a +
        texture2D(map, vMapUv - vec2(0.0, stepUv.y)).a
      ) * 0.11 +
      (
        texture2D(map, vMapUv + vec2(stepUv.x, stepUv.y) * 0.78).a +
        texture2D(map, vMapUv + vec2(-stepUv.x, stepUv.y) * 0.78).a +
        texture2D(map, vMapUv + vec2(stepUv.x, -stepUv.y) * 0.78).a +
        texture2D(map, vMapUv + vec2(-stepUv.x, -stepUv.y) * 0.78).a
      ) * 0.08;

    float uText = clamp((vMapUv.x - 0.52) / 0.44, 0.0, 1.0);
    float vText = clamp((vMapUv.y - 0.28) / 0.44, 0.0, 1.0);
    float col = clamp(floor((uText - (-0.18)) / (1.36 / 10.0)), 0.0, 9.0);
    float row = clamp(floor((vText - (-0.28)) / (1.56 / 4.0)), 0.0, 3.0);
    float nx = col / 9.0;
    float ny = row / 3.0;
    float score = nx * 0.45 + ny * 0.15 + mistCellHash(col, row, uSeed) * 0.40;
    float stratum = min(7.0, floor(score * 8.0));
    float center = (stratum + 0.5) / 8.0;
    float mapped = localT * 1.36 - 0.18;
    float rev = smoothstep(center - 0.18, center + 0.18, mapped);
    float maskAlpha = uHiding > 0.5 ? (1.0 - rev) : rev;

    float bloomPeak = uModeSwitch > 0.5 ? (uHiding > 0.5 ? 0.10 : 0.13) : (uHiding > 0.5 ? 0.14 : 0.18);
    float bloom = 1.0 + sin(motionT * 3.14159265) * bloomPeak;
    float alphaFade = uHiding > 0.5 ? clamp((1.0 - localT) * 1.25, 0.0, 1.0) : clamp(localT * 1.35, 0.0, 1.0);
    diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb * bloom);
    diffuseColor.a *= blurAlpha * maskAlpha * alphaFade;
  }
#endif`,
        );
    };
    return { material, uniforms };
  }
  private initDetailToggleMesh() {
    if (this.detailToggleGroup) return;
    this.detailToggleInCanvas.width = TOGGLE_CANVAS_W;
    this.detailToggleInCanvas.height = TOGGLE_CANVAS_H;
    this.detailToggleOutCanvas.width = TOGGLE_CANVAS_W;
    this.detailToggleOutCanvas.height = TOGGLE_CANVAS_H;

    const aniso = this.badgeAnisotropy();
    const inTex = this.createDetailSurfaceTexture(this.detailToggleInCanvas);
    inTex.colorSpace = THREE.NoColorSpace;
    inTex.minFilter = THREE.LinearMipmapLinearFilter;
    inTex.magFilter = THREE.LinearFilter;
    inTex.generateMipmaps = true;
    inTex.anisotropy = aniso;
    this.detailToggleInTexture = inTex;

    const outTex = this.createDetailSurfaceTexture(this.detailToggleOutCanvas);
    outTex.colorSpace = THREE.NoColorSpace;
    outTex.minFilter = THREE.LinearMipmapLinearFilter;
    outTex.magFilter = THREE.LinearFilter;
    outTex.generateMipmaps = true;
    outTex.anisotropy = aniso;
    this.detailToggleOutTexture = outTex;

    const geom = new THREE.PlaneGeometry(TOGGLE_PLANE_W, TOGGLE_PLANE_H);
    const outSetup = this.createMistEtchMaterial(outTex, 293);
    const outMesh = new THREE.Mesh(geom, outSetup.material);
    outMesh.renderOrder = 1;
    outMesh.castShadow = false;
    outMesh.receiveShadow = false;
    outMesh.visible = false;
    outMesh.userData.mistDissolve = outSetup.uniforms;
    this.detailToggleOutMesh = outMesh;
    this.detailToggleOutUniforms = outSetup.uniforms;

    const inSetup = this.createMistEtchMaterial(inTex, 263);
    const inMesh = new THREE.Mesh(geom, inSetup.material);
    inMesh.renderOrder = 1;
    inMesh.castShadow = false;
    inMesh.receiveShadow = false;
    inMesh.visible = false;
    inMesh.userData.mistDissolve = inSetup.uniforms;
    this.detailToggleInMesh = inMesh;
    this.detailToggleInUniforms = inSetup.uniforms;

    const group = new THREE.Group();
    group.name = "DetailToggleTrigger";
    group.visible = false;
    group.add(outMesh, inMesh);
    this.detailToggleGroup = group;
    this.scene.add(group);

    this.redrawDetailToggleCanvas(
      this.detailToggleInCanvas,
      this.detailToggleInTexture,
      false,
      false,
    );
  }
  private redrawDetailToggleCanvas(
    canvas: HTMLCanvasElement,
    texture: THREE.CanvasTexture | undefined,
    drawerOpen: boolean,
    hovered: boolean,
  ) {
    drawStandaloneDetailToggle(canvas, { drawerOpen, hovered });
    const targetMesh =
      texture === this.detailToggleOutTexture
        ? this.detailToggleOutMesh
        : this.detailToggleInMesh;
    if (targetMesh?.material instanceof THREE.MeshBasicMaterial) {
      targetMesh.material.color.copy(
        hovered ? DETAIL_TOGGLE_HOVER_COLOR : DETAIL_TOGGLE_INK_COLOR,
      );
    }
    if (texture) {
      texture.needsUpdate = true;
      this.renderState.invalidate();
    }
  }
  private handleDetailToggleOpenChange(prevOpen: boolean, nextOpen: boolean) {
    if (
      this.detailToggleMode !== "visible" &&
      this.detailToggleMode !== "reveal"
    ) {
      return;
    }
    const hovered = this.detailHoveredHotspot === "toggle-detail";
    this.detailToggleLabelOpen = nextOpen;
    if (!this.motion.surfaceTransitions) {
      this.detailToggleSwitchActive = false;
      if (this.detailToggleOutMesh) this.detailToggleOutMesh.visible = false;
      this.redrawDetailToggleCanvas(
        this.detailToggleInCanvas,
        this.detailToggleInTexture,
        nextOpen,
        hovered,
      );
      return;
    }
    this.redrawDetailToggleCanvas(
      this.detailToggleOutCanvas,
      this.detailToggleOutTexture,
      prevOpen,
      false,
    );
    this.redrawDetailToggleCanvas(
      this.detailToggleInCanvas,
      this.detailToggleInTexture,
      nextOpen,
      hovered,
    );
    this.detailToggleSwitchActive = true;
    this.detailToggleSwitchElapsed = 0;
  }
  private applyStickerPeel(peels: ArrayLike<number>) {
    if (!this.detailStickerGeom || !this.detailStickerBasePos) return;
    let changed = false;
    for (let corner = 0; corner < STICKER_CORNERS.length; corner++) {
      const p = THREE.MathUtils.clamp(peels[corner] ?? 0, 0, 1);
      if (Math.abs(p - this.detailStickerLastPeels[corner]) > 0.00001) {
        changed = true;
      }
    }
    if (!changed) return;
    for (let corner = 0; corner < STICKER_CORNERS.length; corner++) {
      this.detailStickerLastPeels[corner] = THREE.MathUtils.clamp(
        peels[corner] ?? 0,
        0,
        1,
      );
    }
    deformStickerGeometry(
      this.detailStickerGeom,
      this.detailStickerBasePos,
      this.detailStickerLastPeels,
    );
    this.renderState.invalidate();
  }
  private redrawDetailSticker() {
    if (!this.detailStickerTexture || !this.loaded) return;
    const record = records[this.selectedIndex];
    drawIndustrialDieCutSticker(
      this.detailStickerCanvas,
      record,
      this.currentDetailSurfaceState(this.targetDetail > 0),
    );
    this.detailStickerTexture.needsUpdate = true;
    this.renderState.invalidate();
  }
  private currentDetailSurfaceState(interactive: boolean): DetailSurfaceState {
    return {
      hovered: interactive ? this.detailHoveredHotspot : null,
      drawerOpen: interactive && this.detailDrawerOpen,
      copied: interactive && this.detailCopiedRecord !== undefined &&
        this.detailCopiedRecord === records[this.selectedIndex],
      scrollY: this.detailCardScrollY,
      interactive,
    };
  }
  private redrawPulloutCard() {
    if (!this.detailPulloutTexture || !this.loaded) return;
    const index = this.selectedIndex;
    const record = records[index];
    const stats: Required<ArchiveCardStats> = {
      sample: "样本不足 · n=1",
      downloads: 30,
      comments: 0,
      ...record?.stats,
      ...this.cardStatsOverrides.get(index),
    };
    const logo = this.getModelProviderLogo(record?.en ?? "");
    this.detailPulloutLayout = drawPulloutDetailCard(
      this.detailPulloutCanvas,
      record,
      logo,
      stats,
      this.currentDetailSurfaceState(this.isDetailBadgeActive()),
    );
    if (this.detailCardScrollY > this.detailPulloutLayout.maxScroll) {
      this.detailCardScrollY = this.detailPulloutLayout.maxScroll;
    }
    this.detailPulloutTexture.needsUpdate = true;
    this.renderState.invalidate();
  }
  private scrollDetailCard(delta: number) {
    const maxScroll = this.detailPulloutLayout?.maxScroll ?? 0;
    const next = THREE.MathUtils.clamp(this.detailCardScrollY + delta, 0, maxScroll);
    if (next === this.detailCardScrollY) return;
    this.detailCardScrollY = next;
    this.redrawPulloutCard();
  }
  private setDetailHover(next: DetailHotspot | null) {
    if (next === this.detailHoveredHotspot) return;
    const prev = this.detailHoveredHotspot;
    this.detailHoveredHotspot = next;
    // 指针离开贴纸后立刻忘记所在角，避免下一次进入时沿用旧角。
    if (next !== "note" && next !== "copy-prompt") {
      this.detailStickerHoverCorner = -1;
    }
    if (this.isDetailBadgeActive()) {
      const isStickerHotspot = (h: DetailHotspot | null) =>
        h === "note" || h === "copy-prompt";
      const isToggleHotspot = (h: DetailHotspot | null) =>
        h === "toggle-detail";
      const isFaceStatHotspot = (h: DetailHotspot | null) =>
        h === "cover" ||
        h === "rating" ||
        h === "downloads" ||
        h === "comments";
      if (isStickerHotspot(prev) || isStickerHotspot(next)) {
        this.redrawDetailSticker();
      }
      if (isToggleHotspot(prev) || isToggleHotspot(next)) {
        this.redrawDetailToggleCanvas(
          this.detailToggleInCanvas,
          this.detailToggleInTexture,
          this.detailToggleLabelOpen,
          next === "toggle-detail",
        );
      }
      if (isFaceStatHotspot(prev) || isFaceStatHotspot(next)) {
        this.drawFullOverviewBadge(this.selectedIndex);
      }
      if (this.detailDrawerOpen || this.detailDrawer.value > 0.01) {
        this.redrawPulloutCard();
      }
      this.renderState.invalidate();
    }
  }
  public get isDetailCardOpen() {
    return this.detailDrawerOpen;
  }
  public get detailHover() {
    return this.detailHoveredHotspot;
  }
  public setDetailCardOpen(open: boolean) {
    const next = Boolean(open) && Boolean(this.targetDetail);
    if (next === this.detailDrawerOpen) return;
    const prev = this.detailDrawerOpen;
    this.detailDrawerOpen = next;
    this.lastInteraction = this.clock;
    if (next) {
      this.redrawPulloutCard();
    }
    this.handleDetailToggleOpenChange(prev, next);
    if (!this.motion.detailTransition) {
      this.detailDrawer = { value: next ? 1 : 0, velocity: 0 };
    }
    this.renderState.invalidate();
    this.onDetailCardOpenChange?.();
  }
  public async copyDetailPrompt() {
    if (this.disposed || !this.targetDetail) return;
    const record = records[this.selectedIndex];
    const text = resolveRecordPrompt(record);
    if (!text || !(await this.onCopyPrompt?.(text))) return;
    if (this.disposed || !this.targetDetail || record !== records[this.selectedIndex]) {
      return;
    }
    const redraw = () => {
      if (!this.isDetailBadgeActive()) return;
      this.redrawDetailSticker();
      if (this.detailDrawerOpen || this.detailDrawer.value > 0.01) {
        this.redrawPulloutCard();
      }
    };
    this.detailCopiedRecord = record;
    if (this.detailCopiedTimer) window.clearTimeout(this.detailCopiedTimer);
    this.detailCopiedTimer = window.setTimeout(() => {
      this.detailCopiedTimer = 0;
      this.detailCopiedRecord = undefined;
      if (!this.disposed) redraw();
    }, 1800);
    redraw();
  }
  private handleDetailHotspotClick(hit: DetailHotspot | null) {
    if (!hit) return;
    const record = records[this.selectedIndex];
    if (hit === "toggle-detail") {
      this.setDetailCardOpen(!this.detailDrawerOpen);
      return;
    }
    if (hit === "note") {
      if (!this.detailDrawerOpen) this.setDetailCardOpen(true);
      return;
    }
    if (hit === "card-close") {
      this.setDetailCardOpen(false);
      return;
    }
    if (hit === "copy-prompt" || hit === "card-copy-prompt") {
      void this.copyDetailPrompt();
      return;
    }
    if (hit === "card-open-source" || hit === "cover") {
      const source = record?.source;
      if (source && /^https?:/i.test(source)) {
        window.open(source, "_blank", "noopener,noreferrer");
      }
    }
  }
  private pickDetailHotspot(
    clientX: number,
    clientY: number,
  ): DetailHotspot | null {
    this.detailStickerHoverCorner = -1;
    if (!this.loaded || this.modelBounds.isEmpty()) return null;
    const r = this.canvasRect();
    if (r.width <= 0 || r.height <= 0) return null;
    this.cursor.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.cursor, this.camera);

    if (
      this.detailDrawerOpen &&
      this.detailPulloutGroup?.visible &&
      this.detailDrawer.value > 0.15 &&
      this.detailPulloutLayout
    ) {
      this.detailPulloutGroup.updateMatrixWorld(true);
      if (
        Math.abs(this.detailPulloutGroup.matrixWorld.determinant()) >= 1e-12
      ) {
        this.pickInvMatrix.copy(this.detailPulloutGroup.matrixWorld).invert();
        this.pickLocalRay
          .copy(this.raycaster.ray)
          .applyMatrix4(this.pickInvMatrix);
        this.detailPickPlane.set(new THREE.Vector3(0, 0, 1), -0.003);
        if (
          this.pickLocalRay.direction.z < -0.15 &&
          this.pickLocalRay.intersectPlane(
            this.detailPickPlane,
            this.detailPickPoint,
          ) &&
          Math.abs(this.detailPickPoint.x) <= PULLOUT_CARD_W / 2 &&
          Math.abs(this.detailPickPoint.y) <= PULLOUT_CARD_H / 2
        ) {
          const cx =
            ((this.detailPickPoint.x + PULLOUT_CARD_W / 2) / PULLOUT_CARD_W) *
            PULLOUT_CANVAS_W;
          const cy =
            ((PULLOUT_CARD_H / 2 - this.detailPickPoint.y) / PULLOUT_CARD_H) *
            PULLOUT_CANVAS_H;
          this.detailPickPoint.applyMatrix4(this.detailPulloutGroup.matrixWorld);
          if (this.detailClipPlane.distanceToPoint(this.detailPickPoint) >= 0) {
            return hitTestPulloutCard(cx, cy, this.detailPulloutLayout) ?? "card-body";
          }
        }
      }
    }

    if (this.detailStickerGroup && this.detailStickerGroup.visible) {
      this.detailStickerGroup.updateMatrixWorld(true);
      if (
        Math.abs(this.detailStickerGroup.matrixWorld.determinant()) >= 1e-12
      ) {
        this.pickInvMatrix.copy(this.detailStickerGroup.matrixWorld).invert();
        this.pickLocalRay
          .copy(this.raycaster.ray)
          .applyMatrix4(this.pickInvMatrix);
        this.detailPickPlane.set(new THREE.Vector3(0, 0, 1), 0);
        if (
          this.pickLocalRay.direction.z < -0.15 &&
          this.pickLocalRay.intersectPlane(
            this.detailPickPlane,
            this.detailPickPoint,
          ) &&
          Math.abs(this.detailPickPoint.x) <= STICKER_W / 2 &&
          Math.abs(this.detailPickPoint.y) <= STICKER_H / 2
        ) {
          const sx =
            ((this.detailPickPoint.x + STICKER_W / 2) / STICKER_W) *
            STICKER_CANVAS_W;
          const sy =
            ((STICKER_H / 2 - this.detailPickPoint.y) / STICKER_H) *
            STICKER_CANVAS_H;
          this.detailStickerHoverCorner = stickerCornerAt(
            this.detailPickPoint.x,
            this.detailPickPoint.y,
          );
          return hitTestStickerFace(
            sx,
            sy,
            Boolean(resolveRecordPrompt(records[this.selectedIndex])),
          );
        }
      }
    }

    this.model.updateMatrixWorld(true);
    if (Math.abs(this.model.matrixWorld.determinant()) < 1e-12) return null;
    this.pickInvMatrix.copy(this.model.matrixWorld).invert();
    this.pickLocalRay.copy(this.raycaster.ray).applyMatrix4(this.pickInvMatrix);
    this.detailPickPlane.set(new THREE.Vector3(0, 0, 1), -this.glassFrontZ);
    if (
      this.pickLocalRay.direction.z >= -0.15 ||
      !this.pickLocalRay.intersectPlane(
        this.detailPickPlane,
        this.detailPickPoint,
      )
    ) {
      return null;
    }
    const localX = this.detailPickPoint.x;
    const localY = this.detailPickPoint.y;
    if (localX < -2.362 || localX > 2.362 || localY < 0.139 || localY > 3.565) {
      return null;
    }
    const px = ((localX + 2.362) / 4.724) * OVERVIEW_BADGE_WIDTH;
    const py = ((3.565 - localY) / 3.426) * OVERVIEW_BADGE_HEIGHT;
    const hit = hitTestDetailFace(px, py, this.lastShowcaseStatRects);
    if (
      hit === "toggle-detail" &&
      !(
        this.targetDetail > 0 &&
        (this.detailToggleMode === "visible" ||
          (this.detailToggleMode === "reveal" &&
            this.detailToggleVisibility > 0.35))
      )
    ) {
      return null;
    }
    return hit;
  }
  private captureFixedDetailCameraEntry() {
    this.camera.updateMatrixWorld(true);
    const offset = this.camera.position.clone().sub(this.cameraAim);
    const distance = Math.max(5.1, offset.length());
    const dir = offset.clone().divideScalar(distance);
    const elevation = Math.asin(THREE.MathUtils.clamp(dir.y, -0.999, 0.999));
    const azimuth = Math.atan2(-dir.x, dir.z);
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        this.camera.position,
        this.cameraAim,
        new THREE.Vector3(0, 1, 0),
      ),
    );
    const baseRight = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuat);
    const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.camera.quaternion,
    );
    const roll = Math.atan2(-cameraUp.dot(baseRight), cameraUp.dot(baseUp));
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.fixedDetailCameraPose = {
      aim: this.cameraAim.clone(),
      azimuth,
      elevation,
      distance,
      roll,
      fov: this.camera.fov,
      projectionScaleX:
        this.camera.projectionMatrix.elements[0] /
        (1 / (this.camera.aspect * tanHalfFov)),
      projectionScaleY:
        this.camera.projectionMatrix.elements[5] / (1 / tanHalfFov),
      focusDepth: this.lastRenderedFocusDepth ?? distance,
    };
    this.fixedDetailTargetPose = undefined;
    this.fixedDetailCameraBasis = undefined;
  }

  /** Blend along a monotonic spherical arc from overview to detail framing. */
  private applyFixedDetailCameraMove(orbitAmount: number, aimAmount: number) {
    const entry = this.fixedDetailCameraPose;
    if (!entry) return;
    const target = this.fixedDetailTargetPose ?? entry;
    const azimuth = THREE.MathUtils.lerp(
      entry.azimuth,
      target.azimuth,
      orbitAmount,
    );
    const elevation = THREE.MathUtils.lerp(
      entry.elevation,
      target.elevation,
      aimAmount,
    );
    const distance = THREE.MathUtils.lerp(
      entry.distance,
      target.distance,
      orbitAmount,
    );
    const roll = THREE.MathUtils.lerp(entry.roll, target.roll, orbitAmount);
    this.cameraAim.set(
      THREE.MathUtils.lerp(entry.aim.x, target.aim.x, orbitAmount),
      THREE.MathUtils.lerp(entry.aim.y, target.aim.y, aimAmount),
      THREE.MathUtils.lerp(entry.aim.z, target.aim.z, orbitAmount),
    );
    this.camera.position.set(
      this.cameraAim.x - Math.sin(azimuth) * Math.cos(elevation) * distance,
      this.cameraAim.y + Math.sin(elevation) * distance,
      this.cameraAim.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    this.camera.lookAt(this.cameraAim);
    if (Math.abs(roll) > 1e-6) this.camera.rotateZ(roll);
    this.camera.fov = THREE.MathUtils.lerp(entry.fov, target.fov, orbitAmount);
    this.camera.aspect =
      this.container.clientWidth / this.container.clientHeight;
  }

  private applyFixedDetailProjection(amount: number) {
    const entry = this.fixedDetailCameraPose;
    this.camera.updateProjectionMatrix();
    if (entry) {
      const target = this.fixedDetailTargetPose ?? entry;
      this.camera.projectionMatrix.elements[0] *= THREE.MathUtils.lerp(
        entry.projectionScaleX,
        target.projectionScaleX,
        amount,
      );
      this.camera.projectionMatrix.elements[5] *= THREE.MathUtils.lerp(
        entry.projectionScaleY,
        target.projectionScaleY,
        amount,
      );
    }
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();
    this.camera.updateMatrixWorld(true);
  }

  private overviewVisualLift() {
    const overviewLift = THREE.MathUtils.smoothstep(
      this.lift.value,
      0,
      OVERVIEW_LIFT,
    );
    return OVERVIEW_VISUAL_LIFT * overviewLift;
  }

  /** Solve a 3/4-front hero close-up pose at constant telephoto FOV. */
  private solveFixedDetailCameraPose(
    basis: FixedDetailCameraBasis,
  ): FixedDetailCameraPose | undefined {
    const entry = this.fixedDetailCameraPose;
    if (this.modelBounds.isEmpty() || !entry) return undefined;

    const terminalMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(
        basis.x,
        basis.y + INSPECTION_LIFT + OVERVIEW_VISUAL_LIFT,
        basis.z,
      ),
      new THREE.Quaternion(),
      this.model.scale,
    );
    const { min, max } = this.modelBounds;
    const effectiveMaxX = max.x + 4.35 * basis.drawer;
    const corners = [
      [min.x, min.y, min.z],
      [min.x, min.y, max.z],
      [min.x, max.y, min.z],
      [min.x, max.y, max.z],
      [effectiveMaxX, min.y, min.z],
      [effectiveMaxX, min.y, max.z],
      [effectiveMaxX, max.y, min.z],
      [effectiveMaxX, max.y, max.z],
    ] as const;
    const terminalPoints = corners.map(([x, y, z]) =>
      new THREE.Vector3(x, y, z).applyMatrix4(terminalMatrix),
    );
    const anchor = new THREE.Box3()
      .setFromPoints(terminalPoints)
      .getCenter(new THREE.Vector3());
    const targetCameraOffset = new THREE.Vector3(
      -Math.sin(DETAIL_TARGET_AZIMUTH) * Math.cos(DETAIL_TARGET_ELEVATION),
      Math.sin(DETAIL_TARGET_ELEVATION),
      Math.cos(DETAIL_TARGET_AZIMUTH) * Math.cos(DETAIL_TARGET_ELEVATION),
    ).normalize();
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        anchor.clone().addScaledVector(targetCameraOffset, 10),
        anchor,
        new THREE.Vector3(0, 1, 0),
      ),
    );
    const inverseTargetRotation = targetQuaternion.clone().invert();
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(targetQuaternion)
      .normalize();
    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(targetQuaternion)
      .normalize();
    const aspect = Math.max(0.01, basis.aspect);
    const portraitBlend = THREE.MathUtils.smoothstep(aspect, 0.9, 1.45);
    const expandedCenterX = THREE.MathUtils.lerp(
      DETAIL_FRAME_CENTER_X,
      0.5,
      basis.drawer,
    );
    const frameCenterX = THREE.MathUtils.lerp(
      0.5,
      expandedCenterX,
      portraitBlend,
    );
    const targetX = frameCenterX * 2 - 1;
    const targetY = 1 - DETAIL_FRAME_CENTER_Y * 2;
    const targetHeight = DETAIL_FRAME_HEIGHT * 2;
    const edgeSafeFrameWidth =
      Math.min(frameCenterX, 1 - frameCenterX) * 2 - DETAIL_FRAME_EDGE_SAFE * 2;
    const targetWidth =
      Math.min(DETAIL_FRAME_ABSOLUTE_MAX_WIDTH, edgeSafeFrameWidth) * 2;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(entry.fov) / 2);
    const relative = new THREE.Vector3();

    const frameAtDistance = (dist: number) => {
      const aim = anchor.clone();
      const position = aim.clone().addScaledVector(targetCameraOffset, dist);
      const project = () => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const point of terminalPoints) {
          relative
            .copy(point)
            .sub(position)
            .applyQuaternion(inverseTargetRotation);
          const depth = Math.max(this.camera.near, -relative.z);
          const x = relative.x / (depth * aspect * tanHalfFov);
          const y = relative.y / (depth * tanHalfFov);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        return {
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          width: maxX - minX,
          height: maxY - minY,
        };
      };
      let metrics = project();
      for (let pass = 0; pass < 2; pass++) {
        const shiftRight =
          (metrics.centerX - targetX) * dist * tanHalfFov * aspect;
        const shiftUp = (metrics.centerY - targetY) * dist * tanHalfFov;
        aim.addScaledVector(right, shiftRight);
        aim.addScaledVector(up, shiftUp);
        position.addScaledVector(right, shiftRight);
        position.addScaledVector(up, shiftUp);
        metrics = project();
      }
      return { aim, metrics };
    };

    const fits = (metrics: { width: number; height: number }) =>
      metrics.height <= targetHeight && metrics.width <= targetWidth;
    let low = 18;
    let high = 120;
    let highFrame = frameAtDistance(high);
    for (let pass = 0; pass < 6 && !fits(highFrame.metrics); pass++) {
      high = Math.min(high + 25, 260);
      highFrame = frameAtDistance(high);
    }
    if (!fits(highFrame.metrics)) return undefined;
    if (fits(frameAtDistance(low).metrics)) high = low;
    for (let pass = 0; pass < 24; pass++) {
      const middle = (low + high) / 2;
      if (fits(frameAtDistance(middle).metrics)) {
        high = middle;
      } else {
        low = middle;
      }
    }
    const framed = frameAtDistance(high);
    return {
      aim: framed.aim,
      azimuth: DETAIL_TARGET_AZIMUTH,
      elevation: DETAIL_TARGET_ELEVATION,
      distance: high,
      roll: 0,
      fov: entry.fov,
      projectionScaleX: 1,
      projectionScaleY: 1,
      focusDepth: high,
    };
  }

  private fixedDetailCameraBasisChanged(next: FixedDetailCameraBasis) {
    const previous = this.fixedDetailCameraBasis;
    return (
      !previous ||
      previous.index !== next.index ||
      Math.abs(previous.x - next.x) > 0.015 ||
      Math.abs(previous.y - next.y) > 0.04 ||
      Math.abs(previous.z - next.z) > 0.015 ||
      Math.abs(previous.aspect - next.aspect) > 0.0001 ||
      Math.abs(previous.drawer - next.drawer) > 0.001
    );
  }

  setMode(mode: "archive" | "detail") {
    this.cancelPointer();
    this.setHover(null);
    if (mode === "detail") {
      if (!this.fixedDetailCameraHeld) {
        this.detailCameraMove = { value: 0, velocity: 0 };
        this.detailCameraAimMove = { value: 0, velocity: 0 };
        if (this.overviewCameraReady) {
          this.captureFixedDetailCameraEntry();
        }
      }
      this.fixedDetailLiftTarget = INSPECTION_LIFT;
      this.fixedDetailTargetPose = undefined;
      this.fixedDetailCameraBasis = undefined;
      this.fixedDetailCameraHeld = true;
    } else if (!this.fixedDetailCameraPose) {
      this.fixedDetailCameraHeld = false;
    }
    if (mode === "detail") {
      this.finishIntro(true);
      this.ensureFullOverviewBadge(this.selectedIndex);
      this.overviewBadgeDirty = false;
    }
    if (mode !== "archive") this.pendingPulse = null;
    this.lastInteraction = this.clock;
    this.targetReveal = 1;
    this.targetDetail = mode === "detail" ? 1 : 0;
    this.redrawDetailSticker();
    this.dragging = false;
    if (mode !== "detail") {
      this.setDetailCardOpen(false);
      this.detailCardScrollY = 0;
      this.setDetailHover(null);
      this.detailToggleSwitchActive = false;
      if (this.detailToggleOutMesh) this.detailToggleOutMesh.visible = false;
      if (
        this.detailToggleMode === "visible" ||
        this.detailToggleMode === "reveal"
      ) {
        if (!this.motion.surfaceTransitions) {
          this.detailToggleMode = "hidden";
          this.detailToggleVisibility = 0;
          this.detailToggleLabelOpen = false;
          if (this.detailToggleGroup) this.detailToggleGroup.visible = false;
        } else {
          this.detailToggleMode = "hide";
          this.detailToggleDuration = MIST_HIDE_DURATION_MS / 1000;
          this.detailToggleElapsed =
            (1 - this.detailToggleVisibility) * this.detailToggleDuration;
        }
      }
      this.targetRotation = 0;
      if (this.rotation !== 0) this.returnY = this.model.position.y;
    } else this.returnY = null;
  }
  // Legacy review pages use the old whole-scene toggle.
  setReduced(value: boolean) {
    this.setMotion(value ? reducedMotion() : fullMotion());
  }
  setMotion(value: MotionPreferences) {
    if (
      (!value.pointerParallax || !value.dragMomentum) &&
      (this.motion.pointerParallax || this.motion.dragMomentum)
    )
      this.cancelPointer();
    if (!value.dragMomentum) {
      this.archiveMomentum = null;
      this.columnCamera.velocity = 0;
      this.rail.velocity = 0;
    }
    if (!value.pointerParallax) this.pointer.set(0, 0);
    if (!value.selectionWave) {
      this.pulses = [];
      this.frozenPulses = [];
    }
    if (!value.selectionTransition || !value.selectionWave) {
      this.finishIntro(true);
      this.introRelease = null;
    }
    if (!value.idleWave) this.idleGain = 0;
    if (!value.surfaceTransitions) {
      if (this.detailToggleMode === "reveal") {
        this.detailToggleMode = "visible";
        this.detailToggleVisibility = 1;
      } else if (this.detailToggleMode === "hide") {
        this.detailToggleMode = "hidden";
        this.detailToggleVisibility = 0;
        this.detailToggleLabelOpen = false;
        if (this.detailToggleGroup) this.detailToggleGroup.visible = false;
      }
      if (this.detailToggleSwitchActive) {
        this.detailToggleSwitchActive = false;
        if (this.detailToggleOutMesh) this.detailToggleOutMesh.visible = false;
        this.redrawDetailToggleCanvas(
          this.detailToggleInCanvas,
          this.detailToggleInTexture,
          this.detailToggleLabelOpen,
          this.detailHoveredHotspot === "toggle-detail",
        );
      }
    }
    this.motion = { ...value };
  }
  setQuality(value: RenderQuality | boolean) {
    const quality =
      typeof value === "boolean"
        ? normalizeQuality(undefined, value)
        : normalizeQuality(value);
    const key = JSON.stringify(quality);
    if (this.appliedQuality === key) return;
    this.appliedQuality = key;
    this.quality = quality;
    this.bokeh.enabled = this.shouldEnableBokeh();
    this.smaa.enabled = quality.antialias === "smaa";
    this.renderer.shadowMap.enabled = quality.shadows > 0;
    const effectiveShadows = this.useCleanEcoBudget ? 1024 : quality.shadows;
    const size = Math.min(
      effectiveShadows || 1024,
      this.renderer.capabilities.maxTextureSize,
    );
    if (this.light.shadow.mapSize.x !== size) {
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
      this.light.shadow.mapSize.set(size, size);
    }
    this.light.shadow.needsUpdate = true;
    applyTextureQuality(this.scene, this.renderer, quality);
    const badgeAnisotropy = Math.min(
      quality.anisotropy,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    for (const tex of [
      this.overviewBadgeTexture,
      this.labelTexture,
      this.hoverBadgeFallback,
      this.detailPulloutTexture,
      this.detailStickerTexture,
      this.detailStickerBackTexture,
      this.detailStickerShadowTexture,
      this.detailToggleInTexture,
      this.detailToggleOutTexture,
    ]) {
      if (tex && tex.anisotropy !== badgeAnisotropy) {
        tex.anisotropy = badgeAnisotropy;
        tex.needsUpdate = true;
      }
    }
    for (const cache of [
      this.overviewHeaderCache,
      this.overviewFullCache,
      this.hoverBadgeCache,
      this.hoverStickerCache,
    ]) {
      for (const entry of cache.values()) {
        if (entry.texture.anisotropy !== badgeAnisotropy) {
          entry.texture.anisotropy = badgeAnisotropy;
          entry.texture.needsUpdate = true;
        }
      }
    }
    this.resize();
  }
  private cellPosition(cell: ArchiveCell) {
    return new THREE.Vector3(
      (cell.lane - 2) * COLUMN_SPACING,
      -4.6,
      (cell.row - 15.5) * ROW_SPACING,
    );
  }
  private rebaseCoordinates() {
    // Periodically reduce the logical coordinates while preserving every
    // relative position, spring velocity, ripple and idle phase.
    const lanePeriod = Math.max(1, archiveColumns.length);
    const shift = {
      lane:
        Math.abs(this.selectedCell.lane) > 2048
          ? Math.round((this.selectedCell.lane - 2) / lanePeriod) * lanePeriod
          : 0,
      // Lookups retain the row origin modulo each column's own period.
      row:
        Math.abs(this.selectedCell.row) > 2048 ? this.selectedCell.row - 12 : 0,
    };
    if (!shift.lane && !shift.row) return;
    this.setHover(null);
    this.hoverLifts.clear();
    this.selectedCell.lane -= shift.lane;
    this.selectedCell.row -= shift.row;
    if (this.introRelease) {
      this.introRelease.cell.lane -= shift.lane;
      this.introRelease.cell.row -= shift.row;
    }
    this.slotUnderlights.rebase(shift.lane, shift.row);
    this.coordinateOrigin.lane += shift.lane;
    this.coordinateOrigin.row += shift.row;
    if (this.hoverStickerCell) {
      this.hoverStickerCell.lane -= shift.lane;
      this.hoverStickerCell.row -= shift.row;
    }
    this.laneFocus.value -= shift.lane;
    this.shoulder.value -= shift.row;
    this.columnCamera.value -= shift.lane * COLUMN_SPACING;
    this.rail.value += shift.row * ROW_SPACING;
    for (const old of this.outgoing) {
      old.cell.lane -= shift.lane;
      old.cell.row -= shift.row;
    }
    for (const pulse of this.pulses) {
      pulse.lane -= shift.lane;
      pulse.row -= shift.row;
    }
    for (const pulse of this.frozenPulses) {
      pulse.lane -= shift.lane;
      pulse.row -= shift.row;
    }
    if (this.pendingPulse) {
      this.pendingPulse.lane -= shift.lane;
      this.pendingPulse.row -= shift.row;
    }
  }
  private isDetailBadgeActive() {
    return (
      !this.holdingArchive &&
      !this.archiveMomentum &&
      (this.targetDetail > 0 || this.detail > 0.05)
    );
  }
  private badgeAnisotropy() {
    return Math.min(
      this.quality.anisotropy,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
  }
  select(index: number, navigation?: ArchiveNavigation) {
    if (!this.navigatingDrag) this.cancelPointer();
    this.setHover(null);
    this.lastInteraction = this.clock;
    const indexChanged = index !== this.selectedIndex;
    this.selectedIndex = index;
    const next = fileLocation(index).slot;
    const previousCell = this.selectedCell;
    const cell = selectionCell(
      index,
      previousCell,
      navigation,
      this.coordinateOrigin.row,
    );
    const changed = !sameCell(cell, previousCell);
    if (changed && this.intro) this.finishIntro(false, true);
    const sameColumnRowSwitch = changed && cell.lane === previousCell.lane;
    if (
      changed &&
      this.loaded &&
      (Math.abs(this.lift.value) >= MIN_OUTGOING_SPAWN_LIFT ||
        this.rotation !== 0)
    ) {
      while (this.outgoing.length >= MAX_OUTGOING_POOL) {
        let evictIndex = -1;
        let lowestScore = Infinity;
        for (let i = 0; i < this.outgoing.length; i++) {
          const item = this.outgoing[i];
          const score =
            (item.returnY !== null ? 1000 : 0) + Math.abs(item.lift.value);
          if (score < lowestScore) {
            lowestScore = score;
            evictIndex = i;
          }
        }
        if (evictIndex < 0) break;
        const [evicted] = this.outgoing.splice(evictIndex, 1);
        this.releaseOutgoingGroup(evicted.group);
      }
      const group = this.acquireOutgoingGroup();
      this.appearance.apply(
        group,
        this.appearanceInSlot(
          this.lift.value,
          this.slotUnderlights.directFor(previousCell),
        ),
      );
      this.appearance.setClarity(group, 0);
      this.scene.add(group);
      this.outgoing.push({
        group,
        slot: this.selectedSlot,
        cell: { ...this.selectedCell },
        lift: { ...this.lift },
        returnY: group.rotation.y !== 0 ? group.position.y : null,
      });
    }
    this.selectedSlot = next;
    this.selectedCell = cell;
    this.slotUnderlights.select(cell, !this.motion.selectionTransition);
    if (changed) {
      this.lift = { value: 0, velocity: 0 };
      this.rotation = 0;
      this.returnY = null;
      if (this.fixedDetailCameraHeld) {
        this.fixedDetailLiftTarget = INSPECTION_LIFT;
        this.fixedDetailTargetPose = undefined;
        this.fixedDetailCameraBasis = undefined;
      }
    }
    const returning = this.outgoing.findIndex((o) => sameCell(o.cell, cell));
    if (returning >= 0) {
      const o = this.outgoing[returning];
      this.lift = { ...o.lift };
      this.rotation = o.group.rotation.y;
      this.returnY = o.returnY;
      this.outgoing.splice(returning, 1);
      this.releaseOutgoingGroup(o.group);
    }
    if (sameColumnRowSwitch) {
      this.pendingPulse = null;
      this.freezePulses();
    } else if (this.deferSelectionPulse) {
      this.pendingPulse = { ...cell };
    } else this.emitPulse(cell);
    this.targetRotation = 0;
    // The overview keeps the shared baked print. The 2K record print is
    // generated only once the details are opened.
    if (!this.bakedCardTexture) this.drawLabel(index);
    if (index !== this.overviewBadgeFullIndex) {
      this.overviewBadgeFullDirty = true;
    }
    if (indexChanged) {
      this.setDetailCardOpen(false);
      this.detailCardScrollY = 0;
      this.detailHoveredHotspot = null;
      this.overviewBadgeFullAfter = this.clock + OVERVIEW_BADGE_SETTLE_SECONDS;
    }
    if (this.isDetailBadgeActive()) {
      this.ensureFullOverviewBadge(index);
      this.overviewBadgeDirty = false;
    } else {
      this.overviewBadgeDirty = true;
    }
    if (indexChanged && this.loaded) {
      this.redrawDetailSticker();
    }
  }
  public reloadData(nextIndex = 0, options: { animate?: boolean } = {}) {
    if (!records.length) return;
    const target = Math.max(
      0,
      Math.min(records.length - 1, Math.trunc(nextIndex)),
    );
    if (!this.navigatingDrag) this.cancelPointer();
    this.setHover(null);
    this.hoverLifts.clear();
    this.finishIntro(true, true);
    this.introRelease = null;
    this.archiveMomentum = null;
    for (const { group } of this.outgoing) {
      this.releaseOutgoingGroup(group);
    }
    this.outgoing.length = 0;
    this.pulses = [];
    this.frozenPulses = [];
    this.pendingPulse = null;
    this.cardPhotos.clear();
    this.cardPhotoSrc.clear();
    this.cardPhotoTokens.clear();
    this.cardStatsOverrides.clear();
    this.setDetailCardOpen(false);
    this.detailDrawer = { value: 0, velocity: 0 };
    this.detailCardScrollY = 0;
    this.detailHoveredHotspot = null;
    this.detailPulloutLayout = null;
    for (let corner = 0; corner < this.detailStickerCornerPeel.length; corner++) {
      const spring = this.detailStickerCornerPeel[corner];
      spring.value = corner === STICKER_REST_CORNER ? 0.24 : 0;
      spring.velocity = 0;
    }
    this.detailStickerHoverCorner = -1;
    if (this.detailPulloutGroup) this.detailPulloutGroup.visible = false;
    if (this.detailStickerGroup) this.detailStickerGroup.visible = false;
    this.overviewBadgeUniform.value = this.overviewBadgeTexture;
    this.overviewBadgeHeightFraction.value = 1;
    for (const entry of this.overviewHeaderCache.values()) {
      entry.texture.dispose();
    }
    this.overviewHeaderCache.clear();
    for (const entry of this.overviewFullCache.values()) {
      entry.texture.dispose();
    }
    this.overviewFullCache.clear();
    this.overviewBadgeFullIndex = -1;
    this.overviewBadgeFullDirty = true;
    this.overviewBadgeFullAfter = 0;
    this.overviewBadgeDirty = false;
    this.pendingOverviewBadgeRefresh = false;
    this.hoverBadgeUniform.value = this.hoverBadgeFallback;
    this.hoverBadgeInstance.value = -1;
    this.hoverBadgeIndex = -1;
    for (const entry of this.hoverBadgeCache.values()) {
      entry.texture.dispose();
    }
    this.hoverBadgeCache.clear();
    this.hoverStickerCell = null;
    this.hoverStickerIndex = -1;
    if (this.hoverStickerGroup) this.hoverStickerGroup.visible = false;
    if (this.hoverStickerFrontMat) {
      this.hoverStickerFrontMat.map = null;
      this.hoverStickerFrontMat.emissiveMap = null;
    }
    for (const entry of this.hoverStickerCache.values()) {
      entry.texture.dispose();
    }
    this.hoverStickerCache.clear();

    const loc = fileLocation(target);
    this.selectedIndex = target;
    this.selectedSlot = loc.slot;
    this.selectedCell = { lane: loc.lane, row: loc.row };
    this.coordinateOrigin = { lane: 0, row: 0 };
    this.rotation = 0;
    this.targetRotation = 0;
    this.returnY = null;

    if (this.loaded) {
      const chosen = this.cellPosition(this.selectedCell);
      this.columnCamera = { value: chosen.x, velocity: 0 };
      this.rail = { value: SELECTED_ROW_ANCHOR_Z - chosen.z, velocity: 0 };
      this.shoulder = { value: this.selectedCell.row, velocity: 0 };
      this.laneFocus = { value: this.selectedCell.lane, velocity: 0 };
      this.slotUnderlights.select(this.selectedCell, !options.animate);
      if (options.animate) {
        this.lift = { value: 0, velocity: 0 };
        this.emitPulse(this.selectedCell);
      }
      if (this.fixedDetailCameraHeld) {
        this.fixedDetailLiftTarget = INSPECTION_LIFT;
        this.fixedDetailTargetPose = undefined;
        this.fixedDetailCameraBasis = undefined;
      }
      if (this.isDetailBadgeActive()) this.ensureFullOverviewBadge(target);
      else this.bindOverviewFullBadge(target);
      this.redrawDetailSticker();
    }
    this.renderState.invalidate();
  }
  private invalidateOverviewFullCache(index: number) {
    const cachedFull = this.overviewFullCache.get(index);
    if (!cachedFull) return;
    if (this.overviewBadgeUniform.value === cachedFull.texture) {
      this.overviewBadgeUniform.value = this.overviewBadgeTexture;
      this.overviewBadgeHeightFraction.value = 1;
    }
    cachedFull.texture.dispose();
    this.overviewFullCache.delete(index);
  }
  public refreshRecord(
    index: number,
    options: { coverChanged?: boolean; statsChanged?: boolean } = {},
  ) {
    if (index < 0 || index >= records.length) return;
    const cachedHeader = this.overviewHeaderCache.get(index);
    if (cachedHeader) {
      if (this.overviewBadgeUniform.value === cachedHeader.texture) {
        this.overviewBadgeUniform.value = this.overviewBadgeTexture;
        this.overviewBadgeHeightFraction.value = 1;
      }
      cachedHeader.texture.dispose();
      this.overviewHeaderCache.delete(index);
    }
    this.invalidateOverviewFullCache(index);
    if (options.coverChanged) {
      this.cardPhotoTokens.set(index, ++this.cardPhotoSeq);
      this.cardPhotoSrc.delete(index);
      this.cardPhotos.delete(index);
    }
    if (options.statsChanged) {
      this.cardStatsOverrides.delete(index);
    }
    const cachedHover = this.hoverBadgeCache.get(index);
    if (cachedHover) {
      if (this.hoverBadgeUniform.value === cachedHover.texture) {
        this.hoverBadgeUniform.value = this.hoverBadgeFallback;
        this.hoverBadgeInstance.value = -1;
      }
      cachedHover.texture.dispose();
      this.hoverBadgeCache.delete(index);
    }
    if (this.hoverBadgeIndex === index) {
      this.hoverBadgeIndex = -1;
    }
    const cachedSticker = this.hoverStickerCache.get(index);
    if (cachedSticker) {
      cachedSticker.texture.dispose();
      this.hoverStickerCache.delete(index);
    }
    if (this.hoverStickerIndex === index) {
      this.hoverStickerIndex = -1;
    }
    if (index === this.overviewBadgeFullIndex) {
      this.overviewBadgeFullDirty = true;
    }
    if (index === this.selectedIndex && this.loaded) {
      this.overviewBadgeDirty = true;
      if (this.intro) this.pendingOverviewBadgeRefresh = true;
      else this.flushOverviewBadge();
      this.redrawDetailSticker();
      if (
        this.isDetailBadgeActive() &&
        (this.detailDrawerOpen || this.detailDrawer.value > 0.01)
      ) {
        this.redrawPulloutCard();
      }
    }
    this.renderState.invalidate();
  }
  private emitPulse(cell: ArchiveCell) {
    this.pulses.push({ ...cell, time: this.pulseClock });
    this.pulses = this.pulses.slice(-6);
  }
  private freezePulses() {
    if (!this.pulses.length) return;
    const stoppedAt = this.pulseClock;
    this.frozenPulses.push(
      ...this.pulses.map((pulse) => ({ ...pulse, stoppedAt })),
    );
    this.frozenPulses = this.frozenPulses.slice(-MAX_FROZEN_SELECTION_PULSES);
    this.pulses = [];
  }
  private createOutgoingGroup() {
    const group = this.model.clone(true);
    if (!this.bakedCardTexture) {
      const label = group.children[group.children.length - 1] as THREE.Mesh;
      const canvas = document.createElement("canvas");
      canvas.width = this.labelCanvas.width;
      canvas.height = this.labelCanvas.height;
      canvas.getContext("2d")?.drawImage(this.labelCanvas, 0, 0);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      label.material = new THREE.MeshBasicMaterial({
        map,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      });
    }
    // Clone carries the selected material by reference. Replace it before
    // installing appearance shaders, so they are not appended to the
    // original material again on every selection.
    this.appearance.prepare(group);
    this.applyOverviewUnderlight(group, "neighbor");
    return group;
  }
  private acquireOutgoingGroup() {
    const pooled = this.bakedCardTexture ? this.outgoingPool.pop() : undefined;
    if (pooled) {
      pooled.visible = true;
      pooled.position.copy(this.model.position);
      pooled.rotation.copy(this.model.rotation);
      pooled.scale.copy(this.model.scale);
      return pooled;
    }
    return this.createOutgoingGroup();
  }
  private releaseOutgoingGroup(group: THREE.Group) {
    this.scene.remove(group);
    if (this.bakedCardTexture && this.outgoingPool.length < MAX_OUTGOING_POOL) {
      group.visible = false;
      this.outgoingPool.push(group);
      return;
    }
    this.disposeOutgoing(group);
    group.clear();
  }
  private disposeOutgoing(group: THREE.Group) {
    this.appearance.dispose(group);
  }
  private drawLabel(index: number) {
    if (!this.labelTexture) return;
    // A record can be missing from a hand-edited content file; the label must
    // still render rather than throw on an undefined title.
    const record = records[index];
    const title = (record?.en || record?.title || "").trim();
    const fallback = String(Math.max(0, Math.floor(index)) + 1).padStart(
      3,
      "0",
    );
    const code = (record?.id || "X-" + fallback).replace(/^X-/, "").trim();
    const c = this.labelCanvas.getContext("2d");
    if (!c) return;
    c.save();
    c.setTransform(LABEL_SCALE, 0, 0, LABEL_SCALE, 0, 0);
    c.fillStyle = WARM.label;
    c.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    c.fillStyle = WARM.ink;
    c.fillRect(12, 12, 1000, 6);
    c.fillRect(12, 419, 1000, 3);
    // The English title replaces the fixed wordmark. Long titles wrap to a
    // second line rather than shrinking, so the printed size stays readable;
    // the 700 px column keeps them clear of the INFO block at x = 782.
    c.font = "bold 81px MiSans";
    let titleLines = wrapLabelText(c, title, 700);
    if (titleLines.length > 1) {
      // Re-measure at the smaller size so the wrap matches what is drawn.
      c.font = "bold 68px MiSans";
      titleLines = wrapLabelText(c, title, 700);
    }
    fillLabelLines(
      c,
      titleLines,
      22,
      titleLines.length > 1 ? 146 : 116,
      titleLines.length > 1 ? 56 : 78,
    );
    c.font = "32px MiSans";
    c.fillStyle = WARM.mutedInk;
    c.fillText(
      fitOneLine(c, record?.department || record?.category || "", 700),
      25,
      titleLines.length > 1 ? 202 : 174,
    );
    c.fillStyle = WARM.ink;
    c.font = "bold 130px MiSans";
    c.fillText(fitOneLine(c, "NO." + code, 700), 22, 360);
    c.fillRect(782, 32, 221, 39);
    c.fillStyle = WARM.label;
    c.font = "24px MiSans";
    c.fillText("R L / I S", 809, 61);
    c.fillStyle = WARM.ink;
    c.font = "bold 64px MiSans";
    c.fillText("INFO", 830, 143);
    if (this.labelMark.complete && this.labelMark.naturalWidth > 0)
      c.drawImage(this.labelMark, 790, 242, 210, 98);
    c.restore();
    this.labelTexture.needsUpdate = true;
  }
  private refreshSelectedBadge(index: number, forceFull = false) {
    if (index === this.overviewBadgeFullIndex) {
      this.overviewBadgeFullDirty = true;
    }
    if (index !== this.selectedIndex) return;
    if (this.intro) {
      this.pendingOverviewBadgeRefresh = true;
      return;
    }
    if (this.isDetailBadgeActive()) {
      this.drawFullOverviewBadge(index);
      this.overviewBadgeDirty = false;
      this.renderState.invalidate();
    } else if (forceFull || this.clock >= this.overviewBadgeFullAfter) {
      this.bindOverviewFullBadge(index);
      this.overviewBadgeDirty = false;
      this.renderState.invalidate();
    }
  }
  private loadCardPhoto(
    src: string | null,
    index = this.selectedIndex,
    refreshBadge = true,
  ) {
    const target = Math.max(0, Math.min(records.length - 1, Math.floor(index)));
    const token = ++this.cardPhotoSeq;
    this.cardPhotoTokens.set(target, token);
    if (!src) {
      // Keep an empty-string sentinel so explicit rhine.setCardPhoto(null) clearing
      // prevents render paths from immediately re-fetching record.cover.
      this.cardPhotoSrc.set(target, "");
      this.cardPhotos.delete(target);
      this.invalidateOverviewFullCache(target);
      if (refreshBadge) this.refreshSelectedBadge(target, true);
      return;
    }
    const resolved =
      /^(https?:|data:|blob:)/i.test(src) || src.startsWith("/")
        ? src
        : publicAsset(src);
    this.cardPhotoSrc.set(target, resolved);
    this.cardPhotos.set(target, null);
    const img = new Image();
    if (/^https?:/i.test(resolved)) img.crossOrigin = "anonymous";
    img.onload = () => {
      void img
        .decode()
        .catch(() => {})
        .then(() => {
          if (this.disposed || this.cardPhotoTokens.get(target) !== token) {
            return;
          }
          this.cardPhotos.set(target, img);
          this.invalidateOverviewFullCache(target);
          this.refreshSelectedBadge(target, refreshBadge);
        });
    };
    img.onerror = () => {
      if (!this.disposed && this.cardPhotoTokens.get(target) === token) {
        this.cardPhotoSrc.delete(target);
      }
    };
    img.src = resolved;
    if (refreshBadge) {
      this.invalidateOverviewFullCache(target);
      this.refreshSelectedBadge(target, true);
    }
  }
  public setCardPhoto(src: string | null, index = this.selectedIndex) {
    this.loadCardPhoto(src, index, true);
  }

  public setCardStats(
    stats: ArchiveCardStats | null,
    index = this.selectedIndex,
  ) {
    const target = Math.max(0, Math.min(records.length - 1, Math.floor(index)));
    if (!stats) {
      this.cardStatsOverrides.delete(target);
    } else {
      this.cardStatsOverrides.set(target, {
        ...this.cardStatsOverrides.get(target),
        ...stats,
      });
    }
    this.invalidateOverviewFullCache(target);
    this.refreshSelectedBadge(target, true);
  }

  private drawMetricIcon(
    c: CanvasRenderingContext2D,
    kind: "download" | "comment",
    cx: number,
    cy: number,
    size: number,
    outlined: boolean,
  ) {
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    const drawShape = () => {
      if (kind === "download") {
        const top = cy - size * 0.42;
        const arrowTip = cy + size * 0.15;
        const trayY = cy + size * 0.4;
        c.beginPath();
        c.moveTo(cx, top);
        c.lineTo(cx, arrowTip);
        c.moveTo(cx - size * 0.27, arrowTip - size * 0.25);
        c.lineTo(cx, arrowTip);
        c.lineTo(cx + size * 0.27, arrowTip - size * 0.25);
        c.moveTo(cx - size * 0.36, trayY);
        c.lineTo(cx + size * 0.36, trayY);
        c.stroke();
      } else {
        const w = size * 0.86;
        const h = size * 0.62;
        const left = cx - w / 2;
        const top = cy - size * 0.38;
        const bottom = top + h;
        c.beginPath();
        c.moveTo(left, top);
        c.lineTo(left + w, top);
        c.lineTo(left + w, bottom);
        c.lineTo(left + w * 0.35, bottom);
        c.lineTo(left + w * 0.14, bottom + size * 0.22);
        c.lineTo(left + w * 0.14, bottom);
        c.lineTo(left, bottom);
        c.closePath();
        c.stroke();
      }
    };
    if (outlined) {
      c.strokeStyle = "#302720";
      c.lineWidth = Math.max(8, size * 0.28);
      drawShape();
    }
    c.strokeStyle = c.fillStyle;
    c.lineWidth = Math.max(4.5, size * 0.14);
    drawShape();
    c.restore();
  }

  private drawShowcaseStats(
    c: CanvasRenderingContext2D,
    index: number,
    left: number,
    right: number,
    sampleY: number,
    metricsY: number,
    hasPhoto: boolean,
  ): ShowcaseStatRects {
    const stats = {
      sample: "样本不足 · n=1",
      downloads: 30,
      comments: 0,
      ...records[index]?.stats,
      ...this.cardStatsOverrides.get(index),
    };
    const iconSize = 40;
    const iconGap = 14;
    const metricGap = 36;
    const metrics = [
      ["download", stats.downloads],
      ["comment", stats.comments],
    ] as const;
    const iconWidth = iconSize + iconGap;
    const gaps = metricGap * (metrics.length - 1);
    const maxMetricText =
      ((right - left) * 0.62 - gaps) / metrics.length - iconWidth;
    const labels = metrics.map(([kind, count]) => {
      c.font = "600 46px MiSans, sans-serif";
      const text = fitOneLine(c, String(count), maxMetricText);
      return {
        kind,
        text,
        font: c.font,
        width: iconWidth + c.measureText(text).width,
      };
    });
    let x = right - gaps - labels.reduce((sum, label) => sum + label.width, 0);

    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = hasPhoto ? "#fff8ee" : WARM.ink;
    c.strokeStyle = "#302720";
    c.lineWidth = 5;
    c.lineJoin = "round";
    if (hasPhoto) {
      c.shadowColor = "rgba(23, 16, 10, 0.9)";
      c.shadowBlur = 7;
      c.shadowOffsetY = 1;
    }
    c.font = "500 44px MiSans, sans-serif";
    const sample = fitOneLine(c, stats.sample, (right - left) * 0.54);
    const sampleWidth = c.measureText(sample).width;
    if (hasPhoto) c.strokeText(sample, left, sampleY);
    c.fillText(sample, left, sampleY);
    const statRects: ShowcaseStatRects = {
      rating: { x: left, y: sampleY - 26, w: sampleWidth, h: 52 },
    };
    for (const label of labels) {
      this.drawMetricIcon(
        c,
        label.kind,
        x + iconSize / 2,
        metricsY,
        iconSize,
        hasPhoto,
      );
      c.font = label.font;
      const textX = x + iconWidth;
      if (hasPhoto) c.strokeText(label.text, textX, metricsY);
      c.fillText(label.text, textX, metricsY);
      const box: RectBox = {
        x,
        y: metricsY - 26,
        w: label.width,
        h: 52,
      };
      if (label.kind === "download") statRects.downloads = box;
      else statRects.comments = box;
      x += label.width + metricGap;
    }
    return statRects;
  }

  private getModelProviderLogo(model: string) {
    const provider = modelProvider(model);
    if (!provider) return;
    const cached = this.modelProviderImages.get(provider);
    if (cached)
      return cached.complete && cached.naturalWidth > 0 ? cached : undefined;

    const image = new Image();
    this.modelProviderImages.set(provider, image);
    image.onload = () => {
      if (this.disposed) return;
      for (const entry of this.overviewHeaderCache.entries()) {
        if (modelProvider(records[entry[0]]?.en ?? "") === provider) {
          entry[1].providerLoaded = false;
        }
      }
      for (const entry of this.overviewFullCache.entries()) {
        if (modelProvider(records[entry[0]]?.en ?? "") === provider) {
          entry[1].providerLoaded = false;
        }
      }
      if (modelProvider(records[this.selectedIndex]?.en ?? "") !== provider) {
        return;
      }
      if (this.selectedIndex === this.overviewBadgeFullIndex) {
        this.overviewBadgeFullDirty = true;
      }
      if (this.intro) {
        this.pendingOverviewBadgeRefresh = true;
      } else if (this.isDetailBadgeActive()) {
        this.drawFullOverviewBadge(this.selectedIndex);
        if (this.detailDrawerOpen || this.detailDrawer.value > 0.01) {
          this.redrawPulloutCard();
        }
        this.overviewBadgeDirty = false;
        this.renderState.invalidate();
      } else {
        this.overviewBadgeDirty = true;
        this.renderState.invalidate();
      }
    };
    image.src = publicAsset(modelProviderAssetPath(provider));
  }

  private drawOverviewHeading(
    c: CanvasRenderingContext2D,
    index: number,
    showModel: boolean,
  ) {
    const record = records[index];
    const title = record?.title?.trim() || "未命名作品";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    const textX = 139;
    const textWidth = FACE_NOTE_RECT.x - ARCHIVAL_NOTE_GAP - textX;
    const titleTop = 44;
    c.fillStyle = WARM.ink;
    c.font = "bold 92px MiSans, sans-serif";
    const fittedTitle = fitOneLine(c, title, textWidth, 58);
    const titleMetrics = c.measureText(fittedTitle);
    const titleBaseline = titleTop + titleMetrics.actualBoundingBoxAscent;
    c.fillText(fittedTitle, textX, titleBaseline);
    const titleBottom = titleBaseline + titleMetrics.actualBoundingBoxDescent;
    if (!showModel) return titleBottom;

    c.font = "500 44px MiSans, sans-serif";
    const modelName = record?.en?.trim() || "未标注模型";
    const model = fitOneLine(c, modelName, textWidth);
    const modelMetrics = c.measureText(model);
    const modelTop = titleBottom + 28;
    const modelBaseline = modelTop + modelMetrics.actualBoundingBoxAscent;
    c.fillText(model, textX, modelBaseline);
    const modelBottom = modelBaseline + modelMetrics.actualBoundingBoxDescent;

    let headingBottom = modelBottom;
    const logo = this.getModelProviderLogo(modelName);
    if (logo) {
      const logoTop = modelBottom + 24;
      const scale = Math.min(248 / logo.naturalWidth, 120 / logo.naturalHeight);
      const logoHeight = logo.naturalHeight * scale;
      c.drawImage(logo, textX, logoTop, logo.naturalWidth * scale, logoHeight);
      headingBottom = logoTop + logoHeight;
    }
    return headingBottom;
  }

  private drawHoverBadge(index: number) {
    if (index === this.hoverBadgeIndex) return;
    let entry = this.hoverBadgeCache.get(index);
    if (entry) {
      this.hoverBadgeCache.delete(index);
      this.hoverBadgeCache.set(index, entry);
      this.hoverBadgeUniform.value = entry.texture;
      this.hoverBadgeIndex = index;
      return;
    }
    if (this.hoverBadgeCache.size >= MAX_HOVER_BADGE_CACHE) {
      const oldestKey = this.hoverBadgeCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.hoverBadgeCache.get(oldestKey);
        this.hoverBadgeCache.delete(oldestKey);
        if (oldest) entry = oldest;
      }
    }
    if (!entry) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(OVERVIEW_BADGE_WIDTH * HOVER_BADGE_SCALE);
      canvas.height = Math.round(HOVER_BADGE_HEIGHT * HOVER_BADGE_SCALE);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.badgeAnisotropy();
      entry = { canvas, texture };
    }
    const c = entry.canvas.getContext("2d", { willReadFrequently: true });
    if (!c) {
      if (this.hoverBadgeUniform.value === entry.texture) {
        this.hoverBadgeUniform.value = this.hoverBadgeFallback;
        this.hoverBadgeInstance.value = -1;
      }
      entry.texture.dispose();
      return;
    }
    c.save();
    c.setTransform(HOVER_BADGE_SCALE, 0, 0, HOVER_BADGE_SCALE, 0, 0);
    c.clearRect(0, 0, OVERVIEW_BADGE_WIDTH, HOVER_BADGE_HEIGHT);
    this.drawOverviewHeading(c, index, false);
    c.restore();
    entry.texture.needsUpdate = true;
    this.hoverBadgeCache.set(index, entry);
    this.hoverBadgeUniform.value = entry.texture;
    this.hoverBadgeIndex = index;
  }

  private bindOverviewHeaderBadge(index: number) {
    if (!this.overviewBadgeTexture) return;
    const record = records[index];
    const cover = resolveRecordCover(record, index);
    if (cover && !this.cardPhotoSrc.has(index)) {
      this.loadCardPhoto(cover, index, false);
    }
    const provider = modelProvider(record?.en ?? "");
    const providerReady =
      !provider || Boolean(this.getModelProviderLogo(record?.en ?? ""));
    let entry = this.overviewHeaderCache.get(index);
    if (entry && (!provider || entry.providerLoaded || !providerReady)) {
      this.overviewHeaderCache.delete(index);
      this.overviewHeaderCache.set(index, entry);
      this.overviewBadgeUniform.value = entry.texture;
      this.overviewBadgeHeightFraction.value = OVERVIEW_HEADER_FRACTION;
      this.overviewBadgeHeadingEdge.value = entry.headingEdge;
      return;
    }
    if (!entry) {
      if (this.overviewHeaderCache.size >= MAX_OVERVIEW_HEADER_CACHE) {
        const oldestKey = this.overviewHeaderCache.keys().next().value;
        if (oldestKey !== undefined) {
          const oldest = this.overviewHeaderCache.get(oldestKey);
          this.overviewHeaderCache.delete(oldestKey);
          if (oldest) entry = oldest;
        }
      }
      if (!entry) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(OVERVIEW_BADGE_WIDTH * OVERVIEW_HEADER_SCALE);
        canvas.height = Math.round(
          OVERVIEW_HEADER_HEIGHT * OVERVIEW_HEADER_SCALE,
        );
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.badgeAnisotropy();
        entry = {
          canvas,
          texture,
          headingEdge: 1,
          providerLoaded: false,
        };
      }
    } else {
      this.overviewHeaderCache.delete(index);
    }
    const c = entry.canvas.getContext("2d", { willReadFrequently: true });
    if (!c) {
      if (this.overviewBadgeUniform.value === entry.texture) {
        this.overviewBadgeUniform.value = this.overviewBadgeTexture;
        this.overviewBadgeHeightFraction.value = 1;
      }
      entry.texture.dispose();
      return;
    }
    c.save();
    c.setTransform(OVERVIEW_HEADER_SCALE, 0, 0, OVERVIEW_HEADER_SCALE, 0, 0);
    c.clearRect(0, 0, OVERVIEW_BADGE_WIDTH, OVERVIEW_HEADER_HEIGHT);
    const headingBottom = this.drawOverviewHeading(c, index, true);
    const noteBottom = drawDetailToggleTrigger(
      c,
      this.currentDetailSurfaceState(false),
    );
    c.restore();
    const headingEdge = Math.min(
      OVERVIEW_HEADER_HEIGHT - 2,
      Math.max(headingBottom + 20, noteBottom + 16),
    );
    entry.headingEdge = 1 - headingEdge / OVERVIEW_BADGE_HEIGHT;
    entry.providerLoaded = providerReady;
    entry.texture.needsUpdate = true;
    this.overviewHeaderCache.set(index, entry);
    this.overviewBadgeUniform.value = entry.texture;
    this.overviewBadgeHeightFraction.value = OVERVIEW_HEADER_FRACTION;
    this.overviewBadgeHeadingEdge.value = entry.headingEdge;
  }

  private bindOverviewFullBadge(index: number) {
    if (!this.overviewBadgeTexture) return;
    const record = records[index];
    const cover = resolveRecordCover(record, index);
    if (cover && !this.cardPhotoSrc.has(index)) {
      this.loadCardPhoto(cover, index, false);
    }
    const provider = modelProvider(record?.en ?? "");
    const providerReady =
      !provider || Boolean(this.getModelProviderLogo(record?.en ?? ""));
    const photo = this.cardPhotos.get(index);
    const hasPhoto = Boolean(photo?.naturalWidth && photo.naturalHeight);
    let entry = this.overviewFullCache.get(index);
    if (
      entry &&
      entry.hasPhoto === hasPhoto &&
      (!provider || entry.providerLoaded || !providerReady)
    ) {
      this.overviewFullCache.delete(index);
      this.overviewFullCache.set(index, entry);
      this.overviewBadgeUniform.value = entry.texture;
      this.overviewBadgeHeightFraction.value = 1;
      this.overviewBadgeHeadingEdge.value = entry.headingEdge;
      return;
    }
    if (!entry) {
      if (this.overviewFullCache.size >= MAX_OVERVIEW_FULL_CACHE) {
        const oldestKey = this.overviewFullCache.keys().next().value;
        if (oldestKey !== undefined) {
          const oldest = this.overviewFullCache.get(oldestKey);
          this.overviewFullCache.delete(oldestKey);
          if (oldest) entry = oldest;
        }
      }
      if (!entry) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(OVERVIEW_BADGE_WIDTH * OVERVIEW_SETTLE_SCALE);
        canvas.height = Math.round(
          OVERVIEW_BADGE_HEIGHT * OVERVIEW_SETTLE_SCALE,
        );
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.badgeAnisotropy();
        entry = {
          canvas,
          texture,
          headingEdge: 1,
          providerLoaded: false,
          hasPhoto: false,
        };
      }
    } else {
      this.overviewFullCache.delete(index);
    }
    const headingEdgeNormalized = this.renderFullBadgeCanvas(
      entry.canvas,
      index,
      OVERVIEW_SETTLE_SCALE,
    );
    if (headingEdgeNormalized === null) {
      if (this.overviewBadgeUniform.value === entry.texture) {
        this.overviewBadgeUniform.value = this.overviewBadgeTexture;
        this.overviewBadgeHeightFraction.value = 1;
      }
      entry.texture.dispose();
      return;
    }
    entry.headingEdge = headingEdgeNormalized;
    entry.providerLoaded = providerReady;
    entry.hasPhoto = hasPhoto;
    entry.texture.needsUpdate = true;
    this.overviewFullCache.set(index, entry);
    this.overviewBadgeUniform.value = entry.texture;
    this.overviewBadgeHeightFraction.value = 1;
    this.overviewBadgeHeadingEdge.value = headingEdgeNormalized;
  }

  private ensureFullOverviewBadge(index: number) {
    if (
      this.overviewBadgeFullIndex === index &&
      !this.overviewBadgeFullDirty &&
      this.overviewBadgeTexture
    ) {
      this.overviewBadgeUniform.value = this.overviewBadgeTexture;
      this.overviewBadgeHeightFraction.value = 1;
      this.overviewBadgeHeadingEdge.value = this.overviewBadgeFullHeadingEdge;
      return;
    }
    this.drawFullOverviewBadge(index);
  }

  private flushOverviewBadge() {
    if (this.intro || !this.overviewBadgeTexture) return;
    if (this.isDetailBadgeActive()) {
      if (
        !this.overviewBadgeDirty &&
        !this.overviewBadgeFullDirty &&
        this.overviewBadgeFullIndex === this.selectedIndex &&
        this.overviewBadgeUniform.value === this.overviewBadgeTexture
      )
        return;
      this.overviewBadgeDirty = false;
      this.ensureFullOverviewBadge(this.selectedIndex);
      return;
    }
    // Keep the cached header during a burst/drag and bind the cached settled card once idle.
    if (
      !this.holdingArchive &&
      !this.archiveMomentum &&
      this.clock >= this.overviewBadgeFullAfter
    ) {
      const cachedFull = this.overviewFullCache.get(this.selectedIndex);
      if (
        !this.overviewBadgeDirty &&
        cachedFull &&
        this.overviewBadgeUniform.value === cachedFull.texture
      ) {
        return;
      }
      this.overviewBadgeDirty = false;
      this.bindOverviewFullBadge(this.selectedIndex);
    } else if (this.overviewBadgeDirty) {
      this.overviewBadgeDirty = false;
      this.bindOverviewHeaderBadge(this.selectedIndex);
    }
  }

  private renderFullBadgeCanvas(
    canvas: HTMLCanvasElement,
    index: number,
    scale: number,
  ): number | null {
    const record = records[index];
    const cover = resolveRecordCover(record, index);
    if (cover && !this.cardPhotoSrc.has(index)) {
      this.loadCardPhoto(cover, index, false);
    }
    const c = canvas.getContext("2d", { willReadFrequently: true });
    if (!c) return null;
    c.save();
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.clearRect(0, 0, OVERVIEW_BADGE_WIDTH, OVERVIEW_BADGE_HEIGHT);
    const headingBottom = this.drawOverviewHeading(c, index, true);
    const interactive =
      canvas === this.overviewBadgeCanvas && this.isDetailBadgeActive();
    const surfaceState = this.currentDetailSurfaceState(interactive);
    const noteBottom = drawDetailToggleTrigger(c, surfaceState);
    // 2. Middle Replaceable Showcase Photo, expanded to the card margins.
    const px = 48;
    const py = 386;
    const pw = 1952;
    const ph = 1032;
    const headingEdge = Math.min(
      py - 2,
      Math.max(headingBottom + 20, noteBottom + 16),
    );
    const headingEdgeNormalized = 1 - headingEdge / OVERVIEW_BADGE_HEIGHT;
    const photo = this.cardPhotos.get(index);
    const hasPhoto = Boolean(photo?.naturalWidth && photo.naturalHeight);
    c.save();
    c.beginPath();
    c.rect(px, py, pw, ph);
    c.clip();
    if (photo && hasPhoto) {
      const fitScale = Math.max(
        pw / photo.naturalWidth,
        ph / photo.naturalHeight,
      );
      const dw = photo.naturalWidth * fitScale;
      const dh = photo.naturalHeight * fitScale;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    } else {
      const grad = c.createLinearGradient(px, py, px, py + ph);
      grad.addColorStop(0, "#f5f1e9");
      grad.addColorStop(1, "#eae2d6");
      c.fillStyle = grad;
      c.fillRect(px, py, pw, ph);

      // Subtle architectural grid
      c.strokeStyle = "rgba(43, 40, 35, 0.055)";
      c.lineWidth = 2;
      for (let gx = px + 115; gx < px + pw; gx += 115) {
        c.beginPath();
        c.moveTo(gx, py);
        c.lineTo(gx, py + ph);
        c.stroke();
      }
      for (let gy = py + 111; gy < py + ph; gy += 111) {
        c.beginPath();
        c.moveTo(px, gy);
        c.lineTo(px + pw, gy);
        c.stroke();
      }

      // Corner viewfinder marks
      const cm = 36;
      const cl = 38;
      c.strokeStyle = "rgba(104, 92, 78, 0.45)";
      c.lineWidth = 3;
      const corners: [number, number, number, number][] = [
        [px + cm, py + cm, 1, 1],
        [px + pw - cm, py + cm, -1, 1],
        [px + cm, py + ph - cm, 1, -1],
        [px + pw - cm, py + ph - cm, -1, -1],
      ];
      for (const [cx0, cy0, sx, sy] of corners) {
        c.beginPath();
        c.moveTo(cx0, cy0 + sy * cl);
        c.lineTo(cx0, cy0);
        c.lineTo(cx0 + sx * cl, cy0);
        c.stroke();
      }

      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#7a6f62";
      c.font = "500 28px MiSans, sans-serif";
      c.fillText(
        "SHOWCASE PHOTO  ·  可替换展示照片",
        px + pw / 2,
        py + ph * 0.46,
      );
    }
    const statRects = this.drawShowcaseStats(
      c,
      index,
      px + 64,
      px + pw - 64,
      py + ph - 64,
      py + 64,
      hasPhoto,
    );
    c.restore();
    if (scale === OVERVIEW_BADGE_SCALE) {
      this.lastShowcaseStatRects = statRects;
    }
    drawFaceHoverAccents(c, surfaceState, FACE_COVER_RECT, statRects, hasPhoto);

    c.restore();
    return headingEdgeNormalized;
  }

  private drawFullOverviewBadge(index: number) {
    if (!this.overviewBadgeTexture) return;
    if (index === this.selectedIndex) this.pendingOverviewBadgeRefresh = false;
    const headingEdgeNormalized = this.renderFullBadgeCanvas(
      this.overviewBadgeCanvas,
      index,
      OVERVIEW_BADGE_SCALE,
    );
    if (headingEdgeNormalized === null) return;
    this.overviewBadgeFullHeadingEdge = headingEdgeNormalized;
    this.overviewBadgeHeadingEdge.value = headingEdgeNormalized;
    this.overviewBadgeFullIndex = index;
    this.overviewBadgeFullDirty = false;
    this.overviewBadgeUniform.value = this.overviewBadgeTexture;
    this.overviewBadgeHeightFraction.value = 1;
    this.overviewBadgeTexture.needsUpdate = true;
  }
  private ensureInstanceCapacity(required: number) {
    if (!this.instances.length || required <= this.instanceCapacity) return;
    const capacity = Math.max(required, this.instanceCapacity * 2);
    const matrix = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 16),
      16,
    ).setUsage(THREE.DynamicDrawUsage);
    matrix.array.set(this.instances[0].instanceMatrix.array);
    for (const inst of this.instances) {
      inst.dispose();
      inst.instanceMatrix = matrix;
    }
    const previousSlotLight = this.slotLightAttribute;
    this.slotLightAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    if (previousSlotLight)
      this.slotLightAttribute.array.set(previousSlotLight.array);
    const previousNeighborLight = this.neighborLightAttribute;
    this.neighborLightAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    if (previousNeighborLight)
      this.neighborLightAttribute.array.set(previousNeighborLight.array);
    const previousLateralLight = this.lateralLightAttribute;
    this.lateralLightAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    if (previousLateralLight)
      this.lateralLightAttribute.array.set(previousLateralLight.array);
    const previousTopRailLight = this.topRailLightAttribute;
    this.topRailLightAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    if (previousTopRailLight)
      this.topRailLightAttribute.array.set(previousTopRailLight.array);
    for (const inst of this.instances) {
      inst.geometry.setAttribute("archiveSlotLight", this.slotLightAttribute);
      inst.geometry.setAttribute(
        "archiveSlotReflection",
        this.neighborLightAttribute,
      );
      inst.geometry.setAttribute(
        "archiveSlotLateral",
        this.lateralLightAttribute,
      );
      inst.geometry.setAttribute(
        "archiveSlotTopRail",
        this.topRailLightAttribute,
      );
    }
    this.matrixUpdates = new InstanceUpdates(matrix);
    this.slotLightUpdates = new InstanceUpdates(this.slotLightAttribute);
    this.neighborLightUpdates = new InstanceUpdates(
      this.neighborLightAttribute,
    );
    this.lateralLightUpdates = new InstanceUpdates(this.lateralLightAttribute);
    this.topRailLightUpdates = new InstanceUpdates(this.topRailLightAttribute);
    this.instanceCapacity = capacity;
  }
  private get useCleanEcoBudget() {
    return (
      !this.superPerformance && matchingPreset(this.quality) === "original"
    );
  }
  private shouldEnableBokeh() {
    return (
      this.quality.depthOfField > 0 &&
      (this.warmingUp || this.detail > 0.01 || this.targetDetail > 0)
    );
  }
  private get transmissionScale() {
    return Math.min(this.quality.transmission, OVERVIEW_TRANSMISSION_LIMIT);
  }
  private canvasRect() {
    if (
      this.cachedCanvasRect &&
      this.cachedCanvasRect.width > 0 &&
      this.cachedCanvasRect.height > 0
    ) {
      return this.cachedCanvasRect;
    }
    this.cachedCanvasRect = this.renderer.domElement.getBoundingClientRect();
    return this.cachedCanvasRect;
  }
  resize() {
    this.cachedCanvasRect = null;
    this.renderState.invalidate();
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    const pixelBudget = this.superPerformance
      ? 921_600
      : this.useCleanEcoBudget
        ? 2_073_600
        : 8_294_400;
    resizeQuality(
      this.renderer,
      this.composer,
      this.container,
      this.quality,
      this.superPerformance,
      pixelBudget,
    );
    this.bokeh.enabled = this.shouldEnableBokeh();
    const transmission = this.transmissionScale;
    this.renderer.transmissionResolutionScale = transmission;
    this.container.dataset.renderQuality = JSON.stringify({
      ...this.readRenderMetrics(),
      transmission,
      shadows: this.renderer.shadowMap.enabled
        ? this.light.shadow.mapSize.x
        : 0,
      depthOfField: this.bokeh.enabled ? this.quality.depthOfField : 0,
    });
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.fixedDetailCameraHeld) this.overviewCameraReady = false;
    if (
      this.fixedDetailCameraHeld &&
      this.fixedDetailCameraPose &&
      this.targetDetail
    ) {
      this.fixedDetailTargetPose = undefined;
      this.fixedDetailCameraBasis = undefined;
    }
  }
  /** Previous metrics for this container; a corrupt value simply restarts them. */
  private readRenderMetrics(): Record<string, unknown> {
    const raw = this.container.dataset.renderQuality;
    if (!raw) return {};
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  private canBrowse() {
    return (
      !this.targetDetail &&
      this.detail < 0.2 &&
      this.reveal >= 0.8 &&
      this.loaded &&
      !this.container.closest("[inert]")
    );
  }
  private setHover(cell: ArchiveCell | null) {
    if (
      (!cell && !this.hoverCell) ||
      (cell && this.hoverCell && sameCell(cell, this.hoverCell))
    )
      return;
    // Hover lifts animate; keep the frame governor at full rate while the
    // pointer is moving over the array.
    this.lastInteraction = this.clock;
    this.hoverCell = cell ? { ...cell } : null;
    this.onHover?.(cell ? fileAtCell(cell, this.coordinateOrigin.row) : null);
  }
  private pickCell(x: number, y: number) {
    if (this.modelBounds.isEmpty()) return null;
    const r = this.canvasRect();
    if (r.width <= 0 || r.height <= 0) return null;
    this.cursor.set(
      ((x - r.left) / r.width) * 2 - 1,
      (-(y - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.cursor, this.camera);
    this.model.updateMatrixWorld();
    const instances = this.instances[0];
    if (instances) instances.updateMatrixWorld();

    let bestDistSq = Infinity;
    let bestCell: ArchiveCell | null = null;
    const testMatrix = (worldMatrix: THREE.Matrix4) => {
      if (Math.abs(worldMatrix.determinant()) < 1e-12) return false;
      this.pickInvMatrix.copy(worldMatrix).invert();
      this.pickLocalRay
        .copy(this.raycaster.ray)
        .applyMatrix4(this.pickInvMatrix);
      if (
        !this.pickLocalRay.intersectBox(this.modelBounds, this.pickHitPoint)
      ) {
        return false;
      }
      this.pickHitPoint.applyMatrix4(worldMatrix);
      const distSq = this.pickHitPoint.distanceToSquared(
        this.raycaster.ray.origin,
      );
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        return true;
      }
      return false;
    };

    if (instances) {
      const worldIsIdentity = instances.matrixWorld.equals(
        this.pickIdentityMatrix,
      );
      for (let i = 0; i < this.drawnCells.length; i++) {
        instances.getMatrixAt(i, this.pickInstMatrix);
        if (!worldIsIdentity) {
          this.pickInstMatrix.premultiply(instances.matrixWorld);
        }
        if (testMatrix(this.pickInstMatrix)) {
          bestCell = this.drawnCells[i];
        }
      }
    }
    if (testMatrix(this.model.matrixWorld)) {
      bestCell = this.selectedCell;
    }
    for (const o of this.outgoing) {
      o.group.updateMatrixWorld();
      if (testMatrix(o.group.matrixWorld)) {
        bestCell = o.cell;
      }
    }
    return bestCell ? { ...bestCell } : null;
  }
  private trackCoordinate(axis: DragAxis, value: number) {
    return axis === "lane"
      ? value / COLUMN_SPACING + 2
      : (-value - SELECTED_ROW_ANCHOR_Z) / ROW_SPACING + 15.5;
  }
  private dragProjection(): DragProjection {
    this.model.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const center = this.model.localToWorld(new THREE.Vector3(0, 1.85, 0));
    const rect = this.canvasRect();
    const project = (motion: THREE.Vector3) => {
      const from = center
        .clone()
        .addScaledVector(motion, -0.5)
        .project(this.camera);
      const to = center
        .clone()
        .addScaledVector(motion, 0.5)
        .project(this.camera);
      return {
        x: ((to.x - from.x) * rect.width) / 2,
        y: (-(to.y - from.y) * rect.height) / 2,
      };
    };
    // Positive navigation moves the array along -X for columns and -Z for rows.
    return {
      lane: project(new THREE.Vector3(-COLUMN_SPACING, 0, 0)),
      row: project(new THREE.Vector3(0, 0, -ROW_SPACING)),
    };
  }
  private trackPosition(axis: DragAxis, coordinate: number) {
    return axis === "lane"
      ? (coordinate - 2) * COLUMN_SPACING
      : SELECTED_ROW_ANCHOR_Z - (coordinate - 15.5) * ROW_SPACING;
  }
  private navigatePlane(coordinate: DragPosition) {
    const goal = {
      lane: Math.round(coordinate.lane),
      row: Math.round(coordinate.row),
    };
    if (sameCell(goal, this.selectedCell)) return;
    const from = { ...this.selectedCell };
    const steps = Math.min(
      64,
      Math.max(Math.abs(goal.lane - from.lane), Math.abs(goal.row - from.row)),
    );
    this.navigatingDrag = true;
    try {
      // Select physical cells along the travelled segment in one update per cell.
      // Column memory is updated by onSelect, but never pulls a held plane away.
      for (let i = 1; i <= steps; i++) {
        const cell = {
          lane: Math.round(from.lane + ((goal.lane - from.lane) * i) / steps),
          row: Math.round(from.row + ((goal.row - from.row) * i) / steps),
        };
        if (!sameCell(cell, this.selectedCell))
          this.onSelect?.(fileAtCell(cell, this.coordinateOrigin.row), cell);
      }
    } finally {
      this.navigatingDrag = false;
    }
  }
  private stopMomentum() {
    if (this.archiveMomentum) {
      this.columnCamera.velocity = 0;
      this.rail.velocity = 0;
    }
    this.archiveMomentum = null;
  }
  private bindPointer() {
    const canvas = this.renderer.domElement;
    let activePointer: number | null = null;
    let previousX = 0,
      startX = 0,
      startY = 0,
      moved = false;
    let browse = false,
      touchCardScroll = false,
      previousY = 0,
      cancelled = false;
    let startTrack = { lane: 0, row: 0 };
    let wheelTotal = 0,
      wheelTime = 0;
    const pointers = new Set<number>();
    const hover = (
      e: Pick<PointerEvent, "clientX" | "clientY" | "pointerType">,
    ) => {
      if (e.pointerType !== "mouse" || this.archiveMomentum) return;
      if (this.canBrowse()) {
        this.setDetailHover(null);
        const r = this.canvasRect();
        this.pointer.set(
          (e.clientX - r.left) / r.width - 0.5,
          (e.clientY - r.top) / r.height - 0.5,
        );
        const cell = this.pickCell(e.clientX, e.clientY);
        this.setHover(cell);
        canvas.style.cursor = cell ? "pointer" : "grab";
        return;
      }
      if (this.targetDetail > 0 && this.canInspect) {
        this.setHover(null);
        if (
          this.dragging ||
          Math.abs(this.rotation - this.targetRotation) > 0.004
        ) {
          this.setDetailHover(null);
          canvas.style.cursor = this.dragging
            ? "grabbing"
            : this.canInspect
              ? "grab"
              : "default";
          return;
        }
        const hit = this.pickDetailHotspot(e.clientX, e.clientY);
        this.setDetailHover(hit);
        canvas.style.cursor =
          hit && hit !== "card-body"
            ? "pointer"
            : this.canInspect
              ? "grab"
              : "default";
      }
    };
    this.flushHover = () => {
      const sample = this.pendingHover;
      this.pendingHover = null;
      if (sample) hover(sample);
    };
    const reset = () => {
      this.pendingHover = null;
      const id = activePointer;
      activePointer = null;
      this.dragging = false;
      this.dragTrack = null;
      this.holdingArchive = false;
      browse = false;
      touchCardScroll = false;
      this.setHover(null);
      this.setDetailHover(null);
      canvas.style.cursor =
        this.canBrowse() || this.canInspect ? "grab" : "default";
      if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    };
    this.cancelPointer = () => {
      cancelled = true;
      this.stopMomentum();
      pointers.clear();
      wheelTotal = 0;
      reset();
    };
    const moveArchive = (e: PointerEvent) => {
      const pending = !this.archiveDrag.active;
      for (const sample of e.getCoalescedEvents?.() ?? []) {
        this.archiveDrag.move(sample.clientX, sample.clientY, sample.timeStamp);
      }
      this.archiveDrag.move(e.clientX, e.clientY, e.timeStamp);
      moved ||= this.archiveDrag.moved;
      if (!this.archiveDrag.active) return;
      if (pending) {
        this.finishIntro();
        startTrack = { lane: this.columnCamera.value, row: this.rail.value };
      }
      this.setHover(null);
      this.lastInteraction = this.clock;
      canvas.style.cursor = "grabbing";
      this.dragTrack = {
        lane: startTrack.lane + this.archiveDrag.value.lane * COLUMN_SPACING,
        row: startTrack.row - this.archiveDrag.value.row * ROW_SPACING,
      };
      this.columnCamera.value = this.dragTrack.lane;
      this.rail.value = this.dragTrack.row;
      this.columnCamera.velocity = this.rail.velocity = 0;
      this.navigatePlane({
        lane: this.trackCoordinate("lane", this.columnCamera.value),
        row: this.trackCoordinate("row", this.rail.value),
      });
    };
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (!this.canBrowse() && !this.canInspect) return;
        this.pendingHover = null;
        pointers.add(e.pointerId);
        if (pointers.size > 1) {
          cancelled = true;
          reset();
          return;
        }
        activePointer = e.pointerId;
        cancelled = false;
        moved = this.archiveMomentum !== null;
        startX = previousX = e.clientX;
        startY = previousY = e.clientY;
        browse = this.canBrowse();
        this.stopMomentum();
        if (browse) {
          this.columnCamera.velocity = 0;
          this.rail.velocity = 0;
        }
        this.holdingArchive = browse;
        const hit = !browse && e.pointerType === "touch" && this.detailDrawerOpen
          ? this.pickDetailHotspot(e.clientX, e.clientY)
          : null;
        touchCardScroll = hit?.startsWith("card-") ?? false;
        this.dragging = !browse && this.canInspect && !touchCardScroll;
        startTrack = { lane: this.columnCamera.value, row: this.rail.value };
        this.archiveDrag.start(
          e.clientX,
          e.clientY,
          this.dragProjection(),
          e.timeStamp,
        );
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore synthetic pointers without an active OS pointer id */
        }
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (activePointer !== null && e.pointerId !== activePointer) return;
        if (activePointer === null) {
          // Coalesce uncaptured hover only; dragging and release velocity stay immediate.
          this.pendingHover = {
            clientX: e.clientX,
            clientY: e.clientY,
            pointerType: e.pointerType,
          };
          return;
        }
        if (cancelled) return;
        moved ||= Math.hypot(e.clientX - startX, e.clientY - startY) > 7;
        if (browse) {
          if (!this.canBrowse()) {
            this.cancelPointer();
            return;
          }
          moveArchive(e);
          return;
        }
        if (touchCardScroll) {
          if (moved) {
            this.scrollDetailCard((previousY - e.clientY) * 3);
            previousY = e.clientY;
          }
          return;
        }
        if (this.dragging && this.canInspect) {
          this.targetRotation = THREE.MathUtils.clamp(
            this.targetRotation + (e.clientX - previousX) * 0.004,
            -0.8,
            0.8,
          );
          previousX = e.clientX;
        }
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "pointerup",
      (e) => {
        pointers.delete(e.pointerId);
        if (e.pointerId !== activePointer) return;
        if (!cancelled && browse && this.canBrowse()) {
          moveArchive(e);
          if (this.archiveDrag.active) {
            if (this.motion.dragMomentum) {
              this.archiveMomentum = {
                time: performance.now() / 1000,
                motion: new ArchivePlaneMomentum(
                  {
                    lane: this.trackCoordinate("lane", this.columnCamera.value),
                    row: this.trackCoordinate("row", this.rail.value),
                  },
                  this.archiveDrag.releaseVelocity(e.timeStamp, false),
                ),
              };
            }
          } else if (!moved) {
            const cell = this.pickCell(e.clientX, e.clientY);
            if (cell) {
              // Two presses on the same card open it. The first press already
              // selected and started lifting it, so the lift is released here and
              // the extraction takes over from the current height: no second rise.
              const now = e.timeStamp || performance.now();
              const file = fileAtCell(cell, this.coordinateOrigin.row);
              const repeat =
                this.lastPress.file === file &&
                now - this.lastPress.time < DOUBLE_PRESS_MS;
              this.lastPress = { file, time: now };
              if (repeat) {
                this.lastPress.file = -1;
                this.onOpen?.(file);
              } else {
                this.onSelect?.(file, cell);
              }
            }
          }
        } else if (
          !cancelled &&
          !browse &&
          !moved &&
          this.targetDetail > 0 &&
          this.canInspect
        ) {
          const hit = this.pickDetailHotspot(e.clientX, e.clientY);
          this.handleDetailHotspotClick(hit);
        }
        reset();
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "pointercancel",
      (e) => {
        pointers.delete(e.pointerId);
        if (e.pointerId === activePointer) {
          cancelled = true;
          reset();
        }
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "lostpointercapture",
      (e) => {
        pointers.delete(e.pointerId);
        if (e.pointerId === activePointer) {
          cancelled = true;
          reset();
        }
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        this.pendingHover = null;
        this.pointer.set(0, 0);
        this.setHover(null);
        this.setDetailHover(null);
      },
      { signal: this.inputEvents.signal },
    );
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (
          !this.canBrowse() &&
          this.isDetailBadgeActive() &&
          this.detailDrawerOpen &&
          this.detailPulloutLayout &&
          this.detailPulloutLayout.maxScroll > 0 &&
          activePointer === null &&
          !e.ctrlKey
        ) {
          const hit = this.pickDetailHotspot(e.clientX, e.clientY);
          if (hit && hit.startsWith("card-")) {
            e.preventDefault();
            const delta = THREE.MathUtils.clamp(
              e.deltaY *
                (e.deltaMode === 1
                  ? 40
                  : e.deltaMode === 2
                    ? canvas.clientHeight
                    : 1),
              -240,
              240,
            );
            this.scrollDetailCard(delta * 1.4);
            return;
          }
        }
        if (
          !this.canBrowse() ||
          activePointer !== null ||
          e.ctrlKey ||
          Math.abs(e.deltaX) > Math.abs(e.deltaY)
        )
          return;
        e.preventDefault();
        if (this.archiveMomentum) this.stopMomentum();
        const now = performance.now();
        const delta = THREE.MathUtils.clamp(
          e.deltaY *
            (e.deltaMode === 1
              ? 40
              : e.deltaMode === 2
                ? canvas.clientHeight
                : 1),
          -300,
          300,
        );
        if (now - wheelTime > 180 || Math.sign(delta) !== Math.sign(wheelTotal))
          wheelTotal = 0;
        wheelTime = now;
        wheelTotal += delta;
        const steps = Math.min(3, Math.floor(Math.abs(wheelTotal) / 100));
        if (!steps) return;
        const direction = Math.sign(wheelTotal);
        wheelTotal -= direction * steps * 100;
        this.finishIntro();
        this.navigatingDrag = true;
        try {
          this.onNavigate?.("row", direction * steps);
        } finally {
          this.navigatingDrag = false;
        }
      },
      { ...{ passive: false }, signal: this.inputEvents.signal },
    );
    window.addEventListener("blur", () => this.cancelPointer(), {
      signal: this.inputEvents.signal,
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.cancelPointer();
      },
      { signal: this.inputEvents.signal },
    );
    window.addEventListener(
      "resize",
      () => {
        this.cachedCanvasRect = null;
        this.cancelPointer();
      },
      { signal: this.inputEvents.signal },
    );
    window.addEventListener(
      "scroll",
      () => {
        this.cachedCanvasRect = null;
      },
      { passive: true, signal: this.inputEvents.signal },
    );
    // After multi-touch cancels capture, a finger can finish outside the canvas.
    window.addEventListener("pointerup", (e) => pointers.delete(e.pointerId), {
      signal: this.inputEvents.signal,
    });
    window.addEventListener(
      "pointercancel",
      (e) => pointers.delete(e.pointerId),
      { signal: this.inputEvents.signal },
    );
  }
  update(time: number) {
    this.clock = time;
    if (!this.loaded) return;
    const elapsed = this.last === null ? 0 : Math.max(0, time - this.last);
    const dt = Math.min(elapsed, 0.05);
    this.last = time;
    // Selection waves advance with simulation time, not wall time. A slow
    // compile or upload frame therefore delays the crest instead of skipping it.
    this.pulseClock += dt;
    this.flushHover();
    this.flushOverviewBadge();
    this.slotUnderlights.update(dt, !this.motion.selectionTransition);
    if (this.introRelease) {
      this.introRelease.age += dt;
      if (this.introRelease.age >= INTRO_RELEASE_DURATION)
        this.introRelease = null;
    }
    if (this.intro) {
      if (this.intro.started) {
        this.intro.elapsed += dt;
      } else {
        this.intro.started = true;
      }
      this.lastInteraction = time;
      const u = Math.max(
        0,
        Math.min(
          1,
          (this.intro.elapsed - INTRO_LIGHT_START) / INTRO_LIGHT_DURATION,
        ),
      );
      const remain = (1 - u) ** 3;
      this.slotUnderlights.setIntroGain(
        this.intro.elapsed < INTRO_LIGHT_START
          ? 0
          : ease((this.intro.elapsed - INTRO_LIGHT_START) / 0.16),
      );
      this.slotUnderlights.setBarRow(
        this.selectedCell.row - INTRO_BAR_START_OFFSET * remain,
      );
      if (
        !this.intro.fullLiftUnlocked &&
        this.slotUnderlights.directFor(this.selectedCell) >=
          INTRO_FULL_LIFT_THRESHOLD
      ) {
        this.intro.fullLiftUnlocked = true;
      }
      if (this.intro.elapsed >= INTRO_TOTAL_DURATION) {
        this.finishIntro();
      }
    }
    this.syncOverviewSlotLights();
    const blend =
      1 - Math.exp(-dt * (this.motion.selectionTransition ? 2.8 : 35));
    const detailBlend =
      1 - Math.exp(-dt * (this.motion.detailTransition ? 2.8 : 35));
    this.reveal = THREE.MathUtils.lerp(this.reveal, this.targetReveal, blend);
    if (Math.abs(this.reveal - this.targetReveal) < 1e-4) {
      this.reveal = this.targetReveal;
    }
    this.rotation = this.targetDetail
      ? THREE.MathUtils.lerp(this.rotation, this.targetRotation, detailBlend)
      : returnStep(this.rotation, dt, !this.motion.detailTransition);
    if (
      this.targetDetail &&
      Math.abs(this.rotation - this.targetRotation) < 1e-4
    ) {
      this.rotation = this.targetRotation;
    }
    if (!this.canBrowse()) {
      this.setHover(null);
      if (this.holdingArchive || this.archiveMomentum) this.cancelPointer();
    }
    if (!this.holdingArchive && !this.archiveMomentum) this.rebaseCoordinates();
    const momentum = this.archiveMomentum;
    if (momentum) {
      momentum.motion.step(Math.min(Math.max(time - momentum.time, 0), 0.25));
      momentum.time = time;
      this.navigatePlane(momentum.motion.value);
      this.lastInteraction = time;
    }
    const hoverKey = this.hoverCell ? cellKey(this.hoverCell) : null;
    const hoverTarget =
      this.hoverCell && sameCell(this.hoverCell, this.selectedCell)
        ? 0.28
        : HOVER_PREVIEW_LIFT;
    if (hoverKey && !this.hoverLifts.has(hoverKey))
      this.hoverLifts.set(hoverKey, 0);
    for (const [key, value] of this.hoverLifts) {
      const target = key === hoverKey ? hoverTarget : 0;
      const next = !this.motion.selectionTransition
        ? target
        : THREE.MathUtils.lerp(value, target, 1 - Math.exp(-dt * 14));
      if (target === 0 && next < 0.0001) this.hoverLifts.delete(key);
      else if (target > 0 && Math.abs(next - target) < 0.0005)
        this.hoverLifts.set(key, target);
      else this.hoverLifts.set(key, next);
    }
    const hoverLift = (cell: ArchiveCell) =>
      this.hoverLifts.get(cellKey(cell)) ?? 0;
    if (this.canBrowse() && !this.intro && this.loaded) {
      if (this.hoverCell && !sameCell(this.hoverCell, this.selectedCell)) {
        this.hoverStickerCell = { ...this.hoverCell };
      } else if (
        this.hoverStickerCell &&
        (sameCell(this.hoverStickerCell, this.selectedCell) ||
          hoverLift(this.hoverStickerCell) <= 0.03)
      ) {
        this.hoverStickerCell = null;
      }
    } else {
      this.hoverStickerCell = null;
    }
    const chosen = this.cellPosition(this.selectedCell);
    const selectedRow = this.selectedCell.row;
    const selectedLane = this.selectedCell.lane;
    if (!this.motion.selectionTransition) {
      this.shoulder = { value: selectedRow, velocity: 0 };
      this.laneFocus = { value: selectedLane, velocity: 0 };
      // A held or freely coasting plane owns both tracks; selection cannot pull it.
      if (!this.holdingArchive && !momentum) {
        this.columnCamera = { value: chosen.x, velocity: 0 };
        this.rail = { value: SELECTED_ROW_ANCHOR_Z - chosen.z, velocity: 0 };
      }
    } else {
      damp(this.shoulder, selectedRow, 5, dt);
      snapSpring(this.shoulder, selectedRow);
      damp(this.laneFocus, selectedLane, 4, dt);
      snapSpring(this.laneFocus, selectedLane);
      // A held or freely coasting plane owns both tracks; selection cannot pull it.
      if (!this.holdingArchive && !momentum) {
        damp(this.columnCamera, chosen.x, 3.7, dt);
        snapSpring(this.columnCamera, chosen.x);
        const railTarget = SELECTED_ROW_ANCHOR_Z - chosen.z;
        damp(this.rail, railTarget, 3.7, dt);
        snapSpring(this.rail, railTarget);
      }
    }
    if (momentum) {
      this.columnCamera.value = this.trackPosition(
        "lane",
        momentum.motion.lane.value,
      );
      this.rail.value = this.trackPosition("row", momentum.motion.row.value);
      this.columnCamera.velocity =
        momentum.motion.lane.velocity * COLUMN_SPACING;
      this.rail.velocity = -momentum.motion.row.velocity * ROW_SPACING;
      if (momentum.motion.phase === "idle") this.archiveMomentum = null;
    }
    if (this.dragTrack) {
      this.columnCamera.value = this.dragTrack.lane;
      this.rail.value = this.dragTrack.row;
      this.columnCamera.velocity = this.rail.velocity = 0;
    }
    // Keep the illuminated set near the origin. Lateral navigation is a track
    // movement of the whole array, just like the existing front/back rail.
    const trackX = this.columnCamera.value;
    this.pulses = this.pulses.filter((p) => this.pulseClock - p.time < 3.2);
    this.frozenPulses = this.frozenPulses.filter(
      (pulse) =>
        this.pulseClock - pulse.stoppedAt < SELECTION_WAVE_STOP_FADE_SECONDS,
    );
    const aligningCopy = this.outgoing.some((o) => o.returnY !== null);
    // Breathing is ambient, not content. Once nobody has touched the terminal
    // for a while it settles completely, which lets the exact-state reuse below
    // skip every draw until the next input. Any pointer, key or wheel wakes it.
    const idleFor = time - this.lastInteraction;
    const focused =
      typeof document.hasFocus !== "function" || document.hasFocus();
    const idle =
      this.motion.idleWave &&
      this.targetReveal > 0 &&
      !this.targetDetail &&
      this.detail < 0.01 &&
      this.returnY === null &&
      !aligningCopy &&
      idleFor > 2.5 &&
      idleFor < 7.5 &&
      focused;
    this.idleGain = THREE.MathUtils.lerp(
      this.idleGain,
      idle ? 1 : 0,
      1 - Math.exp(-dt * (idle ? 0.8 : focused ? 5 : 8)),
    );
    // Snap, or the exponential tail would keep the matrices changing forever.
    if (!idle && this.idleGain < 5e-4) this.idleGain = 0;
    this.idleNow = idle;
    const pulseTarget =
      this.targetDetail || this.returnY !== null || aligningCopy ? 0 : 1;
    this.pulseGain = THREE.MathUtils.lerp(
      this.pulseGain,
      pulseTarget,
      1 - Math.exp(-dt * 8),
    );
    if (Math.abs(this.pulseGain - pulseTarget) < 1e-4) {
      this.pulseGain = pulseTarget;
    }
    // Fixed Web detail frames keep the overview field while logical detail
    // advances independently for application state.
    const fieldCache = new Map<number, Map<number, number>>();
    const introFieldState = this.intro ?? this.introRelease;
    const introOrigin = this.introRelease?.cell ?? this.selectedCell;
    const introRelease = this.introRelease
      ? ease(this.introRelease.age / INTRO_RELEASE_DURATION)
      : 0;
    const calculateField = (row: number, lane: number) => {
      const breathing =
        idleWave(
          row + this.coordinateOrigin.row,
          lane + this.coordinateOrigin.lane,
          time,
        ) * this.idleGain;
      let pulseHeight = 0;
      if (this.motion.selectionWave) {
        const useColumnSwitchWave =
          this.selectionPulse === baselineSelectionWave &&
          !this.deferSelectionPulse;
        let ripple = 0;
        for (const p of this.pulses) {
          const age = this.pulseClock - p.time;
          if (useColumnSwitchWave) {
            ripple += columnSwitchWave(row, lane, p.row, p.lane, age);
          } else {
            const distance = Math.hypot(
              (row - p.row) * (ROW_SPACING / REFERENCE_ROW_SPACING),
              (lane - p.lane) * 2.2,
            );
            ripple +=
              this.selectionPulse(distance, age) *
              (this.deferSelectionPulse ? rippleEnvelope(distance, age) : 1);
          }
        }
        for (const p of this.frozenPulses) {
          const age = p.stoppedAt - p.time;
          const fade =
            1 -
            ease(
              (this.pulseClock - p.stoppedAt) /
                SELECTION_WAVE_STOP_FADE_SECONDS,
            );
          if (useColumnSwitchWave) {
            ripple += columnSwitchWave(row, lane, p.row, p.lane, age) * fade;
          } else {
            const distance = Math.hypot(
              (row - p.row) * (ROW_SPACING / REFERENCE_ROW_SPACING),
              (lane - p.lane) * 2.2,
            );
            ripple +=
              this.selectionPulse(distance, age) *
              (this.deferSelectionPulse ? rippleEnvelope(distance, age) : 1) *
              fade;
          }
        }
        pulseHeight =
          THREE.MathUtils.clamp(
            ripple,
            -0.6,
            useColumnSwitchWave ? 0.82 : 0.6,
          ) * this.pulseGain;
      }
      const distance = row - this.shoulder.value;
      const columnWave = THREE.MathUtils.lerp(
        columnStrength(lane, this.laneFocus.value),
        1,
        0.18,
      );
      const settling = settlingWave(
        distance * (ROW_SPACING / REFERENCE_ROW_SPACING),
        26.56,
      );
      // Lift the static rear trough back to the slot plane with a soft edge.
      const planeTransition = THREE.MathUtils.smoothstep(settling, 0, 0.16);
      const overviewSettling = Math.max(0, settling) * planeTransition;
      if (introFieldState) {
        const rightOffset =
          (lane - introOrigin.lane) * COLUMN_SPACING * OVERVIEW_RIGHT_X +
          (row - introOrigin.row) * ROW_SPACING * OVERVIEW_RIGHT_Z;
        const terraceTarget = overviewSettling * columnWave;
        const { crest, terrace } = introField(
          rightOffset,
          introFieldState.elapsed,
          terraceTarget,
        );
        const terraceWeight = THREE.MathUtils.lerp(terrace, 1, introRelease);
        return (
          terraceTarget * terraceWeight +
          breathing * planeTransition * terraceWeight +
          crest * (1 - introRelease) +
          pulseHeight
        );
      }
      return (
        overviewSettling * columnWave +
        breathing * planeTransition +
        pulseHeight
      );
    };
    const field = (row: number, lane: number): number => {
      let values = fieldCache.get(lane);
      if (!values) {
        values = new Map();
        fieldCache.set(lane, values);
      }
      const previous = values.get(row);
      if (previous !== undefined) return previous;
      const value = calculateField(row, lane);
      values.set(row, value);
      return value;
    };
    const selectedBase = chosen.y + field(selectedRow, selectedLane);
    const introLiftScale = !this.intro || this.intro.fullLiftUnlocked ? 1 : 0;
    if (this.returnY !== null && this.rotation !== 0) {
      this.lift.value = this.returnY - selectedBase;
      this.lift.velocity = 0;
    } else {
      this.returnY = null;
      const detailLift = this.fixedDetailLiftTarget ?? INSPECTION_LIFT;
      const liftTarget = this.targetDetail
        ? detailLift
        : this.outgoing.some(
              (o) =>
                o.returnY !== null &&
                o.cell.lane === selectedLane &&
                Math.abs(o.cell.row - selectedRow) < 5,
            )
          ? 0
          : OVERVIEW_LIFT * this.targetReveal * introLiftScale;
      if (!this.motion.detailTransition) {
        this.lift = { value: liftTarget, velocity: 0 };
      } else {
        damp(
          this.lift,
          liftTarget,
          this.targetDetail
            ? DETAIL_LIFT_OPEN_RATE
            : this.deferSelectionPulse &&
                !this.targetDetail &&
                this.lift.value < OVERVIEW_LIFT
              ? 7.6
              : 4.2,
          dt,
        );
        snapSpring(this.lift, liftTarget);
      }
    }
    const cameraTarget = this.targetDetail;
    this.detail = THREE.MathUtils.lerp(this.detail, cameraTarget, detailBlend);
    if (Math.abs(this.detail - cameraTarget) < 0.001) {
      this.detail = cameraTarget;
    }
    const drawerTarget = this.targetDetail && this.detailDrawerOpen ? 1 : 0;
    if (!this.motion.detailTransition) {
      this.detailDrawer = { value: drawerTarget, velocity: 0 };
    } else {
      damp(this.detailDrawer, drawerTarget, 6.5, dt);
      snapSpring(this.detailDrawer, drawerTarget);
    }
    const stickerHovering =
      this.isDetailBadgeActive() &&
      (this.detailHoveredHotspot === "note" ||
        this.detailHoveredHotspot === "copy-prompt");
    // 只有右下角在静置态保留轻卷；指针停在贴纸上时，离指针最近的角掀起。
    const restPeel = this.detail > 0.5 ? 0.24 : 0.1;
    const hoveredCorner =
      stickerHovering && this.detailStickerHoverCorner >= 0
        ? this.detailStickerHoverCorner
        : -1;
    // 换角时先让上一个角基本落回静置，再抬新角，保证同一时刻只掀一个角。
    // 门限用真实抬升幅度（满幅 0.092）：旧角残余抬升降到约 13% 以内才放行新角。
    let otherLift = 0;
    for (let corner = 0; corner < this.detailStickerCornerPeel.length; corner++) {
      if (corner === hoveredCorner) continue;
      const rest = corner === STICKER_REST_CORNER ? restPeel : 0;
      otherLift = Math.max(
        otherLift,
        stickerPeelLift(this.detailStickerCornerPeel[corner].value) -
          stickerPeelLift(rest),
      );
    }
    const handover = 1 - THREE.MathUtils.smoothstep(otherLift, 0.004, 0.012);
    for (let corner = 0; corner < this.detailStickerCornerPeel.length; corner++) {
      const spring = this.detailStickerCornerPeel[corner];
      // 悬停角用「静置基线 + 增量」：右下角在放行前保持 0.24，不会被压平。
      const base = corner === STICKER_REST_CORNER ? restPeel : 0;
      const target =
        corner === hoveredCorner
          ? base + (STICKER_HOVER_PEEL - base) * handover
          : base;
      if (!this.motion.detailTransition) {
        spring.value = target;
        spring.velocity = 0;
      } else {
        damp(spring, target, 10, dt);
        snapSpring(spring, target);
      }
      this.detailStickerPeelScratch[corner] = spring.value;
    }
    if (this.detailDrawer.value > 0.002 && !this.detailPulloutLayout) {
      this.redrawPulloutCard();
    }
    const detail = this.detail;
    const selectedVisualLift = this.overviewVisualLift();
    const selectedDirectLight = this.slotUnderlights.directFor(
      this.selectedCell,
    );
    this.appearance.apply(
      this.model,
      this.appearanceInSlot(this.lift.value, selectedDirectLight),
    );
    this.appearance.setClarity(this.model, 0);
    this.setGroupSlotLight(
      this.model,
      selectedDirectLight,
      this.slotUnderlights.reflectionFor(this.selectedCell),
      this.slotUnderlights.lateralFor(this.selectedCell),
      this.slotUnderlights.topRailFor(this.selectedCell),
    );
    // The array travels forward from behind the camera as the archive opens.
    const entryZ = -28 * (1 - this.reveal);
    // Clear the backlog of older return animations without moving a card abruptly.
    const fastReturnCount = this.outgoing.length - OUTGOING_NORMAL_RETURN_COUNT;
    for (let i = this.outgoing.length - 1; i >= 0; i--) {
      const o = this.outgoing[i];
      const p = this.cellPosition(o.cell);
      const baseY = p.y + field(o.cell.row, o.cell.lane);
      o.group.rotation.y = returnStep(
        o.group.rotation.y,
        dt,
        !this.motion.detailTransition,
      );
      if (o.returnY !== null) {
        o.lift.value = o.returnY - baseY;
        o.lift.velocity = 0;
        if (o.group.rotation.y === 0) o.returnY = null;
      } else {
        const rate = this.motion.detailTransition
          ? i < fastReturnCount
            ? OUTGOING_CATCH_UP_RATE
            : 4.5
          : 35;
        damp(o.lift, 0, rate, dt);
      }
      o.group.position.set(
        p.x - trackX,
        baseY +
          o.lift.value +
          OVERVIEW_VISUAL_LIFT *
            THREE.MathUtils.smoothstep(o.lift.value, 0, OVERVIEW_LIFT) +
          hoverLift(o.cell),
        p.z + entryZ + this.rail.value,
      );
      const quality = ease(o.lift.value / OVERVIEW_LIFT);
      const directLight = this.slotUnderlights.directFor(o.cell);
      this.appearance.apply(
        o.group,
        this.appearanceInSlot(o.lift.value, directLight),
      );
      this.appearance.setClarity(o.group, 0);
      this.setGroupSlotLight(
        o.group,
        directLight,
        this.slotUnderlights.reflectionFor(o.cell),
        this.slotUnderlights.lateralFor(o.cell),
        this.slotUnderlights.topRailFor(o.cell),
      );
      const { row, lane } = o.cell;
      o.group.rotation.x =
        (field(row + 0.5, lane) - field(row - 0.5, lane)) *
        0.024 *
        (1 - quality);
      if (
        Math.abs(o.lift.value) < OUTGOING_FINISH_LIFT &&
        Math.abs(o.group.rotation.y) < 0.001
      ) {
        this.outgoing.splice(i, 1);
        this.releaseOutgoingGroup(o.group);
      }
    }
    if (this.pendingPulse && !this.targetDetail && this.targetReveal) {
      const selectedY = selectedBase + this.lift.value;
      const oldCardsLower = this.outgoing.every(
        (old) =>
          old.cell.lane !== selectedLane ||
          Math.abs(old.cell.row - selectedRow) > 4 ||
          old.group.position.y + 0.015 < selectedY,
      );
      // The new file causes the wave: finish most of its rise and let nearby
      // outgoing files get below it before starting the outward pulse.
      if (
        this.lift.value >= OVERVIEW_LIFT * 0.87 &&
        this.returnY === null &&
        oldCardsLower
      ) {
        if (this.motion.selectionWave) this.emitPulse(this.pendingPulse);
        this.pendingPulse = null;
      }
    }
    this.model.position.set(
      chosen.x - trackX,
      chosen.y +
        field(selectedRow, selectedLane) +
        this.lift.value +
        selectedVisualLift +
        hoverLift(this.selectedCell),
      chosen.z + entryZ + this.rail.value,
    );
    // Extraction only changes elevation. Reframing belongs to the camera.
    this.model.rotation.set(
      (field(selectedRow + 0.5, selectedLane) -
        field(selectedRow - 0.5, selectedLane)) *
        0.024 *
        (1 - ease(this.lift.value / OVERVIEW_LIFT)),
      this.rotation,
      0,
    );
    if (this.detailPulloutGroup) {
      const t = THREE.MathUtils.clamp(this.detailDrawer.value, 0, 1);
      if (t < 0.002) {
        this.detailPulloutGroup.visible = false;
      } else {
        this.model.updateMatrixWorld();
        this.detailClipPlane
          .set(new THREE.Vector3(1, 0, 0), -2.495)
          .applyMatrix4(this.model.matrixWorld);
        this.detailPulloutGroup.visible = true;
        this.detailPulloutGroup.position
          .set(
            THREE.MathUtils.lerp(0.45, 4.68, t),
            1.85,
            THREE.MathUtils.lerp(
              0.0,
              0.012,
              THREE.MathUtils.smoothstep(t, 0.55, 1),
            ),
          )
          .applyMatrix4(this.model.matrixWorld);
        this.detailPulloutGroup.quaternion.copy(this.model.quaternion);
        this.detailPulloutGroup.rotateY(
          -0.045 * THREE.MathUtils.smoothstep(t, 0.4, 1),
        );
      }
    }
    if (this.detailStickerGroup) {
      const showSticker =
        this.loaded &&
        this.reveal > 0.5 &&
        (this.targetDetail > 0 || this.lift.value > 0.12);
      if (!showSticker) {
        this.detailStickerGroup.visible = false;
      } else {
        this.model.updateMatrixWorld();
        this.detailStickerGroup.visible = true;
        this.detailStickerGroup.position
          .set(STICKER_LOCAL_X, STICKER_LOCAL_Y, this.glassFrontZ + STICKER_PLATE_LIFT)
          .applyMatrix4(this.model.matrixWorld);
        this.detailStickerGroup.quaternion.copy(this.model.quaternion);
        this.detailStickerGroup.rotateZ(STICKER_TILT_Z);
        this.applyStickerPeel(this.detailStickerPeelScratch);
        this.detailStickerShadowPeel.value.set(
          this.detailStickerPeelScratch[0],
          this.detailStickerPeelScratch[1],
          this.detailStickerPeelScratch[2],
          this.detailStickerPeelScratch[3],
        );
        const slotLight = THREE.MathUtils.clamp(
          selectedDirectLight * this.overviewSlotLightGain.value,
          0,
          1,
        );
        const stickerLight = THREE.MathUtils.clamp(
          Math.max(detail, slotLight),
          0,
          1,
        );
        const liftAlpha =
          this.targetDetail > 0 || detail > 0.05
            ? 1
            : THREE.MathUtils.smoothstep(
                this.lift.value,
                0.12,
                OVERVIEW_LIFT * 0.72,
              );
        if (this.detailStickerFrontMat) {
          this.detailStickerFrontMat.color
            .copy(HOVER_STICKER_SHADED_COLOR)
            .lerp(HOVER_STICKER_LIT_COLOR, stickerLight);
          this.detailStickerFrontMat.emissive
            .copy(HOVER_STICKER_SHADED_EMISSIVE)
            .lerp(HOVER_STICKER_LIT_EMISSIVE, stickerLight);
          this.detailStickerFrontMat.emissiveIntensity = THREE.MathUtils.lerp(
            0.1,
            0.46,
            stickerLight,
          );
          this.detailStickerFrontMat.opacity = liftAlpha;
        }
        if (this.detailStickerBackMat) {
          this.detailStickerBackMat.emissiveIntensity = THREE.MathUtils.lerp(
            0.1,
            0.48,
            stickerLight,
          );
          this.detailStickerBackMat.opacity = liftAlpha;
        }
        if (this.detailStickerShadowMat) {
          let peelMax = 0;
          for (let corner = 0; corner < this.detailStickerPeelScratch.length; corner++) {
            peelMax = Math.max(peelMax, this.detailStickerPeelScratch[corner]);
          }
          const shadowOpacity = THREE.MathUtils.lerp(
            0.82,
            1.0,
            THREE.MathUtils.clamp((peelMax - 0.1) / 0.68, 0, 1),
          );
          this.detailStickerShadowMat.opacity =
            shadowOpacity *
            liftAlpha *
            THREE.MathUtils.lerp(0.55, 1, stickerLight);
        }
      }
    }
    if (
      this.detailToggleGroup &&
      this.detailToggleInMesh &&
      this.detailToggleOutMesh &&
      this.detailToggleInUniforms &&
      this.detailToggleOutUniforms
    ) {
      if (this.loaded && this.targetDetail > 0 && detail >= 0.45) {
        if (
          this.detailToggleMode === "hidden" ||
          this.detailToggleMode === "hide"
        ) {
          this.detailToggleLabelOpen = this.detailDrawerOpen;
          this.detailToggleSwitchActive = false;
          this.detailToggleOutMesh.visible = false;
          this.redrawDetailToggleCanvas(
            this.detailToggleInCanvas,
            this.detailToggleInTexture,
            this.detailToggleLabelOpen,
            this.detailHoveredHotspot === "toggle-detail",
          );
          if (!this.motion.surfaceTransitions) {
            this.detailToggleMode = "visible";
            this.detailToggleVisibility = 1;
          } else {
            this.detailToggleMode = "reveal";
            this.detailToggleDuration = MIST_RETURN_DURATION_MS / 1000;
            this.detailToggleElapsed =
              this.detailToggleVisibility * this.detailToggleDuration;
          }
        }
      }

      if (this.detailToggleMode === "reveal") {
        this.detailToggleElapsed += dt;
        const raw = clamp01(
          this.detailToggleElapsed / this.detailToggleDuration,
        );
        this.detailToggleVisibility = easeMistReveal(raw);
        if (raw >= 1) {
          this.detailToggleMode = "visible";
          this.detailToggleVisibility = 1;
        }
      } else if (this.detailToggleMode === "hide") {
        this.detailToggleElapsed += dt;
        const raw = clamp01(
          this.detailToggleElapsed / this.detailToggleDuration,
        );
        this.detailToggleVisibility = 1 - easeOutQuad(raw);
        if (raw >= 1) {
          this.detailToggleMode = "hidden";
          this.detailToggleVisibility = 0;
          if (this.detailToggleLabelOpen) {
            this.detailToggleLabelOpen = false;
            this.redrawDetailToggleCanvas(
              this.detailToggleInCanvas,
              this.detailToggleInTexture,
              false,
              false,
            );
          }
        }
      }

      const showToggle =
        this.loaded && this.reveal > 0.5 && this.detailToggleMode !== "hidden";
      if (!showToggle) {
        this.detailToggleGroup.visible = false;
        this.detailToggleInMesh.visible = false;
        this.detailToggleOutMesh.visible = false;
      } else {
        this.model.updateMatrixWorld();
        this.detailToggleGroup.visible = true;
        this.detailToggleGroup.position
          .set(TOGGLE_LOCAL_X, TOGGLE_LOCAL_Y, this.glassFrontZ + 0.0025)
          .applyMatrix4(this.model.matrixWorld);
        this.detailToggleGroup.quaternion.copy(this.model.quaternion);

        const worldPerBadgePx = 3.426 / 1485;
        const applyStateMotion = (
          mesh: THREE.Mesh,
          uniforms: MistDissolveShaderUniforms,
          localT: number,
          hiding: boolean,
          isSwitch: boolean,
        ) => {
          const motionT = hiding ? easeOutQuad(localT) : easeOutCubic(localT);
          const dyMag = isSwitch ? 6.5 : hiding ? 11 : 12;
          const scaleDelta = isSwitch ? 0.028 : 0.045;
          const dyPx = hiding ? -motionT * dyMag : (1 - motionT) * dyMag;
          const scale = hiding
            ? 1 - scaleDelta * motionT
            : 1 - scaleDelta + scaleDelta * motionT;
          mesh.visible = true;
          mesh.position.set(
            0,
            -dyPx * worldPerBadgePx,
            mesh === this.detailToggleOutMesh ? -0.0003 : 0,
          );
          mesh.scale.set(scale, scale, 1);
          uniforms.uActive.value = 1;
          uniforms.uHiding.value = hiding ? 1 : 0;
          uniforms.uModeSwitch.value = isSwitch ? 1 : 0;
          uniforms.uProgress.value = localT;
        };

        if (
          this.detailToggleSwitchActive &&
          (this.detailToggleMode === "visible" ||
            this.detailToggleMode === "reveal")
        ) {
          this.detailToggleSwitchElapsed += dt;
          const outDur = (MIST_SWITCH_DURATION_MS * 0.62) / 1000;
          const inDelay = (MIST_SWITCH_DURATION_MS * 0.14) / 1000;
          const inDur =
            (MIST_SWITCH_DURATION_MS - MIST_SWITCH_DURATION_MS * 0.14) / 1000;

          if (this.detailToggleSwitchElapsed < outDur) {
            const outT = easeOutQuad(
              clamp01(this.detailToggleSwitchElapsed / outDur),
            );
            applyStateMotion(
              this.detailToggleOutMesh,
              this.detailToggleOutUniforms,
              outT,
              true,
              true,
            );
          } else {
            this.detailToggleOutMesh.visible = false;
            this.detailToggleOutUniforms.uActive.value = 0;
          }

          if (this.detailToggleSwitchElapsed <= inDelay) {
            this.detailToggleInMesh.visible = false;
            this.detailToggleInUniforms.uActive.value = 1;
            this.detailToggleInUniforms.uProgress.value = 0;
          } else {
            const inT = easeMistReveal(
              clamp01((this.detailToggleSwitchElapsed - inDelay) / inDur),
            );
            applyStateMotion(
              this.detailToggleInMesh,
              this.detailToggleInUniforms,
              inT,
              false,
              true,
            );
          }

          if (
            this.detailToggleSwitchElapsed >= inDelay + inDur &&
            this.detailToggleSwitchElapsed >= outDur
          ) {
            this.detailToggleSwitchActive = false;
            this.detailToggleOutMesh.visible = false;
            this.detailToggleOutUniforms.uActive.value = 0;
            this.detailToggleInUniforms.uActive.value = 0;
            this.detailToggleInUniforms.uProgress.value = 1;
            this.detailToggleInMesh.position.set(0, 0, 0);
            this.detailToggleInMesh.scale.set(1, 1, 1);
          }
        } else {
          this.detailToggleOutMesh.visible = false;
          this.detailToggleOutUniforms.uActive.value = 0;
          if (this.detailToggleMode === "visible") {
            this.detailToggleInMesh.visible = true;
            this.detailToggleInMesh.position.set(0, 0, 0);
            this.detailToggleInMesh.scale.set(1, 1, 1);
            this.detailToggleInUniforms.uActive.value = 0;
            this.detailToggleInUniforms.uHiding.value = 0;
            this.detailToggleInUniforms.uModeSwitch.value = 0;
            this.detailToggleInUniforms.uProgress.value = 1;
          } else if (this.detailToggleMode === "reveal") {
            const raw = clamp01(
              this.detailToggleElapsed / this.detailToggleDuration,
            );
            applyStateMotion(
              this.detailToggleInMesh,
              this.detailToggleInUniforms,
              easeMistReveal(raw),
              false,
              false,
            );
          } else if (this.detailToggleMode === "hide") {
            const raw = clamp01(
              this.detailToggleElapsed / this.detailToggleDuration,
            );
            applyStateMotion(
              this.detailToggleInMesh,
              this.detailToggleInUniforms,
              easeOutQuad(raw),
              true,
              false,
            );
          }
        }
      }
    }
    const fixedDetailBasis: FixedDetailCameraBasis | undefined = this
      .fixedDetailCameraHeld
      ? {
          index: this.selectedIndex,
          x: this.model.position.x,
          // Measure from the rendered pose with only this frame's extraction
          // and transient lifts removed. The slot field, shoulder wave, rail
          // and reveal offset are already represented in this baseline.
          y:
            this.model.position.y -
            this.lift.value -
            selectedVisualLift -
            hoverLift(this.selectedCell),
          z: this.model.position.z,
          aspect: this.container.clientWidth / this.container.clientHeight,
          drawer: Math.round(this.detailDrawer.value * 1000) / 1000,
        }
      : undefined;
    if (
      this.fixedDetailCameraHeld &&
      this.fixedDetailCameraPose &&
      fixedDetailBasis &&
      (this.fixedDetailTargetPose === undefined ||
        this.fixedDetailCameraBasisChanged(fixedDetailBasis))
    ) {
      const nextTarget = this.solveFixedDetailCameraPose(fixedDetailBasis);
      if (nextTarget) {
        this.fixedDetailTargetPose = nextTarget;
        this.fixedDetailCameraBasis = { ...fixedDetailBasis };
      }
    }
    // The long lens keeps the case edges parallel as the selected file rises.
    const fixedPose = this.fixedDetailCameraHeld
      ? this.fixedDetailCameraPose
      : undefined;
    if (fixedPose) {
      if (!this.motion.detailTransition) {
        this.detailCameraMove.value = this.targetDetail;
        this.detailCameraMove.velocity = 0;
        this.detailCameraAimMove.value = this.targetDetail;
        this.detailCameraAimMove.velocity = 0;
      } else if (this.targetDetail) {
        const lead = THREE.MathUtils.smoothstep(
          this.lift.value,
          DETAIL_CAMERA_LEAD_START,
          DETAIL_CAMERA_LEAD_END,
        );
        damp(this.detailCameraAimMove, 1, DETAIL_CAMERA_AIM_OPEN_RATE, dt);
        snapSpring(this.detailCameraAimMove, 1);
        damp(this.detailCameraMove, lead, DETAIL_CAMERA_ORBIT_OPEN_RATE, dt);
        snapSpring(this.detailCameraMove, lead);
      } else if (this.returnY === null) {
        damp(this.detailCameraAimMove, 0, DETAIL_CAMERA_CLOSE_RATE, dt);
        snapSpring(this.detailCameraAimMove, 0);
        damp(this.detailCameraMove, 0, DETAIL_CAMERA_CLOSE_RATE, dt);
        snapSpring(this.detailCameraMove, 0);
      }
    }
    const cameraMove = fixedPose
      ? THREE.MathUtils.clamp(this.detailCameraMove.value, 0, 1)
      : 0;
    const cameraAimMove = fixedPose
      ? THREE.MathUtils.clamp(this.detailCameraAimMove.value, 0, 1)
      : 0;
    if (fixedPose) {
      this.applyFixedDetailCameraMove(cameraMove, cameraAimMove);
      this.cameraInitialized = true;
    } else {
      // A direct detail URL has no overview frame yet. Seed and capture the
      // ordinary overview pose here rather than duplicating its construction.
      const span = 6.3;
      const distance = 55;
      const cameraAim = new THREE.Vector3(-0.62, -0.13, 0.43);
      const viewDirection = new THREE.Vector3(
        -Math.sin(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
        Math.sin(OVERVIEW_ELEVATION),
        Math.cos(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
      ).normalize();
      const framing = archiveFraming(
        this.container.clientWidth,
        this.container.clientHeight,
        span,
        0,
        this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout ===
          "compact",
      );
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
        .normalize();
      const up = new THREE.Vector3()
        .crossVectors(viewDirection, right)
        .normalize();
      const width = this.container.clientWidth,
        height = this.container.clientHeight;
      const pixelScale = height / framing.span;
      if (framing.portrait) {
        // Keep the preview camera independent of the live lift, wave and rail.
        // Following model.position here would visually cancel those motions.
        const previewAim = new THREE.Vector3(
          0,
          -4.6 + settlingWave(0, 26.56) + OVERVIEW_LIFT + 1.85,
          SELECTED_ROW_ANCHOR_Z,
        );
        previewAim.addScaledVector(
          up,
          ((framing.previewY - 0.5) * height) / pixelScale,
        );
        cameraAim.copy(previewAim);
      } else {
        cameraAim.addScaledVector(
          right,
          -Math.min((0.024 * width) / pixelScale, 0.48),
        );
        cameraAim.addScaledVector(up, 0.037 * framing.span);
      }
      const cameraPosition = cameraAim
        .clone()
        .addScaledVector(viewDirection, distance);
      if (this.motion.pointerParallax) {
        cameraPosition.x += this.pointer.x * 0.12;
        cameraPosition.y -= this.pointer.y * 0.12;
      }
      const cameraTransition =
        this.targetDetail || this.detail > 0.01
          ? this.motion.detailTransition
          : this.motion.selectionTransition;
      const cameraBlend =
        !this.cameraInitialized || this.fixedDetailCameraHeld
          ? 1
          : cameraTransition
            ? 1 - Math.exp(-dt * 5)
            : 1;
      this.camera.position.lerp(cameraPosition, cameraBlend);
      if (this.camera.position.distanceToSquared(cameraPosition) < 1e-6) {
        this.camera.position.copy(cameraPosition);
      }
      this.cameraAim.lerp(cameraAim, cameraBlend);
      if (this.cameraAim.distanceToSquared(cameraAim) < 1e-6) {
        this.cameraAim.copy(cameraAim);
      }
      this.camera.lookAt(this.cameraAim);
      this.camera.rotateZ(LIGHT_OVERVIEW_ROLL);
      const targetFov = THREE.MathUtils.radToDeg(
        2 * Math.atan(framing.span / (2 * distance)),
      );
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        targetFov,
        cameraBlend,
      );
      if (Math.abs(this.camera.fov - targetFov) < 1e-4) {
        this.camera.fov = targetFov;
      }
      this.cameraInitialized = true;
    }
    const fog = this.scene.fog as THREE.Fog;
    // The camera position is damped after its target distance changes. Anchor
    // fog to the rendered camera, or entry puts the array behind the far plane
    // until the camera catches up (a brief white wash that exit never showed).
    const renderedDistance = this.camera.position.distanceTo(this.cameraAim);
    fog.near = renderedDistance + 3;
    fog.far = renderedDistance + 25;
    fog.color.copy(OVERVIEW_MIST);
    (this.scene.background as THREE.Color).copy(OVERVIEW_MIST);
    // Unified studio rig across overview and detail: soft warm key (with real
    // soft shadows) + sky/bounce hemisphere + front-right fill + warm slot strip.
    this.scene.environmentIntensity = 0.18;
    this.studioSkyLight.intensity = 0.22;
    this.fillLight.color.copy(LIGHT_OVERVIEW_FILL_COLOR);
    this.fillLight.intensity = 0.07;
    this.fillLight.position.copy(LIGHT_OVERVIEW_FILL_POSITION);
    this.overviewTrackOffset.value.set(trackX, this.rail.value + entryZ);
    const bar = this.slotUnderlights.barPosition;
    const stripX = (bar.lane - 2) * COLUMN_SPACING - trackX;
    const stripZ =
      (bar.row - 15.5) * ROW_SPACING +
      entryZ +
      this.rail.value +
      OVERVIEW_RECT_LIGHT_Z_OFFSET;
    const stripGain =
      this.slotUnderlights.barIntensity * this.overviewSlotLightGain.value;
    this.overviewAreaLight.position.set(stripX, OVERVIEW_RECT_LIGHT_Y, stripZ);
    this.overviewAreaLight.intensity =
      OVERVIEW_RECT_LIGHT_INTENSITY * stripGain * (1 - detail);
    const extractedFromSlot = THREE.MathUtils.smoothstep(
      this.lift.value,
      OVERVIEW_LIFT + 0.15,
      OVERVIEW_LIFT + 1.85,
    );
    this.overviewSelectedSlotProximity.value =
      1 - Math.max(extractedFromSlot, detail);
    this.overviewLightStrip.position.set(stripX, -4.52, stripZ);
    this.overviewLightStripMaterial.opacity = Math.min(1, 0.95 * stripGain);
    this.overviewLightStrip.visible = stripGain > 0.005;
    this.light.color.copy(LIGHT_OVERVIEW_KEY_COLOR);
    this.light.castShadow = true;
    this.light.shadow.radius = 4;
    this.light.angle = 0.56;
    this.light.penumbra = 0.96;
    this.light.decay = 1.62;
    this.light.position.copy(LIGHT_OVERVIEW_KEY_POSITION);
    this.light.target.position.copy(LIGHT_OVERVIEW_KEY_TARGET);
    this.light.intensity = 205;
    this.overviewBottomLight.value = 1;

    if (this.fixedDetailCameraHeld && this.fixedDetailCameraPose) {
      this.applyFixedDetailProjection(cameraMove);
    } else {
      this.camera.updateProjectionMatrix();
      // Keep the light-overview calibration in the projection matrix so camera
      // picking, coverage and WebGL rendering share one optical transform.
      this.camera.projectionMatrix.elements[0] *=
        LIGHT_OVERVIEW_HORIZONTAL_SCALE;
      this.camera.projectionMatrix.elements[5] *= LIGHT_OVERVIEW_VERTICAL_SCALE;
      this.camera.projectionMatrixInverse
        .copy(this.camera.projectionMatrix)
        .invert();
      this.camera.updateMatrixWorld();
      this.overviewCameraReady = true;
      if (this.fixedDetailCameraHeld && !this.fixedDetailCameraPose) {
        this.captureFixedDetailCameraEntry();
      }
    }
    // Build and compact the instance set only after the actual damped camera
    // is final for this frame. Picking uses the same packed index-to-cell map.
    this.cells = this.visibility.update(
      this.camera,
      fog.far,
      trackX,
      entryZ + this.rail.value,
      false,
    );
    this.hiddenCellKeys.clear();
    for (const o of this.outgoing) this.hiddenCellKeys.add(cellKey(o.cell));
    this.hiddenCellKeys.add(cellKey(this.selectedCell));
    this.drawnCells.length = 0;
    this.hoverBadgeInstance.value = -1;
    this.drawCoverage.update(this.camera, fog.far + 1.5);
    this.shadowCoverage?.begin();
    const primaryInstance = this.instances[0];
    if (primaryInstance) {
      this.matrixUpdates ??= new InstanceUpdates(
        primaryInstance.instanceMatrix,
      );
    }
    if (this.slotLightAttribute) {
      this.slotLightUpdates ??= new InstanceUpdates(this.slotLightAttribute);
    }
    if (this.neighborLightAttribute) {
      this.neighborLightUpdates ??= new InstanceUpdates(
        this.neighborLightAttribute,
      );
    }
    if (this.lateralLightAttribute) {
      this.lateralLightUpdates ??= new InstanceUpdates(
        this.lateralLightAttribute,
      );
    }
    if (this.topRailLightAttribute) {
      this.topRailLightUpdates ??= new InstanceUpdates(
        this.topRailLightAttribute,
      );
    }
    let hoverStickerFound = false;
    for (const cell of this.cells) {
      const { row, lane } = cell;
      if (this.hiddenCellKeys.has(cellKey(cell))) continue;
      const x = (lane - 2) * COLUMN_SPACING - trackX;
      const y = -4.6 + field(row, lane) + hoverLift(cell);
      const z = (row - 15.5) * ROW_SPACING + entryZ + this.rail.value;
      if (!this.visibility.intersects(x, y, z)) continue;

      const slope = field(row + 0.5, lane) - field(row - 0.5, lane);
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(slope * 0.024, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.shadowCoverage?.add(this.dummy.matrix);
      if (!this.drawCoverage.contains(x, y, z)) continue;
      const i = this.drawnCells.length;
      if (primaryInstance) this.ensureInstanceCapacity(i + 1);
      this.drawnCells.push(cell);
      if (this.hoverCell && sameCell(cell, this.hoverCell)) {
        this.hoverBadgeInstance.value = i;
        this.drawHoverBadge(fileAtCell(cell, this.coordinateOrigin.row));
      }
      if (this.hoverStickerCell && sameCell(cell, this.hoverStickerCell)) {
        hoverStickerFound = true;
        this.hoverStickerMatrix.copy(this.dummy.matrix);
      }
      this.slotLightUpdates?.scalar(i, this.slotUnderlights.directFor(cell));
      this.neighborLightUpdates?.scalar(
        i,
        this.slotUnderlights.reflectionFor(cell),
      );
      this.lateralLightUpdates?.scalar(
        i,
        this.slotUnderlights.lateralFor(cell),
      );
      this.topRailLightUpdates?.scalar(
        i,
        this.slotUnderlights.topRailFor(cell),
      );
      this.matrixUpdates?.set(i * 16, this.dummy.matrix.elements);
    }
    const countChanged = primaryInstance
      ? primaryInstance.count !== this.drawnCells.length
      : false;
    const visibleMatricesChanged = this.matrixUpdates?.commit() ?? false;
    const shadowMatricesChanged = this.shadowCoverage?.commit() ?? false;
    const slotLightsChanged = this.slotLightUpdates?.commit() ?? false;
    const neighborLightsChanged = this.neighborLightUpdates?.commit() ?? false;
    const lateralLightsChanged = this.lateralLightUpdates?.commit() ?? false;
    const topRailLightsChanged = this.topRailLightUpdates?.commit() ?? false;
    const geometryChanged = visibleMatricesChanged || shadowMatricesChanged;
    const matricesChanged =
      geometryChanged ||
      slotLightsChanged ||
      neighborLightsChanged ||
      lateralLightsChanged ||
      topRailLightsChanged;
    for (const inst of this.instances) {
      inst.count = this.drawnCells.length;
    }
    if (
      this.hoverStickerGroup &&
      this.hoverStickerFrontMat &&
      this.hoverStickerShadowMat
    ) {
      if (this.hoverStickerCell && hoverStickerFound) {
        const hoverFile = fileAtCell(
          this.hoverStickerCell,
          this.coordinateOrigin.row,
        );
        this.bindHoverStickerTexture(hoverFile);
        const direct = THREE.MathUtils.clamp(
          this.slotUnderlights.directFor(this.hoverStickerCell) *
            this.overviewSlotLightGain.value,
          0,
          1,
        );
        const liftBlend = THREE.MathUtils.smoothstep(
          hoverLift(this.hoverStickerCell),
          0.03,
          HOVER_PREVIEW_LIFT * 0.75,
        );
        this.hoverStickerMatrix.decompose(
          this.hoverStickerPos,
          this.hoverStickerQuat,
          this.hoverStickerScale,
        );
        this.hoverStickerGroup.position
          .set(STICKER_LOCAL_X, STICKER_LOCAL_Y, this.glassFrontZ + STICKER_PLATE_LIFT)
          .applyMatrix4(this.hoverStickerMatrix);
        this.hoverStickerGroup.quaternion.copy(this.hoverStickerQuat);
        this.hoverStickerGroup.rotateZ(STICKER_TILT_Z);
        this.hoverStickerFrontMat.color
          .copy(HOVER_STICKER_SHADED_COLOR)
          .lerp(HOVER_STICKER_LIT_COLOR, direct);
        this.hoverStickerFrontMat.emissive
          .copy(HOVER_STICKER_SHADED_EMISSIVE)
          .lerp(HOVER_STICKER_LIT_EMISSIVE, direct);
        this.hoverStickerFrontMat.emissiveIntensity = THREE.MathUtils.lerp(
          0.1,
          0.5,
          direct,
        );
        this.hoverStickerFrontMat.opacity = liftBlend;
        this.hoverStickerShadowMat.opacity =
          0.52 * liftBlend * THREE.MathUtils.lerp(0.55, 1, direct);
        this.hoverStickerGroup.visible = liftBlend > 0.01;
      } else {
        this.hoverStickerGroup.visible = false;
      }
    }
    // Picking uses only the first instanced surface. The other batches disable
    // renderer culling and do not need an O(n) bound recomputation each frame.
    if (
      primaryInstance &&
      (geometryChanged || countChanged || !primaryInstance.boundingSphere)
    ) {
      primaryInstance.computeBoundingSphere();
    }
    let neighborTop = -Infinity;
    const lane = selectedLane,
      row = selectedRow;
    for (let r = row - 5; r <= row + 5; r++) {
      if (r !== row)
        neighborTop = Math.max(neighborTop, -4.6 + field(r, lane) + 3.76);
    }
    for (const o of this.outgoing) {
      if (o.cell.lane === lane && Math.abs(o.cell.row - row) <= 5) {
        neighborTop = Math.max(neighborTop, o.group.position.y + 3.76);
      }
    }
    this.clearance = this.model.position.y - selectedVisualLift - neighborTop;
    const detailSettled =
      Boolean(this.targetDetail) && detail > 0.9 && this.pulseGain < 0.01;
    this.canInspect = detailSettled && this.clearance > 0.3;
    const fixedDetailRaised =
      detailSettled &&
      this.fixedDetailLiftTarget !== undefined &&
      this.lift.value >= this.fixedDetailLiftTarget - 0.04;
    const inspectionReady = fixedDetailRaised && this.canInspect;
    let inspectionState = "preview";
    if (this.returnY !== null) inspectionState = "aligning";
    else if (inspectionReady) inspectionState = "ready";
    else if (fixedDetailRaised) inspectionState = "raised";
    else if (this.targetDetail) inspectionState = "lifting";
    if (inspectionState !== this.lastInspectionState) {
      this.lastInspectionState = inspectionState;
      this.container.dataset.inspection = inspectionState;
    }
    if (
      this.fixedDetailCameraHeld &&
      !this.targetDetail &&
      detail < 0.01 &&
      this.returnY === null &&
      this.detailCameraMove.value < 0.001 &&
      Math.abs(this.detailCameraMove.velocity) < 0.002 &&
      this.detailCameraAimMove.value < 0.001 &&
      Math.abs(this.detailCameraAimMove.velocity) < 0.002 &&
      Math.abs(this.lift.value - OVERVIEW_LIFT) < 0.02
    ) {
      this.fixedDetailCameraHeld = false;
      this.fixedDetailCameraPose = undefined;
      this.fixedDetailTargetPose = undefined;
      this.fixedDetailLiftTarget = undefined;
      this.fixedDetailCameraBasis = undefined;
      this.detailCameraMove.value = 0;
      this.detailCameraMove.velocity = 0;
      this.detailCameraAimMove.value = 0;
      this.detailCameraAimMove.velocity = 0;
    }
    const bokehUniforms = this.bokeh.uniforms as Record<
      string,
      { value: number }
    >;
    if (fixedPose) {
      bokehUniforms.focus.value = THREE.MathUtils.lerp(
        fixedPose.focusDepth,
        this.fixedDetailTargetPose?.focusDepth ?? fixedPose.focusDepth,
        cameraMove,
      );
    } else {
      const focalPoint = this.focalPointScratch
        .copy(this.model.position)
        .setY(this.model.position.y + LIGHT_OVERVIEW_FOCUS_HEIGHT)
        .applyMatrix4(this.camera.matrixWorldInverse);
      bokehUniforms.focus.value = -focalPoint.z;
    }
    this.lastRenderedFocusDepth = bokehUniforms.focus.value;
    const nextBokehEnabled = this.shouldEnableBokeh();
    if (this.bokeh.enabled !== nextBokehEnabled) {
      this.bokeh.enabled = nextBokehEnabled;
      this.container.dataset.renderQuality = JSON.stringify({
        ...this.readRenderMetrics(),
        depthOfField: nextBokehEnabled ? this.quality.depthOfField : 0,
      });
      this.renderState.invalidate();
    }
    bokehUniforms.aperture.value =
      ((OVERVIEW_APERTURE - LIGHT_OVERVIEW_APERTURE_DELTA) *
        this.quality.depthOfField) /
      100;
    const transmission = this.transmissionScale;
    if (this.renderer.transmissionResolutionScale !== transmission) {
      this.renderer.transmissionResolutionScale = transmission;
      this.container.dataset.renderQuality = JSON.stringify({
        ...this.readRenderMetrics(),
        transmission,
      });
      this.renderState.invalidate();
    }
    this.renderer.info.reset();
    // Keep all simulation and picking current. Reuse the composited canvas only
    // when its actual inputs are identical, including late textures and materials.
    const state = this.renderState;
    this.scene.updateMatrixWorld();
    // A changed instance buffer already proves the image changed. Avoid a
    // material/matrix snapshot on those busy frames; capture when it settles.
    if (matricesChanged) {
      state.invalidate();
    } else {
      state.begin();
      state.add(
        this.overviewBadgeUniform.value?.uuid ?? "",
        this.overviewBadgeUniform.value?.version ?? 0,
        this.hoverBadgeInstance.value,
        this.hoverBadgeUniform.value?.uuid ?? "",
        this.hoverBadgeUniform.value?.version ?? 0,
        Number(this.shadowStale),
        Number(this.bokeh.enabled),
      );
      state.floats(
        this.overviewBadgeHeightFraction.value,
        this.overviewBadgeHeadingEdge.value,
      );
      state.floats(
        ...this.camera.projectionMatrix.elements,
        ...this.camera.matrixWorldInverse.elements,
        ...this.camera.position.toArray(),
        fog.near,
        fog.far,
        this.studioSkyLight.intensity,
        this.scene.environmentIntensity,
        this.overviewTrackOffset.value.x,
        this.overviewTrackOffset.value.y,
        this.overviewSlotLightGain.value,
        this.overviewSelectedSlotProximity.value,
        ...this.overviewAreaLight.position.toArray(),
        this.overviewAreaLight.intensity,
        this.intro?.elapsed ?? -1,
        ...this.light.position.toArray(),
        this.light.intensity,
        ...this.light.target.position.toArray(),
        ...this.fillLight.position.toArray(),
        this.fillLight.intensity,
        bokehUniforms.focus.value,
        bokehUniforms.aperture.value,
      );
      for (const light of this.overviewSlotLightsUniform.value) {
        state.floats(light.x, light.y, light.z);
      }
      this.scene.traverse((object) => {
        state.add(object.id, Number(object.visible));
        if (!(object instanceof THREE.Mesh)) return;
        object.modelViewMatrix.multiplyMatrices(
          this.camera.matrixWorldInverse,
          object.matrixWorld,
        );
        object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
        state.floats(
          ...object.modelViewMatrix.elements,
          ...object.normalMatrix.elements,
          ...object.matrixWorld.elements,
        );
        const mat = object.material as THREE.MeshPhysicalMaterial;
        // Three increments material.version for its own double-sided transmission
        // passes. Track application-controlled inputs, not that render-side counter.
        state.add(
          object.geometry.id,
          mat.uuid,
          mat.map?.uuid,
          mat.map?.version ?? 0,
        );
        state.floats(
          mat.opacity,
          mat.roughness,
          mat.metalness,
          mat.transmission,
          mat.thickness,
          mat.attenuationDistance,
          mat.clearcoat,
          mat.clearcoatRoughness,
          mat.color.r,
          mat.color.g,
          mat.color.b,
          mat.emissiveIntensity ?? 0,
          mat.emissive?.r ?? 0,
          mat.emissive?.g ?? 0,
          mat.emissive?.b ?? 0,
          mat.attenuationColor?.r ?? 0,
          mat.attenuationColor?.g ?? 0,
          mat.attenuationColor?.b ?? 0,
        );
        for (const name of ["appearance", "glassClarity"])
          state.floats(object.userData[name]?.value ?? 0);
        const mistDissolve = object.userData.mistDissolve as
          MistDissolveShaderUniforms | undefined;
        const stickerPeel = object.userData.stickerShadowPeel as
          { value: THREE.Vector4 } | undefined;
        state.floats(
          mistDissolve?.uActive.value ?? 0,
          mistDissolve?.uProgress.value ?? 0,
          mistDissolve?.uHiding.value ?? 0,
          mistDissolve?.uModeSwitch.value ?? 0,
          // 四角必须全部进入签名：只取最大值会让非右下角的 0~0.24 段运动不触发
          // 重绘，画面停在旧帧。
          stickerPeel?.value.x ?? 0,
          stickerPeel?.value.y ?? 0,
          stickerPeel?.value.z ?? 0,
          stickerPeel?.value.w ?? 0,
        );
        const slotLight = object.userData.slotLight as
          OverviewSlotLightUniforms | undefined;
        state.floats(
          slotLight?.direct.value ?? 0,
          slotLight?.reflection.value ?? 0,
          slotLight?.lateral.value ?? 0,
          slotLight?.topRail.value ?? 0,
        );
        if (object instanceof THREE.InstancedMesh)
          state.add(
            object.count,
            object.instanceMatrix.version,
            this.slotLightAttribute?.version ?? 0,
            this.neighborLightAttribute?.version ?? 0,
            this.lateralLightAttribute?.version ?? 0,
            this.topRailLightAttribute?.version ?? 0,
          );
      });
      if (!state.end()) {
        this.reusedFrames++;
        return;
      }
    }
    this.renderedFrames++;
    const shadow = this.shadowState;
    shadow.begin();
    shadow.add(
      this.light.shadow.mapSize.x,
      Number(this.renderer.shadowMap.enabled),
    );
    shadow.floats(
      ...this.light.matrixWorld.elements,
      ...this.light.target.matrixWorld.elements,
    );
    this.scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
      shadow.add(object.id, object.geometry.id);
      shadow.floats(...object.matrixWorld.elements);
      if (object instanceof THREE.InstancedMesh)
        shadow.add(object.count, object.instanceMatrix.version);
    });
    // While breathing or rapidly sliding/returning outgoing cards, update shadows
    // every other rendered frame while tracking staleness for exact reuse.
    const shadowChanged = shadow.end() || this.light.shadow.needsUpdate;
    const throttleShadow =
      idle ||
      this.holdingArchive ||
      this.archiveMomentum !== null ||
      this.outgoing.length > 0;
    const shouldUpdateShadow =
      (shadowChanged || this.shadowStale) &&
      (!throttleShadow || this.shadowTick++ % 2 === 0);
    this.renderer.shadowMap.needsUpdate = shouldUpdateShadow;
    this.shadowStale = shouldUpdateShadow
      ? false
      : this.shadowStale || shadowChanged;
    if (this.superPerformance) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
  /** 0 while the array is driven by input, approaches 1 once it only breathes. */
  get idleAmount() {
    return this.idleGain;
  }
  /** True while the array is in its settled breathing state. */
  get isIdle() {
    return this.idleNow;
  }
  /** Cheap wake signal for the frame governor and the idle settle timer. */
  wake() {
    this.lastInteraction = this.clock;
  }
  get detailVisibility() {
    return ease((this.detail - 0.25) / 0.55);
  }
  getStats() {
    this.model.updateMatrixWorld(true);
    const activeSlotLights = this.slotUnderlights.activeLights();
    const project = (x: number, y: number, z: number) => {
      const p = this.model
        .localToWorld(new THREE.Vector3(x, y, z))
        .project(this.camera);
      return [
        Math.round(((p.x + 1) * this.container.clientWidth) / 2),
        Math.round(((1 - p.y) * this.container.clientHeight) / 2),
      ];
    };
    return {
      cardPlaneZ: this.cardPlaneZ,
      topLeft: project(-2.5, 3.7, 0),
      topRight: project(2.5, 3.7, 0),
      labelTopLeft: project(-1.855, 3.27, 0.255),
      labelBottomLeft: project(-1.855, 2.81, 0.255),
      modelPosition: this.model.position
        .toArray()
        .map((v) => Math.round(v * 10000) / 10000),
      cameraPosition: this.camera.position
        .toArray()
        .map((v) => Math.round(v * 10000) / 10000),
      fieldOfView: this.camera.fov,
      loaded: this.loaded,
      drawCalls: this.renderer.info.render.calls,
      renderedFrames: this.renderedFrames,
      reusedFrames: this.reusedFrames,
      superPerformance: this.superPerformance,
      triangles: this.renderer.info.render.triangles,
      archiveCount: this.drawnCells.length,
      archiveCandidates: this.cells.length,
      archiveCulled: this.cells.length - this.drawnCells.length,
      archiveCapacity: this.instanceCapacity,
      returningFiles: this.outgoing.length,
      selectionPhase: this.pendingPulse
        ? "lifting"
        : this.pulses.length || this.frozenPulses.length
          ? "wave"
          : "settled",
      pendingPulse: this.pendingPulse ? { ...this.pendingPulse } : null,
      pulses: this.pulses.map((pulse) => ({ ...pulse })),
      frozenPulses: this.frozenPulses.map((pulse) => ({ ...pulse })),
      selectedSlot: this.selectedSlot,
      selectedLane: fileLocation(this.selectedIndex).lane,
      selectedCell: { ...this.selectedCell },
      hoverCell: this.hoverCell ? { ...this.hoverCell } : null,
      hoverLifts: Object.fromEntries(this.hoverLifts),
      dragTrack: this.dragTrack ? { ...this.dragTrack } : null,
      archiveMomentum: this.archiveMomentum
        ? {
            phase: this.archiveMomentum.motion.phase,
            value: this.archiveMomentum.motion.value,
            velocity: this.archiveMomentum.motion.velocity,
          }
        : null,
      holdingArchive: this.holdingArchive,
      dragProjection: this.dragProjection(),
      dragMapping: this.archiveDrag.active ? "free" : null,
      coordinateOrigin: { ...this.coordinateOrigin },
      poolBounds: {
        minLane: Math.min(...this.cells.map((c) => c.lane)),
        maxLane: Math.max(...this.cells.map((c) => c.lane)),
        minRow: Math.min(...this.cells.map((c) => c.row)),
        maxRow: Math.max(...this.cells.map((c) => c.row)),
      },
      laneFocus: this.laneFocus.value,
      columnCamera: this.columnCamera.value,
      rotation: this.rotation,
      clearance: this.clearance,
      canInspect: this.canInspect,
      detailCardOpen: this.detailDrawerOpen,
      detailDrawer: Math.round(this.detailDrawer.value * 1000) / 1000,
      detailHover: this.detailHoveredHotspot,
      detailToggle: {
        state: this.detailToggleMode,
        visibility: Math.round(this.detailToggleVisibility * 1000) / 1000,
        switching: this.detailToggleSwitchActive,
      },
      returnPhase: this.returnY !== null ? "aligning" : "lowering",
      extraction: Math.round(this.lift.value * 1000) / 1000,
      appearance:
        Math.round(ease(this.lift.value / OVERVIEW_LIFT) * 1000) / 1000,
      cameraDetail: Math.round(this.detail * 1000) / 1000,
      idleGain: this.idleGain,
      cameraDistance: this.camera.position.distanceTo(this.cameraAim),
      cameraNear: this.camera.near,
      cameraFar: this.camera.far,
      fogNear: (this.scene.fog as THREE.Fog).near,
      fogFar: (this.scene.fog as THREE.Fog).far,
      overviewSlotLights: {
        activeGain: this.overviewSlotLightGain.value,
        baseline: "constant" as const,
        maximum: MAX_OVERVIEW_SLOT_LIGHTS,
        bar: { ...this.slotUnderlights.barPosition },
        selected: {
          cell: { ...this.selectedCell },
          intensity: this.slotUnderlights.selectedIntensity,
        },
        active: activeSlotLights.map((light) => ({
          cell: light.cell,
          intensity: light.intensity,
          position: [
            (light.cell.lane - 2) * COLUMN_SPACING -
              this.overviewTrackOffset.value.x,
            OVERVIEW_RECT_LIGHT_Y,
            (light.cell.row - 15.5) * ROW_SPACING +
              this.overviewTrackOffset.value.y,
          ],
        })),
        sameLane: Array.from({ length: 7 }, (_, index) => {
          const offset = index - 3;
          const cell = {
            lane: this.selectedCell.lane,
            row: this.selectedCell.row + offset,
          };
          return {
            offset,
            direct:
              Math.round(this.slotUnderlights.directFor(cell) * 10000) / 10000,
            reflection:
              Math.round(this.slotUnderlights.reflectionFor(cell) * 10000) /
              10000,
          };
        }),
        lateralNeighbors: Array.from({ length: 10 }, (_, index) => {
          const laneOffset = index % 2 === 0 ? -1 : 1;
          const rowOffset = Math.floor(index / 2) - 2;
          const cell = {
            lane: this.selectedCell.lane + laneOffset,
            row: this.selectedCell.row + rowOffset,
          };
          return {
            laneOffset,
            rowOffset,
            reflection:
              Math.round(this.slotUnderlights.reflectionFor(cell) * 10000) /
              10000,
            lateral:
              Math.round(this.slotUnderlights.lateralFor(cell) * 10000) / 10000,
            topRail:
              Math.round(this.slotUnderlights.topRailFor(cell) * 10000) / 10000,
          };
        }),
      },
      overviewAreaLight: {
        slot: this.selectedSlot,
        selectedCell: { ...this.selectedCell },
        selectedIntensity: this.slotUnderlights.selectedIntensity,
        position: this.overviewAreaLight.position
          .toArray()
          .map((value) => Math.round(value * 10000) / 10000),
        intensity: Math.round(this.overviewAreaLight.intensity * 10000) / 10000,
        width: this.overviewAreaLight.width,
        height: this.overviewAreaLight.height,
      },
      returningAppearance: this.outgoing.map((o) => ({
        slot: o.slot,
        clarity: o.group.children.find(
          (child) =>
            surfaceRole(child.userData.surface as string) === REVEAL_ROLE,
        )?.userData.glassClarity?.value,
        cell: { ...o.cell },
        lift: o.lift.value,
        quality: ease(o.lift.value / OVERVIEW_LIFT),
        rotation: o.group.rotation.y,
        worldY: o.group.position.y,
        phase: o.returnY !== null ? "aligning" : "lowering",
      })),
      rail: Math.round(this.rail.value * 1000) / 1000,
      intro: this.intro
        ? {
            elapsed: Math.round(this.intro.elapsed * 1000) / 1000,
            fullLiftUnlocked: this.intro.fullLiftUnlocked,
          }
        : null,
    };
  }
}
