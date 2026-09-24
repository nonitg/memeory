import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "./env";

// All model calls go through OpenRouter. Swap models with LLM_MODEL_FAST /
// LLM_MODEL_WRITER; no code change needed.
const openrouter = createOpenRouter({
  apiKey: env.openrouterKey,
  appName: "Second Brain",
  appUrl: env.appUrl,
});

/** Classification and short answers: low reasoning, only endpoints that honor JSON schemas. */
export function fastModel() {
  return openrouter(env.modelFast, {
    reasoning: { effort: "low" },
    provider: { require_parameters: true },
    plugins: [{ id: "response-healing" }],
  });
}

/** Longer writing (weekly themes). */
export function writerModel() {
  return openrouter(env.modelWriter, { reasoning: { effort: "medium" } });
}
