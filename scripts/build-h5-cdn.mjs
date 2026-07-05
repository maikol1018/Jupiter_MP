import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

loadEnvFile('.env.production');
loadEnvFile('.env.cdn');

process.env.NODE_ENV = 'production';
process.env.JUPITER_API_BASE = process.env.JUPITER_API_BASE || 'https://api.jupiter-astro.top';
process.env.JUPITER_AUTH_KEY = process.env.JUPITER_AUTH_KEY || 'jupiter-2026';

console.log(`[cdn-build] JUPITER_API_BASE=${process.env.JUPITER_API_BASE}`);
console.log('[cdn-build] Building H5 assets for domestic CDN upload...');

const result = spawnSync('npx taro build --type h5', {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

if (result.error) {
  console.error('[cdn-build] Failed to start Taro build:', result.error.message);
}

process.exit(result.status ?? 1);