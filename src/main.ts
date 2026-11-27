import { createRollingClock } from "./rolling-clock";
import { escapeHtml } from "./html";
import {
  normalizeQuality,
  qualityPresets,
  superPerformanceQuality,
  type QualityPreset,
  type RenderQuality,
} from "./render-quality";
import { qualityMarkup, syncQualityUI } from "./quality-settings";
import "@kitlangton/rolling-number/styles.css";
import "./style.css";
import "./quality-settings.css";
import "./decryption.css";
import "./responsive.css";
import { viewportLayout } from "./viewport-layout";
import { assetUrl } from "./asset-url";
import { initPwa, pwaSettingsMarkup } from "./pwa";
import {
  createRollingNumber,
  createRollingText,
} from "@kitlangton/rolling-number";
import { ArchiveScene } from "./scene";
import { ModelViewer } from "./model-viewer";
import { ContentTransition, SurfaceTransition } from "./ui-transitions";
import { wrap, type ArchiveNavigation } from "./archive-loop";
import {
  records,
  categories,
  archiveColumns,
  columnFiles,
  fileLocation,
  getArchiveBookmarkScope,
  getArchiveDataVersion,
  getArchiveDatasetSnapshot,
  getArchiveDatasetVersion,
  hasStableArchiveId,
  resolveRecordCover,
  setArchiveDataset,
  setCoverResolver,
  subscribeArchiveData,
  updateArchiveRecord,
  type ArchiveDataChangeEvent,
  type ArchiveRecord,
} from "./data";
import {
  createFetchAdapter,
  resolveBootstrapDataset,
  type FetchAdapterOptions,
} from "./data-source";
import {
  modelProvider,
  modelProviderAssetPath,
  type ModelProvider,
} from "./model-provider";
import { BlockDissolveTitle } from "./block-dissolve-title";
import { CleanCoverPreview } from "./clean-cover-preview";
import { TerminalAudio } from "./audio";
import { audioSettingsMarkup } from "./audio-settings";
import {
  createMotionPreferences,
  fullMotion,
  motionEnabled,
  motionPresetFor,
  motionSettingsMarkup,
  motionSummary,
  reducedMotion,
  type MotionKey,
  type MotionPreset,
  type StoredMotion,
} from "./motion-preferences";
import { StartupGate } from "./startup";
import "./startup.css";
import { enableGamepad, isGamepadEvent, onInputDevice } from "./gamepad";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
import { logo, brandHeading } from "./brand";

$("#stage").innerHTML = `
  <div id="three-scene" class="three-scene"></div>
  <div class="scene-atmosphere archive-atmosphere"></div>
  <header class="brand">${brandHeading}</header>
  <nav class="system-nav" aria-label="系统导航">
    <button data-action="search"><span class="nav-glyph">⌕</span> ARCHIVE INDEX <span class="key">/</span></button>
    <button data-action="saved" aria-label="查看收藏档案" title="收藏档案">＋ SAVED <span id="saved-count">00</span></button>
    <button class="settings-button" data-action="settings" aria-label="系统设置" title="系统设置"><span class="settings-glyph" aria-hidden="true">◷</span><span class="settings-label">设置</span></button>
  </nav>
  <section id="archive-ui" class="archive-ui" aria-label="档案选择">
    <div class="archive-callout"><div class="eyebrow">DEMO ARCHIVE <span>／</span> <span id="archive-category">作品档案</span></div><button class="file-title" data-action="open">FILE NUMBER: <span id="selected-id">X-<span id="selected-code">001</span></span><span class="file-open">↗</span></button><div class="callout-rule"><i></i></div><div class="file-summary"><span id="selected-title">作品</span><span id="selected-clearance">BUSINESS AREA</span></div><button class="read-file" data-action="open">ACCESS FILE <span>→</span></button></div>
    <div id="hover-label" class="hover-label" hidden>X-<span id="hover-code">001</span> / <span id="hover-title"></span></div>
    <div class="archive-counter"><span class="tiny-label">ARCHIVE / SELECT</span><div><span id="selected-number">01</span><i>/</i><span class="count-total">12</span></div></div>
    <div class="archive-navigation"><button data-action="prev" aria-label="上一个档案">↑</button><div id="file-ticks" class="file-ticks"></div><button data-action="next" aria-label="下一个档案">↓</button></div>
    <div class="column-navigation"><button data-action="column-prev" aria-label="上一列">←</button><div><span id="column-number">COLUMN <span id="column-index">03</span> / 05</span><strong id="column-name">作品档案</strong></div><button data-action="column-next" aria-label="下一列">→</button></div>
    <div class="archive-hint"><kbd>←</kbd> <kbd>→</kbd> 切换列 <span>／</span> <kbd>↑</kbd> <kbd>↓</kbd> 前后档案 <span>／</span> <kbd>ENTER</kbd> 读取</div>
  </section>
  <div id="clean-archive-title" class="clean-archive-title" aria-hidden="true"></div>
  <div id="clean-archive-cover" class="clean-archive-cover" aria-hidden="true" data-visible="false"></div>
  <div id="clean-title-live" class="clean-title-live" aria-live="polite" aria-atomic="true"></div>
  <section id="detail-ui" class="detail-ui" aria-label="档案内容" hidden>
    <button class="back-button" data-action="back">← <span>ARCHIVE OVERVIEW</span><small>ESC</small></button>
    <div class="object-caption"><span id="object-id">NO.001</span><div>DEMO ARCHIVE</div><small>DRAG TO INSPECT <span>↔</span></small><button class="viewer-open" data-action="model-viewer">360° 查看作品模型 <span>↗</span></button></div>
    <article id="detail-content" class="detail-content"></article>
  </section>
  <div class="powered">POWERED BY <b>DEEPDEMOS</b><i></i></div>
  <footer class="system-footer"><span><i class="status-light"></i> SESSION AUTHORIZED</span><span>PUBLIC USER <i>／</i> <span id="clock">00:00:00</span></span></footer>
  <div id="pwa-update-notice" class="pwa-update-notice" role="status" hidden><span>新版本已就绪</span><button data-pwa-action="update">更新并重启 ↻</button></div>
  <div id="modal-root"></div><div id="toast" class="toast" role="status"></div>
  <div id="loading" class="loading"><div class="loading-mark">${logo}</div><span>CONNECTING TO DEMO ARCHIVE</span><i></i></div>
`;
$("#stage").classList.add("web-archive-clean");
$("#three-scene").tabIndex = -1;

type Mode = "archive" | "detail";
let mode: Mode = "archive",
  selected = 0,
  ready = false;
let selectedId = records[selected].id;
let selectedIdIsStable = hasStableArchiveId(selectedId);
let modal: "search" | "saved" | "settings" | null = null,
  searchQuery = "",
  filter = categories[0] ?? "全部作品";
let activeTab = "overview";
const reviewParams = new URLSearchParams(location.search);
let toastTimer: ReturnType<typeof setTimeout>;
let previousFocus: HTMLElement | null = null;
const detailTransition = new SurfaceTransition(
  $("#detail-ui"),
  undefined,
  180,
  180,
);
const tabTransition = new ContentTransition();
let modalTransition: SurfaceTransition | undefined;
let modalClosing = false;
let modalSiblings: { node: HTMLElement; inert: boolean }[] = [];
let pendingDetailFocus = false;
let bookmarkFeedback: Animation | undefined;
function readLocal<T>(key: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}
/** Storage can be unavailable (private mode, quota, blocked origin). Tell the
 * operator once instead of letting settings silently fail to persist. */
