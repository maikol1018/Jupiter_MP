// ============================================================
// Jupiter VPS Relay — 部署在香港 VPS 上的 Gemini API 中转服务器
// 通过 Cloudflare Worker 中转调用 Google Gemini API（绕过地区限制）
// ============================================================
const http = require('http');
const https = require('https');

// ─── 配置 ───────────────────────────────────────────────────
const PORT = 3000;
const MODEL = 'gemini-2.5-flash';
// ⬇️ 部署 Cloudflare Worker 后，把这个 URL 改成你的 Worker 地址
const WORKER_URL = process.env.WORKER_URL || 'https://jupiter-relay.jupiter-astro.workers.dev';
// Worker 验证密钥（和 Worker 的 AUTH_KEY 环境变量保持一致）
const AUTH_KEY = process.env.AUTH_KEY || 'jupiter-2026';

// 简易速率限制：每个 IP 每分钟最多 30 次请求
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000;
const ipRequests = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = ipRequests.get(ip);
  if (!record || now - record.start > RATE_WINDOW) {
    ipRequests.set(ip, { start: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT;
}

// 每 5 分钟清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequests) {
    if (now - record.start > RATE_WINDOW) ipRequests.delete(ip);
  }
}, 5 * 60 * 1000);
// ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: MODEL }));
    return;
  }

  // 只处理 POST /api/generate
  if (req.method !== 'POST' || req.url !== '/api/generate') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // 速率限制
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '请求过于频繁，请稍后再试' }));
    return;
  }

  let body = '';
  let bodySize = 0;
  const MAX_BODY = 100 * 1024; // 100KB

  req.on('data', chunk => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请求体过大' }));
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on('end', () => {
    if (bodySize > MAX_BODY) return;

    let prompt, systemInstruction, temperature;
    try {
      const parsed = JSON.parse(body);
      prompt = parsed.prompt;
      systemInstruction = parsed.systemInstruction;
      temperature = parsed.temperature;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '无效的 JSON' }));
      return;
    }

    if (!prompt || typeof prompt !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少 prompt' }));
      return;
    }

    const postData = JSON.stringify({
      prompt,
      systemInstruction,
      temperature,
    });
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] ${clientIp} → Worker (${prompt.substring(0, 60)}...)`);

    const workerUrl = new URL('/api/generate', WORKER_URL);

    const apiReq = https.request(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Key': AUTH_KEY,
      },
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', c => data += c);
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.error(`[${ts}] Gemini error:`, json.error.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Gemini API error: ' + json.error.message }));
            return;
          }

          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!text) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Gemini 返回空响应' }));
            return;
          }

          console.log(`[${ts}] OK (${text.substring(0, 60)}...)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text }));
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '解析 Gemini 响应失败' }));
        }
      });
    });

    apiReq.on('error', (e) => {
      console.error(`[${ts}] Network error:`, e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI 服务不可用: ' + e.message }));
    });

    apiReq.write(postData);
    apiReq.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════');
  console.log(`  Jupiter Relay Server`);
  console.log(`  Port: ${PORT} | Model: ${MODEL}`);
  console.log(`  Worker: ${WORKER_URL}`);
  console.log('═══════════════════════════════════════════');
});
