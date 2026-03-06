#!/bin/bash
# ============================================================
# cleanup-v1.sh — Remove version 1 leftovers from the server
#
# Safe to run while v2 is live. Backs up .env before touching
# anything. Keeps /opt/slack-git-ai-bot (v2) untouched.
#
# Usage (run as root on the server):
#   bash /opt/slack-git-ai-bot/cleanup-v1.sh
# ============================================================

set -euo pipefail

V2_DIR="/opt/slack-git-ai-bot"
V2_PM2_NAME="slack-git-ai-bot"
BACKUP_DIR="/root/v1-backup-$(date +%Y%m%d-%H%M%S)"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          Slack Bot — V1 Cleanup Script                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Audit — show everything found ─────────────────────────

echo "── [1/6] Auditing server ────────────────────────────────"
echo ""

echo "  PM2 processes:"
pm2 list 2>/dev/null || echo "  (pm2 not found)"
echo ""

echo "  Node processes:"
ps aux | grep -E "node|npm" | grep -v grep || echo "  (none)"
echo ""

echo "  Candidate v1 directories:"
for dir in \
  /root/slack-bot \
  /root/slack-git-ai-bot \
  /root/bot \
  /home/*/slack-bot \
  /home/*/slack-git-ai-bot \
  /var/www/slack-bot \
  /srv/slack-bot; do
  [ -d "$dir" ] && echo "  📁 $dir" || true
done
echo ""

echo "  Nginx configs:"
ls /etc/nginx/sites-enabled/ 2>/dev/null || echo "  (none)"
echo ""

# ── 2. Confirm before proceeding ─────────────────────────────

echo "── [2/6] Confirm cleanup ────────────────────────────────"
read -r -p "  Proceed with cleanup? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "  Aborted."
  exit 0
fi
echo ""

# ── 3. Backup all .env files found ───────────────────────────

echo "── [3/6] Backing up .env files ─────────────────────────"
mkdir -p "$BACKUP_DIR"

find /root /home /opt /srv /var/www -name ".env" -not -path "*/node_modules/*" 2>/dev/null | while read -r envfile; do
  dest="$BACKUP_DIR/$(echo "$envfile" | tr '/' '_').env"
  cp "$envfile" "$dest"
  echo "  Backed up: $envfile → $dest"
done
echo "  Backup saved to: $BACKUP_DIR"
echo ""

# ── 4. Stop & delete old PM2 processes ───────────────────────

echo "── [4/6] Cleaning PM2 processes ────────────────────────"
# Get all PM2 app names except the v2 one
PM2_APPS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
apps = json.load(sys.stdin)
for a in apps:
    name = a.get('name','')
    if name != '$V2_PM2_NAME':
        print(name)
" 2>/dev/null || true)

if [ -z "$PM2_APPS" ]; then
  echo "  No old PM2 processes found."
else
  while IFS= read -r name; do
    echo "  Deleting PM2 process: $name"
    pm2 delete "$name" 2>/dev/null || true
  done <<< "$PM2_APPS"
  pm2 save
  echo "  PM2 process list saved."
fi
echo ""

# ── 5. Remove old v1 directories ─────────────────────────────

echo "── [5/6] Removing v1 directories ───────────────────────"
V1_DIRS=(
  /root/slack-bot
  /root/slack-git-ai-bot
  /root/bot
  /var/www/slack-bot
  /srv/slack-bot
)

# Also find any home dirs
for homedir in /home/*/; do
  V1_DIRS+=("${homedir}slack-bot")
  V1_DIRS+=("${homedir}slack-git-ai-bot")
  V1_DIRS+=("${homedir}bot")
done

for dir in "${V1_DIRS[@]}"; do
  if [ -d "$dir" ] && [ "$dir" != "$V2_DIR" ]; then
    echo "  Removing: $dir"
    rm -rf "$dir"
  fi
done
echo ""

# ── 6. Verify v2 is healthy ───────────────────────────────────

echo "── [6/6] Verifying v2 is healthy ───────────────────────"
HEALTH=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
if [ "$HEALTH" = "200" ]; then
  echo "  ✅ Health check passed (HTTP 200)"
else
  echo "  ⚠️  Health check returned HTTP $HEALTH"
  echo "  Run: pm2 logs $V2_PM2_NAME"
fi

echo ""
pm2 status "$V2_PM2_NAME" 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Cleanup complete                                     ║"
echo "║  .env backups saved to: $BACKUP_DIR"
echo "║  V2 running at:  /opt/slack-git-ai-bot                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
