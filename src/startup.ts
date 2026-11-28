type EntryOptions = {
  root: HTMLElement;
  start: () => void;
};

/** Owns the entry gesture and keyboard focus. */
export class StartupGate {
  private state: "loading" | "waiting" | "started" = "loading";
  private button: HTMLButtonElement;
  private status: HTMLElement;
  constructor(private options: EntryOptions) {
    const { root } = options;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "进入 DeepDemos 档案终端");
    root.insertAdjacentHTML(
      "beforeend",
      '<div class="entry-controls"><button class="entry-start" disabled>正在准备终端…</button><p class="entry-status" role="status">资源就绪后即可进入</p></div>',
    );
    this.button = root.querySelector<HTMLButtonElement>(".entry-start")!;
    this.status = root.querySelector<HTMLElement>(".entry-status")!;
    root.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.state === "waiting") this.finish();
    });
    root.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Tab" || !this.button.isConnected) return;
      if (this.button.disabled) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this.button.focus();
    });
  }
  get phase() {
    return this.state;
  }
  ready() {
    this.state = "waiting";
    this.options.root.dataset.entry = "waiting";
    this.button.disabled = false;
    this.button.textContent = "点击进入 →";
    this.options.root.querySelector(":scope > span")!.textContent =
      "DEEPDEMOS / READY";
    this.status.textContent = "轻触屏幕或按 Enter 开始";
    this.button.focus({ preventScroll: true });
  }
  private finish() {
    if (this.state === "started") return;
    this.state = "started";
    this.options.start();
  }
}
