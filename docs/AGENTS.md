# 开发规范与交付流程

本文档规定 **DEEPDEMOS 档案库**（仓库 `RhineLabUI`）的代码边界、编码红线、验证命令与交付工作流，与同目录其他文档的分工如下：

- [开发规范与交付流程](AGENTS.md)（本文）：技术限制、编码红线、命令速查与审核交付规则。
- [网页交接](HANDOFF.md)：当前 Git 基线、资产 SHA-256、调试控制台接口与剩余待办。
- [设计规范](DESIGN.md)：当前生效的网页形态、三维阵列、卡匣外观、布光、动效、卡面与音频规范。
- 本地工作区 `../../design-preview/README.md` 记录 Blender 生产源、GLB 导出链与建模注意事项。

---

## 技术边界与范围约束

1. **原生技术栈**：项目使用 **TypeScript + Three.js + Vite + 原生 DOM/SVG/Canvas** 实现。不引入前端 UI 框架，不启用前端设计或动效 Skill。
2. **维护范围**：仅维护本项目的网页端（含 PWA / Cloudflare Pages 静态构建）；Wallpaper Engine 桌面壁纸支持已停止并移除，亦不收录或维护 DSH Desktop 衍生主题、安装工具及其独立发布流程。
3. **资产与媒体边界**：
   - 严禁在生产源码或构建包中嵌入原参考视频。
   - 严禁通过普通网页接口伪造本地桌面文件系统集成。
   - 三维模型资产统一由 Blender 5.2（经 Blender MCP 或生产脚本）维护，保留同级 `design-preview/` 中的源文件与导出脚本，并与 `public/assets/` 保持字节/SHA-256 一致。
4. **已废止机制提醒**：早期上游的 2D 逐帧开机片头、Novecento 授权字体、进入详情磨砂变透明解密、17 类交互音效，以及 Wallpaper Engine 桌面壁纸端、桌面工作台、外部音频频谱律动与 3D 卸载开关均已从产品逻辑移除，编写新功能或更新文档时不得恢复对这些机制的依赖。

---

## 交付工作流

所有非只读改动严格执行五步流程，**用户是最后一道终审**：

1. **实现改动**：在明确方案与修改范围后编写代码或修改资产。
2. **本地自测**：运行类型检查、内容校验、全量构建及与改动范围匹配的检查脚本（见下文命令速查）。涉及 Blender 资产导出时，需核对源文件导出物与 `public/assets/*.glb` 的 SHA-256。
3. **独立只读子代理审核**：由独立于实现者的只读子代理审查实际改动文件、调用方与受影响脚本/文档，按三级标准输出清单：
   - **阻断**：功能失效、回归或构建失败，必须修复；
   - **应修**：逻辑瑕疵、边界遗漏或维护隐患，建议修复；
   - **可忽略**：风格或命名建议，记录即可。
4. **修正与复验**：逐一处理审核意见并复跑相关验证；不采纳的条目必须写明具体理由。
5. **呈报四项交付报告**：向用户输出完整交付报告，包含：① 改动文件与具体内容；② 已跑验证命令与实测结果；③ 子代理审核意见与处置；④ 需用户拍板事项。

> **提交禁令**：**未经用户终审明确通过，严禁执行 `git commit`、`git push` 或 `git merge`**（除非用户在当轮对话中明确说明免审）。

---

## 编码与验证红线

### 数据与安全
- **档案数据约束**：[archives.json](../content/archives.json) 必须严格保持 **5 个分类、每类 8 份（`X-001`～`X-040`）** 的固定结构与编号顺序，禁止通过交换或重编号改变已有档案槽位（避免破坏用户收藏映射）。所有字段按纯文本渲染，禁止 Markdown 或 HTML 注入。修改数据后必须运行 `npm run export:archives` 与 `npm run check:content`。详细字段见 [档案数据维护](../content/README.md)。
- **防御性存储与解析**：读写 `localStorage` 必须使用项目现有的容错封装（禁止裸调 `getItem`/`setItem` 或裸 `JSON.parse` 崩溃）；存储配额超限或隐私模式写入失败时应降级为内存态并提示用户。
- **着色器与贴图兼容**：
  - Windows Chrome ANGLE（D3D11）下，GLSL 中对变量做分数次幂 `pow(x, y)` 时必须先做 `x > 0.0001`（或 `max(x, 0.0001)`）防护，避免 NaN 黑块。
  - glTF UV 原点在左上角，`GLTFLoader` 加载的贴图默认为 `flipY = false`；运行时手动创建的 `THREE.CanvasTexture` 贴图必须显式设置 `flipY = false`。
  - 使用 `normalizeArchiveScene()` 在运行时对 Blender 导出的卡匣几何做 X 轴归中与 Y 轴落零，不依赖修改 GLB 坐标原点。

### 调试与截图规范
- **截图目录**：调试截图、对比截图与回归检查截图统一保存在与仓库同级的 `../RhineLabUI-screenshots/`（按任务建子目录），测试结束后仅保留必要的对照图。自动化脚本通过 `scripts/test-screenshot-path.mjs` 解析保存路径。
- **抓图脚本注意点**：运行 `node scripts/dev-shot.mjs <url> [out.png] [js] [ms]` 时，注意第 5 个参数若传 `0` 会回落为默认等待 `9000 ms`；需要抓动画中途帧时应传入 `1` 并在 JS 表达式内自行用 `setTimeout` 控制精确时刻。

### 常用验证命令速查

全部命令在 `RhineLabUI/` 根目录运行，完整脚本列表见 [package.json](../package.json)：

| 用途 | 命令 |
| --- | --- |
| 启动本地开发服务 | `npm run dev`（或指定端口 `npm run dev -- --port 5173`） |
| TypeScript 静态类型检查 | `npx tsc --noEmit` |
| 校验并导出 TXT 档案 | `npm run export:archives` |
| 校验档案结构与导出一致性 | `npm run check:content` |
| 构建网页版 + PWA 资源清单 | `npm run build` |
| 打包 Cloudflare Pages 静态发行包 | `npm run build:cloudflare` |
| 校验卡匣与拆解 GLB 结构 | `node scripts/check-shell.mjs`、`node scripts/check-assembly.mjs` |
| 校验入场四阶段与减少动态效果 | `node scripts/check-startup-motion.mjs`（默认访问 `5190`，可用 `REVIEW_URL` 覆盖） |
| 校验循环阵列与可见性 | `node scripts/check-loop.mjs`、`node scripts/check-archive-visibility.mjs` |
| 校验视口适配 | `npm run check:viewport` |
| 校验 PWA 重定向恢复 | `node --test scripts/check-pwa-redirect.mjs` |
