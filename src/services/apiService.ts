// ============================================================
// 后端中转地址
//
// 部署架构（BAZI 同款）
//   小程序  →  https://api.your-domain.com (香港 VPS, vps-server.js)  →  Gemini
//   H5 本地 →  /api (Taro devServer 代理到本地/远程中转)             →  Gemini
//
// H5 预览与 BAZI 一样：JUPITER_API_BASE 留空时使用同源 /api；
// 本地由 config/index.ts 的 devServer.proxy 转发到 JUPITER_API_PROXY_TARGET。
// ============================================================
const IS_H5 = process.env.TARO_ENV === 'h5';
const ENV_PROXY_BASE_URL = (process.env.JUPITER_API_BASE || '').replace(/\/+$/, '');
const DEFAULT_MINI_PROXY_BASE_URL = 'https://api.jupiter-astro.top';

export const PROXY_BASE_URL = IS_H5
  ? ENV_PROXY_BASE_URL
  : (ENV_PROXY_BASE_URL || DEFAULT_MINI_PROXY_BASE_URL);

const apiUrl = (path: string) => `${PROXY_BASE_URL}${path}`;

// 旧流式接口单次请求超时（毫秒）。保留作兼容回退。
const REQUEST_TIMEOUT_MS = IS_H5 ? 180_000 : 60_000;
const JOB_REQUEST_TIMEOUT_MS = 15_000;
const JOB_POLL_INTERVAL_MS = 2_500;
const JOB_MAX_WAIT_MS = 180_000;
const VISIT_TIMEOUT_MS = 8_000;
const AUTH_KEY = process.env.JUPITER_AUTH_KEY || 'jupiter-2026';

type GenerateJobStatus = 'queued' | 'running' | 'done' | 'error';

interface GenerateJobResponse {
  jobId: string;
  status: GenerateJobStatus;
  text?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson<T>(params: {
  url: string;
  method: 'GET' | 'POST';
  data?: any;
  timeout?: number;
}): Promise<T> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && params.timeout
    ? setTimeout(() => controller.abort(), params.timeout)
    : null;

  try {
    const resp = await fetch(params.url, {
      method: params.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Key': AUTH_KEY,
      },
      body: params.method === 'POST' ? JSON.stringify(params.data || {}) : undefined,
      signal: controller?.signal,
    });
    const text = await resp.text();
    let data: any = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { error: text }; }
    }
    if (!resp.ok) {
      const err: any = new Error(data?.error || `请求失败 (${resp.status})`);
      err.statusCode = resp.status;
      err.url = params.url;
      throw err;
    }
    return data as T;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    const message = err?.name === 'AbortError'
      ? '请求超时'
      : (err?.message || String(err));
    throw new Error('网络请求失败：' + message);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requestJson<T>(params: {
  url: string;
  method: 'GET' | 'POST';
  data?: any;
  timeout?: number;
}): Promise<T> {
  if (IS_H5) return fetchJson<T>(params);

  return new Promise((resolve, reject) => {
    wx.request({
      url: params.url,
      method: params.method,
      timeout: params.timeout || JOB_REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
        'X-Auth-Key': AUTH_KEY,
      },
      data: params.data,
      success(res: any) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err: any = new Error(`请求失败 (${res.statusCode})`);
          err.statusCode = res.statusCode;
          err.url = params.url;
          return reject(err);
        }
        resolve(res.data as T);
      },
      fail(err: any) {
        try { console.error('[requestJson] wx.request fail:', err); } catch (_error) {}
        const parts: string[] = [];
        if (err && err.errMsg) parts.push(err.errMsg);
        if (err && err.errno !== undefined) parts.push(`errno=${err.errno}`);
        reject(new Error('网络请求失败：' + (parts.length ? parts.join(' ') : JSON.stringify(err))));
      },
    });
  });
}

