#!/bin/bash

# ============================================================
# Slack Claude Bot - Automated Installation Script
# ============================================================
# This script installs Node.js 20, nginx, PM2, configures
# the Slack Claude bot, and sets up reverse proxy routing.
# ============================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BOT_PORT=3000
BOT_DIR="/opt/slack-claude-bot"
NGINX_CONF="/etc/nginx/sites-available/slack-claude-bot"
NGINX_ENABLED="/etc/nginx/sites-enabled/slack-claude-bot"
SERVER_URL="http://YOUR_SERVER_IP/slack/ask"

# ============================================================
# Helper Functions
# ============================================================

print_header() {
  echo ""
  echo "====================================="
  echo "$1"
  echo "====================================="
}

print_step() {
  echo -e "${GREEN}[STEP]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

# ============================================================
# Pre-flight Checks
# ============================================================

print_header "Pre-flight Checks"

if [[ $EUID -ne 0 ]]; then
  print_error "This script must be run as root"
  exit 1
fi

print_step "Running on $(lsb_release -ds 2>/dev/null || echo 'Linux')"
print_step "Checking system requirements"

# ============================================================
# Update System Packages
# ============================================================

print_header "Updating System Packages"

print_step "Running apt-get update..."
apt-get update -qq || true
print_step "Running apt-get upgrade..."
apt-get upgrade -y -qq || true

# ============================================================
# Install Node.js 20
# ============================================================

print_header "Installing Node.js 20"

if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  print_info "Node.js already installed: $NODE_VERSION"
else
  print_step "Installing Node.js 20 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || {
    print_error "Failed to add NodeSource repository"
    exit 1
  }
  apt-get install -y nodejs || {
    print_error "Failed to install Node.js"
    exit 1
  }
  print_success "Node.js installed: $(node -v)"
fi

print_success "npm version: $(npm -v)"

# ============================================================
# Install Nginx
# ============================================================

print_header "Installing Nginx"

if command -v nginx &> /dev/null; then
  print_info "Nginx already installed: $(nginx -v 2>&1)"
else
  print_step "Installing nginx..."
  apt-get install -y nginx || {
    print_error "Failed to install nginx"
    exit 1
  }
  print_success "Nginx installed"
fi

# ============================================================
# Install PM2
# ============================================================

print_header "Installing PM2"

if npm list -g pm2 &> /dev/null; then
  print_info "PM2 already installed globally"
else
  print_step "Installing PM2 globally..."
  npm install -g pm2 || {
    print_error "Failed to install PM2"
    exit 1
  }
  print_success "PM2 installed"
fi

# ============================================================
# Create Bot Directory
# ============================================================

print_header "Creating Bot Directory"

print_step "Creating $BOT_DIR..."
mkdir -p "$BOT_DIR" || {
  print_error "Failed to create bot directory"
  exit 1
}
print_success "Bot directory created"

# ============================================================
# Write Bot Files
# ============================================================

print_header "Writing Bot Application Files"

# index.js
print_step "Writing index.js..."
cat > "$BOT_DIR/index.js" << 'EOF'
// ============================================================
// Slack Bot with Claude AI + GitHub Integration
// Usage: /ask <your question about the project>
// ============================================================

require("dotenv").config();
const express = require("express");
const { WebClient } = require("@slack/web-api");
const { fetchGitHubContext } = require("./github");
const { askClaude } = require("./claude");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// ── Slack URL verification (required on first setup) ─────────
app.post("/slack/events", (req, res) => {
  if (req.body.type === "url_verification") {
    return res.json({ challenge: req.body.challenge });
  }
  res.sendStatus(200);
});

