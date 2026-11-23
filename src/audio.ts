import { assetUrl } from "./asset-url";
export type AudioScene = "archive" | "detail" | "viewer";
export type AudioPreferences = {
  music: boolean;
  musicVolume: number;
};
const STEMS = ["atmosphere", "motif", "pulse"] as const;
const LOOP_SECONDS = 160 / 3;
const clamp = (x: number) =>
  Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
export const rampLevel = (
  param: AudioParam,
  value: number,
  now: number,
  seconds = 0.05,
) => {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(held, now);
  }
  param.linearRampToValueAtTime(value, now + seconds);
};

export class TerminalAudio {
  private prefs: AudioPreferences = {
    music: false,
    musicVolume: 0.5,
  };
  private context?: AudioContext;
  private musicBus?: GainNode;
  private stemGains: GainNode[] = [];
  private buffers?: AudioBuffer[];
  private loading?: Promise<void>;
  private fetching?: Promise<ArrayBuffer[]>;
  private musicData?: ArrayBuffer[];
  private tracks: AudioBufferSourceNode[] = [];
  private scene: AudioScene = "archive";
  private offset = 0;
  private startedAt = 0;
  private unlocked = false;
  private disposed = false;
  private error = "";
  private requestId = 0;
  private suspension: Promise<void> = Promise.resolve();
  private entryPending = false;
  constructor() {
    document.addEventListener("pointerdown", this.gesture, { capture: true });
    document.addEventListener("keydown", this.gesture, { capture: true });
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pagehide", this.hide);
    window.addEventListener("pageshow", this.visibility);
  }
  private gesture = () => {
    if (this.entryPending) return;
    this.unlocked = true;
    void this.activate();
  };
  holdForEntry() {
    this.entryPending = true;
  }
  releaseEntry() {
    this.entryPending = false;
  }
  cancelEntry() {
    this.hide();
  }
  async unlock() {
    this.unlocked = true;
    await this.activate();
    return this.context?.state === "running" && (!this.prefs.music || Boolean(this.buffers));
  }
  /**
   * Construct the audio graph during an asynchronous page load without
   * crossing the autoplay boundary. The first trusted gesture still owns
   * resume() and all audible playback.
   */
  prepareContext() {
    if (
      this.disposed ||
      this.context ||
      !this.prefs.music
    )
      return this.context;
    try {
      const context = this.createContext();
      this.error = "";
      return context;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Audio unavailable";
      const failed = this.context as AudioContext | undefined;
      this.context = undefined;
      this.musicBus = undefined;
      this.stemGains = [];
      void failed?.close().catch(() => {});
      return undefined;
    }
  }
  // Fetch compressed tracks while the entry screen is visible; create/resume
  // the audio device only from a real click or keyboard activation.
  prepareMusic() {
    if (this.musicData) return Promise.resolve(this.musicData);
    this.fetching ??= Promise.all(STEMS.map(async name => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(assetUrl(`audio/${name}.ogg`), { signal: controller.signal });
        if (!response.ok) throw new Error(`Music ${name}: ${response.status}`);
        return await response.arrayBuffer();
      } finally { clearTimeout(timeout); }
    })).then(data => this.musicData = data).finally(() => { this.fetching = undefined; });
    return this.fetching;
  }
  private hide = () => {
    this.requestId++;
    this.stopMusic();
    this.suspension =
      this.context?.suspend().catch(() => {}) ?? Promise.resolve();
  };
  private visibility = () => {
    if (document.hidden) this.hide();
    else if (this.unlocked && !this.entryPending) void this.activate();
  };
  configure(prefs: AudioPreferences) {
    this.prefs = {
      music: !!prefs.music,
      musicVolume: clamp(prefs.musicVolume),
    };
    if (this.context) {
      rampLevel(
        this.musicBus!.gain,
        this.prefs.music ? this.prefs.musicVolume : 0,
        this.context.currentTime,
        0.2,
      );
    }
    if (!this.prefs.music) this.stopMusic();
    if (!this.prefs.music) this.hide();
    else if (this.unlocked && !this.entryPending) void this.activate();
  }
  private createContext() {
    const c = (this.context = new AudioContext()),
      master = c.createGain(),
      limiter = c.createDynamicsCompressor();
    master.gain.value = 0.8;
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.prefs.music ? this.prefs.musicVolume : 0;
    this.musicBus.connect(master);
    master.connect(limiter);
    limiter.connect(c.destination);
    this.stemGains = STEMS.map(() => {
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(this.musicBus!);
      return gain;
    });
    this.mixScene();
    return c;
  }
  private async activate() {
    if (
      this.disposed ||
      document.hidden ||
      !this.unlocked ||
      !this.prefs.music
    )
      return;
    const id = ++this.requestId;
    try {
      const c = this.context ?? this.createContext();
      // Call resume before awaiting network or an earlier suspension so the
      // browser observes this call in the user's activation handler.
      const resume = c.state === "running" ? Promise.resolve() : c.resume();
      await Promise.all([this.suspension, resume]);
      if (id !== this.requestId || this.disposed || document.hidden) return;
      if (c.state !== "running") return;
      if (id !== this.requestId || document.hidden || this.disposed) return;
      if (this.prefs.music) {
        await this.loadMusic(c);
        if (id === this.requestId) this.startMusic();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Audio unavailable";
    }
  }
  private loadMusic(c: AudioContext) {
    if (this.buffers) return Promise.resolve();
    this.loading ??= this.prepareMusic()
      .then(data => Promise.all(data.map(bytes => c.decodeAudioData(bytes.slice(0)))))
      .then((buffers) => {
        this.buffers = buffers;
        this.error = "";
      })
      .finally(() => {
        this.loading = undefined;
      });
    return this.loading;
  }
  private startMusic() {
    const c = this.context;
    if (
      !c ||
      c.state !== "running" ||
      !this.buffers ||
      this.tracks.length ||
      !this.prefs.music ||
      this.disposed ||
      document.hidden
    )
      return;
    this.startedAt = c.currentTime + 0.04;
    this.tracks = this.buffers.map((buffer, i) => {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = Math.min(LOOP_SECONDS, buffer.duration);
      src.connect(this.stemGains[i]);
      src.start(this.startedAt, this.offset % src.loopEnd);
      return src;
    });
    this.musicBus!.gain.cancelScheduledValues(c.currentTime);
    this.musicBus!.gain.setValueAtTime(0, c.currentTime);
    this.musicBus!.gain.linearRampToValueAtTime(
      this.prefs.musicVolume,
      c.currentTime + 1.2,
    );
  }
  private stopMusic() {
    const c = this.context;
    if (!c || !this.tracks.length) return;
    this.offset =
      (this.offset + Math.max(0, c.currentTime - this.startedAt)) %
      LOOP_SECONDS;
    this.tracks.forEach((track, i) => {
      const fade = c.createGain();
      track.disconnect();
      track.connect(fade);
      fade.connect(this.stemGains[i]);
      fade.gain.setValueAtTime(1, c.currentTime);
      fade.gain.linearRampToValueAtTime(0, c.currentTime + 0.06);
      track.stop(c.currentTime + 0.07);
      track.onended = () => {
        track.disconnect();
        fade.disconnect();
      };
    });
    this.tracks = [];
  }
  setScene(scene: AudioScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.mixScene();
  }
  private mixScene() {
    if (!this.context) return;
    const gains = {
      archive: [0.9, 0.72, 0.65],
      detail: [0.72, 0.36, 0.12],
      viewer: [0.8, 0.24, 0.28],
    }[this.scene];
    this.stemGains.forEach((g, i) =>
      rampLevel(g.gain, gains[i], this.context!.currentTime, 1.1),
    );
  }
  stats() {
    return {
      state: this.context?.state ?? "locked",
      scene: this.scene,
      tracks: this.tracks.length,
      loaded: !!this.buffers,
      error: this.error,
      preferences: { ...this.prefs },
    };
  }
  dispose() {
    this.disposed = true;
    this.requestId++;
    this.stopMusic();
    document.removeEventListener("pointerdown", this.gesture, true);
    document.removeEventListener("keydown", this.gesture, true);
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pagehide", this.hide);
    window.removeEventListener("pageshow", this.visibility);
    void this.context?.close();
  }
}
