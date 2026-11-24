import * as THREE from "three";
import { ArchiveVisibility } from "./archive-visibility";
import { ArchiveDrawCoverage, ArchiveShadowCoverage } from "./archive-draw-coverage";
import { InstanceUpdates } from "./instance-updates";
import { RenderState } from "./render-state";
import { SharedDepthAO, SharedDepthBokeh } from "./shared-depth";
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
  normalizeQuality,
  OVERVIEW_TRANSMISSION_LIMIT,
  type RenderQuality,
} from "./render-quality";
import { applyTextureQuality, resizeQuality } from "./quality-renderer";
import { CardAppearance } from "./appearance";
import { configureInternalOptics } from "./internal-optics";
import {
  ARRAY_ROLES,
  CARD_ROLE,
  REVEAL_ROLE,
  surfaceName,
  surfaceRole,
  type SurfaceRole,
} from "./archive-surfaces";
import {
  ArchiveSlotUnderlights,
  MAX_OVERVIEW_SLOT_LIGHTS,
} from "./archive-slot-underlight";
import { fileLocation, records, type ArchiveCardStats } from "./data";
import { modelProvider, type ModelProvider } from "./model-provider";
import { drawCode39Barcode } from "./code39";
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
import { ArchiveDrag, ArchivePlaneMomentum, type DragAxis, type DragProjection, type DragPosition } from "./archive-drag";
import { assetUrl as publicAsset } from "./asset-url";
import { fullMotion, reducedMotion, type MotionPreferences } from "./motion-preferences";
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

function glslFloat(value: number) {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
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
const HOVER_BADGE_HEIGHT = 192;
const BURN_STAMP_RIGHT = OVERVIEW_BADGE_WIDTH - 90;
const BURN_STAMP_WIDTH = 525;
const BURN_STAMP_GAP = 80;
const BURN_STAMP_TOP = 156;
const BURN_STAMP_HEIGHT = 96;

/** 卡面版式（对应设计稿 card-A.png 的 2000 × 1480）。
 *  新模型把整张卡面印在贴纸上，运行时按档案重绘，所以这里的坐标就是设计稿坐标。 */
const CARD_WIDTH = 2000;
const CARD_HEIGHT = 1480;

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
const LIGHT_DETAIL_KEY_POSITION = new THREE.Vector3(-21, 20, 14);
const LIGHT_DETAIL_KEY_TARGET = new THREE.Vector3(-1.5, 0.8, -2.5);
const LIGHT_DETAIL_KEY_INTENSITY = 290;
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
const OVERVIEW_FOCUS_HEIGHT = 2;
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
const DETAIL_APERTURE = 0.0008;
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
  glass: 0.20,
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
  while (end > 1 && context.measureText(text.slice(0, end) + "…").width > maxWidth)
    end--;
  return end > 1 ? text.slice(0, end).trimEnd() + "…" : "…";
}

/** Shrink a canvas font until the text fits, then truncate if the floor is
 *  reached. Returns the text and the final size so the caller can draw it. */
function fitCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  size: number,
  family: string,
  weight = "",
) {
  let current = size;
  const set = () => {
    context.font = `${weight ? weight + " " : ""}${current}px ${family}`;
  };
  set();
  while (current > 10 && context.measureText(value).width > maxWidth) {
    current -= 2;
    set();
  }
  let text = value;
  if (context.measureText(text).width > maxWidth) {
    let end = text.length;
    while (end > 1 && context.measureText(text.slice(0, end) + "…").width > maxWidth)
      end--;
    text = end > 1 ? text.slice(0, end).trimEnd() + "…" : "…";
  }
  return { text, size: current };
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
    ease((delta + INTRO_WAVE_WIDTH * 1.65) / (INTRO_WAVE_WIDTH * 1.85)) *
    enter;
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
  revealImmediately() { this.reveal = this.targetReveal; }
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
    this.cameraInitialized = false;
    this.idleGain = 0;
    this.lastInteraction = this.clock;
    this.renderState.invalidate();
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
    if (!skipBadgeRefresh && this.pendingOverviewBadgeRefresh) {
      this.pendingOverviewBadgeRefresh = false;
      this.drawOverviewBadge(this.selectedIndex);
    }
    this.renderState.invalidate();
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
          1,
        ),
      );
      this.appearance.setClarity(warmOutgoing, 0);
      this.scene.add(warmOutgoing);
      this.outgoing.push({
        group: warmOutgoing,
        slot: fileAtCell(warmCell),
        cell: warmCell,
        lift: { value: OVERVIEW_LIFT * 0.5, velocity: 0 },
        returnY: null,
      });
    }
    try {
      this.update(performance.now() / 1000);
    } finally {
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
    this.inputEvents.abort();
    this.cancelPointer();
    this.cancelDetailSurfacePreparation();
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
    this.overviewBadgeUniform.value = undefined;
    this.hoverBadgeUniform.value?.dispose();
    this.hoverBadgeUniform.value = undefined;
    for (const image of this.modelProviderImages.values()) image.onload = null;
    this.modelProviderImages.clear();
    this.cardTexture?.dispose();
    this.cardTexture = undefined;
    this.cardCanvas = undefined;
    this.appearance.disposeSources();
    this.model.clear();
    this.outgoing = [];
    this.instances = [];
    this.assemblyTemplate?.then(disposeThreeTree).catch(() => {});
    this.assemblyTemplate = undefined;
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
      const original = (inst.userData.fullMaterial ??= inst.material) as THREE.MeshPhysicalMaterial;
      if (enabled && !inst.userData.fastMaterial) {
        const fast = original.clone();
        fast.onBeforeCompile = original.onBeforeCompile;
        fast.customProgramCacheKey = original.customProgramCacheKey.bind(original);
        fast.transmission = 0;
        fast.clearcoat = 0;
        fast.roughness = Math.max(.45, original.roughness);
        inst.userData.fastMaterial = fast;
      }
      inst.material = enabled ? inst.userData.fastMaterial : original;
      inst.visible = !enabled || surfaceRole(surfaceName(original.name)) !== "fastener";
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
    // The authored top seal uses scene lighting plus an overview-only minimum
    // fill. Install it on each final material because Three material clones do
    // not retain onBeforeCompile.
    if (role === "seal") {
      installOverviewSealFill(
        material,
        bottomLight,
        !instanced,
      );
      return undefined;
    }
    const flag =
      mode === "selected"
        ? "archiveSelectedUnderlight"
        : "archiveNeighborUnderlight";
    if (material.userData[flag]) {
      return material.userData.archiveSlotLightValues as
        | OverviewSlotLightUniforms
        | undefined;
    }
    material.userData[flag] = true;
    const before = material.onBeforeCompile;
    const cache = material.customProgramCacheKey.bind(material);
    const badgeSurface = surfaceName(material.name) === "REF_Glass";
    const hoverBadge = badgeSurface && instanced ? {
      instance: this.hoverBadgeInstance,
      heightFraction: HOVER_BADGE_HEIGHT / OVERVIEW_BADGE_HEIGHT,
    } : undefined;
    const badge = hoverBadge
      ? this.hoverBadgeUniform
      : badgeSurface && mode === "selected" ? this.overviewBadgeUniform : undefined;
    const slotStrength = UNDERLIGHT_SLOT_STRENGTH[role] ?? 0.012;
    const baseStrength = UNDERLIGHT_BASE_STRENGTH + slotStrength;
    const activeStrength = UNDERLIGHT_ACTIVE_STRENGTH[role] ?? 0.06;
    const endStrength = UNDERLIGHT_END_STRENGTH[role] ?? 0;
    const reflectionStrength =
      UNDERLIGHT_REFLECTION_STRENGTH[role] ?? 0;
    const lateralStrength = UNDERLIGHT_LATERAL_STRENGTH[role] ?? 0;
    // The acrylic tube is an open perimeter. Its visible end cap starts beyond
    // the ordinary lower strip, so give that narrow wall a separate active-only
    // coupling while keeping the constant floor strip at its existing width.
    const activeOuterX =
      role === "acrylic" || role === "glass" || role === "frame" ? 2.46 : 2.36;
    const activeHeight = role === "acrylic"
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
    const endHeight = role === "glass"
      ? "(0.85 + 0.15 * archiveBottomLip) * (1.0 - smoothstep(0.55, 0.82, archiveLocalY))"
      : role === "acrylic" || role === "frame" || role === "engrave" || role === "shell"
        ? "(0.85 + 0.15 * archiveBottomLip) * (1.0 - smoothstep(0.56, 0.84, archiveLocalY))"
        : "0.0";
    const reflectionZoneStart =
      role === "glass" || role === "shell" || role === "card"
        ? 2.26
        : role === "acrylic"
          ? 2.20
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
          `totalEmissiveRadiance += archiveWarmWhite * archiveBottomLight * archiveDefaultGlow * ${glslFloat(baseStrength)};\n` +
          `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotLightGain * archiveActiveGlow * ${glslFloat(activeStrength * 0.75)};\n` +
          `totalEmissiveRadiance += archiveActiveWarmWhite * archiveBottomLight * archiveSlotLightGain * archiveEndGlow * ${glslFloat(endStrength * 0.65)};\n` +
          `totalEmissiveRadiance += archiveReflectionWhite * archiveBottomLight * archiveSlotLightGain * archiveReflectionGlow * ${glslFloat(reflectionStrength * 0.30)};\n` +
          `totalEmissiveRadiance += archiveLateralWhite * archiveBottomLight * archiveSlotLightGain * archiveLateralGlow * ${glslFloat(lateralStrength)};`,
      );
      applyOverviewLook(
        shader,
        role,
        badge,
        hoverBadge,
        badge === this.overviewBadgeUniform ? this.overviewBadgeHeadingEdge : undefined,
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
      const slotLight = this.installOverviewUnderlight(
        material,
        role,
        mode,
      );
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
        | OverviewSlotLightUniforms
        | undefined;
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
    const value = THREE.MathUtils.clamp(
      Number.isFinite(gain) ? gain : 1,
      0,
      2,
    );
    this.overviewSlotLightGain.value = value;
    this.renderState.invalidate();
    return value;
  }
  private appearanceInSlot(lift: number, directLight: number, lightOverview: number) {
    const illuminated = THREE.MathUtils.smoothstep(
      directLight * this.overviewSlotLightGain.value,
      0,
      1,
    );
    return (
      ease(lift / OVERVIEW_LIFT) *
      THREE.MathUtils.lerp(1, illuminated, lightOverview)
    );
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
  private ao: SharedDepthAO;
  private bokeh: BokehPass;
  private readonly overviewBottomLight = { value: 0 };
  private readonly arrayBottomLight = { value: 1 };
  private readonly lightKeyPositionScratch = new THREE.Vector3();
  private readonly lightKeyTargetScratch = new THREE.Vector3();
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
  private model = new THREE.Group();
  private appearance = new CardAppearance();
  private cursor = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
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
  private readonly fixedDetailCamera: boolean;
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
  private intro: { elapsed: number; fullLiftUnlocked: boolean; started: boolean } | null = null;
  private introRelease: { elapsed: number; age: number; cell: ArchiveCell } | null = null;
  private last: number | null = null;
  private pointer = new THREE.Vector2();
  private dragging = false;
  private hoverCell: ArchiveCell | null = null;
  private hoverLifts = new Map<string, number>();
  private archiveDrag = new ArchiveDrag();
  private dragTrack: DragPosition | null = null;
  private navigatingDrag = false;
  private archiveMomentum: { motion: ArchivePlaneMomentum; time: number } | null = null;
  private holdingArchive = false;
  private cancelPointer = () => {};
  private pendingHover: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType'> | null = null;
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
  private pendingOverviewBadgeRefresh = false;
  private readonly hoverBadgeCanvas = document.createElement("canvas");
  private readonly hoverBadgeUniform = { value: undefined as THREE.CanvasTexture | undefined };
  private readonly hoverBadgeInstance = { value: -1 };
  private hoverBadgeIndex = -1;
  private readonly modelProviderImages = new Map<
    ModelProvider,
    HTMLImageElement
  >();
  private cardPhotos = new Map<number, HTMLImageElement | null>();
  private cardPhotoSrc = new Map<number, string>();
  private cardPhotoTokens = new Map<number, number>();
  private cardStatsOverrides = new Map<number, ArchiveCardStats>();
  /** 详情记录卡面按需创建。总览共享 GLB 的烘焙贴图，不参与切档重绘。 */
  private cardCanvas?: HTMLCanvasElement;
  private cardTexture?: THREE.CanvasTexture;
  /** GLB 里烘焙的 REF 卡面，用于 X-001 的参考图原样显示。 */
  private bakedCardImage?: CanvasImageSource;
  private bakedCardTexture?: THREE.Texture;
  private selectedIndex = 0;
  private detailSurfaceIndex = -1;
  private detailSurfaceTarget = -1;
  private detailSurfaceRequest = 0;
  private detailSurfaceFrame: number | null = null;
  private detailSurfacePromise?: Promise<void>;
  private detailSurfaceResolve?: () => void;
  private modelCenterY = 1.85;
  /** 卡面前表面的模型局部 Z；旧模型没有 card 角色时保留旧铭牌平面值。 */
  private cardPlaneZ = 0.255;
  private labelMark = new Image();
  private motion: MotionPreferences = fullMotion();
  private quality = normalizeQuality(undefined);
  private appliedQuality = "";
  private smaa = new SMAAPass();
  private aoKernelSize = 32;
  onSelect?: (index: number, cell?: ArchiveCell) => void;
  /** A second press on the already selected card within the double-press window. */
  onOpen?: (index: number) => void;
  onHover?: (index: number | null) => void;
  onNavigate?: (axis: "row" | "lane", direction: number) => void;
  constructor(
    private container: HTMLElement,
    private readonly selectionPulse = baselineSelectionWave,
    private readonly deferSelectionPulse = false,
    private readonly lightingLook: LightingLook = "baseline",
  ) {
    this.fixedDetailCamera = Boolean(
      container.closest(".web-archive-clean"),
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
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
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.renderState.invalidate();
      this.shadowState.invalidate();
    }, { signal: this.inputEvents.signal });
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
      (this.selectedCell.row - 15.5) * ROW_SPACING + OVERVIEW_RECT_LIGHT_Z_OFFSET,
    );
    this.scene.add(this.overviewAreaLight);
    this.overviewLightStrip.rotation.x = -Math.PI / 2;
    this.overviewLightStrip.position.set(
      (this.selectedCell.lane - 2) * COLUMN_SPACING,
      -4.52,
      (this.selectedCell.row - 15.5) * ROW_SPACING + OVERVIEW_RECT_LIGHT_Z_OFFSET,
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
    this.scene.add(floor);
    this.camera.position.set(-62.26, 35.98, 43.28);
    this.cameraAim.set(-0.5, 1.1, 0.4);
    this.camera.fov = 6.15;
    this.camera.lookAt(this.cameraAim);
    const composerSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
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
    this.ao = new SharedDepthAO(
      this.scene,
      this.camera,
      container.clientWidth,
      container.clientHeight,
    );
    this.ao.kernelRadius = lightingLook === "refined" ? 0.44 : 0.38;
    this.ao.minDistance = 0.001;
    this.ao.maxDistance = 0.09;
    this.composer.addPass(this.ao);
    this.bokeh = new SharedDepthBokeh(this.scene, this.camera, {
      focus: 25,
      aperture: 0.0018,
      maxblur: 0.011,
    }, () => this.ao);
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
    const gltf = await new GLTFLoader().loadAsync(
      assetUrl,
    );
    gltf.scene.updateMatrixWorld(true);
    const normalized = normalizeArchiveScene(gltf.scene);
    this.modelCenterY = normalized.centerY;
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
    for (const mesh of meshes) {
      const geom = mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld)
        .translate(normalized.offset.x, normalized.offset.y, normalized.offset.z)
        .scale(1, 1, 1);
      const source = mesh.material as THREE.MeshStandardMaterial;
      const name = surfaceName(source.name);
      const role = surfaceRole(name);
      if (role === "card") {
        geom.computeBoundingBox();
        if (geom.boundingBox)
          cardPlaneZ = Math.max(cardPlaneZ, geom.boundingBox.max.z);
      }
      if (role === "card" && !this.bakedCardImage && source.map?.image) {
        this.bakedCardImage = source.map.image as CanvasImageSource;
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
        mat.color.set(
          name === "REF_FrameInk" ? WARM.frameInk : WARM.ruler,
        );
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
        role === "shell" || role === "frame" || role === "card" || role === "seal";
      this.model.add(selectedMesh);
      // Keep the readable shell, frame, optical edge, card, seal and fastener
      // layers in tightly packed rows. Sub-millimetre typography stays selected.
      if (!ARRAY_ROLES.has(role)) {
        this.appearance.register(name, mat);
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
        arrayMat.clearcoat = 0.3;
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
      if (role === "card") {
        // 阵列里卡片只有 40 px，纸面高光读不出来，省掉 clearcoat。
        arrayMat.clearcoat = 0;
        arrayMat.roughness = 0.66;
      }
      this.appearance.register(name, mat, arrayMat);
      this.slotLightAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
      this.neighborLightAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
      this.lateralLightAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
      this.topRailLightAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("archiveSlotLight", this.slotLightAttribute);
      geom.setAttribute("archiveSlotReflection", this.neighborLightAttribute);
      geom.setAttribute("archiveSlotLateral", this.lateralLightAttribute);
      geom.setAttribute("archiveSlotTopRail", this.topRailLightAttribute);
      this.installOverviewUnderlight(arrayMat, role, "neighbor", true);
      const inst = new THREE.InstancedMesh(geom, arrayMat, capacity);
      // All surfaces move rigidly together; share the transform buffer on the GPU.
      inst.instanceMatrix = this.instances[0]?.instanceMatrix ?? inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow =
        role === "diffuser" || role === "shell" || role === "frame";
      inst.receiveShadow =
        role === "shell" || role === "frame" || role === "card" || role === "seal";
      inst.frustumCulled = false;
      inst.userData.surfaceRole = role;
      this.instances.push(inst);
      this.scene.add(inst);
    }
    this.cardPlaneZ = Number.isFinite(cardPlaneZ) ? cardPlaneZ : 0.255;
    // 投影来源按角色兜底：旧模型用 diffuser，新模型没有这个件，退到主体或卡面。
    // 旧代码用非空断言取第一个 castShadow 网格，换模型会直接抛错。
    const shadowSource =
      this.instances.find((mesh) => mesh.castShadow) ??
      this.instances.find((mesh) => mesh.userData.surfaceRole === "shell") ??
      this.instances.find((mesh) => mesh.userData.surfaceRole === "card") ??
      this.instances[0];
    if (shadowSource) {
      this.shadowCoverage = new ArchiveShadowCoverage(shadowSource);
      this.scene.add(this.shadowCoverage.mesh);
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
    this.overviewBadgeCanvas.width = OVERVIEW_BADGE_WIDTH * OVERVIEW_BADGE_SCALE;
    this.overviewBadgeCanvas.height = OVERVIEW_BADGE_HEIGHT * OVERVIEW_BADGE_SCALE;
    this.overviewBadgeTexture = new THREE.CanvasTexture(
      this.overviewBadgeCanvas,
    );
    // Hardware sRGB decoding keeps badge filtering in linear light.
    this.overviewBadgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.overviewBadgeTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();
    this.overviewBadgeUniform.value = this.overviewBadgeTexture;
    this.hoverBadgeCanvas.width = OVERVIEW_BADGE_WIDTH * OVERVIEW_BADGE_SCALE;
    this.hoverBadgeCanvas.height = HOVER_BADGE_HEIGHT * OVERVIEW_BADGE_SCALE;
    const hoverBadge = new THREE.CanvasTexture(this.hoverBadgeCanvas);
    hoverBadge.colorSpace = THREE.SRGBColorSpace;
    hoverBadge.anisotropy = this.overviewBadgeTexture.anisotropy;
    this.hoverBadgeUniform.value = hoverBadge;
    if (hasCardSurface) {
      // 总览与离场副本共享 GLB 的烘焙卡面。记录卡面只在打开详情时创建，
      // 避免每次行切换同步分配、重绘并上传 2000 × 1480 画布。
      this.drawLabel(0);
      this.drawOverviewBadge(0);
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
      this.drawOverviewBadge(0);
    }
    this.model.updateMatrixWorld(true);
    this.modelBounds.setFromObject(this.model);
    this.scene.add(this.model);
    this.model.position.copy(this.cellPosition(poolCell(this.selectedSlot)));
    await this.prewarmOutgoingPrograms();
    this.loaded = true;
  }

  private detailCardTexture(index: number) {
    const isBaked = records[index]?.id === "X-001";
    if (isBaked || this.detailSurfaceIndex !== index) return this.bakedCardTexture;
    return this.cardTexture ?? this.bakedCardTexture;
  }
  private cancelDetailSurfacePreparation() {
    this.detailSurfaceRequest++;
    if (this.detailSurfaceFrame !== null) {
      cancelAnimationFrame(this.detailSurfaceFrame);
      this.detailSurfaceFrame = null;
    }
    this.detailSurfaceTarget = -1;
    this.detailSurfacePromise = undefined;
    const resolve = this.detailSurfaceResolve;
    this.detailSurfaceResolve = undefined;
    resolve?.();
  }
  /**
   * The 2K record print is only needed for the 360° viewer assembly.
   * Schedule it off the input frame so the overview keeps sharing the GLB texture.
   */
  private prepareDetailSurface(index: number): Promise<void> {
    const target =
      ((Math.trunc(index) % records.length) + records.length) % records.length;
    if (this.detailSurfaceIndex === target) {
      return Promise.resolve();
    }
    if (
      this.detailSurfacePromise &&
      this.detailSurfaceTarget === target
    ) {
      return this.detailSurfacePromise;
    }
    this.cancelDetailSurfacePreparation();
    const request = this.detailSurfaceRequest;
    this.detailSurfaceTarget = target;
    const promise = new Promise<void>((resolve) => {
      this.detailSurfaceResolve = resolve;
    });
    this.detailSurfacePromise = promise;
    const resolveDetail = () => {
      this.detailSurfaceTarget = -1;
      this.detailSurfacePromise = undefined;
      const resolve = this.detailSurfaceResolve;
      this.detailSurfaceResolve = undefined;
      resolve?.();
    };
    this.detailSurfaceFrame = requestAnimationFrame(() => {
      this.detailSurfaceFrame = null;
      if (request !== this.detailSurfaceRequest) {
        resolveDetail();
        return;
      }
      try {
        if (records[target]?.id !== "X-001" && !this.drawCardFace(target)) {
          throw new Error("detail card canvas is unavailable");
        }
        this.detailSurfaceIndex = target;
      } catch (error) {
        console.warn("[archive] detail card surface preparation failed", error);
      }
      resolveDetail();
    });
    return promise;
  }

  private assemblyTemplate?: Promise<THREE.Group>;
  async createAssemblyModel() {
    await this.prepareDetailSurface(this.selectedIndex);
    this.assemblyTemplate ??= new GLTFLoader()
      .loadAsync(publicAsset("assets/archive-assembly.glb"))
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        return gltf.scene;
      })
      .catch((error) => {
        this.assemblyTemplate = undefined;
        throw error;
      });
    const template = await this.assemblyTemplate;
    const normalized = normalizeArchiveScene(template);
    const model = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = (object.material as THREE.Material).name.replace(
        /\.\d+$/,
        "",
      );
      const mesh = new THREE.Mesh(
        object.geometry
          .clone()
          .applyMatrix4(object.matrixWorld)
          .translate(normalized.offset.x, normalized.offset.y, normalized.offset.z),
        object.material,
      );
      mesh.userData.surface = name;
      mesh.userData.assemblyPart = object.userData.assemblyPart;
      const role = surfaceRole(name);
      mesh.castShadow = role !== "glass" && role !== "acrylic";
      // 只让查看器地面阴影板接收投影，避免薄卡面互相采样产生斜纹。
      mesh.receiveShadow = false;
      model.add(mesh);
      meshes.push(mesh);
    });
    this.appearance.prepare(model);
    this.appearance.apply(model, 1);
    this.appearance.setClarity(model, 0);
    // 拆解模型沿用当前详情的记录卡面。总览仍使用共享烘焙图。
    const cardTexture = this.detailCardTexture(this.selectedIndex);
    if (cardTexture) {
      for (const mesh of meshes) {
        if (surfaceRole(mesh.userData.surface as string) !== CARD_ROLE) continue;
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.map = cardTexture;
        material.needsUpdate = true;
      }
    }
    let texture: THREE.CanvasTexture | undefined;
    if (!this.bakedCardTexture) {
      // 旧模型：卡面印在单独一块铭牌平面上。
      const canvas = document.createElement("canvas");
      canvas.width = this.labelCanvas.width;
      canvas.height = this.labelCanvas.height;
      canvas.getContext("2d")!.drawImage(this.labelCanvas, 0, 0);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.99, 0.46),
        new THREE.MeshBasicMaterial({
          map: texture,
          toneMapped: false,
          transparent: true,
          depthWrite: false,
        }),
      );
      label.position.set(-1.36, 3.04, 0.255);
      label.userData.assemblyPart = "cover";
      model.add(label);
      meshes.push(label);
    }
    const hasReveal = meshes.some(
      (mesh) => surfaceRole(mesh.userData.surface as string) === REVEAL_ROLE,
    );
    return {
      model,
      centerY: normalized.centerY,
      hasReveal,
      setClarity: (value: number) => this.appearance.setClarity(model, value),
      dispose: () => {
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
        texture?.dispose();
      },
    };
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
    const tanHalfFov = Math.tan(
      THREE.MathUtils.degToRad(this.camera.fov) / 2,
    );
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
    if (this.fixedDetailCamera) {
      return OVERVIEW_VISUAL_LIFT * overviewLift;
    }
    return (
      OVERVIEW_VISUAL_LIFT *
      overviewLift *
      (1 - this.detail)
    );
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
    const corners = [
      [min.x, min.y, min.z],
      [min.x, min.y, max.z],
      [min.x, max.y, min.z],
      [min.x, max.y, max.z],
      [max.x, min.y, min.z],
      [max.x, min.y, max.z],
      [max.x, max.y, min.z],
      [max.x, max.y, max.z],
    ] as const;
    const terminalPoints = corners.map(([x, y, z]) =>
      new THREE.Vector3(x, y, z).applyMatrix4(terminalMatrix),
    );
    const anchor = new THREE.Box3()
      .setFromPoints(terminalPoints)
      .getCenter(new THREE.Vector3());
    const targetCameraOffset = new THREE.Vector3(
      -Math.sin(DETAIL_TARGET_AZIMUTH) *
        Math.cos(DETAIL_TARGET_ELEVATION),
      Math.sin(DETAIL_TARGET_ELEVATION),
      Math.cos(DETAIL_TARGET_AZIMUTH) *
        Math.cos(DETAIL_TARGET_ELEVATION),
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
    const frameCenterX = THREE.MathUtils.lerp(
      0.5,
      DETAIL_FRAME_CENTER_X,
      portraitBlend,
    );
    const targetX = frameCenterX * 2 - 1;
    const targetY = 1 - DETAIL_FRAME_CENTER_Y * 2;
    const targetHeight = DETAIL_FRAME_HEIGHT * 2;
    const edgeSafeFrameWidth =
      Math.min(frameCenterX, 1 - frameCenterX) * 2 -
      DETAIL_FRAME_EDGE_SAFE * 2;
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
    for (let pass = 0; pass < 4 && !fits(highFrame.metrics); pass++) {
      high = Math.min(high + 25, 220);
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
      Math.abs(previous.aspect - next.aspect) > 0.0001
    );
  }

  setMode(mode: "archive" | "detail") {
    this.cancelPointer();
    this.setHover(null);
    if (this.fixedDetailCamera) {
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
    }
    if (mode === "detail") this.finishIntro(true);
    if (mode !== "archive") this.pendingPulse = null;
    this.lastInteraction = this.clock;
    this.targetReveal = 1;
    this.targetDetail = mode === "detail" ? 1 : 0;
    this.dragging = false;
    if (mode !== "detail") {
      this.targetRotation = 0;
      if (this.rotation !== 0) this.returnY = this.model.position.y;
    } else this.returnY = null;
  }
  // Legacy review pages use the old whole-scene toggle.
  setReduced(value: boolean) { this.setMotion(value ? reducedMotion() : fullMotion()); }
  setMotion(value: MotionPreferences) {
    if ((!value.pointerParallax || !value.dragMomentum) && (this.motion.pointerParallax || this.motion.dragMomentum)) this.cancelPointer();
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
    this.motion = { ...value };
  }
  private get reduced() { return Object.values(this.motion).every(value => !value); }
  setQuality(value: RenderQuality | boolean) {
    const quality =
      typeof value === "boolean"
        ? normalizeQuality(undefined, value)
        : normalizeQuality(value);
    const key = JSON.stringify(quality);
    if (this.appliedQuality === key) return;
    this.appliedQuality = key;
    this.quality = quality;
    if (quality.aoSamples && quality.aoSamples !== this.aoKernelSize) {
      const old = this.ao;
      this.ao = new SharedDepthAO(this.scene, this.camera, 1, 1, quality.aoSamples);
      this.ao.kernelRadius = old.kernelRadius;
      this.ao.minDistance = old.minDistance;
      this.ao.maxDistance = old.maxDistance;
      const index = this.composer.passes.indexOf(old);
      this.composer.removePass(old);
      this.composer.insertPass(this.ao, index);
      old.dispose();
      this.aoKernelSize = quality.aoSamples;
    }
    // Fixed-detail Web view maintains its own lighting rig; keep AO off there.
    this.ao.enabled = quality.aoSamples > 0 && !this.fixedDetailCamera;
    this.bokeh.enabled = quality.depthOfField > 0;
    this.smaa.enabled = quality.antialias === "smaa";
    this.renderer.shadowMap.enabled = quality.shadows > 0;
    const size = Math.min(
      quality.shadows || 1024,
      this.renderer.capabilities.maxTextureSize,
    );
    if (this.light.shadow.mapSize.x !== size) {
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
      this.light.shadow.mapSize.set(size, size);
    }
    this.light.shadow.needsUpdate = true;
    applyTextureQuality(this.scene, this.renderer, quality);
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
    const shift = {
      lane:
        Math.abs(this.selectedCell.lane) > 2048
          ? Math.round((this.selectedCell.lane - 2) / 5) * 5
          : 0,
      row:
        Math.abs(this.selectedCell.row) > 2048
          ? Math.floor((this.selectedCell.row - 12) / 8) * 8
          : 0,
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
  select(index: number, navigation?: ArchiveNavigation) {
    if (!this.navigatingDrag) this.cancelPointer();
    this.setHover(null);
    this.lastInteraction = this.clock;
    this.selectedIndex = index;
    if (this.targetDetail <= 0) {
      this.cancelDetailSurfacePreparation();
    }
    const next = fileLocation(index).slot;
    const previousCell = this.selectedCell;
    const cell = selectionCell(index, previousCell, navigation);
    const changed = !sameCell(cell, previousCell);
    if (changed && this.intro) this.finishIntro(false, true);
    const sameColumnRowSwitch =
      changed && cell.lane === previousCell.lane;
    if (changed && this.loaded && this.lift.value > 0.0001) {
      const group = this.acquireOutgoingGroup();
      this.appearance.apply(
        group,
        this.appearanceInSlot(
          this.lift.value,
          this.slotUnderlights.directFor(previousCell),
          this.overviewBottomLight.value,
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
      this.lift.value = 0;
      this.lift.velocity = 0;
    }
    this.selectedSlot = next;
    this.selectedCell = cell;
    this.slotUnderlights.select(cell, !this.motion.selectionTransition);
    if (changed) {
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
    this.drawOverviewBadge(index);
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
    this.frozenPulses = this.frozenPulses.slice(
      -MAX_FROZEN_SELECTION_PULSES,
    );
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
    if (
      this.bakedCardTexture &&
      this.outgoingPool.length < MAX_OUTGOING_POOL
    ) {
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
  /**
   * 按档案重绘整张卡面。REF 版式以 2000 × 1480 的参考贴图为基准：
   * X-001 直接使用 GLB 里烘焙的参考卡面；其他档案沿用同一套版式，
   * 只替换编号、标题、描述、chips 与展示图占位。
   */
  private drawCardFace(index: number): boolean {
    if (!this.cardCanvas) {
      this.cardCanvas = document.createElement("canvas");
      this.cardCanvas.width = CARD_WIDTH;
      this.cardCanvas.height = CARD_HEIGHT;
    }
    if (!this.cardTexture) {
      this.cardTexture = new THREE.CanvasTexture(this.cardCanvas);
      // glTF 的 UV 原点在左上；CanvasTexture 默认 flipY 会让详情卡面倒置。
      this.cardTexture.flipY = false;
      this.cardTexture.colorSpace = THREE.SRGBColorSpace;
      this.cardTexture.anisotropy =
        this.renderer.capabilities.getMaxAnisotropy();
    }
    const c = this.cardCanvas.getContext("2d");
    if (!c) return false;
    const record = records[index];
    const fallback = String(Math.max(0, Math.floor(index)) + 1).padStart(3, "0");
    const code = (record?.id || "X-" + fallback).replace(/^X-/, "").trim();
    const title = (record?.title || record?.en || "").trim().replace("·", " · ");
    const model = (record?.en || "").trim();
    const department = (record?.department || record?.category || "").trim();
    const abstract = (record?.abstract || "").trim();
    const clearance = (record?.clearance || "").trim();
    const findings = record?.findings?.length ?? 0;
    const isReference = (record?.id || "") === "X-001";

    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    if (isReference && this.bakedCardImage) {
      c.drawImage(this.bakedCardImage, 0, 0, CARD_WIDTH, CARD_HEIGHT);
      c.restore();
      this.cardTexture.needsUpdate = true;
      return true;
    }

    // 纸面
    c.fillStyle = WARM.card;
    c.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // 巨大浅灰编号，保留参考图的「001」水印
    c.save();
    c.fillStyle = "#f0e8dc";
    c.font = "bold 430px 'Segoe UI', sans-serif";
    c.textBaseline = "top";
    c.fillText(code, 978, 956);
    c.restore();

    // 顶部稀疏刻度
    c.fillStyle = WARM.ruler;
    let tick = 0;
    for (let x = 33; x < CARD_WIDTH; x += 122) {
      if (!((x >= 0 && x <= 294) || (x >= 1530 && x <= 1896))) {
        const h = tick % 3 === 0 ? 30 : 20;
        c.fillRect(x, 44 - h, 3.5, h);
      }
      tick++;
    }

    // 左上档案牌
    const bx0 = 82;
    const bx1 = 570;
    const by0 = 64;
    const headY = 98;
    const bodyY = 236;
    const by1 = 243;
    c.fillStyle = "#474d4d";
    c.fillRect(bx0, by0, bx1 - bx0, headY - by0);
    c.fillStyle = "#fdfdfb";
    c.fillRect(bx0, headY, bx1 - bx0, bodyY - headY);
    c.fillStyle = "#606665";
    c.fillRect(bx0, bodyY, bx1 - bx0, by1 - bodyY);
    c.fillRect(bx0, headY, 3, bodyY - headY);
    c.fillRect(bx1 - 3, headY, 3, bodyY - headY);
    c.fillStyle = "#ffffff";
    c.font = "bold 22px MiSans, sans-serif";
    c.fillText("DEEPDEMOS", bx0 + 24, 86);
    c.fillStyle = WARM.frameInner;
    c.font = "20px MiSans, sans-serif";
    c.textAlign = "right";
    c.fillText("INFO", bx1 - 24, 86);
    c.textAlign = "left";
    c.fillStyle = "#1c2124";
    const codeLabel = fitCanvasText(
      c,
      "NO." + code,
      350,
      100,
      "MiSans, sans-serif",
      "bold",
    );
    c.fillText(codeLabel.text, bx0 + 24, 218);
    c.fillStyle = "#969c98";
    c.font = "22px MiSans, sans-serif";
    c.textAlign = "right";
    c.fillText("+ / -", bx1 - 24, 228);
    c.textAlign = "left";

    // 右上元信息与条形码
    c.fillStyle = "#474d4d";
    c.font = "20px MiSans, sans-serif";
    c.textAlign = "right";
    c.fillText("2026 · WEB · 1 RECORD", 1920, 150);
    const barcodeX0 = 1612;
    const barcodeX1 = 1920;
    const barcodeY0 = 108;
    const barcodeY1 = 190;
    c.fillStyle = "#ffffff";
    c.fillRect(barcodeX0, barcodeY0, barcodeX1 - barcodeX0, barcodeY1 - barcodeY0);
    c.fillStyle = "#000000";
    let seed = 20261116;
    let barX = barcodeX0;
    const unit = (barcodeX1 - barcodeX0) / 150;
    while (barX < barcodeX1) {
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      const w = Math.max(2, (1 + (seed % 4)) * unit);
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      const gap = Math.max(2, (1 + (seed % 3)) * unit);
      c.fillRect(barX, barcodeY0, Math.min(w, barcodeX1 - barX), barcodeY1 - barcodeY0);
      barX += w + gap;
    }
    c.fillStyle = "#474d4d";
    c.font = "15px MiSans, sans-serif";
    c.fillText(model, 1919, 202);
    c.textAlign = "left";

    // 展示图：X-001 用烘焙原图；其他档案用同尺寸占位
    const artX = 82;
    const artY = 294;
    const artW = 1839;
    const artH = 641;
    c.fillStyle = "#474d4d";
    c.fillRect(artX, artY, artW, artH);
    const grad = c.createLinearGradient(artX, artY, artX, artY + artH);
    grad.addColorStop(0, "#74c7bd");
    grad.addColorStop(0.62, "#d9e6c8");
    grad.addColorStop(1, "#4f9d99");
    c.fillStyle = grad;
    c.fillRect(artX + 6, artY + 6, artW - 12, artH - 12);
    c.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 28; i++) {
      c.fillRect(artX + 80 + i * 62, artY + 40, 2, artH - 80);
    }
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(artX + artW * 0.72, artY + artH * 0.34, 72, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = WARM.ink;
    c.font = "bold 96px MiSans, sans-serif";
    c.textAlign = "center";
    c.fillText("DS DEMO", artX + artW / 2, artY + artH / 2 + 34);
    c.textAlign = "left";

    // 标题与黄色高亮。高亮跟随标题末尾，短标题不会在右侧留下孤立色块。
    const fittedTitle = fitCanvasText(
      c,
      title || "UNTITLED",
      1300,
      154,
      "MiSans, sans-serif",
      "bold",
    );
    const titleText = fittedTitle.text;
    const titleSize = fittedTitle.size;
    const titleWidth = Math.min(1300, c.measureText(titleText).width);
    const highlightWidth = Math.min(428, Math.max(120, titleWidth * 0.34));
    c.fillStyle = "#ffdf8c";
    c.fillRect(
      88 + titleWidth - highlightWidth + 8,
      1123,
      highlightWidth,
      44,
    );
    c.fillStyle = "#1c2124";
    c.font = `bold ${titleSize}px MiSans, sans-serif`;
    c.fillText(titleText, 88, 1185);

    // 描述
    c.fillStyle = "#6e7673";
    const abstractText = fitCanvasText(
      c,
      abstract,
      900,
      30,
      "MiSans, sans-serif",
    ).text;
    c.fillText(abstractText, 84, 1238);

    // 数据 chips
    const chips = [
      { label: model || "未标注模型", x: 82, w: 324, solid: true },
      { label: department || "未标注平台", x: 425, w: 134, solid: false },
      { label: findings + " 条记录", x: 578, w: 158, solid: false },
      { label: clearance || "WEB", x: 755, w: 105, solid: false },
    ];
    for (const chip of chips) {
      c.fillStyle = chip.solid ? "#1c2124" : "#fcfcfa";
      c.fillRect(chip.x, 1262, chip.w, 55);
      c.strokeStyle = chip.solid ? "#1c2124" : "#969e9a";
      c.lineWidth = 2;
      c.strokeRect(chip.x + 1, 1263, chip.w - 2, 53);
      c.fillStyle = chip.solid ? "#ffffff" : "#3c4240";
      const chipText = fitCanvasText(
        c,
        chip.label,
        chip.w - 24,
        24,
        "MiSans, sans-serif",
      ).text;
      c.textAlign = "center";
      c.fillText(chipText, chip.x + chip.w / 2, 1298);
      c.textAlign = "left";
    }

    // 右侧标题，不铺底色
    c.fillStyle = "#0b0e0e";
    c.font = "bold 26px MiSans, sans-serif";
    c.textAlign = "right";
    c.fillText(isReference ? "SUN SHOWER" : model || "ARCHIVE", 1939, 1200);
    c.fillStyle = "#6a6e6a";
    c.font = "19px MiSans, sans-serif";
    c.fillText(isReference ? "OVER THE HARBOR" : department || "DEMO ARCHIVE", 1939, 1230);
    c.textAlign = "left";

    // 页脚
    c.fillStyle = "#bfc1be";
    c.fillRect(82, 1403, 1838, 2);
    c.fillStyle = "#6e7673";
    c.font = "19px MiSans, sans-serif";
    c.fillText("DEEPDEMOS.TOP · AI DEMO ARCHIVE", 84, 1435);
    c.fillStyle = "#1c2124";
    c.font = "bold 20px MiSans, sans-serif";
    c.textAlign = "right";
    c.fillText("DD / AI", 1919, 1435);
    c.textAlign = "left";

    c.restore();
    this.cardTexture.needsUpdate = true;
    return true;
  }
  private drawLabel(index: number) {
    if (!this.labelTexture) return;
    // A record can be missing from a hand-edited content file; the label must
    // still render rather than throw on an undefined title.
    const record = records[index];
    const title = (record?.en || record?.title || "").trim();
    const fallback = String(Math.max(0, Math.floor(index)) + 1).padStart(3, "0");
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
  private refreshSelectedBadge(index: number) {
    if (index !== this.selectedIndex) return;
    if (this.intro) {
      this.pendingOverviewBadgeRefresh = true;
    } else {
      this.drawOverviewBadge(index);
      this.renderState.invalidate();
    }
  }
  private loadCardPhoto(
    src: string | null,
    index = this.selectedIndex,
    refreshBadge = true,
  ) {
    const target = Math.max(0, Math.min(records.length - 1, Math.floor(index)));
    const token = (this.cardPhotoTokens.get(target) ?? 0) + 1;
    this.cardPhotoTokens.set(target, token);
    if (!src) {
      this.cardPhotoSrc.delete(target);
      this.cardPhotos.delete(target);
      if (refreshBadge) this.refreshSelectedBadge(target);
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
          this.refreshSelectedBadge(target);
        });
    };
    img.src = resolved;
    if (refreshBadge) this.refreshSelectedBadge(target);
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
    this.refreshSelectedBadge(target);
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
  ) {
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
    const maxMetricText = ((right - left) * 0.62 - gaps) / metrics.length - iconWidth;
    const labels = metrics.map(([kind, count]) => {
      c.font = "600 46px MiSans, sans-serif";
      const text = fitOneLine(c, String(count), maxMetricText);
      return { kind, text, font: c.font, width: iconWidth + c.measureText(text).width };
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
    if (hasPhoto) c.strokeText(sample, left, sampleY);
    c.fillText(sample, left, sampleY);
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
      x += label.width + metricGap;
    }
  }

  private getModelProviderLogo(model: string) {
    const provider = modelProvider(model);
    if (!provider) return;
    const cached = this.modelProviderImages.get(provider);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : undefined;

    const image = new Image();
    this.modelProviderImages.set(provider, image);
    image.onload = () => {
      if (
        this.disposed ||
        modelProvider(records[this.selectedIndex]?.en ?? "") !== provider
      ) {
        return;
      }
      this.refreshSelectedBadge(this.selectedIndex);
    };
    image.src = publicAsset(`assets/model-providers/${provider}.svg`);
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
    const textWidth = showModel
      ? BURN_STAMP_RIGHT - BURN_STAMP_WIDTH - BURN_STAMP_GAP - textX
      : OVERVIEW_BADGE_WIDTH - 2 * textX;
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
      c.drawImage(
        logo,
        textX,
        logoTop,
        logo.naturalWidth * scale,
        logoHeight,
      );
      headingBottom = logoTop + logoHeight;
    }
    return headingBottom;
  }

  private drawBurnStamp(c: CanvasRenderingContext2D, index: number) {
    const burnTime = records[index]?.date?.trim() || "0000-00-00";
    const x = BURN_STAMP_RIGHT - BURN_STAMP_WIDTH;
    c.save();
    c.textAlign = "right";
    c.textBaseline = "alphabetic";
    c.fillStyle = WARM.ink;
    c.font = "600 44px MiSans, sans-serif";
    c.fillText(
      fitOneLine(c, `刻录时间：${burnTime}`, BURN_STAMP_WIDTH),
      BURN_STAMP_RIGHT,
      126,
    );
    drawCode39Barcode(
      c,
      burnTime,
      x,
      BURN_STAMP_TOP,
      BURN_STAMP_WIDTH,
      BURN_STAMP_HEIGHT,
    );
    c.restore();
  }

  private drawHoverBadge(index: number) {
    if (index === this.hoverBadgeIndex || !this.hoverBadgeUniform.value) return;
    const c = this.hoverBadgeCanvas.getContext("2d");
    if (!c) return;
    c.setTransform(OVERVIEW_BADGE_SCALE, 0, 0, OVERVIEW_BADGE_SCALE, 0, 0);
    c.clearRect(0, 0, OVERVIEW_BADGE_WIDTH, HOVER_BADGE_HEIGHT);
    this.drawOverviewHeading(c, index, false);
    this.hoverBadgeUniform.value.needsUpdate = true;
    this.hoverBadgeIndex = index;
  }

  private drawOverviewBadge(index: number) {
    if (!this.overviewBadgeTexture) return;
    if (index === this.selectedIndex) this.pendingOverviewBadgeRefresh = false;
    const record = records[index];
    if (record?.cover && !this.cardPhotoSrc.has(index)) {
      this.loadCardPhoto(record.cover, index, false);
    }
    const c = this.overviewBadgeCanvas.getContext("2d");
    if (!c) return;
    c.save();
    c.setTransform(OVERVIEW_BADGE_SCALE, 0, 0, OVERVIEW_BADGE_SCALE, 0, 0);
    c.clearRect(0, 0, OVERVIEW_BADGE_WIDTH, OVERVIEW_BADGE_HEIGHT);
    const headingBottom = this.drawOverviewHeading(c, index, true);
    this.drawBurnStamp(c, index);
    // 2. Middle Replaceable Showcase Photo, expanded to the card margins.
    const px = 48;
    const py = 386;
    const pw = 1952;
    const ph = 1032;
    const headingEdge = Math.min(
      py - 2,
      Math.max(headingBottom + 20, BURN_STAMP_TOP + BURN_STAMP_HEIGHT + 20),
    );
    this.overviewBadgeHeadingEdge.value = 1 - headingEdge / OVERVIEW_BADGE_HEIGHT;
    const photo = this.cardPhotos.get(index);
    const hasPhoto = Boolean(photo?.naturalWidth && photo.naturalHeight);
    c.save();
    c.beginPath();
    c.rect(px, py, pw, ph);
    c.clip();
    if (photo && hasPhoto) {
      const scale = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight);
      const dw = photo.naturalWidth * scale;
      const dh = photo.naturalHeight * scale;
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
      c.fillText("SHOWCASE PHOTO  ·  可替换展示照片", px + pw / 2, py + ph * 0.46);
    }
    this.drawShowcaseStats(
      c,
      index,
      px + 64,
      px + pw - 64,
      py + ph - 64,
      py + 64,
      hasPhoto,
    );
    c.restore();

    c.restore();
    this.overviewBadgeTexture.needsUpdate = true;
  }
  private ensureInstanceCapacity(required: number) {
    if (required <= this.instanceCapacity) return;
    const capacity = Math.max(required, this.instanceCapacity * 2);
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(THREE.DynamicDrawUsage);
    matrix.array.set(this.instances[0].instanceMatrix.array);
    for (const inst of this.instances) {
      inst.dispose();
      inst.instanceMatrix = matrix;
    }
    const previousSlotLight = this.slotLightAttribute;
    this.slotLightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousSlotLight) this.slotLightAttribute.array.set(previousSlotLight.array);
    const previousNeighborLight = this.neighborLightAttribute;
    this.neighborLightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousNeighborLight) this.neighborLightAttribute.array.set(previousNeighborLight.array);
    const previousLateralLight = this.lateralLightAttribute;
    this.lateralLightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousLateralLight) this.lateralLightAttribute.array.set(previousLateralLight.array);
    const previousTopRailLight = this.topRailLightAttribute;
    this.topRailLightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousTopRailLight) this.topRailLightAttribute.array.set(previousTopRailLight.array);
    for (const inst of this.instances) {
      inst.geometry.setAttribute("archiveSlotLight", this.slotLightAttribute);
      inst.geometry.setAttribute("archiveSlotReflection", this.neighborLightAttribute);
      inst.geometry.setAttribute("archiveSlotLateral", this.lateralLightAttribute);
      inst.geometry.setAttribute("archiveSlotTopRail", this.topRailLightAttribute);
    }
    this.matrixUpdates = new InstanceUpdates(matrix);
    this.slotLightUpdates = new InstanceUpdates(this.slotLightAttribute);
    this.neighborLightUpdates = new InstanceUpdates(this.neighborLightAttribute);
    this.lateralLightUpdates = new InstanceUpdates(this.lateralLightAttribute);
    this.topRailLightUpdates = new InstanceUpdates(this.topRailLightAttribute);
    this.instanceCapacity = capacity;
  }
  private get transmissionScale() {
    return this.detail < 0.01 && !this.targetDetail
      ? Math.min(this.quality.transmission, OVERVIEW_TRANSMISSION_LIMIT)
      : this.quality.transmission;
  }
  resize() {
    this.renderState.invalidate();
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    const dimensions = resizeQuality(
      this.renderer,
      this.composer,
      this.container,
      this.quality,
      this.superPerformance,
    );
    this.ao.setSize(
      Math.max(1, Math.floor(dimensions.width * this.quality.aoResolution)),
      Math.max(1, Math.floor(dimensions.height * this.quality.aoResolution)),
    );
    this.ao.setSharing(this.ao.enabled && this.bokeh.enabled && this.quality.aoResolution === 1 && !this.superPerformance);
    const transmission = this.transmissionScale;
    this.renderer.transmissionResolutionScale = transmission;
    this.container.dataset.renderQuality = JSON.stringify({
      ...this.readRenderMetrics(),
      transmission,
      aoSamples: this.ao.enabled ? this.aoKernelSize : 0,
      aoWidth: this.ao.width,
      aoHeight: this.ao.height,
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
    this.onHover?.(cell ? fileAtCell(cell) : null);
  }
  private pickCell(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.cursor.set(
      ((x - r.left) / r.width) * 2 - 1,
      (-(y - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const hit = this.raycaster.intersectObjects(
      [this.instances[0], this.model, ...this.outgoing.map((o) => o.group)],
      true,
    )[0];
    if (!hit) return null;
    if (hit.instanceId !== undefined) return { ...this.drawnCells[hit.instanceId] };
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const copy = this.outgoing.find((o) => o.group === object);
      if (copy) return { ...copy.cell };
      object = object.parent;
    }
    return { ...this.selectedCell };
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
    const rect = this.renderer.domElement.getBoundingClientRect();
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
    const goal = { lane: Math.round(coordinate.lane), row: Math.round(coordinate.row) };
    if (sameCell(goal, this.selectedCell)) return;
    const from = { ...this.selectedCell };
    const steps = Math.min(64, Math.max(Math.abs(goal.lane - from.lane), Math.abs(goal.row - from.row)));
    this.navigatingDrag = true;
    try {
      // Select physical cells along the travelled segment in one update per cell.
      // Column memory is updated by onSelect, but never pulls a held plane away.
      for (let i = 1; i <= steps; i++) {
        const cell = {
          lane: Math.round(from.lane + (goal.lane - from.lane) * i / steps),
          row: Math.round(from.row + (goal.row - from.row) * i / steps),
        };
        if (!sameCell(cell, this.selectedCell)) this.onSelect?.(fileAtCell(cell), cell);
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
      cancelled = false;
    let startTrack = { lane: 0, row: 0 };
    let wheelTotal = 0,
      wheelTime = 0;
    const pointers = new Set<number>();
    const hover = (e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType'>) => {
      if (
        e.pointerType !== "mouse" ||
        !this.canBrowse() ||
        this.archiveMomentum
      )
        return;
      const r = canvas.getBoundingClientRect();
      this.pointer.set(
        (e.clientX - r.left) / r.width - 0.5,
        (e.clientY - r.top) / r.height - 0.5,
      );
      const cell = this.pickCell(e.clientX, e.clientY);
      this.setHover(cell);
      canvas.style.cursor = cell ? "pointer" : "grab";
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
      this.setHover(null);
      canvas.style.cursor = this.canBrowse() ? "grab" : "default";
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
    canvas.addEventListener("pointerdown", (e) => {
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
      startY = e.clientY;
      browse = this.canBrowse();
      this.stopMomentum();
      if (browse) {
        this.columnCamera.velocity = 0;
        this.rail.velocity = 0;
      }
      this.holdingArchive = browse;
      this.dragging = !browse && this.canInspect;
      startTrack = { lane: this.columnCamera.value, row: this.rail.value };
      this.archiveDrag.start(e.clientX, e.clientY, this.dragProjection(), e.timeStamp);
      this.setHover(null);
      canvas.setPointerCapture(e.pointerId);
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointermove", (e) => {
      if (activePointer !== null && e.pointerId !== activePointer) return;
      if (activePointer === null) {
        // Coalesce uncaptured hover only; dragging and release velocity stay immediate.
        this.pendingHover = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType };
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
      if (this.dragging && this.canInspect) {
        this.targetRotation = THREE.MathUtils.clamp(
          this.targetRotation + (e.clientX - previousX) * 0.004,
          -0.8,
          0.8,
        );
        previousX = e.clientX;
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointerup", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId !== activePointer) return;
      if (!cancelled && browse && this.canBrowse()) {
        moveArchive(e);
        if (this.archiveDrag.active) {
          if (this.motion.dragMomentum) {
            this.archiveMomentum = {
              time: performance.now() / 1000,
              motion: new ArchivePlaneMomentum(
                { lane: this.trackCoordinate("lane", this.columnCamera.value), row: this.trackCoordinate("row", this.rail.value) },
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
            const file = fileAtCell(cell);
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
      }
      reset();
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointercancel", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId === activePointer) {
        cancelled = true;
        reset();
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("lostpointercapture", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId === activePointer) {
        cancelled = true;
        reset();
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointerleave", () => {
      this.pendingHover = null;
      this.pointer.set(0, 0);
      this.setHover(null);
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener(
      "wheel",
      (e) => {
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
          for (let i = 0; i < steps; i++) this.onNavigate?.("row", direction);
        } finally {
          this.navigatingDrag = false;
        }
      },
      { ...{ passive: false }, signal: this.inputEvents.signal },
    );
    window.addEventListener("blur", () => this.cancelPointer(), { signal: this.inputEvents.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.cancelPointer();
    }, { signal: this.inputEvents.signal });
    window.addEventListener("resize", () => this.cancelPointer(), { signal: this.inputEvents.signal });
    // After multi-touch cancels capture, a finger can finish outside the canvas.
    window.addEventListener("pointerup", (e) => pointers.delete(e.pointerId), { signal: this.inputEvents.signal });
    window.addEventListener("pointercancel", (e) =>
      pointers.delete(e.pointerId), { signal: this.inputEvents.signal }
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
    this.slotUnderlights.update(dt, !this.motion.selectionTransition);
    if (this.introRelease) {
      this.introRelease.age += dt;
      if (this.introRelease.age >= INTRO_RELEASE_DURATION) this.introRelease = null;
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
    const blend = 1 - Math.exp(-dt * (this.motion.selectionTransition ? 2.8 : 35));
    const detailBlend = 1 - Math.exp(-dt * (this.motion.detailTransition ? 2.8 : 35));
    this.reveal = THREE.MathUtils.lerp(this.reveal, this.targetReveal, blend);
    this.rotation = this.targetDetail
      ? THREE.MathUtils.lerp(this.rotation, this.targetRotation, detailBlend)
      : returnStep(this.rotation, dt, !this.motion.detailTransition);
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
    const hoverTarget = this.hoverCell && sameCell(this.hoverCell, this.selectedCell)
      ? 0.28
      : HOVER_PREVIEW_LIFT;
    if (hoverKey && !this.hoverLifts.has(hoverKey)) this.hoverLifts.set(hoverKey, 0);
    for (const [key, value] of this.hoverLifts) {
      const target = key === hoverKey ? hoverTarget : 0;
      const next = !this.motion.selectionTransition ? target : THREE.MathUtils.lerp(value, target, 1 - Math.exp(-dt * 14));
      if (target === 0 && next < 0.0001) this.hoverLifts.delete(key);
      else this.hoverLifts.set(key, next);
    }
    const hoverLift = (cell: ArchiveCell) => this.hoverLifts.get(cellKey(cell)) ?? 0;
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
      damp(this.laneFocus, selectedLane, 4, dt);
      // A held or freely coasting plane owns both tracks; selection cannot pull it.
      if (!this.holdingArchive && !momentum) {
        damp(this.columnCamera, chosen.x, 3.7, dt);
        damp(this.rail, SELECTED_ROW_ANCHOR_Z - chosen.z, 3.7, dt);
      }
    }
    if (momentum) {
      this.columnCamera.value = this.trackPosition("lane", momentum.motion.lane.value);
      this.rail.value = this.trackPosition("row", momentum.motion.row.value);
      this.columnCamera.velocity = momentum.motion.lane.velocity * COLUMN_SPACING;
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
    const idle =
      this.motion.idleWave &&
      this.targetReveal > 0 &&
      !this.targetDetail &&
      this.detail < 0.01 &&
      this.returnY === null &&
      !aligningCopy &&
      idleFor > 2.5 &&
      idleFor < 60;
    this.idleGain = THREE.MathUtils.lerp(
      this.idleGain,
      idle ? 1 : 0,
      1 - Math.exp(-dt * (idle ? 0.8 : 4)),
    );
    // Snap, or the exponential tail would keep the matrices changing forever.
    if (!idle && this.idleGain < 1e-4) this.idleGain = 0;
    this.idleNow = idle;
    this.pulseGain = THREE.MathUtils.lerp(
      this.pulseGain,
      this.targetDetail || this.returnY !== null || aligningCopy ? 0 : 1,
      1 - Math.exp(-dt * 8),
    );
    // Fixed Web detail frames keep the overview field while logical detail
    // advances independently for decryption and application state.
    const fieldDetail = this.fixedDetailCamera ? 0 : this.detail;
    const fieldLightOverview = 1 - fieldDetail;
    const fieldCache = new Map<number, Map<number, number>>();
    const introFieldState = this.intro ?? this.introRelease;
    const introOrigin = this.introRelease?.cell ?? this.selectedCell;
    const introRelease = this.introRelease
      ? ease(this.introRelease.age / INTRO_RELEASE_DURATION)
      : 0;
    const calculateField = (row: number, lane: number) => {
      const breathing = idleWave(
          row + this.coordinateOrigin.row,
          lane + this.coordinateOrigin.lane,
          time,
        ) *
          this.idleGain;
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
        0.18 * (1 - fieldDetail),
      );
      const settling = settlingWave(
        distance * (ROW_SPACING / REFERENCE_ROW_SPACING),
        26.56,
      );
      // Lift the static rear trough back to the slot plane with a soft edge.
      const planeTransition =
        THREE.MathUtils.smoothstep(settling, 0, 0.16);
      const planarSettling =
        Math.max(0, settling) * planeTransition;
      const overviewSettling = THREE.MathUtils.lerp(
        settling,
        planarSettling,
        fieldLightOverview,
      );
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
          breathing *
            THREE.MathUtils.lerp(1, planeTransition, fieldLightOverview) *
            terraceWeight +
          crest * (1 - introRelease) +
          pulseHeight
        );
      }
      return (
        overviewSettling * columnWave +
        breathing * THREE.MathUtils.lerp(
          1,
          planeTransition,
          fieldLightOverview,
        ) +
        pulseHeight
      );
    };
    const field = (row: number, lane: number): number => {
      let values = fieldCache.get(lane);
      if (!values) { values = new Map(); fieldCache.set(lane, values); }
      const previous = values.get(row);
      if (previous !== undefined) return previous;
      const value = calculateField(row, lane);
      values.set(row, value);
      return value;
    };
    const selectedBase = chosen.y + field(selectedRow, selectedLane);
    const introLiftScale =
      !this.intro || this.intro.fullLiftUnlocked ? 1 : 0;
    if (this.returnY !== null && this.rotation !== 0) {
      this.lift.value = this.returnY - selectedBase;
      this.lift.velocity = 0;
    } else {
      this.returnY = null;
      const detailLift = this.fixedDetailCamera
        ? (this.fixedDetailLiftTarget ?? INSPECTION_LIFT)
        : INSPECTION_LIFT;
      const liftTarget = this.targetDetail
        ? detailLift
        : this.outgoing.some(
              (o) =>
                o.returnY !== null &&
                o.cell.lane === selectedLane &&
                Math.abs(o.cell.row - selectedRow) < 5,
            )
          ? 0
          : OVERVIEW_LIFT *
            this.targetReveal *
            introLiftScale;
      if (!this.motion.detailTransition) {
        this.lift = { value: liftTarget, velocity: 0 };
      } else {
        damp(
          this.lift,
          liftTarget,
          this.fixedDetailCamera && this.targetDetail
            ? DETAIL_LIFT_OPEN_RATE
            : this.deferSelectionPulse &&
                !this.targetDetail &&
                this.lift.value < OVERVIEW_LIFT
              ? 7.6
              : 4.2,
          dt,
        );
      }
    }
    const cameraTarget = this.fixedDetailCamera
      ? this.targetDetail
      : this.targetDetail
        ? ease((this.lift.value - 0.8) / 2.4)
        : this.returnY !== null
          ? this.detail
          : ease(
              (this.lift.value - OVERVIEW_LIFT) /
                (INSPECTION_LIFT - OVERVIEW_LIFT),
            );
    this.detail = THREE.MathUtils.lerp(this.detail, cameraTarget, detailBlend);
    const detail = this.detail;
    const renderDetail = this.fixedDetailCamera ? 0 : detail;
    const lightOverview = 1 - renderDetail;
    const selectedVisualLift = this.overviewVisualLift();
    const selectedDirectLight = this.slotUnderlights.directFor(this.selectedCell);
    this.appearance.apply(
      this.model,
      this.appearanceInSlot(this.lift.value, selectedDirectLight, lightOverview),
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
      o.group.rotation.y = returnStep(o.group.rotation.y, dt, !this.motion.detailTransition);
      if (o.returnY !== null) {
        o.lift.value = o.returnY - baseY;
        o.lift.velocity = 0;
        if (o.group.rotation.y === 0) o.returnY = null;
      } else {
        const rate = this.motion.detailTransition
          ? (i < fastReturnCount ? OUTGOING_CATCH_UP_RATE : 4.5)
          : 35;
        damp(o.lift, 0, rate, dt);
      }
      o.group.position.set(
        p.x - trackX,
        baseY +
          o.lift.value +
          OVERVIEW_VISUAL_LIFT *
            THREE.MathUtils.smoothstep(o.lift.value, 0, OVERVIEW_LIFT) *
            (1 - renderDetail) +
          hoverLift(o.cell),
        p.z + entryZ + this.rail.value,
      );
      const quality = ease(o.lift.value / OVERVIEW_LIFT);
      const directLight = this.slotUnderlights.directFor(o.cell);
      this.appearance.apply(
        o.group,
        this.appearanceInSlot(o.lift.value, directLight, lightOverview),
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
        (1 - renderDetail) *
        (1 - quality);
      if (
        Math.abs(o.lift.value) < OUTGOING_FINISH_LIFT &&
        Math.abs(o.group.rotation.y) < 0.001
      ) {
        this.outgoing.splice(i, 1);
        this.releaseOutgoingGroup(o.group);
      }
    }
    if (
      this.pendingPulse &&
      !this.targetDetail &&
      this.targetReveal
    ) {
      const selectedY = selectedBase + this.lift.value;
      const oldCardsLower = this.outgoing.every(
        (old) =>
          old.cell.lane !== selectedLane ||
          Math.abs(old.cell.row - selectedRow) > 4 ||
          old.group.position.y + 0.015 < selectedY,
      );
      // The new file causes the wave: finish most of its rise and let nearby
      // outgoing files get below it before starting the outward pulse.
      if (this.lift.value >= OVERVIEW_LIFT * 0.87 && this.returnY === null && oldCardsLower) {
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
        (1 - renderDetail) *
        (1 - ease(this.lift.value / OVERVIEW_LIFT)),
      this.rotation,
      0,
    );
    const fixedDetailBasis: FixedDetailCameraBasis | undefined =
      this.fixedDetailCameraHeld
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
            aspect:
              this.container.clientWidth / this.container.clientHeight,
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
    const fixedPose =
      this.fixedDetailCameraHeld ? this.fixedDetailCameraPose : undefined;
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
        damp(this.detailCameraMove, lead, DETAIL_CAMERA_ORBIT_OPEN_RATE, dt);
      } else if (this.returnY === null) {
        damp(this.detailCameraAimMove, 0, DETAIL_CAMERA_CLOSE_RATE, dt);
        damp(this.detailCameraMove, 0, DETAIL_CAMERA_CLOSE_RATE, dt);
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
      const cameraDetail = renderDetail;
      const span = 6.3;
      const distance = THREE.MathUtils.lerp(55, 72, cameraDetail);
      const cameraAim = new THREE.Vector3(-0.62, -0.13, 0.43);
      const viewDirection = new THREE.Vector3(
        -Math.sin(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
        Math.sin(OVERVIEW_ELEVATION),
        Math.cos(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
      )
        .lerp(new THREE.Vector3(-0.277, 0.238, 0.931), cameraDetail)
        .normalize();
      const framing = archiveFraming(
        this.container.clientWidth,
        this.container.clientHeight,
        span,
        cameraDetail,
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
          (framing.previewY - 0.5) * height / pixelScale,
        );
        cameraAim.copy(previewAim);
      } else {
        cameraAim.addScaledVector(
          right,
          -Math.min((0.024 * width) / pixelScale, 0.48),
        );
        cameraAim.addScaledVector(up, 0.037 * framing.span);
      }
      const detailAim = this.model.position
        .clone()
        .add(new THREE.Vector3(0, this.modelCenterY, 0));
      detailAim.addScaledVector(
        right,
        (0.5 - framing.detailX) * width / pixelScale,
      );
      detailAim.addScaledVector(
        up,
        (framing.detailY - 0.5) * height / pixelScale,
      );
      cameraAim.lerp(detailAim, cameraDetail);
      const cameraPosition = cameraAim
        .clone()
        .addScaledVector(viewDirection, distance);
      if (this.motion.pointerParallax) {
        cameraPosition.x += this.pointer.x * 0.12;
        cameraPosition.y -= this.pointer.y * 0.12;
      }
      const cameraTransition = this.targetDetail || this.detail > 0.01
        ? this.motion.detailTransition
        : this.motion.selectionTransition;
      const cameraBlend =
        !this.cameraInitialized || this.fixedDetailCameraHeld
          ? 1
          : cameraTransition
            ? 1 - Math.exp(-dt * 5)
            : 1;
      this.camera.position.lerp(cameraPosition, cameraBlend);
      this.cameraAim.lerp(cameraAim, cameraBlend);
      this.camera.lookAt(this.cameraAim);
      this.camera.rotateZ(LIGHT_OVERVIEW_ROLL * (1 - cameraDetail));
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        THREE.MathUtils.radToDeg(
          2 * Math.atan(framing.span / (2 * distance)),
        ),
        cameraBlend,
      );
      this.cameraInitialized = true;
    }
    const fog = this.scene.fog as THREE.Fog;
    // The camera position is damped after its target distance changes. Anchor
    // fog to the rendered camera, or entry puts the array behind the far plane
    // until the camera catches up (a brief white wash that exit never showed).
    const renderedDistance = this.camera.position.distanceTo(this.cameraAim);
    fog.near =
      renderedDistance +
      THREE.MathUtils.lerp(5, -1, renderDetail) -
      2 * lightOverview;
    fog.far =
      renderedDistance +
      THREE.MathUtils.lerp(25, 12, renderDetail);
    fog.color.copy(OVERVIEW_MIST);
    (this.scene.background as THREE.Color).copy(OVERVIEW_MIST);
    // Unified studio rig across overview and detail: soft warm key (with real
    // soft shadows) + sky/bounce hemisphere + front-right fill + warm slot strip.
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.18, 0.3, renderDetail);
    this.studioSkyLight.intensity = THREE.MathUtils.lerp(0.22, 0.28, renderDetail);
    this.fillLight.color.copy(LIGHT_OVERVIEW_FILL_COLOR);
    this.fillLight.intensity = THREE.MathUtils.lerp(0.07, 0.22, renderDetail);
    this.fillLight.position.copy(LIGHT_OVERVIEW_FILL_POSITION);
    this.overviewTrackOffset.value.set(
      trackX,
      this.rail.value + entryZ,
    );
    const bar = this.slotUnderlights.barPosition;
    const stripX = (bar.lane - 2) * COLUMN_SPACING - trackX;
    const stripZ =
      (bar.row - 15.5) * ROW_SPACING +
      entryZ +
      this.rail.value +
      OVERVIEW_RECT_LIGHT_Z_OFFSET;
    const stripGain =
      this.slotUnderlights.barIntensity *
      this.overviewSlotLightGain.value *
      THREE.MathUtils.lerp(1, 0.72, renderDetail);
    this.overviewAreaLight.position.set(
      stripX,
      OVERVIEW_RECT_LIGHT_Y,
      stripZ,
    );
    this.overviewAreaLight.intensity =
      OVERVIEW_RECT_LIGHT_INTENSITY * stripGain;
    this.overviewLightStrip.position.set(stripX, -4.52, stripZ);
    this.overviewLightStripMaterial.opacity = Math.min(1, 0.95 * stripGain);
    this.overviewLightStrip.visible = stripGain > 0.005;
    this.lightKeyPositionScratch.lerpVectors(
      LIGHT_OVERVIEW_KEY_POSITION,
      LIGHT_DETAIL_KEY_POSITION,
      renderDetail,
    );
    this.lightKeyTargetScratch.lerpVectors(
      LIGHT_OVERVIEW_KEY_TARGET,
      LIGHT_DETAIL_KEY_TARGET,
      renderDetail,
    );
    this.light.color.copy(LIGHT_OVERVIEW_KEY_COLOR);
    this.light.castShadow = true;
    this.light.shadow.radius = 4;
    this.light.angle = 0.56;
    this.light.penumbra = 0.96;
    this.light.decay = 1.62;
    this.light.position.copy(this.lightKeyPositionScratch);
    this.light.target.position.copy(this.lightKeyTargetScratch);
    this.light.intensity = THREE.MathUtils.lerp(205, LIGHT_DETAIL_KEY_INTENSITY, renderDetail);
    this.overviewBottomLight.value = lightOverview;

    if (this.fixedDetailCameraHeld && this.fixedDetailCameraPose) {
      this.applyFixedDetailProjection(cameraMove);
    } else {
      this.camera.updateProjectionMatrix();
      // 固定详情相机还没取到位姿的那一帧按总览投影校准。
      const projectionOverview = this.fixedDetailCameraHeld ? 1 : lightOverview;
      // Keep the light-overview calibration in the projection matrix so camera
      // picking, coverage and WebGL rendering share one optical transform.
      this.camera.projectionMatrix.elements[0] *= THREE.MathUtils.lerp(
        1,
        LIGHT_OVERVIEW_HORIZONTAL_SCALE,
        projectionOverview,
      );
      this.camera.projectionMatrix.elements[5] *= THREE.MathUtils.lerp(
        1,
        LIGHT_OVERVIEW_VERTICAL_SCALE,
        projectionOverview,
      );
      this.camera.projectionMatrixInverse
        .copy(this.camera.projectionMatrix)
        .invert();
      this.camera.updateMatrixWorld();
      if (this.fixedDetailCamera) {
        this.overviewCameraReady = true;
        if (
          this.fixedDetailCameraHeld &&
          !this.fixedDetailCameraPose
        ) {
          this.captureFixedDetailCameraEntry();
        }
      }
    }
    // Build and compact the instance set only after the actual damped camera
    // is final for this frame. Picking uses the same packed index-to-cell map.
    this.cells = this.visibility.update(this.camera, fog.far, trackX, entryZ + this.rail.value, false);
    const hidden = new Set(this.outgoing.map(o => cellKey(o.cell)));
    hidden.add(cellKey(this.selectedCell));
    this.drawnCells = [];
    this.hoverBadgeInstance.value = -1;
    this.drawCoverage.update(this.camera);
    this.shadowCoverage?.begin();
    this.matrixUpdates ??= new InstanceUpdates(this.instances[0].instanceMatrix);
    if (this.slotLightAttribute) {
      this.slotLightUpdates ??= new InstanceUpdates(this.slotLightAttribute);
    }
    if (this.neighborLightAttribute) {
      this.neighborLightUpdates ??= new InstanceUpdates(this.neighborLightAttribute);
    }
    if (this.lateralLightAttribute) {
      this.lateralLightUpdates ??= new InstanceUpdates(this.lateralLightAttribute);
    }
    if (this.topRailLightAttribute) {
      this.topRailLightUpdates ??= new InstanceUpdates(this.topRailLightAttribute);
    }
    for (const cell of this.cells) {
      const { row, lane } = cell;
      if (hidden.has(cellKey(cell))) continue;
      const x = (lane - 2) * COLUMN_SPACING - trackX;
      const y = -4.6 + field(row, lane) + hoverLift(cell);
      const z = (row - 15.5) * ROW_SPACING + entryZ + this.rail.value;
      if (!this.visibility.intersects(x, y, z)) continue;

      const slope = field(row + .5, lane) - field(row - .5, lane);
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(slope * .024 * (1 - renderDetail), 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.shadowCoverage?.add(this.dummy.matrix);
      if (!this.drawCoverage.contains(x, y, z)) continue;
      const i = this.drawnCells.length;
      this.ensureInstanceCapacity(i + 1);
      this.drawnCells.push(cell);
      if (this.hoverCell && sameCell(cell, this.hoverCell)) {
        this.hoverBadgeInstance.value = i;
        this.drawHoverBadge(fileAtCell(cell));
      }
      this.slotLightUpdates?.scalar(
        i,
        this.slotUnderlights.directFor(cell),
      );
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
      this.matrixUpdates!.set(i * 16, this.dummy.matrix.elements);
    }
    const countChanged = this.instances[0].count !== this.drawnCells.length;
    const visibleMatricesChanged = this.matrixUpdates!.commit();
    const shadowMatricesChanged = this.shadowCoverage?.commit() ?? false;
    const slotLightsChanged = this.slotLightUpdates?.commit() ?? false;
    const neighborLightsChanged =
      this.neighborLightUpdates?.commit() ?? false;
    const lateralLightsChanged =
      this.lateralLightUpdates?.commit() ?? false;
    const topRailLightsChanged =
      this.topRailLightUpdates?.commit() ?? false;
    const geometryChanged =
      visibleMatricesChanged || shadowMatricesChanged;
    const matricesChanged =
      geometryChanged ||
      slotLightsChanged ||
      neighborLightsChanged ||
      lateralLightsChanged ||
      topRailLightsChanged;
    for (const inst of this.instances) {
      inst.count = this.drawnCells.length;
    }
    // Picking uses only the first instanced surface. The other batches disable
    // renderer culling and do not need an O(n) bound recomputation each frame.
    if (geometryChanged || countChanged || !this.instances[0].boundingSphere) this.instances[0].computeBoundingSphere();
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
      Boolean(this.targetDetail) &&
      detail > 0.9 &&
      this.pulseGain < 0.01;
    this.canInspect = detailSettled && this.clearance > 0.3;
    const fixedDetailRaised =
      this.fixedDetailCamera &&
      detailSettled &&
      this.fixedDetailLiftTarget !== undefined &&
      this.lift.value >= this.fixedDetailLiftTarget - 0.04;
    const inspectionReady = this.fixedDetailCamera
      ? fixedDetailRaised && this.canInspect
      : this.canInspect;
    let inspectionState = "preview";
    if (this.returnY !== null) inspectionState = "aligning";
    else if (inspectionReady) inspectionState = "ready";
    else if (fixedDetailRaised) inspectionState = "raised";
    else if (this.targetDetail) inspectionState = "lifting";
    this.container.dataset.inspection = inspectionState;
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
      const focusHeight = THREE.MathUtils.lerp(
        OVERVIEW_FOCUS_HEIGHT,
        LIGHT_OVERVIEW_FOCUS_HEIGHT,
        lightOverview,
      );
      const focalPoint = this.model.position
        .clone()
        .add(new THREE.Vector3(0, focusHeight, 0))
        .applyMatrix4(this.camera.matrixWorldInverse);
      bokehUniforms.focus.value = -focalPoint.z;
    }
    this.lastRenderedFocusDepth = bokehUniforms.focus.value;
    bokehUniforms.aperture.value =
      ((THREE.MathUtils.lerp(
        OVERVIEW_APERTURE,
        DETAIL_APERTURE,
        renderDetail,
      ) -
        LIGHT_OVERVIEW_APERTURE_DELTA * lightOverview) *
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
        this.overviewBadgeTexture?.version ?? 0,
        this.hoverBadgeInstance.value,
        this.hoverBadgeUniform.value?.version ?? 0,
      );
      state.floats(...this.camera.projectionMatrix.elements, ...this.camera.matrixWorldInverse.elements,
        ...this.camera.position.toArray(),
        fog.near, fog.far, lightOverview,
        this.studioSkyLight.intensity, this.scene.environmentIntensity,
        this.overviewTrackOffset.value.x, this.overviewTrackOffset.value.y,
        this.overviewSlotLightGain.value,
        ...this.overviewAreaLight.position.toArray(),
        this.overviewAreaLight.intensity,
        this.intro?.elapsed ?? -1,
        ...this.light.position.toArray(),
        this.light.intensity, ...this.light.target.position.toArray(),
        ...this.fillLight.position.toArray(), this.fillLight.intensity,
        bokehUniforms.focus.value, bokehUniforms.aperture.value);
      for (const light of this.overviewSlotLightsUniform.value) {
        state.floats(light.x, light.y, light.z);
      }
      this.scene.traverse(object => {
        state.add(object.id, Number(object.visible));
        if (!(object instanceof THREE.Mesh)) return;
        object.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, object.matrixWorld);
        object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
        state.floats(...object.modelViewMatrix.elements, ...object.normalMatrix.elements, ...object.matrixWorld.elements);
        const mat = object.material as THREE.MeshPhysicalMaterial;
        // Three increments material.version for its own double-sided transmission
        // passes. Track application-controlled inputs, not that render-side counter.
        state.add(object.geometry.id, mat.uuid, mat.map?.uuid, mat.map?.version ?? 0);
        state.floats(
          mat.opacity, mat.roughness, mat.metalness, mat.transmission, mat.thickness,
          mat.attenuationDistance, mat.clearcoat, mat.clearcoatRoughness,
          mat.color.r, mat.color.g, mat.color.b,
          mat.attenuationColor?.r ?? 0, mat.attenuationColor?.g ?? 0, mat.attenuationColor?.b ?? 0);
        for (const name of ['appearance', 'glassClarity'])
          state.floats(object.userData[name]?.value ?? 0);
        const slotLight = object.userData.slotLight as
          | OverviewSlotLightUniforms
          | undefined;
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
      if (!state.end()) { this.reusedFrames++; return; }
    }
    this.renderedFrames++;
    const shadow = this.shadowState;
    shadow.begin();
    shadow.add(this.light.shadow.mapSize.x, Number(this.renderer.shadowMap.enabled));
    shadow.floats(...this.light.matrixWorld.elements, ...this.light.target.matrixWorld.elements);
    this.scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
      shadow.add(object.id, object.geometry.id);
      shadow.floats(...object.matrixWorld.elements);
      if (object instanceof THREE.InstancedMesh) shadow.add(object.count, object.instanceMatrix.version);
    });
    // While the array only breathes, a one-frame-old shadow map is
    // indistinguishable; skipping it halves the cost of that pass.
    const shadowChanged = shadow.end() || this.light.shadow.needsUpdate;
    this.renderer.shadowMap.needsUpdate =
      shadowChanged && (!idle || this.shadowTick++ % 2 === 0);
    if (this.superPerformance) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
  /** 0 while the array is driven by input, approaches 1 once it only breathes. */
  get idleAmount() { return this.idleGain; }
  /** True while the array is in its settled breathing state. */
  get isIdle() { return this.idleNow; }
  /** Cheap wake signal for the frame governor and the idle settle timer. */
  wake() { this.lastInteraction = this.clock; }
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
      return [Math.round((p.x + 1) * this.container.clientWidth / 2), Math.round((1 - p.y) * this.container.clientHeight / 2)];
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
      selectedLane: Math.floor(this.selectedSlot / 32),
      selectedCell: { ...this.selectedCell },
      hoverCell: this.hoverCell ? { ...this.hoverCell } : null,
      hoverLifts: Object.fromEntries(this.hoverLifts),
      dragTrack: this.dragTrack ? { ...this.dragTrack } : null,
      archiveMomentum: this.archiveMomentum ? {
        phase: this.archiveMomentum.motion.phase,
        value: this.archiveMomentum.motion.value,
        velocity: this.archiveMomentum.motion.velocity,
      } : null,
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
      returnPhase: this.returnY !== null ? "aligning" : "lowering",
      extraction: Math.round(this.lift.value * 1000) / 1000,
      appearance: Math.round(ease(this.lift.value / OVERVIEW_LIFT) * 1000) / 1000,
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
              Math.round(this.slotUnderlights.directFor(cell) * 10000) /
              10000,
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
              Math.round(this.slotUnderlights.lateralFor(cell) * 10000) /
              10000,
            topRail:
              Math.round(this.slotUnderlights.topRailFor(cell) * 10000) /
              10000,
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
        intensity:
          Math.round(this.overviewAreaLight.intensity * 10000) / 10000,
        width: this.overviewAreaLight.width,
        height: this.overviewAreaLight.height,
      },
      returningAppearance: this.outgoing.map((o) => ({
        slot: o.slot,
        clarity: o.group.children.find(child => surfaceRole(child.userData.surface as string) === REVEAL_ROLE)?.userData.glassClarity?.value,
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