let storageWarned = false;
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (!storageWarned) {
      storageWarned = true;
      notify("当前无法保存设置，重新加载后可能丢失。");
    }
    return false;
  }
}
const saved = new Set<string>();
const bookmarkStores = new Map<string, Set<string>>();
let bookmarkScope = getArchiveBookmarkScope();
let bookmarkStore: { key: string; ids: Set<string> } | null = null;
function loadDatasetBookmarks() {
  bookmarkScope = getArchiveBookmarkScope();
  const key = bookmarkScope === "builtin" ? "rhine-saved" :
    bookmarkScope === null ? null : `rhine-saved:${bookmarkScope}`;
  saved.clear();
  bookmarkStore = null;
  if (key === null) return;
  let ids = bookmarkStores.get(key);
  if (!ids) {
    const stored = readLocal<unknown>(key, []);
    ids = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
    bookmarkStores.set(key, ids);
  }
  bookmarkStore = { key, ids };
  for (const { id } of records) {
    if (hasStableArchiveId(id) && ids.has(id)) saved.add(id);
  }
}
loadDatasetBookmarks();
const storedPrefs = readLocal<
  Partial<{
    music: boolean;
    musicVolume: number;
    reduced: boolean;
    quality: boolean;
    rendering: RenderQuality;
    superPerformance: boolean;
    motion: StoredMotion;
    motionPreset: MotionPreset;
  }>
>("rhine-settings", {});
const initialMotion = createMotionPreferences(
  storedPrefs.motion,
  storedPrefs.reduced ??
    (storedPrefs.motion === undefined
      ? matchMedia("(prefers-reduced-motion: reduce)").matches
      : undefined),
);
const initialMotionPreset = motionPresetFor(initialMotion);
const prefs = {
  music: storedPrefs.music ?? true,
  musicVolume: storedPrefs.musicVolume ?? 0.5,
  motion: initialMotion,
  motionPreset: initialMotionPreset,
  quality: storedPrefs.quality ?? true,
  superPerformance: storedPrefs.superPerformance ?? false,
  rendering: normalizeQuality(
    storedPrefs.rendering,
    storedPrefs.quality !== false,
  ),
};
const motionActive = (key: MotionKey) => motionEnabled(prefs.motion, key);
const hudMotionActive = (key: MotionKey, targetMode: Mode = mode) =>
  !$("#stage").classList.contains("web-archive-clean") &&
  targetMode === "archive" &&
  motionActive(key);
const motionIsReduced = () =>
  Object.values(prefs.motion).every((value) => !value);
const rollingMotion = {
  duration: 460,
  motionBlur: true,
  animated: motionActive("rollingNumbers"),
};
const updateFooterClock = createRollingClock($("#clock"));
const numberOptions = {
  ...rollingMotion,
  locales: "en-US",
  format: { minimumIntegerDigits: 2, useGrouping: false },
};
const fileCounter = createRollingNumber($("#selected-number"), {
  ...numberOptions,
  value: 1,
});
const columnCounter = createRollingNumber($("#column-index"), {
  ...numberOptions,
  value: 3,
});
const codeOptions = {
  ...numberOptions,
  format: { minimumIntegerDigits: 3, useGrouping: false },
  value: 1,
};
const textOptions = {
  ...rollingMotion,
  animated: motionActive("rollingText"),
  transition: "direct" as const,
  stagger: "none" as const,
};
const selectionTitle = createRollingText($("#selected-title"), {
  ...textOptions,
  text: $("#selected-title").textContent ?? "",
});
const columnTitle = createRollingText($("#column-name"), {
  ...textOptions,
  text: $("#column-name").textContent ?? "",
});
const hoverTitle = createRollingText($("#hover-title"), {
  ...textOptions,
  text: "",
});
const categoryTitle = createRollingText($("#archive-category"), {
  ...textOptions,
  text: $("#archive-category").textContent ?? "",
});
const clearanceTitle = createRollingText($("#selected-clearance"), {
  ...textOptions,
  text: $("#selected-clearance").textContent ?? "",
});
const rollingTitles = [
  selectionTitle,
  columnTitle,
  hoverTitle,
  categoryTitle,
  clearanceTitle,
];
const selectedCode = createRollingNumber($("#selected-code"), codeOptions);
const hoverCode = createRollingNumber($("#hover-code"), codeOptions);
let hoveredIndex: number | null = null;
const cleanTitleLive = $("#clean-title-live");
const cleanTitle = new BlockDissolveTitle({
  root: $("#clean-archive-title"),
  resolveProviderUrl: (provider) => assetUrl(modelProviderAssetPath(provider)),
  initialTitle: "",
  initialProvider: undefined,
});
cleanTitleLive.textContent = records[selected]?.title ?? "";
function syncCleanTitle(
  animated = motionActive("rollingText") && mode === "archive",
  announce = false,
) {
  const index =
    mode === "archive" && hoveredIndex !== null ? hoveredIndex : selected;
  const record = records[index];
  const title = record?.title ?? "";
  if (!started || (mode === "archive" && Boolean(scene?.isIntroActive))) {
    cleanTitle.update({ title: "", provider: undefined, animated: false });
    if (announce && cleanTitleLive.textContent !== title) {
      cleanTitleLive.textContent = title;
    }
    return;
  }
  const next = {
    title,
    provider: modelProvider(record?.en ?? ""),
    animated,
  };
  cleanTitle.update(next);
  if (announce && cleanTitleLive.textContent !== next.title) {
    cleanTitleLive.textContent = next.title;
  }
}
const cleanCover = new CleanCoverPreview($("#clean-archive-cover"));
const cardPhotoOverrides = new Map<number, string | null>();
function sanitizeManualCover(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return /^(https?:|data:image\/|blob:)/i.test(trimmed) ? trimmed : null;
  }
  return trimmed;
}
function resolveCleanCoverUrl(index: number): string | null {
  const raw = cardPhotoOverrides.has(index)
    ? (cardPhotoOverrides.get(index) ?? null)
    : resolveRecordCover(records[index], index);
  if (!raw) return null;
  return /^(https?:|data:image\/|blob:)/i.test(raw) || raw.startsWith("/")
    ? raw
    : assetUrl(raw);
}
function syncCleanCover(
  animated = motionActive("surfaceTransitions") && mode === "archive",
) {
  const visible =
    started && mode === "archive" && !Boolean(scene?.isIntroActive);
  if (!visible) {
    cleanCover.update({ src: null, visible: false, animated });
    return;
  }
  const index = hoveredIndex !== null ? hoveredIndex : selected;
  cleanCover.update({
    src: resolveCleanCoverUrl(index),
    visible: true,
    animated,
  });
}
const audio = new TerminalAudio();
function configureAudio() {
  audio.configure(prefs);
}
configureAudio();
const reviewEntry = reviewParams.has("scene");
if (reviewEntry) audio.prepareContext();
let started = false;
const loading = $("#loading");
// The entry screen uses the actual viewport, including portrait phones.
$("#viewport").append(loading);
$("#stage").inert = true;
const entry =
  !reviewEntry && prefs.music
    ? new StartupGate({
        root: loading,
        unlock: () => audio.unlock(),
        cancel: () => audio.cancelEntry(),
        start: (musicDisabled) => completeStartup(musicDisabled),
      })
    : undefined;
