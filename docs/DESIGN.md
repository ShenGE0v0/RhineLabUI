# 设计规范

本文档为 **DEEPDEMOS 档案库** 当前生效的设计与交互规范（唯一设计真相）。资产制作流程与 Blender 参数见 [3D 资产研发](../../design-preview/README.md)，开发与交付约定见 [开发规范与交付流程](AGENTS.md)。

---

## 0. 核心设计语言

1. **纯正无底设计，尽可能简洁（第一原则）**：所有前端浮层、轻提示（`#toast`）、状态标签与模型票数列表均采用彻底的无底排版，直接落在暖纸留白区上方；必须做到**零底色、零渐变散雾底衬、零光晕描边、零边框阴影卡片，以及 `:hover` / `[data-active="true"]` 零背景色填充**。视觉反馈仅通过字重与色彩层级、聚光灯式 `opacity` 衰减及唯一共享的左侧 `2.5px` 炭黑（`#171410`）竖条传递（启用由圆点对称拉长、切换平滑弹性滑动、静置 `3.5s` 从两侧对称收起为小圆点留驻并可重新展开；面板折叠时先收点再随图标同 `cubic-bezier(0.22, 1, 0.36, 1)` 飞升停靠至激活图标正下方，展开时随图标回落再拉伸成长条，取消排序时缩点淡出隐藏）。
2. **排版与留白优先**：信息层级由字号、字距、位置与颜色关系承担，能去掉的线框、徽章和容器一律去掉。
3. **统一动效语言**：3D 展览板卡承担视觉主体，UI 文字不抢镜；`#toast` 入场（`720ms`）与出场（`820ms`）和右上角标题（`#clean-archive-title`）、封面预览、模型票数面板共用 `src/mist-etch-dissolve.ts` 的 8 层微蚀刻 SVG `<mask>` + 光学柔焦位移消融节奏。

---

## 1. 网页端形态定位

项目以单一网页画布形态运行（原 Wallpaper Engine 桌面壁纸端、桌面工作台、旧 2D HUD、系统设置面板及 360° 查看器均已移除）：

