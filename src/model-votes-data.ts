import { modelProvider, type ModelProvider } from "./model-provider.ts";

export interface ModelVoteInput {
  id?: string;
  name: string;
  provider?: ModelProvider | string | null;
  providerLabel?: string;
  works?: number;
  score?: number;
  votes: number;
}

export interface ModelVoteEntry {
  id: string;
  name: string;
  provider?: ModelProvider;
  providerLabel: string;
  works?: number;
  score?: number;
  votes: number;
  monogram: string;
}

export type ModelVotePayload = ModelVoteInput[] | { items: ModelVoteInput[] };

export interface ModelVoteAdapter {
  load(signal?: AbortSignal): ModelVotePayload | Promise<ModelVotePayload>;
}

export type ModelVoteBootstrapSource =
  | ModelVotePayload
  | ModelVoteAdapter
  | Promise<ModelVotePayload>
  | (() => ModelVotePayload | Promise<ModelVotePayload>);

type ModelVoteListener = (entries: ModelVoteEntry[]) => void;

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]+/g;
const DEFAULT_PROVIDER_LABEL = "未标厂商";

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  openai: "OpenAI",
  alibaba: "Qwen",
  xai: "xAI",
  zhipu: "Zhipu",
  google: "Google",
  moonshot: "Moonshot",
  bytedance: "ByteDance",
  minimax: "MiniMax",
  meta: "Meta",
  mistral: "Mistral",
  tencent: "Tencent",
  baidu: "Baidu",
  stepfun: "StepFun",
  xiaomi: "Xiaomi",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  aws: "AWS",
  cohere: "Cohere",
  perplexity: "Perplexity",
  ibm: "IBM",
  ai21: "AI21",
  yi: "01.AI",
  baichuan: "Baichuan",
  stability: "Stability",
  bfl: "Black Forest Labs",
  midjourney: "Midjourney",
  kling: "Kling",
  runway: "Runway",
  suno: "Suno",
  adobe: "Adobe",
  sensenova: "SenseTime",
  spark: "iFlytek",
  apple: "Apple",
};

export const DEFAULT_MODEL_VOTES: readonly ModelVoteInput[] = [
  {
    id: "ds-fv-0831",
    name: "DS-FV-0831",
    provider: "deepseek",
    providerLabel: "DeepSeek",
    works: 9,
    score: 4.82,
    votes: 63,
  },
  {
    id: "claude-sonnet-5.5",
    name: "CLAUDE-SONNET-5.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    works: 2,
    score: 4.74,
    votes: 11,
  },
  {
    id: "gpt-6.2-astra",
    name: "GPT 6.2 ASTRA",
    provider: "openai",
    providerLabel: "OpenAI",
    works: 7,
    score: 4.73,
    votes: 21,
  },
  {
    id: "qwen3.8-max",
    name: "QWEN3.8-MAX",
    provider: "alibaba",
    providerLabel: "Qwen",
    works: 1,
    score: 4.73,
    votes: 18,
  },
  {
    id: "grok-4",
    name: "GROK-4",
    provider: "xai",
    providerLabel: "xAI",
    works: 3,
    score: 4.66,
    votes: 26,
  },
  {
    id: "glm-5.4",
    name: "GLM 5.4",
    provider: "zhipu",
    providerLabel: "Zhipu",
    works: 4,
    score: 4.65,
    votes: 5,
  },
];

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(CONTROL_CHARS_RE, " ").trim()
    : "";
}

function isKnownProvider(key: string): key is ModelProvider {
  return Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, key);
}

function resolveVoteProvider(
  rawProvider: unknown,
  modelName: string,
): ModelProvider | undefined {
  if (rawProvider === null) return undefined;
  if (rawProvider !== undefined) {
    if (typeof rawProvider !== "string") return undefined;
    const cleaned = cleanText(rawProvider);
    if (!cleaned) return undefined;
    const matched = modelProvider(cleaned);
    if (matched) return matched;
    const lowered = cleaned.toLowerCase();
    return isKnownProvider(lowered) ? lowered : undefined;
  }
  return modelProvider(modelName);
}

function computeMonogram(name: string): string {
  const ascii = name.match(/[A-Za-z0-9]/);
  if (ascii) return ascii[0].toUpperCase();
  const cp = name.codePointAt(0);
  return cp !== undefined ? String.fromCodePoint(cp).toUpperCase() : "M";
}

function slugId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `model-${index + 1}`;
}

export function normalizeModelVotes(input: ModelVotePayload): ModelVoteEntry[] {
  let items: unknown;
  if (Array.isArray(input)) {
    items = input;
  } else if (
    input &&
    typeof input === "object" &&
    "items" in input &&
    Array.isArray((input as { items: unknown }).items)
  ) {
    items = (input as { items: unknown[] }).items;
  } else {
    throw new Error("模型票数数据必须是数组或包含 items 数组的对象。");
  }

  const rawList = items as unknown[];
  const usedIds = new Set<string>();
  const normalized: ModelVoteEntry[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`第 ${i + 1} 条模型票数记录格式无效。`);
    }
    const item = raw as Record<string, unknown>;
    const name = cleanText(item.name);
    if (!name) {
      throw new Error(`第 ${i + 1} 条模型票数记录缺少有效名称 name。`);
    }
    if (
      typeof item.votes !== "number" ||
      !Number.isFinite(item.votes) ||
      item.votes < 0
    ) {
      throw new Error(`模型 "${name}" 的票数 votes 必须为非负有限数字。`);
    }

    const baseId = cleanText(item.id) || slugId(name, i);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    usedIds.add(id);

    const provider = resolveVoteProvider(item.provider, name);
    const explicitLabel = cleanText(item.providerLabel);
    const providerLabel =
      explicitLabel ||
      (provider ? PROVIDER_LABELS[provider] : DEFAULT_PROVIDER_LABEL);

    const works =
      typeof item.works === "number" &&
      Number.isFinite(item.works) &&
      item.works >= 0
        ? Math.round(item.works)
        : undefined;

    const score =
      typeof item.score === "number" &&
      Number.isFinite(item.score) &&
      item.score >= 0 &&
      item.score <= 10
        ? Math.round(item.score * 100) / 100
        : undefined;

    normalized.push({
      id,
      name,
      provider,
      providerLabel,
      works,
      score,
      votes: Math.max(0, Math.round(item.votes)),
      monogram: computeMonogram(name),
    });
  }

  if (normalized.length === 0) {
    throw new Error("模型票数列表不能为空。");
  }

  return normalized;
}

let activeModelVotes: ModelVoteEntry[] = normalizeModelVotes([
  ...DEFAULT_MODEL_VOTES,
]);
const listeners = new Set<ModelVoteListener>();

function cloneEntries(entries: readonly ModelVoteEntry[]): ModelVoteEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function getModelVotes(): ModelVoteEntry[] {
  return cloneEntries(activeModelVotes);
}

export function setModelVotes(
  input: ModelVotePayload | null,
): ModelVoteEntry[] {
  activeModelVotes = normalizeModelVotes(
    input === null ? [...DEFAULT_MODEL_VOTES] : input,
  );
  const snapshot = cloneEntries(activeModelVotes);
  for (const listener of listeners) {
    try {
      listener(cloneEntries(snapshot));
    } catch (error) {
      console.warn("[model-votes] subscriber failed", error);
    }
  }
  return snapshot;
}

export function subscribeModelVotes(listener: ModelVoteListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