if (entry) {
  audio.holdForEntry();
  if (prefs.music)
    void audio.prepareMusic().catch(() => {
      /* Entry offers retry. */
    });
}
let scene: ArchiveScene | undefined;
let viewer: ModelViewer | undefined;
const accessLog: { id: string; time: string }[] = [];
let columnMemory: number[] = [];
function rebuildColumnMemory() {
  columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0] ?? 0);
  if (records.length > 0 && selected >= 0 && selected < records.length) {
    columnMemory[fileLocation(selected).lane] = selected;
  }
}
rebuildColumnMemory();
let datasetCustomized = false;
let exportBlobUrl: string | undefined;
function recordAccess() {
  accessLog.unshift({
    id: records[selected].id,
    time: new Date().toLocaleTimeString("en-GB"),
  });
}
function saveAudioPrefs() {
  writeLocal("rhine-settings", prefs);
  configureAudio();
}
function superPerformanceEnabled() {
  return prefs.superPerformance;
}
function effectiveRenderQuality() {
  return superPerformanceEnabled() ? superPerformanceQuality : prefs.rendering;
}
function savePrefs() {
  saveAudioPrefs();
  if (!motionActive("rollingText")) {
    rollingTitles.forEach((title) => title.finish());
    cleanTitle.finish();
  }
  if (!motionActive("rollingNumbers"))
    [fileCounter, columnCounter, selectedCode, hoverCode].forEach((counter) =>
      counter.finish(),
    );
  if (!motionActive("surfaceTransitions")) {
    detailTransition.finish();
    cleanCover.finish();
    modalTransition?.finish();
    tabTransition.finish();
    bookmarkFeedback?.cancel();
  }
  scene?.setMotion(prefs.motion);
  scene?.setSuperPerformance(superPerformanceEnabled());
  viewer?.setSuperPerformance(superPerformanceEnabled());
  scene?.setQuality(effectiveRenderQuality());
  viewer?.setQuality(effectiveRenderQuality());
  viewer?.setMotion(prefs.motion);
  syncQualityUI(prefs.rendering);
  updateQualitySummary();
  fileCounter.update({
    animated: hudMotionActive("rollingNumbers"),
  });
  rollingTitles.forEach((title) =>
    title.update({
      animated: hudMotionActive("rollingText"),
    }),
  );
  columnCounter.update({
    animated: hudMotionActive("rollingNumbers"),
  });
  selectedCode.update({
    animated: hudMotionActive("rollingNumbers"),
  });
  hoverCode.update({
    animated: hudMotionActive("rollingNumbers"),
  });
  $("#stage").classList.toggle("reduce-motion", motionIsReduced());
  $("#stage").classList.toggle(
    "reduce-surfaces",
    !motionActive("surfaceTransitions"),
  );
  updateFooterClock(new Date(), motionActive("rollingNumbers"));
}
let previousLayout = "";
function fit() {
  const stage = $("#stage");
  const viewport = $("#viewport");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const { width, height, scale, kind } = viewportLayout(
    viewport.clientWidth,
    viewport.clientHeight,
    coarse,
  );
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.layout = kind;
  stage.dataset.touch = String(coarse);
  stage.style.setProperty("--stage-scale", String(scale));
  // The software keyboard resizes dialogs without recomposing the 3D scene.
  const visible = window.visualViewport;
  const stageTop = (viewport.clientHeight - height * scale) / 2;
  stage.style.setProperty(
    "--modal-top",
    `${Math.max(0, (visible?.offsetTop ?? 0) - stageTop) / scale}px`,
  );
  stage.style.setProperty(
    "--modal-height",
    `${Math.min(height, (visible?.height ?? viewport.clientHeight) / scale)}px`,
  );
  $("#viewport").style.setProperty("--scale", String(scale));
  const layoutKey = JSON.stringify([
    width,
    height,
    scale,
    kind,
    devicePixelRatio,
  ]);
  if (layoutKey !== previousLayout) {
    previousLayout = layoutKey;
    scene?.resize();
    viewer?.resize();
  }
  cleanTitle.resize();
  cleanCover.resize();
  updateQualitySummary();
}
window.addEventListener("resize", fit);
// Any real input wakes the idle-settled array immediately, so the breathing
// never stops while someone is actually using the terminal.
for (const type of ["pointermove", "pointerdown", "keydown", "wheel"] as const)
  document.addEventListener(type, () => scene?.wake(), {
    passive: true,
    capture: true,
  });
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
matchMedia("(pointer: coarse)").addEventListener("change", fit);
fit();
const fileTicksRoot = $("#file-ticks");
let fileTicks: HTMLButtonElement[] = [];
function syncFileTicks(files: number[]) {
  if (fileTicks.length !== files.length) {
    fileTicksRoot.innerHTML = files
      .map((index) => `<button data-select="${index}"></button>`)
      .join("");
    fileTicks = [
      ...fileTicksRoot.querySelectorAll<HTMLButtonElement>("button"),
    ];
  }
  fileTicks.forEach((button, slot) => {
    const index = files[slot],
      record = records[index];
    if (!record) return;
    button.dataset.select = String(index);
    button.setAttribute(
      "aria-label",
      `选择档案 ${record.id} ${record.title}`,
    );
    button.title = `${record.id} · ${record.title}`;
    button.classList.toggle("selected", index === selected);
    button.setAttribute("aria-pressed", String(index === selected));
  });
}

function focusArchiveOverview() {
  if (mode !== "archive") return;
  $("#three-scene").focus({ preventScroll: true });
}

