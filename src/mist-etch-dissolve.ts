export const MIST_SVG_NS = "http://www.w3.org/2000/svg";
export const MIST_ETCH_STRATA = 8;
export const MIST_HIDE_DURATION_MS = 820;
export const MIST_RETURN_DURATION_MS = 720;
export const MIST_SWITCH_DURATION_MS = 520;

export interface EtchMaskHandle {
  id: string;
  mask: SVGMaskElement;
  paths: SVGPathElement[];
  opacities: Float32Array;
}

export type MistDissolveVariant = "icon" | "text" | "cover";
export type MistDissolveMode = "state" | "switch";

export function clamp01(value: number): number {
  return !(value > 0) ? 0 : value >= 1 ? 1 : value;
}

export function easeMistReveal(t: number): number {
  return (1 - Math.cos(t * Math.PI)) * 0.5;
}

export function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function cellHash(col: number, row: number, seed: number): number {
  let h =
    Math.imul(col + 1, 374761393) ^
    Math.imul(row + 1, 668265263) ^
    Math.imul(seed + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Creates a padded `objectBoundingBox` diagonal micro-etch SVG `<mask>`
 * pre-bucketed into 8 strata so dissolves animate smoothly by updating only
 * `fill-opacity` attributes without rebuilding path geometry per frame.
 */
export function createEtchMask(
  id: string,
  cols: number,
  rows: number,
  seed: number,
): EtchMaskHandle {
  const mask = document.createElementNS(MIST_SVG_NS, "mask");
  mask.id = id;
  mask.setAttribute("maskUnits", "objectBoundingBox");
  mask.setAttribute("maskContentUnits", "objectBoundingBox");
  mask.setAttribute("x", "-0.18");
  mask.setAttribute("y", "-0.28");
  mask.setAttribute("width", "1.36");
  mask.setAttribute("height", "1.56");
  mask.setAttribute("shape-rendering", "crispEdges");

  const minX = -0.18;
  const minY = -0.28;
  const totalW = 1.36;
  const totalH = 1.56;
  const cellW = totalW / cols;
  const cellH = totalH / rows;
  const cw = (cellW + 0.002).toFixed(4);
  const ch = (cellH + 0.002).toFixed(4);
  const buckets: string[][] = Array.from({ length: MIST_ETCH_STRATA }, () => []);

  for (let r = 0; r < rows; r++) {
    const ny = rows > 1 ? r / (rows - 1) : 0.5;
    const py = (minY + r * cellH).toFixed(4);
    for (let c = 0; c < cols; c++) {
      const nx = cols > 1 ? c / (cols - 1) : 0.5;
      const px = (minX + c * cellW).toFixed(4);
      const score = nx * 0.45 + ny * 0.15 + cellHash(c, r, seed) * 0.4;
      const idx = Math.min(MIST_ETCH_STRATA - 1, Math.floor(score * MIST_ETCH_STRATA));
      buckets[idx].push(`M${px} ${py}h${cw}v${ch}h-${cw}Z`);
    }
  }

  const paths: SVGPathElement[] = [];
  for (let i = 0; i < MIST_ETCH_STRATA; i++) {
    const path = document.createElementNS(MIST_SVG_NS, "path");
    path.setAttribute("fill", "#ffffff");
    path.setAttribute("fill-opacity", "1");
    if (buckets[i].length > 0) {
      path.setAttribute("d", buckets[i].join(""));
    }
    mask.append(path);
    paths.push(path);
  }

  return {
    id,
    mask,
    paths,
    opacities: new Float32Array(MIST_ETCH_STRATA).fill(1),
  };
}

export function applyEtchMask(
  handle: EtchMaskHandle,
  progress: number,
  hiding: boolean,
): void {
  const edgeHalf = 0.18;
  for (let i = 0; i < MIST_ETCH_STRATA; i++) {
    const center = (i + 0.5) / MIST_ETCH_STRATA;
    const mapped = progress * (1 + edgeHalf * 2) - edgeHalf;
    const reveal = smoothstep(center - edgeHalf, center + edgeHalf, mapped);
    const opacity = hiding ? 1 - reveal : reveal;
    if (
      Math.abs(opacity - handle.opacities[i]) > 0.005 ||
      ((opacity <= 0 || opacity >= 1) && handle.opacities[i] !== opacity)
    ) {
      handle.opacities[i] = opacity;
      handle.paths[i].setAttribute(
        "fill-opacity",
        opacity <= 0 ? "0" : opacity >= 1 ? "1" : opacity.toFixed(3),
      );
    }
  }
}

export function bindEtchMask(
  el: HTMLElement | undefined,
  mask: EtchMaskHandle | undefined,
  _hiding = false,
): void {
  if (!el || !mask) return;
  const value = `url(#${mask.id})`;
  el.style.setProperty("mask-image", value);
  el.style.setProperty("-webkit-mask-image", value);
  mask.opacities.fill(-1);
}

/**
 * Applies coordinated micro-etch masking, optical blur/bloom condensation, and
 * subtle vertical depth lift to a target icon, typography, or cover element.
 */
export function applyMistEtchDissolve(
  el: HTMLElement | undefined,
  mask: EtchMaskHandle | undefined,
  localT: number,
  hiding: boolean,
  variant: MistDissolveVariant,
  mode: MistDissolveMode = "state",
): void {
  if (!el || !mask) return;
  applyEtchMask(mask, localT, hiding);

  const isIcon = variant === "icon";
  const isCover = variant === "cover";
  const isSwitch = mode === "switch";
  const motionT = hiding ? easeOutQuad(localT) : easeOutCubic(localT);

  const dyMag = isSwitch
    ? isCover
      ? 7.5
      : isIcon
        ? 5.5
        : 6.5
    : isCover
      ? 12
      : isIcon
        ? hiding
          ? 9
          : 10
        : hiding
          ? 11
          : 12;
  const scaleDelta = isSwitch
    ? isCover
      ? 0.022
      : isIcon
        ? 0.045
        : 0.028
    : isCover
      ? 0.032
      : isIcon
        ? hiding
          ? 0.08
          : 0.1
        : 0.045;
  const blurMax = isSwitch
    ? isCover
      ? hiding
        ? 6.0
        : 5.5
      : isIcon
        ? hiding
          ? 4.5
          : 4.2
        : hiding
          ? 5.0
          : 4.8
    : isCover
      ? hiding
        ? 7.5
        : 6.0
      : isIcon
        ? hiding
          ? 5.5
          : 5.0
        : hiding
          ? 6.5
          : 5.5;
  const bloomPeak = isSwitch
    ? hiding
      ? 0.1
      : 0.13
    : hiding
      ? isCover
        ? 0.12
        : 0.14
      : isCover
        ? 0.15
        : 0.18;

  const dy = hiding ? -motionT * dyMag : (1 - motionT) * dyMag;
  const scale = hiding
    ? 1 - scaleDelta * motionT
    : 1 - scaleDelta + scaleDelta * motionT;
  const blur = hiding ? motionT * blurMax : (1 - motionT) * blurMax;
  const bloom = 1 + Math.sin(motionT * Math.PI) * bloomPeak;
  const alpha = hiding
    ? clamp01((1 - localT) * 1.25)
    : clamp01(localT * 1.35);

  el.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  el.style.filter = `blur(${blur.toFixed(2)}px) brightness(${bloom.toFixed(3)})`;
  el.style.opacity = alpha.toFixed(3);
}

export function clearMistEtchStyles(el: HTMLElement | undefined): void {
  if (!el) return;
  el.style.removeProperty("mask-image");
  el.style.removeProperty("-webkit-mask-image");
  el.style.removeProperty("transform");
  el.style.removeProperty("filter");
  el.style.removeProperty("opacity");
}
