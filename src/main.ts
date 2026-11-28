import { escapeHtml } from "./html";
import {
  normalizeQuality,
  superPerformanceQuality,
  type RenderQuality,
} from "./render-quality";
import "./style.css";
import "./responsive.css";
import { viewportLayout } from "./viewport-layout";
import { assetUrl } from "./asset-url";
import { initPwa } from "./pwa";
import { ArchiveScene } from "./scene";
import { SurfaceTransition } from "./ui-transitions";
import { wrap, type ArchiveNavigation } from "./archive-loop";
import {
  records,
  categories,
  archiveColumns,
  columnFiles,
  fileLocation,
  getArchiveBookmarkScope,
  getActiveModelSortId,
  getArchiveDataVersion,
  getArchiveDatasetSnapshot,
  getArchiveDatasetVersion,
  hasStableArchiveId,
  resolveRecordCover,
  resolveRecordPrompt,
  setArchiveDataset,
  setCoverResolver,
  sortArchiveByModel,
  subscribeArchiveData,
  updateArchiveRecord,
  type ArchiveDataChangeEvent,
  type ArchiveModelSortTarget,
} from "./data";
import {
  createFetchAdapter,
  resolveBootstrapDataset,
  resolveBootstrapModelVotes,
  type ArchiveDataPayload,
  type FetchAdapterOptions,
} from "./data-source";
import {
  getModelVotes,
  setModelVotes,
  subscribeModelVotes,
} from "./model-votes-data";
import { ModelVotesPanel } from "./model-votes-panel";
import {
  modelProvider,
  modelProviderAssetPath,
  type ModelProvider,
} from "./model-provider";
import { BlockDissolveTitle } from "./block-dissolve-title";
import { CleanCoverPreview } from "./clean-cover-preview";
import { MistDissolveToast } from "./mist-dissolve-toast";
import {
  createMotionPreferences,
  motionEnabled,
  motionPresetFor,
  type MotionKey,
  type MotionPreset,
  type StoredMotion,
} from "./motion-preferences";
import { StartupGate } from "./startup";
import "./startup.css";
import { enableGamepad, isGamepadEvent } from "./gamepad";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
import { logo } from "./brand";

$("#stage").innerHTML = `
  <div id="three-scene" class="three-scene"></div>
  <div class="archive-atmosphere"></div>
  <div id="clean-archive-title" class="clean-archive-title" aria-hidden="true"></div>
  <div id="clean-archive-cover" class="clean-archive-cover" aria-hidden="true" data-visible="false"></div>
  <aside id="model-votes-panel" class="model-votes" aria-label="模型票数排行" data-phase="hidden"></aside>
  <div id="clean-title-live" class="clean-title-live" aria-live="polite" aria-atomic="true"></div>
  <div id="detail-access" class="detail-access" hidden>
    <button id="detail-access-toggle" type="button" aria-expanded="false" aria-controls="detail-access-content">查看详情</button>
    <section id="detail-access-content" tabindex="0" aria-labelledby="detail-access-title" hidden>
      <h2 id="detail-access-title"></h2>
      <p id="detail-access-meta"></p>
      <h3>描述</h3><p id="detail-access-description"></p>
      <h3>第一轮提示词</h3><p id="detail-access-prompt"></p>
      <button id="detail-access-copy" type="button">复制提示词</button>
      <h3>档案记录</h3><p id="detail-access-findings"></p>
      <a id="detail-access-source" target="_blank" rel="noopener noreferrer">打开原作品 ↗</a>
    </section>
  </div>
  <div id="pwa-update-notice" class="pwa-update-notice" role="status" hidden><span>新版本已就绪</span><button data-pwa-action="update">更新并重启 ↻</button></div>
  <div id="modal-root"></div><div id="toast" class="toast" role="status"></div>
  <div id="loading" class="loading"><div class="loading-mark" role="img" aria-label="DeepDemos — AI Demo Archive">${logo}</div><span>CONNECTING TO DEEPDEMOS</span><i></i></div>
`;
$("#three-scene").tabIndex = -1;

type Mode = "archive" | "detail";
let mode: Mode = "archive",
  selected = 0,
  ready = false;
let selectedId = records[selected].id;
let selectedIdIsStable = hasStableArchiveId(selectedId);
let modal: "search" | "saved" | null = null,
  searchQuery = "",
  filter = categories[0] ?? "全部作品";
