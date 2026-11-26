import type { ModelProvider } from "./model-provider";

const SVG_NS = "http://www.w3.org/2000/svg";
const BUCKETS = 32;
const SCATTER = 0.42;
const EDGE_SOFTNESS = 0.03;
const MASK_PAD = 2;

export interface BlockDissolveUpdate {
  title: string;
  provider: ModelProvider | undefined;
  animated: boolean;
}

export interface BlockDissolveTitleOptions {
  root: HTMLElement;
  resolveProviderUrl: (provider: ModelProvider) => string;
  initialTitle: string;
  initialProvider: ModelProvider | undefined;
}

interface LayerRefs {
  root: HTMLSpanElement;
  icon: HTMLImageElement;
  text: HTMLSpanElement;
}

interface MaskHandle {
  id: string;
  mask: SVGMaskElement;
  paths: SVGPathElement[];
  opacities: Float32Array;
  width: number;
  height: number;
  cellSize: number;
  seed: number;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function easeOutQuad(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv;
}

/** Gentle ease-out scan curve: responsive start without rushing the mid-sweep. */
function easeScanWave(t: number): number {
  return 0.45 * t + 0.55 * Math.sin(t * Math.PI * 0.5);
}

/** Deterministic integer hash mapped to [0, 1) for per-cell dissolve jitter. */
function cellHash(col: number, row: number, seed: number): number {
  let h =
    Math.imul(col + 1, 374761393) ^
    Math.imul(row + 1, 668265263) ^
    Math.imul(seed + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function cellSizeForFont(fontSize: number): number {
  if (fontSize >= 24) return 4;
  if (fontSize >= 16) return 3;
  return 2;
}

function durationForWidth(width: number): number {
  return Math.round(Math.max(440, Math.min(560, 440 + (width - 160) * 0.36)));
}

let maskIdCounter = 0;

/**
 * Renders the clean-mode top-right `[provider SVG + archive title]` pair with
 * a crisp left-to-right pixel-block wave cross-dissolve on real DOM elements.
 *
 * Uses two pre-bucketed SVG `<mask>` definitions (32 `<path>` groups each) so
 * switching updates only opacity attributes during the ~480 ms sweep, keeps
 * text and SVG icons natively sharp, and strips all masks once settled.
 */
export class BlockDissolveTitle {
  private readonly root: HTMLElement;
  private readonly resolveProviderUrl: (provider: ModelProvider) => string;
  private readonly outLayer: LayerRefs;
  private readonly inLayer: LayerRefs;
  private readonly outMask: MaskHandle;
  private readonly inMask: MaskHandle;
  private readonly readyProviders = new Set<ModelProvider>();
  private readonly prewarmedImages: HTMLImageElement[] = [];

  private activeTitle: string;
  private activeProvider: ModelProvider | undefined;
  private outgoingTitle = "";
  private outgoingProvider: ModelProvider | undefined;

  private activeIconToken = 0;
  private seed = 1;
  private inSeed = 19;
  private cachedCellSize = 0;
  private cachedViewportWidth = 0;
  private cachedViewportHeight = 0;
  private cachedLayout = "";
  private rafId = 0;
  private outActive = false;
  private inActive = false;
  private outStart = 0;
  private outDuration = 190;
  private inStart = 0;
  private inDelay = 20;
  private inDuration = 240;

  constructor(options: BlockDissolveTitleOptions) {
    this.root = options.root;
    this.resolveProviderUrl = options.resolveProviderUrl;
    this.activeTitle = options.initialTitle;
    this.activeProvider = options.initialProvider;

    const uid = ++maskIdCounter;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "clean-dissolve-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const defs = document.createElementNS(SVG_NS, "defs");
    this.outMask = this.createMaskHandle(`clean-dissolve-out-${uid}`);
    this.inMask = this.createMaskHandle(`clean-dissolve-in-${uid}`);
    defs.append(this.outMask.mask, this.inMask.mask);
    svg.append(defs);

    this.outLayer = this.createLayer("clean-title-layer--out", true, "sync");
    this.outLayer.root.hidden = true;
    this.inLayer = this.createLayer("clean-title-layer--in", false, "sync");
    this.inLayer.icon.id = "clean-title-provider";
    this.inLayer.text.id = "clean-title-text";

    this.root.replaceChildren(svg, this.outLayer.root, this.inLayer.root);

    this.inLayer.text.textContent = this.activeTitle;
    this.applyActiveProvider(this.activeProvider, false);
  }

  private createMaskHandle(id: string): MaskHandle {
    const mask = document.createElementNS(SVG_NS, "mask");
    mask.id = id;
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("maskContentUnits", "userSpaceOnUse");
    mask.setAttribute("shape-rendering", "crispEdges");
    const paths: SVGPathElement[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("fill", "#ffffff");
      path.setAttribute("fill-opacity", "1");
      mask.append(path);
      paths.push(path);
    }
    return {
      id,
      mask,
      paths,
      opacities: new Float32Array(BUCKETS).fill(1),
      width: 0,
      height: 0,
      cellSize: 4,
      seed: 0,
    };
  }

  private createLayer(
    modifier: string,
    hiddenFromAt: boolean,
    decoding: "sync" | "async",
  ): LayerRefs {
    const layer = document.createElement("span");
    layer.className = `clean-title-layer ${modifier}`;
    if (hiddenFromAt) layer.setAttribute("aria-hidden", "true");

    const icon = document.createElement("img");
    icon.className = "clean-title-provider";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.decoding = decoding;
    icon.hidden = true;

    const text = document.createElement("span");
    text.className = "clean-title-text";

    layer.append(icon, text);
    return { root: layer, icon, text };
  }

  private applyActiveProvider(
    provider: ModelProvider | undefined,
    rebuildMaskOnLoad: boolean,
  ) {
    const icon = this.inLayer.icon;
    const token = ++this.activeIconToken;
    icon.dataset.token = String(token);

    if (!provider) {
      icon.onload = null;
      icon.onerror = null;
      icon.hidden = true;
      icon.removeAttribute("src");
      return;
    }

    const url = this.resolveProviderUrl(provider);
    if (this.readyProviders.has(provider)) {
      icon.onload = null;
      icon.onerror = null;
      icon.src = url;
      icon.hidden = false;
      return;
    }

    icon.hidden = true;
    icon.onload = () => {
      if (
        icon.dataset.token !== String(this.activeIconToken) ||
        this.activeProvider !== provider
      ) {
        return;
      }
      icon.onload = null;
      icon.onerror = null;
      this.readyProviders.add(provider);
      icon.hidden = false;
      if (rebuildMaskOnLoad && this.inActive) {
        this.rebuildMaskGeometry(
          this.inMask,
          this.inLayer.root.offsetWidth,
          this.inLayer.root.offsetHeight,
          this.readCellSize(),
          this.inSeed,
        );
      }
    };
    icon.onerror = () => {
      if (icon.dataset.token !== String(this.activeIconToken)) return;
      icon.onload = null;
      icon.onerror = null;
      icon.hidden = true;
      icon.removeAttribute("src");
    };
    icon.src = url;
    if (icon.complete && icon.naturalWidth > 0) {
      icon.onload = null;
      icon.onerror = null;
      this.readyProviders.add(provider);
      icon.hidden = false;
    }
  }

  private applyOutgoingProvider(
    provider: ModelProvider | undefined,
    visible: boolean,
  ) {
    const icon = this.outLayer.icon;
    if (!provider || !visible) {
      icon.hidden = true;
      icon.removeAttribute("src");
      return;
    }
    icon.src = this.resolveProviderUrl(provider);
    icon.hidden = false;
  }

  private readCellSize(): number {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const layout =
      this.root.closest<HTMLElement>("[data-layout]")?.dataset.layout ?? "";
    if (
      this.cachedCellSize === 0 ||
      viewportWidth !== this.cachedViewportWidth ||
      viewportHeight !== this.cachedViewportHeight ||
      layout !== this.cachedLayout
    ) {
      const fontSize = parseFloat(getComputedStyle(this.root).fontSize) || 28;
      this.cachedCellSize = cellSizeForFont(fontSize);
      this.cachedViewportWidth = viewportWidth;
      this.cachedViewportHeight = viewportHeight;
      this.cachedLayout = layout;
    }
    return this.cachedCellSize;
  }

  private rebuildMaskGeometry(
    handle: MaskHandle,
    rawWidth: number,
    rawHeight: number,
    cellSize: number,
    seed: number,
  ): number {
    const width = Math.max(1, Math.ceil(rawWidth));
    const height = Math.max(1, Math.ceil(rawHeight));
    if (width === handle.width && height === handle.height &&
        cellSize === handle.cellSize && seed === handle.seed) return width;

    handle.width = width;
    handle.height = height;
    handle.cellSize = cellSize;
    handle.seed = seed;

    const totalW = width + MASK_PAD * 2;
    const totalH = height + MASK_PAD * 2;
    handle.mask.setAttribute("x", String(-MASK_PAD));
    handle.mask.setAttribute("y", String(-MASK_PAD));
    handle.mask.setAttribute("width", String(totalW));
    handle.mask.setAttribute("height", String(totalH));

    const cols = Math.max(1, Math.ceil(totalW / cellSize));
    const rows = Math.max(1, Math.ceil(totalH / cellSize));
    const buckets: string[][] = Array.from({ length: BUCKETS }, () => []);
    const span = cols > 1 ? cols - 1 : 1;

    for (let r = 0; r < rows; r++) {
      const y = -MASK_PAD + r * cellSize;
      for (let c = 0; c < cols; c++) {
        const x = -MASK_PAD + c * cellSize;
        const nx = cols > 1 ? c / span : 0.5;
        const score = nx * (1 - SCATTER) + cellHash(c, r, seed) * SCATTER;
        const idx = Math.min(BUCKETS - 1, Math.floor(score * BUCKETS));
        buckets[idx].push(`M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}Z`);
      }
    }

    for (let i = 0; i < BUCKETS; i++) {
      handle.paths[i].setAttribute("d", buckets[i].join(""));
    }
    return width;
  }

  private applyMaskProgress(
    handle: MaskHandle,
    progress: number,
    invert: boolean,
  ) {
    const { paths, opacities } = handle;
    for (let i = 0; i < BUCKETS; i++) {
      const center = (i + 0.5) / BUCKETS;
      const raw = clamp01((progress - center) / EDGE_SOFTNESS + 0.5);
      const next = invert ? 1 - raw : raw;
      if (Math.abs(next - opacities[i]) > 0.004) {
        opacities[i] = next;
        paths[i].setAttribute(
          "fill-opacity",
          next <= 0 ? "0" : next >= 1 ? "1" : next.toFixed(3),
        );
      }
    }
  }

  private setLayerMask(layer: HTMLElement, maskId: string | null) {
    if (maskId) {
      const value = `url(#${maskId})`;
      layer.style.setProperty("mask-image", value);
      layer.style.setProperty("-webkit-mask-image", value);
    } else {
      layer.style.removeProperty("mask-image");
      layer.style.removeProperty("-webkit-mask-image");
    }
  }

  private clearOutgoing() {
    this.outActive = false;
    this.outgoingTitle = "";
    this.outgoingProvider = undefined;
    this.setLayerMask(this.outLayer.root, null);
    this.outLayer.root.hidden = true;
    this.outLayer.text.textContent = "";
    this.outLayer.icon.hidden = true;
    this.outLayer.icon.removeAttribute("src");
  }

  private stopAnimation() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.inActive = false;
    this.setLayerMask(this.inLayer.root, null);
    this.clearOutgoing();
  }

  private step = (now: number) => {
    this.rafId = 0;

    if (this.outActive) {
      const rawOut = clamp01((now - this.outStart) / this.outDuration);
      const pOut = easeOutQuad(rawOut);
      this.applyMaskProgress(this.outMask, pOut, true);
      if (rawOut >= 1) {
        this.clearOutgoing();
      }
    }

    if (this.inActive) {
      const elapsed = now - this.inStart - this.inDelay;
      const rawIn = elapsed <= 0 ? 0 : clamp01(elapsed / this.inDuration);
      const pIn = easeScanWave(rawIn);
      this.applyMaskProgress(this.inMask, pIn, false);
      if (rawIn >= 1) {
        this.inActive = false;
        this.setLayerMask(this.inLayer.root, null);
      }
    }

    if (this.outActive || this.inActive) {
      this.rafId = requestAnimationFrame(this.step);
    } else {
      this.stopAnimation();
    }
  };

  /**
   * Transitions to the given title and model provider. Returns `true` when
   * displayed content actually changed.
   */
  update(next: BlockDissolveUpdate): boolean {
    if (
      next.title === this.activeTitle &&
      next.provider === this.activeProvider
    ) {
      if (!next.animated && (this.outActive || this.inActive)) {
        this.stopAnimation();
      }
      return false;
    }

    const prevTitle = this.activeTitle;
    const prevProvider = this.activeProvider;
    const prevIconVisible = !this.inLayer.icon.hidden && Boolean(prevProvider);

    this.activeTitle = next.title;
    this.activeProvider = next.provider;

    const canAnimate =
      next.animated &&
      !document.hidden &&
      this.root.offsetWidth > 0 &&
      this.root.offsetHeight > 0;

    if (!canAnimate) {
      this.stopAnimation();
      this.inLayer.text.textContent = next.title;
      this.applyActiveProvider(next.provider, false);
      return true;
    }

    const now = performance.now();
    const currentInProgress = this.inActive
      ? clamp01((now - this.inStart - this.inDelay) / this.inDuration)
      : 1;
    const returningToOutgoing =
      this.outActive &&
      next.title === this.outgoingTitle &&
      next.provider === this.outgoingProvider &&
      currentInProgress < 0.42;

    if (returningToOutgoing) {
      // Hover briefly grazed another card and returned to the outgoing item:
      // avoid dissolving A into A on top of itself.
      const outProgress = clamp01((now - this.outStart) / this.outDuration);
      this.clearOutgoing();
      this.inLayer.text.textContent = next.title;
      this.applyActiveProvider(next.provider, true);
      if (outProgress <= 0.14) {
        this.stopAnimation();
        return true;
      }
      this.seed = (this.seed + 1) | 0;
      this.inSeed = this.seed * 53 + 19;
      const cellSize = this.readCellSize();
      const inWidth = this.rebuildMaskGeometry(
        this.inMask,
        this.inLayer.root.offsetWidth,
        this.inLayer.root.offsetHeight,
        cellSize,
        this.inSeed,
      );
      this.inStart = now;
      this.inDelay = 0;
      this.inDuration = Math.round(durationForWidth(inWidth) * 0.68);
      this.inActive = true;
      this.inMask.opacities.fill(-1);
      this.applyMaskProgress(this.inMask, 0, false);
      this.setLayerMask(this.inLayer.root, this.inMask.id);
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(this.step);
      }
      return true;
    }

    // If rapidly sweeping past an intermediate card whose incoming layer has
    // barely materialized (< 42%), let the existing outgoing layer keep fading
    // out instead of snapping the half-drawn card to 100% and flashing.
    const keepExistingOutgoing =
      this.outActive && currentInProgress < 0.42 && Boolean(this.outgoingTitle);

    this.seed = (this.seed + 1) | 0;
    this.inSeed = this.seed * 53 + 19;

    // Write both DOM layers before reading layout metrics once.
    if (!keepExistingOutgoing) {
      this.outgoingTitle = prevTitle;
      this.outgoingProvider = prevProvider;
      this.outLayer.text.textContent = prevTitle;
      this.applyOutgoingProvider(prevProvider, prevIconVisible);
      this.outLayer.root.hidden = false;
    }
    this.inLayer.text.textContent = next.title;
    this.applyActiveProvider(next.provider, true);

    const cellSize = this.readCellSize();
    const outRawW = keepExistingOutgoing
      ? this.outMask.width
      : this.outLayer.root.offsetWidth;
    const outRawH = keepExistingOutgoing
      ? this.outMask.height
      : this.outLayer.root.offsetHeight;
    const inRawW = this.inLayer.root.offsetWidth;
    const inRawH = this.inLayer.root.offsetHeight;

    let outWidth = this.outMask.width;
    if (!keepExistingOutgoing) {
      outWidth = this.rebuildMaskGeometry(
        this.outMask,
        outRawW,
        outRawH,
        cellSize,
        this.seed * 31 + 7,
      );
      this.outMask.opacities.fill(-1);
      this.applyMaskProgress(this.outMask, 0, true);
      this.setLayerMask(this.outLayer.root, this.outMask.id);
      this.outStart = now;
      this.outActive = true;
    }

    const inWidth = this.rebuildMaskGeometry(
      this.inMask,
      inRawW,
      inRawH,
      cellSize,
      this.inSeed,
    );

    const totalDuration = durationForWidth(Math.max(outWidth, inWidth));
    if (!keepExistingOutgoing) {
      this.outDuration = Math.round(totalDuration * 0.72);
    }
    this.inStart = now;
    this.inDelay = keepExistingOutgoing ? 0 : Math.round(totalDuration * 0.1);
    this.inDuration = Math.round(totalDuration * 0.9);
    this.inActive = true;

    this.inMask.opacities.fill(-1);
    this.applyMaskProgress(this.inMask, 0, false);
    this.setLayerMask(this.inLayer.root, this.inMask.id);

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.step);
    }
    return true;
  }

  /** Immediately settles any running dissolve transition and strips masks. */
  finish() {
    this.stopAnimation();
  }

  resize() {
    if (!this.inActive && !this.outActive) return;
    const cellSize = this.readCellSize();
    if (this.inActive) {
      const layer = this.inLayer.root;
      this.rebuildMaskGeometry(this.inMask, layer.offsetWidth, layer.offsetHeight, cellSize, this.inMask.seed);
    }
    if (this.outActive) {
      const layer = this.outLayer.root;
      this.rebuildMaskGeometry(this.outMask, layer.offsetWidth, layer.offsetHeight, cellSize, this.outMask.seed);
    }
  }

  /**
   * Background-decodes additional provider SVGs so hover dissolves never wait
   * on first network decode.
   */
  prewarmProviders(providers: Iterable<ModelProvider>) {
    if (this.prewarmedImages.length) return;
    for (const provider of providers) {
      if (this.readyProviders.has(provider)) continue;
      const img = new Image();
      this.prewarmedImages.push(img);
      img.onload = () => {
        this.readyProviders.add(provider);
        if (
          this.activeProvider === provider &&
          this.inLayer.icon.hidden &&
          this.inLayer.icon.getAttribute("src")
        ) {
          this.inLayer.icon.onload = null;
          this.inLayer.icon.onerror = null;
          this.inLayer.icon.hidden = false;
          if (this.inActive) {
            this.rebuildMaskGeometry(
              this.inMask,
              this.inLayer.root.offsetWidth,
              this.inLayer.root.offsetHeight,
              this.readCellSize(),
              this.inSeed,
            );
          }
        }
      };
      img.src = this.resolveProviderUrl(provider);
      void img.decode?.().catch(() => {});
    }
  }
}
