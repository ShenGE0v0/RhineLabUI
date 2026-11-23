# DEEPDEMOS 档案库

用可交互的三维档案阵列浏览 AI 作品。项目以 TypeScript、Three.js 和 Vite 构建，按艺术生成、空间场景、音乐交互、物理模拟和游戏原型收录 40 份档案。

本项目基于 [LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI) 二次开发，沿用上游的三维档案系统，并重做品牌、作品数据、卡匣外观、入场与详情镜头。各档案的作品信息整理自 [DeepDemos](https://deepdemos.top/)，数据文件和 TXT 档案均保留对应作品的来源链接。

## 项目文档

| 文档 | 用途 |
| --- | --- |
| [网页交接](docs/HANDOFF.md) | 当前代码基线、资产 SHA-256、控制台调试入口与待办 |
| [开发规范与交付流程](docs/AGENTS.md) | 技术边界、编码红线、命令速查与审核交付流程 |
| [设计规范](docs/DESIGN.md) | 网页端形态、三维阵列、卡匣、布光、卡面与音频规范 |
| [档案数据维护](content/README.md) | `archives.json` 字段定义、数量约束与 TXT 导出校验 |
| [Cloudflare 部署](docs/CLOUDFLARE-DEPLOYMENT.md) · [PWA 离线说明](docs/PWA.md) | 静态托管构建、缓存策略、主屏幕安装与更新恢复 |
| 本地工作区 `../design-preview/README.md` | 仓库同级目录的 Blender 源文件、导出链与建模避坑手册 |

## 本地运行

推荐使用 **Node.js 24（24.12 或更新版本）**，以及支持 WebGL 2 的浏览器。

```sh
git clone https://github.com/ShenGE0v0/RhineLabUI.git
cd RhineLabUI
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://127.0.0.1:5173/`。Windows 也可双击 [启动终端.cmd](启动终端.cmd)，脚本会按需安装依赖并打开浏览器。

```sh
npm run build
npm run preview
```

网页构建产物位于 `dist/`，可部署到静态 HTTP 服务。

## 浏览档案

- **网页纯净画布模式**：用方向键、滚轮或拖动阵列切列、翻档；指针悬停卡片时产生 3D 微抬并预选，选中卡片在卡匣正面展示作品标题、生成模型名、厂商图标、展示图、互动统计、刻录日期与 Code 39 条码。按 `Enter` 或双击展开选中卡片（长焦推进至 3/4 正面特写，保持磨砂卡匣质感），按 `Esc` 返回阵列。
- **快捷检索**：按 `/` 打开检索，可按作品名、编号、模型名或分类查找档案。原作链接和下载文本可在[档案数据](content/archives.json)及 [TXT 目录](public/archives/)中查阅。

## 修改档案

| 路径 | 用途 |
| --- | --- |
| [content/archives.json](content/archives.json) | 档案信息、分类、封面与统计快照、原作链接 |
| [public/archives/](public/archives/) | 可下载的 TXT 档案 |
| [src/](src/) | 页面、三维场景、卡面绘制与交互逻辑 |
| [public/assets/](public/assets/) | 运行所需的 GLB 模型和厂商图标 |

`npm run dev` 和 `npm run build` 会在执行前校验档案数据并更新 TXT。修改数据后，也可以单独运行 `npm run export:archives` 重新导出，再用 `npm run check:content` 检查导出是否与数据一致。

## 上游与许可

- 上游为 **LBEILC / RhineLabUI**，保留 `Copyright (c) 2026 LBEILC` 和 [MIT 许可证](LICENSE)。此前引入的渲染优化保留 [PR #15 贡献署名](docs/PR15-ATTRIBUTION.md)。
- 档案所引用的作品版权归原作者所有。厂商图标来自 Lobe Icons，品牌标志的权利归各自权利人所有。[图标来源与许可](public/licenses/lobe-icons.txt)
- 字体、数字滚动组件和配乐的来源与许可见 [MiSans](public/fonts/MiSans-license.pdf)、[Rolling Number](public/licenses/rolling-number.txt) 和 [音频说明](public/audio/README.md)。
