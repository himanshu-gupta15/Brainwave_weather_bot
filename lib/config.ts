/** Runtime configuration from environment variables (Next.js loads .env.local). */
import path from "node:path";

const KEY_VARS: Record<string, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
const DEFAULT_MODELS: Record<string, string> = { openai: "gpt-4o-mini", anthropic: "claude-sonnet-5-5" };

export interface Settings {
  llmProvider: string; // "openai" | "anthropic" | "none"
  llmModel: string;
  llmEnabled: boolean;
  sopsPath: string;
  taxonomyPath: string;
  httpTimeoutMs: number;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const provider = (env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
  const keyVar = KEY_VARS[provider];
  return {
    llmProvider: provider,
    llmModel: env.LLM_MODEL || DEFAULT_MODELS[provider] || "",
    llmEnabled: Boolean(keyVar && env[keyVar]),
    sopsPath: env.SOPS_PATH ?? path.join(process.cwd(), "data", "sops.yaml"),
    taxonomyPath: env.TAXONOMY_PATH ?? path.join(process.cwd(), "data", "taxonomy.yaml"),
    httpTimeoutMs: Number(env.HTTP_TIMEOUT_MS ?? 10_000),
  };
}