function setMode(next: Mode) {
  const previousMode = mode;
  rollingTitles.forEach((title) =>
    title.update({
      animated: hudMotionActive("rollingText", next),
    }),
  );
  if (next !== "archive") {
    rollingTitles.forEach((title) => title.finish());
    hoveredIndex = null;
    syncCleanTitle(false);
    cleanTitle.finish();
    hoverCode.finish();
    $("#hover-label").hidden = true;
  }
  if (next === "detail" && mode !== "detail") recordAccess();
  mode = next;
  audio.setScene(next);
  $("#stage").dataset.mode = next;
  if (previousMode !== next) fit();
  syncCleanCover(motionActive("surfaceTransitions"));
  $("#archive-ui").inert = next !== "archive" || Boolean(modal);
  $("#archive-ui").setAttribute("aria-hidden", String(next !== "archive"));
  $(".system-nav").inert = Boolean(modal);
  $(".system-footer").inert = Boolean(modal);
  if (previousMode === "detail" && next !== "detail") {
    pendingDetailFocus = false;
    tabTransition.cancel();
    if (!modal && next === "archive") focusArchiveOverview();
  }
  $("#detail-ui").inert = true;
  scene?.setMode(next);
  if (next === "detail" && previousMode !== "detail") {
    pendingDetailFocus = true;
  }
}
function select(index: number, navigation?: ArchiveNavigation) {
  selected = wrap(Math.trunc(index), records.length);
  columnMemory[fileLocation(selected).lane] = selected;
  if (mode === "detail") setMode("archive");
  activeTab = "overview";
  scene?.select(selected, navigation);
  updateSelection(navigation);
}
function stepFile(direction: number) {
  const files = columnFiles(fileLocation(selected).lane);
  if (files.length < 2) return;
  select(
    files[wrap(files.indexOf(selected) + direction, files.length)],
    { axis: "row", direction },
  );
}
function stepColumn(direction: number) {
  if (archiveColumns.length < 2) return;
  const lane = fileLocation(selected).lane;
  const next = wrap(lane + direction, archiveColumns.length);
  select(columnMemory[next], { axis: "lane", direction });
}
function updateSelection(
  navigation?: ArchiveNavigation,
  animate = true,
) {
  const r = records[selected];
  selectedId = r.id;
  selectedIdIsStable = hasStableArchiveId(selectedId);
  const { lane } = fileLocation(selected);
  const files = columnFiles(lane);
  const hudTextAnimated = hudMotionActive("rollingText");
  const hudNumberAnimated = hudMotionActive("rollingNumbers");
  selectionTitle.update({
    text: r.title,
    animated: hudTextAnimated,
  });
  clearanceTitle.update({
    text: r.clearance,
    animated: hudTextAnimated,
  });
  categoryTitle.update({
    text: r.category,
    animated: hudTextAnimated,
  });
  const direction =
    navigation && "axis" in navigation
      ? navigation.direction > 0
        ? "up"
        : "down"
      : "auto";
  const idDigitsMatch = r.id.match(/\d+$/);
  const idCodeValue = idDigitsMatch ? Number(idDigitsMatch[0]) : selected + 1;
  selectedCode.update({
    value: Number.isFinite(idCodeValue) ? idCodeValue : selected + 1,
    animated: hudNumberAnimated,
    direction,
  });
  hoveredIndex = null;
  syncCleanTitle(animate && motionActive("rollingText") && mode === "archive", true);
  syncCleanCover(animate && motionActive("surfaceTransitions") && mode === "archive");
  fileCounter.update({
    value: files.indexOf(selected) + 1,
    animated: hudNumberAnimated,
    direction:
      navigation && "axis" in navigation && navigation.axis === "row"
        ? direction
        : "auto",
  });
  $(".count-total").textContent = String(files.length).padStart(2, "0");
  columnCounter.update({
    value: lane + 1,
    animated: hudNumberAnimated,
    direction:
      navigation && "axis" in navigation && navigation.axis === "lane"
        ? direction
        : "auto",
  });
  columnTitle.update({
    text: archiveColumns[lane],
    animated: hudTextAnimated,
  });
  $<HTMLButtonElement>('[data-action="column-prev"]').disabled = false;
  $<HTMLButtonElement>('[data-action="column-next"]').disabled = false;
  syncFileTicks(files);
  $("#saved-count").textContent = String(saved.size).padStart(2, "0");
}
function openFile() {
  if (!ready) return;
  closeModal(() => {
    setMode("detail");
  });
}
function toggleSaved() {
  const id = records[selected].id;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  if (bookmarkStore && hasStableArchiveId(id)) {
    if (saved.has(id)) bookmarkStore.ids.add(id);
    else bookmarkStore.ids.delete(id);
    writeLocal(bookmarkStore.key, [...bookmarkStore.ids]);
  }
  $("#saved-count").textContent = String(saved.size).padStart(2, "0");
  const button = $<HTMLButtonElement>('[data-action="bookmark"]');
  const added = saved.has(id);
  button.firstChild!.textContent = added
    ? "− REMOVE FROM SAVED"
    : "＋ SAVE ARCHIVE";
  button.querySelector("span")!.textContent = added ? "已收藏" : "收藏档案";
  button.setAttribute("aria-pressed", String(added));
  bookmarkFeedback?.cancel();
  if (motionActive("surfaceTransitions"))
    bookmarkFeedback = button.animate(
      [{ backgroundColor: "#67634c" }, { backgroundColor: "#252820" }],
      { duration: 220, easing: "ease-out" },
    );
  notify(saved.has(id) ? "档案已加入收藏" : "已取消收藏");
}
function formatArchiveExport(r: ArchiveRecord) {
  return `\uFEFFDEEPDEMOS · AI DEMO ARCHIVE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n平台：${r.department}\n收录日期：${r.date}\n作者：${r.lead}\n类型：${r.clearance}\n\n${r.abstract}\n\n作品记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n来源：${r.source || "无"}\n`;
}
function renderDetail() {
  tabTransition.cancel();
  if (exportBlobUrl) {
    URL.revokeObjectURL(exportBlobUrl);
    exportBlobUrl = undefined;
  }
  const r = records[selected];
  const exportHref = datasetCustomized
    ? (exportBlobUrl = URL.createObjectURL(
        new Blob([formatArchiveExport(r)], {
          type: "text/plain;charset=utf-8",
        }),
      ))
    : assetUrl(`archives/DEEPDEMOS-${encodeURIComponent(r.id)}.txt`);
  const safeId = escapeHtml(r.id);
  $("#object-id").textContent = "NO." + String(selected + 1).padStart(3, "0");
  $("#detail-content").innerHTML = `
  <div class="detail-kicker"><span>FILE ${safeId}</span><span>${escapeHtml(r.clearance)}</span></div>
  <h2>${escapeHtml(r.title)}</h2><div class="detail-title-cn">${escapeHtml(r.en)}<span>${escapeHtml(r.category)}</span></div>
  <div class="detail-rule"></div>
  <dl class="metadata"><div><dt>PLATFORM / 平台</dt><dd>${escapeHtml(r.department)}</dd></div><div><dt>DATE / 收录日期</dt><dd>${escapeHtml(r.date)}</dd></div><div><dt>AUTHOR / 作者</dt><dd>${escapeHtml(r.lead)}</dd></div><div><dt>TYPE / 类型</dt><dd><i></i>${r.clearance === "LINK" ? "外链作品" : "网页 Demo · 可运行"}</dd></div></dl>
  <div class="detail-tabs" role="tablist"><button id="tab-overview" class="active" role="tab" aria-controls="tab-panel" aria-selected="true" data-tab="overview">01 <span>概述</span></button><button id="tab-notes" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="notes">02 <span>作品记录</span></button><button id="tab-history" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="history">03 <span>收录信息</span></button><i class="tab-indicator" aria-hidden="true"></i></div>
  <div id="tab-panel" class="tab-panel" role="tabpanel">${overview()}</div>
  <div class="detail-actions"><button class="solid-button" data-action="bookmark">${saved.has(r.id) ? "− REMOVE FROM SAVED" : "＋ SAVE ARCHIVE"}<span>${saved.has(r.id) ? "已收藏" : "收藏档案"}</span></button><a class="export-button" href="${exportHref}" download="DEEPDEMOS-${safeId}.txt" aria-label="导出 ${safeId} 档案">EXPORT <span>↓</span></a></div>
  <div class="detail-footnote">${r.source ? `<a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">设定参考 ↗</a>` : `<span>ARCHIVE RECORD</span>`}<span>${String(selected + 1).padStart(3, "0")} / ${String(records.length).padStart(3, "0")}</span></div>`;
  $("#detail-content").setAttribute("tabindex", "-1");
  $('[data-action="bookmark"]').setAttribute(
    "aria-pressed",
    String(saved.has(r.id)),
  );
  setTab(activeTab, false);
}
function overview() {
  return `<div class="panel-label">ABSTRACT / 摘要</div><p>${escapeHtml(records[selected].abstract)}</p>`;
}
function setTab(tab: string, interactive = true) {
  if (interactive && tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const active = (b as HTMLElement).dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
    b.setAttribute("tabindex", active ? "0" : "-1");
  });
  const r = records[selected];
  const tabButton = $<HTMLButtonElement>(`[data-tab="${tab}"]`);
  const indicator = $(".tab-indicator");
  indicator.style.transition =
    interactive && motionActive("surfaceTransitions") ? "" : "none";
  indicator.style.transform = `translateX(${tabButton.offsetLeft}px) scaleX(${tabButton.offsetWidth})`;
  $("#tab-panel").setAttribute("aria-labelledby", tabButton.id);
  $("#tab-panel").innerHTML =
    tab === "overview"
      ? overview()
      : tab === "notes"
        ? `<div class="panel-label">WORK NOTES / 作品记录</div><ol class="research-notes">${r.findings.map((f, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span>${escapeHtml(f)}</li>`).join("")}</ol>`
        : `<div class="panel-label">ACCESS LOG / 本次访问</div>${accessLog
            .filter((entry) => entry.id === r.id)
            .slice(0, 4)
            .map(
              (entry) =>
                `<div class="log-row"><span>${entry.time}</span><span>PUBLIC USER</span><b>READ AUTHORIZED</b></div>`,
            )
            .join(
              "",
            )}<p class="log-note">本次会话已通过身份验证。档案内容以当前终端可访问范围展示。</p>`;
  $("#tab-panel").scrollTop = 0;
  if (interactive) {
    tabTransition.reveal($("#tab-panel"), !motionActive("surfaceTransitions"));
  }
}
function notify(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
}

function openModal(kind: NonNullable<typeof modal>) {
  if (!ready || modalClosing) return;
  if (!modal) {
    previousFocus = document.activeElement as HTMLElement;
    modalSiblings = [...$("#stage").children]
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node.id !== "modal-root",
      )
      .map((node) => ({ node, inert: node.inert }));
    modalSiblings.forEach(({ node }) => (node.inert = true));
  }
  modalClosing = false;
  modal = kind;
  searchQuery = "";
  filter = categories[0] ?? "全部作品";
  renderModal();
}
function closeModal(afterClose?: () => void) {
  if (!modal) {
    afterClose?.();
    return;
  }
  if (modalClosing) return;
  modalClosing = true;
  modalTransition!.hide(!motionActive("surfaceTransitions"), () => {
    modal = null;
    modalClosing = false;
    $("#modal-root").replaceChildren();
    modalTransition = undefined;
    modalSiblings.forEach(({ node, inert }) => (node.inert = inert));
    modalSiblings = [];
    $("#archive-ui").inert = mode !== "archive";
    $("#detail-ui").inert = true;
    previousFocus?.focus({ preventScroll: true });
    afterClose?.();
  });
}
function renderModal() {
  if (!modal || modalClosing) return;
  modalTransition?.dispose();
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="terminal-modal ${modal === "settings" ? "settings-modal" : ""}" role="dialog" aria-modal="true" aria-label="${modal === "settings" ? "系统设置" : modal === "saved" ? "收藏档案" : "档案检索"}"><div class="modal-top"><span>DEEPDEMOS / ${modal === "settings" ? "SYSTEM PREFERENCES" : "ARCHIVE DIRECTORY"}</span><button data-action="close-modal" aria-label="关闭窗口">CLOSE <span>×</span></button></div>${modal === "settings" ? settingsMarkup() : `<h2>${modal === "saved" ? "SAVED ARCHIVES" : "ARCHIVE INDEX"}<small>${modal === "saved" ? "收藏作品" : "作品检索"}</small></h2><div class="search-field"><span>⌕</span><input id="archive-search" type="search" autocomplete="off" placeholder="输入作品编号、名称或模型" aria-label="检索档案"/><span class="key">ESC</span></div><div class="category-filters">${categories.map((c, i) => `<button data-filter="${escapeHtml(c)}" class="${i === 0 ? "active" : ""}">${escapeHtml(c)}</button>`).join("")}</div><div class="result-header"><span>FILE / 作品</span><span>PLATFORM / 平台</span><span>ACCESS</span></div><div id="search-results" class="search-results"></div><div class="modal-bottom"><span id="result-count"></span><span>DEMO ARCHIVE <i>●</i> CONNECTED</span></div>`}</section></div>`;
  const backdrop = $(".modal-backdrop");
  backdrop.hidden = true;
  modalTransition = new SurfaceTransition(backdrop, $(".terminal-modal"));
  modalTransition.show(!motionActive("surfaceTransitions"));
  if (modal === "settings") updateQualitySummary();
  if (modal !== "settings") {
    $<HTMLInputElement>("#archive-search").value = searchQuery;
    renderResults();
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $("#archive-search").focus();
    });
  } else
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing)
        $('[data-action="close-modal"]').focus();
    });
  $("#modal-root")
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
}
function renderResults() {
  if (modalClosing || (modal !== "search" && modal !== "saved")) return;
  const allLabel = categories[0] ?? "全部作品";
  const results = records
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        (modal !== "saved" || saved.has(r.id)) &&
        (filter === allLabel || r.category === filter) &&
        `${r.id} ${r.title} ${r.en} ${r.department} ${r.lead}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  $("#search-results").innerHTML = results.length
    ? results
        .map(
          ({ r, i }) =>
            `<button class="result-row" data-result="${i}"><span class="result-name"><b>${escapeHtml(r.id)}</b><span>${escapeHtml(r.title)}<small>${escapeHtml(r.en)}</small></span>${saved.has(r.id) ? "<i>＋</i>" : ""}</span><span>${escapeHtml(r.department)}</span><span>${r.clearance === "RESTRICTED" ? "CATALOG ONLY" : "AUTHORIZED"} <i>↗</i></span></button>`,
        )
        .join("")
    : `<div class="empty-results"><span>∅</span><strong>${modal === "saved" && !searchQuery ? "尚无收藏作品" : "没有匹配的作品"}</strong><p>${modal === "saved" && !searchQuery ? "浏览作品时，选择 SAVE ARCHIVE 将其保存在此处。" : "尝试其他名称、作品编号，或切换分类。"}</p><button data-action="reset-search">${modal === "saved" ? "查看全部作品 →" : "重置检索 →"}</button></div>`;
  $("#result-count").textContent =
    `${String(results.length).padStart(2, "0")} RECORDS FOUND`;
}
type RenderMetrics = { anisotropy?: number; limited?: boolean };
/** Read the scene's render metrics without trusting the attribute. */
function parseMetrics(raw: string | undefined): RenderMetrics {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as RenderMetrics)
      : {};
  } catch {
    return {};
  }
}
function updateQualitySummary() {
  const summary = document.querySelector("#quality-summary");
  if (!summary || !scene) return;
  const canvas = scene.renderer.domElement;
  // The metrics attribute is written by the scene; a malformed value must only
  // cost the extra detail, never the whole summary.
  const metrics = parseMetrics(canvas.parentElement?.dataset.renderQuality);
  const transmission = Math.round(scene.renderer.transmissionResolutionScale * 100);
  summary.textContent = `${superPerformanceEnabled() ? "超级性能模式已启用 · 画质设置暂被覆盖，关闭后恢复 · " : ""}实际渲染 ${canvas.width} × ${canvas.height} · ${effectiveRenderQuality().frameRate ? `${effectiveRenderQuality().frameRate} fps 上限` : "不限帧率"} · 当前 ${Math.round(fps)} fps · ${effectiveRenderQuality().antialias === "smaa" ? "SMAA" : "原始抗锯齿"} · 纹理 ${metrics.anisotropy ?? 1}× · 折射 ${transmission}%${metrics.limited ? " · 已达到缓冲上限" : ""}`;
}
function motionPreferenceNoteMarkup() {
  const preset = prefs.motionPreset;
  const allEnabled = Object.values(prefs.motion).every(Boolean);
  return `<div id="motion-preference-note" class="motion-preference-note"><p>${motionSummary(prefs.motion)}</p><span>预设：${preset === "full" ? "完整动画" : preset === "reduced" ? "减少动画" : "自定义"} · 选择会保存在本站</span>${allEnabled ? "" : '<button data-action="enable-motion">启用完整动画</button>'}</div>`;
}
function settingsMarkup() {
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">PUBLIC USER <span>·</span> SESSION AUTHORIZED</p><div class="settings-list"><label><div><strong>SUPER PERFORMANCE</strong><span>降低三维画质和渲染分辨率，保留完整动效；关闭后恢复原画质</span></div><input type="checkbox" data-pref="superPerformance" ${prefs.superPerformance ? "checked" : ""}/><i class="toggle"></i></label>${audioSettingsMarkup(prefs)}</div>${motionPreferenceNoteMarkup()}${motionSettingsMarkup(prefs.motion, prefs.motionPreset)}${qualityMarkup(prefs.rendering)}${pwaSettingsMarkup()}<div class="settings-shortcuts"><span>KEYBOARD CONTROLS</span><p><kbd>←</kbd><kbd>→</kbd> 切列 <kbd>↑</kbd><kbd>↓</kbd> 选档 <kbd>ENTER</kbd> 读取 <kbd>/</kbd> 检索 <kbd>ESC</kbd> 返回</p></div><div class="settings-bottom">${document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : ""}</div><div class="modal-bottom"><span>ANALYSIS OS / 1.0 · 使用 MiSans 字体（小米） <a href="${assetUrl("fonts/MiSans-license.pdf")}" target="_blank" rel="noopener">字体许可</a></span><span>POWERED BY DEEPDEMOS</span></div>`;
}

