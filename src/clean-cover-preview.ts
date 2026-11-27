import {
  MIST_SVG_NS,
  MIST_HIDE_DURATION_MS,
  MIST_RETURN_DURATION_MS,
  MIST_SWITCH_DURATION_MS,
  type EtchMaskHandle,
  applyMistEtchDissolve,
  bindEtchMask,
  clamp01,
  clearMistEtchStyles,
  createEtchMask,
  easeMistReveal,
  easeOutQuad,
} from "./mist-etch-dissolve";

export interface CleanCoverUpdate {
  src: string | null;
  visible: boolean;
  animated: boolean;
}

const SWEEP_DEBOUNCE_MS = 85;
const SWEEP_MAX_WAIT_MS = 220;
const BURST_WINDOW_MS = 140;

const MAX_IMAGE_CACHE = 16;
const MAX_CANVAS_DIM = 1024;

let coverMaskCounter = 0;

type AnimKind = "none" | "reveal" | "morph" | "hide";

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
 * Renders the clean-mode top-right archive cover preview with shared
 * micro-etch + optical mist dissolves across initial reveal, card-to-card
 * dual-frame cross-dissolve (`morph`), and detail hide, plus burst coalescing.
 */
export class CleanCoverPreview {
  private readonly root: HTMLElement;
  private readonly shell: HTMLDivElement;
  private readonly outFrame: HTMLDivElement;
  private readonly inFrame: HTMLDivElement;
  private readonly shellMistMask: EtchMaskHandle;
  private readonly outMistMask: EtchMaskHandle;
  private readonly inMistMask: EtchMaskHandle;
  private readonly outCanvas: HTMLCanvasElement;
  private readonly outCtx: CanvasRenderingContext2D | null;
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D | null;

  private readonly imageCache = new Map<string, HTMLImageElement>();
  private activeImg: HTMLImageElement | null = null;
  private outImg: HTMLImageElement | null = null;
  private outSrc: string | null = null;
  private activeLoader: HTMLImageElement | null = null;

  private pw = 0;
  private ph = 0;
  private cssW = 0;
  private radiusPx = 4;

  private animKind: AnimKind = "none";
  private animStart = 0;
  private animDuration = MIST_SWITCH_DURATION_MS;
  private outActive = false;
  private outStart = 0;
  private outDuration = Math.round(MIST_SWITCH_DURATION_MS * 0.62);
  private inStart = 0;
  private inDelay = Math.round(MIST_SWITCH_DURATION_MS * 0.14);
  private inDuration =
    MIST_SWITCH_DURATION_MS - Math.round(MIST_SWITCH_DURATION_MS * 0.14);
  private hasOutPixels = false;
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

