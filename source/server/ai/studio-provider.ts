import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { aiKeyStatus, keyNameForModel, providerForModel } from "./models";

/** Resolve credentials by model, never by whichever key happens to be available. */
export function studioConnection(model: string, env: Record<string, string | undefined> = process.env) {
  const vendor = providerForModel(model);
  if (vendor === "anthropic") throw new Error("A Studio ezen útvonala OpenAI-kompatibilis modellt igényel.");
  const keyName = keyNameForModel(model);
  const apiKey = env[keyName]?.trim() || (vendor === "openai" ? env.OPENAI_API_KEY?.trim() : undefined);
  if (!apiKey) throw new Error(`A modell saját API-kulcsa hiányzik: ${keyName}.`);
  return {
    vendor, apiKey,
    model: vendor === "openrouter" ? model : model.replace(/^(openai|x-ai)\//, ""),
    baseURL: vendor === "openai" ? "https://api.openai.com/v1" : vendor === "xai" ? "https://api.x.ai/v1" : "https://openrouter.ai/api/v1",
  };
}

export function studioModelReady(model: string) {
  return aiKeyStatus()[providerForModel(model)].configured;
}

export function createStudioProvider(model: string, timeout = 180000, maxTokens = 24000) {
  const connection = studioConnection(model);
  const config = { apiKey: connection.apiKey, model: connection.model, timeout, maxTokens };
  return connection.vendor === "openrouter"
    ? new OpenRouterProvider(config)
    : new OpenAIProvider(config, connection.vendor);
}
