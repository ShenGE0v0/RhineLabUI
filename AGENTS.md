# Rhine Lab UI

## 临时测试截图

- 调试截图、子代理测试截图和前后对照统一保存到与项目同级的 `../RhineLabUI-screenshots/`。批量截图按用途放进子目录，测试结束只保留需要的对照。
- 手动截图可用 `node scripts/dev-shot.mjs "http://127.0.0.1:5173/?scene=archive" archive.png`。临时测试脚本通过 `scripts/test-screenshot-path.mjs` 获取保存路径。
- 已归档的验收图、README 配图和正式发布素材沿用各自的目录。

## 当前维护范围

- 用户于 2026-10-05 明确：本仓库后续只维护网页版本，不收录或维护 DSH Desktop 衍生主题、安装工具及其独立发布流程。适用于网页的贡献可单独提取、验证并保留来源署名。

## Cloudflare 托管迁移

- 用户于 2026-09-15 授权将正式网站迁到 Cloudflare Pages，保留 `rhine.lubeiluchen.cc`，并明确授权通过浏览器修改阿里云 DNS。项目名为 `rhine-lab-ui`，沿用正式 main 的原生实现与视觉规范。
- `npm run build:cloudflare` 生成完整静态发行包，校验授权 Novecento 字体并转换缓存规则；字体仍不进入 Git。用户随后授权连接 `LBEILC/RhineLabUI` 的 `main` 自动部署，Pages 输出为 `release/cloudflare/site`；官方项目构建从当前生产网站恢复并校验授权字体。部署与域名记录见 `docs/CLOUDFLARE-DEPLOYMENT.md`。

- 2026-09-11：官网已独立集成 Novecento 开场字体；授权 kit 不进入 Git。正式 Vercel 项目在构建时从当前生产版本恢复并校验字体，首次部署使用本机授权 kit 的静态输出。见 verification/WEBFONT-DEPLOYMENT.md。

## 模型精度对照实验

- 2026-09-12：用户授权高、中、低三档模型精度的性能试验。当前在 `codex/visual-preserving-performance` 保留独立对照页，尚未接入正式画质设置。高档原模型，中档只简化背景螺丝和边框，低档进一步简化背景及近景细节；其余画质、材质与动作一致。
- 模型通过 Blender MCP 生成，脚本 `art/model_precision.py`，源工程 `art/model-precision.blend`。测试与限制见 `verification/MODEL-PRECISION.md`；用户尚未确认中低档最终视觉可接受性。

## 保持视觉效果的性能优化

- 用户于 2026-09-12 授权新建 `codex/visual-preserving-performance`，从壁纸分支基线 `75f7eac` 逐项实现、验证性能优化，保留现有画质与动效。沿用原生实现流程。
- 主场景采用同帧阴影和世界矩阵复用、共享实例缓冲及变化区间上传、静止画面复用、AO 与景深同分辨率时共享打包深度；开场 HUD 缓存框体并从原动作计算投影。降低 AO 分辨率时恢复原景深深度通道。
- 浏览器与实际 Wallpaper Engine 受控测试、视觉精度差异、回归及复现步骤见 `verification/PERFORMANCE.md`。后续添加渲染输入时维护静止复用失效条件，升级 Three.js 时复核共享深度扩展点。

## 开场中央字体

- 2026-09-11：用户要求中央开场文案中适合的位置统一使用 Novecento Sans Wide。访问、身份、请求、处理、授权提示使用 Normal；欢迎三行使用 Bold。后续按用户纠正与原片叠加比较，左上 RHINE LAB 使用 DemiBold，下方两行保留 MiSans。沿用原时间轴与 HUD。
- 用户后续授权从 MyFonts 领取 Normal、DemiBold、Bold 正式 Webfont 并直接替换，本机已领取并接入。public/fonts/novecento 为独立许可资源，排除 Git；有完整字体包时使用原始 WOFF2，其他检出或加载失败保留既有固定图形。来源、再制作与回归见 verification/BOOT-LETTERING.md。网页年度许可不等于已确认创意工坊分发授权，本轮未上传。

## Wallpaper Engine 实验分支

- 用户追加授权音乐律动、手动点击开始且可隐藏入口的波纹接力小游戏，以及入场详情开关。工作台默认短入场，展示模式默认完整；可强制覆盖。工作台内容轻微错峰淡入，减少动态效果时直接显示。
- WE 属性采用原生可折叠分组和条件显示；选中档案支持保持原样、仅音乐时归齐、始终归齐。原生实现继续沿用，不启用前端或动效 Skill。详见 docs/WALLPAPER-ENGINE.md。
- 用户进一步要求登录入场适配多分辨率并移除底部字幕。正常入场背景与三维画布铺满实际视口，中央图形保持比例；只有显式逐帧对照保留固定 1920×1080 舞台。此前“所有开场固定比例”规则由此更新。

- 用户于 2026-09-10 授权新建 `codex/wallpaper-engine`，在本机 Wallpaper Engine 中试用网页壁纸。当前作为独立实验保留，不合并主分支、不上传创意工坊。
- 沿用现有原生实现和视觉规范；`npm run build:wallpaper` 输出 `release/wallpaper`，网页正式构建保持原流程。
- 壁纸资源全部本地打包，关闭 PWA，自动启动，接入宿主设置、帧率和暂停通知。使用说明与实际验证见 `docs/WALLPAPER-ENGINE.md`。

- 用户明确要求：以目录内视频 5–40 秒为视觉与动效参考，尽量逐像素还原；不使用前端 Skill，由代理选择技术栈。
- 本项目采用参考视频逐帧分析与原生实现流程，不启用主前端设计或动效 Skill。
- 美术资源必须通过 Blender MCP 制作，保留源文件与可复现脚本。
- 技术栈：TypeScript、Three.js、Vite。1920×1080 为布局基准，等比例适应窗口。
- 视觉与时间轴规范见 DESIGN.md。视频仅用于参考与验证，不能作为产品交互背景。

## 阵列拖动与持续惯性

- 用户要求悬停轻抬，拖动浏览阵列，鼠标滚轮切换列内档案；鼠标与触摸共用原生输入逻辑。
- 用户进一步明确需要类似网页快速滑动的持续惯性：快拖与慢拖按实际松手速度产生不同滑行距离，不能采用固定最多两列／三档的追加距离。松手后持续减速，档案随经过的位置依次切换，接近停止时才吸附；再次按住从当前画面接管。
- 用户最新明确选择自由平面拖动：用当前相机的两条投影轨道共同还原屏幕位移，取消横竖快捷手势和斜向锁轴。一次拖动可随时转弯或反向，两个轨道共同衰减并最终吸附。拖动按实际物理位置选择档案并更新列内记忆；键盘和按钮切列继续恢复该列记忆。
- 已确认的波浪、竖直抽取、归位、列内记忆与循环规则继续沿用。实现与验证见 `verification/ARRAY-INPUT.md`。

## 详情与弹窗过渡

- 详情退出约 180ms，快速返回再进入从当前透明度接续；背景遮罩随实际镜头进度变化。抽取、转正、归位与波浪继续沿用已确认的三维规则。
- 检索、收藏和设置弹窗进入约 300ms、退出约 200ms。退出期间保留节点与背景输入隔离，结束后恢复焦点，再执行选档或重播。
- 详情页签使用 150ms 内容淡入与 180ms 下划线移动；收藏仅更新按钮状态、总数和反馈，保留正文节点、页签及滚动位置。减少动态效果时直接切换。验证见 `verification/UI-TRANSITIONS.md`。

## 标注修订约束

- 用户标注对应原片约 27.60、29.16、31.56 秒；相机校准同时检查端面厚度、空隙和前后排边界。
- 同一档案从阵列升起并进入特写时，仅允许竖直升降，不能把模型向前或横向平移来重新构图；靠近与转向由摄像机完成。初始整组阵列入场及切换档案的轨道移动不属于抽取动作。
- 背景卡片不能随特写进度额外下沉来让出画面。
- 交互模式左右切换五类档案列，上下切换同一列的前后档案；每列至少 8 份可读档案。切列保留该列的选择记忆。
- 预览时卡片抬起 0.4；交互详情升至 4.05（原片时间轴仍为 3.35），只比早先略高，必须保留后方阵列的可见层次。镜头负责左侧构图，右侧展示信息。
- 卡片获得净空后才允许拖拽旋转；收回时保持高度先转正，再下降。被换选的旧卡片也遵守此顺序。
- 阵列与抽出卡片的材质、内部细节必须连续过渡，快速切回正在归位的卡片时保留当前升降状态。
- 标签复用主界面的同一份莱茵生命标志，不使用另画的简笔版本。

## 独立模型查看器

- 用户要求在详情页增加 360° 模型查看、方向键平移、滚轮缩放、拆解和一键重组，先提供可体验的版本。
- 独立查看器沿用既有视觉规范与原生实现流程；部件模型通过 Blender MCP 制作，保留源文件与生成脚本，见 DESIGN.md。
- 阵列中的抽取与归位继续遵守上文约束。独立查看器在自己的场景内旋转观察与分层拆解，关闭后回到原档案。

## 循环档案阵列

- 用户确认：主界面的档案阵列上下切档案、左右切列均可持续循环，画面不出现队列尽头。
- 五类档案、每类八份的内容顺序循环复用；跨首尾仍沿按键方向移动到相邻位置，切列保留该列的档案选择记忆。
- 使用固定的可见窗口与外围卡片补位。归位副本按实际循环位置区分，保留快速重新选中时的运动状态。
- 原片参考时间轴继续使用原来的五列、160 个位置；循环只用于交互阵列。相关实现与验证见 DESIGN.md、verification/LOOPING-ARCHIVE.md。

## 当前动效选择与光影微调

- 用户试用后明确选择原始基线 aeddd8f：选中抬起和波浪同时开始，恢复原有负向波谷与 4.2 阻尼速率。此前去波谷、先抬起后波浪及源点静止方案只保留为对照实验，不用于主界面。
- 用户对比后选择恢复整体基线的颜色与光照。生产场景及独立查看器默认采用 baseline 配置；光影微调只保留为对照实验。见 DESIGN.md。
- 档案序号和列编号使用 Rolling Number，保留两位数；X-001 形式的档案编号与悬停提示使用三位数滚动，X- 前缀固定。连续输入延续当前运动，减少动态效果设置关闭滚动。

## 标题与查看器过渡

- 主界面随选档变化的顶部分类、底部列名、悬停标题与权限标签统一复用主标题的文字滚动。相同内容不重复播放，悬停首次出现直接显示；跨列刻度复用固定八个按钮，保留连续伸缩和各列选档记忆。见 `verification/ROLLING-TITLE.md`。
- 用户最新选择：主档案标题改为类似数字的滚动文字，替代此前快切黑条。直接复用已有库的 `createRollingText`，与编号共享 460ms 时长；使用 direct 模式、各字同时启动、轻微模糊与宽度过渡。文字固定向上滚动，快速输入衔接最新目标；进入详情或减少动态效果时直接显示最终标题。见 `verification/ROLLING-TITLE.md`。
- 360° 独立查看器增加进出过渡。进入约 320ms 淡入，模型载入后约 380ms 轻微展开；退出约 220ms 淡出。退出结束前保留模型与模态焦点，结束后释放并返回原按钮；进入中途按 Esc 可衔接退出。

## 前段 2D 动效逐帧修订

- 用户明确范围：黑底的鹰角网络片头不做，直接从画面变白开始。正常启动和重播从原片 6.76 秒进入；本地对照保持原片时间码。
- 继续使用逐帧分析和原生 DOM/SVG 实现，不启用前端或动效 Skill。2D 时间轴见 `src/boot-motion.ts`，渲染见 `src/boot.ts`；规范与复核见 `verification/BOOT-MOTION.md`。
- 已认可的三维交互、基线颜色和档案阵列时间轴继续沿用。启动标志沿共享标志的同一组贝塞尔曲线连续绘制，缺口通过路径首尾控制，保留与档案标签一致的轮廓。
- 用户进一步要求按原片逐帧修订非线性运动。左上三行分别在 278、280、282 帧滑入，各自加速后减速；圆环半径、弧端、内环与橙点使用独立轨迹，名称黑底快速扫过后长尾收束。测量轨迹见 `src/boot-tracks.ts`；局部放大对照及限制见 `verification/BOOT-MOTION.md`。
- 用户进一步强调两侧小圆主要绕自身圆心旋转并补全弧段；仅保留原片测得的轻微位置收拢。中央大点闪变后缩小，六颗小点错峰绕行。Logo 以连续笔画首尾及移动缺口表现运动，不能替换成整枚标志闪烁；加号与方点同帧展开，方点随后拉成减号。见 `src/boot-orbit-tracks.ts`、`src/boot-logo-tracks.ts`。

