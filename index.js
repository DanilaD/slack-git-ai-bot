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