document.addEventListener("input", (e) => {
  const slider = e.target as HTMLInputElement;
  if (slider.dataset.quality) {
    const output = document.querySelector<HTMLOutputElement>(
      `[data-quality-output="${slider.dataset.quality}"]`,
    );
    if (output) output.value = `${slider.value}%`;
  }
  const volume = e.target as HTMLInputElement;
  if (volume.dataset.volume === "musicVolume") {
    prefs[volume.dataset.volume] = Number(volume.value) / 100;
    volume
      .closest("label")
      ?.querySelector("output")
      ?.replaceChildren(`${volume.value}%`);
    saveAudioPrefs();
  }
  if ((e.target as HTMLElement).id === "archive-search") {
    searchQuery = (e.target as HTMLInputElement).value;
    renderResults();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "quality-preset" && Object.hasOwn(qualityPresets, el.value)) {
    prefs.rendering = { ...qualityPresets[el.value as QualityPreset] };
    savePrefs();
  } else if (el.dataset.quality) {
    const key = el.dataset.quality as keyof RenderQuality;
    prefs.rendering = normalizeQuality({
      ...prefs.rendering,
      [key]: key === "antialias" ? el.value : Number(el.value),
    });
    savePrefs();
  }
  if (el.dataset.pref) {
    const key = el.dataset.pref;
    if (
      key === "music" ||
      key === "quality" ||
      key === "superPerformance"
    )
      prefs[key] = el.checked;
    if (key === "music") saveAudioPrefs();
    else savePrefs();
  }
  if (el.dataset.motion) {
    const key = el.dataset.motion as MotionKey;
    prefs.motion[key] = el.checked;
    prefs.motionPreset = motionPresetFor(prefs.motion);
    savePrefs();
    const motionRoot = $("#motion-settings");
    const advancedOpen =
      motionRoot.querySelector<HTMLDetailsElement>(".motion-advanced")?.open ??
      false;
    const settingsPanel = motionRoot.closest<HTMLElement>(".settings-modal");
    const scrollTop = settingsPanel?.scrollTop ?? 0;
    motionRoot.outerHTML = motionSettingsMarkup(
      prefs.motion,
      prefs.motionPreset,
    );
    $("#motion-preference-note").outerHTML = motionPreferenceNoteMarkup();
    $("#motion-settings").querySelector<HTMLDetailsElement>(
      ".motion-advanced",
    )!.open = advancedOpen;
    requestAnimationFrame(() => {
      if (settingsPanel) settingsPanel.scrollTop = scrollTop;
      document
        .querySelector<HTMLInputElement>(`[data-motion="${key}"]`)
        ?.focus({ preventScroll: true });
    });
    notify(el.checked ? "已启用此动画" : "已关闭此动画");
  }
});
document.addEventListener("click", (e) => {
  if (!started) return;
  if (modalClosing) return;
  const el = (e.target as Element).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.action === "motion-preset") {
    const preset = el.dataset.preset;
    if (preset !== "full" && preset !== "reduced") return;
    prefs.motionPreset = preset;
    prefs.motion = preset === "full" ? fullMotion() : reducedMotion();
    savePrefs();
    renderModal();
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[data-action="motion-preset"][data-preset="${prefs.motionPreset}"]`,
        )
        ?.focus({ preventScroll: true }),
    );
    return;
  }
  if (el.dataset.select) {
    select(Number(el.dataset.select));
    return;
  }
  if (el.dataset.result) {
    const record = records[Number(el.dataset.result)];
    if (!record) return;
    closeModal(() => {
      const index = records.indexOf(record);
      if (index < 0) return;
      select(index);
      openFile();
    });
    return;
  }
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          (b as HTMLElement).dataset.filter === filter,
        ),
      );
    renderResults();
    return;
  }
  if (el.dataset.tab) {
    setTab(el.dataset.tab);
    return;
  }
  const action = el.dataset.action;
  if (action === "prev") stepFile(-1);
  if (action === "next") stepFile(1);
  if (action === "column-prev") stepColumn(-1);
  if (action === "column-next") stepColumn(1);
  if (action === "open") openFile();
  if (action === "model-viewer" && mode === "detail" && scene) {
    const activeScene = scene;
    // Safari does not always focus a button when it is tapped. Capture the
    // actual opener so closing the modal reliably restores the right control.
    el.focus({ preventScroll: true });
    viewer ??= new ModelViewer(
      $("#stage"),
      () => {
        audio.setScene(mode);
      },
    );
    audio.setScene("viewer");
    viewer.setSuperPerformance(superPerformanceEnabled());
    viewer.setQuality(effectiveRenderQuality());
    viewer.setMotion(prefs.motion);
    viewer.open(
      records[selected].id,
      records[selected].title,
      () => activeScene.createAssemblyModel(),
      !motionActive("viewerNavigation"),
    );
  }
  if (action === "back") {
    setMode("archive");
  }
  if (action === "search" || action === "saved" || action === "settings") {
    el.focus({ preventScroll: true });
    openModal(action);
  }
  if (action === "close-modal") closeModal();
  if (action === "bookmark") toggleSaved();
  if (action === "reset-search") {
    modal = "search";
    searchQuery = "";
    filter = categories[0] ?? "全部作品";
    renderModal();
  }
  if (action === "enable-motion") {
    prefs.motion = fullMotion();
    prefs.motionPreset = "full";
    savePrefs();
    renderModal();
  }
  if (action === "fullscreen" && document.fullscreenEnabled) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => notify("请使用浏览器的全屏快捷键 F11"));
  }
});
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (viewer?.isOpen) return;
  if (modalClosing) {
    e.preventDefault();
    return;
  }
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === "Escape") {
    if (modal) closeModal();
    else if (mode === "detail") {
      setMode("archive");
    }
    return;
  }
  if (modal && e.key === "Tab") {
    const focusables = [
      ...$("#modal-root").querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
      ),
    ];
    const visible = focusables.filter(
      (el) =>
        el.tabIndex >= 0 &&
        !el.matches(":disabled") &&
        el.getClientRects().length > 0,
    );
    const first = visible[0],
      last = visible.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (typing || modal || !ready) return;
  if (
    e.target instanceof HTMLElement &&
    e.target.dataset.tab &&
    ["ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = ["overview", "notes", "history"];
    setTab(
      tabs[(tabs.indexOf(activeTab) + (e.key === "ArrowRight" ? 1 : 2)) % 3],
    );
    $<HTMLButtonElement>(`[data-tab="${activeTab}"]`).focus();
    return;
  }
  if (e.key === "/") {
    e.preventDefault();
    openModal("search");
  }
  if (e.key === "Home" && isGamepadEvent(e) && mode === "archive" && !modal) {
    e.preventDefault();
    openModal("saved");
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    stepColumn(-1);
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    stepColumn(1);
  }
  if (["ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    stepFile(e.key === "ArrowUp" ? -1 : 1);
  }
  if (
    e.key === "Enter" &&
    (document.activeElement === document.body ||
      ["stage", "three-scene", "detail-content"].includes(
        document.activeElement?.id ?? "",
      ) ||
      document.activeElement instanceof HTMLCanvasElement ||
      ["prev", "next", "column-prev", "column-next"].includes(
        (document.activeElement as HTMLElement)?.dataset.action ?? "",
      ) ||
      (document.activeElement as HTMLElement)?.dataset.select)
  ) {
    e.preventDefault();
    if (mode === "archive") openFile();
  }
});

let lastTime = 0,
  frameCount = 0,
  frameStart = performance.now(),
  fps = 0;
// The scene is a continuous render loop, so without a ceiling it always runs at
// the display refresh rate. A 144 Hz panel then costs 2.4x the GPU time of 60 Hz
// for a picture that is mostly a slow idle drift.
let lastRenderedAt = -Infinity;
function frameInterval() {
  const cap = effectiveRenderQuality().frameRate;
  if (!cap) return 0;
  // Unfocused tabs and idle breathing settle cleanly at a low rate to save
  // GPU power without delaying active interactions.
  const focused =
    typeof document.hasFocus !== "function" || document.hasFocus();
  if (!focused && !viewer?.isOpen && !document.hidden) {
    return 1000 / Math.min(cap, 20);
  }
  const settled =
    !viewer?.isOpen && !document.hidden && (scene?.isIdle ?? false);
  return 1000 / (settled ? Math.min(cap, 15) : cap);
}
const stageEl = $("#stage");
const sceneEl = $("#three-scene");
let lastDetailShade = "";
function frame(ms: number) {
  if (document.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  const interval = frameInterval();
  const elapsed = ms - lastRenderedAt;
  const tolerance = 1.5;
  if (elapsed < interval - tolerance) {
    requestAnimationFrame(frame);
    return;
  }
  // Retain the fractional interval so the tolerance absorbs jitter without
  // letting a faster display render every frame above the selected cap.
  lastRenderedAt = interval > 0 && Number.isFinite(elapsed)
    ? lastRenderedAt + Math.max(1, Math.floor((elapsed + tolerance) / interval)) * interval
    : ms;
  const time = ms / 1000;
  const previousTransmission =
    modal === "settings" ? scene?.renderer.transmissionResolutionScale : undefined;
  if (!viewer?.isOpen) scene?.update(time);
  if (
    previousTransmission !== undefined &&
    previousTransmission !== scene?.renderer.transmissionResolutionScale
  ) {
    updateQualitySummary();
  }
  viewer?.update(time);
  if (
    scene &&
    mode === "detail" &&
    pendingDetailFocus &&
    scene.detailVisibility >= 0.1 &&
    !modal &&
    !viewer?.isOpen
  ) {
    if (!sceneEl.closest("[inert]")) {
      sceneEl.focus({ preventScroll: true });
      if (document.activeElement === sceneEl) pendingDetailFocus = false;
    }
  }
  const detailShade = String(scene?.detailVisibility ?? 0);
  if (detailShade !== lastDetailShade) {
    lastDetailShade = detailShade;
    stageEl.style.setProperty("--detail-shade", detailShade);
  }
  if (Math.floor(time) !== lastTime) {
    lastTime = Math.floor(time);
    updateFooterClock(new Date(), motionActive("rollingNumbers"));
  }
  frameCount++;
  if (ms - frameStart > 1000) {
    fps = (frameCount * 1000) / (ms - frameStart);
    frameStart = ms;
    frameCount = 0;
    sceneEl.dataset.fps = String(Math.round(fps));
  }
  requestAnimationFrame(frame);
}
function bindScene(scene: ArchiveScene) {
  scene.select(selected);
  scene.onSelect = (i, cell) => {
    if (mode !== "archive" || modal || viewer?.isOpen) return;
    select(i, cell ? { cell } : undefined);
  };
  // A second press on the same card opens it. The card is already selected and
  // lifting, so the detail transition picks up from the current height.
  scene.onOpen = (i) => {
    if (mode !== "archive" || modal || viewer?.isOpen) return;
    if (i !== selected) select(i);
    openFile();
  };
  scene.onHover = (i) => {
    if (mode !== "archive" || modal || viewer?.isOpen) {
      if (hoveredIndex !== null) {
        hoveredIndex = null;
        syncCleanTitle(false);
        syncCleanCover(false);
      }
      return;
    }
    hoveredIndex = i;
    syncCleanTitle();
    syncCleanCover();
  };
  scene.onNavigate = (axis, direction) => {
    if (mode !== "archive" || modal || viewer?.isOpen) return;
    if (axis === "lane") stepColumn(direction);
    else stepFile(direction);
  };
  scene.onIntroChange = (active) => {
    if (!started) return;
    syncCleanTitle(!active && motionActive("rollingText") && mode === "archive");
    syncCleanCover(!active && motionActive("surfaceTransitions") && mode === "archive");
  };
}

function prewarmDatasetProviders() {
  if (reviewParams.get("scene") === "detail") return;
  const initialProvider = modelProvider(records[selected]?.en ?? "");
  cleanTitle.prewarmProviders(
    new Set(
      records
        .map((record) => modelProvider(record.en))
        .filter(
          (p): p is ModelProvider => Boolean(p) && p !== initialProvider,
        ),
    ),
  );
}
let bootstrapRequest: AbortController | undefined;
let datasetRequest: AbortController | undefined;
let syncedDataVersion = getArchiveDataVersion();
let syncedDatasetVersion = getArchiveDatasetVersion();

function syncDatasetLayout(nextIndex: number) {
  selected = nextIndex;
  hoveredIndex = null;
  cardPhotoOverrides.clear();
  filter = categories[0] ?? "全部作品";
  rebuildColumnMemory();
  scene?.reloadData(selected);
  updateSelection(undefined, false);
  if (mode === "detail") renderDetail();
  if (modal === "search" || modal === "saved") renderModal();
  if (started) prewarmDatasetProviders();
}

function syncArchiveData(event: ArchiveDataChangeEvent) {
  datasetCustomized = true;
  const missedUpdate = event.version !== syncedDataVersion + 1;
  syncedDataVersion = event.version;
  if (event.datasetVersion !== syncedDatasetVersion) {
    syncedDatasetVersion = event.datasetVersion;
    bootstrapRequest?.abort();
    datasetRequest?.abort();
    if (viewer?.isOpen) viewer.close();
    const sameScope = bookmarkScope !== null && bookmarkScope === getArchiveBookmarkScope();
    const preservedIndex = sameScope && selectedIdIsStable && hasStableArchiveId(selectedId)
      ? records.findIndex((record) => record.id === selectedId)
      : -1;
    if (!sameScope) accessLog.length = 0;
    loadDatasetBookmarks();
    cardPhotoOverrides.clear();
    syncDatasetLayout(Math.max(0, preservedIndex));
  } else if (event.kind === "cover-resolver") {
    cardPhotoOverrides.clear();
    if (missedUpdate) syncDatasetLayout(selected);
    else {
      scene?.reloadData(selected);
      syncCleanCover(false);
    }
  } else if (event.kind === "update") {
    const { previousRecord, previousStableId, updatedIndex, layoutChanged, statsChanged } = event;
    const updated = records[updatedIndex];
    const coverChanged =
      resolveRecordCover(previousRecord, updatedIndex) !==
      resolveRecordCover(updated, updatedIndex);
    if (coverChanged) cardPhotoOverrides.delete(updatedIndex);
    if (previousRecord.id !== updated.id && saved.delete(previousRecord.id)) {
      saved.add(updated.id);
      if (bookmarkStore) {
        const removed = previousStableId && bookmarkStore.ids.delete(previousRecord.id);
        const persist = hasStableArchiveId(updated.id);
        if (persist) bookmarkStore.ids.add(updated.id);
        if (removed || persist) writeLocal(bookmarkStore.key, [...bookmarkStore.ids]);
      }
    }
    if (updatedIndex === selected && viewer?.isOpen) viewer.close();
    if (layoutChanged || missedUpdate) {
      syncDatasetLayout(selected);
    } else {
      scene?.refreshRecord(updatedIndex, {
        coverChanged,
        statsChanged,
      });
      if (updatedIndex === selected) {
        updateSelection(undefined, false);
        if (mode === "detail") renderDetail();
      } else if (updatedIndex === hoveredIndex) {
        syncCleanTitle(false);
        syncCleanCover(false);
      }
      renderResults();
    }
  }
  window.dispatchEvent(
    new CustomEvent("rhine:data-change", {
      detail: getArchiveDatasetSnapshot(),
    }),
  );
}

async function loadExternalDataset(url: string, options?: FetchAdapterOptions) {
  const adapter = createFetchAdapter(url, options);
  bootstrapRequest?.abort();
  datasetRequest?.abort();
  const request = new AbortController();
  datasetRequest = request;
  try {
    const payload = await adapter.load(request.signal);
    if (request.signal.aborted) throw request.signal.reason;
    datasetRequest = undefined;
    return setArchiveDataset(payload);
  } finally {
    if (datasetRequest === request) datasetRequest = undefined;
  }
}

async function start() {
  try {
    const request = new AbortController();
    bootstrapRequest = request;
    const bootstrapPromise = resolveBootstrapDataset(reviewParams, request.signal);
    scene = new ArchiveScene($("#three-scene"));
    const [, bootstrapDataset] = await Promise.all([
      scene.load(),
      bootstrapPromise,
      // With unicode-range faces, preload the brand characters, not every
      // font shard. Other archive text loads on demand.
      document.fonts.load(
        "600 20px MiSans",
        "AI DEMO ARCHIVE ANALYSIS OS",
      ),
    ]);
    bootstrapRequest = undefined;
    if (bootstrapDataset && !request.signal.aborted) {
      try {
        setArchiveDataset(bootstrapDataset);
      } catch (error) {
        console.warn("[archive] 外部启动数据集注入失败，保持内置演示数据。", error);
      }
    }
    await document.fonts.load(
      "700 28px MiSans",
      `DEEPDEMOS ${records[selected]?.title ?? ""}`,
    );
    bindScene(scene);
    savePrefs();
    select(selected);
    if (reviewParams.get("scene") !== "detail") await scene.warmUpOverview();
    ready = true;
    if (entry) entry.ready();
    else completeStartup(false);
  } catch (error) {
    bootstrapRequest?.abort();
    bootstrapRequest = undefined;
    console.error(error);
    $("#loading").innerHTML =
      '<div class="error-state"><strong>CONNECTION INTERRUPTED</strong><p>三维档案资源未能载入。请确认浏览器已启用硬件加速，然后重新连接。</p><button onclick="location.reload()">RECONNECT →</button></div>';
  }
}
function completeStartup(musicDisabled: boolean) {
  if (started || !ready) return;
  started = true;
  if (musicDisabled) {
    prefs.music = false;
    saveAudioPrefs();
  }
  audio.releaseEntry();
  const fade = motionActive("surfaceTransitions") ? 600 : 0;
  setMode(reviewParams.get("scene") === "detail" ? "detail" : "archive");
  // Place the grid in frame immediately and play the 4-stage overview entrance.
  scene?.revealImmediately();
  if (reviewParams.get("scene") !== "detail") scene?.playIntro();
  syncCleanTitle(false);
  syncCleanCover(false);
  $("#stage").inert = false;
  loading.classList.add("loaded");
  loading.inert = true;
  setTimeout(() => {
    const restoreFocus =
      loading.contains(document.activeElement) ||
      document.activeElement === document.body;
    loading.remove();
    if (restoreFocus) focusArchiveOverview();
  }, fade);
  frameStart = performance.now();
  frameCount = 0;
  lastRenderedAt = -Infinity;
  requestAnimationFrame(frame);
  if (reviewParams.get("scene") !== "detail") {
    setTimeout(() => prewarmDatasetProviders(), 3500);
  }
  // Do not compete with entry audio/font downloads or the 3.2 s overview
  // intro animation. Full offline installation begins once settled.
  setTimeout(() => void initPwa(notify), 4500);
}
updateSelection();
const stopDataSync = subscribeArchiveData(syncArchiveData);
void start();
enableGamepad();
const ARCHIVE_HINT: Record<"keyboard" | "gamepad", string> = {
  keyboard: `<kbd>←</kbd> <kbd>→</kbd> 切换列 <span>／</span> <kbd>↑</kbd> <kbd>↓</kbd> 前后档案 <span>／</span> <kbd>ENTER</kbd> 读取`,
  gamepad: `<kbd>LS</kbd> <kbd>DP</kbd> 切换列 / 前后档案 <span>／</span> <kbd>A</kbd> 读取`,
};
onInputDevice((device) => {
  const hint = document.querySelector(".archive-hint");
  if (hint) hint.innerHTML = ARCHIVE_HINT[device];
});
// Deterministic review controls: the running application, never a video surrogate.
const rhine = {
    archive: () => setMode("archive"),
    detail: () => openFile(),
    select: (i: number) => {
      if (!records.length || !Number.isFinite(i)) return;
      select(i);
    },
    replayIntro: () => scene?.playIntro(),
    slotLightGain: (gain: number) => scene?.setOverviewSlotLightGain(gain),
    setCardPhoto: (src: string | null, index?: number) => {
      if (!records.length) return;
      const target =
        index === undefined || !Number.isFinite(index)
          ? selected
          : Math.max(0, Math.min(records.length - 1, Math.floor(index)));
      const safeSrc = src === null ? null : sanitizeManualCover(src);
      if (src !== null && safeSrc === null) return;
      scene?.setCardPhoto(safeSrc, target);
      cardPhotoOverrides.set(target, safeSrc);
      syncCleanCover(motionActive("surfaceTransitions") && mode === "archive");
    },
    setCardStats: (
      stats: {
        sample?: string;
        downloads?: number;
        comments?: number;
      } | null,
      index?: number,
    ) => scene?.setCardStats(stats, index),
    setData: setArchiveDataset,
    loadData: loadExternalDataset,
    updateRecord: updateArchiveRecord,
    setCoverResolver,
    getData: getArchiveDatasetSnapshot,
    stats: () => ({
      ...scene?.getStats(),
      fps: Math.round(fps),
      mode,
      ready,
      startup: started ? "started" : (entry?.phase ?? "loading"),
      motion: { reduced: motionIsReduced(), preset: prefs.motionPreset },
      selected: records[selected]?.id ?? "",
      saved: [...saved],
      audio: audio.stats(),
    }),
};
declare global {
  interface Window {
    rhine: typeof rhine;
  }
}
window.rhine = rhine;
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopDataSync();
    bootstrapRequest?.abort();
    datasetRequest?.abort();
    if (exportBlobUrl) URL.revokeObjectURL(exportBlobUrl);
    cleanTitle.finish();
    cleanCover.dispose();
    audio.dispose();
  });
