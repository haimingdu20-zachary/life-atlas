import { resolveAiProvider } from "@/app/lib/ai-provider-server";

export async function POST(request: Request) {
  const provider = resolveAiProvider(request);
  if (!provider.apiKey) return Response.json({ ok: false, error: "请先输入 API Key" }, { status: 400 });
  if (!/^[a-zA-Z0-9._:-]{2,80}$/.test(provider.model)) return Response.json({ ok: false, error: "模型 ID 格式无效" }, { status: 400 });
  if (provider.provider === "deepseek" && provider.model !== "deepseek-v4-flash") return Response.json({ ok: false, error: "DeepSeek Responses API 目前仅支持 deepseek-v4-flash" }, { status: 400 });
  try {
    const response = await fetch(provider.modelsUrl, { headers: { "Authorization": `Bearer ${provider.apiKey}` } });
    const data = await response.json() as { id?: string; owned_by?: string; data?: Array<{ id: string; owned_by?: string }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ ok: false, error: data.error?.message || "API Key 或模型不可用" }, { status: response.status });
    const deepSeekModel = data.data?.find(item => item.id === provider.model);
    if (provider.provider === "deepseek" && !deepSeekModel) return Response.json({ ok: false, error: `DeepSeek 账户不可用模型 ${provider.model}` }, { status: 400 });
    return Response.json({ ok: true, provider: provider.provider, model: deepSeekModel?.id || data.id || provider.model, owner: deepSeekModel?.owned_by || data.owned_by || provider.provider });
  } catch {
    return Response.json({ ok: false, error: `无法连接 ${provider.provider === "deepseek" ? "DeepSeek" : "OpenAI"} API，请检查网络` }, { status: 502 });
  }
}