| 维度 | 网页端 |
| --- | --- |
| 2D HUD 与侧边栏 | 旧 2D HUD（`.brand`、`.system-nav`、`#archive-ui`、`#detail-ui`、`.powered`、`.system-footer`、`#inspection-marks`、系统设置面板、360° 模型查看器及其滚轮数字/时钟与解密辅助模块）已彻底移除，仅保留 `#three-scene`、`.archive-atmosphere`、左上角模型票数面板 `#model-votes-panel`、右上角非交互的 `.clean-archive-title` 与正下方的 `.clean-archive-cover` 封面预览窗、无障碍播报 `#clean-title-live`、`#pwa-update-notice`（归档态隐藏）、`#modal-root`、`#toast`（[mist-dissolve-toast.ts](../src/mist-dissolve-toast.ts) 驱动的无底微蚀刻通知）与 `#loading`：<ul><li>**左上角 `#model-votes-panel`**：采用彻底的**无底设计**（零卡片/hover/active 背景底色、零描边/投影包裹），图标与字排直接悬浮于暖雾之上（桌面与紧凑屏位于左上角，竖屏停靠左下角）。3D 入场约 `0.6 s` 时直接以**展开状态**按 **`1×6` 单列竖排** 6 块条目（`.model-vote-flyer-inner` 图标略领跑 `0.06`、`.model-vote-info` 信息块与 `.model-votes-bar-meta` 标题各自挂载 `objectBoundingBox` `8` 层微粒对角蚀刻 `<mask>`）配合 `1.2 s` 错峰「微粒蚀刻 + 光雾散焦凝结（`blur` + 高光泛白）+ 微距浮升」从容显现（避免侵占右侧抬起卡匣并完整显示长模型名，模型名与左侧图标垂直居中对齐、模型名后紧凑跟排 `× 4.82(63)` 格式评分与括号票数）；每行支持聚光灯式焦点高亮（非悬停/非激活行 `opacity` 衰减至 `0.56`）、文字右移 `3 px` 与对应浮标图标微放大（`1.08×`），点击任意模型行可将三维阵列按该模型优先重排（精准模型名 → 同厂商作品 → 其他，列序与列内顺序同步前置，触发波浪与首位卡匣重抽，由 [model-votes-indicator.ts](../src/model-votes-indicator.ts) 驱动唯一共享炭黑 `#171410` `2.5px` 竖条：启用从圆点对称拉伸、切换沿纵轴弹性滑动、静置 `3.5s` 自动从两侧收起为静置圆点并随指针交互重展、折叠先原地收点再随图标同 `cubic-bezier(0.22, 1, 0.36, 1)` 飞升停靠于折叠图标正下方、展开回落拉长、再次点击取消排序缩点淡出隐藏）；展开停留 `6.5 s`（悬停/聚焦/弹窗暂停，收拢折叠时重置）后，文字淡出、**同一批图标物理飞移回左上角横向并排收拢（每枚图标清晰可见）**；点击或悬停时图标再次飞移下沉展开；早于 `0.6 s` 打断入场直接收拢；选择条目切入 `detail` 时以 6 块微粒蚀刻+光雾上浮消散（`0.82 s`）退场，返回 `archive` 时按收拢 `6` 图标块（`0.72 s`）溶解回归，减少动态效果跳过溶解、飞移与竖条过渡动画。</li><li>**右上角 `.clean-archive-title` 与 `.clean-archive-cover`**：均在入场过场期间隐藏；待入场选档就绪或被打断后，`.clean-archive-title`、正下方的 `.clean-archive-cover` 与左上角 `#model-votes-panel` 三者共用同一组「`objectBoundingBox` `8` 层微粒蚀刻 + 光雾散焦凝结/泛白 + 微距浮升」动画语言：<ul><li>**首次显现与详情进退场**：开场完毕首次显现（`720 ms`）、进入 `detail` 退场（`820 ms`）及返回 `archive` 回归（`720 ms`）同步运行（标题图标领跑、文字尾随 `0.12`；封面 `.clean-cover-shell` 挂载 `14×9` 微粒 `<mask>`，支持 `hide -> reveal` 中途可逆接续）。</li><li>**总览内切档／悬停切换（`A → B`）**：标题（双层 `.clean-title-layer`）与封面（双画布层 `.clean-cover-frame--out` / `.clean-cover-frame--in`）在 `520 ms`（`MIST_SWITCH_DURATION_MS`）内以更轻盈的 `switch` 档振幅协同交错溶切（旧层 `0–62%` 上浮微粒散焦淡出，新层 `14–100%` 微粒光雾凝结入位；封面前后叠加实时 `<canvas>` 位图且支持 `85 ms` 消抖 / `220 ms` 最大等待的连扫合批与防闪烁保留旧层），数据集重载/布局刷新立即同步，减少动态效果跳过转场动画。</li></ul></li></ul> |
| 详情推进方式 | 恒定 `6.556°` 长焦球面双弹簧推进（共用总览暖色布光与硬件深度景深，不启用 SSAO），背景维持总览阵列表现 |
| 快捷键 | 方向键、滚轮、拖拽、`Enter`/双击打开详情、`Esc` 返回、`/` 检索、手柄 `Home` 收藏弹窗 |

---

## 2. 三维卡匣与几何规格

- **生产源工程**：同级工作区 `design-preview/label-variants/seal-study/seal-on-cassette-layout.blend`。
- **结构特征**：
  - 亚克力透明侧壁（`REF_Acrylic`）+ 薄荷两段框（`REF_FrameMint` / `REF_FrameMintIn`）+ 磨砂玻璃前面板（`REF_Glass`）+ 四角紧固件（`REF_Steel` / `REF_Slot`）+ 单片跨顶边折叠哑光纸封条（`REF_SealTape`）+ 仅保留左右两侧刻度（`REF_Ruler`，已移除底部刻度）。
  - 外包围盒尺寸：`5.004 × 3.7066 × 0.1033`（宽 × 高 × 深）。
- **语义角色映射**（`src/archive-surfaces.ts`）：渲染代码不硬编码建模材质名，而是通过 `surfaceRole()` 映射到 `glass`、`acrylic`、`shell`、`frame`、`card`、`seal`、`fastener`、`engrave` 等语义角色。
- **坐标归中**：Blender 导出模型的几何中心偏移在 X 轴负向（`-7.002..-1.998`），前端加载时统一经 `normalizeArchiveScene()` 在运行时把 X 归中、Y 落至 0。

