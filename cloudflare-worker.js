// ============================================================
// Cloudflare Worker — Gemini API 透传代理
// 部署到 Cloudflare Workers (免费)，绕过地区限制
// ============================================================

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Health check
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', worker: true });
    }

    // Only allow POST /api/generate
    if (request.method !== 'POST' || url.pathname !== '/api/generate') {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }

    // 验证请求来源（用 env 里的密钥）
    const authHeader = request.headers.get('X-Auth-Key');
    if (env.AUTH_KEY && authHeader !== env.AUTH_KEY) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const body = await request.json();
      const { prompt, systemInstruction, temperature } = body;

      if (!prompt) {
        return Response.json({ error: '缺少 prompt' }, { status: 400 });
      }

      const API_KEY = env.GEMINI_API_KEY;
      const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';

      const geminiBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {},
      };
      if (temperature !== undefined) geminiBody.generationConfig.temperature = temperature;
      if (systemInstruction) {
        geminiBody.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });

      const json = await apiRes.json();

      if (json.error) {
        return Response.json(
          { error: 'Gemini API error: ' + json.error.message },
          { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        return Response.json(
          { error: 'Gemini 返回空响应' },
          { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
      }

      return Response.json({ text }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch (e) {
      return Response.json(
        { error: 'Worker error: ' + e.message },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
  },
};
