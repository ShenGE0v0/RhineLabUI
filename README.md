# DEEPDEMOS 档案库

用可交互的三维档案阵列浏览 AI 作品。项目以 TypeScript、Three.js 和 Vite 构建，按艺术生成、空间场景、音乐交互、物理模拟和游戏原型收录 40 份档案。

本项目基于 [LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI) 二次开发，沿用上游的三维档案系统，并改造品牌、作品数据、档案面板与入场动效。各档案的作品信息整理自 [DeepDemos](https://deepdemos.top/)，数据文件和 TXT 档案均保留对应作品的来源链接。

## 本地运行

推荐使用 **Node.js 24（24.12 或更新版本）**，以及支持 WebGL 2 的浏览器。

```sh
git clone https://github.com/ShenGE0v0/RhineLabUI.git
cd RhineLabUI
npm ci
npm run dev
```

打开终端显示的地址，默认是 http://127.0.0.1:5173/。Windows 也可双击 [启动终端.cmd](启动终端.cmd)，脚本会按需安装依赖并打开浏览器。

```sh
npm run build
npm run preview
```

网页构建产物位于 `dist/`，可部署到静态 HTTP 服务。执行 `npm run build:wallpaper` 可生成 Wallpaper Engine 本地版本，产物位于 `release/wallpaper/`。

## 浏览档案

- 网页版用方向键或拖动阵列切列、翻档。悬停预选时显示档案标题，选中后显示模型名与可识别的厂商图标。按 `Enter` 展开选中的卡面，按 `Esc` 返回阵列。
- 按 `/` 打开检索，可按作品名、编号、模型名或分类查找档案。原作链接和下载文本可在[档案数据](content/archives.json)及 [TXT 目录](public/archives/)中查阅。
- Wallpaper Engine 本地版本提供详情面板，可查看作品记录、访问原作、收藏和下载 TXT，并从详情进入支持旋转、缩放和拆解的 360° 查看器。

## 修改档案

| 路径 | 用途 |
| --- | --- |
| [content/archives.json](content/archives.json) | 档案信息、分类和原作链接 |
| [public/archives/](public/archives/) | 可下载的 TXT 档案 |
| [src/](src/) | 页面、三维场景和交互 |
| [public/assets/](public/assets/) | 运行所需的 GLB 模型和厂商图标 |

`npm run dev` 和 `npm run build` 会在执行前校验档案数据并更新 TXT。修改数据后，也可以单独运行 `npm run export:archives` 重新导出，再用 `npm run check:content` 检查导出是否与数据一致。

## 上游与许可

- 上游为 **LBEILC / RhineLabUI**，保留 `Copyright (c) 2026 LBEILC` 和 [MIT 许可证](LICENSE)。此前引入的渲染优化保留 [PR #15 贡献署名](PR15-ATTRIBUTION.md)。
- 上游视觉参考鹰角网络《明日方舟》特别映像「莱茵生命：访问」。相关名称、标志和原作素材的权利归各自权利人所有。[原始 PV](https://www.bilibili.com/video/BV1rr4y1b7sz/)
- 档案所引用的作品版权归原作者所有。厂商图标来自 Lobe Icons，品牌标志的权利归各自权利人所有。[图标来源与许可](public/licenses/lobe-icons.txt)
- 字体、数字滚动组件和配乐的来源与许可见 [MiSans](public/fonts/MiSans-license.pdf)、[Rolling Number](public/licenses/rolling-number.txt) 和 [音频说明](public/audio/README.md)。
