// ============================================================
// Jupiter VPS Relay —— 部署在香港 / 海外 VPS 上的一站式中转服务
//
// 职责（一台机器全包，小程序只需要这一个域名）：
//   1. POST /api/generate  —— 直接调用 Google Gemini（不再经 Cloudflare Worker）
//   2. GET  /api/visit     —— 返回累计访问统计
//      POST /api/visit     —— 上报一次访问 { deviceId }
//   3. GET  /audio/*.mp3   —— 启动页语音（splash-0.mp3 ~ splash-4.mp3）
//   4. GET  /health        —— 健康检查
//
// 设计参考：BAZI 项目的 server/src/index.ts —— 服务端持有 GEMINI_API_KEY，
// 直连 Gemini API。在能直连 Google 的香港 VPS 上跑最简单；如果 VPS 不能
// 直连，可设置 HTTPS_PROXY 环境变量走代理（需要 npm i https-proxy-agent）。
//
// ─── 部署速查 ────────────────────────────────────────────────
//   1) scp vps-server.js + public/audio/ 到 VPS
//   2) export GEMINI_API_KEY=xxx
//      export PORT=3000                          # 可选，默认 3000
//      export AUTH_KEY=jupiter-2026              # 必须和小程序端 X-Auth-Key 一致
//      export HTTPS_PROXY=http://127.0.0.1:7890  # 可选，VPS 不能直连 Google 时
//      export VISIT_DB=/var/lib/jupiter/visits.json  # 可选，访问统计落盘路径
//   3) node vps-server.js   （生产建议用 pm2/systemd 守护）
//   4) Nginx 反向代理 https://api.your-domain.com → 127.0.0.1:3000
//   5) 把 api.your-domain.com 加到微信小程序后台 request/downloadFile 合法域名
//   6) 修改 src/services/apiService.ts 里的 PROXY_BASE_URL
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

function loadEnvFile(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || value === '' || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

loadEnvFile('.env');

// ─── 配置 ───────────────────────────────────────────────────
const PORT          = Number(process.env.PORT) || 3000;
const MODEL         = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY       = process.env.GEMINI_API_KEY;
const AUTH_KEY      = process.env.AUTH_KEY || 'jupiter-2026';
const GEMINI_BASE   = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const AI_GATEWAY_TOKEN = process.env.AI_GATEWAY_TOKEN || '';
const VISIT_DB      = process.env.VISIT_DB || path.join(__dirname, 'visits.json');
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 180000;
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS) || 30 * 60 * 1000;

// 音频目录：优先 ./public/audio，回退到 ./cloudflare-worker/public/audio
const AUDIO_DIRS = [
  path.join(__dirname, 'public', 'audio'),
  path.join(__dirname, 'cloudflare-worker', 'public', 'audio'),
];

