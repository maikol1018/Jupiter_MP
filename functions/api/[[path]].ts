// Pages Functions 同源代理：把 /api/* 反代到 Cloudflare Worker。
// 与 BAZI 同款：前端只访问当前域名的 /api，避免用户端直连 workers.dev 或临时隧道。
const UPSTREAM = 'https://jupiter-relay.jupiter-astro.workers.dev';

export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const target = `${UPSTREAM}${url.pathname}${url.search}`;

  const headers = new Headers(ctx.request.headers);
  headers.delete('host');

  const init: RequestInit = {
    method: ctx.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(ctx.request.method)
      ? undefined
      : await ctx.request.arrayBuffer(),
  };

  try {
    const resp = await fetch(target, init);
    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: '边缘代理失败，请稍后再试' }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
};