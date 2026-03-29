// 本地 Gemini API 代理服务器（直接调 Google API，通过系统代理）
const http = require('http');
const https = require('https');

const LOCAL_PORT = 3099;
const PROXY_URL = 'http://127.0.0.1:59527';
const API_KEY = 'AIzaSyAff7UiQGl4RI40vorRCv9cxi2OpiFZU9M';
const MODEL = 'gemini-2.5-flash';

let agent;
async function getAgent() {
  if (!agent) {
    const mod = await import('https-proxy-agent');
    const Ctor = mod.HttpsProxyAgent || mod.default?.HttpsProxyAgent || mod.default;
    agent = new Ctor(PROXY_URL);
  }
  return agent;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Only handle POST /api/generate
  if (req.method !== 'POST' || req.url !== '/api/generate') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { prompt, systemInstruction, temperature } = JSON.parse(body);
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 prompt' }));
        return;
      }

      const geminiBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {}
      };
      if (temperature !== undefined) geminiBody.generationConfig.temperature = temperature;
      if (systemInstruction) {
        geminiBody.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const postData = JSON.stringify(geminiBody);
      console.log(`[${new Date().toLocaleTimeString()}] Calling Gemini (${prompt.substring(0, 50)}...)`);

      const proxyAgent = await getAgent();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
      
      const result = await new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', agent: proxyAgent, headers: { 'Content-Type': 'application/json' } }, (apiRes) => {
          let data = '';
          apiRes.on('data', c => data += c);
          apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      const json = JSON.parse(result.body);
      if (json.error) {
        console.error('Gemini API error:', json.error.message);
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

      console.log(`[${new Date().toLocaleTimeString()}] OK (${text.substring(0, 50)}...)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    } catch (e) {
      console.error('Error:', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI 服务不可用: ' + e.message }));
    }
  });
});

server.listen(LOCAL_PORT, () => {
  console.log(`Local Gemini Proxy on http://127.0.0.1:${LOCAL_PORT}`);
  console.log(`Model: ${MODEL} | via proxy ${PROXY_URL}`);
});