## 品牌文字与 360° 导航过渡

- 用户要求放大并叠加原片，校准左上角三行文字。保留 MiSans，三行约 270px 宽；中间一行使用 600 字重，ANALYSIS 按原片字母位置分别校准间隔，OS 右对齐。具体尺寸见 DESIGN.md，叠加页为 `reference/brand-review.html`。
- 360° 查看器的平移、滚轮及加减键缩放均平滑跟随；复位约 560ms，按球面短路径返回。复位过程中输入从当前显示位置接管；减少动态效果时直接到位。仅用于独立查看器。
## 声音实现

- 用户要求依据原视频与莱茵生命相关设定重设计音效和背景音乐。本次实现采用原创三轨循环配乐和 Web Audio 音效，详见 `verification/AUDIO-DESIGN.md`。
- 音效与音乐独立开关、独立音量；保留旧静音偏好。启动声音沿用原片时间码，跳帧不补播；三轨在切场景时连续播放并改变比例。
- 听感尚待用户试听，技术验证不视为用户已经确认声音方向。源谱与音色生成脚本必须保留。
- 用户进一步指定玻璃交互应采用清脆音色。当前音效使用薄玻璃轻碰与短共鸣，切档、抽取、归位及拆组有不同的衰减；保留快速输入时的叠音限制。用户尚未确认本版最终听感。
- 用户明确要求复刻原视频已有的逐字输入音效。输入现在使用三个原片短音（各 38ms），保留来源记录；其他卡片交互沿用玻璃音色。输入节奏跟随真实文字揭示，不把故障闪动恢复当作新输入。
- 用户接受档案切换使用玻璃声，并要求检查 OS 页面打开、Logo 与文字出现的声音。窗口开合、系统操作、启动标志、整块文字及验证反馈采用独立电子音色；玻璃声用于档案实体运动。完整开场试听见 `reference/boot-audio.html`，只临时开启声音，结束后恢复偏好。具体音色尚待用户试听。

## 档案内容维护

- 档案内容独立保存在 `content/archives.json`，页面和 TXT 导出共用；修改步骤见 `content/README.md`。保留五列、每列八份和稳定编号约束，构建前校验；内容按纯文本显示。

## 正式功能提交与同步

- 用户授权：非实验性质的正式功能完成相关验证后，直接提交并合并到主分支，或提交后同步到对应远程分支，无需再次询问。
- 当前已经位于主分支时，可直接提交并推送；在功能分支上则按项目分支状态完成合并与同步。
- 提交应聚焦当前任务；同一工作区中尚在进行或等待用户确认的其他工作，保留原状，不混入正式功能提交。

## 解密与清晰内构

- 用户要求参考原片 41 秒正面与 46–51 秒多角度制作内部结构，并省略左侧三根高塔。模型继续通过 Blender MCP 生成，保留共享脚本与源文件。
- 详情打开后由磨砂变清晰，解密线按原片 34–39 秒沿同一物理对角线合拢、保持、向中央收束，采用非线性运动。交互压缩时间，原片对照使用原时间码。
- 360° 查看器可切换清晰／磨砂，切换不改变视角或拆解状态；返回详情保持解密，退回阵列恢复磨砂。
- 长焦主场景近裁剪面为 5，以避免薄层内构深度冲突；保持原镜头和构图。验证见 verification/DECRYPTION.md。

## 内部模型的锐利截面（历史方案，已撤回）

- 用户要求内部环形模型更锐利，采用半透明磨砂质感，并打磨两环的连接处。内构沿圆周平滑，屋面、侧壁和切边之间保留硬法线；不再用多层圆角制造体积。
- 两环通过一条切向接入、两端略展宽的连续薄片连接；内部仍完全容纳在盖板与基板之间。外壳几何与法线保持原样。
- 源脚本为 art/internal_architecture.py；打磨前后与装配状态对照为 reference/internal-review.html，验证见 verification/INTERNAL-OPTICS.md。

## 外壳结构与磨砂揭示

- 用户要求黄色方块位于顶边并与外壳齐平，去掉左侧黄色竖条；螺丝仅保留右上与左下两处。
- 外框刻线与螺丝周围的压槽全部置于盖板后。解密前整面磨砂，原片 38.84–39.56 秒由顶部向底部逐渐变清晰；上下半清晰差异只出现在移动过程，不能保留固定高度的清晰渐变。
- 外壳细节通过 Blender MCP 制作，共用 art/shell_reference_details.py。新外壳保持既有内构顶点及法线，验证与对照见 verification/SHELL-REFINEMENT.md。

## 第一版内构恢复与轻磨砂

- 用户明确选择对照页左侧的第一版完整内构，来源为 89c7742 与 reference/internal-study/assembly-before.glb。恢复其两环截面、双连接带、平滑法线和原始白色／橙色材质；此前锐利截面、单连接片和追加内圈细节均已撤回。
- 通过 Blender MCP 重新生成单体与拆解资产，保留 art/internal_architecture.py 和两个 .blend 源场景。已修订的外壳继续使用 art/shell_reference_details.py。
- 选中盖板粗糙度为 0.42，并将折射模糊范围限制在投影盖板高度的约 1.6%，避免小尺寸预览过度模糊。自上而下揭示、阵列参数和完全清晰端点继续沿用。
- 原始内构与当前内构对照见 reference/internal-review.html；验证见 verification/RING-TEXTURE.md。

- 用户查看恢复后的版本与磨砂修正后反馈‘效果很不错’，确认保留本版。

## 屏幕比例与触摸适配

- 用户授权按桌面不同比例、手机横屏、竖屏构图与触摸、实机性能校准的顺序完成适配；实机目标为 iPhone / Safari。继续采用本项目原生实现流程，不启用前端或动效 Skill。
- 逐帧对照保留 1920×1080 舞台，完整等比展示；用户于 2026-09-10 追加要求正常登录入场铺满实际视口并移除字幕。交互阶段按实际视口布局。16:9 为视觉基准，桌面延展阵列，竖屏上方模型、下方独立滚动正文。
- 镜头适配不能改变抽取高度、模型横向/纵深坐标、波浪、归位规则与基线材质。竖屏预览镜头也不能跟随卡片实时升降或轨道位置抵消运动。
- 触摸在阵列区域左右切列、上下切档；详情获得净空后可单指检查，360° 查看器单指旋转、双指缩放和平移。正文滚动与场景手势隔离，旋转屏幕保留当前选档、视角与拆解状态。
- 画质仍采用已有用户设置与原始默认值；不得以手机类型直接切到删减光影的性能档。实机校准必须区分真实 iPhone 数据、桌面 WebKit 兼容性检查与 Chromium 视口模拟。实现见 `src/viewport-layout.ts`、`src/responsive.css`，验证见 `verification/RESPONSIVE.md`。

## PWA 与线上入口

- 用户要求增加 PWA，以便 iPhone 从主屏幕进入独立窗口；沿用现有 Vercel 项目与正式域名 https://rhine.lubeiluchen.cc/，README 保留在线入口。
- 正式构建缓存完整资源版本，更新下载失败时保留旧版。新版本准备好后由用户在设置中更新并重启，不中断当前浏览；保留收藏和偏好。
- 开发模式不注册 Service Worker。图标复用项目共享品牌路径；主屏幕安装、离线与更新说明见 `docs/PWA.md`，验证见 `verification/RESPONSIVE.md`。
- 针对 Win11 Chrome / Edge 的反馈，设置图标保留可见“设置”文字，新版本提供可直接点击的更新入口；`update.html` 从网络获取，用于旧版页面无法找到更新按钮时恢复，不清除收藏或偏好。
- 动态效果首次进入跟随系统“减少动态效果”偏好，设置中明确说明跳过开机和简化选档的影响，并提供“启用完整动效并重播”。本站保存的完整、减少、自定义选择优先于默认值，正文解密遮罩遵循对应的独立设置。验证见 `verification/STARTUP-LOADING.md`。

## 字体分包与开场启动（issue #6、#7）

- 用户于 2026-09-10 明确批准：比较 `misans` 与 `misans-webfont` 第三方分包，在确认加载收益和显示效果后替换官方整包。本项目允许采用第三方 MiSans 分包，此明确授权覆盖此前禁止第三方分包的全局默认；保留字体署名、许可、来源和固定版本记录。
- 分包随项目同源部署，按页面字符加载；保持现有 MiSans 的字形、字重映射与排版。PWA 仍缓存完整版本，避免新档案或离线检索缺字。
- 比较后采用 `misans-webfont@4.3.1`，字体 4.003；固定版本与源哈希保存在 public/fonts。品牌三行宽度按基线重新校准，首次入口字体约 415 KiB。选择依据、完整离线体积取舍与验证见 `verification/STARTUP-LOADING.md`。
- 开场等待用户点击、轻触或键盘启动，解锁声音并完成准备后统一开始音画；保留静音和减少动态效果偏好，加载失败提供重试与无声进入。
- 用户授权完成验证、提交及同步后，回复 GitHub issue #6、#7 并关闭它们。

## 桌面工作台（实验）

- 用户于 2026-09-10 批准在同一壁纸中切换档案展示与实用工作台，首版为时间日期、三条今日事项、重要日程倒计时、系统媒体信息与专注计时。沿用既有原生实现、视觉和 Blender 资产。
- 模式与事项内容、日期、计时时长从 Wallpaper Engine 属性读取。事项完成状态每日重置，专注计时按绝对截止时间恢复；这些进度独立存储，不受宿主声音与画质覆盖。
- 用户提出把玻璃档案交互用于真实文件夹。本次仅评估可行性，尚未授权安装本地桥接服务；研究见 docs/DESKTOP-FOLDERS.md。
- 用户于 2026-09-10 要求工作台严格沿用原主页设计，撤回首版绿色强调色与有底色的面板。采用原主页近黑／暖灰、细线与竖线刻度，规范见 DESIGN.md。

## 工作台显示内容与纯净效果

- 用户于 2026-09-10 决定将纯净效果与工作台合并，通过按需隐藏元素配置画面，不另建纯净模式。
- 七项显示开关全部位于 Wallpaper Engine 壁纸属性：时钟日期、今日事项、右侧功能内容、底部功能导航、品牌文字、页脚信息、设置入口。默认全部显示，仅影响工作台交互阶段；开场与档案展示沿用原样。
- 用户明确允许隐藏设置入口，恢复通过 WE 属性完成。壁纸内不提供另一套临时显示开关。隐藏内容不清除任务状态或停止专注计时。
- 音乐频谱、自动演出和小游戏仍为讨论中的后续方向，本次显示配置不代表已实现这些效果。

## 明暗配色（壁纸实验）

- 设置及 Wallpaper Engine「入场与画面」分组提供亮色／暗色，默认亮色。暗色采用石墨背景、烟灰玻璃、暖白文字与琥珀标记，沿用原生实现。
- 切换时以当前档案为起点，沿行列依次改变卡片材质；背景与文字同步渐变。中途反向从当前颜色接续，减少动态效果时直接到位。
- 详情解密后盖板恢复清透，内部结构保持可读；查看器、工作台与开场共同使用配色。实现与验证见 verification/THEME.md。

- 用户要求静止呼吸可独立开关，且「始终归齐」也可生效。WE 工作台显示分组新增该开关，默认开启；音乐时淡出、静音后恢复。用户认为现有音乐律动杂乱，已提出鼓点主导宽波的后续方案，当前未替换音乐算法。

