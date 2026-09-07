import { localRefine } from "@/app/lib/local-refine";
import { resolveAiProvider } from "@/app/lib/ai-provider-server";

type RefineInput = {
  title?: string;
  locationName?: string;
  occurredAt?: string;
  detail?: string;
  polishedDetail?: string;
  summary?: string;
  lessons?: string;
  people?: string;
  tags?: string[];
  tone?: "original" | "diary" | "honest" | "literary" | "growth" | "grammar" | "concise" | "storymaster";
};

type OpenAIResponse = {
  output_text?: string;
  status?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

export async function GET(request: Request) {
  const provider = resolveAiProvider(request);
  const configured = Boolean(provider.apiKey);
  return Response.json({ configured, mode: configured ? provider.provider : "local", provider: provider.provider, model: configured ? provider.model : "local-editor", source: provider.source });
}

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "不超过 28 字的经历标题" },
    summary: { type: "string", description: "不超过 60 字的一句话摘要" },
    detail: { type: "string", description: "保留事实的完整经历叙述" },
    lessons: { type: "string", description: "从原文可支持的感受与收获" },
    emotion: { type: "string", enum: ["calm", "joy", "excitement", "moved", "longing", "sadness", "regret", "anxiety", "anger", "loneliness", "confusion", "relief"] },
    emotions: { type: "array", items: { type: "string", enum: ["calm", "joy", "excitement", "moved", "longing", "sadness", "regret", "anxiety", "anger", "loneliness", "confusion", "relief"] }, minItems: 1, uniqueItems: true, maxItems: 6 },
    lifePhase: { type: "string", enum: ["", "turning", "low", "rebirth"], description: "可选的人生阶段标记；普通经历返回空字符串" },
    people: { type: "array", items: { type: "string" }, maxItems: 8 },
    tags: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["title", "summary", "detail", "lessons", "emotion", "emotions", "lifePhase", "people", "tags"],
} as const;

export async function POST(request: Request) {
  const body = await request.json() as RefineInput;
  const rawText = [body.title, body.summary, body.detail, body.polishedDetail, body.lessons].filter(Boolean).join("\n").trim();
  if (rawText.length < 8) {
    return Response.json({ error: "先写下至少一两句你真实记得的片段，AI 才能帮你完善。" }, { status: 400 });
  }

  const provider = resolveAiProvider(request);
  if (!provider.apiKey) {
    return Response.json({ refined: localRefine(body), model: "local-editor", mode: "local" });
  }

  const tone = body.tone === "original" ? "最大限度保留原话、口语和个人表达，只做必要的断句分段" : body.tone === "grammar" ? "仅纠正语病、错别字和标点，不改写措辞与叙事顺序" : body.tone === "diary" || body.tone === "concise" ? "简洁、清晰、像真实日记" : body.tone === "literary" ? "细腻、有画面感，但不过度煽情" : body.tone === "growth" ? "以成长复盘的方式梳理经过、感受、影响和可被原文支持的收获" : body.tone === "storymaster" ? "使用 Storytelling Mastery 做叙事润色，而不是套用英雄旅程：保持第一人称、原有时间顺序和讲述者个人语气；优化开头、语句节奏、段落、转折衔接与结尾余韵；突出原文已经提供的动作、场景、选择、阻力和情绪变化，删除重复与空泛表达；可以使用克制的修辞，但修辞只能概括原文已有情绪，不能变成新事实，也不要强行制造冲突或成长" : "克制、真诚、保留讲述者本人的语气";
  const model = provider.model;
  if (!/^[a-zA-Z0-9._:-]{2,80}$/.test(model)) return Response.json({ error: "模型 ID 格式无效" }, { status: 400 });
  if (provider.provider === "deepseek" && model !== "deepseek-v4-flash") return Response.json({ error: "DeepSeek Responses API 目前仅支持 deepseek-v4-flash" }, { status: 400 });

  const response = await fetch(provider.responsesUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1400,
      instructions: `你是一位个人史叙事编辑。请帮用户整理亲身经历。文风与结构：${tone}。必须严格遵守：1. 不编造任何时间、场景、对话、人物、天气、冲突、感官细节或心理活动；2. 只能重排、删减和润色用户已提供的事实；3. 信息不足时保持留白，不为了戏剧性补全故事；4. 使用第一人称中文；5. 必须改善句子结构、分段、重复表达和可读性，除非原文已经很完整，不要原样复制；6. 标题与摘要必须概括真实事件和变化，不能把“我想写一首歌/记录下来”等创作意图误当成核心事件；7. emotions 可以返回多个同时存在的真实情绪，emotion 必须等于 emotions 的第一个主情绪；“转折、低谷、重生”必须放入 lifePhase，不能作为情绪。`,
      input: JSON.stringify({
        title: body.title || "",
        location: body.locationName || "",
        time: body.occurredAt || "",
        people: body.people || "",
        existingSummary: body.summary || "",
        rawExperience: body.detail || "",
        existingPolishedExperience: body.polishedDetail || "",
        existingLessons: body.lessons || "",
        existingTags: body.tags || [],
      }),
      text: {
        format: { type: "json_schema", name: "life_story_refinement", strict: true, schema },
      },
    }),
  });

  const data = await response.json() as OpenAIResponse;
  if (!response.ok) {
    return Response.json({ error: data.error?.message || "AI 暂时无法完善这段经历。" }, { status: response.status });
  }

  const outputText = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  if (!outputText) return Response.json({ error: "AI 没有返回可用内容，请重试。" }, { status: 502 });

  try {
    const refined = JSON.parse(outputText) as { title?: unknown; summary?: unknown; detail?: unknown; lessons?: unknown; emotion?: unknown; emotions?: unknown; lifePhase?: unknown; people?: unknown; tags?: unknown };
    if (typeof refined.title !== "string" || typeof refined.summary !== "string" || typeof refined.detail !== "string" || typeof refined.lessons !== "string" || typeof refined.emotion !== "string" || !Array.isArray(refined.emotions) || !refined.emotions.every(emotion => typeof emotion === "string") || typeof refined.lifePhase !== "string" || !Array.isArray(refined.people) || !refined.people.every(person => typeof person === "string") || !Array.isArray(refined.tags) || !refined.tags.every(tag => typeof tag === "string")) throw new Error("Invalid structured output");
    const selectedEmotions = Array.from(new Set(refined.emotions));
    return Response.json({ refined: { ...refined, emotion: selectedEmotions[0] || refined.emotion, emotions: selectedEmotions }, model, mode: provider.provider, provider: provider.provider });
  } catch {
    return Response.json({ error: "AI 返回的内容格式不完整，请重试。" }, { status: 502 });
  }
}
