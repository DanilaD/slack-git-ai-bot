// ============================================================
// AI Prompts Configuration
// ============================================================
// Prompts are loaded from prompts/*.md (project root).
// Edit ask.md, task.md, jira.md without touching this file.
// Each prompt has a SYSTEM section (role/rules) and
// a USER template (the actual question sent to the AI).
// ============================================================

const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

/**
 * Parses a .md prompt file into { system, user } sections.
 * Expects "## system" and "## user" headers in the file.
 */
const loadPrompt = (filename) => {
  const content = fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
  const sections = content.split(/^## (system|user)\s*$/m);

  let system = "";
  let user = "";

  for (let i = 1; i < sections.length; i += 2) {
    const sectionName = sections[i]?.trim().toLowerCase();
    const sectionContent = sections[i + 1]?.trim() ?? "";
    if (sectionName === "system") system = sectionContent;
    if (sectionName === "user") user = sectionContent;
  }

  return { system, user };
};

const ASK = loadPrompt("ask.md");
const TASK = loadPrompt("task.md");
const JIRA = loadPrompt("jira.md");

module.exports = { ASK, TASK, JIRA };
