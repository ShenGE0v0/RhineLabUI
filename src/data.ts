import content from "../content/archives.json" with { type: "json" };

export interface ArchiveCardStats {
  sample?: string;
  downloads?: number;
  comments?: number;
}

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  cover?: string;
  stats?: ArchiveCardStats;
}

export interface ArchiveRecordInput {
  id?: string;
  title: string;
  en?: string;
  department?: string;
  category?: string;
  date?: string;
  lead?: string;
  clearance?: string;
  abstract?: string;
  findings?: string[];
  source?: string;
  cover?: string | null;
  stats?: ArchiveCardStats | null;
}

export type ArchiveCoverResolver = (
  cover: string,
  record: ArchiveRecord,
  index: number,
) => string | null;

export interface ArchiveDatasetInput {
  records: ArchiveRecordInput[];
  columns?: string[];
  categories?: string[];
  coverResolver?: ArchiveCoverResolver | null;
  bookmarkScope?: string;
}

export interface ArchiveDataAdapter {
  load(
    signal?: AbortSignal,
  ):
    | Promise<ArchiveDatasetInput | ArchiveRecordInput[]>
    | ArchiveDatasetInput
    | ArchiveRecordInput[];
}

export interface ArchiveDatasetSnapshot {
  version: number;
  records: ArchiveRecord[];
  columns: string[];
  categories: string[];
}

export type ArchiveDataChangeEvent = { version: number; datasetVersion: number } & (
  | { kind: "replace" | "cover-resolver" }
  | {
      kind: "update";
      updatedIndex: number;
      previousRecord: ArchiveRecord;
      previousStableId: boolean;
      layoutChanged: boolean;
      statsChanged: boolean;
    }
);

type ArchiveDataListener = (event: ArchiveDataChangeEvent) => void;

const ALL_CATEGORY_LABEL = "全部作品";
const DEFAULT_CATEGORY = "默认分类";
const DEFAULT_FINDING = "外部数据输入记录";

const defaultDataset: ArchiveDatasetInput = {
  columns: [...content.columns],
  categories: [...content.categories],
  records: content.records.map((record) => ({
    ...record,
    findings: [...record.findings],
    stats: record.stats ? { ...record.stats } : undefined,
  })),
};

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function sanitizeHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function sanitizeCover(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return /^(https?:|data:image\/|blob:)/i.test(trimmed) ? trimmed : undefined;
  }
  return trimmed;
}

function sanitizeStats(value: unknown): ArchiveCardStats | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const stats: ArchiveCardStats = {};
  if (typeof raw.sample === "string" && raw.sample.trim()) {
    stats.sample = raw.sample.trim();
  }
  if (typeof raw.downloads === "number" && Number.isFinite(raw.downloads)) {
    stats.downloads = Math.max(0, Math.round(raw.downloads));
  }
  if (typeof raw.comments === "number" && Number.isFinite(raw.comments)) {
    stats.comments = Math.max(0, Math.round(raw.comments));
  }
  return Object.keys(stats).length > 0 ? stats : undefined;
}