const reviewParams = new URLSearchParams(location.search);
let previousFocus: HTMLElement | null = null;
let modalTransition: SurfaceTransition | undefined;
let modalClosing = false;
let modalSiblings: { node: HTMLElement; inert: boolean }[] = [];
let pendingDetailFocus = false;
const detailAccess = $("#detail-access");
const detailAccessToggle = $<HTMLButtonElement>("#detail-access-toggle");
const detailAccessContent = $("#detail-access-content");
const detailAccessCopy = $<HTMLButtonElement>("#detail-access-copy");
const detailAccessSource = $<HTMLAnchorElement>("#detail-access-source");
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
const motionIsReduced = () =>
  Object.values(prefs.motion).every((value) => !value);
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
  if (mode !== "archive") {
    if (announce && cleanTitleLive.textContent !== next.title) {
      cleanTitleLive.textContent = next.title;
    }
    return;
  }
  cleanTitle.update(next);
  if (announce && cleanTitleLive.textContent !== next.title) {
    cleanTitleLive.textContent = next.title;
  }
}
const toast = new MistDissolveToast({
  root: $("#toast"),
  shouldAnimate: () => motionActive("surfaceTransitions"),
});
const cleanCover = new CleanCoverPreview($("#clean-archive-cover"));
const modelVotesPanel = new ModelVotesPanel({
  root: $("#model-votes-panel"),
  resolveProviderUrl: (provider) => assetUrl(modelProviderAssetPath(provider)),
  entries: getModelVotes(),
  shouldAnimate: () => motionActive("surfaceTransitions"),
  onSelectModel: (entry) => {
    if (mode !== "archive" || modal) return;
    applyModelSort({
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
    });
  },
});
function applyModelSort(target: ArchiveModelSortTarget | null) {
  if (target && target.id === getActiveModelSortId()) {
    const reset = sortArchiveByModel(null);
    if (modelVotesPanel.stats().activeSort !== reset.activeId) {
      modelVotesPanel.setActiveModel(reset.activeId);
    }
    return reset;
  }
  const result = sortArchiveByModel(target);
  if (target !== null && result.matchCount === 0) {
    if ($("#stage").dataset.layout === "portrait") {
      modelVotesPanel.setOpen(false);
    }
    notify(`当前档案库暂无 ${target.name} 对应作品`);
    return result;
  }
  if (modelVotesPanel.stats().activeSort !== result.activeId) {
    modelVotesPanel.setActiveModel(result.activeId);
  }
  return result;
}
const stopModelVotesSync = subscribeModelVotes((entries) => {
  modelVotesPanel.setEntries(entries);
  const currentSort = getActiveModelSortId();
  if (currentSort && !entries.some((item) => item.id === currentSort)) {
    sortArchiveByModel(null);
  }
  modelVotesPanel.setActiveModel(getActiveModelSortId());
  window.dispatchEvent(
    new CustomEvent("rhine:model-votes-change", { detail: entries }),
  );
});
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
const reviewEntry = reviewParams.has("scene");
let started = false;
const loading = $("#loading");
// The entry screen uses the actual viewport, including portrait phones.
$("#viewport").append(loading);
$("#stage").inert = true;
const entry = reviewEntry
  ? undefined
  : new StartupGate({ root: loading, start: () => completeStartup() });
let scene: ArchiveScene | undefined;
let columnMemory: number[] = [];
function rebuildColumnMemory() {
  columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0] ?? 0);
  if (records.length > 0 && selected >= 0 && selected < records.length) {
    columnMemory[fileLocation(selected).lane] = selected;
  }
}
rebuildColumnMemory();
function superPerformanceEnabled() {
  return prefs.superPerformance;
}
function effectiveRenderQuality() {
  return superPerformanceEnabled() ? superPerformanceQuality : prefs.rendering;
}
function savePrefs() {
  writeLocal("rhine-settings", prefs);
  if (!motionActive("rollingText")) {
    cleanTitle.finish();
  }
  if (!motionActive("surfaceTransitions")) {
    cleanTitle.finish();
    cleanCover.finish();
    modelVotesPanel.finish();
    modalTransition?.finish();
  }
  scene?.setMotion(prefs.motion);
  scene?.setSuperPerformance(superPerformanceEnabled());
  scene?.setQuality(effectiveRenderQuality());
  $("#stage").classList.toggle("reduce-motion", motionIsReduced());
  $("#stage").classList.toggle(
    "reduce-surfaces",
    !motionActive("surfaceTransitions"),
  );
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
  }
  cleanTitle.resize();
  cleanCover.resize();
  modelVotesPanel.resize();
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
function focusArchiveOverview() {
  if (mode !== "archive") return;
  $("#three-scene").focus({ preventScroll: true });
}