// ── /ask slash command handler ───────────────────────────────
app.post("/slack/ask", async (req, res) => {
  const { text: question, user_id, channel_id, response_url } = req.body;

  if (!question || question.trim() === "") {
    return res.json({
      response_type: "ephemeral",
      text: "Please provide a question. Example: `/ask What does the auth module do?`",
    });
  }

  // Acknowledge immediately (Slack requires response within 3 seconds)
  res.json({
    response_type: "in_channel",
    text: `_<@${user_id}> asked:_ *${question}*\n\n⏳ Thinking...`,
  });

  try {
    // 1. Fetch relevant GitHub context based on the question
    console.log(`[ask] Fetching GitHub context for: "${question}"`);
    const githubContext = await fetchGitHubContext(question);

    // 2. Ask Claude with the question + GitHub context
    console.log("[ask] Sending to Claude...");
    const answer = await askClaude(question, githubContext);

    // 3. Post the answer back to Slack
    await fetch(response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        replace_original: true,
        blocks: buildSlackBlocks(question, answer, githubContext),
      }),
    });
  } catch (err) {
    console.error("[ask] Error:", err.message);
    await fetch(response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        replace_original: true,
        text: `❌ Something went wrong: ${err.message}`,
      }),
    });
  }
});

// ── Build nicely formatted Slack blocks ─────────────────────
function buildSlackBlocks(question, answer, githubContext) {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Question:* ${question}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Answer:*\n${answer}`,
      },
    },
  ];

  // Optionally show what GitHub sources were used
  if (githubContext.sources && githubContext.sources.length > 0) {
    const sourceLinks = githubContext.sources
      .slice(0, 5)
      .map((s) => `• <${s.url}|${s.label}>`)
      .join("\n");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📂 *GitHub sources used:*\n${sourceLinks}`,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🤖 Powered by Claude + GitHub | Repo: ${process.env.GITHUB_REPO}`,
      },
    ],
  });

  return blocks;
}

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Slack bot server running on port ${PORT}`);
  console.log(`   Slash command endpoint: POST /slack/ask`);
  console.log(`   Events endpoint:        POST /slack/events`);
});
EOF

print_success "index.js written"

# github.js
print_step "Writing github.js..."
cat > "$BOT_DIR/github.js" << 'EOF'
// ============================================================
// GitHub Integration Module
// Fetches relevant context from your repo to answer questions
// ============================================================

const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Parse "owner/repo" from env
function getRepo() {
  const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPO must be in format owner/repo");
  return { owner, repo };
}

// ── Main entry point ─────────────────────────────────────────
// Decides what GitHub data to fetch based on the question
async function fetchGitHubContext(question) {
  const q = question.toLowerCase();
  const context = { text: "", sources: [] };
  const parts = [];

  try {
    // Always include recent PR & issue summary for project awareness
    if (q.includes("pr") || q.includes("pull request") || q.includes("merge") || q.includes("progress") || q.includes("status")) {
      const prs = await getOpenPRs();
      parts.push(prs.text);
      context.sources.push(...prs.sources);
    }

    if (q.includes("issue") || q.includes("bug") || q.includes("task") || q.includes("todo") || q.includes("progress") || q.includes("status")) {
      const issues = await getOpenIssues();
      parts.push(issues.text);
      context.sources.push(...issues.sources);
    }

    // Code questions → search for relevant files
    if (q.includes("file") || q.includes("function") || q.includes("class") || q.includes("module") || q.includes("how does") || q.includes("what does") || q.includes("explain") || q.includes("code")) {
      const search = await searchCode(question);
      parts.push(search.text);
      context.sources.push(...search.sources);
    }

    // Commits / recent activity
    if (q.includes("commit") || q.includes("recent") || q.includes("latest") || q.includes("last change") || q.includes("who changed")) {
      const commits = await getRecentCommits();
      parts.push(commits.text);
      context.sources.push(...commits.sources);
    }

    // Repo structure overview (default fallback if nothing else matched)
    if (parts.length === 0) {
      const overview = await getRepoOverview();
      parts.push(overview.text);
      context.sources.push(...overview.sources);
    }

    context.text = parts.join("\n\n---\n\n");
  } catch (err) {
    console.error("[github] Error fetching context:", err.message);
    context.text = `(Could not fetch full GitHub context: ${err.message})`;
  }

  return context;
}

