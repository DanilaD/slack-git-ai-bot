// ============================================================
// AI Integration Module
// Reads provider + prompts from config/ and calls the right API
// To switch AI provider: edit config/ai.js → ACTIVE_PROVIDER
// To change prompts: edit config/prompts.js
// ============================================================

require("dotenv").config();
const aiConfig = require("../config/ai");
const { ASK, TASK, JIRA } = require("../config/prompts");

// ── Core API caller (OpenAI-compatible format) ────────────────
// Groq and OpenAI both use the same /v1/chat/completions format.
// Anthropic uses a different format — handled separately below.
async function callAI(systemPrompt, userMessage) {
  const apiKey = process.env[aiConfig.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing env var: ${aiConfig.apiKeyEnv}. Add it to your .env file.`);
  }

  // Anthropic uses a different API format
  if (aiConfig.ACTIVE_PROVIDER === "anthropic") {
    return callAnthropic(systemPrompt, userMessage, apiKey);
  }

  // Groq + OpenAI use the same OpenAI-compatible format
  const response = await fetch(aiConfig.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      max_tokens: aiConfig.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${aiConfig.name} API error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── Anthropic-specific caller ────────────────────────────────
async function callAnthropic(systemPrompt, userMessage, apiKey) {
  const response = await fetch(aiConfig.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: aiConfig.model,
      max_tokens: aiConfig.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── Fill in template placeholders ────────────────────────────
function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replace(new RegExp(`\\{${key}\\}`, "g"), val || ""),
    template
  );
}

// ── /ask — Answer a question about the codebase ──────────────
async function askQuestion(question, githubContext) {
  console.log(`[ai] Provider: ${aiConfig.name} | Model: ${aiConfig.model}`);
  const userMessage = fillTemplate(ASK.user, {
    question,
    context: githubContext.text || "No context available.",
  });
  return callAI(ASK.system, userMessage);
}

// ── /task — Produce an implementation plan ───────────────────
async function analyzeTask(question, githubContext) {
  console.log(`[ai] Provider: ${aiConfig.name} | Model: ${aiConfig.model}`);
  const userMessage = fillTemplate(TASK.user, {
    question,
    context: githubContext.text || "No context available.",
  });
  return callAI(TASK.system, userMessage);
}

// ── /jira — Generate structured Jira ticket content ──────────
async function generateJiraContent(question, githubContext) {
  console.log(`[ai] Provider: ${aiConfig.name} | Model: ${aiConfig.model}`);
  const userMessage = fillTemplate(JIRA.user, {
    question,
    context: githubContext.text || "No context available.",
  });
  return callAI(JIRA.system, userMessage);
}

module.exports = { askQuestion, analyzeTask, generateJiraContent };