function syncDetailAccess() {
  const record = records[selected];
  detailAccess.hidden = mode !== "detail" || !record;
  if (detailAccess.hidden) return;
  const open = scene?.isDetailCardOpen ?? false;
  detailAccessToggle.textContent = open ? "收起详情" : "查看详情";
  detailAccessToggle.setAttribute("aria-expanded", String(open));
  if (!open && detailAccessContent.contains(document.activeElement)) {
    detailAccessToggle.focus({ preventScroll: true });
  }
  detailAccessContent.hidden = !open;
  if (!open) {
    detailAccessContent.scrollTop = 0;
    return;
  }
  const prompt = resolveRecordPrompt(record);
  $("#detail-access-title").textContent = record.title;
  $("#detail-access-meta").textContent = [record.id, record.category, record.date, record.en].join(" · ");
  $("#detail-access-description").textContent = record.abstract;
  $("#detail-access-prompt").textContent = prompt || "暂无首轮提示词。";
  $("#detail-access-findings").textContent = record.findings.join("\n");
  const source = /^https?:/i.test(record.source) ? record.source : "";
  if (
    (!prompt && document.activeElement === detailAccessCopy) ||
    (!source && document.activeElement === detailAccessSource)
  ) {
    detailAccessContent.focus({ preventScroll: true });
  }
  detailAccessCopy.hidden = !prompt;
  detailAccessSource.hidden = !source;
  if (source) detailAccessSource.href = source;
  else detailAccessSource.removeAttribute("href");
}
detailAccessToggle.addEventListener("click", () => {
  if (scene) scene.setDetailCardOpen(!scene.isDetailCardOpen);
});
detailAccessCopy.addEventListener("click", () => void scene?.copyDetailPrompt());
detailAccess.addEventListener("focusin", () => { pendingDetailFocus = false; });