- 用户批准原版、鼓点宽波和整组轻抬三种音乐律动并列试用；WE 属性中选择，默认保留原版，尚未决定最终方案。原有呼吸开关继续独立生效。

## 自适应阵列与暗色雾气

- 用户要求解决边角露出阵列尽头，并将屏幕外档案裁剪、按屏幕覆盖范围动态决定数量作为同一任务。
- 交互阵列按当前实际镜头与视口计算候选范围，逐实例裁剪并紧凑提交；替代固定 9 列 × 32 行的交互窗口。显式原片对照继续保持原来的 160 个位置。
- WE「入场与画面」提供自动标准余量／自动额外余量，默认标准。余量包括边缘预留、卡片完整高度和附近阴影贡献；相同宽高比与构图不因像素数量增加而复制更多档案。
- 暗色采用可见灰雾，并加强顶部、底部和边缘淡出。连续循环、点击、抽取、归位与原片对照回归见 verification/ARRAY-COVERAGE.md。

## 工作台衔接与连续频谱修订

- 用户要求删除媒体无进度与本机时区说明，修复暗色刻度、重播悬停和接力退出与设置的重叠。工作台开场隐藏选档标签，Powered 淡出；工作台与档案展示均保留退场过渡。
- 用户比较后保留原版律动为默认，撤回鼓点 A 与整组轻抬 B。重做 A 为按屏幕从左低频、中间中频到右高频的持续频谱，B 为持续层叠流波，两者均响应持续音乐。新 A/B 待试用。
- 正常开场同样动态覆盖实际视口，只有显式逐帧对照保留 160 个档案位置。实现与复核见 verification/WORKBENCH-REVISION.md。

- 媒体信息各通道独立更新：不能在歌曲文字回调中删除封面或进度。保留先封面后文字、同封面切曲与播放器切换；只有相应通道的显式空值替换旧状态。见 verification/WORKBENCH-REVISION.md。

- 用户进一步要求游戏模式进出也有过渡：工作台淡出、游戏信息进入，退出反向衔接；快速打断延续当前状态，退场期间保持输入隔离，完成后恢复焦点，减少动态效果直接切换。

## UI 视差与画面质感（壁纸实验）

用户明确要求仅 UI 产生 HUD 曲面视差，壁纸三维镜头不随被动鼠标移动。按参考项目的镜头畸变思路，UI 各区域以共同径向曲面投影到不同梯形；独立「鼠标追踪」关闭后保留静态形状。WE「HUD 与画面质感」提供曲面纵深、全局屏幕效果、局部界面磨砂底，三项默认关闭，强度可调。

用户追加明确：色散、暗角与颗粒处理最终全局合成，覆盖 UI、三维画面和弹窗，替代此前仅三维画布的 ShaderPass。颗粒增加尺寸控制；减少动态效果时冻结颗粒并停止鼠标追踪，静态曲面仍可保留。开场无 UI 视差，全局屏幕效果同样可见。磨砂底随 UI 投影。继续原生实现，见 verification/VISUAL-EFFECTS.md。

用户追加要求 UI 上、下、左、右四边距分别使用滑杆，并纠正为允许负数。WE「界面边距」提供四个 −300～300px 的独立偏移，默认 0；正值内收，负值外扩，抵消舞台缩放。仅调整交互 UI 布局，三维画布保持铺满；支持曲面与磨砂。实现与验证见 verification/UI-INSETS.md。


2026-09-10 修订：曲面纵深、细颗粒、颗粒尺寸、边缘色散、暗角的默认数值统一为 20。下边距不再缩短桌面工作台的中部定位容器；底部导航和页脚先上移，实际接近中部内容时才推动对应内容，上方品牌限制继续上移，空间不足时内容独立滚动。手机窄屏继续采用原有纵向滚动布局。

WE 新增「工作台 · 可用功能」，时间日期、今日事项、重要日程、正在播放、专注计时各自可开关，默认全开。关闭功能同时移除其右侧内容入口和底部按钮；当前项关闭时选择首个仍开启功能，全关时隐藏右侧内容和导航。左侧时钟与事项仍由原显示开关控制，任务和计时状态保留。用户明确要求自行验证，本轮仅完成实现和构建打包，未进行运行时与视觉验收。


2026-09-10 后续修正（覆盖上述中部避让方案）：用户明确下边距只移动底部两排，排间距固定，中部组件不压缩、不滚动。已删除 workbench-insets 自动避让；工作台高度不再随下边距变化。底部导航、游戏入口与页脚在曲面投影之后使用相同 translate 偏移。另修复 :is 内 ID 提高优先级导致原规则覆盖，以及减少动态效果的隐式 all 过渡污染曲面测量的问题。Edge 实际页面完成 1920×1080、2560×1440、1600×900，曲面 0/20/80，下边距 60/192/300/−80/0，共 45 组检查：中部坐标及尺寸固定，无新增 overflow，底部各行位移一致。画面对照与数据见 verification/ui-insets/。

WE「入场与画面」新增暗色专用开关「暗色模式仅选中档案标签使用强调色」，默认关闭保留现有选择。开启后阵列与归位档案的顶边标签使用暗色，当前选中档案保留琥珀强调；浅色不受影响。通过既有材质 uniform 实现，无新增网格与绘制通道，暗色开/关及浅色截图已检查。


## 超级性能模式与自定义画质

用户于 2026-09-10 要求低配壁纸模式与减少动态效果独立，并恢复 WE 原生自定义画质。新增「超级性能模式（保留动态效果）」开关，默认关闭；开启时以独立的有效画质覆盖已保存画质，不改减少动态效果、宿主帧率或音乐律动设置，关闭恢复当前预设／自定义配置。

超级模式：三维比例 60%、DPR 上限 1、总像素不超过 921600；关闭阵列阴影、AO、景深和 SMAA，直接输出主场景；背景阵列使用无折射、无清漆材质并隐藏小螺丝，选中／详情模型保留完整结构和低分辨率折射。全局屏幕滤镜暂时停用，文字磨砂改为无模糊底色，HUD 曲面与追踪继续运行。DOM 文字不降低分辨率。

WE 画质下拉增加「自定义」，仅此选择且超级模式关闭时显示九项控制：渲染比例、像素密度、抗锯齿、阴影、AO 采样、AO 分辨率、景深、透明材质分辨率、纹理过滤。连续参数用滑杆，离散参数用原生下拉。部分宿主回调保留其他参数；超级模式开启期间保留自定义更新，关闭恢复最新配置。完整证据见 verification/SUPER-PERFORMANCE.md。

## 三维资源开关与自定义壁纸

- 用户于 2026-09-10 授权在左下 SESSION 右侧增加 3D 开关：档案错峰下落退场后实际释放全部三维场景、查看器和 WebGL 资源；再次开启重新加载并从下方逆向升起，保留选档。关闭途中可反向恢复，减少动态效果时直接切换。
- 3D 退场、关闭与载入期间隐藏游戏入口及模型专用入口；重新开启按原显示偏好恢复。2D 工作台和正文继续可用。
- WE「入场与画面」增加可选自定义壁纸，默认不启用；用户选图后，仅在三维资源释放后淡入。重新载入成功时图片淡出，失败保持图片并允许重试。沿用原生实现，见 verification/THREE-RELEASE.md。
- 用户明确保留三种音乐律动并列选择：原版、连续频谱、层叠流波。原版仍为默认，不再标为待定 A/B。
- 修复壁纸自身交互声音触发音乐归齐：静音状态抑制本地音效引起的新频谱活动，已建立的音乐继续响应。全部归齐时取消标签强调，暗色仅选中强调随实际升降连续过渡，见 verification/SELECTION-STATE.md。

## 创意工坊发布准备

- 用户于 2026-09-10 曾授权发布，随后明确改为自行操作发布，代理负责 GIF 和操作说明；当前尚未上传。
- 正式名称为 Rhine Lab · 莱茵生命交互桌面，去掉“本地测试”。独立正式工程放在 Wallpaper Engine 的 myprojects/rhine-lab-workshop，保留之前本地试用工程。
- 预览参照用户指定的 3088099655 预览的全景／局部剪辑方法，素材全部来自本工程工作台实际运行画面。最终 GIF 256×256、13.2 秒，含时钟事项、专注与明暗切换；没有将参考壁纸的图片放入发行包。
- 发布操作和后续更新须保留 workshopid，见 docs/WORKSHOP-PUBLISH.md；预览来源与验证见 verification/WORKSHOP-PREVIEW.md。

- 用户要求增加「启动时加载 3D」WE 属性，默认开启；关闭时只播放前段 2D 入场并进入组件页，不创建三维场景，左下可手动加载。属性下次加载生效。自定义图片在 2D 开场后显示，支持 WE 编码盘符和失败后同路径重试。见 docs/WALLPAPER-ENGINE.md。

- 用户要求自定义壁纸上下遮罩范围可调：WE 图片设置下新增 0–100 滑杆，默认 100，0 完全关闭遮罩；仅自定义图片显示时生效，沿用原生实现。见 docs/WALLPAPER-ENGINE.md。

- 用户要求改善无遮罩图片背景下浅色页脚按钮的对比，并将既有滚动库应用到时钟、播放器时间及切歌文字。使用原生实现与现有 createRollingText，460ms direct，媒体原位更新，减少动态效果直接显示。见 docs/WALLPAPER-ENGINE.md。

- 用户撤回额外白底的可读性方案：删除页脚新增底色与外扩阴影，仅调整底部导航、待办、提示及按钮的文字颜色；原玻璃背景和模糊参数保留。

## 壁纸功能回合主分支（2026-09-11）

用户明确授权评估兼容性后更新 main，覆盖此前不合并主分支的实验限制。共用暗色主题、自适应阵列、开场铺屏、滚动数字修复与资源管理进入网页；超级性能模式适配为网页持久化设置，默认关闭，独立于减少动态效果。工作台、系统音频／媒体、HUD 属性、自定义图片与 3D 卸载入口仍仅在 wallpaper 构建启用。普通网页保留启动声音解锁、键盘与触摸、PWA 和自定义画质。继续沿用原生实现流程。验证见 verification/WEB-INTEGRATION.md。

- 2026-09-11：用户要求开启 HUD 时开场同样应用曲面与鼠标追踪，覆盖此前开场无 UI 视差的限制。Logo、验证文字、圆环和欢迎画面按当帧原始动作叠加投影，品牌与 Powered 共用同一曲面；切换阶段保留深度与指针跟随状态。磨砂底仍仅交互阶段启用。见 verification/BOOT-HUD.md。

## 删除开场动画（2026-11-15）

- 用户要求删除开场动画。网页与壁纸构建现在都直接进入档案阵列：2D 逐帧开场、三维入场的校准镜头、开场音效与逐字输入音、开场动效开关、重播入口一并移除。
- 删除 `src/boot*.ts`、`boot-lettering*`、`typing-rhythm.ts`、`typing-samples.ts`、`wallpaper-opening.ts`；`scene.ts` 不再接受 cinematic 开场镜头参数，`viewport-layout.ts` 不再提供 opening 舞台；`mode` 只剩 archive 与 detail。
- 入口点击只用于解锁声音，不再等待开场。WE 属性移除「启动时播放开场」和「入场时展示档案详情」，`load3donstartup` 保留。
- Novecento 开场字体只服务于开场文案，已随 `scripts/prepare-webfonts.mjs`、`__RHINE_NOVECENTO__` 与部署脚本中的字体校验一并移除；`public/fonts/novecento` 不再参与构建。
- 开场专用的审阅页与校验脚本同步删除（`reference/boot-*`、`opening-layout-review`、`hud-performance`、`audio-check`、`check-boot-hud`、`check-startup-*`）。`verification/BOOT-*.md` 保留为历史记录。
- 本次以 `tsc`、`npm run build`、`npm run build:wallpaper` 与离线校验脚本验证；未做浏览器视觉验收。

### 子代理审查后的修正（同日）

