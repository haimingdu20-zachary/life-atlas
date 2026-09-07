type LocalRefineInput = {
  title?: string;
  locationName?: string;
  occurredAt?: string;
  detail?: string;
  polishedDetail?: string;
  lessons?: string;
  people?: string;
  tags?: string[];
  tone?: "original" | "diary" | "honest" | "literary" | "growth" | "grammar" | "concise" | "storymaster";
};

const cues = ["直到", "后来", "最后", "今天", "当时", "因为", "由于", "但是", "不过", "有些人", "我们的", "她马上", "我特别", "我对此", "我想", "心里", "这让我", "让我", "也让我", "也见识"];
const reflectionWords = ["明白", "意识到", "认识到", "懂得", "感谢", "遗憾", "后悔", "感受到", "感到", "觉得", "领悟", "感慨", "对我的影响", "这让我"];
const eventWords = ["认识", "相遇", "见面", "最后一面", "离开", "告别", "开始", "结束", "毕业", "来到", "去了", "回到", "工作", "旅行", "搬到", "决定", "经历"];
const endingWords = ["最后一面", "离开", "告别", "结束", "终点", "结局"];
const disruptionWords = ["直到", "有一天", "后来", "但是", "却", "突然", "第一次", "最后", "离开", "失去", "发现", "决定", "开始", "结束", "改变"];
const metaIntentPatterns = [/^(?:后来|最后|今天|当时)?我想(?:写|做|创作|记录)/, /想(?:写|做|创作)(?:一首|一篇|一个)/, /(?:用来|以此来|来)纪念/, /准备(?:写|做|创作)/, /打算(?:写|做|创作)/];
const tagWords = ["毕业", "相遇", "离别", "关系", "爱情", "友情", "成长", "工作", "旅行", "家乡", "音乐", "创作", "压力", "抑郁", "告别", "纪念"];

function splitLongSentence(sentence: string) {
  if (sentence.length <= 68) return [sentence];
  let text = sentence;
  for (const cue of cues) text = text.replace(new RegExp(`([^。！？；])(${cue})`, "g"), "$1。$2");
  const parts = text.split("。").map(part => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  const chunks: string[] = [];
  for (let index = 0; index < sentence.length; index += 55) chunks.push(sentence.slice(index, index + 55));
  return chunks;
}

function sentencesFrom(raw: string) {
  const normalized = raw.trim()
    .replace(/\r\n/g, "\n")
    .replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "。")
    .replace(/[ \t]{2,}/g, "。")
    .replace(/\n+/g, "。")
    .replace(/([。，！？；])\1+/g, "$1")
    .replace(/[.]{2,}/g, "。");
  const sentences = normalized.split(/(?<=[。！？；])|[。！？；]+/).map(item => item.replace(/[。！？；]+$/g, "").trim()).filter(Boolean).flatMap(splitLongSentence);
  return sentences.filter((sentence, index) => sentence !== sentences[index - 1]);
}

function punctuate(sentence: string) {
  if (!sentence.trim()) return "";
  return /[。，！？；]$/.test(sentence) ? sentence : `${sentence}。`;
}

function groupParagraphs(sentences: string[], size: number) {
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += size) paragraphs.push(sentences.slice(index, index + size).map(punctuate).join(""));
  return paragraphs.join("\n\n");
}

function isReflection(sentence: string) {
  return !isMetaIntent(sentence) && reflectionWords.some(word => sentence.includes(word));
}

function isMetaIntent(sentence: string) {
  return metaIntentPatterns.some(pattern => pattern.test(sentence.replace(/[，,。；;！？!?\s]/g, "")));
}

