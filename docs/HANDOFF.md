# RhineLabUI 网页交接

## 2026-11-23 接手基线

本轮更新基于 `dfe10fa`（此前 `0ca0f80` / `7ef405e` 已纳入四阶段入场、GPU 预热、磨砂三区卡面、`src/code39.ts`、图标受光边界修正与暗色主题移除），现已彻底停止并移除 Wallpaper Engine 支持及相关功能（工作台、音频频谱律动与接力小游戏、HUD 视差/屏幕特效/四边距、自定义壁纸与 3D 卸载开关、壁纸构建模式、相关测试脚本与参考/文档文件）。

- 规范与交付流程见 [开发规范与交付流程](AGENTS.md)。
- 现行视觉与交互规格见 [设计规范](DESIGN.md)。
- Blender 源文件与导出说明见本地工作区的 `../../design-preview/README.md`。

### 本地预览

在 `RhineLabUI/` 执行 `npm run dev -- --port 5173`，打开 [普通启动](http://127.0.0.1:5173/) 或 [档案总览直达](http://127.0.0.1:5173/?scene=archive)。验证冷启动入场时使用普通启动入口。

| 范围 | 当前实现与复测入口 |
| --- | --- |
| 卡匣资产 | Blender 源文件为仓库同级 `design-preview/label-variants/seal-study/seal-on-cassette-layout.blend`（1,087,467 B）。独立卡匣与拆解模型均已移除底部刻度，仅保留两侧刻度。[check-shell.mjs](../scripts/check-shell.mjs) 与 [check-assembly.mjs](../scripts/check-assembly.mjs) 用于核验两份 GLB。 |
| 阵列间距与换档 | [archive-loop.ts](../src/archive-loop.ts) 中 `COLUMN_SPACING = 5.1`、`ROW_SPACING = 0.28`。同列前后切档保留平移与抽起动画并冻结旧波浪；左右切列使用从视口右侧扫入的单峰波（[scene.ts](../src/scene.ts)）。 |
| 布光与长条透光 | [scene.ts](../src/scene.ts) 浅色场景以暖色主聚光、半球补光、掠射补光和底部长条面光（`36 × 0.29`，`y = -3.35`，基础强度 `30`）照明，并与地面发光条共用滑行坐标。[archive-slot-underlight.ts](../src/archive-slot-underlight.ts) 计算直透、邻面反射和同排顶轨透光。总览与详情需分别复测布光。 |
| 四阶段入场与零编译预热 | [main.ts](../src/main.ts) 在总览就绪前执行双阶段 GPU 预热（详情直达跳过）。入场全程约 `3.20 s`：平整停顿 `0.5 s` → 右侧入场波与阶梯抬起（取消首选卡微抬预选） → 长条灯于 `1.35 s` 从 `selectedCell.row - 22` 滑入 → 直透强度达 `0.35` 后直接解锁完全抬升；入场中允许直接进入详情（`< 1.35 s` 打断会先复位隐藏灯条防后排闪现）。流畅度优化：[appearance.ts](../src/appearance.ts) 对 `clearcoat` 与 `transmission` 做 `>= 0.000001` 变体保底（消除 `1.95 s` 首帧拉升 `REF_CardPrint` 重编译造成的 ~92 ms 卡顿）；[scene.ts](../src/scene.ts) `warmUpOverview()` 先等待首卡厂商 SVG（`300 ms` 兜底），Pass 1 渲染激活稳态预编译 `overviewLightStrip`、选中卡材质、阴影与 2K 徽章，Pass 2 复位平整第 0 帧并 `fenceSync`；照片在后台解码，并用递增请求编号忽略迟到的旧图片。入场初始化至结束期间，封面、图标和统计变更合并为一次卡面重绘；[main.ts](../src/main.ts) 使用 `1.5 ms` 容差吸收帧间抖动，并累计帧间隔以维持帧率上限、移除无人读取的每秒 `dataset.renderStats` 序列化、重置首帧计时并将 `initPwa()` 延后至 `4500 ms`；[style.css](../src/style.css) 为 `.loading` 补充 `will-change: opacity`。控制台调试入口：`rhine.replayIntro()`、`rhine.stats()`、`rhine.slotLightGain(0 \| 1)`（复测后恢复 `1`）。 |
| 详情镜头与磨砂 | 网页纯净模式（`.web-archive-clean`）隐藏 2D 叠加层并启用 `fixedDetailCamera`：在标准 `16:9` 横屏下维持约 `6.556°` 长焦（其他比例按 `viewSpan` 锁定当前 `fov`），以双弹簧分别跟拍抬升与沿球面推进，最终收敛至 `28° / 11°` 的 3/4 正面构图，总览与详情统一保持磨砂外观。 |
| 卡面与真实档案数据 | [archives.json](../content/archives.json) 的 40 份档案均已匹配 DeepDemos 公开 `cover` 与 `stats`（2026-11-22 快照）。卡面在 `REF_Glass` 前面 `2048×1485` RGBA 画布绘制：左上为标题、模型名与厂商图标，中部为近满幅无描边照片，左下为样本状态、右上为下载与评论数。控制台支持 `rhine.setCardPhoto(url, index?)` 与 `rhine.setCardStats(stats, index?)` 临时覆盖。维护方法见 [档案数据维护](../content/README.md)。 |
| 刻录时间、条码与图标受光边界 | 卡面右上显示 `刻录时间：YYYY-MM-DD`，[code39.ts](../src/code39.ts) 将同一日期绘为标准 Code 39 条码。条码直接绘于卡面且无独立底色；`drawOverviewHeading()` 已将第三行厂商图标高度计入 `headingBottom`，`drawOverviewBadge()` 将受光分界线设为 `Math.min(py - 2, Math.max(headingBottom + 20, BURN_STAMP_TOP + BURN_STAMP_HEIGHT + 20))`（`py = 386`），彻底修复 `X-033`（CS FPS / HY4）等高比例彩色图标在未受光过渡期被拦腰分色截断的问题，同时保留条码 `20 px` 余量且不越过展示照片上沿。 |
| 音频与配乐 | 全部交互音效与 Wallpaper Engine 外部频谱律动已移除，仅保留「观测室」三轨循环背景音乐与独立开关/音量。详见 [音频说明](../public/audio/README.md)。 |

### 资产哈希与截图位置

| 同级 `design-preview/label-variants/seal-study/` 导出 | 网页资产 | 一致 SHA-256 |
| --- | --- | --- |
| `web-export/archive-cassette-latest.glb` | [archive-cassette.glb](../public/assets/archive-cassette.glb) | `3709431D763F8BE1B7975DBA1614B690C6AF41D2D121F2C4E6CE326D2973C830` |
| `web-export/archive-assembly-latest.glb` | [archive-assembly.glb](../public/assets/archive-assembly.glb) | `874C99ADAE547EAB6BB3BD88771FA64127C66A292A17DA13DFFD68AC5DBAF455` |

- 仓库同级 `RhineLabUI-screenshots/` 保存原入场五阶段历史对照截图（`intro-fix/`）、新版四阶段直拉对照截图（`intro-direct-lift/`）、抬头图标受光边界修复对照截图（`heading-edge-fix/`：`X-033-lit.png` / `X-033-unlit.png`）、X-001 封面与统计（`deepdemos-live-data/X-001.png`）、无底部刻度（`no-bottom-ruler/ESP32-3D.png`）和条码过渡帧（`card-burn-transition.png`）等对照截图。
- 手动截图可运行：`node scripts/dev-shot.mjs "http://127.0.0.1:5173/?scene=archive" archive.png`（抓动画中途帧注意第 5 参传 `1`）。自动化回归产物位置：[check-startup-motion.mjs](../scripts/check-startup-motion.mjs) 将报告输出至 `.tools/responsive/startup-<channel>.json`，其余专项回归脚本产物保存在 `verification/<子目录>/` 下。

### 构建与复验记录

- **基线静态校验与网页构建**：`npx tsc --noEmit`、`npm run check:content`（18/18）、`npm run build`（`dist/`）以及 `0ca0f80` 基线 `node scripts/check-shell.mjs` 与两对 GLB SHA-256 核对均已通过。
- **浏览器入场与零编译回归**：[check-startup-motion.mjs](../scripts/check-startup-motion.mjs) 已升级并跑通（覆盖无待选微抬、`1.35 s` 前切档不闪现、底光到达前与直接拉升中途进详情、`reducedMotion` 及 `introProgramLinks === 0` 断言，产物位于 `.tools/responsive/startup-chrome.json`）。
- **改动交接时的冷启动与图标边界实测**：冷启动 `0.50–3.20 s` 入场全程 `0` 次运行时着色器编译、`0` 个 Long Task（`p50 = 5.6 ms`、`p95 = 5.7 ms`）；`X-033`（CS FPS / HY4）定向验证显示受光态正常渲染腾讯蓝（`173` 像素），未受光态通体暖褐、蓝色泄露 `0` 像素。

### 剩余待办与验证顺序

1. **网页端外网封面与场景实机核验**：核验外网 DeepDemos 真实封面加载与总览／详情布光。
2. **代码小项评估与清理**：
   - 对照评估在启用 `fixedDetailCamera` 的场景下全局关闭 `this.ao.enabled = false` 的作用范围是否需要收窄（旧项 `ISOLATED_SPOT_LIGHTS_FRAGMENT` 已确认早已清理）。
   - 按需排查 [check-appearance.mjs](../scripts/check-appearance.mjs) 在 Node 原生 `--experimental-strip-types` 下因 `src/appearance.ts:4` 缺少 `.ts` 后缀引起的模块解析报错（Vite 构建不受影响）。
