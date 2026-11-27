# 主屏幕安装与离线使用

在支持安装网页应用的浏览器中打开部署后的 **DEEPDEMOS 档案库**。iPhone 或 iPad 可在 Safari 中选择「分享 → 添加到主屏幕」；桌面端可通过浏览器地址栏或菜单安装。

安装或首次打开后保持联网并进入档案阵列，Service Worker 会在后台缓存模型、MiSans 字体分包、背景配乐及档案 TXT 等离线资源。清理网站数据或被系统回收缓存后，重新联网访问即可补齐。

首次进入遵循系统的「减少动态效果」偏好；若开启背景音乐，点击入口或按 `Enter` 可解锁浏览器音频，加载失败时可重试或关闭音乐后直接进入。

> 旧 2D HUD 与设置面板已移除，归档态更新横幅保持隐藏；更新或排障请直接使用下方的 `/update.html` 恢复入口。

## 更新与恢复

如果浏览器仍停留在旧版缓存，在同一站点直接访问 `/update.html` 并点击「更新并返回」。恢复页会联网获取最新版本并重新写入离线缓存，同时保留本地已有的收藏与偏好设置。

## 本地验证

```sh
npm run build
npm run preview
```

在 HTTPS 或 `localhost` / `127.0.0.1` 的生产预览中访问即可观察 Service Worker 注册与离线缓存；`npm run dev` 开发模式下不注册 Service Worker。缓存标头与静态部署规则见 [Cloudflare Pages 构建与部署](CLOUDFLARE-DEPLOYMENT.md)。
