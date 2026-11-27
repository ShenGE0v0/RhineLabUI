import {
  normalizeArchiveDataset,
  type ArchiveCoverResolver,
  type ArchiveDataAdapter,
  type ArchiveDatasetInput,
  type ArchiveRecordInput,
} from "./data.ts";
import {
  normalizeModelVotes,
  type ModelVoteBootstrapSource,
  type ModelVotePayload,
} from "./model-votes-data.ts";

export type ArchiveDataPayload = ArchiveDatasetInput | ArchiveRecordInput[];

export type ArchiveBootstrapSource =
  | ArchiveDataPayload
  | ArchiveDataAdapter
  | Promise<ArchiveDataPayload>
  | (() => ArchiveDataPayload | Promise<ArchiveDataPayload>);

export interface FetchAdapterOptions {
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  timeoutMs?: number;
  transform?: (raw: unknown) => ArchiveDataPayload;
  coverResolver?: ArchiveCoverResolver | null;
  bookmarkScope?: string;
}

const FETCH_TIMEOUT_MS = 12000;
export const BOOTSTRAP_DATA_TIMEOUT_MS = 5000;

declare global {
  interface Window {
    __DEEPDEMOS_DATA__?: ArchiveBootstrapSource;
    __RHINE_DATA__?: ArchiveBootstrapSource;
    __DEEPDEMOS_MODEL_VOTES__?: ModelVoteBootstrapSource;
    __RHINE_MODEL_VOTES__?: ModelVoteBootstrapSource;
  }
}

function isAllowedDataUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  try {
    const base = "https://archive.invalid";
    return !/^[\\/]{2}/.test(trimmed) && new URL(trimmed, base).origin === base;
  } catch {
    return false;
  }
}

async function loadWithDeadline<T>(
  load: (signal: AbortSignal) => T | Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw signal.reason;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const deadline = setTimeout(
    () => controller.abort(new DOMException("数据请求超时。", "TimeoutError")),
    timeoutMs,
  );
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return load(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", forwardAbort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export function createStaticAdapter(
  dataset: ArchiveDataPayload,
): ArchiveDataAdapter {
  return {
    load: () => dataset,
  };
}

export function createFetchAdapter(
  url: string,
  options: FetchAdapterOptions = {},
): ArchiveDataAdapter {
  if (!isAllowedDataUrl(url)) {
    throw new Error(`不支持的数据源 URL: ${url}`);
  }
  const requestedTimeout = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout : FETCH_TIMEOUT_MS;
  return {
    load: (signal) => loadWithDeadline(
      async (requestSignal) => {
        const response = await fetch(url.trim(), {
          headers: options.headers,
          credentials: options.credentials,
          signal: requestSignal,
        });
        if (!response.ok) {
          throw new Error(`数据请求失败: HTTP ${response.status}`);
        }
        const raw: unknown = await response.json();
        const payload = options.transform
          ? options.transform(raw)
          : (raw as ArchiveDataPayload);
        if (Array.isArray(payload)) {
          if (options.coverResolver === undefined && options.bookmarkScope === undefined) return payload;
          return {
            records: payload,
            coverResolver: options.coverResolver,
            bookmarkScope: options.bookmarkScope,
          };
        }
        if (!payload || typeof payload !== "object") return payload;
        // Only host code (via options or transform) can opt into cover rewriting or a bookmark scope.
        return {
          ...payload,
          coverResolver: options.coverResolver === undefined
            ? (options.transform ? payload.coverResolver : undefined)
            : options.coverResolver,
          bookmarkScope: options.bookmarkScope ?? (options.transform ? payload.bookmarkScope : undefined),
        };
      },
      timeoutMs,
      signal,
    ),
  };
}

function isDataAdapter(value: unknown): value is ArchiveDataAdapter {
  return Boolean(
    value &&
      typeof value === "object" &&
      "load" in value &&
      typeof (value as ArchiveDataAdapter).load === "function",
  );
}

export async function resolveBootstrapDataset(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ArchiveDataPayload | null> {
  try {
    const globalSource = typeof window === "undefined"
      ? undefined
      : window.__DEEPDEMOS_DATA__ ?? window.__RHINE_DATA__;
    const dataUrl = params.get("data")?.trim() ?? "";
    if (globalSource === undefined && !dataUrl) return null;
    const payload = globalSource !== undefined
      ? await loadWithDeadline((requestSignal) => {
          if (typeof globalSource === "function") return globalSource();
          if (isDataAdapter(globalSource)) return globalSource.load(requestSignal);
          return globalSource;
        }, BOOTSTRAP_DATA_TIMEOUT_MS, signal)
      : await createFetchAdapter(dataUrl, { timeoutMs: BOOTSTRAP_DATA_TIMEOUT_MS }).load(signal);
    normalizeArchiveDataset(payload);
    return payload;
  } catch (error) {
    if (!signal?.aborted) console.warn("[archive] 启动数据源不可用，使用内置演示数据。", error);
    return null;
  }
}

function isModelVoteAdapter(value: unknown): value is {
  load: (signal?: AbortSignal) => ModelVotePayload | Promise<ModelVotePayload>;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "load" in value &&
      typeof (value as { load?: unknown }).load === "function",
  );
}

export async function resolveBootstrapModelVotes(
  signal?: AbortSignal,
): Promise<ModelVotePayload | null> {
  try {
    const globalSource =
      typeof window === "undefined"
        ? undefined
        : (window.__DEEPDEMOS_MODEL_VOTES__ ?? window.__RHINE_MODEL_VOTES__);
    if (globalSource === undefined || globalSource === null) return null;
    const payload = await loadWithDeadline(
      (requestSignal) => {
        if (typeof globalSource === "function") return globalSource();
        if (isModelVoteAdapter(globalSource))
          return globalSource.load(requestSignal);
        return globalSource;
      },
      BOOTSTRAP_DATA_TIMEOUT_MS,
      signal,
    );
    normalizeModelVotes(payload);
    return payload;
  } catch (error) {
    if (!signal?.aborted) {
      console.warn(
        "[model-votes] 启动模型票数数据源不可用，使用内置演示数据。",
        error,
      );
    }
    return null;
  }
}
