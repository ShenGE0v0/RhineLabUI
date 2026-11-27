import type { ModelProvider } from "./model-provider";
import {
  type EtchMaskHandle,
  MIST_HIDE_DURATION_MS,
  MIST_RETURN_DURATION_MS,
  MIST_SVG_NS,
  MIST_SWITCH_DURATION_MS,
  applyMistEtchDissolve,
  bindEtchMask,
  clamp01,
  clearMistEtchStyles,
  createEtchMask,
  easeMistReveal,
  easeOutQuad,
} from "./mist-etch-dissolve";

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

let maskIdCounter = 0;

/**
 * Renders the clean-mode top-right `[provider SVG + archive title]` pair using
 * the shared micro-etch `<mask>` + optical mist dissolve for initial reveal,
 * `detail` exit / `archive` return, and card-to-card hover/selection switches.
 */
export class BlockDissolveTitle {
  private readonly root: HTMLElement;
  private readonly resolveProviderUrl: (provider: ModelProvider) => string;
  private readonly outLayer: LayerRefs;
  private readonly inLayer: LayerRefs;
  private readonly outIconMistMask: EtchMaskHandle;
  private readonly outTextMistMask: EtchMaskHandle;
  private readonly iconMistMask: EtchMaskHandle;
  private readonly textMistMask: EtchMaskHandle;
  private readonly readyProviders = new Set<ModelProvider>();
  private readonly prewarmedImages: HTMLImageElement[] = [];

  private activeTitle: string;
  private activeProvider: ModelProvider | undefined;
  private outgoingTitle = "";
  private outgoingProvider: ModelProvider | undefined;

  private activeIconToken = 0;
  private rafId = 0;
  private outActive = false;
  private inActive = false;
  private outStart = 0;
  private outDuration = Math.round(MIST_SWITCH_DURATION_MS * 0.62);
  private inStart = 0;
  private inDelay = Math.round(MIST_SWITCH_DURATION_MS * 0.14);
  private inDuration = MIST_SWITCH_DURATION_MS - Math.round(MIST_SWITCH_DURATION_MS * 0.14);

  private archiveVisible = true;
  private visibilityMode: "none" | "reveal" | "hide" = "none";
  private visibilityRafId = 0;
  private visibilityStart = 0;
  private visibilityDuration = MIST_HIDE_DURATION_MS;

