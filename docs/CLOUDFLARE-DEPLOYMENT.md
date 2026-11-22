# Cloudflare Pages 构建与部署

## 静态打包命令

在 `RhineLabUI/` 安装依赖后执行：

```sh
npm run build:cloudflare
```

打包脚本（`scripts/package-cloudflare.mjs`）会先执行完整生产构建，再基于 `dist/pwa-build.json` 打包静态发行目录：

- **本地手动上传模式**：输出至 `release/cloudflare/<version>/`，并将本次版本目录、文件数与字节数写入 `release/cloudflare/latest.json`。
- **Cloudflare Pages Git 自动构建模式**：在 Pages 构建环境变量 `CF_PAGES=1` 下，稳定输出至 `release/cloudflare/site`。
- **字体资源**：统一使用仓库随附的 `public/fonts/misans-webfont-4.3.1/`，不依赖任何外部受限字体包。
- **平台限额校验**：打包时自动检查单文件不超过 `25 MiB`、总文件数不超过 Cloudflare 免费计划上限（`20,000` 个）。

## 缓存标头与 404 回退

发行包自动生成 `_headers` 与 `404.html`：

- `/fonts/misans-webfont-4.3.1/*` 与带内容哈希的 GLB 模型（`assets/archive-(cassette|assembly).<16位十六进制>.glb`）配置为 `public, max-age=31536000, immutable`。
- `/`、`/index.html`、`/update*`、`/sw.js` 配置为 `no-cache, no-store, must-revalidate`。
- `/manifest.webmanifest` 与 `/pwa-build.json` 配置为 `no-cache, must-revalidate`。
- `404.html` 防止缺失的模型或静态资源误回落为首页 HTML。

## 首页 308 重定向与 Service Worker 兼容

Cloudflare Pages 会将 `/index.html` 308 重定向至 `/`。若 Service Worker 直接把跟随重定向后的 `Response` 存入缓存，浏览器在以 `manual` 重定向模式导航首页时会触发 `ERR_FAILED`。

当前 Service Worker 预缓存从作用域目录 URL 获取首页并仍以 `index.html` 为版本缓存键；读取历史 `redirected` 响应时会重建清洁 `Response`（保留正文、状态码与响应头）。离线安装与恢复流程见 [PWA 离线说明](PWA.md)。

验证命令：

```sh
node --test scripts/check-pwa-redirect.mjs
```
