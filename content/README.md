# 修改档案内容

[`archives.json`](archives.json) 是当前内置演示数据的静态源文件（三维卡面、网页检索、详情面板与 TXT 下载共用）；运行时接入动态/外部数据请见 [外部数据接入指南](../docs/DATA-INTEGRATION.md)。日常更新内置演示内容无需修改 TypeScript（`src/data.ts` 负责数据归一化与动态存储）。

## 文件结构

- `categories`：检索筛选器的五个分类，按显示顺序排列。“全部作品”由界面自动添加，无需填写。
- `columns`：三维阵列从左到右对应的五个分类，必须与 `categories` 包含相同的五个名称（顺序可不同）。
- `records`：固定四十份档案，按 `X-001` 至 `X-040` 顺序排列。每个分类下必须恰好有八份，同分类在数组中的顺序决定列内顺序。

### 档案字段说明

| 字段 | 必填 | 内容说明 |
| --- | --- | --- |
| `id` | 是 | 稳定编号（`X-001`～`X-040`），用于收藏映射、阵列定位与 TXT 下载文件名 |
| `title` | 是 | 中文作品标题（显示于卡面左上首行、悬停卡面及详情） |
| `en` | 是 | 生成模型名（显示于卡面左上第二行，并用于匹配 `public/assets/model-providers/` 厂商图标） |
| `department` | 是 | 来源／平台标注（如 `DSH`、`未标注`） |
| `category` | 是 | 所属分类（须与 `categories` 中的五个名称之一完全一致） |
| `date` | 是 | 收录／刻录日期（推荐 `YYYY-MM-DD` 格式，卡面右上角显示为 `刻录时间：YYYY-MM-DD` 并由 `src/code39.ts` 绘成 Code 39 条码） |
| `lead` | 是 | 原作作者名 |
| `clearance` | 是 | 作品类型（如 `WEB`） |
| `abstract` | 是 | 作品简介 |
| `findings` | 是 | 补充说明字符串数组（至少包含一条非空文本） |
| `source` | 是 | DeepDemos 作品原页完整 HTTP 或 HTTPS 链接 |
| `cover` | 否 | 作品封面图路径（当前 40 份已同步至 `public/assets/covers/` 同源托管，如 `assets/covers/X-001.webp`；支持相对路径或支持 CORS 的 URL，加载后裁切铺入卡面中部展示框） |
| `stats` | 否 | 互动数据快照对象：`{ "sample": "5.0 / 5 · n=11", "downloads": 32, "comments": 0 }`（不包含浏览数；缺省时卡面回退默认值） |

> 所有文本字段按**纯文本**渲染，不支持 Markdown 或 HTML；双引号按 JSON 规则转义为 `\"`，换行写为 `\n`。页面渲染会自动转义 HTML 特殊字符，TXT 导出保留纯文本原文。

当前 40 份档案的 `cover` 与 `stats` 已按每条 `source` 的作品 ID 对齐 DeepDemos 公开数据（2026-11-22 快照）。

## 修改与校验流程

1. 编辑 `content/archives.json` 中对应档案的字段。若修改分类名称，需同步更新 `categories`、`columns` 与对应档案的 `category`。
2. 执行 `npm run export:archives`，校验 JSON 约束并重新生成 `public/archives/DEEPDEMOS-X-001.txt` 至 `DEEPDEMOS-X-040.txt`。若校验失败，脚本会拒绝写入任何文件。
3. 执行 `npm run check:content` 核验字段约束与 TXT 导出一致性，随后运行 `npm run build` 验证完整构建。
4. 在 `npm run dev` 中实机查看卡面标题、模型图标、封面加载、刻录条码、`/` 检索与 TXT 导出结果。

`npm run dev` 和 `npm run build` 启动前均会自动执行 `export-records.mjs`。开发服务器运行期间修改 `archives.json` 会即时刷新页面内容，但更新磁盘 TXT 需手动执行 `npm run export:archives` 或重启开发服务器。

## 结构红线

- 五列、每列八份的结构与三维循环阵列及布局强绑定，`scripts/archive-content.mjs` 会拒绝增减档案或更改分类数量。
- 请勿通过交换数组位置或重编号改变已有档案顺序，以免用户本地保存的收藏编号指向错误作品。

内容与数据分离方案最初源自 [@Tomahawkd 的 PR #3](https://github.com/LBEILC/RhineLabUI/pull/3)。
