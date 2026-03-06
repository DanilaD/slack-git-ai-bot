#!/bin/bash
# ============================================================
# deploy.sh — Pull latest code from main, install deps,
#             restart PM2, verify health, rollback on failure.
#
# Usage: bash deploy.sh
# ============================================================

set -euo pipefail

APP_DIR="/opt/slack-git-ai-bot"
PM2_NAME="slack-git-ai-bot"
HEALTH_URL="http://localhost:3000/health"
HEALTH_RETRIES=3
HEALTH_WAIT=3   # seconds between retries

cd "$APP_DIR"

echo "── [1/5] Pull latest code ───────────────────────────────"
git fetch origin main
PREV_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  echo "   Already up to date ($NEW_SHA). Nothing to deploy."
  exit 0
fi
echo "   $PREV_SHA → $NEW_SHA"

echo "── [2/5] Install dependencies ───────────────────────────"
npm install --production --silent

echo "── [3/5] Restart bot ────────────────────────────────────"
pm2 restart "$PM2_NAME" --update-env

echo "── [4/5] Health check ───────────────────────────────────"
sleep 4
HEALTHY=false
for i in $(seq 1 $HEALTH_RETRIES); do
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "   ✅ Health check passed (attempt $i)"
    HEALTHY=true
    break
  fi
  echo "   ⚠️  Attempt $i failed (HTTP $STATUS) — retrying in ${HEALTH_WAIT}s..."
  sleep "$HEALTH_WAIT"
done

if [ "$HEALTHY" = "false" ]; then
  echo ""
  echo "❌ Health check failed after $HEALTH_RETRIES attempts."
  echo "── ROLLBACK: reverting to $PREV_SHA ────────────────────"
  git reset --hard "$PREV_SHA"
  npm install --production --silent
  pm2 restart "$PM2_NAME" --update-env
  echo "   ✅ Rollback complete. Previous version restored."
  echo "   Run 'pm2 logs $PM2_NAME' to investigate."
  exit 1
fi

echo "── [5/5] Status ─────────────────────────────────────────"
pm2 status "$PM2_NAME"

echo ""
echo "✅ Deploy complete: $NEW_SHA"
echo "   Logs:   pm2 logs $PM2_NAME"
echo "   Health: curl $HEALTH_URL"