function trimTo(text: string, length: number) {
  const normalized = text.replace(/\s+/g, "").replace(/[。！？；]+$/g, "");
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function eventScore(sentence: string, index: number, total: number) {
  if (isMetaIntent(sentence)) return -100;
  let score = eventWords.reduce((sum, word) => sum + (sentence.includes(word) ? 3 : 0), 0);
  score += endingWords.reduce((sum, word) => sum + (sentence.includes(word) ? 2 : 0), 0);
  if (/^(我是一名|我是一个|那种|这种)/.test(sentence)) score -= 5;
  if (/因为|由于/.test(sentence) && !eventWords.some(word => sentence.includes(word))) score -= 2;
  if (sentence.length >= 8 && sentence.length <= 56) score += 2;
  if (index > 0 && index < total - 1) score += 1;
  return score;
}

function bestEventSentence(sentences: string[]) {
  return sentences
    .map((sentence, index) => ({ sentence, score: eventScore(sentence, index, sentences.length), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sentence || "";
}

function relationshipSummary(source: string) {
  const hasRelationship = /女孩|女孩子|她|关系|爱情|相遇|认识/.test(source);
  if (!hasRelationship) return "";
  if (/最后一面/.test(source)) {
    const leavingPlace = source.match(/离开\s*([\u3400-\u9fff]{2,8}?)(?=去|到|前|了|，|。|\s|$)/)?.[1];
    return `我与她相遇，也在她离开${leavingPlace || ""}前见完了最后一面。`;
  }
  if (/告别|结束|结局/.test(source)) return "我记录下这段相遇，也面对了这段关系的结束。";
  return "";
}

function buildSummary(source: string, sentences: string[]) {
  const relationship = relationshipSummary(source);
  if (relationship) return relationship;
  const usable = sentences.filter(sentence => !isMetaIntent(sentence));
  const primary = bestEventSentence(usable) || usable[0] || "";
  const outcome = [...usable].reverse().find(sentence => sentence !== primary && endingWords.some(word => sentence.includes(word)));
  if (primary && outcome) {
    const combined = `${primary}，${outcome.replace(/^(后来|最后|今天|当时)[，,]?/, "")}`;
    if (combined.length <= 60) return punctuate(combined.replace(/[。！？；]+/g, ""));
  }
  return punctuate(trimTo(primary, 60));
}

function buildTitle(source: string, summary: string, sentences: string[]) {
  if (/最后一面/.test(source) && /相遇|认识|女孩|女孩子|她/.test(source)) return "与一段相遇告别";
  if (/毕业/.test(source) && /压力|低谷|抑郁|迷茫/.test(source)) return "毕业后的压力与转折";
  if (/重新开始|重生/.test(source)) return "重新开始的那一天";
  if (/告别|离开|结束/.test(source)) return "一次重要的告别";
  const event = bestEventSentence(sentences.filter(sentence => !isMetaIntent(sentence)));
  const candidate = (event || summary)
    .replace(/^(后来|最后|今天|当时)[，,]?/, "")
    .replace(/^我(?:和|与|在|去|来到|开始)?/, "")
    .replace(/[。！？；]/g, "");
  return trimTo(candidate, 22) || "未命名经历";
}

function buildStoryMasterNarrative(sentences: string[]) {
  if (sentences.length < 3) return groupParagraphs(sentences, 2);
  const pivot = sentences
    .map((sentence, index) => ({ sentence, index, score: disruptionWords.reduce((sum, word) => sum + (sentence.includes(word) ? 2 : 0), 0) + endingWords.reduce((sum, word) => sum + (sentence.includes(word) ? 3 : 0), 0) }))
    .filter(item => !isMetaIntent(item.sentence))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const polish = (sentence: string) => sentence
    .replace(/^我对此/, "对此，我")
    .replace(/^(后来|但是|不过|最后|今天|当时)(?![，,])/, "$1，");
  if (!pivot || pivot.score <= 0) return groupParagraphs(sentences.map(polish), 2);
  const before = sentences.slice(0, pivot.index).map(polish);
  const after = sentences.slice(pivot.index + 1).map(polish);
  const closingIndex = after.findIndex(sentence => isReflection(sentence) || isMetaIntent(sentence));
  const outcome = closingIndex < 0 ? after : after.slice(0, closingIndex);
  const closing = closingIndex < 0 ? [] : after.slice(closingIndex);
  const blocks = [
    before.length ? groupParagraphs(before, 2) : "",
    punctuate(polish(pivot.sentence)),
    outcome.length ? groupParagraphs(outcome, 2) : "",
    closing.length ? groupParagraphs(closing, 2) : "",
  ].filter(Boolean);
  return blocks.join("\n\n");
}

function formatContext(input: LocalRefineInput) {
  const parts: string[] = [];
  if (input.occurredAt) {
    const date = new Date(input.occurredAt);
    if (Number.isFinite(date.getTime())) parts.push(`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`);
  }
  if (input.locationName?.trim()) parts.push(input.locationName.trim());
  return parts.join(" · ");
}

export function localRefine(input: LocalRefineInput) {
  const source = input.detail?.trim() || input.polishedDetail?.trim() || "";
  const sentences = sentencesFrom(source);
  const tone = input.tone || "honest";
  const eventSentences = sentences.filter(sentence => !isReflection(sentence) && !isMetaIntent(sentence));
  const reflectionSentences = sentences.filter(isReflection);
  let detail: string;
  if (tone === "original") {
    detail = sentences.map(punctuate).join("");
  } else if (tone === "grammar") {
    detail = groupParagraphs(sentences, 4);
  } else if (tone === "diary" || tone === "concise") {
    const context = formatContext(input);
    detail = `${context ? `${context}\n\n` : ""}${groupParagraphs(sentences, 3)}`;
  } else if (tone === "literary") {
    detail = sentences.map(sentence => punctuate(sentence)).join("\n\n");
  } else if (tone === "growth") {
    const eventBlock = groupParagraphs(eventSentences.length ? eventSentences : sentences, 2);
    const reflectionBlock = groupParagraphs(reflectionSentences, 1);
    detail = `【事情经过】\n${eventBlock}${reflectionBlock ? `\n\n【感受与影响】\n${reflectionBlock}` : ""}`;
  } else if (tone === "storymaster") {
    detail = buildStoryMasterNarrative(sentences);
  } else {
    detail = groupParagraphs(sentences, 2);
  }
  detail ||= source;

  const summary = buildSummary(source, sentences) || input.title?.trim() || "";
  const lessonSentences = reflectionSentences.slice(-2);
  const lessons = input.lessons?.trim() || lessonSentences.map(punctuate).join("");

  const explicitTags = input.tags || [];
  const locationTags = (input.locationName || "").split(/[·,，]/).map(item => item.trim()).filter(item => item.length >= 2 && item.length <= 8).slice(-2);
  const matchedTags = tagWords.filter(word => source.includes(word) || (input.title || "").includes(word));
  const tags = Array.from(new Set([...explicitTags, ...locationTags, ...matchedTags])).slice(0, 6);

  const people = (input.people || "").split(/[,，、\s]+/).map(item => item.trim()).filter(Boolean).slice(0, 8);
  const detectedEmotions: string[] = [];
  if (/兴奋|激动|期待/.test(source)) detectedEmotions.push("excitement");
  if (/感动|触动|动容/.test(source)) detectedEmotions.push("moved");
  if (/思念|想念|怀念/.test(source)) detectedEmotions.push("longing");
  if (/悲伤|难过|忧郁|伤心|失落|抑郁/.test(source)) detectedEmotions.push("sadness");
  if (/遗憾|后悔/.test(source)) detectedEmotions.push("regret");
  if (/焦虑|紧张|担心|压力/.test(source)) detectedEmotions.push("anxiety");
  if (/愤怒|生气|恼火/.test(source)) detectedEmotions.push("anger");
  if (/孤独|寂寞/.test(source)) detectedEmotions.push("loneliness");
  if (/迷茫|困惑|不知道/.test(source)) detectedEmotions.push("confusion");
  if (/释然|轻松|放下/.test(source)) detectedEmotions.push("relief");
  if (/开心|快乐|幸福/.test(source)) detectedEmotions.push("joy");
  const selectedEmotions = detectedEmotions.length ? Array.from(new Set(detectedEmotions)) : ["calm"];
  const emotion = selectedEmotions[0];
  const lifePhase = /重新开始|重生/.test(source) ? "rebirth" : /低谷/.test(source) ? "low" : /转折|改变|告别/.test(source) ? "turning" : "";
  const title = input.title?.trim() || buildTitle(source, summary, sentences);

  return { title, summary, detail, lessons, emotion, emotions: selectedEmotions, lifePhase, people, tags };
}
