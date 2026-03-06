"use strict";

const { name, model, apiUrl, apiKeyEnv, maxTokens, ACTIVE_PROVIDER } = require("../config/ai");
const { ASK, TASK, JIRA } = require("../config/prompts");

if (process.env.NODE_ENV !== "test") {
  console.log(`[ai] Provider: ${name} | Model: ${model}`);
}

// ── Template renderer ─────────────────────────────────────────

const render = (template, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v ?? ""), template);

// ── HTTP callers ──────────────────────────────────────────────

const callOpenAICompat = async (systemPrompt, userMessage, apiKey) => {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${name} API error: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
};

const callAnthropic = async (systemPrompt, userMessage, apiKey) => {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  return (await res.json()).content[0].text;
};

// ── Core dispatch ─────────────────────────────────────────────

const callAI = (systemPrompt, userMessage) => {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`Missing env var: ${apiKeyEnv}`);
  return ACTIVE_PROVIDER === "anthropic"
    ? callAnthropic(systemPrompt, userMessage, apiKey)
    : callOpenAICompat(systemPrompt, userMessage, apiKey);
};

// ── Public API ────────────────────────────────────────────────
// Each function renders its prompt template then calls the AI.

const run = ({ system, user }, vars) => callAI(system, render(user, vars));

const contextVars = (question, ctx) => ({
  question,
  context: ctx.text || "No context available.",
});

const askQuestion = (q, ctx) => run(ASK, contextVars(q, ctx));
const analyzeTask = (q, ctx) => run(TASK, contextVars(q, ctx));
const generateJiraContent = (q, ctx) => run(JIRA, contextVars(q, ctx));

module.exports = { askQuestion, analyzeTask, generateJiraContent };