// ─── UTF-8 解码（小程序无 TextDecoder 时的兼容实现） ────────
function decodeUtf8Bytes(bytes: Uint8Array): string {
  // 优先 TextDecoder（部分基础库已支持）
  // @ts-ignore
  if (typeof TextDecoder !== 'undefined') {
    try {
      // @ts-ignore
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_error) { /* fallthrough */ }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try {
    // 经典 latin1 -> utf8 还原
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return decodeURIComponent(escape(bin));
  } catch (_error) {
    return bin;
  }
}

/**
 * 调用代理服务器（流式）：使用 SSE + wx.request 的 enableChunked。
 *
 * 解决"国外能生成、国内不能生成"的问题：
 *   国内 → 香港 跨境 TCP 在长时间空闲（>30s）时会被中间设备
 *   （GFW / 运营商 CGNAT）静默 RST。改成边生成边推送 + 10s 心跳后，
 *   连接全程有数据流动，不再被掐断。
 */
function callGeminiOnce(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  provider?: 'gemini' | 'qwen';
  task?: string;
}): Promise<string> {
  if (IS_H5) {
    return requestJson<{ text: string }>({
      url: apiUrl('/api/generate'),
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      data: params,
    }).then(res => {
      if (res.text) return res.text;
      throw new Error('Gemini 返回空响应');
    });
  }

  return new Promise((resolve, reject) => {
    // 累积所有 delta 拼出完整文本；如果服务器最后发了 done 事件以它为准
    let acc = '';
    let finalText = '';
    let finalError = '';
    // 字节缓冲：SSE 用 "\n\n" 作为事件分隔符（ASCII 安全），先在字节层切片，
    // 再对每个完整 event block 做 UTF-8 解码，避免中文被截半。
    let byteBuf = new Uint8Array(0);

    const concatBytes = (a: Uint8Array, b: Uint8Array) => {
      const out = new Uint8Array(a.length + b.length);
      out.set(a, 0); out.set(b, a.length);
      return out;
    };
    const indexOfDoubleNewline = (buf: Uint8Array, from = 0) => {
      for (let i = from; i + 1 < buf.length; i++) {
        if (buf[i] === 0x0a && buf[i + 1] === 0x0a) return i; // \n\n
      }
      return -1;
    };

    const handleEventBlock = (block: string) => {
      if (!block || block.charCodeAt(0) === 0x3a /* ':' */) return; // 心跳/注释
      let event = 'message';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) return;
      let obj: any;
      try { obj = JSON.parse(dataStr); } catch (_error) { return; }
      if (event === 'delta' && typeof obj.text === 'string') {
        acc += obj.text;
      } else if (event === 'done' && typeof obj.text === 'string') {
        finalText = obj.text;
      } else if (event === 'error') {
        finalError = obj.error || '生成失败';
      }
    };

    const reqTask: any = wx.request({
      url: `${apiUrl('/api/generate')}?stream=1`,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      // @ts-ignore 基础库 2.20.1+
      enableChunked: true,
      // @ts-ignore 显式禁用 HTTP/2（iOS 微信底层 NSURLSession 默认会协商 HTTP/2，
      // 与 enableChunked 的实现不兼容，会直接返回裸 request:fail）
      enableHttp2: false,
      responseType: 'text',
      header: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-Stream': '1',
        'X-Auth-Key': AUTH_KEY,
      },
      data: {
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
        temperature: params.temperature,
      },
      success(res: any) {
        if (res.statusCode !== 200) {
          return reject(new Error(`请求失败 (${res.statusCode})`));
        }
        if (finalError) return reject(new Error(finalError));
        const text = finalText || acc;
        if (text) return resolve(text);
        reject(new Error('Gemini 返回空响应'));
      },
      fail(err: any) {
        // 把完整错误对象打到 console，方便 vConsole / 远程调试里看
        try { console.error('[callGeminiOnce] wx.request fail:', err); } catch (_error) {}
        const parts: string[] = [];
        if (err && err.errMsg) parts.push(err.errMsg);
        if (err && err.errno !== undefined) parts.push(`errno=${err.errno}`);
        const detail = parts.length ? parts.join(' ') : JSON.stringify(err);
        reject(new Error('网络请求失败：' + detail));
      },
    });

    // 接收每一段 chunk，按 SSE 协议解析
    if (reqTask && typeof reqTask.onChunkReceived === 'function') {
      reqTask.onChunkReceived((chunk: any) => {
        try {
          const incoming = new Uint8Array(chunk.data);
          byteBuf = concatBytes(byteBuf, incoming);
          let sepIdx;
          while ((sepIdx = indexOfDoubleNewline(byteBuf)) !== -1) {
            const blockBytes = byteBuf.slice(0, sepIdx);
            byteBuf = byteBuf.slice(sepIdx + 2);
            const blockText = decodeUtf8Bytes(blockBytes);
            handleEventBlock(blockText);
          }
        } catch (_error) { /* ignore malformed chunk */ }
      });
    }
  });
}

