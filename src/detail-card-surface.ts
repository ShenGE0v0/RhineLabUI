import {
  resolveRecordPrompt,
  type ArchiveCardStats,
  type ArchiveRecord,
} from "./data";

export type DetailFaceHotspot =
  | "note"
  | "copy-prompt"
  | "toggle-detail"
  | "cover"
  | "rating"
  | "downloads"
  | "comments";

export type PulloutCardHotspot =
  "card-close" | "card-copy-prompt" | "card-open-source" | "card-body";

export type DetailHotspot = DetailFaceHotspot | PulloutCardHotspot;

export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShowcaseStatRects {
  rating?: RectBox;
  downloads?: RectBox;
  comments?: RectBox;
}

export interface DetailSurfaceState {
  hovered: DetailHotspot | null;
  drawerOpen: boolean;
  copied: boolean;
  scrollY: number;
  interactive: boolean;
}

export interface PulloutCardLayout {
  maxScroll: number;
  closeRect: RectBox;
  copyPromptRect: RectBox | null;
  openSourceRect: RectBox | null;
  bodyRect: RectBox;
}

export const FACE_NOTE_RECT: RectBox = { x: 1116, y: 18, w: 880, h: 282 };
export const FACE_TOGGLE_BTN_RECT: RectBox = { x: 1708, y: 312, w: 288, h: 56 };
export const FACE_COVER_RECT: RectBox = { x: 48, y: 386, w: 1952, h: 1032 };

export const TOGGLE_BADGE_X = 1524;
export const TOGGLE_BADGE_Y = 276;
export const TOGGLE_BADGE_W = 512;
export const TOGGLE_BADGE_H = 128;
export const TOGGLE_CANVAS_SCALE = 2;
export const TOGGLE_CANVAS_W = TOGGLE_BADGE_W * TOGGLE_CANVAS_SCALE;
export const TOGGLE_CANVAS_H = TOGGLE_BADGE_H * TOGGLE_CANVAS_SCALE;
export const TOGGLE_PLANE_W = (TOGGLE_BADGE_W / 2048) * 4.724;
export const TOGGLE_PLANE_H = (TOGGLE_BADGE_H / 1485) * 3.426;
export const TOGGLE_LOCAL_X =
  -2.362 + ((TOGGLE_BADGE_X + TOGGLE_BADGE_W / 2) / 2048) * 4.724;
export const TOGGLE_LOCAL_Y =
  3.565 - ((TOGGLE_BADGE_Y + TOGGLE_BADGE_H / 2) / 1485) * 3.426;

export const STICKER_CANVAS_W = 1120;
export const STICKER_CANVAS_H = 364;
export const STICKER_W = 2.04;
export const STICKER_H = 0.66;
export const STICKER_SHADOW_PAD = 0.16;
export const STICKER_SHADOW_W = STICKER_W + STICKER_SHADOW_PAD * 2;
export const STICKER_SHADOW_H = STICKER_H + STICKER_SHADOW_PAD * 2;
export const STICKER_LOCAL_X = 1.23;
export const STICKER_LOCAL_Y = 3.22;
export const STICKER_TILT_Z = -0.007;

const STICKER_PAD = 16;
const STICKER_CONTENT_INSET = 26;
const STICKER_TEXT_X = STICKER_PAD + STICKER_CONTENT_INSET;
const STICKER_TEXT_RIGHT =
  STICKER_CANVAS_W - STICKER_PAD - STICKER_CONTENT_INSET;
const STICKER_TEXT_W = STICKER_TEXT_RIGHT - STICKER_TEXT_X;
const STICKER_HEADER_H = 46;
const STICKER_DESC_TITLE_Y = 111;
const STICKER_DESC_BODY_Y = 181;
const STICKER_BODY_LINE_H = 82;
const STICKER_DIVIDER_Y = 286;
const STICKER_FOOTER_Y = 331;
const STICKER_COPY_BTN_W = 264;
const STICKER_COPY_HIT_TOP = 289;
export const STICKER_COPY_UNDERLINE_Y = STICKER_FOOTER_Y + 5;
export const STICKER_COPY_UNDERLINE_H = 2.5;
const STICKER_COPY_HIT_BOTTOM =
  STICKER_COPY_UNDERLINE_Y + STICKER_COPY_UNDERLINE_H + 5;
export const STICKER_COPY_BTN_RECT: RectBox = {
  x: STICKER_TEXT_RIGHT - STICKER_COPY_BTN_W,
  y: STICKER_COPY_HIT_TOP,
  w: STICKER_COPY_BTN_W,
  h: STICKER_COPY_HIT_BOTTOM - STICKER_COPY_HIT_TOP,
};

export const PULLOUT_CANVAS_W = 1640;
export const PULLOUT_CANVAS_H = 1352;
export const PULLOUT_CARD_W = 4.1;
export const PULLOUT_CARD_H = 3.38;
export const PULLOUT_CARD_D = 0.024;

