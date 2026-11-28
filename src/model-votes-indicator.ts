export const INDICATOR_IDLE_MS = 3500;

const DOT_SIZE = 2.5;
const DOT_REST_SCALE = 1.25;
const DOT_DOCKED_SCALE = 1.4;

const EXPAND_DURATION_MS = 340;
const MOVE_DURATION_MS = 320;
const RETRACT_TO_DOT_MS = 320;
const RETRACT_TO_HIDDEN_MS = 340;
const DOT_HIDE_DURATION_MS = 180;
const DOCK_SHRINK_MS = 150;
const DOCK_LIFT_DELAY_MS = 140;
const FLYER_FLIGHT_MS = 500;
const UNDOCK_OVERLAP_MS = 120;
const UNDOCK_EXPAND_MS = 240;

const EXPAND_DOT_PHASE = 0.24;
const RETRACT_SHRINK_PHASE = 0.74;

export type IndicatorState =
  | "hidden"
  | "expanding"
  | "bar"
  | "moving"
  | "retracting"
  | "dot"
  | "docking"
  | "docked"
  | "undocking";

export type RetractReason = "idle" | "deactivate" | "collapse";

export interface IndicatorRect {
  x: number;
  y: number;
  height: number;
}

export interface ModelVotesActiveIndicatorOptions {
  el: HTMLElement;
  idleMs?: number;
}

function clamp01(value: number): number {
  return !(value > 0) ? 0 : value >= 1 ? 1 : value;
}

function easeOutQuart(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv * inv;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleBezier(a1: number, a2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t;
}

function sampleBezierDerivative(a1: number, a2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * a1 + 6 * u * t * (a2 - a1) + 3 * t * t * (1 - a2);
}

/** Exact solver for CSS `cubic-bezier(0.22, 1, 0.36, 1)` used by flyers. */
function easeFlyer(progress: number): number {
  const x = clamp01(progress);
  if (x === 0 || x === 1) return x;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const err = sampleBezier(0.22, 0.36, t) - x;
    if (Math.abs(err) < 1e-6) break;
    const dx = sampleBezierDerivative(0.22, 0.36, t);
    if (Math.abs(dx) < 1e-6) break;
    t = clamp01(t - err / dx);
  }
  return sampleBezier(1, 1, t);
}

/**
 * Animates the single shared active-model indicator across expanded & collapsed
 * states:
 * - Enable: dot emerges & extends symmetrically into bar.
 * - Switch: glides along Y with mild mid-flight stretch.
 * - Idle (`3.5s`): contracts from both ends into resting `dot` (Plan A); any
 *   pointer activity expands it back smoothly.
 * - Collapse: contracts into dot first, then flies in lockstep with flyers to
 *   dock beneath the collapsed active model icon.
 * - Expand: flies down with flyers and extends back into the row bar.
 * - Deactivate: contracts cleanly to dot and fades to `hidden`.
 */
export class ModelVotesActiveIndicator {
  private readonly el: HTMLElement;
  private readonly idleMs: number;

  private state: IndicatorState = "hidden";
  private active = false;
  private idleRetracted = false;
  private retractTarget: "dot" | "hidden" = "hidden";
  private retractFromDotOnly = false;
  private expandFromDot = false;

  private currentX = 0;
  private currentY = 0;
  private currentH = 0;
  private currentScale = 1;
  private currentOpacity = 0;

  private fromX = 0;
  private fromY = 0;
  private fromH = DOT_SIZE;
  private fromScale = 1;
  private fromOpacity = 1;

  private dockShrinkMs = 0;
  private dockFlightDelay = 0;
  private undockFlightDelay = 0;
  private undockStretchDelay = 0;

  private targetRect: IndicatorRect = { x: 0, y: 0, height: 20 };

  private animStart = 0;
  private animDuration = EXPAND_DURATION_MS;
  private rafId = 0;
  private idleTimer = 0;
  private disposed = false;

  constructor(options: ModelVotesActiveIndicatorOptions) {
    this.el = options.el;
    this.idleMs = Math.max(400, options.idleMs ?? INDICATOR_IDLE_MS);
    this.hideVisual();
  }

  public getState(): IndicatorState {
    return this.state;
  }

