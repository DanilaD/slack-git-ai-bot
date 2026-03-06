// ============================================================
// AI Provider Configuration
// Change ACTIVE_PROVIDER to switch between providers.
//
// Providers:
//   "groq"      — free tier, fast, recommended  (sign up: console.groq.com)
//   "openai"    — GPT-4o etc                    (sign up: platform.openai.com)
//   "anthropic" — Claude models                 (sign up: console.anthropic.com)
// ============================================================

const ACTIVE_PROVIDER = "groq"; // ← change this line to switch

const PROVIDERS = {
  groq: {
    name: "Groq",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    model: "moonshotai/kimi-k2-instruct", // 131k context
    maxTokens: 2000,
    // Other options: "llama-3.3-70b-versatile" | "llama-3.1-8b-instant" | "llama-4-scout-17b-16e-instruct"
  },

  openai: {
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-4o-mini", // use "gpt-4o" for higher quality
    maxTokens: 2000,
  },

  anthropic: {
    name: "Anthropic",
    apiUrl: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001", // use "claude-sonnet-4-5-20250929" for higher quality
    maxTokens: 2000,
  },
};

const config = PROVIDERS[ACTIVE_PROVIDER];
if (!config) throw new Error(`Unknown provider "${ACTIVE_PROVIDER}". Choose: ${Object.keys(PROVIDERS).join(", ")}`);

module.exports = { ACTIVE_PROVIDER, ...config };
