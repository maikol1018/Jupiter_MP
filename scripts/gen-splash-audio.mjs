/**
 * 生成 splash 页面的 TTS 音频文件
 * 使用 Microsoft Edge TTS (免费, 支持多种语音)
 *
 * 运行: npx tsx scripts/gen-splash-audio.mjs
 */
import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { randomUUID, createHash } from 'crypto';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_VERSION}`;
const WS_BASE = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}`;
const VOICE = 'zh-CN-XiaoyiNeural';
const OUTPUT_DIR = 'cloudflare-worker/public/audio';

// DRM: generate Sec-MS-GEC token (same as Python edge-tts)
function generateSecMsGec() {
  const WIN_EPOCH = 11644473600;
  let ticks = Math.floor(Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300; // round to nearest 5 min
  ticks = Math.round(ticks * 1e9 / 100); // 100-nanosecond intervals
  const strToHash = `${ticks}${TOKEN}`;
  return createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

const lines = [
  '喵',
  '我是一只拥有古老埃及血统的阿比西尼亚猫，我叫木星。我不吵闹，不粘人，只是安静的蹲在时光的边缘，听风告诉你宇宙的微光。',
  '今天第一次见到你，我已经轻轻的嗅到你接下来的运气。',
  '你有什么想问的吗？关于前路，关于心愿、关于那些你还不敢说出口的期待。',
  '我是木星，你的专属预言小猫。未来的答案我都知道。',
];

function synthesize(text, voice, pitch = '+5Hz', rate = '-5%') {
  return new Promise((resolve, reject) => {
    const connId = randomUUID().replace(/-/g, '');
    const reqId = randomUUID().replace(/-/g, '');
    const secMsGec = generateSecMsGec();
    const muid = randomUUID().replace(/-/g, '').toUpperCase();

    const wsUrl = `${WS_BASE}&ConnectionId=${connId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_VERSION.split('.')[0]}.0.0.0`,
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${muid};`,
      },
    });

    const audioChunks = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 30000);

    ws.on('open', () => {
      const config = JSON.stringify({
        context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        } } },
      });
      ws.send(`X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}`);

      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escaped}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        if (data.toString().includes('turn.end')) {
          clearTimeout(timer);
          ws.close();
          resolve(Buffer.concat(audioChunks));
        }
      } else {
        const separator = 'Path:audio\r\n';
        const buf = Buffer.from(data);
        const idx = buf.indexOf(separator);
        if (idx >= 0) audioChunks.push(buf.subarray(idx + separator.length));
      }
    });

    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

mkdirSync(OUTPUT_DIR, { recursive: true });

for (let i = 0; i < lines.length; i++) {
  console.log(`Generating splash-${i}.mp3 ...`);
  try {
    const audio = await synthesize(lines[i], VOICE);
    const file = `${OUTPUT_DIR}/splash-${i}.mp3`;
    writeFileSync(file, audio);
    console.log(`  → ${file} (${audio.length} bytes)`);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
  }
}

console.log('Done!');