async function callGeminiJob(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  provider?: 'gemini' | 'qwen';
  task?: string;
}): Promise<string> {
  const created = await requestJson<GenerateJobResponse>({
    url: apiUrl('/api/generate-job'),
    method: 'POST',
    timeout: JOB_REQUEST_TIMEOUT_MS,
    data: params,
  });

  if (!created.jobId) throw new Error('任务创建失败');

  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_MAX_WAIT_MS) {
    await sleep(JOB_POLL_INTERVAL_MS);

    const job = await requestJson<GenerateJobResponse>({
      url: apiUrl(`/api/generate-job/${encodeURIComponent(created.jobId)}`),
      method: 'GET',
      timeout: JOB_REQUEST_TIMEOUT_MS,
    });

    if (job.status === 'done') {
      if (job.text) return job.text;
      throw new Error('Gemini 返回空响应');
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'AI 服务不可用');
    }
  }

  throw new Error('生成超时，请稍后重试');
}

export async function callGemini(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  provider?: 'gemini' | 'qwen';
  task?: string;
}): Promise<string> {
  if (!IS_H5) {
    try {
      return await callGeminiJob(params);
    } catch (e: any) {
      if (e?.statusCode !== 404 || e?.url !== apiUrl('/api/generate-job')) throw e;
      try { console.warn('[callGemini] generate-job unavailable, falling back to stream'); } catch (_error) {}
    }
  }

  const MAX_RETRIES = 2;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await callGeminiOnce(params);
    } catch (e: any) {
      const msg = e.message || '';
      const isRetryable = msg.includes('空响应') || msg.includes('被中断') || msg.includes('暂时不可用');
      if (i < MAX_RETRIES && isRetryable) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('请求失败，请稍后再试');
}

// ============================================================
// 访问统计：上报一次访问，返回累计数据
// ============================================================
export interface VisitStats {
  total: number;   // 累计访问次数
  unique: number;  // 独立用户数
}

const DEVICE_ID_KEY = 'jupiter_device_id';

function getOrCreateDeviceId(): string {
  if (IS_H5 && typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(DEVICE_ID_KEY);
    if (cached) return cached;
    const id =
      'h_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  }

  try {
    const cached = wx.getStorageSync(DEVICE_ID_KEY);
    if (cached) return cached;
  } catch (_error) {}
  const id =
    'd_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10);
  try {
    wx.setStorageSync(DEVICE_ID_KEY, id);
  } catch (_error) {}
  return id;
}

export function reportVisit(): Promise<VisitStats> {
  const deviceId = getOrCreateDeviceId();
  return requestJson<VisitStats>({
    url: apiUrl('/api/visit'),
    method: 'POST',
    timeout: VISIT_TIMEOUT_MS,
    data: { deviceId },
  }).then(data => ({ total: data.total || 0, unique: data.unique || 0 }));
}

export function getVisitStats(): Promise<VisitStats> {
  return requestJson<VisitStats>({
    url: apiUrl('/api/visit'),
    method: 'GET',
    timeout: VISIT_TIMEOUT_MS,
  }).then(data => ({ total: data.total || 0, unique: data.unique || 0 }));
}
