import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import {
  loadContent,
  localCoverPath,
  validateContent,
  archiveText,
} from "./archive-content.mjs";
import { escapeHtml } from "../src/html.ts";
import {
  getArchiveBookmarkScope,
  hasStableArchiveId,
  normalizeArchiveDataset,
  resolveRecordPrompt,
  setArchiveDataset,
  subscribeArchiveData,
  updateArchiveRecord,
} from "../src/data.ts";
import {
  BOOTSTRAP_DATA_TIMEOUT_MS,
  createFetchAdapter,
  resolveBootstrapDataset,
} from "../src/data-source.ts";

const content = await loadContent();
test("detail prompts use only the original text supplied by the dataset", () => {
  const { records } = normalizeArchiveDataset([
    { title: "Missing", abstract: "A short description" },
    { title: "Present", prompt: "  first line\nsecond line  " },
    { title: "Cleared", prompt: null },
  ]);
  assert.deepEqual(records.map(resolveRecordPrompt), ["", "first line\nsecond line", ""]);
});

test("all forty downloads match the shared content, including the UTF-8 BOM", async () => {
  for (const record of content.records) {
    assert.equal(
      (
        await readFile(
          new URL(
            `../public/archives/DEEPDEMOS-${record.id}.txt`,
            import.meta.url,
          ),
          "utf8",
        )
      ).replace(/\r\n/g, "\n"),
      archiveText(record),
    );
  }
});

test("all relative cover assets exist under public/", async () => {
  for (const record of content.records) {
    const path = localCoverPath(record.cover);
    if (!path) continue;
    assert.ok((await stat(new URL(`../public/${path}`, import.meta.url))).isFile(), path);
  }
});

test("external bookmark scopes require stable, unique record IDs", () => {
  assert.equal(getArchiveBookmarkScope(), "builtin");
  assert.ok(hasStableArchiveId("X-001"));
  const external = setArchiveDataset({
    bookmarkScope: "example",
    records: [
      { title: "Generated" },
      { id: "D-001", title: "Explicit" },
      { id: "duplicate", title: "First" },
      { id: "duplicate", title: "Second" },
    ],
  });
  assert.equal(getArchiveBookmarkScope(), "external:example");
  assert.notEqual(external.records[0].id, "D-001");
  assert.ok(hasStableArchiveId("D-001"));
  assert.ok(!hasStableArchiveId(external.records[0].id));
  assert.ok(external.records.slice(2).every(({ id }) => !hasStableArchiveId(id)));
  const change = updateArchiveRecord("D-001", { id: "renamed", category: "Other" });
  assert.equal(change.previousRecord.id, "D-001");
  assert.equal(change.previousStableId, true);
  assert.equal(change.layoutChanged, true);
  assert.ok(hasStableArchiveId("renamed"));
  assert.ok(!hasStableArchiveId("D-001"));
  setArchiveDataset([{ id: "X-001", title: "Unrelated external record" }]);
  assert.equal(getArchiveBookmarkScope(), null);
});

test("a failing data subscriber does not prevent later consumers from syncing", (t) => {
  const warn = t.mock.method(console, "error", () => {});
  const stopFailing = subscribeArchiveData(() => { throw new Error("test subscriber"); });
  const events = [];
  const stopRecording = subscribeArchiveData((event) => events.push(event));
  try {
    const snapshot = setArchiveDataset([{ title: "Active record" }]);
    assert.equal(snapshot.records[0].title, "Active record");
    assert.deepEqual(events.map(({ kind }) => kind), ["replace"]);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    stopRecording();
    stopFailing();
  }
});

