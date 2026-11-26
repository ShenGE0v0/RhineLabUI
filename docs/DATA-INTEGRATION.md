# 外部数据接入指南

当前仓库内 [content/archives.json](../content/archives.json) 与 [public/assets/covers/](../public/assets/covers/) 仅作为内置默认演示数据。应用已在 [data.ts](../src/data.ts)、[data-source.ts](../src/data-source.ts)、[scene.ts](../src/scene.ts) 与 [main.ts](../src/main.ts) 预埋完整动态数据输入接口，支持任意列数（`>= 1`）与每列任意条数（`>= 1`），无需再固定为 `5 × 8`。

---

## 1. 四种数据输入方式

### 方式一：页面启动前全局预注入（`window.__DEEPDEMOS_DATA__`）
在主脚本加载前挂载全局变量（亦兼容别名 `window.__RHINE_DATA__`）。支持数组、数据集对象、`Promise`、无参工厂函数或 `{ load(signal?) }` 适配器。启动最多等待 5 秒，超时或失败时使用内置演示数据。适配器可使用传入的 `AbortSignal` 取消工作。

```html
<script>
  window.__DEEPDEMOS_DATA__ = {
    bookmarkScope: "example-works",
    columns: ["空间场景", "物理模拟", "游戏原型"],
    records: [
      {
        id: "DEMO-001",
        title: "示例作品",
        en: "CLAUDE-SONNET-5.5",
        category: "空间场景",
        date: "2026-11-26",
        cover: "https://example.com/cover.webp",
        stats: { sample: "4.9 / 5 · n=18", downloads: 42, comments: 3 }
      }
    ]
  };
</script>
```

### 方式二：URL 参数启动拉取（`?data=<json-url>`）
访问 `/?data=/api/demos.json` 可在启动时加载 JSON。支持同源相对路径或启用 CORS 的 HTTP(S) 接口，等待上限也是 5 秒。PWA 预缓存内置档案、封面和模型，离线重开时如果无法取得外部数据，页面会载入内置演示档案。

### 方式三：运行时控制台／宿主 JS 接口（`window.rhine`）
应用就绪后，可通过 `window.rhine` 动态替换全量数据、拉取远端接口、增量刷新单条记录或配置封面地址改写器：

| 方法 | 说明 |
| --- | --- |
| `rhine.setData(input)` | 用 `ArchiveRecordInput[]` 或 `{ records, columns?, categories?, coverResolver?, bookmarkScope? }` 全量替换数据集，并重绘三维阵列。 |
| `rhine.loadData(url, options?)` | 拉取 JSON 并替换数据集。选项包括 `headers`、`credentials`、`timeoutMs`、`transform(raw)`、`coverResolver` 和 `bookmarkScope`。新请求或直接替换会取消上一条请求，被取消的请求以 `AbortError` 结束。 |
| `rhine.updateRecord(idOrIndex, patch)` | 按档案 `id` 或数组下标增量更新单条记录（如实时更新 `title`、`stats`、`cover`）；若 `category` 变更则自动重建列索引，否则仅精准刷新对应卡面纹理与标题。 |
| `rhine.setCoverResolver(fn \| null)` | 注册全局封面路径改写钩子 `(cover, record, index) => string \| null`，用于统一拼接 CDN 域名、签名或同源代理路径。 |
| `rhine.getData()` | 返回当前生效数据集的只读快照 `{ version, records, columns, categories }`。 |

数据更新后，页面向 `window` 派发 `rhine:data-change`，`event.detail` 为最新快照。

内置档案沿用原有收藏。外部数据默认仅在当前数据集内保留收藏，全量替换后清空。宿主可为同一数据源指定稳定的 `bookmarkScope`，其中明确提供且唯一的 `id` 才能持久化收藏。自动编号和重复编号记录的收藏仅跟随当前数据集。远端 JSON 无权自行选择收藏范围，由宿主通过 `loadData` 的选项或 `transform` 指定。增量更新修改 ID 时，收藏随同一条记录迁移。

### 方式四：模块化源码集成（`src/data.ts` + `src/data-source.ts`）
使用与网页入口同一模块实例时，业务代码可直接调用以下接口。数据写入后网页同步更新选中项、阵列、标题和检索结果。
- `setArchiveDataset(input)` / `updateArchiveRecord(idOrIndex, patch)` / `subscribeArchiveData(listener)`
- `createFetchAdapter(url, { transform, coverResolver, bookmarkScope })` / `createStaticAdapter(dataset)`

```ts
await window.rhine.loadData("/api/works", {
  bookmarkScope: "works-api",
  transform(raw) {
    if (!raw || typeof raw !== "object" || !("items" in raw) || !Array.isArray(raw.items)) {
      throw new Error("作品响应缺少 items 数组");
    }
    const items = raw.items.filter((item) =>
      item && typeof item === "object" &&
      ["slug", "name", "model", "group", "thumb"].every((key) => typeof item[key] === "string"),
    );
    return { records: items.map((item) => ({
      id: item.slug,
      title: item.name,
      en: item.model,
      category: item.group,
      cover: item.thumb,
    })) };
  },
  coverResolver: (cover) => `/api/cover-proxy?url=${encodeURIComponent(cover)}`,
});
```

---

## 2. 输入字段规范（`ArchiveRecordInput`）

仅 `title` 为核心展示字段（缺省兜底 `"未命名作品"`），其余字段均可选并由 `normalizeArchiveDataset()` 自动清洗补齐：

| 字段 | 必填 | 默认值 / 清洗规则 |
| --- | --- | --- |
| `title` | 建议 | 作品标题（纯文本渲染，禁止 HTML/Markdown） |
| `id` | 否 | 缺省自动生成 `D-001`、`D-002`…（自动去重） |
| `en` | 否 | 生成模型名，默认 `"未标注"`（用于匹配 `public/assets/model-providers/*.svg` 图标） |
| `category` | 否 | 所属分类 / 所在列，缺省归入首列或 `"默认分类"` |
| `department` | 否 | 来源/平台，默认 `"未标注"` |
| `date` | 否 | 刻录/收录日期（用于右上角 `刻录时间` 与 Code 39 条码），默认 `"0000-00-00"` |
| `lead` | 否 | 作者名，默认 `"anonymous"` |
| `clearance` | 否 | 类型标签，默认 `"WEB"` |
| `abstract` | 否 | 简介，默认 `"暂无作品简介。"` |
| `findings` | 否 | 补充记录数组，缺省自动补一条模型说明 |
| `source` | 否 | 原页链接，仅允许 `http:` / `https:`，非法协议自动置空 |
| `cover` | 否 | 封面路径（`public/` 下同源相对路径如 `assets/covers/...`、源站根路径如 `/api/cover-proxy?url=...`、`data:image/*`、`blob:` 或支持 CORS 的 `http(s):` URL） |
| `stats` | 否 | `{ sample?: string, downloads?: number, comments?: number }` |