  constructor(options: BlockDissolveTitleOptions) {
    this.root = options.root;
    this.resolveProviderUrl = options.resolveProviderUrl;
    this.activeTitle = options.initialTitle;
    this.activeProvider = options.initialProvider;

    const uid = ++maskIdCounter;
    const svg = document.createElementNS(MIST_SVG_NS, "svg");
    svg.setAttribute("class", "clean-dissolve-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const defs = document.createElementNS(MIST_SVG_NS, "defs");
    this.outIconMistMask = createEtchMask(
      `clean-title-out-icon-mist-${uid}`,
      5,
      5,
      173 + uid * 17,
    );
    this.outTextMistMask = createEtchMask(
      `clean-title-out-text-mist-${uid}`,
      10,
      4,
      293 + uid * 29,
    );
    this.iconMistMask = createEtchMask(
      `clean-title-icon-mist-${uid}`,
      5,
      5,
      149 + uid * 13,
    );
    this.textMistMask = createEtchMask(
      `clean-title-text-mist-${uid}`,
      10,
      4,
      263 + uid * 19,
    );
    defs.append(
      this.outIconMistMask.mask,
      this.outTextMistMask.mask,
      this.iconMistMask.mask,
      this.textMistMask.mask,
    );
    svg.append(defs);

    this.outLayer = this.createLayer("clean-title-layer--out", true, "sync");
    this.outLayer.root.hidden = true;
    this.inLayer = this.createLayer("clean-title-layer--in", false, "sync");
    this.inLayer.icon.id = "clean-title-provider";
    this.inLayer.text.id = "clean-title-text";

    this.root.dataset.visibility = "visible";
    this.root.dataset.dissolving = "false";
    this.root.replaceChildren(svg, this.outLayer.root, this.inLayer.root);

    this.inLayer.text.textContent = this.activeTitle;
    this.applyActiveProvider(this.activeProvider);
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

  private syncLoadedIconMist() {
    if (this.visibilityMode === "reveal" || this.visibilityMode === "hide") {
      bindEtchMask(this.inLayer.icon, this.iconMistMask);
      const raw = clamp01(
        (performance.now() - this.visibilityStart) / this.visibilityDuration,
      );
      const eased =
        this.visibilityMode === "hide" ? easeOutQuad(raw) : easeMistReveal(raw);
      this.applyVisibilityProgress(eased);
      return;
    }
    if (this.inActive) {
      bindEtchMask(this.inLayer.icon, this.iconMistMask);
      const elapsed = performance.now() - this.inStart - this.inDelay;
      const rawIn = elapsed <= 0 ? 0 : clamp01(elapsed / this.inDuration);
      this.applySwitchIn(easeMistReveal(rawIn));
    }
  }

  private applyActiveProvider(provider: ModelProvider | undefined) {
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
      this.syncLoadedIconMist();
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

  private clearOutgoing() {
    this.outActive = false;
    this.outgoingTitle = "";
    this.outgoingProvider = undefined;
    clearMistEtchStyles(this.outLayer.icon);
    clearMistEtchStyles(this.outLayer.text);
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
    clearMistEtchStyles(this.inLayer.icon);
    clearMistEtchStyles(this.inLayer.text);
    this.clearOutgoing();
    if (this.visibilityMode === "none") {
      this.root.dataset.dissolving = "false";
    }
  }

  private applySwitchOut(eased: number) {
    const hasOutIcon =
      !this.outLayer.icon.hidden && Boolean(this.outgoingProvider);
    const textT = hasOutIcon ? clamp01(eased / 0.85) : clamp01(eased);
    applyMistEtchDissolve(
      this.outLayer.text,
      this.outTextMistMask,
      textT,
      true,
      "text",
      "switch",
    );
    if (hasOutIcon) {
      const iconT = clamp01((eased - 0.12) / 0.88);
      applyMistEtchDissolve(
        this.outLayer.icon,
        this.outIconMistMask,
        iconT,
        true,
        "icon",
        "switch",
      );
    }
  }

  private applySwitchIn(eased: number) {
    const hasInIcon =
      !this.inLayer.icon.hidden && Boolean(this.activeProvider);
    if (hasInIcon) {
      const iconT = clamp01(eased / 0.84);
      applyMistEtchDissolve(
        this.inLayer.icon,
        this.iconMistMask,
        iconT,
        false,
        "icon",
        "switch",
      );
    }
    const textT = hasInIcon ? clamp01((eased - 0.1) / 0.9) : clamp01(eased);
    applyMistEtchDissolve(
      this.inLayer.text,
      this.textMistMask,
      textT,
      false,
      "text",
      "switch",
    );
  }

  private step = (now: number) => {
    this.rafId = 0;

    if (this.outActive) {
      const rawOut = clamp01((now - this.outStart) / this.outDuration);
      this.applySwitchOut(easeOutQuad(rawOut));
      if (rawOut >= 1) {
        this.clearOutgoing();
      }
    }

    if (this.inActive) {
      const elapsed = now - this.inStart - this.inDelay;
      const rawIn = elapsed <= 0 ? 0 : clamp01(elapsed / this.inDuration);
      this.applySwitchIn(easeMistReveal(rawIn));
      if (rawIn >= 1) {
        this.inActive = false;
        clearMistEtchStyles(this.inLayer.icon);
        clearMistEtchStyles(this.inLayer.text);
      }
    }

    if (this.outActive || this.inActive) {
      this.rafId = requestAnimationFrame(this.step);
    } else {
      this.stopAnimation();
    }
  };

  private clearVisibilityStyles() {
    clearMistEtchStyles(this.inLayer.icon);
    clearMistEtchStyles(this.inLayer.text);
  }

  private stopVisibilityDissolve() {
    if (this.visibilityRafId) {
      cancelAnimationFrame(this.visibilityRafId);
      this.visibilityRafId = 0;
    }
    this.visibilityMode = "none";
    this.root.dataset.dissolving = "false";
    this.clearVisibilityStyles();
    this.root.dataset.visibility = this.archiveVisible ? "visible" : "hidden";
  }

  private applyVisibilityProgress(eased: number) {
    const hiding = this.visibilityMode === "hide";
    const hasIcon = !this.inLayer.icon.hidden && Boolean(this.activeProvider);

    if (hiding) {
      const textT = hasIcon ? clamp01(eased / 0.74) : clamp01(eased / 0.88);
      applyMistEtchDissolve(
        this.inLayer.text,
        this.textMistMask,
        textT,
        true,
        "text",
      );
      if (hasIcon) {
        const iconT = clamp01((eased - 0.14) / 0.74);
        applyMistEtchDissolve(
          this.inLayer.icon,
          this.iconMistMask,
          iconT,
          true,
          "icon",
        );
      }
      return;
    }

    if (hasIcon) {
      const iconT = clamp01(eased / 0.76);
      applyMistEtchDissolve(
        this.inLayer.icon,
        this.iconMistMask,
        iconT,
        false,
        "icon",
      );
    }
    const textT = hasIcon
      ? clamp01((eased - 0.12) / 0.82)
      : clamp01(eased / 0.9);
    applyMistEtchDissolve(
      this.inLayer.text,
      this.textMistMask,
      textT,
      false,
      "text",
    );
  }

  private stepVisibility = (now: number) => {
    this.visibilityRafId = 0;
    if (this.visibilityMode === "none") return;

    const raw = clamp01((now - this.visibilityStart) / this.visibilityDuration);
    const eased =
      this.visibilityMode === "hide" ? easeOutQuad(raw) : easeMistReveal(raw);
    this.applyVisibilityProgress(eased);
    if (raw < 1) {
      this.visibilityRafId = requestAnimationFrame(this.stepVisibility);
      return;
    }
    this.stopVisibilityDissolve();
  };

  private startVisibilityReveal(hasIcon: boolean) {
    this.stopAnimation();
    this.stopVisibilityDissolve();
    this.visibilityMode = "reveal";
    this.visibilityDuration = MIST_RETURN_DURATION_MS;
    this.root.dataset.visibility = "revealing";
    this.root.dataset.dissolving = "true";
    bindEtchMask(this.inLayer.text, this.textMistMask);
    if (hasIcon) {
      bindEtchMask(this.inLayer.icon, this.iconMistMask);
    }
    this.applyVisibilityProgress(0);
    this.visibilityStart = performance.now();
    this.visibilityRafId = requestAnimationFrame(this.stepVisibility);
  }

  /**
   * Dissolves the title and provider badge out to `hidden` or back into
   * `visible` using the shared mist-etch + depth-lift dissolve.
   */
  setArchiveVisible(visible: boolean, animated = false) {
    if (visible === this.archiveVisible) return;
    this.archiveVisible = visible;
    this.stopAnimation();
    this.stopVisibilityDissolve();

    const hasIcon = !this.inLayer.icon.hidden && Boolean(this.activeProvider);
    const hasContent = Boolean(this.activeTitle) || hasIcon;

    if (!visible) {
      if (!animated || document.hidden || !hasContent) {
        this.root.dataset.visibility = "hidden";
        this.root.dataset.dissolving = "false";
        return;
      }
      this.visibilityMode = "hide";
      this.visibilityDuration = MIST_HIDE_DURATION_MS;
      this.root.dataset.visibility = "hiding";
      this.root.dataset.dissolving = "true";
      bindEtchMask(this.inLayer.text, this.textMistMask);
      if (hasIcon) {
        bindEtchMask(this.inLayer.icon, this.iconMistMask);
      }
      this.applyVisibilityProgress(0);
      this.visibilityStart = performance.now();
      this.visibilityRafId = requestAnimationFrame(this.stepVisibility);
      return;
    }

    if (!animated || document.hidden || !hasContent) {
      this.root.dataset.visibility = "visible";
      this.root.dataset.dissolving = "false";
      return;
    }
    this.startVisibilityReveal(hasIcon);
  }

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

    if (!this.archiveVisible && this.visibilityMode === "hide") {
      return false;
    }

    const prevTitle = this.activeTitle;
    const prevProvider = this.activeProvider;
    const prevIconVisible = !this.inLayer.icon.hidden && Boolean(prevProvider);

    this.activeTitle = next.title;
    this.activeProvider = next.provider;

    if (!this.archiveVisible) {
      this.inLayer.text.textContent = next.title;
      this.applyActiveProvider(next.provider);
      return true;
    }

    if (this.visibilityMode === "reveal") {
      if (
        !next.animated ||
        document.hidden ||
        (!next.title && !next.provider)
      ) {
        this.stopVisibilityDissolve();
      } else {
        const revealRaw = clamp01(
          (performance.now() - this.visibilityStart) / this.visibilityDuration,
        );
        if (revealRaw < 0.35) {
          this.inLayer.text.textContent = next.title;
          this.applyActiveProvider(next.provider);
          if (!this.inLayer.icon.hidden && Boolean(next.provider)) {
            bindEtchMask(this.inLayer.icon, this.iconMistMask);
          } else {
            clearMistEtchStyles(this.inLayer.icon);
          }
          this.applyVisibilityProgress(easeMistReveal(revealRaw));
          return true;
        }
        this.stopVisibilityDissolve();
      }
    }

    if (!next.animated || document.hidden) {
      this.stopAnimation();
      this.inLayer.text.textContent = next.title;
      this.applyActiveProvider(next.provider);
      return true;
    }

    if (!prevTitle && !prevIconVisible && !this.outActive && !this.inActive) {
      this.inLayer.text.textContent = next.title;
      this.applyActiveProvider(next.provider);
      if (Boolean(next.title) || Boolean(next.provider)) {
        this.startVisibilityReveal(
          !this.inLayer.icon.hidden && Boolean(next.provider),
        );
      } else {
        this.stopAnimation();
      }
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
      this.applyActiveProvider(next.provider);
      if (outProgress <= 0.14) {
        this.stopAnimation();
        return true;
      }
      const resumeRaw = clamp01(1 - outProgress);
      const hasInIcon = !this.inLayer.icon.hidden && Boolean(next.provider);
      this.inDelay = 0;
      this.inDuration = Math.round(MIST_SWITCH_DURATION_MS * 0.72);
      this.inStart = now - resumeRaw * this.inDuration;
      this.inActive = true;
      this.root.dataset.dissolving = "true";
      bindEtchMask(this.inLayer.text, this.textMistMask);
      if (hasInIcon) {
        bindEtchMask(this.inLayer.icon, this.iconMistMask);
      } else {
        clearMistEtchStyles(this.inLayer.icon);
      }
      this.applySwitchIn(easeMistReveal(resumeRaw));
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(this.step);
      }
      return true;
    }

    const suppressUnmaterializedPrev =
      !this.outActive && this.inActive && currentInProgress < 0.25;
    const hasPrev =
      !suppressUnmaterializedPrev && (Boolean(prevTitle) || prevIconVisible);
    const hasNext = Boolean(next.title) || Boolean(next.provider);

    // If rapidly sweeping past an intermediate card whose incoming layer has
    // barely materialized (< 42%), let the existing outgoing layer keep fading
    // out instead of snapping the half-drawn card to 100% and flashing.
    const keepExistingOutgoing =
      this.outActive &&
      currentInProgress < 0.42 &&
      (Boolean(this.outgoingTitle) || Boolean(this.outgoingProvider));

    if (!keepExistingOutgoing) {
      if (hasPrev) {
        this.outgoingTitle = prevTitle;
        this.outgoingProvider = prevProvider;
        this.outLayer.text.textContent = prevTitle;
        this.applyOutgoingProvider(prevProvider, prevIconVisible);
        this.outLayer.root.hidden = false;
        this.outDuration = Math.round(MIST_SWITCH_DURATION_MS * 0.62);
        this.outStart = now;
        this.outActive = true;
        bindEtchMask(this.outLayer.text, this.outTextMistMask);
        if (prevIconVisible) {
          bindEtchMask(this.outLayer.icon, this.outIconMistMask);
        } else {
          clearMistEtchStyles(this.outLayer.icon);
        }
        this.applySwitchOut(0);
      } else {
        this.clearOutgoing();
      }
    }

    this.inLayer.text.textContent = next.title;
    this.applyActiveProvider(next.provider);

    if (hasNext) {
      const stagger =
        !keepExistingOutgoing && hasPrev
          ? Math.round(MIST_SWITCH_DURATION_MS * 0.14)
          : 0;
      this.inDelay = stagger;
      this.inDuration = MIST_SWITCH_DURATION_MS - stagger;
      this.inStart = now;
      this.inActive = true;
      bindEtchMask(this.inLayer.text, this.textMistMask);
      if (!this.inLayer.icon.hidden && Boolean(next.provider)) {
        bindEtchMask(this.inLayer.icon, this.iconMistMask);
      } else {
        clearMistEtchStyles(this.inLayer.icon);
      }
      this.applySwitchIn(0);
    } else {
      this.inActive = false;
      clearMistEtchStyles(this.inLayer.icon);
      clearMistEtchStyles(this.inLayer.text);
    }

    if (this.outActive || this.inActive) {
      this.root.dataset.dissolving = "true";
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(this.step);
      }
    } else {
      this.stopAnimation();
    }
    return true;
  }

  /** Immediately settles any running dissolve transition and strips masks. */
  finish() {
    this.stopAnimation();
    this.stopVisibilityDissolve();
  }

  resize() {}

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
          this.syncLoadedIconMist();
        }
      };
      img.src = this.resolveProviderUrl(provider);
      void img.decode?.().catch(() => {});
    }
  }
}
