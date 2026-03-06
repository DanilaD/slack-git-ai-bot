#!/bin/bash
# ============================================================
# deploy.sh — One-shot server setup for Slack Claude Bot
# Run as root on a fresh Ubuntu/Debian VPS
# Usage: bash deploy.sh
# ============================================================

set -e  # Exit on any error

echo "🚀 Starting Slack Claude Bot deployment..."

# ── 1. Update system ─────────────────────────────────────────
echo ""
echo "📦 Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Install Node.js 20 LTS ────────────────────────────────
echo ""
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "✅ Node version: $(node -v)"
echo "✅ NPM version:  $(npm -v)"

# ── 3. Install PM2 globally ──────────────────────────────────
echo ""
echo "📦 Installing PM2..."
npm install -g pm2

# ── 4. Install nginx ─────────────────────────────────────────
echo ""
echo "📦 Installing nginx..."
apt-get install -y nginx

# ── 5. Create app directory ──────────────────────────────────
echo ""
echo "📁 Setting up app directory..."
mkdir -p /opt/slack-claude-bot
cd /opt/slack-claude-bot

# ── 6. Copy bot files ────────────────────────────────────────
# This assumes you're running deploy.sh from the same folder as the bot files
echo ""
echo "📂 Copying bot files..."
cp -r "$(dirname "$0")"/{index.js,github.js,claude.js,package.json} /opt/slack-claude-bot/

# ── 7. Install npm dependencies ──────────────────────────────
echo ""
echo "📦 Installing npm dependencies..."
cd /opt/slack-claude-bot
npm install --production

# ── 8. Set up .env if not already present ───────────────────
if [ ! -f /opt/slack-claude-bot/.env ]; then
  echo ""
  echo "⚙️  Creating .env file — please fill in your tokens!"
  cat > /opt/slack-claude-bot/.env << 'EOF'
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here

# GitHub
GITHUB_TOKEN=ghp_your-github-token-here
GITHUB_REPO=techaxy/rv-tracker

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Server
PORT=3000
EOF
  echo "⚠️  Edit /opt/slack-claude-bot/.env with your actual tokens before starting!"
fi

# ── 9. Configure nginx reverse proxy ────────────────────────
echo ""
echo "🌐 Configuring nginx..."
cat > /etc/nginx/sites-available/slack-bot << 'EOF'
server {
    listen 80;
    server_name _;

    location /slack/ {
        proxy_pass http://localhost:3000/slack/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/slack-bot /etc/nginx/sites-enabled/slack-bot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

# ── 10. Open firewall ports ──────────────────────────────────
echo ""
echo "🔒 Opening firewall ports..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 11. Start bot with PM2 ───────────────────────────────────
echo ""
echo "🤖 Starting bot with PM2..."
cd /opt/slack-claude-bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo ""
echo "============================================================"
echo "✅ Deployment complete!"
echo ""
echo "Your bot is running at: http://185.5.54.69/slack/ask"
echo ""
echo "Next steps:"
echo "  1. Edit /opt/slack-claude-bot/.env with your tokens"
echo "  2. Run: pm2 restart slack-claude-bot"
echo "  3. In Slack app settings, set slash command URL to:"
echo "     http://185.5.54.69/slack/ask"
echo ""
echo "Useful commands:"
echo "  pm2 status              — check if bot is running"
echo "  pm2 logs slack-claude-bot — view live logs"
echo "  pm2 restart slack-claude-bot — restart after .env changes"
echo "============================================================"