// ── Open Pull Requests ───────────────────────────────────────
async function getOpenPRs() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.pulls.list({ owner, repo, state: "open", per_page: 10 });

  const sources = data.map((pr) => ({
    label: `PR #${pr.number}: ${pr.title}`,
    url: pr.html_url,
  }));

  const text = data.length === 0
    ? "No open pull requests."
    : `## Open Pull Requests (${data.length})\n` +
      data.map((pr) =>
        `- PR #${pr.number} [${pr.state}] "${pr.title}" by @${pr.user.login}\n  Branch: ${pr.head.ref} → ${pr.base.ref}\n  URL: ${pr.html_url}\n  Opened: ${pr.created_at}\n  ${pr.body ? "Description: " + pr.body.slice(0, 200) : ""}`
      ).join("\n\n");

  return { text, sources };
}

// ── Open Issues ──────────────────────────────────────────────
async function getOpenIssues() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.issues.listForRepo({ owner, repo, state: "open", per_page: 15 });

  // Filter out PRs (GitHub returns PRs as issues too)
  const issues = data.filter((i) => !i.pull_request);

  const sources = issues.map((i) => ({
    label: `Issue #${i.number}: ${i.title}`,
    url: i.html_url,
  }));

  const text = issues.length === 0
    ? "No open issues."
    : `## Open Issues (${issues.length})\n` +
      issues.map((i) =>
        `- Issue #${i.number} "${i.title}" [Labels: ${i.labels.map((l) => l.name).join(", ") || "none"}]\n  URL: ${i.html_url}\n  ${i.body ? "Description: " + i.body.slice(0, 150) : ""}`
      ).join("\n\n");

  return { text, sources };
}

// ── Code Search ──────────────────────────────────────────────
async function searchCode(question) {
  const { owner, repo } = getRepo();

  // Extract meaningful keywords from question
  const stopWords = new Set(["what", "does", "how", "the", "is", "are", "can", "explain", "tell", "me", "about", "a", "an", "in", "for", "of", "and", "to", "this"]);
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 3);

  if (keywords.length === 0) {
    return { text: "", sources: [] };
  }

  const searchQuery = `${keywords.join(" ")} repo:${owner}/${repo}`;
  console.log(`[github] Code search: "${searchQuery}"`);

  try {
    const { data } = await octokit.search.code({ q: searchQuery, per_page: 5 });

    const sources = data.items.map((item) => ({
      label: item.path,
      url: item.html_url,
    }));

    // Fetch file contents for top results
    const fileContents = await Promise.allSettled(
      data.items.slice(0, 3).map(async (item) => {
        try {
          const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: item.path });
          const content = Buffer.from(fileData.content, "base64").toString("utf-8");
          return `### File: ${item.path}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``;
        } catch {
          return `### File: ${item.path}\n(Could not fetch content)`;
        }
      })
    );

    const filesText = fileContents
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const text = data.items.length === 0
      ? `No code found matching: ${keywords.join(", ")}`
      : `## Relevant Code Files\n${filesText}`;

    return { text, sources };
  } catch (err) {
    return { text: `(Code search unavailable: ${err.message})`, sources: [] };
  }
}

// ── Recent Commits ───────────────────────────────────────────
async function getRecentCommits() {
  const { owner, repo } = getRepo();
  const { data } = await octokit.repos.listCommits({ owner, repo, per_page: 10 });

  const sources = data.map((c) => ({
    label: c.commit.message.split("\n")[0].slice(0, 60),
    url: c.html_url,
  }));

  const text = `## Recent Commits\n` +
    data.map((c) =>
      `- ${c.sha.slice(0, 7)} by @${c.commit.author.name} (${c.commit.author.date.slice(0, 10)})\n  "${c.commit.message.split("\n")[0]}"`
    ).join("\n");

  return { text, sources };
}