- 阻断问题：删除 `[data-boot="…"] .three-scene / .scene-atmosphere { opacity: 1 }` 后，基础规则里的 `opacity: 0` 再无对手，三维阵列整体不可见。已把 `.three-scene` 与 `.scene-atmosphere` 的基础不透明度改为 1，并去掉不再需要的淡入过渡。
- 启动后不再有入场推进镜头：`completeStartup` 在 `setMode` 之后调用 `scene.revealImmediately()`，阵列直接呈现且立即可交互。
- 继续清理开场遗留：`scene.ts` 移除 `scanTime`／`scanBlend`、`setMode("hidden")`、`looping` 与固定 160 格分支；`motion.ts` 移除 `archiveWave`、`extraction`、`cinematicField`；`InspectionOverlay` 移除永久为 false 的 `showLabel` 与 `#inspection-text`；`main.ts` 移除 `data-action="skip"` 分支。
- 同步修正因此失效的校验脚本：`check-motion`、`check-archive`、`check-motion-preferences`、`check-startup-motion`、`check-visual-effects`、`check-performance`、`build-performance`、`capture-readme`，并更新 `docs/media/capture.json`。
- 删除开场对照页 `reference/review.html`；`reference/decryption-review.html` 改为指向 `/?scene=detail`，不再按原片时间码驱动实时场景。删除打字音效资源与说明、`scripts/make-boot-lettering.py`、`scripts/check-hud-performance.mjs`。
- 复验：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check:viewport`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-archive` 全部通过；构建产物 CSS 已确认 `.three-scene{opacity:1}`。
- 遗留（不影响运行）：若干壁纸校验脚本仍传已移除的 `boot` 属性，宿主会忽略未知属性；`verification/`、`docs/`、`README.md` 中描述开场的段落保留为历史记录，未逐条改写。

## 帧率治理（2026-11-15）

- 用户反馈笔记本上 GPU 3D 占用 94%、75 °C，要求做性能优化。根因是渲染循环没有上限：`requestAnimationFrame` 跟随屏幕刷新率，144/165 Hz 屏会按刷新率跑满整套后处理链（阴影 + 折射 + 美颜 + AO 法线/AO/模糊 + 景深 + SMAA 三趟 + 输出，约 10 趟全分辨率）。
- `RenderQuality` 新增 `frameRate`（0 表示不限制）。预设默认：性能 30，原始／高／极高 60。设置 → 精细设置新增「帧率上限」下拉（30 / 60 / 120 / 不限制）。
- `main.ts` 的渲染循环改为时间累加器跳帧：未到目标间隔时整帧跳过，不提交任何 GPU 工作。阵列进入静止呼吸状态（`scene.idleAmount > 0.6`）时自动降到 30 fps；指针悬停、拖动、选档、打开查看器都会立即恢复满帧。`setHover` 现在也刷新 `lastInteraction`，避免悬停抬升动画被降帧。
- 画质摘要显示当前实际帧率，便于现场确认。
- 未改动任何画质默认值（渲染比例、像素密度、AO 采样、景深、透射分辨率、阴影分辨率保持原样）。如需进一步降低占用，下一档是 AO 分辨率 0.75 与透明材质分辨率 50%，两者都在设置里可调。
- 联网查证结论（Three.js r183）：`EffectComposer` 所有 pass 默认按 drawingBuffer 全分辨率、RGBA16F 运行；AO 与景深是最大头，半分辨率视觉损失最小；`renderer.transmissionResolutionScale` 官方文档明确「降低可显著提升 transmission 性能」；`shadowMap.autoUpdate` 本项目已设为 false。参考 MDN requestAnimationFrame、Three.js WebGLRenderer / LightShadow / BufferAttribute 文档与 PR #30018。

### 零像素代价的进一步优化（同日）

- 用户要求「保证视觉效果的最大优化」，即只做不改变画面像素的结构性优化。已补齐三项：
- **静止收敛**：`idle` 条件加入 `idleFor < 60`，超过 60 秒无输入时呼吸淡出（`idleGain` 收敛后吸附到 0），阵列进入完全静止，`renderState` 的精确状态复用开始命中，`render()` 整帧跳过。任何 pointermove / pointerdown / keydown / wheel 通过 `scene.wake()` 立即唤醒。
- **阴影降频**：静止呼吸期间阴影贴图隔帧更新（`shadowTick`），单帧延迟在缓慢起伏下不可见，省掉一半 shadow pass。
- **悬停唤醒**：`setHover` 刷新 `lastInteraction`，避免悬停抬升动画被降帧。
- 这三项都不改变任何渲染像素：帧率是时间采样，阴影是单帧延迟，静止收敛只让环境呼吸停下（画面内容不变）。
- 剩余可优化项都会改变像素（AO 分辨率、透明材质分辨率、阴影分辨率、景深、卡片材质），已列为可选项，本轮未应用。

## 双击打开文档（2026-11-15）

- 用户要求在不影响整体动画的前提下支持双击打开文档。采用折中方案：单击语义完全不变（零延迟选中、抬升、波浪），双击时打断抬升直接进入详情。
- `scene.ts` 在 `pointerup` 的未移动分支识别「同一张卡、两次按下间隔 < 300ms」（`DOUBLE_PRESS_MS`）。命中时把 `lift.velocity` 归零并回调 `onOpen`，抬升从当前高度被抽取接管，不会出现第二段升起。
- `main.ts` 的 `onOpen` 复用了 `openFile()`，与 `ACCESS FILE` 按钮、回车键走同一条详情路径；若双击的卡片不是当前选中项，先 `select` 再打开。
- 单击路径未改动：`onSelect` 仍在第一次 `pointerup` 立即执行，拖动、滚轮、键盘导航全部保持原样。
- 验证：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check:viewport`、`check-motion`、`check-playground`、`check-archive` 通过；未做浏览器交互实测。

### 第二轮子代理审查后的修正（同日）

- **阻断 B1**：`frameInterval()` 用 `idleAmount > 0.6` 判断静止，但 `idleGain` 只在 `idle` 为真时增长，而 `idle` 在 `idleFor > 60` 时立刻转为 false 并快速衰减到 0，因此 `settled` 只在衰减的约 2.3 秒内为真，**静止降帧实际从未生效**。改为 `scene.ts` 暴露 `isIdle`（记录 `idle` 判定本身），`main.ts` 直接读取。
- **阻断 B2**：`scripts/check-wallpaper.mjs` 断言壁纸有 8 个 `data-quality-choices`，新增帧率下拉后变为 9，校验链断裂。改为按 `Object.keys(qualityPresets.original).length - 2`（滑杆字段不计）推导，避免以后新增字段再次漂移。
- **应修 S5**：双击时不再把 `lift.velocity` 归零，让二阶弹簧带着当前速度直接改目标到抽取高度，避免速度突变。
- **应修 S4**：`lastPress` 改存档案索引而非物理 cell，循环阵列 rebase 后仍能命中同一次双击；`e.timeStamp` 为 0 时回退到 `performance.now()`。
- 审查确认无误的点：`capture: true` 覆盖 UI 区域（任何 pointermove 都会唤醒）；网页模式下 `idleGain = 0` 后 `renderState` 复用能命中（`rhythm` 不依赖 `time`，`settlingWave` 用常量）；`shadowTick` 奇偶相位稳定且不会溢出；`closeModal` 在无 modal 时同步执行；壁纸两套限帧叠加不会低于预期；触摸单指双击可触发、双指缩放不误触。
- 已知非问题但记录：144 Hz 屏上 60 fps 上限实际约 48 fps（避免帧时间抖动的取舍）；`DOUBLE_PRESS_MS = 300` 比 Windows 默认 500 ms 短，若反馈双击不灵可调大。
- 复验：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check:viewport`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-archive`、`check-wallpaper`、`check-quality`、`check-render-updates` 全部通过。

## 防御性编程与白色／浅薄荷绿配色（2026-11-15）

- 用户要求做防御性编程，并把档案模型改成白色与浅薄荷绿为主。
- **配色**：`scene.ts`、`internal-optics.ts`、`theme-material.ts`、`archive-lighting.ts`、`appearance.ts` 的材质色与灯光色统一改为白底薄荷：盖板 `#fcfffd`、边框 `#f4fbf7`、内衬 `#eaf4ef`、内构玻璃 `#dfeee7`／`#e6f2ec`、光学边 `#d2e6dc`、索引嵌片 `#dff0e8`、地面 `#d3e6dd`、标签底色 `#eef8f3`。主光与半球光改为 `#f6fffb`／`#f8fffc`，取消原暖米色。暗色主题同步换为冷灰薄荷（`#5e6b68` 等），两套主题保持同族。
- **防御性编程**：
  - `readLocal` 增加 `null`／`undefined` 判断；新增 `writeLocal` 统一包裹写入，私密模式或配额超限时降级为内存态而不抛错。
  - `readSavedIds` 校验 `rhine-saved` 必须是字符串数组，过滤脏数据。
  - 新增 `parseMetrics`，渲染指标属性损坏时只丢失细节，不影响摘要。
  - `scene.ts` 新增 `readRenderMetrics`，`resize()` 里回填指标时不再直接 `JSON.parse` 可能损坏的属性。
  - `quality-settings.ts` 新增 `readChoices`，循环控件载荷非法时退化为空列表；标签节点缺失时不再非空断言崩溃。
  - `workbench.ts` 的存储读取改为先判 `typeof === "object"` 再取字段，兼容旧版本与手工修改。
- 验证：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-archive`、`check-wallpaper`、`check-quality`、`check-render-updates` 全部通过。
- **模型几何未改动**：Blender MCP 当前未连接，`art/build_archive.py` 等脚本未执行。本轮只改材质与灯光配色，`.glb` 资产保持原样。若需重新生成几何，需先启动 Blender 并启用 MCP 插件。

### 第三轮子代理审查后的修正（同日）

- **S1 调色板**：`theme-ui.ts` 的 `palette` 仍是暖米色（`paper #eae5e1`、`accent #9b7247`），切暗色会把页面刷回暖色系，与三维的冷灰薄荷冲突。已改为 `paper #ebf3ef`、`panel #eef6f2`、`field #e6f0eb`、`accent #5f9a86`，暗色端同步为 `#111a18`／`#1f2b28`／`#293734`／`#8fc9b4`。
- **S1 补充**：`style.css`、`responsive.css`、`workbench.css`、`wallpaper-effects.css` 的页面底色、氛围渐变与兜底值统一为 `#e9f2ee`／`#ebf3ef`；`scene.ts` 的场景背景与雾同步改为 `#ebf3ef`。
- **S2 强调色**：`style.css`、`quality-settings.css`、`workbench.css` 里 14 处琥珀强调色（`#a67d48` 焦点描边、`#9b7247` hover、`#a27849`、`#946b3c`、`#cbb397` 选区）统一替换为薄荷 `#6f8a80`／`#5f9a86`／`#cfe4da`。
- **S3 未覆盖材质**：GLB 里 `Amber_Optical_Inlay`（琥珀环）与 `Champagne_Index`（香槟金嵌片）不在 `scene.ts` 的覆盖列表里，详情特写仍是暖色。已在 `configureInternalOptics` 前补两条改色（`#8fc0ae`／`#bcd2c8`），无需重建资产。
- **S4 内构消失**：内构玻璃改成浅薄荷后，在 0.27–0.42 的透明度下与白盖板混色后亮度只差 0.014，环形结构实际不可见。已压深一档：`Optical_Glass_Body #a8c4b8`、`Roof #b0cabf`、`Edge #d6e8df`、`Bridge #aec9bd`，混色后与背景差约 0.07，层次恢复。
- **S5 静默失败**：`writeLocal` 捕获异常后不再无声吞掉，首次失败通过 `notify()` 提示「当前无法保存设置，重新加载后可能丢失」，与 `workbench.storageOk` 的既有做法对齐。
- **S6–S9 类型严谨性**：`workbench.ts` 先判 `typeof saved.date === "string"` 再比较；`parseMetrics` 显式返回类型、拒绝数组、去掉多余断言；`readRenderMetrics` 同样拒绝数组；`readChoices` 放宽为 `length >= 2`，避免将来加第三列时静默丢选项。
- 审查确认无误：`readLocal` 的 `null` 判断语义与 `??` 一致；`readSavedIds` 的类型谓词有效；`restoreTimer` 自带完整校验；`Optical_Diffuser` 改色不影响阴影（阴影贴图只看几何）；`Index_Inlay` 暗色值对比度约 7.5:1 合理；GLSL `vec3` 字面量改动合法；5 处 `JSON.parse` 全部在防御包装内。
- 已知未修（历史遗留，本批未引入）：`theme-material.ts` 里手写的 `vec3` 是线性空间值，与 `new THREE.Color()` 的 sRGB 转换不一致，但数值恰好合理；`scene.ts` 的 `lightingLook === "refined"` 分支当前恒为死代码（构造时不传第二参数）。
- 复验：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check:viewport`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-archive`、`check-wallpaper`、`check-quality`、`check-render-updates` 全部通过。

