import { DEFAULT_FEATHERLESS_MODEL } from "./featherless";

export function getStagehandModelConfig() {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    throw new Error("FEATHERLESS_API_KEY is required for Stagehand AI actions");
  }

  return {
    provider: "openai" as const,
    modelName: process.env.FEATHERLESS_MODEL || DEFAULT_FEATHERLESS_MODEL,
    apiKey,
    baseURL: "https://api.featherless.ai/v1",
  };
}
