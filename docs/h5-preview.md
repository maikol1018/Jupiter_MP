# H5 手机预览模式

这个项目现在可以像 `D:\Code\BAZI` 一样用 HTML/H5 手机宽度预览。

## 本地启动

1. 启动中转服务：

   ```bash
   $env:GEMINI_API_KEY="你的_key"
   $env:AUTH_KEY="jupiter-2026"
   node vps-server.js
   ```

2. 启动 H5 预览：

   ```bash
   npm run dev:h5
   ```

默认访问 `http://localhost:5173`。本地 H5 预览在 `JUPITER_API_BASE` 留空时会请求同源 `/api`，再由 Taro devServer 代理到 `JUPITER_API_PROXY_TARGET`。

这样手机访问 `http://192.168.0.11:5173` 时，也不会去连手机自己的 `localhost:3000`，也不会受 webpack 代理超时影响，而是直接连公网 HTTPS 中转域名。

也可以复制 `.env.example` 为 `.env`，像 BAZI 一样在 `.env` 里调整本地代理目标。

如果你要调本机中转，把 `.env` 改成：

```bash
JUPITER_API_BASE=
JUPITER_API_PROXY_TARGET=http://localhost:3000
```

然后另开终端启动 `node vps-server.js`。

## 生产域名

如果 H5 前端和 API 放在同一个域名下，Nginx/Cloudflare Pages 把 `/api` 和 `/audio` 反代到 `vps-server.js` 即可，`JUPITER_API_BASE` 保持空值。

仓库已经包含 BAZI 同款 Cloudflare Pages Functions：

- `functions/api/[[path]].ts`：同源 `/api/*` 转发到 Cloudflare Worker
- `functions/audio/[[path]].ts`：同源 `/audio/*` 转发到 Cloudflare Worker

所以 H5 部署到 Cloudflare Pages 时，前端仍然只访问当前站点自己的 `/api` 和 `/audio`。中国地区与海外地区用户都走同一个入口，避免暴露或直连不稳定上游。

如果前端和 API 分开部署，把 `JUPITER_API_BASE` 设为完整 API 域名，例如 `https://api.jupiter-astro.top`。

国内 CDN 部署使用专门命令：

```bash
npm run build:h5:cdn
```

这个命令会输出可以上传到国内 CDN 的 `dist`，并让前端请求 `https://api.jupiter-astro.top` 作为 Gemini 中转 API。详见 `docs/china-cdn-gemini.md`。

## 是否需要新域名

不一定需要。已有 `api.jupiter-astro.top` 可以继续作为中转 API 域名；H5 页面可以挂在同一个主域名的另一个路径或子域名。只有在你想让 Jupiter H5 拥有独立品牌入口、或现有域名不能新增站点/子域名时，才需要另买域名。