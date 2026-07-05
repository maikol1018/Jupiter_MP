#!/usr/bin/env bash
# ============================================================
# Jupiter VPS 一键部署脚本
# 适用于 Ubuntu 20.04 / 22.04 / 24.04
#
# 用法：
#   chmod +x setup.sh
#   sudo ./setup.sh
#
# 脚本会依次完成：
#   1. 安装 Node.js 20、Nginx、Certbot
#   2. 上传 vps-server.js 和 public/audio/（假设已 scp 到 /opt/jupiter）
#   3. 申请 Let's Encrypt SSL 证书
#   4. 配置 Nginx 反向代理
#   5. 用 PM2 守护 Node.js 进程并设置开机自启
# ============================================================
set -e

DOMAIN="api.jupiter-astro.top"
APP_DIR="/opt/jupiter"
NODE_PORT=3000

# ─── 颜色输出 ────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── 0. 检查 root ─────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "请用 sudo 运行此脚本"

# ─── 1. 安装依赖 ──────────────────────────────────────────────
info "更新 apt 源..."
apt-get update -qq

info "安装 curl、git、nginx、certbot..."
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx

info "安装 Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

info "安装 PM2..."
npm install -g pm2 --silent

# ─── 2. 创建应用目录 ──────────────────────────────────────────
info "创建应用目录 $APP_DIR..."
mkdir -p "$APP_DIR/public/audio"

# 如果脚本同目录下有 vps-server.js，自动复制
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/../vps-server.js" ]]; then
  cp "$SCRIPT_DIR/../vps-server.js" "$APP_DIR/"
  info "已复制 vps-server.js"
else
  warn "未找到 vps-server.js，请手动上传到 $APP_DIR/"
fi

if [[ -d "$SCRIPT_DIR/../public/audio" ]]; then
  cp -r "$SCRIPT_DIR/../public/audio/." "$APP_DIR/public/audio/"
  info "已复制 public/audio/"
else
  warn "未找到 public/audio/，请手动上传音频文件到 $APP_DIR/public/audio/"
fi

# ─── 3. 写入环境变量文件 ──────────────────────────────────────
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  info "创建环境变量文件 $ENV_FILE..."
  read -rp "请输入 GEMINI_API_KEY: " GEMINI_KEY
  read -rp "请输入 AUTH_KEY（直接回车使用默认 jupiter-2026）: " AUTH_VAL
  AUTH_VAL="${AUTH_VAL:-jupiter-2026}"
  cat > "$ENV_FILE" <<EOF
GEMINI_API_KEY=$GEMINI_KEY
AUTH_KEY=$AUTH_VAL
PORT=$NODE_PORT
VISIT_DB=/var/lib/jupiter/visits.json
EOF
  mkdir -p /var/lib/jupiter
  chmod 600 "$ENV_FILE"
  info "环境变量已写入 $ENV_FILE"
else
  warn "$ENV_FILE 已存在，跳过"
fi

# ─── 4. 申请 SSL 证书（HTTP-01 验证） ─────────────────────────
info "确认 Nginx 已启动..."
systemctl start nginx

# 先用 webroot 模式申请（不影响已有 Nginx 配置）
mkdir -p /var/www/certbot
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  info "申请 Let's Encrypt 证书 for $DOMAIN ..."
  certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "admin@jupiter-astro.top" \
    --no-eff-email
  info "证书申请成功"
else
  info "证书已存在，跳过申请"
fi

# ─── 5. 配置 Nginx ───────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
info "写入 Nginx 配置..."
cat > "$NGINX_CONF" <<'NGINXEOF'
# HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name api.jupiter-astro.top;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.jupiter-astro.top;

    ssl_certificate     /etc/letsencrypt/live/api.jupiter-astro.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.jupiter-astro.top/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    client_max_body_size 4m;

    # /api/generate：Gemini 流式生成，必须关闭缓冲让 SSE 实时下发
    location = /api/generate {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_buffering          off;
        proxy_request_buffering  off;
        proxy_cache              off;
        chunked_transfer_encoding on;
        gzip                     off;
        proxy_set_header         Connection '';
        proxy_set_header         X-Accel-Buffering no;
        proxy_read_timeout    180s;
        proxy_send_timeout    180s;
        proxy_connect_timeout 10s;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout    90s;
        proxy_connect_timeout 10s;
        proxy_send_timeout    90s;
    }
}
NGINXEOF

# 启用站点
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"

# 删除默认站点（如果存在）
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
info "Nginx 配置已生效"

# ─── 6. 用 PM2 启动 Node.js ───────────────────────────────────
info "启动 Jupiter 服务..."
cd "$APP_DIR"

# 把 .env 里的变量导出给 PM2
set -a; source "$ENV_FILE"; set +a

pm2 delete jupiter 2>/dev/null || true
pm2 start vps-server.js --name jupiter
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

info "PM2 已启动，开机自启已配置"

# ─── 7. 配置证书自动续期 ──────────────────────────────────────
if ! crontab -l 2>/dev/null | grep -q certbot; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
  info "已添加证书自动续期定时任务（每天 03:00）"
fi

# ─── 完成 ─────────────────────────────────────────────────────
echo ""
info "====== 部署完成 ======"
info "健康检查：curl https://$DOMAIN/health"
info "PM2 日志：pm2 logs jupiter"
info "Nginx 日志：tail -f /var/log/nginx/error.log"
echo ""
info "微信小程序后台 → 开发管理 → 服务器域名，添加："
info "  request 合法域名：    https://$DOMAIN"
info "  downloadFile 合法域名：https://$DOMAIN"