if (!API_KEY) {
  console.error('[fatal] 未配置 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

// ─── 可选：HTTPS 代理（参考 BAZI server） ─────────────────────
let proxyAgent = null;
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy;

async function initProxyAgent() {
  if (!proxyUrl) return;
  try {
    const mod = await import('https-proxy-agent');
    const Ctor = mod.HttpsProxyAgent || (mod.default && mod.default.HttpsProxyAgent) || mod.default;
    proxyAgent = new Ctor(proxyUrl);
    console.log(`[server] 使用 HTTPS 代理: ${proxyUrl}`);
  } catch (e) {
    console.warn(`[server] 检测到 HTTPS_PROXY=${proxyUrl}，但代理初始化失败，将忽略代理`);
    console.warn(`[server] 代理错误: ${e.message}`);
  }
}

// ─── 速率限制（每 IP 每分钟） ────────────────────────────────
const RATE_LIMIT  = Number(process.env.RATE_LIMIT) || 30;
const RATE_WINDOW = 60 * 1000;
const ipRequests  = new Map();
const generateJobs = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const rec = ipRequests.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW) {
    ipRequests.set(ip, { start: now, count: 1 });
    return true;
  }
  rec.count++;
  return rec.count <= RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of ipRequests) {
    if (now - rec.start > RATE_WINDOW) ipRequests.delete(ip);
  }
}, 5 * 60 * 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of generateJobs) {
    if (now - job.updatedAt > JOB_TTL_MS) generateJobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

// ─── 访问统计：JSON 文件存储 ─────────────────────────────────
let visits = { total: 0, unique: 0, devices: {} };
try {
  if (fs.existsSync(VISIT_DB)) {
    const raw = fs.readFileSync(VISIT_DB, 'utf8');
    const parsed = JSON.parse(raw);
    visits = {
      total: Number(parsed.total) || 0,
      unique: Number(parsed.unique) || 0,
      devices: parsed.devices && typeof parsed.devices === 'object' ? parsed.devices : {},
    };
  }
} catch (e) {
  console.warn(`[server] 读取 ${VISIT_DB} 失败，使用空统计:`, e.message);
}

let visitWriteTimer = null;
function persistVisits() {
  if (visitWriteTimer) return;
  visitWriteTimer = setTimeout(() => {
    visitWriteTimer = null;
    try {
      fs.mkdirSync(path.dirname(VISIT_DB), { recursive: true });
      fs.writeFileSync(VISIT_DB, JSON.stringify(visits), 'utf8');
    } catch (e) {
      console.warn('[server] 写入访问统计失败:', e.message);
    }
  }, 1000);
}

// ─── 工具函数 ────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Auth-Key,Accept,X-Stream',
  'Access-Control-Max-Age': '86400',
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(obj));
}

function readJSONBody(req, maxBytes = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('无效的 JSON')); }
    });
    req.on('error', reject);
  });
}