## 标签图标与文案跟随档案（2026-11-15）

- 用户指出卡片正面标签（`drawLabel`，1024 × 440 画布贴图）上的图标糊成一团，并要求编号像标题一样由数据生成。
- **图标**：原 `labelMarkSvg` 复用 310 × 145 的完整字标，缩到 210 × 98 px 后笔画糊成一片。改为专为这个尺寸绘制的紧凑光学符号（双环 + 中心点，`viewBox 0 0 110 72`），描边 11、颜色随 `currentColor`。`logo` 与 `brandHeading` 未受影响。
- **文案**：`drawLabel(index)` 改为读取 `records[index]`：
  - 第一行由固定 `RHINE LAB, LLC.` 改为档案英文标题 `en`（缺失时回退 `title`）；
  - 第二行由固定 `INTERNAL DATABASE` 改为科室 `department`；
  - 编号由 `index + 1` 改为档案 `id` 去掉 `X-` 前缀，缺失时回退 `index + 1`。
- **防御性**：
  - 新增 `wrapLabelText`：超宽时按词折行至多两行；81 px 放不下则降到 68 px 重测，末行折叠剩余词不丢弃。
  - 新增 `fitOneLine`：科室与编号只允许一行，超宽时缩字号（最低一半），仍超宽则裁剪到 700 px 列宽，绝不压到右上 INFO 区块。
  - 标签画布提升到 2048 × 880（`LABEL_SCALE = 2`），旧卡离场快照同步使用画布实际尺寸。
  - `drawLabel` 用 `c.save()/restore()` 包裹，避免裁剪状态泄漏到下一次绘制；`getContext("2d")` 返回 null 时直接返回。
  - `labelMark.decode()` 失败不再中断 `load()`，图标缺失时标签照常绘制。
  - `drawImage` 前检查 `complete && naturalWidth > 0`，避免绘制未解码的图。
- 验证：`tsc`、`npm run build`、`npm run build:wallpaper`、`check:content`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-archive`、`check-wallpaper`、`check-quality`、`check-render-updates` 全部通过。

## 交付工作流（2026-11-16）

- 用户要求：**代理写代码 → 代理自测 → 子代理审核 → 代理按审核意见修完并复验 → 交用户终审**。用户是最后一道审核，代理不得越过用户自行宣告完成。
- 自测必须跑：`npx tsc --noEmit`、`npm run build`、`npm run build:wallpaper`，以及与改动相关的 `check:*` 脚本（清单见 `package.json` 的 scripts）。涉及 Blender 资产的改动还要跑对应 `art/` 或 `design-preview/` 下的实测脚本。
- 子代理审核必须独立于实现者，输出三级清单：**阻断**（功能失效或构建失败，必须修）、**应修**（逻辑或边界问题，建议修）、**可忽略**（风格、命名，记录即可）。审核范围含改动本身、被改函数的调用方，以及因改名或换资产而静默失效的既有分支。
- 审核意见不得静默跳过。不采纳的每一条都要写明理由，随交付一并给用户看。
- 交付给用户时必须包含四项：① 改了哪些文件、每处改了什么；② 跑了哪些验证命令与结果；③ 子代理提了什么、如何处置；④ 需要用户拍板的地方。
- 未经用户终审通过，不提交、不推送、不合并。此项覆盖「正式功能提交与同步」中的直接提交授权；该授权只在用户明确表示本轮免审时恢复。

## REF 卡面模型首次接入记录（2026-11-17）

以下为 11 月 17 日的历史记录。当前资产和本地验收情况见本文末尾的「卡匣修整、封条与 X-001 贴纸接入」。

- 用户要求把 `design-preview/label-variants/ref` 的 REF 卡面模型搬进生产环境，替换原 `archive-cassette.glb`，并在实际网页中查看效果。
- 生产资产已替换为：
  - `public/assets/archive-cassette.glb`：23 网格、14,813 三角面，bbox `5.004 × 3.814 × 0.434`，SHA-256 `8BFA7EEE7A816C6E675A5BBFC85749B527CAD63142CEBFF7B08A508A54031B5C`。
  - `public/assets/archive-assembly.glb`：12 网格、14,813 三角面，拆解部件 `body: 9 / card: 1 / fasteners: 2`，同 bbox，SHA-256 `D08E82366A9807DD56E163075861B51A939B8811FE3FA5B3E45E66CBB324242A`。
- 最新卡面贴图 `design-preview/label-variants/ref/tex/card.png` 已内嵌到两个 GLB：无红章、保留巨大 `001` 水印、无右侧竖条底色块。贴图 SHA-256 `7328F74DD9B6FE30F2635A2A09F03C673344B731CA9C03A31D188A604A356DC3`。
- 最新导出把物体原点留在 X 轴左侧（bbox x `-7.002…-1.998`）；`scene.ts` 的 `normalizeArchiveScene()` 在加载时把 X 归中、Y 落到 0，详情相机和 360° 查看器都按归中后的模型构图。该归中只改运行时几何，不改 GLB 文件。
- 表面角色表补齐 `REF_Acrylic / REF_FrameMint / REF_FrameMintIn / REF_CardPrint / REF_PanelWhite / REF_BackPlate / REF_Steel / REF_Slot / REF_Ruler / REF_FrameInk / REF_Tape`；`REF_Tape` 归入 `engrave`，只在选中卡片显示，不进入阵列实例。
- `REF_Glass` 已恢复到生产 GLB，角色映射为 `glass`；`export_production.py` 会取消 `REF_glass` 的隐藏，并排除 `REF_shadow_catcher`。详情解密、清晰/磨砂开关和 360° 玻璃模式都依赖这一层。
- `REF_Tape` 在 GLB 中没有 UV；`appearance.ts` 在每次材质克隆时按局部顶点坐标生成黄黑斜纹，避免 `Material.clone()` 丢失 `onBeforeCompile` 后退化成白条。
- X-001 直接使用 GLB 内嵌的 REF 卡面；其他档案由 `drawCardFace()` 按 REF 版式动态绘制，黄色高亮跟随标题末尾，短标题不会留下孤立色块。阵列仍使用 GLB 烘焙贴图。
- `inspectionOverlay` 的 `projectCard()` 改为读取卡面几何前表面的 `cardPlaneZ`（REF 为 `0.15`），并在模型没有 `glass` 角色或打开 360° 查看器时禁用，避免扫描线浮在卡面前方或盖到查看器上。
- `fitOneLine` 不再留下未恢复的 clip；`fitCanvasText` 在字号下限后截断并补省略号，长摘要、chip 和编号不会越过右栏。
- 360° 查看器新增只接收阴影的地面背板、前置主光和 VSM 软阴影；装配模型的主体、框、卡面与紧固件参与投影，玻璃和亚克力不投影。
- 校验脚本已按 REF 资产重写：`check-assembly` 断言 `REF_Glass`、部件数量和 bbox；`check-shell`/`check-internal-optics`/`check-decryption` 改为检查 REF 层叠、玻璃深度和揭示时间线，不再依赖旧模型的 `optical-core`/`optical-lenses`。
- 校验：`npx tsc --noEmit`、`npm run build`、`npm run build:wallpaper`、`npm run check:content`、`npm run check:viewport`、`node --experimental-strip-types scripts/check-archive.mjs`、`node scripts/check-assembly.mjs`、`node scripts/check-shell.mjs`、`node scripts/check-internal-optics.mjs`、`node scripts/check-decryption.mjs`、`check-motion`、`check-motion-preferences`、`check-playground`、`check-quality`、`check-render-updates` 通过。`check-archive` 的内容断言按当前 DEEPDEMOS 短摘要放宽为 `> 10`，高度净空阈值从 `0.25` 调到 `0.2`（新模型高 `3.814`，抽取高度 `4.05`）。
- 浏览器实测（内置浏览器）：档案阵列、X-001 详情、解密中扫描线、X-002 动态卡面、360° 清晰/磨砂/拆解均已查看；详情页整卡入镜，无印章、无右侧色块，卡面方向正确，扫描线贴合卡面，地面软阴影可见。
- 未提交、未推送、未合并，等待用户终审。

## 卡匣修整、封条与 X-001 贴纸接入（2026-11-18）

用户确认本轮接入目标为本机 `http://127.0.0.1:5173/`。新版已替换本地 `public/assets/` 的两份 GLB。本轮接入没有提交、推送或发布到公共站点。

- 封条是一整片无字哑光米灰纸，沿原有左上沿位置从正面跨过顶边，在背面短折。GLB 中的 `REF_SealTape` 在网页中按 `seal` 角色加载，保留纸材，拆解时随 `body` 移动。
- 前后框各修成连续的一圈，封合原先的断缝和重叠面。亚克力侧壁止于两圈内侧，顶边文字回贴框面。Blender 预览还调整了盖板和印刷层反光。网页运行时仍使用自己的材质和灯光参数。
- X-001 的新版贴纸把标题、说明和底部标签分行，解决标签覆盖说明下沿的问题。原插图、编号牌和条码保留。两份 GLB 内嵌的 2000 × 1480 贴图与新版源图逐像素一致。X-001 使用内嵌图，其余详情仍由 `drawCardFace()` 动态绘制，阵列仍共用烘焙图。

相对于工作区根目录，装配源文件为 `design-preview/label-variants/seal-study/seal-on-cassette-layout.blend`。同目录的 `card-layout.png` 是贴图，`card-layout-comparison.png` 是排版对比，`export_cassette_layout.py` 将网页模型导出到 `web-export/`。11 月 17 日的 `ref` 目录保留为早期版本。

| 本地网页资产 | SHA-256 | 装配结构 |
| --- | --- | --- |
| `public/assets/archive-cassette.glb` | `6b2296a7eb3c3e9ccaee0b6772e422227d0aa2b578718d19f0d09a2a07899960` | 15 个单材质网格 |
| `public/assets/archive-assembly.glb` | `a96478144f826c25a12febd3b7d22c0a9c6e965df4799b8e1f4984010f17d00d` | `body` 9 个网格，`card` 1 个网格 |

两份模型的外包围盒为 `5.004 × 3.7066 × 0.1033`（宽、高、深）。换下的两份本地 GLB 保存在工作区根目录的 `_backup/cassette-layout-local-20261118-125218/`。

接入时，`npm run build:cloudflare`、`npm run build:wallpaper`、内容与视口检查、档案／外壳／装配／内部光学／解密检查均通过。独立复核确认了内嵌贴图、正反卡面 UV 和拆解分组。浏览器实测了 X-001 详情、360° 清晰与磨砂切换、拆解和重组。Cloudflare 打包输出为本地版本 `32289d9791d7e4a5`。

## 总览实景布光、暖焦糖配色、紧凑排布与长条灯带动画（2026-11-20）

### 当前范围与状态

- 本轮围绕本机 `http://127.0.0.1:5173/` 浅色总览（`lightOverview = (1 - detail) * (1 - fogTheme)`）重做实景布光、色板、盒距、切档波浪与底部长条灯带联动；暗色与详情模式经由 `lightOverview` 隔离保留；未改动 GLB 资产，未提交、未推送、未合并。
- 会话重启后本地 Vite 开发服务（`npm --prefix RhineLabUI run dev`，`http://127.0.0.1:5173/`）已随后台任务停止；继续联调实测前需重新启动。