    const uid = ++coverMaskCounter;
    const svg = document.createElementNS(MIST_SVG_NS, "svg");
    svg.setAttribute("class", "clean-dissolve-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const defs = document.createElementNS(MIST_SVG_NS, "defs");
    this.shellMistMask = createEtchMask(
      `clean-cover-mist-${uid}`,
      14,
      9,
      317 + uid * 23,
    );
    this.outMistMask = createEtchMask(
      `clean-cover-out-mist-${uid}`,
      14,
      9,
      389 + uid * 31,
    );
    this.inMistMask = createEtchMask(
      `clean-cover-in-mist-${uid}`,
      14,
      9,
      461 + uid * 37,
    );
    defs.append(
      this.shellMistMask.mask,
      this.outMistMask.mask,
      this.inMistMask.mask,
    );
    svg.append(defs);

    const shell = document.createElement("div");
    shell.className = "clean-cover-shell";
    this.shell = shell;

    const outFrame = document.createElement("div");
    outFrame.className = "clean-cover-frame clean-cover-frame--out";
    outFrame.setAttribute("aria-hidden", "true");
    outFrame.hidden = true;
    this.outFrame = outFrame;

    const outCanvas = document.createElement("canvas");
    outCanvas.className = "clean-cover-canvas";
    outCanvas.setAttribute("aria-hidden", "true");
    this.outCanvas = outCanvas;
    this.outCtx = outCanvas.getContext("2d");
    outFrame.append(outCanvas);

    const inFrame = document.createElement("div");
    inFrame.className = "clean-cover-frame clean-cover-frame--in";
    this.inFrame = inFrame;

    const canvas = document.createElement("canvas");
    canvas.className = "clean-cover-canvas";
    canvas.setAttribute("aria-hidden", "true");
    this.displayCanvas = canvas;
    this.displayCtx = canvas.getContext("2d");
    inFrame.append(canvas);

    shell.append(outFrame, inFrame);
    this.root.dataset.visible = "false";
    this.root.dataset.hiding = "false";
    this.root.dataset.instant = "false";
    this.root.dataset.dissolving = "false";
    this.root.dataset.src = "";
    this.root.replaceChildren(svg, shell);
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

  private clearOutgoingFrame() {
    this.outActive = false;
    this.outImg = null;
    this.outSrc = null;
    this.hasOutPixels = false;
    this.outCtx?.clearRect(0, 0, this.pw, this.ph);
    clearMistEtchStyles(this.outFrame);
    this.outFrame.hidden = true;
  }

  private syncCanvasSize(preserveOut = false): boolean {
    const measured = measureCanvasBox(this.root);
    if (!measured) return false;
    const { cssW, pw, ph, borderRadiusPx } = measured;
    this.cssW = cssW;
    this.radiusPx = borderRadiusPx;

    if (pw === this.pw && ph === this.ph) return true;

    let savedOut: HTMLCanvasElement | null = null;
    if (preserveOut && this.hasOutPixels && this.pw > 0 && this.ph > 0) {
      savedOut = document.createElement("canvas");
      savedOut.width = this.pw;
      savedOut.height = this.ph;
      savedOut.getContext("2d")?.drawImage(this.outCanvas, 0, 0);
    }

    this.pw = pw;
    this.ph = ph;
    this.displayCanvas.width = pw;
    this.displayCanvas.height = ph;
    this.outCanvas.width = pw;
    this.outCanvas.height = ph;

    if (savedOut && this.outCtx) {
      this.outCtx.clearRect(0, 0, pw, ph);
      this.outCtx.drawImage(savedOut, 0, 0, pw, ph);
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

    // Crisp physical-scaled hairline inset border inside the bitmap so covers
    // preserve subtle framing without clipping blurred dissolve edges.
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

  private drawCurrentFrame(now: number) {
    const ctx = this.displayCtx;
    if (!ctx || this.pw <= 0 || this.ph <= 0) return;

    if (this.animKind === "reveal") {
      const raw = clamp01((now - this.animStart) / this.animDuration);
      const eased = easeMistReveal(raw);
      const localT = clamp01((eased - 0.08) / 0.86);
      applyMistEtchDissolve(
        this.shell,
        this.shellMistMask,
        localT,
        false,
        "cover",
      );
      return;
    }

    if (this.animKind === "morph") {
      if (this.outActive) {
        const rawOut = clamp01((now - this.outStart) / this.outDuration);
        applyMistEtchDissolve(
          this.outFrame,
          this.outMistMask,
          easeOutQuad(rawOut),
          true,
          "cover",
          "switch",
        );
        if (rawOut >= 1) {
          this.clearOutgoingFrame();
        }
      }
      const elapsedIn = now - this.inStart - this.inDelay;
      const rawIn = elapsedIn <= 0 ? 0 : clamp01(elapsedIn / this.inDuration);
      applyMistEtchDissolve(
        this.inFrame,
        this.inMistMask,
        easeMistReveal(rawIn),
        false,
        "cover",
        "switch",
      );
      return;
    }

    if (this.animKind === "hide") {
      const raw = clamp01((now - this.animStart) / this.animDuration);
      const eased = easeOutQuad(raw);
      const localT = clamp01((eased - 0.08) / 0.84);
      applyMistEtchDissolve(
        this.shell,
        this.shellMistMask,
        localT,
        true,
        "cover",
      );
    }
  }

  private step = (now: number) => {
    this.rafId = 0;
    if (this.disposed || this.animKind === "none") return;

    if (this.animKind === "morph") {
      this.drawCurrentFrame(now);
      const rawIn = clamp01(
        (now - this.inStart - this.inDelay) / this.inDuration,
      );
      if (this.outActive || rawIn < 1) {
        this.scheduleRaf();
        return;
      }
      this.animKind = "none";
      this.clearOutgoingFrame();
      clearMistEtchStyles(this.inFrame);
      this.root.dataset.dissolving = "false";
      return;
    }

    const raw = clamp01((now - this.animStart) / this.animDuration);
    if (raw < 1) {
      this.drawCurrentFrame(now);
      this.scheduleRaf();
      return;
    }

    const finishedKind = this.animKind;
    this.animKind = "none";
    clearMistEtchStyles(this.shell);
    this.clearOutgoingFrame();
    clearMistEtchStyles(this.inFrame);
    this.root.dataset.dissolving = "false";

    if (finishedKind === "hide") {
      this.displayCtx?.clearRect(0, 0, this.pw, this.ph);
      this.hasCanvasPixels = false;
      this.root.dataset.hiding = "false";
      this.root.dataset.visible = "false";
    }
  };

  private settleInstantShow(
    img: HTMLImageElement,
    src: string,
    instant: boolean,
  ) {
    this.cancelRaf();
    this.animKind = "none";
    this.loadingSrc = null;
    this.clearOutgoingFrame();
    clearMistEtchStyles(this.inFrame);
    clearMistEtchStyles(this.shell);
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
    this.clearOutgoingFrame();
    clearMistEtchStyles(this.inFrame);
    clearMistEtchStyles(this.shell);
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

    const now = performance.now();

    if (this.animKind === "reveal") {
      const revealRaw = clamp01((now - this.animStart) / this.animDuration);
      if (revealRaw < 0.35) {
        if (!this.syncCanvasSize()) {
          this.settleInstantShow(img, src, false);
          return;
        }
        this.activeImg = img;
        this.displayedSrc = src;
        this.hasImage = true;
        this.renderImageToCanvas(this.displayCtx, img);
        this.hasCanvasPixels = true;
        this.root.dataset.src = src;
        return;
      }
      clearMistEtchStyles(this.shell);
    }

    const wasVisible =
      this.hasImage &&
      this.root.dataset.visible === "true" &&
      this.hasCanvasPixels &&
      this.animKind !== "hide";

    if (wasVisible) {
      clearMistEtchStyles(this.shell);
      const inProgress =
        this.animKind === "morph"
          ? clamp01((now - this.inStart - this.inDelay) / this.inDuration)
          : 1;
      const keepExistingOut =
        this.animKind === "morph" &&
        this.outActive &&
        this.hasOutPixels &&
        inProgress < 0.42;

      if (!this.syncCanvasSize(keepExistingOut)) {
        this.settleInstantShow(img, src, false);
        return;
      }

      if (!keepExistingOut && this.outCtx && this.pw > 0 && this.ph > 0) {
        this.outCtx.clearRect(0, 0, this.pw, this.ph);
        this.outCtx.drawImage(this.displayCanvas, 0, 0);
        this.outImg = this.activeImg;
        this.outSrc = this.displayedSrc;
        this.hasOutPixels = true;
        this.outFrame.hidden = false;
        this.outDuration = Math.round(MIST_SWITCH_DURATION_MS * 0.62);
        this.outStart = now;
        this.outActive = true;
        bindEtchMask(this.outFrame, this.outMistMask);
      }

      this.activeImg = img;
      this.displayedSrc = src;
      this.hasImage = true;
      this.renderImageToCanvas(this.displayCtx, img);
      this.hasCanvasPixels = true;

      this.inDelay = keepExistingOut
        ? 0
        : Math.round(MIST_SWITCH_DURATION_MS * 0.14);
      this.inDuration = MIST_SWITCH_DURATION_MS - this.inDelay;
      this.inStart = now;
      bindEtchMask(this.inFrame, this.inMistMask);

      this.animKind = "morph";
      this.animStart = now;
      this.animDuration = Math.max(
        this.outActive ? this.outStart + this.outDuration - now : 0,
        this.inDelay + this.inDuration,
      );
    } else {
      this.clearOutgoingFrame();
      clearMistEtchStyles(this.inFrame);
      clearMistEtchStyles(this.shell);
      if (!this.syncCanvasSize()) {
        this.settleInstantShow(img, src, false);
        return;
      }
      this.animKind = "reveal";
      this.animDuration = MIST_RETURN_DURATION_MS;
      this.animStart = now;
      this.activeImg = img;
      this.displayedSrc = src;
      this.hasImage = true;
      this.renderImageToCanvas(this.displayCtx, img);
      this.hasCanvasPixels = true;
      bindEtchMask(this.shell, this.shellMistMask);
    }

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

      if (
        !this.hasImage ||
        this.root.dataset.visible === "false" ||
        !this.hasCanvasPixels
      ) {
        this.settleInstantHide(!animated);
        return;
      }

      if (this.animKind === "hide") {
        if (!animated || document.hidden) {
          this.settleInstantHide(!animated);
        }
        return;
      }

      if (!animated || document.hidden || !this.hasCanvasPixels) {
        this.settleInstantHide(!animated);
        return;
      }

      const now = performance.now();
      if (this.animKind === "morph") {
        const inProgress = clamp01(
          (now - this.inStart - this.inDelay) / this.inDuration,
        );
        if (
          inProgress < 0.45 &&
          this.hasOutPixels &&
          this.displayCtx &&
          this.pw > 0 &&
          this.ph > 0
        ) {
          this.displayCtx.clearRect(0, 0, this.pw, this.ph);
          this.displayCtx.drawImage(this.outCanvas, 0, 0);
          if (this.outImg) this.activeImg = this.outImg;
          this.displayedSrc = this.outSrc;
          this.root.dataset.src = this.outSrc ?? "";
        }
        this.clearOutgoingFrame();
        clearMistEtchStyles(this.inFrame);
      }

      this.cancelRaf();
      this.animKind = "hide";
      this.animDuration = MIST_HIDE_DURATION_MS;
      this.animStart = now;
      bindEtchMask(this.shell, this.shellMistMask);
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

    if (
      this.animKind === "hide" &&
      this.hasImage &&
      this.displayedSrc === src &&
      this.activeImg &&
      this.hasCanvasPixels
    ) {
      const now = performance.now();
      const hideRaw = clamp01((now - this.animStart) / this.animDuration);
      const resumeRaw = clamp01(1 - hideRaw);
      this.cancelRaf();
      this.clearCoalesce();
      this.clearLoader();
      this.loadToken++;
      this.loadingSrc = null;
      this.clearOutgoingFrame();
      clearMistEtchStyles(this.inFrame);
      this.animKind = "reveal";
      this.animDuration = MIST_RETURN_DURATION_MS;
      this.animStart = now - resumeRaw * this.animDuration;
      this.root.dataset.instant = "false";
      this.root.dataset.hiding = "false";
      this.root.dataset.dissolving = "true";
      this.root.dataset.visible = "true";
      bindEtchMask(this.shell, this.shellMistMask);
      this.drawCurrentFrame(now);
      this.scheduleRaf();
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

    if (this.loadingSrc === src && this.animKind !== "hide") {
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
    this.clearOutgoingFrame();
    clearMistEtchStyles(this.inFrame);
    clearMistEtchStyles(this.shell);
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

    if (this.activeImg && this.displayCtx && this.pw > 0 && this.ph > 0) {
      this.renderImageToCanvas(this.displayCtx, this.activeImg);
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
    const preserveOut = this.animKind === "morph" && this.outActive;
    if (!this.syncCanvasSize(preserveOut)) return;
    if (this.pw === prevPw && this.ph === prevPh) return;

    if (isAnimating) {
      if (this.activeImg && this.displayCtx) {
        this.renderImageToCanvas(this.displayCtx, this.activeImg);
        this.hasCanvasPixels = true;
      }
      if (this.outActive && this.outImg && this.outCtx) {
        this.renderImageToCanvas(this.outCtx, this.outImg);
        this.hasOutPixels = true;
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
    this.clearOutgoingFrame();
    clearMistEtchStyles(this.inFrame);
    clearMistEtchStyles(this.shell);
    this.animKind = "none";
    this.activeImg = null;
    this.imageCache.clear();
    this.displayCanvas.width = 0;
    this.displayCanvas.height = 0;
    this.outCanvas.width = 0;
    this.outCanvas.height = 0;
  }
}
