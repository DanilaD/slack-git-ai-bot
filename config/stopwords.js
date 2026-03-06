// ============================================================
// Stop Words
// ============================================================
// Words that are too common to be useful as code-search keywords.
// Add or remove entries here to tune keyword extraction behavior.
// Used by src/github.js when building GitHub code search queries.
// ============================================================

module.exports = new Set([
  // Question words
  "what", "which", "where", "when", "who", "why", "how",

  // Common verbs
  "does", "do", "did", "is", "are", "was", "were", "has", "have", "had",
  "can", "could", "would", "should", "will", "get", "make", "use",

  // Common connectives / articles / prepositions
  "the", "a", "an", "and", "or", "but", "not", "for", "of", "to", "in",
  "on", "at", "by", "up", "as", "if", "so", "than", "then", "with",
  "from", "into", "about", "over", "out", "be", "it", "its",

  // Meta / conversational words
  "tell", "me", "this", "that", "these", "those", "show", "find", "explain",
  "give", "list", "all",
]);