### 本轮改动清单（8 个文件）

- **四灯实景布光与阴影**（`src/scene.ts`、`src/style.css`）：恢复阵列实例接收实景灯光（不再注入 `ISOLATED_SPOT_LIGHTS_FRAGMENT`），`diffuser / shell / frame` 开启 `castShadow`，`shell / frame / card / seal` 开启 `receiveShadow`；`setQuality()` 暂设 `this.ao.enabled = false` 去除缝隙暗脏。四灯按 `lightOverview` 混合：主聚光灯 `this.light`（`#ffead6`，位置 `(-23, 21, 5)`，目标 `(-2.0, -1.0, -3.5)`，`angle 0.56`、`penumbra 0.96`、`decay 1.62`、`intensity 205`，`PCFShadowMap`、`shadow.radius = 4`）、天空反弹 `this.studioSkyLight`（`HemisphereLight`，`#fff3e8` / `#b88b68`，`0.22 * lightOverview`）、掠射补光 `this.fillLight`（`#ffead8`，`(16, 14, 24)`，`0.07`）、底部长条面光 `this.overviewAreaLight`（`RectAreaLight`，`#ffba60`，`36 × 0.29`，`y = -3.35`，`zOffset = 0.12`，`intensity 30`）与地面发光条 `this.overviewLightStrip`（`46 × 0.22`，`y = -4.52`，`#ffd28a`）。背景/雾统一为 `OVERVIEW_MIST = #f3eee8`，`src/style.css` 同步 `--archive-mist-rgb: 243, 238, 232`。
- **暖焦糖色板、左下受光与封条压暗**（`src/archive-overview-look.ts`、`src/scene.ts`）：校准 `WARM` 色板、`overviewBodyDarken`（暖比 `(1.06, 0.85, 0.66)`）及 `frameSubsurfaceMask` / `opticalSubsurfaceMask`（`(0.76, 0.60, 0.45)`）；抬起选中卡的左下正面区（`directFrontZone`、`frameDirectBand`、`backingLeftDirect`）由下而上承接琥珀金光；`installOverviewSealFill` 按 `sealLit = smoothstep(0.02, 0.16, sealLuma)` 在 `(0.42, 0.31, 0.22)` 至 `(0.60, 0.46, 0.35)` 区间调制并对阵列实例加 `sealWarm * 1.12` 上限，消除白牙状高光。
- **紧凑盒距（相机焦距不变）**（`src/archive-loop.ts`、`src/scene.ts`、`scripts/check-archive-diagonal.mjs`、`scripts/check-archive-visibility.mjs`、`scripts/check-array-input.mjs`）：按用户要求仅缩窄盒距不拉近镜头：`COLUMN_SPACING = 5.1`（原 `5.2`，盒宽 `5.004`）、`ROW_SPACING = 0.28`（原 `0.43`，盒厚 `0.1033`），`LOOP_COLUMNS = 9`、`LOOP_ROWS = 32` 不变；`scene.ts` 的 `settlingWave` 行距按 `ROW_SPACING / REFERENCE_ROW_SPACING`（`0.43`）缩放以保持约 `21.5°` 坡度；上述三份脚本的硬编码间距同步改用 `COLUMN_SPACING`。
- **同列切档关闭波浪**（`src/scene.ts`）：`select()` 改为 `sameColumnRowSwitch = changed && cell.lane === previousCell.lane`，同列前后切换均冻结旧波浪且不触发新 `selectionWave`，跨列切换保留波浪；未改 `motion.ts` 与 `motion-preferences.ts`。
- **长条光带平滑滑行与受光同步**（`src/archive-slot-underlight.ts`、`src/archive-overview-look.ts`、`src/scene.ts`）：`ArchiveSlotUnderlights` 维护临界阻尼连续坐标 `(barRow, barLane)`（速率 `5.2` / `4.8`，`< 1e-4` 吸附保持静止复用，随 `rebase()` 平移），同步驱动 `overviewAreaLight`、`overviewLightStrip`、`syncOverviewSlotLights()` 与全部着色器；`directFor(cell)` 与 `selectedIntensity` 改由到 `(barRow, barLane)` 的紧支集距离计算（行距 `< 0.95`、列距 `< 0.85` 外为 `0`），彻底避免目标卡提前泛白、旧卡提前熄灭及光条正上方暗洞；`REF_Glass` 总览铭牌叠加 `badgeShade = mix(vec3(0.42, 0.32, 0.23), vec3(1.0), slotDirect)` 随光条抵达同步变亮；`getStats().overviewSlotLights` 暴露 `bar` 坐标。
- **同列 `-X` 竖脊长距扩散（12～13 格）**（`src/archive-slot-underlight.ts`、`src/archive-overview-look.ts`）：`reflectionFor(cell)` 前向衰减调为 `Math.exp(-(rowDistance - 1) * 0.10) * (1 - smoothstep(11.5, 16.5, rowDistance))`、后向 `0.20`、列向收紧至 `4.2`；`frame`/`engrave` 与 `acrylic`/`glass` 使用 `smoothstep(0.06, 0.88, slotNeighbor)` 搭配 `pow(slotNeighbor, 0.70)`（含 `> 0.0001` 保护），且 `frameSubsurfaceMask` 通过 `frameEndProtection` 仅保护 `-X` 端面边脊，保留前方顶部横梁焦糖对比。

### 已否决方案与调试注意事项

- 已否决：后处理全局调色 pass（`reference-grade.ts`）；左侧缝隙裸放 `PointLight`；缩放相机 `span` 替代缩小盒距；无条件提高全局 `endWarm = 0.82`。
- 备份位置（工作区根目录）：`_backup/reference-look-20261120-0336/`（含改前对照图 `before.png`）、`_backup/before-real-lighting-20261120-1314/`。
- 调试坑：`scripts/dev-shot.mjs` 第 23 行 `Number(process.argv[5] || 9000)` 传 `0` 会等 9 秒，抓中途帧应传 `1` 并在 JS 表达式内 `setTimeout`；PowerShell 传参宜外层单引号配 JS 反引号；Windows Chrome ANGLE 下 GLSL 分数 `pow(x, y)` 必须加 `x > 0.0001` 防护。

### 待定问题：左右切列波浪异常（已定位，未改代码）

> 已于 2026-11-21 解决，最新改动与待办清单见文末「左右切列波浪修正、光泽统一与总览五阶段入场动画（2026-11-21）」。

- 用户最新反馈「左右切的波浪有问题」，标注重叠指向左侧邻列与前景沿行向（右下）传播的密集起伏。
- 已定位根因：`src/scene.ts` 第 `2892`、`2899` 行的 `pulses` / `frozenPulses` 距离仍使用未缩放的 `Math.hypot(row - p.row, (lane - p.lane) * 2.2)`，在 `ROW_SPACING` 从 `0.43` 缩紧到 `0.28` 后未像第 `2921` 行 `settlingWave` 那样乘以 `ROW_SPACING / REFERENCE_ROW_SPACING`。这使行向波长被压缩到约 `3.03` 世界单位、跨列与沿行的世界波速失衡约 `8.3:1`（跨列约 `18.5` 单位/秒，沿行约 `2.24` 单位/秒），切列时在前景形成密集斜向起伏和负向波谷。
- 待接手后先向用户确认方向再改代码（三选一）：
  1. 按真实物理间距重标定扩散波浪（消除纵深压扁与横纵失衡，使波浪宽缓均匀扩散）；
  2. 改为主要沿左右切列方向传播的横向波浪（不再向右下前方沿行方向翻涌起伏）；
  3. 左右切列同样关闭 `selectionWave` 脉冲，仅保留 `settlingWave × columnWave` 列阶梯平滑过渡与长条灯带滑行。

### 已通过验证与待完成收尾

- 最近一次代码改动后已通过：`.\node_modules\.bin\tsc -p tsconfig.json --noEmit`、`node scripts/check-loop.mjs`（20,000 次方向移动、288 池位）、`node scripts/check-archive-visibility.mjs`，及 `dev-shot.mjs` 静止态（约 12 格 `-X` 渐变、邻列 `reflection ≈ 0.01`）与长距切档中途帧（7 步跳转 260ms，`bar.row ≈ 15.23`，目标 `row 19` 的 `selected.intensity === 0`，卡面与铭牌未提前变白）实测。
- 待办（待用户确认上述波浪方向与终审前收尾，按「交付工作流」执行）：
  1. 向用户确认左右切列波浪改造方案并在 `src/scene.ts` 实施与视觉验证（注意确认同步是否调整 `scripts/check-motion.mjs` / `selectionPulse` 相关契约）；
  2. 清理 `src/scene.ts` 未引用的 `ISOLATED_SPOT_LIGHTS_FRAGMENT` 常量，并评估 `this.ao.enabled = false` 是否应仅针对浅色总览而非全局关闭；
  3. 跑齐全量构建与检查：`npm run build`、`npm run build:wallpaper`、`npm run check:content`、`npm run check:viewport`，以及 `check-archive-diagonal.mjs`、`check-array-input.mjs`、`check-motion.mjs`、`check-motion-preferences.mjs`、`check-theme.mjs`、`check-render-updates.mjs` 等相关脚本；
  4. 实机检查暗色模式（`fogTheme = 1`）、详情模式（`detail = 1`）与超级性能模式视觉；
  5. 派独立只读子代理审计并按三级清单修正复验后，提交四项交付报告等待用户终审。

## 左右切列波浪修正、光泽统一与总览五阶段入场动画（2026-11-21）

### 当前范围与状态

- 本轮延续 2026-11-20 本机 `http://127.0.0.1:5173/` 联调，完成左右切列波浪改造、总览／详情／360° 查看器光泽与布光统一，以及总览五阶段入场动画（含长条光从左后方纵深滑入）。未改动 GLB 资产，未提交、未推送、未合并。
- 当前会话后台持续运行 Vite 开发服务（`npm --prefix RhineLabUI run dev`，`http://127.0.0.1:5173/`）；若新会话重启后服务已停，联调前需重新拉起。

### 本轮改动清单（4 个文件）

- **左右切列波浪改由右侧抬起扫入**（`src/scene.ts`）：新增 `columnSwitchWave(row, lane, originRow, originLane, age)` 与常量 `COLUMN_SWITCH_WAVE_START = 7.4`、`COLUMN_SWITCH_WAVE_SPEED = 11.5`、`COLUMN_SWITCH_WAVE_WIDTH = 2.1`、`COLUMN_SWITCH_WAVE_AMPLITUDE = 0.85`、`OVERVIEW_RIGHT_X = Math.cos(OVERVIEW_AZIMUTH)`、`OVERVIEW_RIGHT_Z = Math.sin(OVERVIEW_AZIMUTH)`；默认非延迟脉冲（`selectionPulse === baselineSelectionWave && !deferSelectionPulse`）沿视口右向左平滑单峰扫过（正向钳位至 `0.82`），消除行向密集起伏；非默认／延迟脉冲的行距亦补齐 `* (ROW_SPACING / REFERENCE_ROW_SPACING)` 缩放。同列切档保持冻结旧波浪、不发新波。
- **总览／详情／360° 查看器光泽与布光统一**（`src/scene.ts`、`src/model-viewer.ts`）：
  - `src/scene.ts`：浅色主题下主聚光灯（`#ffead6`，`205 -> LIGHT_DETAIL_KEY_INTENSITY = 290`，位置 `(-23, 21, 5) -> LIGHT_DETAIL_KEY_POSITION (-21, 20, 14)`，目标 `(-2.0, -1.0, -3.5) -> LIGHT_DETAIL_KEY_TARGET (-1.5, 0.8, -2.5)`）、天空半球光 `studioSkyLight`（`#fff3e8 / #b88b68`，`0.22 -> 0.28 * lightTheme`）、右前补光 `fillLight`（`#ffead8`，`0.07 -> 0.22 * lightTheme`）、`environmentIntensity`（`0.18 -> 0.3 * lightTheme`）与雾／背景色 `OVERVIEW_MIST` 均按 `lightTheme = 1 - fogTheme` 在总览与详情间连续过渡，详情页底部长条灯保持 `0.72` 系数；拆出 `arrayBottomLight`（赋值 `lightTheme`）使进入详情页后背景阵列维持一致的暖焦糖光泽而不突闪；选中卡 `glass` 角色统一为 `clearcoat = 0.28`、`clearcoatRoughness = 0.18`。
  - `src/model-viewer.ts`：360° 查看器同步切换为同套暖色棚拍布光（`keyLight` `#ffead6` 位置 `(-8, 6, 9)` 强度 `260`、`angle 0.5`、`penumbra 0.85`、`decay 1.65`；`fill` `#ffead8` 位置 `(10, 8, 12)` 强度 `0.2`；`HemisphereLight("#fff3e8", "#b88b68", 0.24)`；`environmentIntensity = 0.3`）。