function normalizeRecord(
  input: ArchiveRecordInput,
  index: number,
  usedIds: Set<string>,
  fallbackCategory: string,
  declaredIds?: ReadonlyMap<string, number>,
): ArchiveRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`records[${index}] 必须是对象。`);
  }
  const declaredId = cleanText(input.id);
  const baseId = declaredId || `D-${String(index + 1).padStart(3, "0")}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id) || (id !== declaredId && declaredIds?.has(id))) {
    id = `${baseId}-${suffix++}`;
  }
  usedIds.add(id);

  const findings = Array.isArray(input.findings)
    ? input.findings
        .map((item) => cleanText(item))
        .filter((item) => item.length > 0)
    : [];
  const en = cleanText(input.en, "未标注");
  if (findings.length === 0) {
    findings.push(en !== "未标注" ? `生成模型：${en}` : DEFAULT_FINDING);
  }
  const rawCategory = cleanText(input.category, fallbackCategory);
  const category =
    rawCategory === ALL_CATEGORY_LABEL ? fallbackCategory : rawCategory;

  return {
    id,
    title: cleanText(input.title, "未命名作品"),
    en,
    department: cleanText(input.department, "未标注"),
    category,
    date: cleanText(input.date, "0000-00-00"),
    lead: cleanText(input.lead, "anonymous"),
    clearance: cleanText(input.clearance, "WEB"),
    abstract: cleanText(input.abstract, "暂无作品简介。"),
    findings,
    source: sanitizeHttpUrl(input.source),
    cover: sanitizeCover(input.cover),
    stats: sanitizeStats(input.stats),
  };
}

export function normalizeArchiveDataset(
  input: ArchiveDatasetInput | ArchiveRecordInput[],
): {
  records: ArchiveRecord[];
  columns: string[];
  categories: string[];
  coverResolver?: ArchiveCoverResolver | null;
  bookmarkScope: string;
  stableIds: Set<string>;
} {
  if (!input || typeof input !== "object") {
    throw new Error("档案数据集必须是数组或对象。");
  }
  const rawRecords = Array.isArray(input) ? input : input.records;
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    throw new Error("档案数据集必须包含至少一条记录。");
  }

  const rawColumns =
    !Array.isArray(input) && Array.isArray(input.columns)
      ? input.columns
      : undefined;
  const rawCategories =
    !Array.isArray(input) && Array.isArray(input.categories)
      ? input.categories
      : undefined;
  const isValidColName = (c: unknown): c is string => {
    const t = cleanText(c);
    return t.length > 0 && t !== ALL_CATEGORY_LABEL;
  };
  const fallbackCategory =
    rawColumns?.find(isValidColName)?.trim() ??
    rawCategories?.find(isValidColName)?.trim() ??
    DEFAULT_CATEGORY;

  const declaredIds = new Map<string, number>();
  for (const item of rawRecords) {
    const id = cleanText(item?.id);
    if (id) declaredIds.set(id, (declaredIds.get(id) ?? 0) + 1);
  }
  const usedIds = new Set<string>();
  const stableIds = new Set<string>();
  const normalizedRecords = Array.from(rawRecords, (item, index) => {
    const record = normalizeRecord(item, index, usedIds, fallbackCategory, declaredIds);
    if (declaredIds.get(record.id) === 1) stableIds.add(record.id);
    return record;
  });

  const recordCategories = new Set(normalizedRecords.map((r) => r.category));
  const explicitColumns = (rawColumns ?? [])
    .map((name) => cleanText(name))
    .filter(
      (name) =>
        name.length > 0 &&
        name !== ALL_CATEGORY_LABEL &&
        recordCategories.has(name),
    );
  const columns: string[] = [];
  for (const name of explicitColumns) {
    if (!columns.includes(name)) columns.push(name);
  }
  for (const r of normalizedRecords) {
    if (!columns.includes(r.category)) columns.push(r.category);
  }

  const columnSet = new Set(columns);
  const explicitCategories = (rawCategories ?? [])
    .map((name) => cleanText(name))
    .filter(
      (name) =>
        name.length > 0 &&
        name !== ALL_CATEGORY_LABEL &&
        columnSet.has(name),
    );
  const categories: string[] = [];
  for (const name of explicitCategories) {
    if (!categories.includes(name)) categories.push(name);
  }
  for (const name of columns) {
    if (!categories.includes(name)) categories.push(name);
  }

  const resolver = Array.isArray(input) ? undefined : input.coverResolver;
  return {
    records: normalizedRecords,
    columns,
    categories,
    coverResolver: typeof resolver === "function" || resolver === null ? resolver : undefined,
    bookmarkScope: Array.isArray(input) ? "" : cleanText(input.bookmarkScope),
    stableIds,
  };
}

export const records: ArchiveRecord[] = [];
export const categories: string[] = [];
export const archiveColumns: string[] = [];

let dataVersion = 0;
let datasetVersion = 0;
let slotStride = 32;
let laneFilesCache: number[][] = [];
let locationCache: Array<{ lane: number; row: number; slot: number }> = [];
let globalCoverResolver: ArchiveCoverResolver | null = null;
let datasetCoverResolver: ArchiveCoverResolver | null | undefined;
let bookmarkScope: string | null = null;
let stableRecordIds = new Set<string>();
const listeners = new Set<ArchiveDataListener>();

function rebuildIndexCaches() {
  const laneBuckets = new Map<string, number[]>();
  for (const col of archiveColumns) {
    laneBuckets.set(col, []);
  }
  records.forEach((record, index) => {
    let bucket = laneBuckets.get(record.category);
    if (!bucket) {
      bucket = [];
      laneBuckets.set(record.category, bucket);
      archiveColumns.push(record.category);
    }
    bucket.push(index);
  });
  const nonEmptyColumns = archiveColumns.filter(
    (col) => (laneBuckets.get(col)?.length ?? 0) > 0,
  );
  archiveColumns.splice(0, archiveColumns.length, ...nonEmptyColumns);
  const activeSet = new Set(archiveColumns);
  const nonEmptyCategories = categories
    .slice(1)
    .filter((cat) => activeSet.has(cat));
  for (const col of archiveColumns) {
    if (!nonEmptyCategories.includes(col)) nonEmptyCategories.push(col);
  }
  categories.splice(
    0,
    categories.length,
    ALL_CATEGORY_LABEL,
    ...nonEmptyCategories,
  );

  laneFilesCache = archiveColumns.map((col) => laneBuckets.get(col) ?? []);
  const maxLaneLength = laneFilesCache.reduce(
    (max, files) => Math.max(max, files.length),
    0,
  );
  slotStride = Math.max(32, 12 + maxLaneLength);
  locationCache = new Array(records.length);
  laneFilesCache.forEach((files, lane) => {
    files.forEach((recordIndex, pos) => {
      const row = 12 + pos;
      locationCache[recordIndex] = { lane, row, slot: lane * slotStride + row };
    });
  });
}

function emitDataChange(event: ArchiveDataChangeEvent) {
  for (const listener of [...listeners]) {
    if (event.version !== dataVersion) break;
    try {
      listener(event);
    } catch (error) {
      console.error("[archive] 数据变更监听器执行失败。", error);
    }
  }
}

export function getDefaultDemoDataset(): ArchiveDatasetInput {
  return {
    columns: [...(defaultDataset.columns ?? [])],
    categories: [...(defaultDataset.categories ?? [])],
    records: defaultDataset.records.map((record) => ({
      ...record,
      findings: record.findings ? [...record.findings] : undefined,
      stats: record.stats ? { ...record.stats } : undefined,
    })),
  };
}

export function setArchiveDataset(
  input: ArchiveDatasetInput | ArchiveRecordInput[],
): ArchiveDatasetSnapshot {
  const normalized = normalizeArchiveDataset(input);
  records.splice(0, records.length, ...normalized.records);
  archiveColumns.splice(0, archiveColumns.length, ...normalized.columns);
  categories.splice(
    0,
    categories.length,
    ALL_CATEGORY_LABEL,
    ...normalized.categories,
  );
  datasetCoverResolver = normalized.coverResolver;
  bookmarkScope = normalized.bookmarkScope ? `external:${normalized.bookmarkScope}` : null;
  stableRecordIds = normalized.stableIds;
  rebuildIndexCaches();
  datasetVersion = ++dataVersion;
  emitDataChange({ kind: "replace", version: dataVersion, datasetVersion });
  return getArchiveDatasetSnapshot();
}

export function updateArchiveRecord(
  idOrIndex: string | number,
  patch: Partial<ArchiveRecordInput>,
): ArchiveDataChangeEvent | null {
  if (typeof idOrIndex === "number" && !Number.isFinite(idOrIndex)) {
    return null;
  }
  const index =
    typeof idOrIndex === "number"
      ? Math.trunc(idOrIndex)
      : records.findIndex((r) => r.id === idOrIndex);
  if (index < 0 || index >= records.length) return null;

  const current = records[index];
  const previousStableId = hasStableArchiveId(current.id);
  const mergedInput: ArchiveRecordInput = {
    ...current,
    ...patch,
    id: cleanText(patch.id, current.id),
    cover: patch.cover === null ? undefined : (patch.cover ?? current.cover),
    stats: patch.stats === null ? undefined : (patch.stats ?? current.stats),
  };
  const usedIds = new Set(
    records.filter((_, i) => i !== index).map((r) => r.id),
  );
  const next = normalizeRecord(mergedInput, index, usedIds, current.category);
  const categoryChanged = next.category !== current.category;
  records[index] = next;
  if (next.id !== current.id) {
    stableRecordIds.delete(current.id);
    if (next.id === cleanText(patch.id)) stableRecordIds.add(next.id);
  }

  dataVersion++;
  if (categoryChanged) {
    if (!archiveColumns.includes(next.category)) {
      archiveColumns.push(next.category);
    }
    if (!categories.includes(next.category)) {
      categories.push(next.category);
    }
    rebuildIndexCaches();
  }

  const event: ArchiveDataChangeEvent = {
    kind: "update",
    version: dataVersion,
    datasetVersion,
    updatedIndex: index,
    previousRecord: current,
    previousStableId,
    layoutChanged: categoryChanged,
    statsChanged: Object.hasOwn(patch, "stats"),
  };
  emitDataChange(event);
  return event;
}

export function setCoverResolver(resolver: ArchiveCoverResolver | null) {
  globalCoverResolver = resolver;
  datasetCoverResolver = undefined;
  dataVersion++;
  emitDataChange({ kind: "cover-resolver", version: dataVersion, datasetVersion });
}

export function resolveRecordCover(
  record: ArchiveRecord | undefined,
  index: number,
): string | null {
  if (!record?.cover) return null;
  const activeCoverResolver = datasetCoverResolver === undefined
    ? globalCoverResolver
    : datasetCoverResolver;
  if (!activeCoverResolver) return record.cover;
  try {
    return sanitizeCover(activeCoverResolver(record.cover, record, index)) ?? null;
  } catch (error) {
    console.warn("[archive] coverResolver 执行失败，回退原始封面地址。", error);
    return record.cover;
  }
}

export function getArchiveDataVersion() {
  return dataVersion;
}

export function getArchiveDatasetVersion() {
  return datasetVersion;
}

export function getArchiveBookmarkScope() {
  return bookmarkScope;
}

export function hasStableArchiveId(id: string) {
  return stableRecordIds.has(id);
}

export function getArchiveDatasetSnapshot(): ArchiveDatasetSnapshot {
  return {
    version: dataVersion,
    records: records.map((record) => ({
      ...record,
      findings: [...record.findings],
      stats: record.stats ? { ...record.stats } : undefined,
    })),
    columns: [...archiveColumns],
    categories: categories.slice(1),
  };
}

export function subscribeArchiveData(listener: ArchiveDataListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function columnFiles(lane: number) {
  return laneFilesCache[lane] ?? [];
}

export function fileLocation(index: number) {
  return locationCache[index] ?? { lane: 0, row: 12, slot: 12 };
}

export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / slotStride));
  if (!files.length) return 0;
  return files[
    Math.max(0, Math.min(files.length - 1, (slot % slotStride) - 12))
  ];
}

// Initialize synchronously with the bundled demo dataset so modules and checks
// see populated exports immediately at import time.
setArchiveDataset(defaultDataset);
bookmarkScope = "builtin";
dataVersion = 0;
datasetVersion = 0;