---

## 3. 阵列排布与入场／换档动效

- **无限循环网格**（`src/archive-loop.ts`）：
  - 逻辑数据严格为 **5 列（分类）× 8 行（`X-001`～`X-040`）**；渲染池为 `LOOP_COLUMNS = 9`、`LOOP_ROWS = 32`，前后左右均无缝循环。
  - **阵列间距**：列距 `COLUMN_SPACING = 5.1`，行距 `ROW_SPACING = 0.28`（`settlingWave` 行向按 `0.28 / 0.43` 缩放以维持约 `21.5°` 坡度）。
- **四阶段总览入场**（`src/scene.ts`，全程约 `3.20 s`）：
  1. `0–0.5 s`（`INTRO_FLAT_HOLD`）：阵列平整停顿，首选卡未抬起，底部长条光置于 `selectedCell.row - 22` 且隐藏。
  2. `0.5 s` 起：右向左单峰入场波（`INTRO_WAVE_START = 9.5`、`SPEED = 13.0`、`WIDTH = 2.2`、`AMPLITUDE = 1.05`）扫过并将阵列渐抬至总览起始阶梯（`1.85 s` 后兜底收敛）；首选卡保持齐平，不进入预选微抬。
  3. `1.35–2.20 s`（`INTRO_LIGHT_START` / `DURATION = 0.85`）：全宽琥珀长条光在 `0.16 s` 内淡入，按三次缓出从左后方滑至目标格。
  4. 到达触发点（约 `1.95 s`）：当目标格直透强度 `directFor(selectedCell) >= 0.35`（`INTRO_FULL_LIFT_THRESHOLD`）时直接从 `0` 解锁完全抬升（`OVERVIEW_LIFT = 0.4`），`3.20 s` 结束。入场期间随时允许进入详情或切档，由当前物理位置无缝接管。
- **切档与切列波浪**：
  - **同列前后切档**：保留卡片平移与抽起动画，冻结当前已有波浪且不触发新波浪。
  - **左右切列**：从视口右侧扫入平滑单峰波（`COLUMN_SWITCH_WAVE_START = 7.4`、`SPEED = 11.5`、`WIDTH = 2.1`、`AMPLITUDE = 0.85`），消除前景斜向密集起伏。
- **手势与惯性**：鼠标与触摸共用自由平面拖动（沿当前相机两条投影轨道还原屏幕位移），松手后保留持续惯性减速，接近静止时吸附到邻近档案位；滚轮与方向键按当前列记忆或相邻位置步进。

---

## 4. 布光、色彩与材质质感

- **唯一主题**：**亮色暖焦糖调**（背景与雾 `OVERVIEW_MIST = #f3eee8`、`WARM` 色板），全站固定同一套色彩，不提供配色切换入口。
- **亮色实景四灯系统**（`src/scene.ts`）：
  - 主聚光灯：`#ffead6`，恒定位于 `(-23, 21, 5)`、强度 `205`，启用软阴影（`PCFShadowMap`、`shadow.radius = 4`）。
  - 天空半球补光（`#fff3e8` / `#b88b68`）与右前掠射补光（`#ffead8`）。
  - 底部长条面光（`RectAreaLight`，`#ffba60`，`36 × 0.29`，`y = -3.35`，`zOffset = 0.12`，强度 `30`）与地面发光条共用连续滑行坐标。
- **长条底光透射联动**（`src/archive-slot-underlight.ts`）：
  - 以临界阻尼连续坐标 `(barRow, barLane)` 驱动 `directFor`（紧支集直透）、`reflectionFor`（同列 `-X` 竖脊约 12–13 格扩散）、`topRailFor` 与 `lateralFor`（邻列顶轨透光）。
  - 选中卡左下正面受光与封条压暗（`installOverviewSealFill`）协同工作，防止出现白牙状过曝高光。
