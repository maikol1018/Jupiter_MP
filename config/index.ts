import { defineConfig, type UserConfigExport } from '@tarojs/cli';

declare const require: any;

const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!key || value === '' || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') loadEnvFile('.env.production');

const DEFAULT_LOCAL_RELAY = 'http://localhost:3000';
const h5ApiProxyTarget =
  process.env.JUPITER_API_PROXY_TARGET ||
  process.env.VITE_API_PROXY_TARGET ||
  DEFAULT_LOCAL_RELAY;

export default defineConfig<'weapp'>({
  projectName: 'jupiter-mp',
  date: '2026-3-28',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    'process.env.JUPITER_API_BASE': JSON.stringify(process.env.JUPITER_API_BASE || ''),
    'process.env.JUPITER_AUTH_KEY': JSON.stringify(process.env.JUPITER_AUTH_KEY || 'jupiter-2026'),
    'process.env.JUPITER_DAILY_PROVIDER': JSON.stringify(process.env.JUPITER_DAILY_PROVIDER || ''),
    'process.env.JUPITER_SHARE_URL': JSON.stringify(process.env.JUPITER_SHARE_URL || ''),
  },
  copy: {
    patterns: [
      { from: '_headers', to: 'dist' },
    ],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    devServer: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: 'all',
      open: true,
      client: {
        overlay: false,
      },
      proxy: {
        '/api': {
          target: h5ApiProxyTarget,
          changeOrigin: true,
          timeout: 180000,
          proxyTimeout: 180000,
          onError(_err, _req, res) {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            }
            res.end(JSON.stringify({
              error: `AI 后端不可用。请先启动本地中转服务，或设置 JUPITER_API_PROXY_TARGET。当前目标：${h5ApiProxyTarget}`,
            }));
          },
        },
        '/audio': {
          target: h5ApiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[name].[chunkhash:8].js',
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
      filename: 'css/[name].[hash].css',
      chunkFilename: 'css/[name].[chunkhash].css',
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {
          maxRootSize: 26,
          minRootSize: 18,
        },
      },
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
});
