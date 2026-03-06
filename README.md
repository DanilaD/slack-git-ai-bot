# 🤖 Slack Project Assistant Bot

A Slack bot that connects your GitHub repository with AI to answer questions, analyze tasks, and create Jira tickets — all from Slack slash commands.

**Built with:** Node.js · Express · Groq AI (kimi-k2) · GitHub API · Jira API · PM2 · nginx

---

## What It Does

| Command | What it does |
|---------|-------------|
| `/ask <question>` | Searches your codebase and answers in plain English |
| `/task <description>` | Analyzes the codebase and produces a full implementation plan |
| `/jira <description>` | Analyzes the codebase and creates a structured Jira ticket automatically |

---

## Architecture

```
Slack slash command (/ask, /task, /jira)
        │
        ▼
  Express server (index.js) — port 3000
        │
        ├──► github.js
        │    Searches repo for relevant files based on keywords
        │    Fetches: code files, open PRs, issues, recent commits
        │
        ├──► claude.js
        │    Sends question + code context to Groq AI (kimi-k2-instruct)
        │    Returns human-friendly answer or structured analysis
        │
        └──► jira.js
             Creates Jira ticket via Atlassian REST API
             Includes full AI analysis as ticket description

nginx (port 80) → proxies /slack/* → localhost:3000
PM2 → keeps bot running 24/7, auto-restarts on crash
```

---

## Server

- **Host:** `185.5.54.69`
- **OS:** Ubuntu/Debian Linux
- **Node.js:** v20 LTS
- **Process manager:** PM2 (fork mode)
- **Reverse proxy:** nginx → `localhost:3000`
- **App directory:** `/opt/slack-claude-bot/`

---

## Slash Command Endpoints

| Command | URL |
|---------|-----|
| `/ask` | `http://185.5.54.69/slack/ask` |
| `/task` | `http://185.5.54.69/slack/task` |
| `/jira` | `http://185.5.54.69/slack/jira` |

---

## Environment Variables

File location: `/opt/slack-claude-bot/.env`

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_REPO=techaxy/rv-tracker

# Groq AI
GROQ_API_KEY=gsk_...

# Jira
JIRA_HOST=https://techaxy.atlassian.net
JIRA_EMAIL=dan@techaxy.com
JIRA_TOKEN=...
JIRA_PROJECT=INTEL

# Server
PORT=3000
```

---

## Files

```
/opt/slack-claude-bot/
├── index.js          # Express server — handles /ask, /task, /jira commands
├── github.js         # GitHub API — searches and fetches relevant code files
├── claude.js         # Groq AI — generates answers and Jira ticket content
├── jira.js           # Jira API — creates tickets in the INTEL project
├── package.json      # Dependencies
└── .env              # Environment variables (tokens & config)
```

---

## AI Model

**Model:** `moonshotai/kimi-k2-instruct` via Groq API (free tier)
**Context window:** 131k tokens
**Strengths:** Code analysis, structured output, fast responses

The bot uses **3 different prompts:**

- **ASK prompt** — answers questions based on real code, plain human language
- **TASK prompt** — produces structured analysis: what exists, implementation plan, risks, estimate
- **JIRA prompt** — structured ticket with: original request, goal, explanation, code analysis, clarifying questions, implementation plan, risks, estimate

---

## How the Bot Searches Code

When you run a slash command, `github.js` extracts keywords from your message and searches the GitHub repo. It fetches:

- **Code files** — actual source code matching your keywords (up to 4 files, 2000 chars each)
- **Open PRs** — if question is about PRs, progress, or status
- **Open issues** — if question mentions bugs, tasks, or issues
- **Recent commits** — if question is about recent changes
- **Repo overview + README** — as fallback if nothing else matches

The fetched code is sent to the AI along with your question so it answers based on your actual codebase, not generic knowledge.

---

## Jira Integration

**Project:** `INTELLIGENCE (INTEL)` on `techaxy.atlassian.net`

When `/jira` is used, the bot:
1. Searches GitHub for relevant code
2. Generates a structured ticket with the JIRA prompt
3. Creates the ticket via the Atlassian REST API
4. Posts the ticket link back in Slack

**Ticket structure:**
- 📝 Original Request
- 🎯 Goal
- 📖 Explanation
- 🔍 Code Analysis (real files from GitHub)
- ❓ Clarifying Questions
- 🔧 Implementation Plan
- ⚠️ Potential Risks
- ⏱ Estimate

---

## Manual Installation

This section covers setting up a fresh Ubuntu/Debian server from scratch.

### Prerequisites

You need these four things installed on the server:

| Component | Required version | What it does |
|-----------|-----------------|--------------|
| Node.js | v20 LTS | Runs the bot |
| npm | v9+ (comes with Node) | Installs packages |
| PM2 | latest | Keeps bot alive 24/7 |
| nginx | latest | Routes Slack HTTP requests to the bot |

---

### Step 1 — Check what's already installed

SSH into your server and run these checks:

```bash
# Check Node.js
node -v
# Expected: v20.x.x  (if not installed, see below)

