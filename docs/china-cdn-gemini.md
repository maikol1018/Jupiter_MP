# 国内 CDN + Gemini 中转部署

这个方案把 H5 静态资源放到国内 CDN，把 Gemini 调用留在后端中转服务里。

```text
用户浏览器
  -> 国内 CDN / 对象存储：index.html、JS、CSS、图片、音频入口
  -> https://api.jupiter-astro.top：VPS Node 中转
  -> Gemini API
```

## 构建国内 CDN 版本

如果使用默认 VPS API，直接运行：

```bash
npm run build:h5:cdn
```

构建脚本会把 H5 里的 API 地址写成：

```text
https://api.jupiter-astro.top
```

然后把 `dist` 目录上传到国内 CDN 或对象存储即可。

如需换 API 域名，复制 `.env.cdn.example` 为 `.env.cdn` 后修改：

```bash
JUPITER_API_BASE=https://api.jupiter-astro.top
JUPITER_AUTH_KEY=jupiter-2026
JUPITER_SHARE_URL=https://你的前端域名/
```

再运行：

```bash
npm run build:h5:cdn
```

## 后端要求

`api.jupiter-astro.top` 必须继续指向能访问 Gemini 的 VPS。当前仓库里的 `vps-server.js` 已支持：

- `POST /api/generate`
- `POST /api/generate-job`
- `GET /api/generate-job/:id`
- `GET/POST /api/visit`
- `GET /audio/*.mp3`
- `GET /health`

浏览器跨域请求需要 CORS。`vps-server.js` 已允许国内 CDN 前端请求这些接口，并且 Gemini API Key 只保存在服务器环境变量里，不会打包进前端。

## CDN 配置建议

国内 CDN 只缓存静态文件，不缓存 API：

- `index.html`：不缓存或短缓存，例如 `no-cache` / `max-age=0`
- `/js/*`、`/css/*`、`/static/*`：长缓存，例如 30 天到 1 年
- `/api/*`：不要走 CDN 缓存，直接请求 `https://api.jupiter-astro.top`

如果 CDN 控制台有“回源规则”，静态资源回源到对象存储即可，不需要把 `/api` 也挂到 CDN 上。

## 和 Cloudflare Pages 版本的区别

普通 H5 构建：

```bash
npm run build:h5
```

适合 Cloudflare Pages，默认前端请求同源 `/api`，再由 Pages Functions 转发到 Worker。

国内 CDN 构建：

```bash
npm run build:h5:cdn
```

适合把 `dist` 上传到国内 CDN，前端直接请求 `https://api.jupiter-astro.top`，由 VPS 中转调用 Gemini。