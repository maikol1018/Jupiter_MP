// 与 /api 一样走 Pages 同源代理，音频文件由 Worker assets 托管。
const UPSTREAM = 'https://jupiter-relay.jupiter-astro.workers.dev';

export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const target = `${UPSTREAM}${url.pathname}${url.search}`;

  const headers = new Headers(ctx.request.headers);
  headers.delete('host');

  try {
    const resp = await fetch(target, {
      method: ctx.request.method,
      headers,
      body: ['GET', 'HEAD'].includes(ctx.request.method)
        ? undefined
        : await ctx.request.arrayBuffer(),
    });
    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  } catch (_error) {
    return new Response('Audio proxy failed', { status: 502 });
  }
};