// ── Repo Overview ────────────────────────────────────────────
async function getRepoOverview() {
  const { owner, repo } = getRepo();

  const [repoData, contents] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.getContent({ owner, repo, path: "" }).catch(() => ({ data: [] })),
  ]);

  const r = repoData.data;
  const files = Array.isArray(contents.data)
    ? contents.data.map((f) => `${f.type === "dir" ? "📁" : "📄"} ${f.name}`).join("\n")
    : "";

  // Try to fetch README
  let readme = "";
  try {
    const { data: readmeData } = await octokit.repos.getReadme({ owner, repo });
    readme = Buffer.from(readmeData.content, "base64").toString("utf-8").slice(0, 1000);
  } catch {
    readme = "(No README found)";
  }

  const text = `## Repository: ${r.full_name}\n` +
    `Description: ${r.description || "N/A"}\n` +
    `Default branch: ${r.default_branch}\n` +
    `Stars: ${r.stargazers_count} | Forks: ${r.forks_count} | Open Issues: ${r.open_issues_count}\n\n` +
    `### Root Files/Folders:\n${files}\n\n` +
    `### README (first 1000 chars):\n${readme}`;

  const sources = [{ label: `${r.full_name} on GitHub`, url: r.html_url }];

  return { text, sources };
}

module.exports = { fetchGitHubContext };
EOF

print_success "github.js written"

# claude.js
print_step "Writing claude.js..."
cat > "$BOT_DIR/claude.js" << 'EOF'
// ============================================================
// Claude AI Integration Module
// Sends question + GitHub context to Claude for a smart answer
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a helpful engineering assistant for a software development team.
You have access to the team's GitHub repository context including code files, open pull requests, issues, and recent commits.

Your job is to answer questions about the project clearly and concisely.

