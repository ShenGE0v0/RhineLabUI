export interface CleanCoverUpdate {
  src: string | null;
  visible: boolean;
  animated: boolean;
}

const SWAP_CLEANUP_MS = 240;

/**
 * Renders the clean-mode top-right archive cover preview directly below
 * `#clean-archive-title` using double-buffered `<img>` layers so card
 * switches cross-fade without flashing the paper backdrop and stale
 * async image loads are safely discarded.
 */
export class CleanCoverPreview {
  private readonly root: HTMLElement;
  private readonly layers: [HTMLImageElement, HTMLImageElement];
  private activeSlot: 0 | 1 = 0;
  private loadToken = 0;
  private desiredVisible = false;
  private desiredSrc: string | null = null;
  private displayedSrc: string | null = null;
  private hasImage = false;
  private swapTimer = 0;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.layers = [this.createLayer(), this.createLayer()];
    this.root.dataset.visible = "false";
    this.root.dataset.instant = "false";
    this.root.replaceChildren(this.layers[0], this.layers[1]);
  }

  private createLayer(): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "clean-cover-img";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    return img;
  }

  private clearSwapTimer() {
    if (this.swapTimer) {
      window.clearTimeout(this.swapTimer);
      this.swapTimer = 0;
    }
  }

  private clearHandlers(img: HTMLImageElement) {
    img.onload = null;
    img.onerror = null;
  }

  private settleLayers(preserveInstant: boolean) {
    this.clearSwapTimer();
    if (!preserveInstant) {
      this.root.dataset.instant = "false";
    }
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      layer.className =
        i === this.activeSlot && this.hasImage
          ? "clean-cover-img is-active"
          : "clean-cover-img";
    }
  }

  private presentLoaded(
    nextSlot: 0 | 1,
    src: string,
    token: number,
    animated: boolean,
  ) {
    const nextImg = this.layers[nextSlot];
    const prevImg = this.layers[this.activeSlot];
    void nextImg
      .decode()
      .catch(() => {})
      .then(() => {
        if (
          this.disposed ||
          token !== this.loadToken ||
          !this.desiredVisible ||
          this.desiredSrc !== src
        ) {
          return;
        }
        this.clearSwapTimer();
        if (!animated || !this.hasImage || nextSlot === this.activeSlot) {
          prevImg.className = "clean-cover-img";
          nextImg.className = "clean-cover-img is-active";
          this.activeSlot = nextSlot;
          this.displayedSrc = src;
          this.hasImage = true;
          this.root.dataset.instant = animated ? "false" : "true";
          this.root.dataset.visible = "true";
          return;
        }

        prevImg.className = "clean-cover-img is-prev";
        nextImg.className = "clean-cover-img is-entering";
        // Flush styles once so opacity transitions cleanly from 0 -> 1 over is-prev.
        void nextImg.offsetWidth;
        this.root.dataset.instant = "false";
        nextImg.className = "clean-cover-img is-active";
        this.activeSlot = nextSlot;
        this.displayedSrc = src;
        this.hasImage = true;
        this.root.dataset.visible = "true";
        this.swapTimer = window.setTimeout(() => {
          this.swapTimer = 0;
          if (this.disposed) return;
          prevImg.className = "clean-cover-img";
        }, SWAP_CLEANUP_MS);
      });
  }

  public update({ src, visible, animated }: CleanCoverUpdate) {
    if (this.disposed) return;
    if (!visible || !src) {
      this.loadToken++;
      this.desiredVisible = false;
      this.desiredSrc = null;
      this.root.dataset.instant = animated ? "false" : "true";
      this.root.dataset.visible = "false";
      if (!animated) this.settleLayers(true);
      return;
    }

    this.desiredVisible = true;
    this.desiredSrc = src;
    if (this.hasImage && this.displayedSrc === src) {
      this.loadToken++;
      this.root.dataset.instant = animated ? "false" : "true";
      this.root.dataset.visible = "true";
      return;
    }

    const token = ++this.loadToken;
    const nextSlot: 0 | 1 = this.activeSlot === 0 ? 1 : 0;
    const img = this.layers[nextSlot];
    if (this.swapTimer) {
      // Lock the in-flight foreground layer at full opacity before reusing prevSlot
      // so rapid 3-card sweeps never expose the empty paper backdrop or snap later.
      this.clearSwapTimer();
      const activeImg = this.layers[this.activeSlot];
      activeImg.className = "clean-cover-img is-settled";
      void activeImg.offsetWidth;
      activeImg.className = "clean-cover-img is-active";
    }
    this.clearHandlers(img);
    img.className = "clean-cover-img";
    img.referrerPolicy = /^https?:/i.test(src) ? "no-referrer" : "";

    let settled = false;
    const onReady = () => {
      if (settled) return;
      settled = true;
      this.clearHandlers(img);
      if (this.disposed || token !== this.loadToken) return;
      this.presentLoaded(nextSlot, src, token, animated);
    };

    img.onload = onReady;
    img.onerror = () => {
      if (settled) return;
      settled = true;
      this.clearHandlers(img);
      img.removeAttribute("src");
      if (this.disposed || token !== this.loadToken) return;
      this.displayedSrc = null;
      this.hasImage = false;
      this.root.dataset.instant = animated ? "false" : "true";
      this.root.dataset.visible = "false";
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      queueMicrotask(onReady);
    }
  }

  public finish() {
    this.settleLayers(false);
  }

  public dispose() {
    this.disposed = true;
    this.loadToken++;
    this.clearSwapTimer();
    for (const layer of this.layers) {
      this.clearHandlers(layer);
    }
  }
}
