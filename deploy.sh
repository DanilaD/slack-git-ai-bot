#!/bin/bash
# ============================================================
# deploy.sh — Update the bot from GitHub and restart
# Run this on the server whenever you push new code.
#
# Usage: bash deploy.sh
# ============================================================

set -euo pipefail

APP_DIR="/opt/slack-git-ai-bot"
PM2_NAME="slack-git-ai-bot"

echo "── Pulling latest code ──────────────────────────────────"
cd "$APP_DIR"
git pull origin main

echo "── Installing dependencies ──────────────────────────────"
npm install --production --silent

echo "── Restarting bot ───────────────────────────────────────"
pm2 restart "$PM2_NAME" --update-env

echo "── Status ───────────────────────────────────────────────"
pm2 status "$PM2_NAME"

echo ""
echo "✅ Deploy complete."
echo "   Logs:   pm2 logs $PM2_NAME"
echo "   Health: curl http://localhost:3000/health"