test("hung bootstrap adapters are aborted and fall back even when they ignore the signal", async (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __DEEPDEMOS_DATA__: { load(requestSignal) {
      signal = requestSignal;
      return new Promise(() => {});
    } },
  };
  try {
    const result = resolveBootstrapDataset(new URLSearchParams());
    await Promise.resolve();
    t.mock.timers.tick(BOOTSTRAP_DATA_TIMEOUT_MS);
    assert.equal(await result, null);
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, "TimeoutError");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("fetched JSON cannot choose another dataset's bookmark scope or clear global coverResolver", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    bookmarkScope: "not-authorized-by-host",
    coverResolver: null,
    records: [{ id: "X-001", title: "External record" }],
  }));
  const url = "https://example.test/archives.json";
  const bare = await createFetchAdapter(url).load();
  assert.equal(bare.bookmarkScope, undefined);
  assert.equal(bare.coverResolver, undefined);
  const hostResolver = (cover) => `https://cdn.example.test/${cover}`;
  const scoped = await createFetchAdapter(url, {
    bookmarkScope: "host-scope",
    coverResolver: hostResolver,
  }).load();
  assert.equal(scoped.bookmarkScope, "host-scope");
  assert.equal(scoped.coverResolver, hostResolver);
  const transformed = await createFetchAdapter(url, {
    transform: (raw) => raw,
  }).load();
  assert.equal(transformed.bookmarkScope, "not-authorized-by-host");
  assert.equal(transformed.coverResolver, null);
});

const invalidCases = [
  [
    "missing title",
    (c) => {
      delete c.records[0].title;
    },
    /records\[0\].title/,
  ],
  [
    "blank abstract",
    (c) => {
      c.records[0].abstract = "  ";
    },
    /abstract/,
  ],
  [
    "duplicate ID",
    (c) => {
      c.records[1].id = "X-001";
    },
    /重复编号/,
  ],
  [
    "reordered ID",
    (c) => {
      [c.records[0], c.records[1]] = [c.records[1], c.records[0]];
    },
    /X-001/,
  ],
  [
    "unknown category",
    (c) => {
      c.records[0].category = "未知";
    },
    /未知分类/,
  ],
  [
    "unbalanced columns",
    (c) => {
      // 不能假设 records[0] 不在第一列：内容按列顺序排列时它就是第一列。
      // 找一条不在第一列的记录挪过去，制造每列八份的失衡。
      const target = c.records.find((r) => r.category !== c.columns[0]);
      target.category = c.columns[0];
    },
    /八份档案/,
  ],
  [
    "missing record",
    (c) => {
      c.records.pop();
    },
    /四十份档案/,
  ],
  [
    "null record",
    (c) => {
      c.records[0] = null;
    },
    /必须是档案对象/,
  ],
  [
    "empty findings",
    (c) => {
      c.records[0].findings = [];
    },
    /findings/,
  ],
  [
    "non-text findings",
    (c) => {
      c.records[0].findings = [42];
    },
    /findings/,
  ],
  [
    "unsafe URL",
    (c) => {
      c.records[0].source = "javascript:alert(1)";
    },
    /HTTPS/,
  ],
  [
    "invalid URL",
    (c) => {
      c.records[0].source = "example.com";
    },
    /HTTPS/,
  ],
  [
    "leading slash cover",
    (c) => {
      c.records[0].cover = "/assets/covers/X-001.webp";
    },
    /不得以 \/ 开头/,
  ],
  [
    "unsafe cover URL",
    (c) => {
      c.records[0].cover = "javascript:alert(1)";
    },
    /HTTP 或 HTTPS/,
  ],
  [
    "cover path with an encoded parent segment",
    (c) => {
      c.records[0].cover = "assets/%2e%2e/X-001.webp";
    },
    /路径跳转/,
  ],
  [
    "duplicate categories",
    (c) => {
      c.categories[1] = c.categories[0];
    },
    /不能重复/,
  ],
  [
    "reserved category",
    (c) => {
      c.categories[0] = "全部档案";
    },
    /全部档案/,
  ],
  [
    "mismatched columns",
    (c) => {
      c.columns[0] = "其他";
    },
    /相同的五个分类/,
  ],
];
for (const [name, mutate, error] of invalidCases) {
  test(`rejects ${name}`, () => {
    const invalid = structuredClone(content);
    mutate(invalid);
    assert.throws(() => validateContent(invalid), error);
  });
}
test("accepts independent filter and column order", () => {
  const edited = structuredClone(content);
  edited.categories.reverse();
  assert.equal(validateContent(edited), edited);
});
test("plain-text punctuation stays literal in HTML and downloadable text", () => {
  const title = `<玻璃> & "实验" 'A'`;
  const edited = structuredClone(content);
  edited.records[0].title = title;
  validateContent(edited);
  assert.equal(
    escapeHtml(title),
    "&lt;玻璃&gt; &amp; &quot;实验&quot; &#39;A&#39;",
  );
  assert.ok(archiveText(edited.records[0]).includes(title));
});