# Check npm
npm -v
# Expected: 9.x.x or higher

# Check PM2
pm2 -v
# Expected: 5.x.x  (if not installed, see below)

# Check nginx
nginx -v
# Expected: nginx/1.x.x  (if not installed, see below)

# Check git
git --version
# Expected: git version 2.x.x
```

---

### Step 2 — Install missing components

**Install Node.js v20 LTS** (if `node -v` fails or shows wrong version):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v   # should now show v20.x.x
```

**Install PM2** (if `pm2 -v` fails):
```bash
npm install -g pm2
pm2 -v
```

**Install nginx** (if `nginx -v` fails):
```bash
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
nginx -v
```

**Install git** (if `git --version` fails):
```bash
apt-get install -y git
```

---

### Step 3 — Deploy the bot

```bash
# Clone the repo
git clone https://github.com/DanilaD/slack-git-ai-bot.git /opt/slack-claude-bot

# Install dependencies
cd /opt/slack-claude-bot
npm install --production

# Create your .env file
cp .env.example .env
nano .env   # fill in all tokens (see Environment Variables section above)
```

---

### Step 4 — Configure nginx

```bash
# Create nginx config
cat > /etc/nginx/sites-available/slack-bot << 'EOF'
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
}
EOF

# Enable and reload
ln -sf /etc/nginx/sites-available/slack-bot /etc/nginx/sites-enabled/slack-bot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

### Step 5 — Start the bot

```bash
cd /opt/slack-claude-bot
pm2 start index.js --name slack-claude-bot
pm2 save
pm2 startup   # run the printed command to auto-start on reboot
```

Verify it's running:
```bash
pm2 status
# Should show: slack-claude-bot | online
```

Test locally:
```bash
curl -X POST http://localhost:3000/slack/ask \
  -d "text=test&response_url=http://example.com"
# Should return JSON with "Thinking..." text
```

---

### How to Update the Bot

When new code is pushed to GitHub, update the server like this:

```bash
# Pull latest code
cd /opt/slack-claude-bot
git pull origin main

# Install any new dependencies
npm install --production

# Restart bot to load new code
pm2 restart slack-claude-bot --update-env

# Confirm it restarted cleanly
pm2 status
pm2 logs slack-claude-bot --lines 20
```

**Update a single token or config value:**
```bash
nano /opt/slack-claude-bot/.env
# Edit the value, save (Ctrl+X → Y → Enter)
pm2 restart slack-claude-bot --update-env
```

**Force clean restart** (if bot is stuck or port is busy):
```bash
pm2 kill
fuser -k 3000/tcp 2>/dev/null
sleep 2
cd /opt/slack-claude-bot
pm2 start index.js --name slack-claude-bot
pm2 save
```

---

## Common Commands (on server)

```bash
# Check status
pm2 status

# View live logs
pm2 logs slack-claude-bot

# Restart bot
pm2 restart slack-claude-bot --update-env

# Stop bot
pm2 stop slack-claude-bot

# Start bot (if stopped)
cd /opt/slack-claude-bot && pm2 start index.js --name slack-claude-bot

# Full clean restart
pm2 kill && fuser -k 3000/tcp 2>/dev/null && sleep 2
cd /opt/slack-claude-bot && pm2 start index.js --name slack-claude-bot && pm2 save

# Edit tokens
nano /opt/slack-claude-bot/.env

# Check nginx
systemctl status nginx
nginx -t && systemctl reload nginx
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `dispatch_failed` | Bot not running | `pm2 start index.js --name slack-claude-bot` |
| `operation_timeout` | AI taking too long | Switch to faster model in `claude.js` |
| `EADDRINUSE :3000` | Old process still running | `fuser -k 3000/tcp && pm2 restart slack-claude-bot` |
| GitHub returns wrong files | Keywords not matching | Ask more specific questions |
| Jira ticket not created | Token expired or wrong project | Check `.env` JIRA_TOKEN and JIRA_PROJECT |
| Bot answers from docs not code | AI ignoring context | Already fixed in prompt — ensure `claude.js` is latest version |

---

## Slack App Settings

Registered at [api.slack.com/apps](https://api.slack.com/apps) — **Project Assistant** app in the `techaxy` workspace.

**Bot Token Scopes:** `commands`, `chat:write`, `chat:write.public`

**Slash Commands:**
- `/ask` → `http://185.5.54.69/slack/ask`
- `/task` → `http://185.5.54.69/slack/task`
- `/jira` → `http://185.5.54.69/slack/jira`

---

## Usage Examples

```
/ask how does registration work?
/ask what types of buyers do we have?
/ask who has access to the buyers page?
/ask what is the difference between internal and external buyers?

/task Add email verification to the registration flow
/task Build a team invitation system for network members

/jira Add email verification to the registration flow
/jira Create a dashboard for buyer analytics
```
