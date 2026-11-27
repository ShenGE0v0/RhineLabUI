import type { ModelProvider } from "./model-provider";
import type { ModelVoteEntry } from "./model-votes-data";
import {
  type EtchMaskHandle,
  MIST_HIDE_DURATION_MS,
  MIST_RETURN_DURATION_MS,
  MIST_SVG_NS,
  applyMistEtchDissolve,
  bindEtchMask,
  clamp01,
  clearMistEtchStyles,
  createEtchMask,
  easeMistReveal,
  easeOutQuad,
} from "./mist-etch-dissolve";

export type ModelVotesPhase = "hidden" | "expanded" | "collapsed";

export interface ModelVotesPanelOptions {
  root: HTMLElement;
  resolveProviderUrl: (provider: ModelProvider) => string;
  entries: ModelVoteEntry[];
}

export interface ModelVotesStats {
  phase: ModelVotesPhase;
  expanded: boolean;
  count: number;
}

const MAX_VISIBLE_MODELS = 6;
const BLOCK_FADE_FRACTION = 0.44;
const ICON_LEAD_FRACTION = 0.06;

const INTRO_DISSOLVE_DELAY_MS = 600;
const INTRO_DISSOLVE_DURATION_MS = 1200;
const AUTO_COLLAPSE_MS = 6500;
const LEAVE_COLLAPSE_MS = 2800;
const HOVER_OPEN_DELAY_MS = 180;

type DissolveMode = "none" | "reveal" | "hide";

let maskCounter = 0;