- **总览五阶段入场动画与左后方长条光推进**（`src/scene.ts`、`src/archive-slot-underlight.ts`、`src/main.ts`）：
  - `src/scene.ts`：新增 `playIntro()`、`finishIntro(snapBar = false)` 与入场常量 `INTRO_FLAT_HOLD = 0.5`、`INTRO_WAVE_START = 9.5`、`INTRO_WAVE_SPEED = 13.0`、`INTRO_WAVE_WIDTH = 2.2`、`INTRO_WAVE_AMPLITUDE = 1.05`、`INTRO_PRESELECT_TIME = 1.25`、`INTRO_PRESELECT_RATIO = 0.45`、`INTRO_LIGHT_START = 1.75`、`INTRO_LIGHT_DURATION = 0.85`、`INTRO_BAR_START_OFFSET = 22`、`INTRO_TOTAL_DURATION = 3.25`。
  - 五阶段时序：① `0–0.5s` 阵列平整（`introTerrace = 0`），目标卡未抬升（`introLiftScale = 0`），长条光置于 `selectedCell.row - 22` 且隐藏（`introGain = 0`）；② `0.5s` 起右向左单峰入场波（`introWave` + `waveWake`）扫过并将阵列渐抬为阶梯（`1.75s` 落稳）；③ `1.25s` 起目标档案进入预选微抬（`INTRO_PRESELECT_RATIO = 0.45`），未点亮呈暖焦糖色；④ `1.75s–2.60s` 全宽琥珀长条光在 `0.16s` 淡入，按三次缓出 `remain = (1 - u) ** 3` 从左后方（`selectedCell.row - 22`）向前推至 `selectedCell.row`；⑤ 到达预选格（`directFor(selectedCell) >= 0.35`）后解锁 `fullLiftUnlocked = true` 完成完全抬升（`OVERVIEW_LIFT = 0.4`），`3.25s` 结束定格（`intro = null`）。
  - 中断与状态钩子：`setMode("detail")`、`setMotion(...)`（禁用 `selectionTransition` 或 `selectionWave`）调用 `finishIntro(true)` 立即归位光条；`select`（换格）、`moveArchive`（拖拽开始）、`wheel`（滚轮步进）调用 `finishIntro()` 顺滑接管；`renderState` 纳入 `this.intro?.elapsed ?? -1` 避免动画期间错误复帧；`getStats()` 暴露 `intro: { elapsed, fullLiftUnlocked } | null`。
  - `src/archive-slot-underlight.ts`：新增 `introGain`、`setIntroGain(gain)` 与 `setBarRow(row)`，`get barIntensity()` 乘以 `this.introGain`（已否决并移除早期左到右横向裁切方案 `introRevealLane` / `revealFor`）。
  - `src/main.ts`：`completeStartup()` 在 `reviewParams.get("scene") !== "detail"` 时于 `scene?.revealImmediately()` 后触发 `scene?.playIntro()`；`window.rhine` 新增 `replayIntro: () => scene?.playIntro()` 供实机复测。

### 已通过验证与待完成收尾

- 最近一次改动后已通过：`.\node_modules\.bin\tsc -p tsconfig.json --noEmit`、`node scripts/check-loop.mjs`（20,000 次方向移动、288 池位、160 参考实例）、`node scripts/check-archive-visibility.mjs`、`node scripts/check-motion.mjs`、`node scripts/check-theme.mjs`。
- `dev-shot.mjs` 实景截图已核验：左右切列右起波浪、详情页统一光泽与背景阵列、以及新版入场动画左后方长条光推进中途帧（`elapsed: 2.017s`，`bar.row ≈ 4.89`，`selected.cell.row: 12`，`selected.intensity: 0`，`extraction: 0.15`，`fullLiftUnlocked: false`）与定格帧（等待 `3400ms`，`intro: null`，`bar.row: 12`，`selected.intensity: 1`，`extraction: 0.384`）。
- 待办（待用户确认最新入场效果与终审前收尾，按「交付工作流」执行）：
  1. 待用户确认最新入场动画（左后方全宽长条光推进 + 预选完全抬起）及当前视觉效果；
  2. 清理 `src/scene.ts` 未引用的 `ISOLATED_SPOT_LIGHTS_FRAGMENT` 常量，并评估 `this.ao.enabled = false` 是否应仅针对浅色总览而非全局关闭；
  3. 跑齐全量构建与检查：`npm run build`、`npm run build:wallpaper`、`npm run check:content`、`npm run check:viewport`，以及 `check-archive-diagonal.mjs`、`check-array-input.mjs`、`check-motion.mjs`、`check-motion-preferences.mjs`、`check-theme.mjs`、`check-render-updates.mjs` 等相关脚本；
  4. 实机检查暗色模式（`fogTheme = 1`）、详情模式（`detail = 1`）、360° 查看器与超级性能模式视觉；
  5. 派独立只读子代理审计并按三级清单修正复验后，提交四项交付报告等待用户终审（未经终审不提交、不推送、不合并）。

## 删除全部交互音效（2026-11-21）

- 用户要求删除 UI、切档、抽取、浏览、详情、收藏、播放器与桌面互动音效。运行时删除 `synthesizeSound`、音效 voice 池、音效 bus 与音乐 duck；三轨背景配乐、独立音乐开关与音量、自动播放解锁和视觉动画保留。
- 系统设置与 Wallpaper Engine 只保留背景音乐属性。旧 `rhine-settings` 的 `sound` / `soundVolume` 和宿主旧字段安全忽略且不回写；外部 128-bin 频谱继续驱动音乐律动，纯自家点击用的 `rhine-local-sound` 过滤与 `SpectrumEnvelope.ignoreLocalSound` 一并移除。
- 启动入口文案改为准备／重试／关闭背景音乐；`main.ts` 的音乐音量宿主回调和界面同步均直接读取 `musicVolume` / `properties.musicvolume`，不再使用单元素循环。
- 验证通过：`tsc -p tsconfig.json --noEmit`、`node scripts/check-playground.mjs`、`node scripts/check-wallpaper.mjs`、全部修改脚本的 `node --check`、`wallpaper/project.json` 解析及 `git diff --check`。IAB 已观测三轨配乐运行且无音效节点；未提交、未推送。

## 网页纯净画布模式、固定总览起势详情推进镜头与局部玻璃揭开（2026-11-21 午后更新）

### 当前范围与状态

- 继当日入场动画与交互音效移除后（12:03–13:37），项目新增网页纯净画布模式（`.web-archive-clean`）、固定总览起势推进详情镜头（`fixedDetailCamera`）及选中卡局部玻璃解密揭开；Wallpaper Engine 端保留既有 2D 界面与详情逻辑。
- 工作区已于 13:37 重新产出 `dist/`、`release/wallpaper/` 及 `public/archives/DEEPDEMOS-X-001..040.txt`；当前后台开发服务已随会话重启停止（端口 `5173` 无监听），继续联调前需重新运行 `npm --prefix RhineLabUI run dev`。未提交、未推送、未合并。

### 本轮改动清单（4 个源码文件）

- **网页纯净画布模式与壁纸端隔离**（`src/main.ts`、`src/style.css`）：
  - `src/main.ts`：非壁纸环境（`!isWallpaper`）为 `#stage` 添加 `.web-archive-clean` 并设 `#three-scene.tabIndex = -1`；`focusArchiveOverview()` 与进入详情后的 `pendingDetailFocus` 将焦点落在 `#three-scene`，`keydown` 允许 `#three-scene` 和 `HTMLCanvasElement` 按 `Enter` 打开详情；`setMode()` 在网页端保持 `#detail-ui.inert = true`、跳过 `detailTransition.show/hide` 与 `renderDetail()`；`documentDecryption`、`#detail-content` 揭示样式、`inspectionOverlay`、`#hover-label` 以及 `fit()` 中 `#inspection-marks` / `.tab-indicator` 的重测均限定在 `isWallpaper` 分支执行。
  - `src/style.css`：`.web-archive-clean` 隐藏 `.brand`、`.system-nav`、`#archive-ui`、`#detail-ui`、`.powered`、`.system-footer`、`#inspection-marks`（归档态一并隐藏 `#pwa-update-notice`），并去掉 `.three-scene:focus` 聚焦描边；`#stage.web-archive-clean > .archive-atmosphere` 清空底图并禁用 `::after` 右侧详情遮罩，恒定保留 `::before` 总览雾边氛围（`opacity: 1`）。
- **固定总览起势推进详情镜头与视觉抬升分离**（`src/scene.ts`）：
  - `ArchiveScene` 构造时通过 `Boolean(container.closest(".web-archive-clean"))` 启用 `fixedDetailCamera`；新增 `OVERVIEW_VISUAL_LIFT = 0.4` 与 `overviewVisualLift()` 将总览视觉抬升与抽起高度解耦，同步作用于 `outgoing` 归位卡与 `clearance` 净空计算。
  - 新增 `FixedDetailCameraPose`、`FixedDetailCameraBasis`、`captureFixedDetailCameraEntry()`、`solveFixedDetailCameraPose()`、`applyFixedDetailCameraMove()`、`applyFixedDetailProjection()` 与 `fixedDetailCameraBasisChanged()`：进入详情时捕获当前总览相机位姿、投影缩放（`projectionScaleX` / `projectionScaleY`）、焦深（`focusDepth`）与卡心高度；随后针对抬升至 `INSPECTION_LIFT + OVERVIEW_VISUAL_LIFT` 的卡片按略偏正面视角（`DETAIL_TARGET_AZIMUTH = 54°`、`DETAIL_TARGET_ELEVATION = 16.5°`、`DETAIL_TARGET_DEPTH_RATIO = 0.88`）与响应式构图框（`DETAIL_FRAME_CENTER_X = 0.35`、竖屏插值向 `0.5`，`DETAIL_FRAME_CENTER_Y = 0.49`、`DETAIL_FRAME_HEIGHT = 0.73`、`DETAIL_FRAME_MAX_WIDTH = 0.3`、`DETAIL_FRAME_ABSOLUTE_MAX_WIDTH = 0.82`、`DETAIL_FRAME_EDGE_SAFE = 0.08`）经 24 次二分求解 `fov`（`DETAIL_TARGET_FOV_MAX_EXPANSION = 6°`，超界时扩展至 `144°`）并做两轮屏幕中心校正。
  - 镜头推进随 `this.lift.value` 在 `DETAIL_CAMERA_PUSH_START`（`OVERVIEW_LIFT + 0.45`）至 `DETAIL_CAMERA_PUSH_END`（`INSPECTION_LIFT - 0.4`）区间平滑插值，并沿相机上方向补偿 `followY` 跟踪卡片垂直上升、插值 `bokehUniforms.focus.value` 与保持捕获投影比例。
  - `fixedDetailCamera` 模式下 `fieldDetail` 与 `renderDetail` 恒为 `0`，背景阵列起伏、雾效、四灯棚拍光、长条底灯与景深光圈均维持总览外观不跳变；新增 `fixedDetailRaised` 及 `dataset.inspection = "raised"` 中间态；退出详情且回落至总览位后释放 `fixedDetailCameraHeld`，窗口 `resize` 或切档时自动清空缓存并重算目标位姿。
