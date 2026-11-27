export interface CleanCoverUpdate {
  src: string | null;
  visible: boolean;
  animated: boolean;
}

const SCATTER = 0.2;
const TILE_FADE_FRACTION = 0.4;

const REVEAL_DURATION_MS = 420;
const MORPH_DURATION_MS = 380;
const HIDE_DURATION_MS = 280;

const SWEEP_DEBOUNCE_MS = 85;
const SWEEP_MAX_WAIT_MS = 220;
const BURST_WINDOW_MS = 140;

const MAX_IMAGE_CACHE = 16;
const MAX_CANVAS_DIM = 1024;

type AnimKind = "none" | "reveal" | "morph" | "hide";

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function easeOutQuad(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv;
}

function easeScanWave(t: number): number {
  return 0.45 * t + 0.55 * Math.sin(t * Math.PI * 0.5);
}

function cellHash(col: number, row: number, seed: number): number {
  let h =
    Math.imul(col + 1, 374761393) ^
    Math.imul(row + 1, 668265263) ^
    Math.imul(seed + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function measureCanvasBox(el: HTMLElement): {
  cssW: number;
  cssH: number;
  pw: number;
  ph: number;
  borderRadiusPx: number;
} | null {
  const rect = el.getBoundingClientRect();
  const cssW = rect.width > 0 ? rect.width : el.offsetWidth;
  const cssH = rect.height > 0 ? rect.height : el.offsetHeight;
  if (cssW <= 0 || cssH <= 0) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pw = Math.max(1, Math.round(cssW * dpr));
  let ph = Math.max(1, Math.round(cssH * dpr));
  const peak = Math.max(pw, ph);
  if (peak > MAX_CANVAS_DIM) {
    const scale = MAX_CANVAS_DIM / peak;
    pw = Math.max(1, Math.round(pw * scale));
    ph = Math.max(1, Math.round(ph * scale));
  }
  const parsedRadius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  const radiusCss = Number.isFinite(parsedRadius) ? parsedRadius : 4;
  const localCssW = el.offsetWidth > 0 ? el.offsetWidth : cssW;
  return {
    cssW,
    cssH,
    pw,
    ph,
    borderRadiusPx: Math.max(0, (radiusCss / localCssW) * pw),
  };
}

/**
 * Renders the clean-mode top-right archive cover preview with a HiDPI
 * offscreen-composited `<canvas>` pixel-block wave dissolve and burst
 * coalescing. Any interruption captures the live visible frame into
 * `fromCanvas` so rapid multi-card sweeps never flash, snap back, or strobe.
 */
export class CleanCoverPreview {
  private readonly root: HTMLElement;
  private readonly frame: HTMLDivElement;
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D | null;
  private readonly fromCanvas: HTMLCanvasElement;
  private readonly fromCtx: CanvasRenderingContext2D | null;
  private readonly toCanvas: HTMLCanvasElement;
  private readonly toCtx: CanvasRenderingContext2D | null;

  private readonly imageCache = new Map<string, HTMLImageElement>();
  private activeImg: HTMLImageElement | null = null;
  private activeLoader: HTMLImageElement | null = null;

  private pw = 0;
  private ph = 0;
  private cssW = 0;
  private radiusPx = 4;

  private cols = 0;
  private rows = 0;
  private gridSeed = 17;
  private cellX = new Int32Array(0);
  private cellY = new Int32Array(0);
  private cellW = new Int32Array(0);
  private cellH = new Int32Array(0);
  private tileDelays = new Float32Array(0);

  private animKind: AnimKind = "none";
  private animStart = 0;
  private animDuration = MORPH_DURATION_MS;
  private rafId = 0;

  private loadToken = 0;
  private desiredVisible = false;
  private desiredSrc: string | null = null;
  private displayedSrc: string | null = null;
  private loadingSrc: string | null = null;
  private hasImage = false;
  private hasCanvasPixels = false;

  private lastDispatchAt = -Infinity;
  private burstFirstQueuedAt = 0;
  private coalesceTimer = 0;
  private pendingSrc: string | null = null;
  private pendingAnimated = false;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.root = root;

    const frame = document.createElement("div");
    frame.className = "clean-cover-frame";
    this.frame = frame;

    const canvas = document.createElement("canvas");
    canvas.className = "clean-cover-canvas";
    canvas.setAttribute("aria-hidden", "true");
    this.displayCanvas = canvas;
    this.displayCtx = canvas.getContext("2d");

    this.fromCanvas = document.createElement("canvas");
    this.fromCtx = this.fromCanvas.getContext("2d");
    this.toCanvas = document.createElement("canvas");
    this.toCtx = this.toCanvas.getContext("2d");

    frame.append(canvas);
    this.root.dataset.visible = "false";
    this.root.dataset.hiding = "false";
    this.root.dataset.instant = "false";
    this.root.dataset.dissolving = "false";
    this.root.dataset.src = "";
    this.root.replaceChildren(frame);
  }

  private clearLoader() {
    if (!this.activeLoader) return;
    this.activeLoader.onload = null;
    this.activeLoader.onerror = null;
    this.activeLoader = null;
  }

  private clearCoalesce() {
    if (this.coalesceTimer) {
      window.clearTimeout(this.coalesceTimer);
      this.coalesceTimer = 0;
    }
    this.pendingSrc = null;
    this.pendingAnimated = false;
    this.burstFirstQueuedAt = 0;
  }

  private cancelRaf() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private scheduleRaf() {
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.step);
    }
  }

  private rebuildGrid(seed: number) {
    if (this.pw <= 0 || this.ph <= 0) return;
    const cols = 3;
    const rows = 2;

    if (
      cols === this.cols &&
      rows === this.rows &&
      seed === this.gridSeed &&
      this.tileDelays.length === cols * rows
    ) {
      return;
    }

    this.cols = cols;
    this.rows = rows;
    this.gridSeed = seed;

    const cellX = new Int32Array(cols);
    const cellW = new Int32Array(cols);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round((c / cols) * this.pw);
      const x1 = Math.round(((c + 1) / cols) * this.pw);
      cellX[c] = x0;
      cellW[c] = Math.max(1, x1 - x0);
    }

    const cellY = new Int32Array(rows);
    const cellH = new Int32Array(rows);
    for (let r = 0; r < rows; r++) {
      const y0 = Math.round((r / rows) * this.ph);
      const y1 = Math.round(((r + 1) / rows) * this.ph);
      cellY[r] = y0;
      cellH[r] = Math.max(1, y1 - y0);
    }

    const tileDelays = new Float32Array(cols * rows);
    const span = cols - 1;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const fromLeft = ((r + seed) & 1) === 0;
      for (let c = 0; c < cols; c++) {
        const distance = (fromLeft ? c : span - c) / span;
        const offset = distance * (1 - SCATTER) + cellHash(c, r, seed) * SCATTER;
        tileDelays[idx++] = offset * (1 - TILE_FADE_FRACTION);
      }
    }

    this.cellX = cellX;
    this.cellY = cellY;
    this.cellW = cellW;
    this.cellH = cellH;
    this.tileDelays = tileDelays;
  }

  private syncCanvasSize(snapshotSource: HTMLCanvasElement | null = null): boolean {
    const measured = measureCanvasBox(this.frame);
    if (!measured) return false;
    const { cssW, pw, ph, borderRadiusPx } = measured;
    this.cssW = cssW;
    this.radiusPx = borderRadiusPx;

    if (pw === this.pw && ph === this.ph) return true;

    let savedFrom: HTMLCanvasElement | null = null;
    if (snapshotSource && this.pw > 0 && this.ph > 0) {
      savedFrom = document.createElement("canvas");
      savedFrom.width = this.pw;
      savedFrom.height = this.ph;
      savedFrom.getContext("2d")?.drawImage(snapshotSource, 0, 0);
    }

    this.pw = pw;
    this.ph = ph;
    this.displayCanvas.width = pw;
    this.displayCanvas.height = ph;
    this.fromCanvas.width = pw;
    this.fromCanvas.height = ph;
    this.toCanvas.width = pw;
    this.toCanvas.height = ph;
    this.cols = 0;
    this.rows = 0;
    this.rebuildGrid(this.gridSeed);

    if (savedFrom && this.fromCtx) {
      this.fromCtx.clearRect(0, 0, pw, ph);
      this.fromCtx.drawImage(savedFrom, 0, 0, pw, ph);
    }
    return true;
  }

  private renderImageToCanvas(
    ctx: CanvasRenderingContext2D | null,
    img: HTMLImageElement,
  ) {
    if (!ctx || this.pw <= 0 || this.ph <= 0) return;
    const { pw, ph } = this;
    ctx.clearRect(0, 0, pw, ph);

    const iw = img.naturalWidth || pw;
    const ih = img.naturalHeight || ph;
    const coverScale = Math.max(pw / iw, ph / ih);
    const dw = iw * coverScale;
    const dh = ih * coverScale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (pw - dw) / 2, (ph - dh) / 2, dw, dh);

    // Crisp physical-scaled hairline inset border inside the bitmap so reveal/hide
    // pixel blocks dissolve cleanly against transparent space without a box border.
    const strokeW = Math.max(1, pw / Math.max(1, this.cssW || pw));
    const inset = strokeW * 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(124, 110, 92, 0.24)";
    ctx.lineWidth = strokeW;
    const r = Math.max(0, this.radiusPx - inset);
    if (typeof ctx.roundRect === "function" && r > 0) {
      ctx.beginPath();
      ctx.roundRect(inset, inset, pw - strokeW, ph - strokeW, r);
      ctx.stroke();
    } else {
      ctx.strokeRect(inset, inset, pw - strokeW, ph - strokeW);
    }
    ctx.restore();
  }

  private snapshotDisplayToFrom() {
    if (!this.fromCtx || this.pw <= 0 || this.ph <= 0) return;
    this.fromCtx.clearRect(0, 0, this.pw, this.ph);
    if (this.hasCanvasPixels) {
      this.fromCtx.drawImage(this.displayCanvas, 0, 0);
    }
  }

  private snapshotWithSizeSync(): boolean {
    const prevPw = this.pw;
    const prevPh = this.ph;
    if (!this.syncCanvasSize(this.hasCanvasPixels ? this.displayCanvas : null)) return false;
    if (this.pw === prevPw && this.ph === prevPh) {
      this.snapshotDisplayToFrom();
    }
    return true;
  }

  private drawDissolve(
    sourceCanvas: HTMLCanvasElement,
    progress: number,
    invert: boolean,
  ) {
    const ctx = this.displayCtx;
    if (!ctx || this.pw <= 0 || this.ph <= 0) return;

    const { cols, rows, cellX, cellY, cellW, cellH, tileDelays } = this;
    let idx = 0;

    for (let r = 0; r < rows; r++) {
      const y = cellY[r];
      const h = cellH[r];
      for (let c = 0; c < cols; c++) {
        const t = clamp01((progress - tileDelays[idx++]) / TILE_FADE_FRACTION);
        const eased = t * t * (3 - 2 * t);
        const alpha = invert ? 1 - eased : eased;
        if (alpha <= 0) continue;
        const x = cellX[c];
        const w = cellW[c];
        ctx.globalAlpha = alpha;
        ctx.drawImage(sourceCanvas, x, y, w, h, x, y, w, h);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawCurrentFrame(now: number) {
    const ctx = this.displayCtx;
    if (!ctx || this.pw <= 0 || this.ph <= 0) return;
    const raw = clamp01((now - this.animStart) / this.animDuration);

    if (this.animKind === "reveal") {
      ctx.clearRect(0, 0, this.pw, this.ph);
      this.drawDissolve(this.toCanvas, easeScanWave(raw), false);
      this.hasCanvasPixels = true;
      return;
    }

    if (this.animKind === "morph") {
      ctx.clearRect(0, 0, this.pw, this.ph);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.fromCanvas, 0, 0);
      this.drawDissolve(this.toCanvas, easeScanWave(raw), false);
      this.hasCanvasPixels = true;
      return;
    }

    if (this.animKind === "hide") {
      ctx.clearRect(0, 0, this.pw, this.ph);
      this.drawDissolve(this.fromCanvas, easeOutQuad(raw), true);
      this.hasCanvasPixels = raw < 1;
    }
  }

  private step = (now: number) => {
    this.rafId = 0;
    if (this.disposed || this.animKind === "none") return;

    const raw = clamp01((now - this.animStart) / this.animDuration);
    if (raw < 1) {
      this.drawCurrentFrame(now);
      this.scheduleRaf();
      return;
    }

    const finishedKind = this.animKind;
    this.animKind = "none";
    this.root.dataset.dissolving = "false";

    if (finishedKind === "hide") {
      this.displayCtx?.clearRect(0, 0, this.pw, this.ph);
      this.hasCanvasPixels = false;
      this.root.dataset.hiding = "false";
      this.root.dataset.visible = "false";
      return;
    }

    if (this.displayCtx && this.pw > 0 && this.ph > 0) {
      this.displayCtx.clearRect(0, 0, this.pw, this.ph);
      this.displayCtx.drawImage(this.toCanvas, 0, 0);
      this.hasCanvasPixels = true;
    }
  };

  private settleInstantShow(img: HTMLImageElement, src: string, instant: boolean) {
    this.cancelRaf();
    this.animKind = "none";
    this.loadingSrc = null;
    this.activeImg = img;
    this.displayedSrc = src;
    this.hasImage = true;
    if (this.syncCanvasSize() && this.displayCtx) {
      this.renderImageToCanvas(this.displayCtx, img);
      this.hasCanvasPixels = true;
    }
    this.root.dataset.instant = instant ? "true" : "false";
    this.root.dataset.hiding = "false";
    this.root.dataset.dissolving = "false";
    this.root.dataset.src = src;
    this.root.dataset.visible = "true";
  }

  private settleInstantHide(preserveInstant: boolean) {
    this.cancelRaf();
    this.animKind = "none";
    this.loadingSrc = null;
    this.displayCtx?.clearRect(0, 0, this.pw, this.ph);
    this.hasCanvasPixels = false;
    if (preserveInstant) {
      this.root.dataset.instant = "true";
    }
    this.root.dataset.hiding = "false";
    this.root.dataset.dissolving = "false";
    this.root.dataset.visible = "false";
  }

  private presentLoaded(img: HTMLImageElement, src: string, animated: boolean) {
    if (this.disposed) return;

    const useDissolve = animated && !document.hidden;
    if (!useDissolve) {
      this.settleInstantShow(img, src, !animated);
      return;
    }

    const wasVisible =
      this.hasImage &&
      this.root.dataset.visible === "true" &&
      this.hasCanvasPixels;

    if (wasVisible) {
      if (!this.snapshotWithSizeSync()) {
        this.settleInstantShow(img, src, false);
        return;
      }
      this.animKind = "morph";
      this.animDuration = MORPH_DURATION_MS;
    } else {
      if (!this.syncCanvasSize()) {
        this.settleInstantShow(img, src, false);
        return;
      }
      this.animKind = "reveal";
      this.animDuration = REVEAL_DURATION_MS;
    }

    this.activeImg = img;
    this.displayedSrc = src;
    this.hasImage = true;
    this.renderImageToCanvas(this.toCtx, img);
    this.rebuildGrid((this.gridSeed + 37) | 0);

    const now = performance.now();
    this.animStart = now;
    this.root.dataset.instant = "false";
    this.root.dataset.hiding = "false";
    this.root.dataset.dissolving = "true";
    this.root.dataset.src = src;
    this.root.dataset.visible = "true";

    this.drawCurrentFrame(now);
    this.scheduleRaf();
  }

  private rememberCachedImage(src: string, img: HTMLImageElement) {
    if (/^blob:/i.test(src)) return;
    if (this.imageCache.has(src)) {
      this.imageCache.delete(src);
    } else if (this.imageCache.size >= MAX_IMAGE_CACHE) {
      const oldest = this.imageCache.keys().next().value;
      if (oldest !== undefined) this.imageCache.delete(oldest);
    }
    this.imageCache.set(src, img);
  }

  private dispatchShow(src: string, animated: boolean) {
    this.lastDispatchAt = performance.now();
    this.loadingSrc = null;

    const cached = this.imageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      this.rememberCachedImage(src, cached);
      this.loadToken++;
      this.clearLoader();
      this.presentLoaded(cached, src, animated);
      return;
    }

    const token = ++this.loadToken;
    this.loadingSrc = src;
    this.clearLoader();

    const img = new Image();
    this.activeLoader = img;
    img.decoding = "async";
    img.referrerPolicy = /^https?:/i.test(src) ? "no-referrer" : "";

    let settled = false;
    const onReady = () => {
      if (settled) return;
      settled = true;
      if (this.activeLoader === img) this.clearLoader();
      void img
        .decode()
        .catch(() => {})
        .then(() => {
          if (this.loadingSrc === src) this.loadingSrc = null;
          if (
            this.disposed ||
            token !== this.loadToken ||
            !this.desiredVisible ||
            this.desiredSrc !== src
          ) {
            return;
          }
          this.rememberCachedImage(src, img);
          this.presentLoaded(img, src, animated);
        });
    };

    img.onload = onReady;
    img.onerror = () => {
      if (settled) return;
      settled = true;
      if (this.activeLoader === img) this.clearLoader();
      img.removeAttribute("src");
      if (this.loadingSrc === src) this.loadingSrc = null;
      if (
        this.disposed ||
        token !== this.loadToken ||
        !this.desiredVisible ||
        this.desiredSrc !== src
      ) {
        return;
      }
      this.activeImg = null;
      this.displayedSrc = null;
      this.hasImage = false;
      this.root.dataset.src = "";
      this.settleInstantHide(!animated);
    };

    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      queueMicrotask(onReady);
    }
  }

  private flushPending = () => {
    this.coalesceTimer = 0;
    if (
      this.disposed ||
      !this.desiredVisible ||
      !this.pendingSrc ||
      this.pendingSrc !== this.desiredSrc
    ) {
      this.clearCoalesce();
      return;
    }
    const src = this.pendingSrc;
    const animated = this.pendingAnimated;
    this.pendingSrc = null;
    this.pendingAnimated = false;
    this.burstFirstQueuedAt = 0;
    this.dispatchShow(src, animated);
  };

  public update({ src, visible, animated }: CleanCoverUpdate) {
    if (this.disposed) return;

    if (!visible || !src) {
      this.clearCoalesce();
      this.clearLoader();
      this.loadToken++;
      this.loadingSrc = null;
      this.desiredVisible = false;
      this.desiredSrc = null;

      if (!this.hasImage || this.root.dataset.visible === "false" || !this.hasCanvasPixels) {
        this.settleInstantHide(!animated);
        return;
      }

      if (this.animKind === "hide") {
        if (!animated || document.hidden) {
          this.settleInstantHide(!animated);
        }
        return;
      }

      if (!animated || document.hidden || !this.snapshotWithSizeSync()) {
        this.settleInstantHide(!animated);
        return;
      }

      this.cancelRaf();
      this.animKind = "hide";
      this.animDuration = HIDE_DURATION_MS;
      this.rebuildGrid((this.gridSeed + 37) | 0);
      const now = performance.now();
      this.animStart = now;
      this.root.dataset.instant = "false";
      this.root.dataset.hiding = "true";
      this.root.dataset.dissolving = "true";
      this.root.dataset.visible = "true";
      this.drawCurrentFrame(now);
      this.scheduleRaf();
      return;
    }

    this.desiredVisible = true;
    this.desiredSrc = src;

    if (!animated || document.hidden) {
      this.clearCoalesce();
      if (this.hasImage && this.displayedSrc === src && this.activeImg) {
        this.loadToken++;
        this.clearLoader();
        this.loadingSrc = null;
        this.settleInstantShow(this.activeImg, src, true);
        return;
      }
      this.dispatchShow(src, false);
      return;
    }

    // Returning cleanly onto the already-displayed settled cover cancels any pending sweep.
    if (
      this.hasImage &&
      this.displayedSrc === src &&
      this.animKind !== "hide" &&
      this.root.dataset.visible === "true"
    ) {
      this.clearCoalesce();
      this.loadToken++;
      this.clearLoader();
      this.loadingSrc = null;
      this.root.dataset.hiding = "false";
      this.root.dataset.visible = "true";
      return;
    }

    if (this.pendingSrc === src) {
      return;
    }

    if (this.loadingSrc === src && this.animKind === "none") {
      this.clearCoalesce();
      return;
    }

    const now = performance.now();
    const inBurst =
      this.animKind === "reveal" ||
      this.animKind === "morph" ||
      now - this.lastDispatchAt < BURST_WINDOW_MS;

    if (!inBurst) {
      this.clearCoalesce();
      this.dispatchShow(src, true);
      return;
    }

    this.pendingSrc = src;
    this.pendingAnimated = true;
    if (!this.burstFirstQueuedAt) {
      this.burstFirstQueuedAt = now;
    }

    if (now - this.burstFirstQueuedAt >= SWEEP_MAX_WAIT_MS) {
      if (this.coalesceTimer) {
        window.clearTimeout(this.coalesceTimer);
        this.coalesceTimer = 0;
      }
      this.flushPending();
      return;
    }

    if (this.coalesceTimer) {
      window.clearTimeout(this.coalesceTimer);
    }
    this.coalesceTimer = window.setTimeout(this.flushPending, SWEEP_DEBOUNCE_MS);
  }

  public finish() {
    if (this.disposed) return;
    this.clearCoalesce();
    if (this.animKind === "none") return;

    const kind = this.animKind;
    this.cancelRaf();
    this.animKind = "none";
    this.root.dataset.dissolving = "false";

    if (kind === "hide") {
      this.displayCtx?.clearRect(0, 0, this.pw, this.ph);
      this.hasCanvasPixels = false;
      this.root.dataset.instant = "false";
      this.root.dataset.hiding = "false";
      this.root.dataset.visible = "false";
      return;
    }

    if (this.displayCtx && this.pw > 0 && this.ph > 0) {
      this.displayCtx.clearRect(0, 0, this.pw, this.ph);
      this.displayCtx.drawImage(this.toCanvas, 0, 0);
      this.hasCanvasPixels = true;
    }
    this.root.dataset.instant = "false";
    this.root.dataset.hiding = "false";
  }

  public resize() {
    if (this.disposed) return;
    const prevPw = this.pw;
    const prevPh = this.ph;
    const isAnimating = this.animKind !== "none";
    const usesFromCanvas = this.animKind === "morph" || this.animKind === "hide";
    if (!this.syncCanvasSize(usesFromCanvas ? this.fromCanvas : null)) return;
    if (this.pw === prevPw && this.ph === prevPh) return;

    if (isAnimating) {
      if (this.activeImg) {
        this.renderImageToCanvas(this.toCtx, this.activeImg);
      }
      this.drawCurrentFrame(performance.now());
      return;
    }

    if (
      this.hasImage &&
      this.activeImg &&
      this.root.dataset.visible === "true" &&
      this.displayCtx
    ) {
      this.renderImageToCanvas(this.displayCtx, this.activeImg);
      this.hasCanvasPixels = true;
    }
  }

  public dispose() {
    this.disposed = true;
    this.loadToken++;
    this.loadingSrc = null;
    this.clearCoalesce();
    this.clearLoader();
    this.cancelRaf();
    this.animKind = "none";
    this.activeImg = null;
    this.imageCache.clear();
    this.displayCanvas.width = 0;
    this.displayCanvas.height = 0;
    this.fromCanvas.width = 0;
    this.fromCanvas.height = 0;
    this.toCanvas.width = 0;
    this.toCanvas.height = 0;
  }
}
