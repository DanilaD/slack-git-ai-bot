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
