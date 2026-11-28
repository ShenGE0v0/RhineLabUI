import {
  MIST_HIDE_DURATION_MS,
  MIST_RETURN_DURATION_MS,
  MIST_SVG_NS,
  type EtchMaskHandle,
  applyMistEtchDissolve,
  bindEtchMask,
  clamp01,
  clearMistEtchStyles,
  createEtchMask,
  easeMistReveal,
  easeOutQuad,
} from "./mist-etch-dissolve";

export interface MistDissolveToastOptions {
  root: HTMLElement;
  shouldAnimate: () => boolean;
  holdMs?: number;
}

type ToastMode = "hidden" | "revealing" | "visible" | "hiding";

let toastMaskCounter = 0;

/**
 * Renders borderless toast notifications using the shared 8-stratum
 * micro-etch `<mask>` + optical soft-focus dissolve for both entrance and exit.
 */
export class MistDissolveToast {
  private readonly root: HTMLElement;
  private readonly shouldAnimate: () => boolean;
  private readonly holdMs: number;
  private readonly textEl: HTMLSpanElement;
  private readonly mistMask: EtchMaskHandle;

  private mode: ToastMode = "hidden";
  private rafId = 0;
  private animStart = 0;
  private animDuration = MIST_RETURN_DURATION_MS;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(options: MistDissolveToastOptions) {
    this.root = options.root;
    this.shouldAnimate = options.shouldAnimate;
    this.holdMs = options.holdMs ?? 2400;

    const uid = ++toastMaskCounter;
    const svg = document.createElementNS(MIST_SVG_NS, "svg");
    svg.setAttribute("class", "clean-dissolve-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const defs = document.createElementNS(MIST_SVG_NS, "defs");
    this.mistMask = createEtchMask(`toast-mist-${uid}`, 10, 4, 389 + uid * 23);
    defs.append(this.mistMask.mask);
    svg.append(defs);

    this.textEl = document.createElement("span");
    this.textEl.className = "toast-text";

    this.root.dataset.visibility = "hidden";
    this.root.dataset.dissolving = "false";
    this.root.replaceChildren(svg, this.textEl);
  }

  private stopRaf() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private scheduleHide(useDynamicMotion: boolean) {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.hide(useDynamicMotion ? this.shouldAnimate() : false);
    }, this.holdMs);
  }

  private finishHidden() {
    this.stopRaf();
    clearMistEtchStyles(this.textEl);
    this.textEl.textContent = "";
    this.mode = "hidden";
    this.root.classList.remove("visible");
    this.root.dataset.visibility = "hidden";
    this.root.dataset.dissolving = "false";
  }

  private step = (now: number) => {
    this.rafId = 0;
    if (this.disposed) return;

    const raw = clamp01((now - this.animStart) / this.animDuration);

    if (this.mode === "revealing") {
      applyMistEtchDissolve(
        this.textEl,
        this.mistMask,
        easeMistReveal(raw),
        false,
        "text",
      );
      if (raw >= 1) {
        clearMistEtchStyles(this.textEl);
        this.mode = "visible";
        this.root.dataset.dissolving = "false";
        this.scheduleHide(true);
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    if (this.mode === "hiding") {
      applyMistEtchDissolve(
        this.textEl,
        this.mistMask,
        easeOutQuad(raw),
        true,
        "text",
      );
      if (raw >= 1) {
        this.finishHidden();
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
    }
  };

  show(message: string, animated = this.shouldAnimate()) {
    if (this.disposed) return;

    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.stopRaf();
    clearMistEtchStyles(this.textEl);

    this.textEl.textContent = message;
    this.root.classList.add("visible");
    this.root.dataset.visibility = "visible";

    if (!animated) {
      this.mode = "visible";
      this.root.dataset.dissolving = "false";
      this.scheduleHide(false);
      return;
    }

    this.mode = "revealing";
    this.animDuration = MIST_RETURN_DURATION_MS;
    this.animStart = performance.now();
    this.root.dataset.dissolving = "true";
    bindEtchMask(this.textEl, this.mistMask);
    applyMistEtchDissolve(this.textEl, this.mistMask, 0, false, "text");
    this.rafId = requestAnimationFrame(this.step);
  }

  hide(animated = this.shouldAnimate()) {
    if (this.disposed) return;

    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (this.mode === "hidden") return;

    if (!animated) {
      this.finishHidden();
      return;
    }

    if (this.mode === "hiding") return;

    this.stopRaf();
    this.mode = "hiding";
    this.animDuration = MIST_HIDE_DURATION_MS;
    this.animStart = performance.now();
    this.root.dataset.visibility = "hiding";
    this.root.dataset.dissolving = "true";
    bindEtchMask(this.textEl, this.mistMask);
    applyMistEtchDissolve(this.textEl, this.mistMask, 0, true, "text");
    this.rafId = requestAnimationFrame(this.step);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.stopRaf();
    clearMistEtchStyles(this.textEl);
    this.root.classList.remove("visible");
    this.root.dataset.visibility = "hidden";
    this.root.dataset.dissolving = "false";
  }
}
