"use strict";

require("dotenv").config();
const express = require("express");
const { fetchGitHubContext } = require("./github");
const { askQuestion, analyzeTask, generateJiraContent } = require("./ai");
const { createJiraTicket } = require("./jira");
const { name: aiName, model: aiModel } = require("../config/ai");
const { repo } = require("../config/github");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

console.log(`🤖 AI: ${aiName} (${aiModel}) | Repo: ${repo}`);

// ── Slack helpers ─────────────────────────────────────────────

const slackPost = (url, payload) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const slackUpdate = (url, text) =>
  slackPost(url, { response_type: "in_channel", replace_original: true, text });

const slackError = (url, message) =>
  slackPost(url, { response_type: "ephemeral", replace_original: true, text: `❌ ${message}` });

const mrkdwn = (text) => ({ type: "mrkdwn", text });

const buildAnswerBlocks = (question, answer, sources, label = "Answer") => [
  { type: "section", text: mrkdwn(`*Question:* ${question}`) },
  { type: "divider" },
  { type: "section", text: mrkdwn(`*${label}:*\n${answer}`) },
  ...(sources.length > 0 ? [
    { type: "divider" },
    { type: "context", elements: [mrkdwn(`📂 *Sources:*\n${sources.slice(0, 5).map((s) => `• <${s.url}|${s.label}>`).join("\n")}`)] },
  ] : []),
  { type: "context", elements: [mrkdwn(`🤖 ${aiName} (${aiModel}) | ${repo}`)] },
];

// ── Generic command runner ────────────────────────────────────
// Handles the async work for all slash commands after Slack is acknowledged.

const runCommand = (label, aiFn, buildBlocks) => async ({ text, user_id, response_url }) => {
  try {
    const ctx = await fetchGitHubContext(text);
    await slackUpdate(response_url, `_<@${user_id}>:_ *${text}*\n\n📂 Found context. Working...`);

    const result = await aiFn(text, ctx);
    await slackPost(response_url, {
      response_type: "in_channel",
      replace_original: true,
      blocks: buildBlocks(text, result, ctx),
    });
  } catch (err) {
    console.error(`[${label}] Error:`, err.message);
    await slackError(response_url, err.message);
  }
};

// ── Slash command factory ─────────────────────────────────────
// Creates an Express handler: validates input, acks Slack, runs async.

const slashCommand = ({ label, emptyHint, ackText, run }) => async (req, res) => {
  const { text, user_id, response_url } = req.body;

  if (!text?.trim()) {
    return res.json({ response_type: "ephemeral", text: emptyHint });
  }

  res.json({ response_type: "in_channel", text: ackText(user_id, text) });
  setImmediate(() => run({ text, user_id, response_url }));
};

// ── /ask ──────────────────────────────────────────────────────

app.post("/slack/ask", slashCommand({
  label: "ask",
  emptyHint: "Ask a question. Example: `/ask How does registration work?`",
  ackText: (uid, q) => `_<@${uid}> asked:_ *${q}*\n\n⏳ Searching codebase...`,
  run: runCommand("ask", askQuestion, (q, answer, ctx) =>
    buildAnswerBlocks(q, answer, ctx.sources)
  ),
}));

// ── /task ─────────────────────────────────────────────────────

app.post("/slack/task", slashCommand({
  label: "task",
  emptyHint: "Describe the task. Example: `/task Add email verification to registration`",
  ackText: (uid, q) => `_<@${uid}> requested task analysis:_ *${q}*\n\n⏳ Analyzing codebase...`,
  run: runCommand("task", analyzeTask, (q, plan, ctx) =>
    buildAnswerBlocks(q, plan, ctx.sources, "Implementation Plan")
  ),
}));

// ── /jira ─────────────────────────────────────────────────────

const runJira = async ({ text, user_id, response_url }) => {
  try {
    const ctx = await fetchGitHubContext(text);
    await slackUpdate(response_url, `_<@${user_id}>:_ *${text}*\n\n📂 Generating ticket...`);

    const content = await generateJiraContent(text, ctx);
    await slackUpdate(response_url, `_<@${user_id}>:_ *${text}*\n\n✍️ Creating Jira ticket...`);

    const ticket = await createJiraTicket({ summary: text.slice(0, 200), description: content });

    await slackPost(response_url, {
      response_type: "in_channel",
      replace_original: true,
      blocks: [
        { type: "section", text: mrkdwn(`✅ *Ticket created:* <${ticket.url}|${ticket.key}: ${text.slice(0, 80)}>`) },
        { type: "divider" },
        { type: "section", text: mrkdwn(content.slice(0, 2900)) },
        { type: "context", elements: [mrkdwn(`🤖 ${aiName} | ${repo}`)] },
      ],
    });
  } catch (err) {
    console.error("[jira] Error:", err.message);
    await slackError(response_url, err.message);
  }
};

app.post("/slack/jira", slashCommand({
  label: "jira",
  emptyHint: "Describe what to build. Example: `/jira Add email verification to registration`",
  ackText: (uid, q) => `_<@${uid}> creating Jira ticket:_ *${q}*\n\n⏳ Analyzing codebase...`,
  run: runJira,
}));

// ── Slack URL verification ────────────────────────────────────

app.post("/slack/events", (req, res) => {
  if (req.body.type === "url_verification") return res.json({ challenge: req.body.challenge });
  res.sendStatus(200);
});

// ── Start ─────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
  console.log(`   /slack/ask  /slack/task  /slack/jira`);
});