function shuffleBlockDelays(
  count: number,
  previousFirstIndex: number,
): { delays: number[]; firstIndex: number } {
  const safeCount = Math.max(1, count);
  const order = Array.from({ length: safeCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === previousFirstIndex) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  const maxDelay = 1 - BLOCK_FADE_FRACTION;
  const delays = new Array<number>(safeCount);
  order.forEach((blockIndex, slot) => {
    delays[blockIndex] =
      safeCount > 1 ? (slot / (safeCount - 1)) * maxDelay : 0;
  });
  return { delays, firstIndex: order[0] };
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function offsetWithinContainer(
  el: HTMLElement,
  container: HTMLElement,
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== container) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export class ModelVotesPanel {
  private readonly root: HTMLElement;
  private readonly resolveProviderUrl: (provider: ModelProvider) => string;
  private readonly stageWrap: HTMLDivElement;
  private readonly layout: HTMLDivElement;
  private readonly bar: HTMLButtonElement;
  private readonly barMeta: HTMLSpanElement;
  private readonly stackAnchor: HTMLSpanElement;
  private readonly barCount: HTMLSpanElement;
  private readonly list: HTMLUListElement;
  private readonly flyersLayer: HTMLDivElement;

  private readonly headerMask: EtchMaskHandle;
  private readonly iconMasks: EtchMaskHandle[] = [];
  private readonly infoMasks: EtchMaskHandle[] = [];
  private readonly blockDelays = new Float32Array(MAX_VISIBLE_MODELS);
  private readonly prewarmedImages = new Map<ModelProvider, HTMLImageElement>();

  private flyers: HTMLSpanElement[] = [];
  private flyerInners: HTMLSpanElement[] = [];
  private infoEls: HTMLDivElement[] = [];
  private iconSlots: HTMLSpanElement[] = [];
  private entries: ModelVoteEntry[] = [];
  private phase: ModelVotesPhase = "hidden";
  private visibleInArchive = true;
  private pointerInside = false;
  private focusInside = false;
  private externalPaused = false;

  private lastFirstBlock = -1;
  private dissolveMode: DissolveMode = "none";
  private dissolveDurationMs = INTRO_DISSOLVE_DURATION_MS;
  private dissolveOnComplete: (() => void) | null = null;
  private dissolveStart = 0;
  private rafId = 0;
  private maskActive = false;

  private introDelayTimer = 0;
  private collapseTimer = 0;
  private hoverOpenTimer = 0;
  private remainingCollapseMs = AUTO_COLLAPSE_MS;
  private collapseStartedAt = 0;
  private disposed = false;

  constructor(options: ModelVotesPanelOptions) {
    this.root = options.root;
    this.resolveProviderUrl = options.resolveProviderUrl;

    const uid = ++maskCounter;

    const svg = document.createElementNS(MIST_SVG_NS, "svg");
    svg.setAttribute("class", "clean-dissolve-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const defs = document.createElementNS(MIST_SVG_NS, "defs");
    this.headerMask = createEtchMask(
      `model-votes-bar-mask-${uid}`,
      10,
      4,
      31 + uid,
    );
    defs.append(this.headerMask.mask);
    for (let i = 0; i < MAX_VISIBLE_MODELS; i++) {
      const iconMask = createEtchMask(
        `model-votes-icon-mask-${uid}-${i}`,
        5,
        5,
        101 + i * 17 + uid,
      );
      const infoMask = createEtchMask(
        `model-votes-info-mask-${uid}-${i}`,
        10,
        5,
        211 + i * 23 + uid,
      );
      this.iconMasks.push(iconMask);
      this.infoMasks.push(infoMask);
      defs.append(iconMask.mask, infoMask.mask);
    }
    svg.append(defs);

    const stageWrap = document.createElement("div");
    stageWrap.className = "model-votes-stage";
    this.stageWrap = stageWrap;

    const layout = document.createElement("div");
    layout.className = "model-votes-layout";
    this.layout = layout;

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "model-votes-bar";
    bar.setAttribute("aria-expanded", "false");
    bar.setAttribute("aria-controls", "model-votes-body");
    this.bar = bar;

    const stackAnchor = document.createElement("span");
    stackAnchor.className = "model-votes-stack-anchor";
    stackAnchor.setAttribute("aria-hidden", "true");
    this.stackAnchor = stackAnchor;

    const barMeta = document.createElement("span");
    barMeta.className = "model-votes-bar-meta";
    this.barMeta = barMeta;

    const barTitle = document.createElement("span");
    barTitle.className = "model-votes-bar-title";
    barTitle.textContent = "模型票数";

    const barCount = document.createElement("span");
    barCount.className = "model-votes-bar-count";
    this.barCount = barCount;

    const barChevron = document.createElement("span");
    barChevron.className = "model-votes-chevron";
    barChevron.setAttribute("aria-hidden", "true");
    barChevron.textContent = "▾";

    barMeta.append(barTitle, barCount, barChevron);
    bar.append(stackAnchor, barMeta);

    const list = document.createElement("ul");
    list.id = "model-votes-body";
    list.className = "model-votes-grid";
    this.list = list;

    const flyersLayer = document.createElement("div");
    flyersLayer.className = "model-votes-flyers";
    flyersLayer.setAttribute("aria-hidden", "true");
    this.flyersLayer = flyersLayer;

    layout.append(bar, list);
    stageWrap.append(layout, flyersLayer);
    this.root.replaceChildren(svg, stageWrap);
    this.root.dataset.phase = "hidden";
    this.root.dataset.dissolving = "false";
    this.root.dataset.hiding = "false";
    this.root.dataset.countdown = "idle";
    this.root.hidden = true;
    this.root.inert = true;

    bar.addEventListener("click", this.onToggleClick);
    layout.addEventListener("pointerenter", this.onPointerEnter);
    layout.addEventListener("pointerleave", this.onPointerLeave);
    layout.addEventListener("focusin", this.onFocusIn);
    layout.addEventListener("focusout", this.onFocusOut);

    this.setEntries(options.entries);
  }

  private clearIntroTimers() {
    if (this.introDelayTimer) {
      window.clearTimeout(this.introDelayTimer);
      this.introDelayTimer = 0;
    }
  }

  private clearCollapseTimer() {
    if (this.collapseTimer) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = 0;
    }
  }

  private clearHoverOpenTimer() {
    if (this.hoverOpenTimer) {
      window.clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = 0;
    }
  }

  private clearAllTimers() {
    this.clearIntroTimers();
    this.clearCollapseTimer();
    this.clearHoverOpenTimer();
  }

  private clearDissolveTargets() {
    clearMistEtchStyles(this.barMeta);
    for (const info of this.infoEls) {
      clearMistEtchStyles(info);
    }
    for (const inner of this.flyerInners) {
      clearMistEtchStyles(inner);
    }
  }

  private stopDissolve() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.maskActive = false;
    this.dissolveMode = "none";
    this.dissolveOnComplete = null;
    this.root.dataset.dissolving = "false";
    this.root.dataset.hiding = "false";
    this.clearDissolveTargets();
  }

  private readStackStep(): number {
    const raw = getComputedStyle(this.root)
      .getPropertyValue("--stack-step")
      .trim();
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 38;
  }

  private syncFlyerPositions(instant = false) {
    if (this.disposed || this.flyers.length === 0) return;

    const expanded = this.phase === "expanded";
    if (instant) {
      for (const flyer of this.flyers) {
        flyer.style.transition = "none";
      }
    }

    if (expanded) {
      for (let i = 0; i < this.flyers.length; i++) {
        const slot = this.iconSlots[i];
        if (!slot) continue;
        const pos = offsetWithinContainer(slot, this.stageWrap);
        this.flyers[i].style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
      }
    } else {
      const anchor = offsetWithinContainer(this.stackAnchor, this.stageWrap);
      const step = this.readStackStep();
      for (let i = 0; i < this.flyers.length; i++) {
        const x = Math.round(anchor.x + i * step);
        const y = Math.round(anchor.y);
        this.flyers[i].style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }

    if (instant) {
      void this.flyersLayer.offsetWidth;
      for (const flyer of this.flyers) {
        flyer.style.removeProperty("transition");
      }
    }
  }

  private applyDissolveProgress(progress: number) {
    const hiding = this.dissolveMode === "hide";
    const headerStart = hiding ? 1 - BLOCK_FADE_FRACTION : 0;
    const headerT = clamp01((progress - headerStart) / BLOCK_FADE_FRACTION);
    applyMistEtchDissolve(
      this.barMeta,
      this.headerMask,
      headerT,
      hiding,
      "text",
    );

    const activeCount = Math.min(MAX_VISIBLE_MODELS, this.flyerInners.length);
    const includeInfo = this.phase === "expanded";
    for (let i = 0; i < activeCount; i++) {
      const delay = this.blockDelays[i];
      const iconDelay = hiding ? delay : Math.max(0, delay - ICON_LEAD_FRACTION);
      const localIconT = clamp01((progress - iconDelay) / BLOCK_FADE_FRACTION);
      applyMistEtchDissolve(
        this.flyerInners[i],
        this.iconMasks[i],
        localIconT,
        hiding,
        "icon",
      );

      if (includeInfo && this.infoEls[i]) {
        const infoDelay = hiding ? Math.max(0, delay - 0.03) : delay;
        const localInfoT = clamp01((progress - infoDelay) / BLOCK_FADE_FRACTION);
        applyMistEtchDissolve(
          this.infoEls[i],
          this.infoMasks[i],
          localInfoT,
          hiding,
          "text",
        );
      }
    }
  }

  private stepDissolve = (now: number) => {
    this.rafId = 0;
    if (this.disposed || !this.maskActive) return;

    const raw = clamp01((now - this.dissolveStart) / this.dissolveDurationMs);
    const eased =
      this.dissolveMode === "hide" ? easeOutQuad(raw) : easeMistReveal(raw);
    this.applyDissolveProgress(eased);
    if (raw < 1) {
      this.rafId = requestAnimationFrame(this.stepDissolve);
      return;
    }
    const onComplete = this.dissolveOnComplete;
    this.stopDissolve();
    onComplete?.();
  };

  private startDissolve(
    mode: Exclude<DissolveMode, "none">,
    durationMs: number,
    onComplete?: () => void,
  ) {
    this.stopDissolve();
    this.dissolveMode = mode;
    this.dissolveDurationMs = Math.max(1, durationMs);
    this.dissolveOnComplete = onComplete ?? null;
    this.root.dataset.dissolving = "true";
    this.root.dataset.hiding = mode === "hide" ? "true" : "false";

    const activeCount = Math.min(
      MAX_VISIBLE_MODELS,
      Math.max(1, this.flyerInners.length),
    );
    const { delays, firstIndex } = shuffleBlockDelays(
      activeCount,
      this.lastFirstBlock,
    );
    this.lastFirstBlock = firstIndex;
    for (let i = 0; i < activeCount; i++) {
      this.blockDelays[i] = delays[i];
    }

    const hiding = mode === "hide";
    bindEtchMask(this.barMeta, this.headerMask, hiding);
    const includeInfo = this.phase === "expanded";
    for (let i = 0; i < activeCount; i++) {
      bindEtchMask(this.flyerInners[i], this.iconMasks[i], hiding);
      if (includeInfo) {
        bindEtchMask(this.infoEls[i], this.infoMasks[i], hiding);
      }
    }

    this.applyDissolveProgress(0);
    this.maskActive = true;
    this.dissolveStart = performance.now();
    this.rafId = requestAnimationFrame(this.stepDissolve);
  }

  private beginExpandedDissolve() {
    if (this.disposed || !this.visibleInArchive) return;
    this.setPhase("expanded", true);
    this.startDissolve("reveal", INTRO_DISSOLVE_DURATION_MS);
    this.scheduleAutoCollapse(INTRO_DISSOLVE_DURATION_MS + AUTO_COLLAPSE_MS);
  }

  private setPhase(next: ModelVotesPhase, instantFlyers = false) {
    this.phase = next;
    this.root.dataset.phase = next;
    const isHidden = next === "hidden" || !this.visibleInArchive;
    this.root.hidden = isHidden;
    this.root.inert = isHidden || this.externalPaused;
    if (isHidden) {
      this.pointerInside = false;
      this.focusInside = false;
    }
    const expanded = next === "expanded";
    this.bar.setAttribute("aria-expanded", String(expanded));
    this.list.setAttribute("aria-hidden", String(!expanded));
    this.bar.setAttribute(
      "aria-label",
      expanded ? "折叠模型票数排行" : "展开模型票数排行",
    );
    if (!expanded) {
      this.clearCollapseTimer();
      this.remainingCollapseMs = AUTO_COLLAPSE_MS;
      this.setCountdownState("idle");
    }
    if (!isHidden) {
      this.syncFlyerPositions(instantFlyers);
    }
  }

  private setCountdownState(state: "running" | "paused" | "idle") {
    this.root.dataset.countdown = state;
  }

  private isHoldingOpen(): boolean {
    return this.pointerInside || this.focusInside || this.externalPaused;
  }

  private scheduleAutoCollapse(delayMs: number) {
    this.clearCollapseTimer();
    this.remainingCollapseMs = Math.max(400, delayMs);
    if (this.phase !== "expanded" || this.disposed) return;

    if (this.isHoldingOpen()) {
      this.setCountdownState("paused");
      return;
    }

    this.collapseStartedAt = performance.now();
    this.setCountdownState("running");
    this.collapseTimer = window.setTimeout(() => {
      this.collapseTimer = 0;
      if (this.disposed || this.phase !== "expanded") return;
      if (this.isHoldingOpen()) {
        this.setCountdownState("paused");
        return;
      }
      this.setPhase("collapsed");
    }, this.remainingCollapseMs);
  }

  private pauseCountdown() {
    if (this.phase !== "expanded") return;
    if (this.collapseTimer) {
      const elapsed = performance.now() - this.collapseStartedAt;
      this.remainingCollapseMs = Math.max(
        600,
        this.remainingCollapseMs - elapsed,
      );
      this.clearCollapseTimer();
    }
    this.setCountdownState("paused");
  }

  private resumeCountdown(minRemainingMs = LEAVE_COLLAPSE_MS) {
    if (this.phase !== "expanded" || this.isHoldingOpen()) return;
    const targetMs = Math.max(
      minRemainingMs,
      Math.min(AUTO_COLLAPSE_MS, this.remainingCollapseMs),
    );
    this.scheduleAutoCollapse(targetMs);
  }

  private onToggleClick = () => {
    if (this.disposed || !this.visibleInArchive) return;
    this.clearIntroTimers();
    this.clearHoverOpenTimer();
    this.stopDissolve();
    if (this.phase === "expanded") {
      this.setPhase("collapsed");
    } else {
      this.setPhase("expanded");
      this.scheduleAutoCollapse(AUTO_COLLAPSE_MS);
    }
  };

  private onPointerEnter = (event: PointerEvent) => {
    if (this.disposed || !this.visibleInArchive) return;
    this.pointerInside = true;
    if (this.phase === "expanded") {
      this.pauseCountdown();
      return;
    }
    if (
      event.pointerType === "mouse" &&
      this.phase === "collapsed" &&
      !this.hoverOpenTimer
    ) {
      this.hoverOpenTimer = window.setTimeout(() => {
        this.hoverOpenTimer = 0;
        if (
          !this.disposed &&
          this.visibleInArchive &&
          this.pointerInside &&
          this.phase === "collapsed"
        ) {
          this.stopDissolve();
          this.setPhase("expanded");
          this.pauseCountdown();
        }
      }, HOVER_OPEN_DELAY_MS);
    }
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.clearHoverOpenTimer();
    if (this.phase === "expanded") {
      this.resumeCountdown(LEAVE_COLLAPSE_MS);
    }
  };

  private onFocusIn = () => {
    if (this.disposed || !this.visibleInArchive) return;
    this.focusInside = true;
    if (this.phase === "expanded") {
      this.pauseCountdown();
    }
  };

  private onFocusOut = (event: FocusEvent) => {
    const related = event.relatedTarget;
    if (related instanceof Node && this.layout.contains(related)) return;
    this.focusInside = false;
    if (this.phase === "expanded") {
      this.resumeCountdown(LEAVE_COLLAPSE_MS);
    }
  };

  private createBadgeGraphic(entry: ModelVoteEntry): HTMLElement {
    if (entry.provider) {
      const img = document.createElement("img");
      img.className = "model-vote-provider-img";
      img.src = this.resolveProviderUrl(entry.provider);
      img.alt = "";
      img.decoding = "async";
      img.setAttribute("aria-hidden", "true");
      return img;
    }
    const mono = document.createElement("span");
    mono.className = "model-vote-monogram";
    mono.setAttribute("aria-hidden", "true");
    mono.textContent = entry.monogram;
    return mono;
  }

  public setEntries(next: ModelVoteEntry[]) {
    if (this.disposed) return;
    if (this.maskActive) {
      this.stopDissolve();
      if (!this.visibleInArchive) {
        this.setPhase("hidden", true);
      }
    }
    this.entries = next.slice(0, MAX_VISIBLE_MODELS).map((item) => ({ ...item }));
    this.preloadIcons();

    const count = this.entries.length;
    this.root.style.setProperty("--stack-count", String(Math.max(1, count)));
    this.barCount.textContent = String(count);

    const slots: HTMLSpanElement[] = [];
    const infos: HTMLDivElement[] = [];
    const cards: HTMLLIElement[] = this.entries.map((entry, idx) => {
      const li = document.createElement("li");
      li.className = "model-vote-item";
      li.style.setProperty("--i", String(idx));

      const iconSlot = document.createElement("span");
      iconSlot.className = "model-vote-icon-slot";
      iconSlot.setAttribute("aria-hidden", "true");
      slots.push(iconSlot);

      const info = document.createElement("div");
      info.className = "model-vote-info";
      infos.push(info);

      const nameEl = document.createElement("strong");
      nameEl.className = "model-vote-name";
      nameEl.textContent = entry.name;

      const metrics = document.createElement("div");
      metrics.className = "model-vote-metrics";

      const votesEl = document.createElement("span");
      votesEl.className = "model-vote-count";
      votesEl.textContent = `${entry.votes} 票`;
      metrics.append(votesEl);

      if (entry.score !== undefined) {
        const scoreEl = document.createElement("span");
        scoreEl.className = "model-vote-score";
        scoreEl.textContent = formatScore(entry.score);
        metrics.append(scoreEl);
      }

      info.append(nameEl, metrics);
      li.append(iconSlot, info);
      return li;
    });

    const flyerInners: HTMLSpanElement[] = [];
    const flyers: HTMLSpanElement[] = this.entries.map((entry, idx) => {
      const flyer = document.createElement("span");
      flyer.className = "model-vote-flyer";
      flyer.style.setProperty("--i", String(idx));
      flyer.style.zIndex = String(count - idx);

      const inner = document.createElement("span");
      inner.className = "model-vote-flyer-inner";
      inner.append(this.createBadgeGraphic(entry));
      flyerInners.push(inner);

      flyer.append(inner);
      return flyer;
    });

    this.iconSlots = slots;
    this.infoEls = infos;
    this.flyers = flyers;
    this.flyerInners = flyerInners;
    this.list.replaceChildren(...cards);
    this.flyersLayer.replaceChildren(...flyers);

    if (this.phase !== "hidden" && this.visibleInArchive) {
      this.syncFlyerPositions(true);
    }
  }

  public preloadIcons() {
    for (const entry of this.entries) {
      if (!entry.provider || this.prewarmedImages.has(entry.provider)) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = this.resolveProviderUrl(entry.provider);
      this.prewarmedImages.set(entry.provider, img);
    }
  }

  public startIntro(animated: boolean) {
    if (this.disposed || !this.visibleInArchive) return;
    this.clearAllTimers();
    this.stopDissolve();
    this.preloadIcons();

    if (!animated) {
      this.setPhase("expanded", true);
      this.scheduleAutoCollapse(AUTO_COLLAPSE_MS);
      return;
    }

    this.setPhase("hidden", true);
    this.introDelayTimer = window.setTimeout(() => {
      this.introDelayTimer = 0;
      if (this.disposed || !this.visibleInArchive) return;
      this.beginExpandedDissolve();
    }, INTRO_DISSOLVE_DELAY_MS);
  }

  public interruptIntro() {
    if (this.disposed) return;
    if (this.phase === "hidden") {
      this.clearIntroTimers();
      this.stopDissolve();
      if (this.visibleInArchive) {
        this.setPhase("collapsed", true);
      }
      return;
    }
    if (this.maskActive && this.dissolveMode === "reveal") {
      this.stopDissolve();
    }
  }

  public setArchiveVisible(visible: boolean, animated = false) {
    if (this.disposed || visible === this.visibleInArchive) return;
    this.visibleInArchive = visible;
    this.clearAllTimers();

    if (!visible) {
      this.pointerInside = false;
      this.focusInside = false;
      this.clearCollapseTimer();
      this.setCountdownState("idle");

      if (this.phase === "hidden" || !animated) {
        this.stopDissolve();
        this.setPhase("hidden", true);
        return;
      }

      this.root.hidden = false;
      this.root.inert = true;
      this.startDissolve("hide", MIST_HIDE_DURATION_MS, () => {
        if (!this.visibleInArchive) {
          this.setPhase("hidden", true);
        }
      });
      return;
    }

    this.stopDissolve();
    this.setPhase("collapsed", true);
    if (animated) {
      this.startDissolve("reveal", MIST_RETURN_DURATION_MS);
    }
  }

  public setOpen(open: boolean) {
    if (this.disposed || !this.visibleInArchive) return;
    this.clearIntroTimers();
    this.clearHoverOpenTimer();
    this.stopDissolve();
    const wasHidden = this.phase === "hidden";
    if (open) {
      if (wasHidden) {
        this.setPhase("collapsed", true);
      }
      this.setPhase("expanded", false);
      this.scheduleAutoCollapse(AUTO_COLLAPSE_MS);
    } else {
      this.setPhase("collapsed", wasHidden);
    }
  }

  public setPaused(paused: boolean) {
    if (this.disposed || this.externalPaused === paused) return;
    this.externalPaused = paused;
    if (paused) {
      this.pointerInside = false;
      this.focusInside = false;
      this.clearHoverOpenTimer();
    }
    this.root.inert =
      this.phase === "hidden" || !this.visibleInArchive || this.externalPaused;
    if (this.phase !== "expanded") return;
    if (paused) {
      this.pauseCountdown();
    } else {
      this.resumeCountdown(LEAVE_COLLAPSE_MS);
    }
  }

  public resize() {
    if (
      this.disposed ||
      this.phase === "hidden" ||
      (!this.visibleInArchive && !this.maskActive)
    ) {
      return;
    }
    this.syncFlyerPositions(true);
  }

  public finish() {
    if (this.disposed) return;
    if (this.maskActive) {
      const mode = this.dissolveMode;
      this.stopDissolve();
      if (mode === "hide" && !this.visibleInArchive) {
        this.setPhase("hidden", true);
      }
    }
    if (this.introDelayTimer) {
      this.clearIntroTimers();
      if (this.visibleInArchive) {
        this.setPhase("expanded", true);
        this.scheduleAutoCollapse(AUTO_COLLAPSE_MS);
      }
    }
  }

  public stats(): ModelVotesStats {
    return {
      phase: this.phase,
      expanded: this.phase === "expanded",
      count: this.entries.length,
    };
  }

  public dispose() {
    this.disposed = true;
    this.clearAllTimers();
    this.stopDissolve();
    this.bar.removeEventListener("click", this.onToggleClick);
    this.layout.removeEventListener("pointerenter", this.onPointerEnter);
    this.layout.removeEventListener("pointerleave", this.onPointerLeave);
    this.layout.removeEventListener("focusin", this.onFocusIn);
    this.layout.removeEventListener("focusout", this.onFocusOut);
    this.prewarmedImages.clear();
    this.flyers = [];
    this.flyerInners = [];
    this.infoEls = [];
    this.iconSlots = [];
    this.root.replaceChildren();
  }
}
