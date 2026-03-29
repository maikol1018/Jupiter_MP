// ============================================================
// 代理服务器 API 地址配置
// 部署好 VPS 后，把下面的地址改为你服务器的实际地址
// 例如：http://43.xxx.xxx.xxx:3000  或  https://api.yourdomain.com
// ============================================================
export const PROXY_BASE_URL = 'http://127.0.0.1:3099';

/**
 * 调用代理服务器，将请求转发给 Gemini API
 */
export async function callGemini(params: {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${PROXY_BASE_URL}/api/generate`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
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
