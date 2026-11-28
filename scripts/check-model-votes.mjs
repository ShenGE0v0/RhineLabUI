import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveColumns,
  getActiveModelSortId,
  getArchiveBookmarkScope,
  records,
  sortArchiveByModel,
} from "../src/data.ts";
import {
  DEFAULT_MODEL_VOTES,
  getModelVotes,
  normalizeModelVotes,
  setModelVotes,
  subscribeModelVotes,
} from "../src/model-votes-data.ts";

test("normalizes default model votes and preserves representative fields", () => {
  const entries = getModelVotes();
  assert.equal(entries.length, DEFAULT_MODEL_VOTES.length);
  assert.equal(entries[0].name, "DS-FV-0831");
  assert.equal(entries[0].provider, "deepseek");
  assert.equal(entries[0].providerLabel, "DeepSeek");
  assert.equal(entries[0].works, 9);
  assert.equal(entries[0].score, 4.82);
  assert.equal(entries[0].votes, 63);
});

test("supports { items } wrapper, provider inference, monogram fallback, and sanitization", () => {
  const normalized = normalizeModelVotes({
    items: [
      {
        name: "Claude Opus 5.5\n",
        provider: null,
        providerLabel: "未标厂商",
        works: 34,
        score: 4.686,
        votes: 152.4,
      },
      {
        name: "GPT 6.2 SOL",
        votes: 14,
      },
      {
        name: "Claude Opus 5.5",
        provider: "anthropic",
        votes: 9,
      },
      {
        name: "星火原型",
        provider: 123,
        votes: 4.4,
      },
    ],
  });
  assert.equal(normalized[0].provider, undefined);
  assert.equal(normalized[0].monogram, "C");
  assert.equal(normalized[0].providerLabel, "未标厂商");
  assert.equal(normalized[0].score, 4.69);
  assert.equal(normalized[0].votes, 152);

  assert.equal(normalized[1].provider, "openai");
  assert.equal(normalized[1].providerLabel, "OpenAI");
  assert.equal(normalized[1].works, undefined);
  assert.equal(normalized[1].score, undefined);

  assert.notEqual(normalized[2].id, normalized[0].id);
  assert.equal(normalized[2].provider, "anthropic");

  assert.equal(normalized[3].provider, undefined);
  assert.equal(normalized[3].monogram, "星");
  assert.equal(normalized[3].votes, 4);
});

test("setModelVotes notifies subscribers and resets cleanly on null", () => {
  const seen = [];
  const stop = subscribeModelVotes((entries) => seen.push(entries.length));
  try {
    const custom = setModelVotes([
      { name: "GLM 5.4", provider: "zhipu", works: 4, score: 4.65, votes: 5 },
    ]);
    assert.equal(custom.length, 1);
    assert.equal(custom[0].provider, "zhipu");
    assert.equal(getModelVotes().length, 1);

    const restored = setModelVotes(null);
    assert.equal(restored.length, DEFAULT_MODEL_VOTES.length);
    assert.deepEqual(seen, [1, DEFAULT_MODEL_VOTES.length]);
  } finally {
    stop();
    setModelVotes(null);
  }
});

test("rejects malformed or empty payloads", () => {
  assert.throws(() => normalizeModelVotes([]));
  assert.throws(() =>
    normalizeModelVotes({ items: [{ name: "Bad", votes: -1 }] }),
  );
  assert.throws(() =>
    normalizeModelVotes({ items: [{ name: "   ", votes: 10 }] }),
  );
});

test("sortArchiveByModel reorders records and columns reversibly without altering bookmark scope", () => {
  const originalIds = records.map((r) => r.id);
  const originalColumns = [...archiveColumns];
  const originalScope = getArchiveBookmarkScope();
  try {
    const dsRes = sortArchiveByModel({
      id: "ds-fv-0831",
      name: "DS-FV-0831",
      provider: "deepseek",
    });
    assert.equal(dsRes.changed, true);
    assert.equal(dsRes.activeId, "ds-fv-0831");
    assert.equal(dsRes.matchCount, 17);
    assert.equal(records[0].en, "DS-FV-0831");
    assert.equal(getActiveModelSortId(), "ds-fv-0831");
    assert.equal(getArchiveBookmarkScope(), originalScope);

    const gptRes = sortArchiveByModel({
      id: "gpt-6.2-astra",
      name: "GPT 6.2 ASTRA",
      provider: "openai",
    });
    assert.equal(gptRes.changed, true);
    assert.equal(gptRes.activeId, "gpt-6.2-astra");
    assert.equal(gptRes.matchCount, 3);
    assert.equal(records[0].en, "GPT-ASTRA");

    const emptyRes = sortArchiveByModel({
      id: "qwen3.8-max",
      name: "QWEN3.8-MAX",
      provider: "alibaba",
    });
    assert.equal(emptyRes.changed, false);
    assert.equal(emptyRes.matchCount, 0);
    assert.equal(getActiveModelSortId(), "gpt-6.2-astra");

    const resetRes = sortArchiveByModel(null);
    assert.equal(resetRes.changed, true);
    assert.equal(resetRes.activeId, null);
    assert.equal(getActiveModelSortId(), null);
    assert.deepEqual(
      records.map((r) => r.id),
      originalIds,
    );
    assert.deepEqual([...archiveColumns], originalColumns);
    assert.equal(getArchiveBookmarkScope(), originalScope);
  } finally {
    sortArchiveByModel(null);
  }
});
