#!/bin/bash
# ============================================================
# install.sh — First-time server setup
# Run once as root on a fresh Ubuntu/Debian VPS.
#
# What it does:
#   1. Installs Node.js v20, PM2, nginx, git
#   2. Clones the repo to /opt/slack-git-ai-bot
#   3. Creates .env from .env.example
#   4. Configures nginx to proxy /slack/* and /health
#   5. Starts the bot with PM2 and saves it to autostart
#
# After running: edit /opt/slack-git-ai-bot/.env with your tokens
# To update later: bash deploy.sh
# ============================================================

set -euo pipefail

REPO_URL="https://github.com/DanilaD/slack-git-ai-bot.git"
APP_DIR="/opt/slack-git-ai-bot"
PM2_NAME="slack-git-ai-bot"
NGINX_CONF="/etc/nginx/sites-available/slack-bot"

# ── 1. System dependencies ────────────────────────────────────

echo "── Installing Node.js v20 ───────────────────────────────"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "   node $(node -v) | npm $(npm -v)"

echo "── Installing PM2 ───────────────────────────────────────"
npm install -g pm2 --silent
echo "   pm2 $(pm2 -v)"

echo "── Installing nginx + git ───────────────────────────────"
apt-get install -y nginx git
systemctl enable nginx
systemctl start nginx

# ── 2. Clone repo ─────────────────────────────────────────────

echo "── Cloning repo ─────────────────────────────────────────"
if [ -d "$APP_DIR/.git" ]; then
  echo "   Repo already exists — pulling latest"
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm install --production --silent
echo "   Dependencies installed"

# ── 3. Create .env ────────────────────────────────────────────

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "⚠️  .env created from .env.example."
  echo "   Edit it before starting the bot: nano $APP_DIR/.env"
  echo ""
fi

# ── 4. nginx config ───────────────────────────────────────────

echo "── Configuring nginx ────────────────────────────────────"
cat > "$NGINX_CONF" << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location /slack/ {
        proxy_pass http://127.0.0.1:3000/slack/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
    }
}
NGINXEOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/slack-bot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "   nginx configured"

# ── 5. Start bot with PM2 ─────────────────────────────────────

echo "── Starting bot with PM2 ────────────────────────────────"
pm2 delete "$PM2_NAME" 2>/dev/null || true
pm2 start "$APP_DIR/src/index.js" --name "$PM2_NAME"
pm2 save

PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP"
fi

# ── Done ──────────────────────────────────────────────────────

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Fill in your tokens:  nano $APP_DIR/.env"
echo "  2. Restart the bot:      pm2 restart $PM2_NAME --update-env"
echo "  3. Check health:         curl http://localhost:3000/health"
echo ""
echo "To deploy updates later:  bash $APP_DIR/deploy.sh"