- **统一磨砂质感**：已正式取消「进入详情由磨砂变透明」的解密揭示动画，**总览与详情统一保持磨砂卡匣质感**（选中卡 `glass` 统一 `clearcoat = 0.28`、`clearcoatRoughness = 0.18`）。

---

## 5. 详情推进镜头

详情推进采用恒定长焦球面双弹簧镜头（`src/scene.ts`）：
- **恒定长焦**：标准 `16:9` 横屏下保持总览 `fov ≈ 6.556°` 不变（其他视口比例锁定进入详情瞬间的当前 `fov`，通过求解推进距离使画面构图放大），同时将 `projectionScaleX / Y` 从总览 `0.97 / 1.02` 平滑还原为 `1.0 / 1.0` 消除透视畸变。
- **目标构图**：略偏右侧的 3/4 正面构图（`DETAIL_TARGET_AZIMUTH = 28°`、`DETAIL_TARGET_ELEVATION = 11°`、`DETAIL_FRAME_CENTER_X = 0.42`、`DETAIL_FRAME_CENTER_Y = 0.47`、`DETAIL_FRAME_HEIGHT = 0.72`）。
- **双通道球面弹簧**：
  - `detailCameraAimMove`（速率 `4.5`）：从点击首帧立即跟拍卡高 `aim.y` 与仰角 `elevation`，确保上升过程卡片顶部不被裁切；
  - `detailCameraMove`（速率 `4.3`）：经 `smoothstep` 引导方位角 `azimuth`、距离 `distance`、滚转及投影比例；
  - 拖拽旋转卡片不重算基线，消除相机抖动。

---

## 6. 正面卡面版式与 Code 39 条码

运行时在 `REF_Glass` 完整前面（局部 `x: -2.362..2.362, y: 0.139..3.565`）通过 RGBA 透明 `CanvasTexture`（`flipY = false`；详情特写为 `2048 × 1485` 全尺寸，稳定总览驻留 `0.5×` 即 `1024 × 743` 缓存板，悬停预览为 `1024 × 96`）按 Alpha 混合绘制三区信息，透明留白完整保留磨砂玻璃与底部琥珀透光：

1. **左上抬头区**（`drawOverviewHeading`，预留右侧 `80 px` 防撞印章）：
   - 第一行：中文作品标题（`title`，92 px 加粗单行自适应）；
   - 第二行：生成模型名（`en`，44 px）；
   - 第三行（如识别到厂商）：对应模型厂商 SVG 图标（`public/assets/model-providers/*.svg`）。
   - *注：悬停微抬卡面仅绘制第一行作品标题（`192 px` 高临时画布），不绘制模型与下半区。*
2. **右上刻录印章与条码**（`drawBurnStamp` + `src/code39.ts`）：
   - 展示 `刻录时间：YYYY-MM-DD`（取自档案 `date`）；
   - 下方直接绘制同一日期的标准 **Code 39 条形码**（无独立底色矩形）；抬头受光分界线取左侧标题／模型名／厂商图标底边与右侧条码底边二者较大值以下 `20 px`（且不超过 `py = 386` 展示照片上沿），避免未完全受光过渡期间横穿条码或厂商图标产生截断分色或灰带。
3. **中部展示照片与互动数据区**（`px: 48, py: 386, pw: 1952, ph: 1032`）：
   - 铺至卡面窄边距的无描边全幅展示框：配置 `cover`（或控制台 `rhine.setCardPhoto()`）时按 `object-fit: cover` 居中裁切绘制，未加载/无图时显示暖纸渐变、建筑网格与四角取景框。
   - **照片内统计数据**（`drawShowcaseStats`）：左下显示 `stats.sample`（默认 `"样本不足 · n=1"`），右上显示下载量与评论数（**不包含浏览数**）。有照片时文字与矢量图标均带深色描边与投影，保证浅色画面下的可读性。

---

## 7. 音频规范

- **已移除全部交互音效**：不生成点击、悬停、切档、抽取、归位、弹窗或桌面交互声效。
- **保留背景音乐**：
  - 仅保留「观测室（Observatory）」三轨同步循环背景配乐（[音频说明](../public/audio/README.md)），支持独立音乐开关与音量调节。已移除原 Wallpaper Engine 外部 128-bin 音频频谱律动。
