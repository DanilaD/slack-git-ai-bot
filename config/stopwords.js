// ============================================================
// Stop Words
// ============================================================
// Words are loaded from prompts/stopwords.md (project root).
// Edit that file to add or remove entries.
// Used by src/github.js when building GitHub code search queries.
// ============================================================

const fs = require("fs");
const path = require("path");

const STOPWORDS_PATH = path.join(__dirname, "..", "prompts", "stopwords.md");

/**
 * Loads stop words from stopwords.md.
 * Each non-empty line (after the --- separator) is a stop word.
 */
const loadStopwords = () => {
  const content = fs.readFileSync(STOPWORDS_PATH, "utf-8");
  const lines = content.split("\n");
  const words = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, markdown headers (#), and the --- separator
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---") continue;
    words.push(trimmed.toLowerCase());
  }

  return new Set(words);
};

module.exports = loadStopwords();