function setMode(next: Mode) {
  const previousMode = mode;
  if (next !== "archive") {
    hoveredIndex = null;
    syncCleanTitle(false);
    cleanTitle.finish();
  }
  mode = next;
  $("#stage").dataset.mode = next;
  if (previousMode !== next) fit();
  if (next === "archive" && previousMode !== "archive") {
    cleanTitle.finish();
    syncCleanTitle(false);
  }
  syncCleanCover(motionActive("surfaceTransitions"));
  if (previousMode === "detail" && next !== "detail") {
    pendingDetailFocus = false;
    if (!modal && next === "archive") focusArchiveOverview();
  }
  scene?.setMode(next);
  syncDetailAccess();
  if (started) {
    const surfaceMotion = motionActive("surfaceTransitions");
    cleanTitle.setArchiveVisible(next === "archive", surfaceMotion);
    modelVotesPanel.setArchiveVisible(next === "archive", surfaceMotion);
  }
  if (next === "detail" && previousMode !== "detail") {
    pendingDetailFocus = true;
  }
}
function select(index: number, navigation?: ArchiveNavigation) {
  selected = wrap(Math.trunc(index), records.length);
  columnMemory[fileLocation(selected).lane] = selected;
  if (mode === "detail") setMode("archive");
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
  _navigation?: ArchiveNavigation,
  animate = true,
) {
  const r = records[selected];
  selectedId = r.id;
  selectedIdIsStable = hasStableArchiveId(selectedId);
  hoveredIndex = null;
  syncCleanTitle(animate && motionActive("rollingText") && mode === "archive", true);
  syncCleanCover(animate && motionActive("surfaceTransitions") && mode === "archive");
  syncDetailAccess();
}
function openFile() {
  if (!ready) return;
  closeModal(() => {
    setMode("detail");
  });
}
function notify(message: string) {
  toast.show(message, motionActive("surfaceTransitions"));
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
  modelVotesPanel.setPaused(true);
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
    modelVotesPanel.setPaused(false);
    previousFocus?.focus({ preventScroll: true });
    afterClose?.();
  });
}
function renderModal() {
  if (!modal || modalClosing) return;
  modalTransition?.dispose();
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="terminal-modal" role="dialog" aria-modal="true" aria-label="${modal === "saved" ? "收藏档案" : "档案检索"}"><div class="modal-top"><span>DEEPDEMOS / ARCHIVE DIRECTORY</span><button data-action="close-modal" aria-label="关闭窗口">CLOSE <span>×</span></button></div><h2>${modal === "saved" ? "SAVED ARCHIVES" : "ARCHIVE INDEX"}<small>${modal === "saved" ? "收藏作品" : "作品检索"}</small></h2><div class="search-field"><span>⌕</span><input id="archive-search" type="search" autocomplete="off" placeholder="输入作品编号、名称或模型" aria-label="检索档案"/><span class="key">ESC</span></div><div class="category-filters">${categories.map((c, i) => `<button data-filter="${escapeHtml(c)}" class="${i === 0 ? "active" : ""}">${escapeHtml(c)}</button>`).join("")}</div><div class="result-header"><span>FILE / 作品</span><span>PLATFORM / 平台</span><span>ACCESS</span></div><div id="search-results" class="search-results"></div><div class="modal-bottom"><span id="result-count"></span><span>DEMO ARCHIVE <i>●</i> CONNECTED</span></div></section></div>`;
  const backdrop = $(".modal-backdrop");
  backdrop.hidden = true;
  modalTransition = new SurfaceTransition(backdrop, $(".terminal-modal"));
  modalTransition.show(!motionActive("surfaceTransitions"));
  $<HTMLInputElement>("#archive-search").value = searchQuery;
  renderResults();
  requestAnimationFrame(() => {
    if (backdrop.isConnected && !modalClosing) $("#archive-search").focus();
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
    : `<div class="empty-results"><span>∅</span><strong>${modal === "saved" && !searchQuery ? "尚无收藏作品" : "没有匹配的作品"}</strong><p>${modal === "saved" && !searchQuery ? "当前暂无已保存的收藏记录。" : "尝试其他名称、作品编号，或切换分类。"}</p><button data-action="reset-search">${modal === "saved" ? "查看全部作品 →" : "重置检索 →"}</button></div>`;
  $("#result-count").textContent =
    `${String(results.length).padStart(2, "0")} RECORDS FOUND`;
}

document.addEventListener("input", (e) => {
  if ((e.target as HTMLElement).id === "archive-search") {
    searchQuery = (e.target as HTMLInputElement).value;
    renderResults();
  }
});
document.addEventListener("click", (e) => {
  if (!started) return;
  if (modalClosing) return;
  const el = (e.target as Element).closest<HTMLElement>("button");
  if (!el) return;
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
  const action = el.dataset.action;
  if (action === "close-modal") closeModal();
  if (action === "reset-search") {
    modal = "search";
    searchQuery = "";
    filter = categories[0] ?? "全部作品";
    renderModal();
  }
});
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (modalClosing) {
    e.preventDefault();
    return;
  }
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === "Escape") {
    if (modal) closeModal();
    else if (mode === "detail") {
      if (scene?.isDetailCardOpen) {
        scene.setDetailCardOpen(false);
      } else {
        setMode("archive");
      }
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
  if (e.key === "/") {
    e.preventDefault();
    openModal("search");
  }
  if (e.key === "Home" && isGamepadEvent(e) && mode === "archive" && !modal) {
    e.preventDefault();
    openModal("saved");
  }
  if (detailAccess.contains(document.activeElement)) return;
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
      ["stage", "three-scene"].includes(
        document.activeElement?.id ?? "",
      ) ||
      document.activeElement instanceof HTMLCanvasElement)
  ) {
    e.preventDefault();
    if (mode === "archive") openFile();
    else if (scene) {
      detailAccessToggle.focus({ preventScroll: true });
      scene.setDetailCardOpen(!scene.isDetailCardOpen);
    }
  }
});

let frameCount = 0,
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
  if (!focused && !document.hidden) {
    return 1000 / Math.min(cap, 20);
  }
  const settled = !document.hidden && (scene?.isIdle ?? false);
  return 1000 / (settled ? Math.min(cap, 15) : cap);
}
const sceneEl = $("#three-scene");
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
  scene?.update(time);
  if (
    scene &&
    mode === "detail" &&
    pendingDetailFocus &&
    scene.detailVisibility >= 0.1 &&
    !modal
  ) {
    if (!sceneEl.closest("[inert]")) {
      sceneEl.focus({ preventScroll: true });
      if (document.activeElement === sceneEl) pendingDetailFocus = false;
    }
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
    if (mode !== "archive" || modal) return;
    select(i, cell ? { cell } : undefined);
  };
  // A second press on the same card opens it. The card is already selected and
  // lifting, so the detail transition picks up from the current height.
  scene.onOpen = (i) => {
    if (mode !== "archive" || modal) return;
    if (i !== selected) select(i);
    openFile();
  };
  scene.onHover = (i) => {
    if (mode !== "archive" || modal) {
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
    if (mode !== "archive" || modal) return;
    if (axis === "lane") stepColumn(direction);
    else stepFile(direction);
  };
  scene.onIntroChange = (active) => {
    if (!started) return;
    syncCleanTitle(!active && motionActive("surfaceTransitions") && mode === "archive");
    syncCleanCover(!active && motionActive("surfaceTransitions") && mode === "archive");
    if (mode === "archive") {
      if (active) {
        modelVotesPanel.startIntro(motionActive("surfaceTransitions"));
      } else {
        modelVotesPanel.interruptIntro();
      }
    }
  };
  scene.onDetailCardOpenChange = syncDetailAccess;
  scene.onCopyPrompt = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        notify("已复制第一轮提示词");
        return true;
      }
    } catch {
      // Try the legacy clipboard path when the modern API rejects.
    }
    const helper = document.createElement("textarea");
    const previousFocus = document.activeElement;
    helper.value = text;
    helper.readOnly = true;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    let copied = false;
    try {
      helper.select();
      copied = document.execCommand("copy");
    } catch {
      // Some browsers disallow both clipboard paths.
    } finally {
      helper.remove();
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus({ preventScroll: true });
      }
    }
    notify(copied ? "已复制第一轮提示词" : "复制失败，请检查浏览器剪贴板权限");
    return copied;
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
  if (modal === "search" || modal === "saved") renderModal();
  if (started) prewarmDatasetProviders();
}

function syncArchiveData(event: ArchiveDataChangeEvent) {
  const missedUpdate = event.version !== syncedDataVersion + 1;
  syncedDataVersion = event.version;
  if (event.datasetVersion !== syncedDatasetVersion) {
    syncedDatasetVersion = event.datasetVersion;
    bootstrapRequest?.abort();
    datasetRequest?.abort();
    const sameScope = bookmarkScope !== null && bookmarkScope === getArchiveBookmarkScope();
    const preservedIndex = sameScope && selectedIdIsStable && hasStableArchiveId(selectedId)
      ? records.findIndex((record) => record.id === selectedId)
      : -1;
    loadDatasetBookmarks();
    cardPhotoOverrides.clear();
    syncDatasetLayout(Math.max(0, preservedIndex));
    modelVotesPanel.setActiveModel(getActiveModelSortId());
  } else if (event.kind === "reorder") {
    selected = 0;
    hoveredIndex = null;
    cardPhotoOverrides.clear();
    rebuildColumnMemory();
    scene?.reloadData(0, { animate: motionActive("selectionTransition") });
    updateSelection(undefined, true);
    if (modal === "search" || modal === "saved") renderModal();
    modelVotesPanel.setActiveModel(getActiveModelSortId());
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
    if (layoutChanged || missedUpdate) {
      syncDatasetLayout(selected);
    } else {
      scene?.refreshRecord(updatedIndex, {
        coverChanged,
        statsChanged,
      });
      if (updatedIndex === selected) {
        updateSelection(undefined, false);
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

function applyDatasetPayload(payload: ArchiveDataPayload) {
  const snapshot = setArchiveDataset(payload);
  if (payload && !Array.isArray(payload) && payload.modelVotes) {
    try {
      setModelVotes(payload.modelVotes);
    } catch (error) {
      console.warn("[model-votes] 外部模型票数数据无效，保持当前榜单。", error);
    }
  }
  return snapshot;
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
    return applyDatasetPayload(payload);
  } finally {
    if (datasetRequest === request) datasetRequest = undefined;
  }
}

async function start() {
  try {
    const request = new AbortController();
    bootstrapRequest = request;
    const bootstrapPromise = resolveBootstrapDataset(reviewParams, request.signal);
    const bootstrapVotesPromise = resolveBootstrapModelVotes(request.signal);
    scene = new ArchiveScene($("#three-scene"));
    const [, bootstrapDataset, , bootstrapModelVotes] = await Promise.all([
      scene.load(),
      bootstrapPromise,
      // With unicode-range faces, preload the brand characters, not every
      // font shard. Other archive text loads on demand.
      document.fonts.load(
        "700 40px MiSans",
        "DEEPDEMOS AI DEMO ARCHIVE",
      ),
      bootstrapVotesPromise,
    ]);
    bootstrapRequest = undefined;
    if (bootstrapDataset && !request.signal.aborted) {
      try {
        setArchiveDataset(bootstrapDataset);
      } catch (error) {
        console.warn("[archive] 外部启动数据集注入失败，保持内置演示数据。", error);
      }
    }
    const pendingVotes =
      bootstrapModelVotes ??
      (bootstrapDataset && !Array.isArray(bootstrapDataset)
        ? bootstrapDataset.modelVotes
        : undefined);
    if (pendingVotes && !request.signal.aborted) {
      try {
        setModelVotes(pendingVotes);
      } catch (error) {
        console.warn("[model-votes] 启动模型票数注入失败，保持内置演示数据。", error);
      }
    }
    modelVotesPanel.preloadIcons();
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
    else completeStartup();
  } catch (error) {
    bootstrapRequest?.abort();
    bootstrapRequest = undefined;
    console.error(error);
    const reason =
      error instanceof Error && error.message
        ? error.message
        : String(error ?? "未知错误");
    $("#loading").innerHTML = `<div class="error-state"><strong>CONNECTION INTERRUPTED</strong><p>三维档案资源未能载入。请确认浏览器已启用硬件加速，然后重新连接。</p><p class="error-detail">${escapeHtml(reason)}</p><button onclick="location.reload()">RECONNECT →</button></div>`;
  }
}
function completeStartup() {
  if (started || !ready) return;
  started = true;
  const fade = motionActive("surfaceTransitions") ? 600 : 0;
  setMode(reviewParams.get("scene") === "detail" ? "detail" : "archive");
  // Place the grid in frame immediately and play the 4-stage overview entrance.
  scene?.revealImmediately();
  if (reviewParams.get("scene") !== "detail") scene?.playIntro();
  if (mode === "archive" && !scene?.isIntroActive) {
    modelVotesPanel.startIntro(false);
  }
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
  // Do not compete with font downloads or the 3.2 s overview
  // intro animation. Full offline installation begins once settled.
  setTimeout(() => void initPwa(notify), 4500);
}
updateSelection();
const stopDataSync = subscribeArchiveData(syncArchiveData);
void start();
enableGamepad();
// Deterministic review controls: the running application, never a video surrogate.
const rhine = {
    archive: () => setMode("archive"),
    detail: () => openFile(),
    setDetailCardOpen: (open: boolean) => scene?.setDetailCardOpen(Boolean(open)),
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
    setData: applyDatasetPayload,
    loadData: loadExternalDataset,
    updateRecord: updateArchiveRecord,
    setCoverResolver,
    getData: getArchiveDatasetSnapshot,
    setModelVotes,
    getModelVotes,
    setModelVotesOpen: (open: boolean) => modelVotesPanel.setOpen(Boolean(open)),
    sortByModel: (idOrName?: string | null) => {
      if (idOrName == null) return applyModelSort(null);
      const clean = String(idOrName).trim();
      if (!clean) return applyModelSort(null);
      const matched = getModelVotes().find(
        (item) => item.id === clean || item.name === clean,
      );
      return applyModelSort(
        matched
          ? { id: matched.id, name: matched.name, provider: matched.provider }
          : { id: clean, name: clean, provider: modelProvider(clean) },
      );
    },
    stats: () => ({
      ...scene?.getStats(),
      fps: Math.round(fps),
      mode,
      ready,
      startup: started ? "started" : (entry?.phase ?? "loading"),
      motion: { reduced: motionIsReduced(), preset: prefs.motionPreset },
      selected: records[selected]?.id ?? "",
      saved: [...saved],
      modelVotes: modelVotesPanel.stats(),
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
    stopModelVotesSync();
    bootstrapRequest?.abort();
    datasetRequest?.abort();
    cleanTitle.finish();
    cleanCover.dispose();
    toast.dispose();
    modelVotesPanel.dispose();
  });
