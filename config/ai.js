// ============================================================
// AI Provider Configuration
// ============================================================
// Change ACTIVE_PROVIDER to switch between AI providers.
// All other settings are picked up automatically.
//
// Available providers:
//   "groq"      — Groq API (free tier, fast, recommended)
//   "openai"    — OpenAI (GPT-4o etc, requires paid key)
//   "anthropic" — Anthropic Claude (requires API credits)
// ============================================================

const ACTIVE_PROVIDER = "groq"; // ← change this to switch provider

const PROVIDERS = {

  // ── Groq (free tier) ───────────────────────────────────────
  // Sign up: https://console.groq.com
  // Free tier: ~14,400 req/day on most models
  groq: {
    name: "Groq",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",           // env var name in .env
    model: "moonshotai/kimi-k2-instruct", // 131k context, great for code
    maxTokens: 2000,
    // Other good Groq models:
    // "llama-3.3-70b-versatile"          — fast, reliable
    // "llama-3.1-8b-instant"             — very fast, lower quality
    // "llama-4-scout-17b-16e-instruct"   — fast, good reasoning
  },

  // ── OpenAI ────────────────────────────────────────────────
  // Sign up: https://platform.openai.com
  openai: {
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-4o-mini",   // cheaper + fast; use "gpt-4o" for best quality
    maxTokens: 2000,
  },

  // ── Anthropic Claude ──────────────────────────────────────
  // Sign up: https://console.anthropic.com
  // Requires console.anthropic.com credits (separate from claude.ai subscription)
  anthropic: {
    name: "Anthropic Claude",
    apiUrl: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001",  // fast + affordable
    // Other options: "claude-sonnet-4-5-20250929" (better quality)
    maxTokens: 2000,
  },
};

// ── Export active config ───────────────────────────────────
const activeConfig = PROVIDERS[ACTIVE_PROVIDER];
if (!activeConfig) {
  throw new Error(`Unknown AI provider: "${ACTIVE_PROVIDER}". Must be one of: ${Object.keys(PROVIDERS).join(", ")}`);
}

module.exports = {
  ACTIVE_PROVIDER,
  ...activeConfig,
  ALL_PROVIDERS: PROVIDERS,
};