- **选中卡局部玻璃解密揭开**（`src/archive-overview-look.ts`、`src/scene.ts`）：
  - `src/scene.ts` 新增 `SELECTED_REVEAL_RISE_SPAN = 0.32` 与 `selectedRevealRise`（`smoothstep(lift.value, OVERVIEW_LIFT, OVERVIEW_LIFT + SELECTED_REVEAL_RISE_SPAN)`），仅对 `mode === "selected" && this.fixedDetailCamera` 注入着色器并纳入 `renderState`；`decryptionLiftReady` 调整为 `lift.value >= Math.min(3.3, fixedDetailLiftTarget * 0.78)`。
  - `src/archive-overview-look.ts`：`applyOverviewLook()` 新增第 4 参数 `selectedRevealRise`（uniform `archiveSelectedRevealRise`），预先保存 `overviewSourceLight`，在 `role === "glass"` 时按 `glassRevealAtHeight(archiveClarity, vArchiveHeight) * archiveQuality * archiveSelectedRevealRise` 仅在卡面窗口区域（`vOverviewPosition.y < 3.68`）恢复原正面受光，清透显露印刷卡面并保留总览铭牌（`badgeMix`）与全局总览色调。

### 已通过验证与最新收尾待办

- 文档同步前已实跑通过：`.\node_modules\.bin\tsc -p tsconfig.json --noEmit`、`node scripts/check-loop.mjs`（20,000 次方向移动、288 池位、160 参考实例）、`node scripts/check-archive-visibility.mjs`、`node scripts/check-motion.mjs`、`node scripts/check-theme.mjs`、`npm run check:content`（18/18）、`npm run check:viewport`。
- 仍待收尾项（按「交付工作流」推进）：
  1. 清理 `src/scene.ts:226` 未引用的 `ISOLATED_SPOT_LIGHTS_FRAGMENT` 常量，并评估 `src/scene.ts:2260` 的 `this.ao.enabled = false` 是否应仅针对浅色总览而非全局关闭；
  2. 浏览器实机核验网页纯净模式（`.web-archive-clean`）的入场动画、固定总览起势推进详情镜头、局部玻璃揭开、退出回位与视口缩放自适应，以及壁纸模式（完整 2D UI／详情／360° 查看器／暗色模式／超级性能模式）；
  3. 复跑全量构建与其余浏览器／回归检查脚本（含 `check-archive-diagonal.mjs`、`check-array-input.mjs`、`check-motion-preferences.mjs`、`check-render-updates.mjs`、`check-selection-state.mjs`、`check-font-update.mjs` 等）；
  4. 派独立只读子代理审计并按三级清单修正复验后，提交四项交付报告等待用户终审（未经终审不提交、不推送、不合并）。

## 详情推进镜头球面重构、移除解密变透、老建模回收站清理与磨砂正面三区版式重设计（2026-11-21 晚间更新）

### 当前范围与状态

- 本轮完成四项改动：① 优化点开详情的球面双弹簧镜头调度；② 移除进入详情的磨砂变透明解密揭示（网页端与壁纸端统一保持磨砂卡匣质感）；③ 统一采用 `seal-on-cassette-layout.blend` 定稿模型并将工作区 57 个老建模／旧脚本文件与 5 个旧目录移入 Windows 回收站；④ 在磨砂卡匣正面（`REF_Glass`）重设计「左上模型名称铭牌 + 中部可替换展示照片 + 底部四项数据标签」三区版式。
- 本地 Vite 开发服务持续运行于 http://127.0.0.1:5173/ ；未提交、未推送、未合并。

### 本轮改动清单

- **点开详情的球面双弹簧镜头调度**（`src/scene.ts`）：
  - 废除原先直线弦插值（`lerpVectors`）、延迟触发的 `followY` 高度补偿与广角变焦（`fov: 6.556° -> 7.73°`），改用绕注视点 `aim` 的球面弧线插值（`azimuth`、`elevation`、`distance`）并保持长焦 `fov = 6.556°` 恒定（通过距离求解 `55.0 -> 49.73` 推进），同时将 `projectionScaleX / Y` 从总览的 `0.97 / 1.02` 平滑恢复至 `1 / 1` 消除透视拉伸。
  - 目标构图设为微侧 3/4 正面（`DETAIL_TARGET_AZIMUTH = 28°`、`DETAIL_TARGET_ELEVATION = 11°`、`DETAIL_FRAME_CENTER_X = 0.42`、`DETAIL_FRAME_CENTER_Y = 0.47`、`DETAIL_FRAME_HEIGHT = 0.72`）。
  - 拆分为双通道弹簧：`detailCameraAimMove`（`aim.y` 与 `elevation` 从点击首帧立即以速率 `4.5` 跟拍，中途 260ms 卡顶 `y = 75px` 零裁顶）与 `detailCameraMove`（`azimuth`、`distance`、`aim.x/z`、`roll` 与 `projectionScale` 由 `smoothstep(lift, 0.42, 0.74)` 引导，速率 `4.3`）；卡片打开抬升速率设为 `DETAIL_LIFT_OPEN_RATE = 3.8`，关闭回退速率设为 `DETAIL_CAMERA_CLOSE_RATE = 4.6`。
  - 从 `FixedDetailCameraBasis` 移除 `pitch` / `yaw`，消除详情态拖拽旋转卡片时的相机重算抖动（实测拖拽前后 `Δcam < 0.0025`）。
- **移除进入详情的磨砂变透明解密揭示**（`src/archive-overview-look.ts`、`src/scene.ts`、`src/main.ts`）：
  - `src/archive-overview-look.ts`：删除 `selectedRevealRise` / `archiveSelectedRevealRise` 着色器局部揭开分支。
  - `src/scene.ts`：移除 `DecryptionController` 联动、`modelClarity()`、`setModelCardTexture()`、`decryptionFrame`、`finishDecryption`、`projectCard` 及 `getStats().decryption`；选中卡、归位副本及预热克隆统一锁定 `this.appearance.setClarity(..., 0)` 磨砂态（保留 `prepareDetailSurface`、`createAssemblyModel` 与 360° 查看器的清晰／磨砂手动切换）。
  - `src/main.ts`：移除 `InspectionOverlay`、`DocumentDecryption` 与 `#inspection-marks`，壁纸端进入详情时右侧文案直接清晰可读。
- **统一采用定稿模型并清理老建模至 Windows 回收站**：
  - 保留唯一 Blender 源模型 `design-preview/label-variants/seal-study/seal-on-cassette-layout.blend`（1,096,758 B）、导出目录 `web-export/archive-cassette-latest.glb` 与 `archive-assembly-latest.glb`、线上资产 `public/assets/archive-cassette.glb`（SHA-256 `6B2296A7EB3C3E9CCAEE0B6772E422227D0AA2B578718D19F0D09A2A07899960`）与 `public/assets/archive-assembly.glb`（SHA-256 `A96478144F826C25A12FEBD3B7D22C0A9C6E965DF4799B8E1F4984010F17D00D`）、导出与贴图脚本链（`export_cassette_layout.py`、`draw_card_layout.py`、`ref/export_production.py`、`ref/draw_ref_texture.py`、`ref/tex/card.png`）、交接文档、`reference/` 下 7 个 Git 对照 GLB 以及 `_backup/` 下 3 个近期代码／清理备份目录。
  - 通过 `Microsoft.VisualBasic.FileIO.FileSystem`（`SendToRecycleBin`）将 57 个旧文件（`public/assets/archive-cassette.glb.bak-before-ref`、`art/` 下 11 个初版 `.blend/.py/.png`、`design-preview/` 根目录 37 个 A 版／Glass 版 `.blend/.glb/.py`、`label-variants/ref/` 5 个旧 `.blend/.blend1/.bak/.glb`、`label-variants/seal-study/` 3 个过程草稿 `.blend`）与 5 个旧目录（`design-preview/pre-bevel-fix` 及 `_backup/` 下 4 个 11/15–11/18 换模备份目录）移入 Windows 回收站。
- **磨砂卡匣正面三区版式重设计（模型名称 + 可替换展示照片 + 底部四项标签）**（`src/data.ts`、`src/archive-overview-look.ts`、`src/scene.ts`、`src/main.ts`）：
  - `src/archive-overview-look.ts`：`archiveOverviewBadge` 采样范围扩展为完整 `REF_Glass` 正面（局部坐标 `x: -2.362..2.362`、`y: 0.139..3.565`，尺寸 `4.724 × 3.426`），采用 `2048 × 1485` RGBA 透明画布并按 `plateSample.a` 混合；透明区域完整保留磨砂玻璃与左下琥珀底光透射，不透明印制区域在浅色与暗色主题下均清晰呈现。
  - `src/scene.ts`（`drawOverviewBadge`、`drawMetricIcon`、`setCardPhoto`、`setCardStats`）：
    1. **左上模型名称铭牌**（`x: 105, y: 6, w: 746, h: 295`，对应局部 `x: -2.12..-0.40, y: 2.87..3.55`）：暖白底 `#faf5ec`、`4px` 深色边框，上部显示档案编号（如 `X-001`）与分隔线，下部显示自动换行／字号适配的模型名称（如 `CLAUDE SONNET-5.5`），在总览微抬与详情态位置完全连续。
    2. **中部可替换展示照片框**（`x: 105, y: 386, w: 1838, h: 776`，对应局部 `x: -2.12..+2.12, y: 0.88..2.67`）：`5px` 直角深色外框；当档案配置了 `cover` 或调用 `setCardPhoto(src, index?)` 时自动异步加载图片并按 `object-fit: cover` 居中裁切高清绘制；未配置图片时绘制暖纸渐变底、细建筑网格、四角取景线及居中的档案标题／分类日期占位说明。
    3. **底部四项数据与状态标签**（`y: 1222, h: 124`，左对齐 `x: 105`，间距 `28px`）：第一项为暖灰底 `#f0ece2` + 深灰框 `#444444`（`5.5px`）的状态标签（默认 `样本不足 · n=1`）；后三项为暖白底 `#faf7f0` + 纯黑框 `#111111`（`6.5px`）配矢量图标（浏览眼睛、下载箭头托盘、评论气泡）与数值标签（默认 `105`、`30`、`0`），总宽超界时自动等比收敛。
  - `src/data.ts` 与 `src/main.ts`：`ArchiveRecord` 新增可选 `cover?: string` 与 `stats?: ArchiveCardStats`（`sample`、`views`、`downloads`、`comments`）；`window.rhine` 新增 `setCardPhoto(src, index?)` 与 `setCardStats(stats, index?)` 供运行时即时替换。

### 已通过验证与最新收尾待办

- 本轮全部改动后已实跑通过：`.\node_modules\.bin\tsc -p tsconfig.json --noEmit`、`npm run check:content`（18/18）、`npm run check:viewport`、`node scripts/check-loop.mjs`、`node scripts/check-archive-visibility.mjs`、`node scripts/check-motion.mjs`、`node scripts/check-motion-preferences.mjs`、`node scripts/check-theme.mjs`、`node --experimental-strip-types scripts/check-archive.mjs`、`node scripts/check-assembly.mjs`、`node scripts/check-shell.mjs`、`node scripts/check-internal-optics.mjs`，并通过 `dev-shot.mjs` 实机截图（`RhineLabUI-screenshots/card-redesign-detail.png`）核验详情态三区版式与磨砂底光效果。
- 仍待收尾项（按「交付工作流」推进）：
  1. 清理 `src/scene.ts` 未引用的 `ISOLATED_SPOT_LIGHTS_FRAGMENT` 常量，并评估 `this.ao.enabled = false` 是否应仅针对浅色总览而非全局关闭；
  2. 待用户确认重设计后的正面三区版式（或接入各档案真实 `cover` 展示图与 `stats` 数据）后，重新执行 `npm run build` 与 `npm run build:wallpaper` 更新构建产物（顺带移除旧构建中残留的 `.bak-before-ref` 副本）；
  3. 复跑其余浏览器／回归检查脚本并核验壁纸模式、360° 查看器、暗色模式与超级性能模式；
  4. 派独立只读子代理审计并按三级清单修正复验后，提交四项交付报告等待用户终审（未经终审不提交、不推送、不合并）。