Guidelines:
- Be direct and helpful. Developers want accurate, actionable answers.
- When referencing code, use code blocks with the correct language syntax.
- When referencing PRs or issues, mention their number and title.
- If you're not sure about something, say so rather than guessing.
- Keep answers focused. Avoid unnecessary padding.
- Format your response for Slack (use *bold*, _italic_, \`code\`, and \`\`\`code blocks\`\`\`).
- If the context doesn't have enough information to fully answer, say what you do know and suggest where to look.`;

async function askClaude(question, githubContext) {
  const userMessage = `
## Question from team member:
${question}

## GitHub Repository Context:
${githubContext.text || "No specific context was fetched for this question."}

Please answer the question based on the GitHub context above.
`.trim();

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  return response.content[0].text;
}

module.exports = { askClaude };
EOF

print_success "claude.js written"

# package.json
print_step "Writing package.json..."
cat > "$BOT_DIR/package.json" << 'EOF'
{
  "name": "slack-claude-bot",
  "version": "1.0.0",
  "description": "Slack bot that answers project questions using Claude AI + GitHub",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@octokit/rest": "^20.0.0",
    "@slack/web-api": "^7.0.0",
    "dotenv": "^16.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
EOF

print_success "package.json written"

# ecosystem.config.js
print_step "Writing ecosystem.config.js..."
cat > "$BOT_DIR/ecosystem.config.js" << 'EOF'
// PM2 Ecosystem Config
// Keeps the bot running 24/7, auto-restarts on crash

module.exports = {
  apps: [
    {
      name: "slack-claude-bot",
      script: "index.js",
      cwd: "/opt/slack-claude-bot",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      // Logs
      out_file: "/var/log/slack-bot-out.log",
      error_file: "/var/log/slack-bot-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
EOF

print_success "ecosystem.config.js written"

# ============================================================
# Install Dependencies
# ============================================================

print_header "Installing Dependencies"

print_step "Running npm install --production in $BOT_DIR..."
cd "$BOT_DIR" || exit 1
npm install --production || {
  print_error "Failed to install npm dependencies"
  exit 1
}
print_success "Dependencies installed"

# ============================================================
# Create .env.example
# ============================================================

print_header "Creating Environment Configuration"

print_step "Writing .env.example..."
cat > "$BOT_DIR/.env.example" << 'EOF'
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here

# Claude API
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# GitHub Integration
GITHUB_TOKEN=ghp_your-personal-access-token-here
GITHUB_REPO=owner/repo-name

# Server
PORT=3000
NODE_ENV=production
EOF

print_success ".env.example created at $BOT_DIR/.env.example"
print_info "You must create .env file and fill in your tokens before running the bot"

# ============================================================
# Configure Nginx
# ============================================================

print_header "Configuring Nginx Reverse Proxy"

print_step "Creating nginx configuration..."
cat > "$NGINX_CONF" << 'EOF'
server {
    listen 80;
    listen [::]:80;
    
    server_name _;

    # Slack bot endpoints
    location /slack/ {
        proxy_pass http://localhost:3000/slack/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Slack requires response within 3 seconds, be lenient
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
    }
}
EOF

print_success "Nginx configuration created at $NGINX_CONF"

# Enable the site
print_step "Enabling nginx site configuration..."
if [ -L "$NGINX_ENABLED" ]; then
  rm -f "$NGINX_ENABLED"
fi
ln -s "$NGINX_CONF" "$NGINX_ENABLED" || {
  print_error "Failed to enable nginx site"
  exit 1
}

# Test nginx config
print_step "Testing nginx configuration..."
nginx -t || {
  print_error "Nginx configuration test failed"
  exit 1
}

# Reload nginx
print_step "Reloading nginx..."
systemctl reload nginx || {
  print_error "Failed to reload nginx"
  exit 1
}

print_success "Nginx configured and reloaded"

# ============================================================
# Start Bot with PM2
# ============================================================

print_header "Starting Bot with PM2"

print_step "Stopping any existing PM2 process..."
pm2 delete "slack-claude-bot" 2>/dev/null || true

print_step "Starting bot with PM2..."
cd "$BOT_DIR" || exit 1
pm2 start ecosystem.config.js || {
  print_error "Failed to start bot with PM2"
  exit 1
}

print_success "Bot started with PM2"

print_step "Setting up PM2 startup on system boot..."
pm2 startup -u root --hp /root || {
  print_error "Failed to setup PM2 startup"
  exit 1
}

print_step "Saving PM2 process list..."
pm2 save || {
  print_error "Failed to save PM2 process list"
  exit 1
}

print_success "PM2 startup configured"

# ============================================================
# Configure Firewall
# ============================================================

print_header "Configuring Firewall (UFW)"

if command -v ufw &> /dev/null; then
  print_step "Opening firewall ports with ufw..."
  
  # Check if ufw is enabled
  ufw_status=$(ufw status | grep -i active || true)
  
  if [ -n "$ufw_status" ]; then
    print_step "UFW is active, opening ports 80 and 443..."
    ufw allow 80/tcp || print_info "Port 80 already open or rule exists"
    ufw allow 443/tcp || print_info "Port 443 already open or rule exists"
    print_success "Firewall ports configured"
  else
    print_info "UFW is not enabled. To enable it, run: ufw enable"
    print_info "Then run: ufw allow 80/tcp && ufw allow 443/tcp"
  fi
else
  print_info "UFW not found. If using iptables or another firewall, open ports 80 and 443 manually."
fi

# ============================================================
# Final Status and Instructions
# ============================================================

print_header "Installation Complete!"

echo ""
echo "Bot Directory: $BOT_DIR"
echo "Nginx Config: $NGINX_CONF"
echo ""

print_success "All components installed and configured"
echo ""
echo "====================================="
echo "NEXT STEPS"
echo "====================================="
echo ""
echo "1. Create your .env file:"
echo "   cp $BOT_DIR/.env.example $BOT_DIR/.env"
echo ""
echo "2. Edit $BOT_DIR/.env and fill in:"
echo "   - SLACK_BOT_TOKEN (from Slack App)"
echo "   - SLACK_SIGNING_SECRET (from Slack App)"
echo "   - ANTHROPIC_API_KEY (from Anthropic)"
echo "   - GITHUB_TOKEN (Personal Access Token)"
echo "   - GITHUB_REPO (owner/repo-name)"
echo ""
echo "3. Restart the bot:"
echo "   pm2 restart slack-claude-bot"
echo ""
echo "4. Configure your Slack app:"
echo "   - Set Request URL to: $SERVER_URL"
echo "   - Create /ask slash command"
echo "   - Grant required scopes"
echo ""
echo "5. Test it out:"
echo "   /ask What does this project do?"
echo ""
echo "====================================="
echo "Useful Commands"
echo "====================================="
echo "View bot logs:     pm2 logs slack-claude-bot"
echo "Restart bot:       pm2 restart slack-claude-bot"
echo "Stop bot:          pm2 stop slack-claude-bot"
echo "Bot status:        pm2 status"
echo "Nginx status:      systemctl status nginx"
echo ""