function inRect(
  x: number,
  y: number,
  r: RectBox | null | undefined,
  pad = 0,
): boolean {
  if (!r) return false;
  return (
    x >= r.x - pad &&
    x <= r.x + r.w + pad &&
    y >= r.y - pad &&
    y <= r.y + r.h + pad
  );
}

/** Break opportunities: Latin/number runs stay whole so words are never split. */
const WRAP_TOKEN = /[A-Za-z0-9]+(?:[.:'’/+×·-][A-Za-z0-9]+)*|\s+|[\s\S]/gu;

/** Pulls trailing tokens onto the final line so a block never ends with a widow. */
function avoidWidowLine(
  lines: string[],
  start: number,
  c: CanvasRenderingContext2D,
  maxWidth: number,
) {
  if (lines.length - start < 2) return;
  const lastIdx = lines.length - 1;
  const lastText = lines[lastIdx].trim();
  if (!lastText || lastText.length > 3) return;
  const tokens = lines[lastIdx - 1].match(WRAP_TOKEN);
  if (!tokens || tokens.length < 2) return;
  let moved = "";
  while (tokens.length > 1 && (moved + lastText).length <= 3) {
    moved = String(tokens.pop()) + moved;
  }
  if (!moved) return;
  if (/[A-Za-z0-9]$/.test(moved) && /^[A-Za-z0-9]/.test(lastText)) return;
  const prev = tokens.join("").trimEnd();
  const merged = (moved.trimStart() + lastText).trim();
  if (!prev || c.measureText(prev).width > maxWidth) return;
  if (c.measureText(merged).width > maxWidth) return;
  lines[lastIdx - 1] = prev;
  lines[lastIdx] = merged;
}

function wrapTextLines(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const paraStart = lines.length;
    if (!para.length) {
      lines.push("");
      if (maxLines && lines.length >= maxLines) break;
      continue;
    }
    let current = "";
    for (const token of para.match(WRAP_TOKEN) ?? []) {
      const candidate = current + token;
      if (current && c.measureText(candidate).width > maxWidth) {
        lines.push(current);
        if (maxLines && lines.length >= maxLines) break;
        current = token.trimStart();
      } else {
        current = candidate;
      }
      while (current && c.measureText(current).width > maxWidth) {
        const [head, tail] = splitTextToken(c, current, maxWidth, 1);
        lines.push(head);
        current = tail;
        if (maxLines && lines.length >= maxLines) break;
      }
      if (maxLines && lines.length >= maxLines) break;
    }
    if (maxLines && lines.length >= maxLines) {
      break;
    }
    if (current) lines.push(current);
    avoidWidowLine(lines, paraStart, c, maxWidth);
  }
  if (maxLines && lines.length > maxLines) {
    lines.length = maxLines;
  }
  if (maxLines && lines.length === maxLines) {
    const joined = paragraphs.join(" ").trim();
    const rendered = lines.join("").trim();
    if (joined.length > rendered.length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && c.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines.length ? lines : [""];
}

function splitTextToken(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  minimumCodePoints = 0,
): [head: string, tail: string] {
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length - 1;
  let fittingCount = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = characters.slice(0, middle).join("");
    if (c.measureText(candidate).width <= maxWidth) {
      fittingCount = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  fittingCount = Math.max(minimumCodePoints, fittingCount);
  return [
    characters.slice(0, fittingCount).join(""),
    characters.slice(fittingCount).join(""),
  ];
}

function ellipsizeStickerLine(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  const normalized = text.trimEnd();
  if (c.measureText(`${normalized}…`).width <= maxWidth) {
    return `${normalized}…`;
  }
  const characters = Array.from(normalized);
  let low = 0;
  let high = characters.length - 1;
  let fittingCount = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("").trimEnd()}…`;
    if (c.measureText(candidate).width <= maxWidth) {
      fittingCount = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return `${characters.slice(0, fittingCount).join("").trimEnd()}…`;
}

/**
 * Sticker-only two-line wrapper. Long tokens are split by measured width
 * instead of being stretched by fillText(), and an ellipsis is added only
 * when content beyond the two visible lines is discarded.
 */
function wrapStickerTextLines(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const paragraphs = text.trim().split(/\r?\n/);
  const lines: string[] = [];
  let truncated = false;

  outer: for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    if (!paragraph.length) {
      lines.push("");
      continue;
    }

    const paragraphStart = lines.length;
    const tokens = paragraph.match(WRAP_TOKEN) ?? [];
    let tokenIndex = 0;
    while (tokenIndex < tokens.length) {
      if (lines.length >= maxLines) {
        truncated = true;
        break outer;
      }

      let line = "";
      while (tokenIndex < tokens.length) {
        let token = tokens[tokenIndex];
        if (!line) token = token.trimStart();
        if (!token) {
          tokenIndex += 1;
          continue;
        }

        const candidate = line + token;
        if (c.measureText(candidate).width <= maxWidth) {
          line = candidate;
          tokenIndex += 1;
          continue;
        }

        if (c.measureText(token).width > maxWidth) {
          const availableWidth = maxWidth - c.measureText(line).width;
          const [head, tail] = splitTextToken(c, token, availableWidth);
          if (head) {
            line += head;
            tokens[tokenIndex] = tail.trimStart();
            if (!tokens[tokenIndex]) tokenIndex += 1;
            break;
          }
        }
        if (line) break;

        const characters = Array.from(token);
        line = characters[0] ?? "";
        tokens[tokenIndex] = characters.slice(1).join("").trimStart();
        if (!tokens[tokenIndex]) tokenIndex += 1;
        break;
      }

      if (line) lines.push(line.trimEnd());
    }

    if (lines.length - paragraphStart === maxLines) {
      avoidWidowLine(lines, paragraphStart, c, maxWidth);
    }
  }

  if (truncated && lines.length) {
    const lastIndex = Math.min(lines.length, maxLines) - 1;
    lines[lastIndex] = ellipsizeStickerLine(c, lines[lastIndex], maxWidth);
  }
  return lines.length ? lines : [""];
}

let cachedGrainCanvas: HTMLCanvasElement | null = null;

function getPaperGrainCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (cachedGrainCanvas) return cachedGrainCanvas;
  const tile = document.createElement("canvas");
  tile.width = 96;
  tile.height = 96;
  const tc = tile.getContext("2d");
  if (!tc) return null;
  const img = tc.createImageData(96, 96);
  const d = img.data;
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < d.length; i += 4) {
    const v = nextRand();
    if (v > 0.78) {
      d[i] = 128;
      d[i + 1] = 114;
      d[i + 2] = 94;
      d[i + 3] = Math.round((v - 0.78) * 48);
    } else if (v < 0.14) {
      d[i] = 255;
      d[i + 1] = 250;
      d[i + 2] = 240;
      d[i + 3] = Math.round((0.14 - v) * 52);
    }
  }
  tc.putImageData(img, 0, 0);
  cachedGrainCanvas = tile;
  return tile;
}

function roundedRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rad);
  c.lineTo(x + w, y + h - rad);
  c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  c.lineTo(x + rad, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rad);
  c.lineTo(x, y + rad);
  c.quadraticCurveTo(x, y, x + rad, y);
  c.closePath();
}

/**
 * Reserves the frosted glass plate region beneath the 3D top-right sticker for
 * the standalone 3D "查看详情 →" / "收起详情 ←" toggle mesh (detail mode only).
 */
export function drawDetailToggleTrigger(
  _c: CanvasRenderingContext2D,
  state: DetailSurfaceState,
): number {
  if (!state.interactive) {
    return FACE_NOTE_RECT.y + FACE_NOTE_RECT.h;
  }
  return FACE_TOGGLE_BTN_RECT.y + FACE_TOGGLE_BTN_RECT.h;
}

/**
 * Renders the borderless "查看详情 →" / "收起详情 ←" trigger onto its dedicated
 * HiDPI transparent canvas so entrance, exit, and switch mist dissolves animate
 * independently without redrawing the full cassette face canvas.
 */
export function drawStandaloneDetailToggle(
  canvas: HTMLCanvasElement,
  options: { drawerOpen: boolean; hovered: boolean },
) {
  if (canvas.width !== TOGGLE_CANVAS_W) canvas.width = TOGGLE_CANVAS_W;
  if (canvas.height !== TOGGLE_CANVAS_H) canvas.height = TOGGLE_CANVAS_H;
  const c = canvas.getContext("2d");
  if (!c) return;

  const hoveredToggle = options.hovered;
  const toggleLabel = options.drawerOpen ? "收起详情 ←" : "查看详情 →";
  const toggleShift = hoveredToggle ? (options.drawerOpen ? -6 : 6) : 0;
  const toggleRight =
    FACE_NOTE_RECT.x + FACE_NOTE_RECT.w - TOGGLE_BADGE_X + toggleShift;
  const toggleBaselineY = FACE_TOGGLE_BTN_RECT.y + 40 - TOGGLE_BADGE_Y;

  c.save();
  c.setTransform(TOGGLE_CANVAS_SCALE, 0, 0, TOGGLE_CANVAS_SCALE, 0, 0);
  c.clearRect(0, 0, TOGGLE_BADGE_W, TOGGLE_BADGE_H);
  c.textAlign = "right";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#ffffff";
  c.font = hoveredToggle
    ? "700 41px MiSans, sans-serif"
    : "600 40px MiSans, sans-serif";
  c.fillText(toggleLabel, toggleRight, toggleBaselineY);
  if (hoveredToggle) {
    const tw = c.measureText(toggleLabel).width;
    c.fillRect(toggleRight - tw, toggleBaselineY + 8, tw, 2.5);
  }
  c.restore();
}

/**
 * Draws the Plan B 3D industrial die-cut archive sticker (white die-cut rim,
 * rounded corners, subtle matte alabaster paper grain, industrial index strip,
 * Abstract + First-Turn Prompt with borderless Copy trigger).
 */
export function drawIndustrialDieCutSticker(
  canvas: HTMLCanvasElement,
  record: ArchiveRecord | undefined,
  state: DetailSurfaceState,
  scale = 1,
) {
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return;

  const w = STICKER_CANVAS_W;
  const h = STICKER_CANVAS_H;
  const hoveredNote = state.interactive && state.hovered === "note";
  const hoveredCopy = state.interactive && state.hovered === "copy-prompt";
  const lifted = hoveredNote || hoveredCopy;

  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  // Pre-fill entire canvas with bright die-cut base color before applying
  // destination-in mask so anti-aliased transparent edge pixels carry ivory
  // RGB rather than transparent black (eliminates dark bilinear edge fringes).
  c.fillStyle = lifted ? "#ffffff" : "#fcfaf5";
  c.fillRect(0, 0, w, h);

  // Subtle die-cut edge hairline & inner bevel catchlight aligned to mask
  roundedRectPath(c, 5, 5, w - 10, h - 10, 21);
  c.strokeStyle = lifted ? "rgba(43, 40, 35, 0.36)" : "rgba(88, 76, 62, 0.28)";
  c.lineWidth = 2;
  c.stroke();

  roundedRectPath(c, 7, 7, w - 14, h - 14, 19);
  c.strokeStyle = "rgba(255, 255, 255, 0.92)";
  c.lineWidth = 1.5;
  c.stroke();

  // Inner printed label plate (16px white die-cut margin for clear vinyl framing)
  const pad = STICKER_PAD;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  roundedRectPath(c, pad, pad, innerW, innerH, 10);
  c.fillStyle = lifted ? "#f4efe5" : "#efe9dd";
  c.fill();

  // Subtle paper-tooth texture clipped inside the inner plate
  const grain = getPaperGrainCanvas();
  if (grain) {
    const pattern = c.createPattern(grain, "repeat");
    if (pattern) {
      c.save();
      roundedRectPath(c, pad, pad, innerW, innerH, 10);
      c.clip();
      c.fillStyle = pattern;
      c.fillRect(pad, pad, innerW, innerH);
      c.restore();
    }
  }

  c.strokeStyle = "rgba(82, 68, 52, 0.22)";
  c.lineWidth = 1.5;
  roundedRectPath(c, pad, pad, innerW, innerH, 10);
  c.stroke();

  // Industrial archival header strip (clipped to top corners of inner plate)
  c.save();
  roundedRectPath(c, pad, pad, innerW, innerH, 10);
  c.clip();
  const stripH = STICKER_HEADER_H;
  c.fillStyle = "#e4dccd";
  c.fillRect(pad, pad, innerW, stripH);

  // Short charcoal-amber index bar at far left
  c.fillStyle = "#8c6d46";
  c.fillRect(pad, pad, 8, stripH);

  // Micro monospace label tag
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillStyle = "#5a4e41";
  c.font = "600 26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  c.fillText(
    `ARCHIVE LABEL  ·  ${record?.id || "X-000"}`,
    STICKER_TEXT_X,
    pad + stripH / 2 + 1,
  );

  // Fine technical registration cross on right of strip
  const rx = STICKER_TEXT_RIGHT;
  const ry = pad + stripH / 2;
  c.strokeStyle = "rgba(90, 78, 65, 0.52)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(rx - 6, ry);
  c.lineTo(rx + 6, ry);
  c.moveTo(rx, ry - 6);
  c.lineTo(rx, ry + 6);
  c.stroke();

  // Bottom border of header strip
  c.strokeStyle = "rgba(82, 68, 52, 0.18)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(pad, pad + stripH);
  c.lineTo(w - pad, pad + stripH);
  c.stroke();
  c.restore();

  const textX = STICKER_TEXT_X;
  const textW = STICKER_TEXT_W;

  // Section 1: prominent description preview
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#655747";
  c.font = "600 38px MiSans, sans-serif";
  c.fillText("描述", textX, STICKER_DESC_TITLE_Y);

  c.fillStyle = "#171410";
  c.font = "600 68px MiSans, sans-serif";
  const abstractText = record?.abstract?.trim() || "暂无作品简介。";
  const abstractLines = wrapStickerTextLines(c, abstractText, textW, 2);
  abstractLines.forEach((line, idx) => {
    c.fillText(line, textX, STICKER_DESC_BODY_Y + idx * STICKER_BODY_LINE_H);
  });

  // Fine dashed industrial divider
  c.save();
  c.setLineDash([6, 4]);
  c.strokeStyle = "rgba(82, 68, 52, 0.24)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(textX, STICKER_DIVIDER_Y);
  c.lineTo(STICKER_TEXT_RIGHT, STICKER_DIVIDER_Y);
  c.stroke();
  c.restore();

  if (state.interactive && resolveRecordPrompt(record)) {
    const copyLabel = state.copied ? "已复制 ✓" : "复制提示词";
    c.textAlign = "right";
    c.fillStyle = state.copied
      ? "#2f523c"
      : hoveredCopy
        ? "#171410"
        : "#3d352c";
    c.font =
      hoveredCopy || state.copied
        ? "700 43px MiSans, sans-serif"
        : "600 42px MiSans, sans-serif";
    const copyRight = STICKER_TEXT_RIGHT;
    c.fillText(copyLabel, copyRight, STICKER_FOOTER_Y);
    if (hoveredCopy && !state.copied) {
      const cw = c.measureText(copyLabel).width;
      c.fillRect(
        copyRight - cw,
        STICKER_COPY_UNDERLINE_Y,
        cw,
        STICKER_COPY_UNDERLINE_H,
      );
    }
  }

  // Smooth anti-aliased rounded die-cut silhouette mask (preserves warm ivory RGB)
  c.save();
  c.globalCompositeOperation = "destination-in";
  roundedRectPath(c, 4, 4, w - 8, h - 8, 22);
  c.fillStyle = "#000000";
  c.fill();
  c.restore();

  c.restore();
}

/**
 * Renders the solid matte off-white adhesive paper backing matching the exact
 * die-cut rounded silhouette (prevents mirrored text bleeding on BackSide).
 */
export function drawStickerBackMask(canvas: HTMLCanvasElement) {
  canvas.width = 560;
  canvas.height = 182;
  const c = canvas.getContext("2d");
  if (!c) return;
  const w = canvas.width;
  const h = canvas.height;
  c.fillStyle = "#ece7dc";
  c.fillRect(0, 0, w, h);
  c.save();
  c.globalCompositeOperation = "destination-in";
  roundedRectPath(c, 2, 2, w - 4, h - 4, 11);
  c.fillStyle = "#000000";
  c.fill();
  c.restore();
}

/**
 * Renders the independent soft perimeter contact shadow beneath the 3D sticker
 * plane on an isotropic 1:1 world-pixel canvas, using pure off-canvas Gaussian
 * shadow casting so zero hard edges or aspect-ratio seams appear around any
 * corner. The dynamic peeling-corner shadow wedge is composited analytically
 * in the sticker shadow shader driven by live peel deformation.
 */
export function drawStickerContactShadow(canvas: HTMLCanvasElement) {
  const pxPerUnit = 320;
  const w = Math.round(STICKER_SHADOW_W * pxPerUnit);
  const h = Math.round(STICKER_SHADOW_H * pxPerUnit);
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, w, h);

  const insetX = (4 / STICKER_CANVAS_W) * STICKER_W;
  const insetY = (4 / STICKER_CANVAS_H) * STICKER_H;
  const sx = (STICKER_SHADOW_PAD + insetX) * pxPerUnit;
  const sy = (STICKER_SHADOW_PAD + insetY) * pxPerUnit;
  const sw = (STICKER_W - insetX * 2) * pxPerUnit;
  const sh = (STICKER_H - insetY * 2) * pxPerUnit;
  const sr = (22 / STICKER_CANVAS_W) * STICKER_W * pxPerUnit;

  const offscreen = w + 256;

  // 1. Tight perimeter contact shadow hugging all four die-cut edges & corners
  c.save();
  c.translate(-offscreen, 0);
  c.shadowColor = "rgba(26, 20, 14, 0.18)";
  c.shadowBlur = 4.5;
  c.shadowOffsetX = offscreen + 0.8;
  c.shadowOffsetY = 2.0;
  c.fillStyle = "#000000";
  roundedRectPath(c, sx + 1, sy + 1, sw - 2, sh - 2, Math.max(2, sr - 1));
  c.fill();
  c.restore();

  // 2. Soft ambient elevation shadow
  c.save();
  c.translate(-offscreen, 0);
  c.shadowColor = "rgba(26, 20, 14, 0.10)";
  c.shadowBlur = 13;
  c.shadowOffsetX = offscreen + 1.6;
  c.shadowOffsetY = 5.0;
  c.fillStyle = "#000000";
  roundedRectPath(c, sx + 1.5, sy + 1.5, sw - 3, sh - 3, Math.max(2, sr - 1.5));
  c.fill();
  c.restore();
}

export function hitTestStickerFace(
  sx: number,
  sy: number,
  hasPrompt: boolean,
): DetailFaceHotspot | null {
  if (sx < 0 || sx > STICKER_CANVAS_W || sy < 0 || sy > STICKER_CANVAS_H) {
    return null;
  }
  if (hasPrompt && inRect(sx, sy, STICKER_COPY_BTN_RECT)) return "copy-prompt";
  return "note";
}

/**
 * Draws subtle borderless hover feedback across interactive elements on the
 * cassette front plate during detail inspection.
 */
export function drawFaceHoverAccents(
  c: CanvasRenderingContext2D,
  state: DetailSurfaceState,
  coverRect: RectBox,
  statsRects: ShowcaseStatRects,
  hasPhoto: boolean,
) {
  if (!state.interactive || !state.hovered) return;
  c.save();

  if (state.hovered === "cover") {
    const label = "打开原作品 ↗";
    c.font = "600 26px MiSans, sans-serif";
    c.textAlign = "right";
    c.textBaseline = "middle";
    const lx = coverRect.x + coverRect.w - 44;
    const ly = coverRect.y + coverRect.h - 48;
    if (hasPhoto) {
      c.lineWidth = 4;
      c.strokeStyle = "rgba(23, 16, 10, 0.82)";
      c.strokeText(label, lx, ly);
      c.fillStyle = "#ebe3d6";
    } else {
      c.fillStyle = "#2b2823";
    }
    c.fillText(label, lx, ly);
  } else if (
    state.hovered === "rating" ||
    state.hovered === "downloads" ||
    state.hovered === "comments"
  ) {
    const r = statsRects[state.hovered];
    if (r) {
      c.fillStyle = hasPhoto ? "#ebe3d6" : "#2b2823";
      c.fillRect(r.x, r.y + r.h + 4, r.w, 2.5);
    }
  }

  c.restore();
}

export function hitTestDetailFace(
  px: number,
  py: number,
  statsRects: ShowcaseStatRects,
): DetailFaceHotspot | null {
  if (inRect(px, py, FACE_TOGGLE_BTN_RECT, 8)) return "toggle-detail";
  if (inRect(px, py, statsRects.rating, 14)) return "rating";
  if (inRect(px, py, statsRects.downloads, 14)) return "downloads";
  if (inRect(px, py, statsRects.comments, 14)) return "comments";
  if (inRect(px, py, FACE_COVER_RECT, 0)) return "cover";
  return null;
}

/**
 * Renders the physical warm cotton-paper pull-out card slid out from the right
 * edge of the cassette. Pure borderless typography on warm paper, returning
 * exact scrollable bounds & dynamic button hit rects.
 */
export function drawPulloutDetailCard(
  canvas: HTMLCanvasElement,
  record: ArchiveRecord | undefined,
  providerLogo: HTMLImageElement | undefined,
  stats: Required<ArchiveCardStats>,
  state: DetailSurfaceState,
): PulloutCardLayout {
  const c = canvas.getContext("2d", { willReadFrequently: true });
  const padX = 88;
  const closeRect: RectBox = {
    x: PULLOUT_CANVAS_W - 220,
    y: 54,
    w: 140,
    h: 48,
  };
  const bodyRect: RectBox = {
    x: padX,
    y: 356,
    w: PULLOUT_CANVAS_W - padX * 2,
    h: PULLOUT_CANVAS_H - 356 - 116,
  };
  const fallback: PulloutCardLayout = {
    maxScroll: 0,
    closeRect,
    copyPromptRect: null,
    openSourceRect: null,
    bodyRect,
  };
  if (!c) return fallback;

  const w = PULLOUT_CANVAS_W;
  const h = PULLOUT_CANVAS_H;
  const contentW = bodyRect.w;

  c.save();
  c.clearRect(0, 0, w, h);

  // Warm archival cotton paper base
  c.fillStyle = "#fbf8f1";
  c.fillRect(0, 0, w, h);

  // Subtle left-edge ambient occlusion where card emerges from the cassette
  const slotGrad = c.createLinearGradient(0, 0, 44, 0);
  slotGrad.addColorStop(0, "rgba(43, 40, 35, 0.08)");
  slotGrad.addColorStop(1, "rgba(43, 40, 35, 0)");
  c.fillStyle = slotGrad;
  c.fillRect(0, 0, 44, h);

  // Crisp paper perimeter hairline
  c.strokeStyle = "rgba(92, 78, 62, 0.28)";
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, w - 3, h - 3);

  // Top metadata & borderless Close action
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#5c5246";
  c.font = "600 26px MiSans, sans-serif";
  const metaParts = [
    record?.id || "X-000",
    record?.category || "ARCHIVE",
    record?.date || "0000-00-00",
  ];
  c.fillText(metaParts.join("   ·   "), padX, 88);

  const hoverClose = state.hovered === "card-close";
  c.textAlign = "right";
  c.fillStyle = hoverClose ? "#171410" : "#3d352c";
  c.font = hoverClose
    ? "700 30px MiSans, sans-serif"
    : "600 30px MiSans, sans-serif";
  const closeRight = w - padX;
  c.fillText("收起 ←", closeRight, 88);
  if (hoverClose) {
    const cw = c.measureText("收起 ←").width;
    c.fillRect(closeRight - cw, 95, cw, 2.5);
  }

  // Title + model header
  c.textAlign = "left";
  c.fillStyle = "#171410";
  c.font = "700 58px MiSans, sans-serif";
  const titleLines = wrapTextLines(
    c,
    record?.title?.trim() || "未命名作品",
    contentW,
    2,
  );
  titleLines.forEach((line, idx) => {
    c.fillText(line, padX, 174 + idx * 68);
  });
  const afterTitleY = 174 + (titleLines.length - 1) * 68 + 48;

  let subX = padX;
  if (providerLogo && providerLogo.naturalWidth > 0) {
    const lh = 34;
    const lw = (providerLogo.naturalWidth / providerLogo.naturalHeight) * lh;
    c.drawImage(providerLogo, subX, afterTitleY - 26, lw, lh);
    subX += lw + 16;
  }
  c.fillStyle = "#4a4035";
  c.font = "600 28px MiSans, sans-serif";
  const subParts = [
    record?.en?.trim() || "未标注模型",
    record?.department && record.department !== "未标注"
      ? record.department
      : null,
    record?.lead ? `作者：${record.lead}` : null,
  ].filter(Boolean);
  c.fillText(subParts.join("   ·   "), subX, afterTitleY);

  // Adjust bodyTop smoothly below header
  const dynamicBodyTop = Math.max(bodyRect.y, afterTitleY + 46);
  const dynamicBodyH = h - dynamicBodyTop - 116;
  const activeBodyRect: RectBox = {
    x: padX,
    y: dynamicBodyTop,
    w: contentW,
    h: dynamicBodyH,
  };

  c.strokeStyle = "rgba(92, 78, 62, 0.22)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(padX, dynamicBodyTop - 22);
  c.lineTo(w - padX, dynamicBodyTop - 22);
  c.stroke();

  // Measure body sections first so scroll bounds & hotspot coords match 1:1
  c.font = "500 34px MiSans, sans-serif";
  const descText = record?.abstract?.trim() || "暂无作品简介。";
  const descLines = wrapTextLines(c, descText, contentW);

  c.font = "500 32px MiSans, sans-serif";
  const promptText = resolveRecordPrompt(record);
  const promptLines = wrapTextLines(c, promptText || "暂无首轮提示词。", contentW - 44);

  const findingsList =
    record?.findings && record.findings.length ? [...record.findings] : [];
  const statsLine = `评分 ${stats.sample}   ·   下载 ${stats.downloads}   ·   评论 ${stats.comments}`;

  const descTitleH = 40;
  const descBodyH = descLines.length * 50;
  const gap1 = 36;
  const promptTitleH = 44;
  const promptBoxPad = 24;
  const promptBoxH = promptBoxPad * 2 + promptLines.length * 46;
  const gap2 = 40;
  const findingsTitleH = 40;
  c.font = "500 30px MiSans, sans-serif";
  const findingsLines: string[] = [];
  for (const item of findingsList) {
    const wrapped = wrapTextLines(c, `•  ${item}`, contentW);
    findingsLines.push(...wrapped);
  }
  findingsLines.push(...wrapTextLines(c, `•  ${statsLine}`, contentW));
  const findingsBodyH = findingsLines.length * 46;

  const totalContentH =
    14 +
    descTitleH +
    descBodyH +
    gap1 +
    promptTitleH +
    promptBoxH +
    gap2 +
    findingsTitleH +
    findingsBodyH +
    20;

  const maxScroll = Math.max(0, totalContentH - dynamicBodyH);
  const clampedScroll = Math.max(0, Math.min(maxScroll, state.scrollY));

  let copyPromptRect: RectBox | null = null;

  c.save();
  c.beginPath();
  c.rect(padX - 4, dynamicBodyTop, contentW + 8, dynamicBodyH);
  c.clip();

  let cursorY = dynamicBodyTop + 34 - clampedScroll;

  // 描述 section
  c.fillStyle = "#4a4035";
  c.font = "700 28px MiSans, sans-serif";
  c.fillText("描述", padX, cursorY);
  cursorY += descTitleH;

  c.fillStyle = "#171410";
  c.font = "500 34px MiSans, sans-serif";
  for (const line of descLines) {
    c.fillText(line, padX, cursorY);
    cursorY += 50;
  }
  cursorY += gap1;

  // 第一轮提示词 section
  c.fillStyle = "#4a4035";
  c.font = "700 28px MiSans, sans-serif";
  c.fillText("第一轮提示词", padX, cursorY);

  const hoverCardCopy = Boolean(promptText) && state.hovered === "card-copy-prompt";
  if (promptText) {
    const cardCopyLabel = state.copied ? "已复制 ✓" : "复制提示词";
    c.textAlign = "right";
    c.fillStyle = state.copied
      ? "#2f523c"
      : hoverCardCopy
        ? "#171410"
        : "#3d352c";
    c.font =
      hoverCardCopy || state.copied
        ? "700 26px MiSans, sans-serif"
        : "600 26px MiSans, sans-serif";
    const cwText = c.measureText(cardCopyLabel).width;
    c.fillText(cardCopyLabel, w - padX, cursorY);
    if (hoverCardCopy && !state.copied) {
      c.fillRect(w - padX - cwText, cursorY + 6, cwText, 2.5);
    }
    const buttonTop = Math.max(cursorY - 30, dynamicBodyTop);
    const buttonBottom = Math.min(cursorY + 12, dynamicBodyTop + dynamicBodyH);
    if (buttonTop < buttonBottom) {
      copyPromptRect = {
        x: w - padX - cwText - 14,
        y: buttonTop,
        w: cwText + 28,
        h: buttonBottom - buttonTop,
      };
    }
  }

  cursorY += promptTitleH - 12;

  // Subtle hairline prompt container
  c.textAlign = "left";
  c.fillStyle = hoverCardCopy ? "#fffaf0" : "#f5efe3";
  c.fillRect(padX, cursorY, contentW, promptBoxH);
  c.strokeStyle = hoverCardCopy
    ? "rgba(23, 20, 16, 0.45)"
    : "rgba(92, 78, 62, 0.25)";
  c.lineWidth = 2;
  c.strokeRect(padX, cursorY, contentW, promptBoxH);

  c.fillStyle = "#171410";
  c.font = "500 32px MiSans, sans-serif";
  let pyLine = cursorY + promptBoxPad + 28;
  for (const line of promptLines) {
    c.fillText(line, padX + 22, pyLine);
    pyLine += 46;
  }
  cursorY += promptBoxH + gap2;

  // 档案记录 section
  c.fillStyle = "#4a4035";
  c.font = "700 28px MiSans, sans-serif";
  c.fillText("档案记录", padX, cursorY);
  cursorY += findingsTitleH;

  c.fillStyle = "#2b2823";
  c.font = "500 30px MiSans, sans-serif";
  for (const line of findingsLines) {
    c.fillText(line, padX, cursorY);
    cursorY += 46;
  }

  c.restore();

  // Minimalist scrollbar thumb if scrollable
  if (maxScroll > 0) {
    const trackX = w - padX + 26;
    const trackH = dynamicBodyH;
    const thumbH = Math.max(48, (dynamicBodyH / totalContentH) * trackH);
    const thumbY =
      dynamicBodyTop + (clampedScroll / maxScroll) * (trackH - thumbH);
    c.fillStyle = "rgba(92, 78, 62, 0.16)";
    c.fillRect(trackX, dynamicBodyTop, 4, trackH);
    c.fillStyle = "rgba(43, 40, 35, 0.5)";
    c.fillRect(trackX, thumbY, 4, thumbH);
  }

  // Footer hairline & source action
  const footerLineY = h - 98;
  c.strokeStyle = "rgba(92, 78, 62, 0.22)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(padX, footerLineY);
  c.lineTo(w - padX, footerLineY);
  c.stroke();

  c.textAlign = "left";
  c.fillStyle = "#5c5246";
  c.font = "500 24px MiSans, sans-serif";
  let hostText = "DEEPDEMOS ARCHIVE RECORD";
  if (record?.source) {
    try {
      hostText = new URL(record.source).hostname;
    } catch {
      hostText = record.source;
    }
  }
  c.fillText(hostText, padX, h - 42);

  let openSourceRect: RectBox | null = null;
  if (record?.source) {
    const hoverOpen = state.hovered === "card-open-source";
    const openLabel = "打开原作品 ↗";
    c.textAlign = "right";
    c.fillStyle = hoverOpen ? "#171410" : "#3d352c";
    c.font = hoverOpen
      ? "700 28px MiSans, sans-serif"
      : "600 28px MiSans, sans-serif";
    const ow = c.measureText(openLabel).width;
    c.fillText(openLabel, w - padX, h - 42);
    if (hoverOpen) {
      c.fillRect(w - padX - ow, h - 35, ow, 2.5);
    }
    openSourceRect = {
      x: w - padX - ow - 14,
      y: h - 76,
      w: ow + 28,
      h: 48,
    };
  }

  c.restore();
  return {
    maxScroll,
    closeRect,
    copyPromptRect,
    openSourceRect,
    bodyRect: activeBodyRect,
  };
}

export function hitTestPulloutCard(
  cx: number,
  cy: number,
  layout: PulloutCardLayout,
): PulloutCardHotspot | null {
  if (cx < 0 || cx > PULLOUT_CANVAS_W || cy < 0 || cy > PULLOUT_CANVAS_H) {
    return null;
  }
  if (inRect(cx, cy, layout.closeRect, 10)) return "card-close";
  if (inRect(cx, cy, layout.copyPromptRect)) return "card-copy-prompt";
  if (inRect(cx, cy, layout.openSourceRect, 6)) return "card-open-source";
  if (inRect(cx, cy, layout.bodyRect, 0)) return "card-body";
  return null;
}