// ─── 直连 Gemini ─────────────────────────────────────────────
function callGemini({ prompt, systemInstruction, temperature }) {
  return new Promise((resolve, reject) => {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {},
    };
    if (typeof temperature === 'number') payload.generationConfig.temperature = temperature;
    if (systemInstruction) {
      payload.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
    }

    const apiUrl = new URL(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`);
    const data = Buffer.from(JSON.stringify(payload), 'utf8');

    const reqOpts = {
      method: 'POST',
      hostname: apiUrl.hostname,
      path: apiUrl.pathname + apiUrl.search,
      port: apiUrl.port || 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...(AI_GATEWAY_TOKEN ? { 'cf-aig-authorization': `Bearer ${AI_GATEWAY_TOKEN}` } : {}),
      },
      timeout: REQUEST_TIMEOUT_MS,
    };
    if (proxyAgent) reqOpts.agent = proxyAgent;

    const apiReq = https.request(reqOpts, apiRes => {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); }
        catch { return reject(new Error(`Gemini 返回非 JSON: ${text.slice(0, 200)}`)); }

        if (json.error) return reject(new Error('Gemini API: ' + json.error.message));

        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const replyText = (candidate?.content?.parts || []).map(p => p?.text || '').join('') || '';

        if (!replyText) {
          if (json.promptFeedback?.blockReason) {
            return reject(new Error(`请求被安全过滤 (${json.promptFeedback.blockReason})`));
          }
          if (finishReason && finishReason !== 'STOP') {
            return reject(new Error(`Gemini 生成被中断 (${finishReason})`));
          }
          return reject(new Error('Gemini 返回空响应'));
        }
        resolve(replyText);
      });
    });

    apiReq.on('timeout', () => { apiReq.destroy(new Error('请求超时')); });
    apiReq.on('error', reject);
    apiReq.write(data);
    apiReq.end();
  });
}

// ─── 流式直连 Gemini（SSE 转发 + 心跳） ──────────────────────
// 关键作用：国内 → 香港 跨境 TCP 在长时间空闲（>30s）时常被
// 中间设备（GFW / 运营商 CGNAT）静默 RST。Gemini 非流式生成
// 一次要 20–60s，期间链路完全空闲就会被掐断，呈现为"国外网
// 能生成、国内网不能生成"。改成流式后，每来一段就立即转发，
// 加上心跳，连接全程有数据流动，问题消失。
function streamGemini({ prompt, systemInstruction, temperature, onDelta, onDone, onError }) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {},
  };
  if (typeof temperature === 'number') payload.generationConfig.temperature = temperature;
  if (systemInstruction) {
    payload.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }

  const apiUrl = new URL(
    `${GEMINI_BASE}/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${API_KEY}`
  );
  const data = Buffer.from(JSON.stringify(payload), 'utf8');

  const reqOpts = {
    method: 'POST',
    hostname: apiUrl.hostname,
    path: apiUrl.pathname + apiUrl.search,
    port: apiUrl.port || 443,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Accept': 'text/event-stream',
      ...(AI_GATEWAY_TOKEN ? { 'cf-aig-authorization': `Bearer ${AI_GATEWAY_TOKEN}` } : {}),
    },
    timeout: REQUEST_TIMEOUT_MS,
  };
  if (proxyAgent) reqOpts.agent = proxyAgent;

  let fullText = '';
  let blocked = '';
  let failReason = '';

  const processBlock = (block) => {
    // Gemini SSE: 每个 event 的 data 行形如 `data: { ...json... }`，可能多行
    const dataLines = block
      .split(/\r?\n/)
      .map(l => l.replace(/\r$/, ''))
      .filter(l => l.startsWith('data:'));
    if (!dataLines.length) return;
    const jsonText = dataLines.map(l => l.slice(5).trim()).join('');
    if (!jsonText || jsonText === '[DONE]') return;
    let obj;
    try { obj = JSON.parse(jsonText); } catch { return; }
    if (obj.error) { failReason = obj.error.message || 'Gemini error'; return; }
    const cand = obj.candidates && obj.candidates[0];
    const partText = ((cand && cand.content && cand.content.parts) || [])
      .map(p => (p && p.text) || '').join('');
    if (partText) {
      fullText += partText;
      try { onDelta(partText); } catch {}
    }
    if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
      failReason = `生成被中断 (${cand.finishReason})`;
    }
    if (obj.promptFeedback && obj.promptFeedback.blockReason) {
      blocked = obj.promptFeedback.blockReason;
    }
  };

  const apiReq = https.request(reqOpts, apiRes => {
    let buf = '';
    let upstreamStatus = apiRes.statusCode || 0;
    apiRes.setEncoding('utf8');
    apiRes.on('data', chunk => {
      buf += chunk;
      // 同时兼容 \n\n 与 \r\n\r\n 两种 SSE 分隔
      let sepIdx;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const a = buf.indexOf('\n\n');
        const b = buf.indexOf('\r\n\r\n');
        let sepLen = 2;
        if (a === -1 && b === -1) break;
        if (b !== -1 && (a === -1 || b < a)) { sepIdx = b; sepLen = 4; }
        else { sepIdx = a; sepLen = 2; }
        const block = buf.slice(0, sepIdx);
        buf = buf.slice(sepIdx + sepLen);
        processBlock(block);
      }
    });
    apiRes.on('end', () => {
      // flush 残留 buffer（上游可能不以 \n\n 结尾）
      if (buf && buf.trim()) {
        processBlock(buf);
        buf = '';
      }
      if (!fullText) {
        const msg = blocked
          ? `请求被安全过滤 (${blocked})`
          : (failReason || (upstreamStatus >= 400
              ? `Gemini upstream HTTP ${upstreamStatus}`
              : 'Gemini 返回空响应'));
        return onError(new Error(msg));
      }
      onDone(fullText);
    });
    apiRes.on('error', err => onError(err));
  });
  apiReq.on('timeout', () => apiReq.destroy(new Error('请求超时')));
  apiReq.on('error', err => onError(err));
  apiReq.write(data);
  apiReq.end();
}

// ─── 路由处理 ────────────────────────────────────────────────
async function handleGenerate(req, res, ip) {
  if (req.headers['x-auth-key'] !== AUTH_KEY) return sendJSON(res, 401, { error: 'Unauthorized' });
  if (!checkRateLimit(ip)) return sendJSON(res, 429, { error: '请求过于频繁，请稍后再试' });

  let body;
  try { body = await readJSONBody(req); }
  catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const { prompt, systemInstruction, temperature } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    return sendJSON(res, 400, { error: '缺少 prompt' });
  }

  // 客户端通过 ?stream=1 / Accept: text/event-stream / X-Stream: 1 任一方式启用流式
  const urlQuery = (req.url || '').split('?')[1] || '';
  const wantStream =
    /(^|&)stream=1(&|$)/.test(urlQuery) ||
    String(req.headers['accept'] || '').includes('text/event-stream') ||
    req.headers['x-stream'] === '1';

  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${ip} → Gemini${wantStream ? ' [stream]' : ''} (${prompt.substring(0, 60).replace(/\s+/g, ' ')}...)`);

  if (!wantStream) {
    // 兼容老客户端：非流式分支保留
    try {
      const text = await callGemini({ prompt, systemInstruction, temperature });
      console.log(`[${ts}] OK (${text.length} chars)`);
      sendJSON(res, 200, { text });
    } catch (e) {
      console.error(`[${ts}] Gemini 失败:`, e.message);
      sendJSON(res, 502, { error: e.message || 'AI 服务不可用' });
    }
    return;
  }

  // ─── 流式分支：SSE 转发 + 10s 心跳 ──────────────────────────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 关键：告诉 Nginx 别缓冲
    ...CORS,
  });
  // 先发一个心跳，立刻把响应头/首字节推到对端，避免握手后长时间静默被中间设备掐掉
  try { res.write(': open\n\n'); } catch {}

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 10_000);
  heartbeat.unref && heartbeat.unref();

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  };

  // 如果小程序端提前断开，记得停心跳
  req.on('close', finish);

  streamGemini({
    prompt, systemInstruction, temperature,
    onDelta: (delta) => {
      try { res.write(`event: delta\ndata: ${JSON.stringify({ text: delta })}\n\n`); } catch {}
    },
    onDone: (fullText) => {
      console.log(`[${ts}] STREAM OK (${fullText.length} chars)`);
      try { res.write(`event: done\ndata: ${JSON.stringify({ text: fullText })}\n\n`); } catch {}
      finish();
    },
    onError: (err) => {
      console.error(`[${ts}] STREAM 失败:`, err.message);
      try { res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'AI 服务不可用' })}\n\n`); } catch {}
      finish();
    },
  });
}

function publicJob(job) {
  const out = {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  if (job.status === 'done') out.text = job.text;
  if (job.status === 'error') out.error = job.error || 'AI 服务不可用';
  return out;
}

function startGenerateJob(job, params) {
  setImmediate(async () => {
    const ts = new Date().toLocaleTimeString();
    job.status = 'running';
    job.updatedAt = Date.now();
    try {
      console.log(`[${ts}] JOB ${job.id} → Gemini (${params.prompt.substring(0, 60).replace(/\s+/g, ' ')}...)`);
      const text = await callGemini(params);
      job.status = 'done';
      job.text = text;
      job.updatedAt = Date.now();
      console.log(`[${ts}] JOB ${job.id} OK (${text.length} chars)`);
    } catch (e) {
      job.status = 'error';
      job.error = e.message || 'AI 服务不可用';
      job.updatedAt = Date.now();
      console.error(`[${ts}] JOB ${job.id} 失败:`, job.error);
    }
  });
}

async function handleCreateGenerateJob(req, res, ip) {
  if (req.headers['x-auth-key'] !== AUTH_KEY) return sendJSON(res, 401, { error: 'Unauthorized' });
  if (!checkRateLimit(ip)) return sendJSON(res, 429, { error: '请求过于频繁，请稍后再试' });

  let body;
  try { body = await readJSONBody(req); }
  catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const { prompt, systemInstruction, temperature } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    return sendJSON(res, 400, { error: '缺少 prompt' });
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const job = {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    text: '',
    error: '',
  };
  generateJobs.set(id, job);
  startGenerateJob(job, { prompt, systemInstruction, temperature });
  sendJSON(res, 202, publicJob(job));
}

function handleGetGenerateJob(req, res, urlPath) {
  if (req.headers['x-auth-key'] !== AUTH_KEY) return sendJSON(res, 401, { error: 'Unauthorized' });
  const id = decodeURIComponent(urlPath.slice('/api/generate-job/'.length));
  const job = generateJobs.get(id);
  if (!job) return sendJSON(res, 404, { error: '任务不存在或已过期' });
  sendJSON(res, 200, publicJob(job));
}

async function handleVisit(req, res) {
  if (req.headers['x-auth-key'] !== AUTH_KEY) return sendJSON(res, 401, { error: 'Unauthorized' });

  if (req.method === 'GET') {
    return sendJSON(res, 200, { total: visits.total, unique: visits.unique });
  }
  if (req.method === 'POST') {
    let body;
    try { body = await readJSONBody(req, 4 * 1024); }
    catch { body = {}; }
    const deviceId = (body.deviceId || '').toString().slice(0, 64);

    visits.total += 1;
    if (deviceId && !visits.devices[deviceId]) {
      visits.devices[deviceId] = 1;
      visits.unique += 1;
    }
    persistVisits();
    return sendJSON(res, 200, { total: visits.total, unique: visits.unique });
  }
  return sendJSON(res, 405, { error: 'Method Not Allowed' });
}

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function handleAudio(req, res, urlPath) {
  // 仅允许 /audio/<filename> ，禁止路径穿越
  const fileName = path.basename(urlPath);
  if (!fileName || fileName.startsWith('.')) {
    return sendJSON(res, 404, { error: 'Not Found' });
  }
  const ext = path.extname(fileName).toLowerCase();
  if (!MIME[ext]) return sendJSON(res, 404, { error: 'Not Found' });

  for (const dir of AUDIO_DIRS) {
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext],
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
        ...CORS,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }
  sendJSON(res, 404, { error: 'Audio not found' });
}

// ─── 主服务 ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
            || req.socket.remoteAddress || 'unknown';
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/health') {
    return sendJSON(res, 200, { status: 'ok', model: MODEL });
  }
  if (urlPath === '/api/generate' && req.method === 'POST') {
    return handleGenerate(req, res, ip);
  }
  if (urlPath === '/api/generate-job' && req.method === 'POST') {
    return handleCreateGenerateJob(req, res, ip);
  }
  if (urlPath.startsWith('/api/generate-job/') && req.method === 'GET') {
    return handleGetGenerateJob(req, res, urlPath);
  }
  if (urlPath === '/api/visit') {
    return handleVisit(req, res);
  }
  if (urlPath.startsWith('/audio/') && req.method === 'GET') {
    return handleAudio(req, res, urlPath);
  }
  sendJSON(res, 404, { error: 'Not Found' });
});

server.headersTimeout = REQUEST_TIMEOUT_MS + 5000;
server.requestTimeout = REQUEST_TIMEOUT_MS + 5000;

initProxyAgent().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════');
    console.log('  Jupiter VPS Relay (direct Gemini)');
    console.log(`  Port:    ${PORT}`);
    console.log(`  Model:   ${MODEL}`);
    console.log(`  Gemini:  ${GEMINI_BASE}`);
    console.log(`  Proxy:   ${proxyUrl ? (proxyAgent ? proxyUrl : `${proxyUrl} (disabled)`) : '(none, direct)'}`);
    console.log(`  Visits:  ${VISIT_DB} (total=${visits.total}, unique=${visits.unique})`);
    console.log('═══════════════════════════════════════════');
  });
});
