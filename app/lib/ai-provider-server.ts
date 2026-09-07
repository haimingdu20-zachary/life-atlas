import { env } from "cloudflare:workers";

export type ServerAiProvider = "openai" | "deepseek";

export function resolveAiProvider(request: Request) {
  const provider: ServerAiProvider = request.headers.get("X-Life-Atlas-Provider") === "deepseek" ? "deepseek" : "openai";
  const requestKey = request.headers.get("X-Life-Atlas-API-Key")?.trim();
  const requestModel = request.headers.get("X-Life-Atlas-Model")?.trim();
  const apiKey = requestKey || (provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY);
  const model = requestModel || (provider === "deepseek" ? env.DEEPSEEK_MODEL || "deepseek-v4-flash" : env.OPENAI_MODEL || "gpt-5.4-mini");
  return {
    provider,
    apiKey,
    model,
    source: requestKey ? "browser" : apiKey ? "environment" : "local",
    responsesUrl: provider === "deepseek" ? "https://api.deepseek.com/responses" : "https://api.openai.com/v1/responses",
    modelsUrl: provider === "deepseek" ? "https://api.deepseek.com/models" : `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
  };
}