  private stopRaf() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = 0;
    }
  }

  private applyVisual() {
    this.el.style.transform = `translate3d(${this.currentX.toFixed(2)}px, ${this.currentY.toFixed(2)}px, 0) translate(-50%, -50%) scale(${this.currentScale.toFixed(3)})`;
    this.el.style.height = `${Math.max(0, this.currentH).toFixed(2)}px`;
    this.el.style.opacity = this.currentOpacity.toFixed(3);
    this.el.dataset.state = this.state;
    this.el.hidden = this.state === "hidden";
  }

  private hideVisual() {
    this.stopRaf();
    this.state = "hidden";
    this.currentH = 0;
    this.currentScale = 1;
    this.currentOpacity = 0;
    this.applyVisual();
  }

  private applyDot() {
    this.stopRaf();
    this.state = "dot";
    this.currentX = this.targetRect.x;
    this.currentY = this.targetRect.y;
    this.currentH = DOT_SIZE;
    this.currentScale = DOT_REST_SCALE;
    this.currentOpacity = 1;
    this.applyVisual();
  }

  private applyDocked(target: IndicatorRect) {
    this.stopRaf();
    this.state = "docked";
    this.currentX = target.x;
    this.currentY = target.y;
    this.currentH = DOT_SIZE;
    this.currentScale = DOT_DOCKED_SCALE;
    this.currentOpacity = 1;
    this.applyVisual();
  }

  private applyBar(rect: IndicatorRect) {
    this.stopRaf();
    this.state = "bar";
    this.currentX = rect.x;
    this.currentY = rect.y;
    this.currentH = rect.height;
    this.currentScale = 1;
    this.currentOpacity = 1;
    this.applyVisual();
  }

  private scheduleIdleRetract() {
    this.clearIdleTimer();
    if (this.disposed || !this.active || this.state !== "bar") return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.disposed || !this.active || this.state !== "bar") return;
      this.retract(true, "idle");
    }, this.idleMs);
  }

  private step = (now: number) => {
    this.rafId = 0;
    if (this.disposed) return;

    const elapsed = Math.max(0, now - this.animStart);
    const raw = clamp01(elapsed / this.animDuration);

    if (this.state === "expanding") {
      if (this.expandFromDot) {
        const stretchT = easeOutQuart(raw);
        this.currentH = lerp(this.fromH, this.targetRect.height, stretchT);
        this.currentScale = lerp(this.fromScale, 1, stretchT);
        this.currentOpacity = 1;
      } else if (raw < EXPAND_DOT_PHASE) {
        const dotT = easeOutQuart(clamp01(raw / EXPAND_DOT_PHASE));
        this.currentH = DOT_SIZE;
        this.currentScale = lerp(0.45, DOT_REST_SCALE, dotT);
        this.currentOpacity = dotT;
      } else {
        const stretchT = easeOutQuart(
          clamp01((raw - EXPAND_DOT_PHASE) / (1 - EXPAND_DOT_PHASE)),
        );
        this.currentH = lerp(DOT_SIZE, this.targetRect.height, stretchT);
        this.currentScale = lerp(DOT_REST_SCALE, 1, stretchT);
        this.currentOpacity = 1;
      }
      this.currentX = this.targetRect.x;
      this.currentY = this.targetRect.y;
      this.applyVisual();

      if (raw >= 1) {
        this.applyBar(this.targetRect);
        this.scheduleIdleRetract();
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    if (this.state === "moving") {
      const moveT = easeOutQuart(raw);
      const baseH = lerp(this.fromH, this.targetRect.height, moveT);
      const stretch =
        Math.sin(raw * Math.PI) *
        Math.min(10, Math.abs(this.targetRect.y - this.fromY) * 0.16);
      this.currentX = lerp(this.fromX, this.targetRect.x, moveT);
      this.currentY = lerp(this.fromY, this.targetRect.y, moveT);
      this.currentH = baseH + stretch;
      this.currentScale = lerp(this.fromScale, 1, moveT);
      this.currentOpacity = lerp(this.fromOpacity, 1, clamp01(raw * 2));
      this.applyVisual();

      if (raw >= 1) {
        this.applyBar(this.targetRect);
        this.scheduleIdleRetract();
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    if (this.state === "docking") {
      if (this.dockShrinkMs > 0) {
        const sT = easeInOutCubic(clamp01(elapsed / this.dockShrinkMs));
        this.currentH = lerp(this.fromH, DOT_SIZE, sT);
        this.currentScale = lerp(this.fromScale, DOT_DOCKED_SCALE, sT);
      } else {
        const sT = easeOutQuart(clamp01(elapsed / FLYER_FLIGHT_MS));
        this.currentH = lerp(this.fromH, DOT_SIZE, sT);
        this.currentScale = lerp(this.fromScale, DOT_DOCKED_SCALE, sT);
      }

      const fRaw =
        elapsed <= this.dockFlightDelay
          ? 0
          : clamp01((elapsed - this.dockFlightDelay) / FLYER_FLIGHT_MS);
      const fT = easeFlyer(fRaw);
      this.currentX = lerp(this.fromX, this.targetRect.x, fT);
      this.currentY = lerp(this.fromY, this.targetRect.y, fT);
      this.currentOpacity = lerp(this.fromOpacity, 1, clamp01(elapsed / 120));
      this.applyVisual();

      if (elapsed >= this.animDuration) {
        this.applyDocked(this.targetRect);
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    if (this.state === "undocking") {
      const fRaw =
        elapsed <= this.undockFlightDelay
          ? 0
          : clamp01((elapsed - this.undockFlightDelay) / FLYER_FLIGHT_MS);
      const fT = easeFlyer(fRaw);
      this.currentX = lerp(this.fromX, this.targetRect.x, fT);
      this.currentY = lerp(this.fromY, this.targetRect.y, fT);

      const eRaw =
        elapsed <= this.undockStretchDelay
          ? 0
          : clamp01((elapsed - this.undockStretchDelay) / UNDOCK_EXPAND_MS);
      const eT = easeOutQuart(eRaw);
      this.currentH = lerp(this.fromH, this.targetRect.height, eT);
      this.currentScale = lerp(this.fromScale, 1, eT);
      this.currentOpacity = lerp(this.fromOpacity, 1, clamp01(elapsed / 120));
      this.applyVisual();

      if (elapsed >= this.animDuration) {
        this.applyBar(this.targetRect);
        this.scheduleIdleRetract();
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    if (this.state === "retracting") {
      if (this.retractTarget === "dot") {
        const shrinkT = easeInOutCubic(raw);
        this.currentH = lerp(this.fromH, DOT_SIZE, shrinkT);
        this.currentScale = lerp(this.fromScale, DOT_REST_SCALE, shrinkT);
        this.currentOpacity = this.fromOpacity;
        this.applyVisual();

        if (raw >= 1) {
          this.applyDot();
          return;
        }
        this.rafId = requestAnimationFrame(this.step);
        return;
      }

      if (this.retractFromDotOnly) {
        const fadeT = easeOutQuart(raw);
        this.currentH = lerp(this.fromH, 0, fadeT);
        this.currentScale = lerp(this.fromScale, 0.45, fadeT);
        this.currentOpacity = lerp(this.fromOpacity, 0, fadeT);
      } else if (raw < RETRACT_SHRINK_PHASE) {
        const shrinkT = easeInOutCubic(clamp01(raw / RETRACT_SHRINK_PHASE));
        this.currentH = lerp(this.fromH, DOT_SIZE, shrinkT);
        this.currentScale = lerp(this.fromScale, DOT_REST_SCALE, shrinkT);
        this.currentOpacity = this.fromOpacity;
      } else {
        const fadeT = easeOutQuart(
          clamp01((raw - RETRACT_SHRINK_PHASE) / (1 - RETRACT_SHRINK_PHASE)),
        );
        this.currentH = lerp(DOT_SIZE, 0, fadeT);
        this.currentScale = lerp(DOT_REST_SCALE, 0.45, fadeT);
        this.currentOpacity = lerp(this.fromOpacity, 0, fadeT);
      }
      this.applyVisual();

      if (raw >= 1) {
        this.hideVisual();
        return;
      }
      this.rafId = requestAnimationFrame(this.step);
    }
  };

  public activate(rect: IndicatorRect, animated: boolean) {
    if (this.disposed) return;
    this.active = true;
    this.idleRetracted = false;
    this.targetRect = { ...rect };
    this.clearIdleTimer();

    if (!animated) {
      this.applyBar(rect);
      this.scheduleIdleRetract();
      return;
    }

    const crossRow = Math.abs(this.currentY - rect.y) > 1;
    const canSlideFromBar =
      this.state === "bar" ||
      this.state === "moving" ||
      (this.state === "dot" && crossRow) ||
      ((this.state === "expanding" ||
        this.state === "retracting" ||
        this.state === "undocking") &&
        this.currentOpacity > 0.12 &&
        crossRow);

    if (canSlideFromBar) {
      if (
        this.state === "bar" &&
        !crossRow &&
        Math.abs(this.currentX - rect.x) <= 1 &&
        Math.abs(this.currentH - rect.height) <= 1
      ) {
        this.scheduleIdleRetract();
        return;
      }
      this.stopRaf();
      this.fromX = this.currentX;
      this.fromY = this.currentY;
      this.fromH = Math.max(DOT_SIZE, this.currentH);
      this.fromScale = this.currentScale;
      this.fromOpacity = Math.max(0.4, this.currentOpacity);
      this.state = "moving";
      this.animDuration = MOVE_DURATION_MS;
      this.animStart = performance.now();
      this.applyVisual();
      this.rafId = requestAnimationFrame(this.step);
      return;
    }

    const resumeFromVisibleDot =
      (this.state === "dot" ||
        (this.state === "retracting" && this.currentOpacity > 0.25)) &&
      !crossRow;

    this.stopRaf();
    this.state = "expanding";
    this.animDuration = EXPAND_DURATION_MS;
    this.animStart = performance.now();
    this.expandFromDot = resumeFromVisibleDot;
    this.currentX = rect.x;
    this.currentY = rect.y;
    if (resumeFromVisibleDot) {
      this.fromH = Math.max(DOT_SIZE, this.currentH);
      this.fromScale = this.currentScale;
      this.currentOpacity = 1;
    } else {
      this.fromH = DOT_SIZE;
      this.fromScale = 0.45;
      this.currentH = DOT_SIZE;
      this.currentScale = 0.45;
      this.currentOpacity = 0;
    }
    this.applyVisual();
    this.rafId = requestAnimationFrame(this.step);
  }

  public dockToCollapsed(
    target: IndicatorRect,
    staggerMs: number,
    animated: boolean,
  ): number {
    if (this.disposed) return 0;
    this.active = true;
    this.idleRetracted = false;
    this.targetRect = { ...target };
    this.clearIdleTimer();

    if (!animated) {
      this.applyDocked(target);
      return 0;
    }

    if (
      this.state === "docked" &&
      Math.abs(this.currentX - target.x) <= 0.5 &&
      Math.abs(this.currentY - target.y) <= 0.5
    ) {
      this.currentX = target.x;
      this.currentY = target.y;
      this.applyVisual();
      return 0;
    }

    const needsShrink =
      (this.state === "bar" ||
        this.state === "moving" ||
        this.state === "undocking" ||
        this.state === "expanding") &&
      this.currentH > DOT_SIZE + 0.5;
    const liftDelay = needsShrink ? DOCK_LIFT_DELAY_MS : 0;
    const shrinkMs = needsShrink ? DOCK_SHRINK_MS : 0;

    const wasHidden = this.state === "hidden";
    this.stopRaf();
    this.dockShrinkMs = shrinkMs;
    this.dockFlightDelay = liftDelay + Math.max(0, staggerMs);
    this.fromX = wasHidden ? target.x : this.currentX;
    this.fromY = wasHidden ? target.y : this.currentY;
    this.fromH = wasHidden ? DOT_SIZE : Math.max(DOT_SIZE, this.currentH);
    this.fromScale = wasHidden ? 0.5 : this.currentScale;
    this.fromOpacity = wasHidden ? 0 : Math.max(0.4, this.currentOpacity);
    this.state = "docking";
    this.animDuration = Math.max(
      shrinkMs,
      this.dockFlightDelay + FLYER_FLIGHT_MS,
    );
    this.animStart = performance.now();
    this.currentX = this.fromX;
    this.currentY = this.fromY;
    this.currentH = this.fromH;
    this.currentScale = this.fromScale;
    this.currentOpacity = this.fromOpacity;
    this.applyVisual();
    this.rafId = requestAnimationFrame(this.step);
    return liftDelay;
  }

  public undockToExpanded(
    target: IndicatorRect,
    staggerMs: number,
    animated: boolean,
  ) {
    if (this.disposed) return;
    this.active = true;
    this.idleRetracted = false;
    this.targetRect = { ...target };
    this.clearIdleTimer();

    if (!animated) {
      this.applyBar(target);
      this.scheduleIdleRetract();
      return;
    }

    this.stopRaf();
    this.fromX = this.currentX;
    this.fromY = this.currentY;
    this.fromH = Math.max(DOT_SIZE, this.currentH);
    this.fromScale = this.currentScale;
    this.fromOpacity = Math.max(0.4, this.currentOpacity);
    this.undockFlightDelay = Math.max(0, staggerMs);
    this.undockStretchDelay =
      this.undockFlightDelay + FLYER_FLIGHT_MS - UNDOCK_OVERLAP_MS;
    this.state = "undocking";
    this.animDuration = this.undockStretchDelay + UNDOCK_EXPAND_MS;
    this.animStart = performance.now();
    this.applyVisual();
    this.rafId = requestAnimationFrame(this.step);
  }

  public retract(animated: boolean, reason: RetractReason) {
    if (this.disposed) return;
    this.clearIdleTimer();

    const target: "dot" | "hidden" = reason === "idle" ? "dot" : "hidden";
    if (reason === "idle") {
      this.idleRetracted = true;
    } else {
      this.active = false;
      this.idleRetracted = false;
    }

    if (this.state === "hidden") return;
    if (this.state === "dot" && target === "dot") return;

    if (!animated) {
      if (target === "dot") {
        this.applyDot();
      } else {
        this.hideVisual();
      }
      return;
    }

    if (this.state === "retracting" && this.retractTarget === target) return;

    this.retractFromDotOnly =
      target === "hidden" &&
      (this.state === "dot" ||
        this.state === "docked" ||
        (this.state === "docking" && this.currentH <= DOT_SIZE + 0.4) ||
        (this.state === "retracting" && this.currentH <= DOT_SIZE + 0.4));

    this.stopRaf();
    this.retractTarget = target;
    this.fromH = Math.max(DOT_SIZE, this.currentH);
    this.fromScale = this.currentScale;
    this.fromOpacity = Math.max(0.1, this.currentOpacity);
    this.state = "retracting";
    this.animDuration =
      target === "dot"
        ? RETRACT_TO_DOT_MS
        : this.retractFromDotOnly
          ? DOT_HIDE_DURATION_MS
          : RETRACT_TO_HIDDEN_MS;
    this.animStart = performance.now();
    this.applyVisual();
    this.rafId = requestAnimationFrame(this.step);
  }

  public noteActivity(rect: IndicatorRect | null, animated: boolean) {
    if (this.disposed || !this.active || !rect) return;
    if (
      this.idleRetracted ||
      this.state === "dot" ||
      this.state === "retracting" ||
      this.state === "hidden"
    ) {
      this.activate(rect, animated);
      return;
    }
    if (this.state === "bar") {
      this.scheduleIdleRetract();
    }
  }

  public reposition(rect: IndicatorRect | null) {
    if (this.disposed || !rect) return;
    this.targetRect = { ...rect };
    if (this.state === "bar") {
      this.currentX = rect.x;
      this.currentY = rect.y;
      this.currentH = rect.height;
      this.applyVisual();
    } else if (this.state === "dot" || this.state === "docked") {
      this.currentX = rect.x;
      this.currentY = rect.y;
      this.applyVisual();
    }
  }

  public finish() {
    if (this.disposed) return;
    const s = this.state;
    if (s === "hidden" || s === "bar" || s === "dot" || s === "docked") {
      return;
    }
    if (s === "expanding" || s === "moving" || s === "undocking") {
      this.applyBar(this.targetRect);
      this.scheduleIdleRetract();
      return;
    }
    if (s === "docking") {
      this.applyDocked(this.targetRect);
      return;
    }
    if (s === "retracting") {
      if (this.retractTarget === "dot") {
        this.applyDot();
      } else {
        this.hideVisual();
      }
    }
  }

  public snapHidden() {
    if (this.disposed) return;
    this.clearIdleTimer();
    this.active = false;
    this.idleRetracted = false;
    this.hideVisual();
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearIdleTimer();
    this.hideVisual();
  }
}
