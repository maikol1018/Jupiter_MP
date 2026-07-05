// PM2 ecosystem 配置
// 用法：pm2 start ecosystem.config.js
//
// 需要先创建 /opt/jupiter/.env 文件，内含：
//   GEMINI_API_KEY=xxx
//   AUTH_KEY=jupiter-2026
//   PORT=3000

module.exports = {
  apps: [
    {
      name: 'jupiter',
      script: '/opt/jupiter/vps-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env_file: '/opt/jupiter/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        VISIT_DB: '/var/lib/jupiter/visits.json',
      },
      error_file: '/var/log/jupiter/error.log',
      out_file: '/var/log/jupiter/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
