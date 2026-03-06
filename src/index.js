// ============================================================
// Slack Bot — Main Server
// Handles /ask, /task, /jira slash commands
// ============================================================

require("dotenv").config();
const express = require("express");
const { fetchGitHubContext } = require("./github");
const { askQuestion, analyzeTask, generateJiraContent } = require("./ai");
const { createJiraTicket } = require("./jira");
const aiConfig = require("../config/ai");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

console.log(`🤖 AI Provider: ${aiConfig.name} | Model: ${aiConfig.model}`);

// ── Helpers ──────────────────────────────────────────────────

// Post a message back to Slack via response_url
async function postToSlack(response_url, payload) {
  await fetch(response_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Update Slack with a plain text progress message
async function updateSlack(response_url, text) {
  await postToSlack(response_url, {
    response_type: "in_channel",
    replace_original: true,
    text,
  });
}

// Build formatted Slack blocks for a final answer
function buildAnswerBlocks(question, answer, githubContext, label = "Answer") {
  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Question:* ${question}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${label}:*\n${answer}` },
    },
  ];

  if (githubContext.sources && githubContext.sources.length > 0) {
    const sourceLinks = githubContext.sources
      .slice(0, 5)
      .map((s) => `• <${s.url}|${s.label}>`)
      .join("\n");
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `📂 *GitHub sources:*\n${sourceLinks}` }],
    });
  }

  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `🤖 ${aiConfig.name} (${aiConfig.model}) | Repo: ${process.env.GITHUB_REPO}`,
    }],
  });

  return blocks;
}

// ── Slack URL verification ────────────────────────────────────
app.post("/slack/events", (req, res) => {
  if (req.body.type === "url_verification") {
    return res.json({ challenge: req.body.challenge });
  }
  res.sendStatus(200);
});

// ── /ask — Answer a question about the codebase ──────────────
app.post("/slack/ask", async (req, res) => {
  const { text: question, user_id, response_url } = req.body;

  if (!question || question.trim() === "") {
    return res.json({
      response_type: "ephemeral",
      text: "Please provide a question. Example: `/ask What does the auth module do?`",
    });
  }

  // Acknowledge immediately (Slack requires response within 3 seconds)
  res.json({
    response_type: "in_channel",
    text: `_<@${user_id}> asked:_ *${question}*\n\n⏳ Searching codebase...`,
  });

  setImmediate(async () => {
    try {
      console.log(`[ask] "${question}"`);
      const githubContext = await fetchGitHubContext(question);
      await updateSlack(response_url, `_<@${user_id}> asked:_ *${question}*\n\n📂 Found context. Generating answer...`);

      const answer = await askQuestion(question, githubContext);

      await postToSlack(response_url, {
        response_type: "in_channel",
        replace_original: true,
        blocks: buildAnswerBlocks(question, answer, githubContext),
      });
    } catch (err) {
      console.error("[ask] Error:", err.message);
      await postToSlack(response_url, {
        response_type: "ephemeral",
        replace_original: true,
        text: `❌ Something went wrong: ${err.message}`,
      });
    }
  });
});

// ── /task — Analyze a feature and return an implementation plan ──
app.post("/slack/task", async (req, res) => {
  const { text: description, user_id, response_url } = req.body;

  if (!description || description.trim() === "") {
    return res.json({
      response_type: "ephemeral",
      text: "Please describe the task. Example: `/task Add email verification to the registration flow`",
    });
  }

  res.json({
    response_type: "in_channel",
    text: `_<@${user_id}> requested task analysis:_ *${description}*\n\n⏳ Analyzing codebase...`,
  });

  setImmediate(async () => {
    try {
      console.log(`[task] "${description}"`);
      const githubContext = await fetchGitHubContext(description);
      await updateSlack(response_url, `_<@${user_id}> requested task:_ *${description}*\n\n📂 Found context. Generating plan...`);

      const plan = await analyzeTask(description, githubContext);

      await postToSlack(response_url, {
        response_type: "in_channel",
        replace_original: true,
        blocks: buildAnswerBlocks(description, plan, githubContext, "Implementation Plan"),
      });
    } catch (err) {
      console.error("[task] Error:", err.message);
      await postToSlack(response_url, {
        response_type: "ephemeral",
        replace_original: true,
        text: `❌ Something went wrong: ${err.message}`,
      });
    }
  });
});

// ── /jira — Analyze code and create a Jira ticket ────────────
app.post("/slack/jira", async (req, res) => {
  const { text: description, user_id, response_url } = req.body;

  if (!description || description.trim() === "") {
    return res.json({
      response_type: "ephemeral",
      text: "Please describe what you want to build. Example: `/jira Add email verification to registration`",
    });
  }

  res.json({
    response_type: "in_channel",
    text: `_<@${user_id}> creating Jira ticket:_ *${description}*\n\n⏳ Analyzing codebase...`,
  });

  setImmediate(async () => {
    try {
      console.log(`[jira] "${description}"`);
      const githubContext = await fetchGitHubContext(description);
      await updateSlack(response_url, `_<@${user_id}> creating ticket:_ *${description}*\n\n📂 Found context. Generating ticket content...`);

      const ticketContent = await generateJiraContent(description, githubContext);

      await updateSlack(response_url, `_<@${user_id}> creating ticket:_ *${description}*\n\n✍️ Creating Jira ticket...`);

      // Use first line of AI response as summary, rest as description
      const lines = ticketContent.trim().split("\n");
      const summary = description.slice(0, 200); // Use original request as title
      const ticket = await createJiraTicket({ summary, description: ticketContent });

      await postToSlack(response_url, {
        response_type: "in_channel",
        replace_original: true,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `✅ *Jira ticket created!*\n*<${ticket.url}|${ticket.key}: ${summary}>*` },
          },
          { type: "divider" },
          {
            type: "section",
            text: { type: "mrkdwn", text: ticketContent.slice(0, 2900) },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `🤖 ${aiConfig.name} | Repo: ${process.env.GITHUB_REPO}` }],
          },
        ],
      });
    } catch (err) {
      console.error("[jira] Error:", err.message);
      await postToSlack(response_url, {
        response_type: "ephemeral",
        replace_original: true,
        text: `❌ Something went wrong: ${err.message}`,
      });
    }
  });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Slack bot running on port ${PORT}`);
  console.log(`   /slack/ask   → answer questions about the codebase`);
  console.log(`   /slack/task  → generate implementation plans`);
  console.log(`   /slack/jira  → analyze + create Jira tickets`);
});
