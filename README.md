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

- **Host:** `YOUR_SERVER_IP`
- **OS:** Ubuntu/Debian Linux
- **Node.js:** v20 LTS
- **Process manager:** PM2 (fork mode)
- **Reverse proxy:** nginx → `localhost:3000`
- **App directory:** `/opt/slack-git-ai-bot/`

---

## Slash Command Endpoints

| Command | URL |
|---------|-----|
| `/ask` | `http://YOUR_SERVER_IP/slack/ask` |
| `/task` | `http://YOUR_SERVER_IP/slack/task` |
| `/jira` | `http://YOUR_SERVER_IP/slack/jira` |

---

## Environment Variables

`.env` holds **secrets only**. Non-secret settings (host, project, repo, model) live in `config/`.

File location: `/opt/slack-git-ai-bot/.env`

```env
# Slack — from api.slack.com/apps
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# GitHub — token only; repo is set in config/github.js
GITHUB_TOKEN=ghp_...

# AI — key for whichever provider is set in config/ai.js
GROQ_API_KEY=gsk_...
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Jira — token only; host/project/email are set in config/jira.js
JIRA_TOKEN=...

# Server
PORT=3000
```

**To change Jira project or GitHub repo** — edit `config/jira.js` or `config/github.js`, not `.env`.

---

## Project Structure

```
slack-git-ai-bot/
├── src/
│   ├── index.js      # Express server — handles /ask, /task, /jira endpoints
│   ├── ai.js         # AI caller — reads config/ai.js to pick the right provider
│   ├── github.js     # GitHub API — searches and fetches relevant code files
│   └── jira.js       # Jira API — creates tickets via Atlassian REST API
├── config/
│   ├── ai.js         # ← Switch AI provider + model here
│   ├── github.js     # ← Set repo name and fetch limits here
│   ├── jira.js       # ← Set Jira host, project key, email here
│   └── prompts.js    # ← Edit all AI prompts here
├── .env              # SECRET tokens only — never commit this file
├── .env.example      # Template — copy to .env and fill in tokens
├── ecosystem.config.js
├── package.json
└── README.md
```

**Rule of thumb:** `config/` = settings you'll want to change. `.env` = secrets only.

---

## Switching AI Provider

Open `config/ai.js` and change the `ACTIVE_PROVIDER` line at the top:

```js
const ACTIVE_PROVIDER = "groq"; // change to "openai" or "anthropic"
```

Then add the matching API key to your `.env` file and restart the bot.

| Provider | Env var | Cost | Notes |
|----------|---------|------|-------|
| `groq` | `GROQ_API_KEY` | Free tier | Default. Fast, 131k context. [console.groq.com](https://console.groq.com) |
| `openai` | `OPENAI_API_KEY` | Paid | GPT-4o-mini by default. Change model in `config/ai.js` |
| `anthropic` | `ANTHROPIC_API_KEY` | Paid | Claude Haiku by default. Requires [console.anthropic.com](https://console.anthropic.com) credits |

You can also change the specific model inside `config/ai.js` without switching providers — each provider section has a `model` field and a comment listing other available models.

---

## Editing Prompts

All prompts live in `config/prompts.js`. There are three:

- **ASK** — used by `/ask` to answer questions about the codebase
- **TASK** — used by `/task` to produce a structured implementation plan
- **JIRA** — used by `/jira` to generate the Jira ticket content

Each prompt has a `system` section (the AI's role and rules) and a `user` template (the actual message sent). The templates use `{question}` and `{context}` placeholders that are filled in at runtime.

Edit `config/prompts.js` and restart the bot — no other files need changing.

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

**Project:** set via `JIRA_PROJECT` in `.env` (e.g. `INTEL`)

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
git clone https://github.com/DanilaD/slack-git-ai-bot.git /opt/slack-git-ai-bot

# Install dependencies
cd /opt/slack-git-ai-bot
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
cd /opt/slack-git-ai-bot
pm2 start src/index.js --name slack-git-ai-bot
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
cd /opt/slack-git-ai-bot
git pull origin main

# Install any new dependencies
npm install --production

# Restart bot to load new code
pm2 restart slack-git-ai-bot --update-env

# Confirm it restarted cleanly
pm2 status
pm2 logs slack-git-ai-bot --lines 20
```

**Update a single token or config value:**
```bash
nano /opt/slack-git-ai-bot/.env
# Edit the value, save (Ctrl+X → Y → Enter)
pm2 restart slack-claude-bot --update-env
```

**Force clean restart** (if bot is stuck or port is busy):
```bash
pm2 kill
fuser -k 3000/tcp 2>/dev/null
sleep 2
cd /opt/slack-git-ai-bot
pm2 start index.js --name slack-claude-bot
pm2 save
```

---

## Common Commands (on server)

```bash
# Check status
pm2 status

# View live logs
pm2 logs slack-git-ai-bot

# Restart bot (after code or .env changes)
pm2 restart slack-git-ai-bot --update-env

# Stop bot
pm2 stop slack-git-ai-bot

# Start bot (if stopped)
cd /opt/slack-git-ai-bot && pm2 start src/index.js --name slack-git-ai-bot

# Full clean restart (if port is stuck)
pm2 kill && fuser -k 3000/tcp 2>/dev/null && sleep 2
cd /opt/slack-git-ai-bot && pm2 start src/index.js --name slack-git-ai-bot && pm2 save

# Edit tokens
nano /opt/slack-git-ai-bot/.env

# Switch AI provider
nano /opt/slack-git-ai-bot/config/ai.js
# Change ACTIVE_PROVIDER, then: pm2 restart slack-git-ai-bot --update-env

# Edit prompts
nano /opt/slack-git-ai-bot/config/prompts.js
# Then: pm2 restart slack-git-ai-bot --update-env

# Check nginx
systemctl status nginx
nginx -t && systemctl reload nginx
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `dispatch_failed` | Bot not running | `pm2 start src/index.js --name slack-git-ai-bot` |
| `operation_timeout` | AI taking too long | Switch to faster model in `claude.js` |
| `EADDRINUSE :3000` | Old process still running | `fuser -k 3000/tcp && pm2 restart slack-claude-bot` |
| GitHub returns wrong files | Keywords not matching | Ask more specific questions |
| Jira ticket not created | Token expired or wrong project | Check `.env` JIRA_TOKEN and JIRA_PROJECT |
| Bot answers from docs not code | AI ignoring context | Already fixed in prompt — ensure `claude.js` is latest version |

---

## Slack App Settings

Registered at [api.slack.com/apps](https://api.slack.com/apps) — create a **Slack App** in your workspace and add the slash commands.

**Bot Token Scopes:** `commands`, `chat:write`, `chat:write.public`

**Slash Commands:**
- `/ask` → `http://YOUR_SERVER_IP/slack/ask`
- `/task` → `http://YOUR_SERVER_IP/slack/task`
- `/jira` → `http://YOUR_SERVER_IP/slack/jira`

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
