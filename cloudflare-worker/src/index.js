// ============================================================
// Cloudflare Worker — Gemini API 透传代理
// 部署到 Cloudflare Workers (免费)，绕过地区限制
// 静态音频文件通过 [assets] 配置自动托管在 /audio/ 下
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
          'Access-Control-Allow-Headers': 'Content-Type,X-Auth-Key',
        },
      });
    }

    // Health check
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', worker: true });
    }

    // 验证请求来源（用 env 里的密钥）
    const authHeader = request.headers.get('X-Auth-Key');
    if (env.AUTH_KEY && authHeader !== env.AUTH_KEY) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 访问统计 /api/visit ───────────────────────────────
    // GET：仅返回当前累计；POST { deviceId }：上报一次访问
    if (url.pathname === '/api/visit') {
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (!env.VISITS) {
        return Response.json(
          { error: 'KV namespace VISITS 未绑定' },
          { status: 500, headers: cors }
        );
      }
      try {
        if (request.method === 'GET') {
          const total = parseInt((await env.VISITS.get('total')) || '0', 10);
          const unique = parseInt((await env.VISITS.get('unique')) || '0', 10);
          return Response.json({ total, unique }, { headers: cors });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const deviceId = (body.deviceId || '').toString().slice(0, 64);

          // 累计访问 +1
          const total = parseInt((await env.VISITS.get('total')) || '0', 10) + 1;
          await env.VISITS.put('total', String(total));

          // 独立用户：deviceId 第一次出现才 +1
          let unique = parseInt((await env.VISITS.get('unique')) || '0', 10);
          if (deviceId) {
            const key = `u:${deviceId}`;
            const seen = await env.VISITS.get(key);
            if (!seen) {
              await env.VISITS.put(key, '1');
              unique += 1;
              await env.VISITS.put('unique', String(unique));
            }
          }
          return Response.json({ total, unique }, { headers: cors });
        }
        return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: cors });
      } catch (e) {
        return Response.json(
          { error: 'Visit counter error: ' + e.message },
          { status: 500, headers: cors }
        );
      }
    }
    // ─────────────────────────────────────────────────────

    // Only allow POST /api/generate
    if (request.method !== 'POST' || url.pathname !== '/api/generate') {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }

    try {
      const body = await request.json();
      const { prompt, systemInstruction, temperature, provider, task } = body;

      if (!prompt) {
        return Response.json({ error: '缺少 prompt' }, { status: 400 });
      }

      if (provider === 'qwen') {
        if (task !== 'daily') {
          return Response.json(
            { error: 'Qwen 目前只允许每日运程使用' },
            { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const apiKey = env.QWEN_API_KEY || env.DASHSCOPE_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: 'Qwen 未配置：请在 Worker secret 设置 QWEN_API_KEY 或 DASHSCOPE_API_KEY' },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const qwenModel = env.QWEN_DAILY_MODEL || env.QWEN_MODEL || 'qwen-turbo';
        const qwenBase = (env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });

        const qwenRes = await fetch(`${qwenBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: qwenModel,
            messages,
            temperature: typeof temperature === 'number' ? temperature : 0.2,
          }),
        });

        const qwenJson = await qwenRes.json().catch(() => ({}));
        if (!qwenRes.ok || qwenJson.error) {
          const detail = qwenJson.error?.message || qwenJson.message || `Qwen HTTP ${qwenRes.status}`;
          return Response.json(
            { error: 'Qwen API error: ' + detail },
            { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const qwenText = qwenJson.choices?.[0]?.message?.content || '';
        if (!qwenText) {
          return Response.json(
            { error: 'Qwen 返回空响应' },
            { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
          );
        }

        return Response.json({ text: qwenText, provider: 'qwen', model: qwenModel }, {
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
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

      // 检查是否被安全过滤或无候选结果
      const candidate = json.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const text = candidate?.content?.parts?.[0]?.text || '';

      if (!text) {
        // 提供更详细的错误信息
        let detail = 'Gemini 返回空响应';
        if (finishReason && finishReason !== 'STOP') {
          detail = `Gemini 生成被中断 (${finishReason})`;
        }
        if (json.promptFeedback?.blockReason) {
          detail = `请求被安全过滤 (${json.promptFeedback.blockReason})`;
        }
        if (!json.candidates || json.candidates.length === 0) {
          detail = '无候选结果，可能模型暂时不可用';
        }
        return Response.json(
          { error: detail },
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
