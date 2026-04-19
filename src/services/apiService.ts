// ============================================================
// Cloudflare Worker API 地址（直接调用，无需 VPS 中转）
// ============================================================
export const PROXY_BASE_URL = 'https://jupiter-relay.jupiter-astro.workers.dev';

/**
 * 调用代理服务器，将请求转发给 Gemini API
 */
function callGeminiOnce(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${PROXY_BASE_URL}/api/generate`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-Auth-Key': 'jupiter-2026',
      },
      data: {
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
        temperature: params.temperature,
      },
      success(res: any) {
        if (res.statusCode === 200 && res.data?.text) {
          resolve(res.data.text);
        } else {
          reject(new Error(res.data?.error || `请求失败 (${res.statusCode})`));
        }
      },
      fail(err: any) {
        reject(new Error('网络请求失败：' + (err.errMsg || JSON.stringify(err))));
      },
    });
  });
}

export async function callGemini(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}): Promise<string> {
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
