import type { LifeEntry } from "./types";

/** Match the local calendar used by the editor and displayed entry dates. */
export function entryYear(entry: LifeEntry): string {
  const date = new Date(entry.occurredAt);
  return Number.isNaN(date.getTime()) ? "" : String(date.getFullYear());
}

export function filterMemories(entries: LifeEntry[], year: string, search: string): LifeEntry[] {
  const keyword = search.trim().toLocaleLowerCase();
  return entries.filter(entry => (year === "all" || entryYear(entry) === year)
    && (!keyword || [entry.title, entry.locationName, entry.summary, entry.tags.join(" ")]
      .join(" ").toLocaleLowerCase().includes(keyword)));
}

// Keep user-authored Markdown/HTML as text when the journal is previewed.
function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}[\]()#+.!|~-])/g, "\\$1");
}

function oneLine(value: string): string {
  return escapeMarkdown(value.replace(/[\r\n]+/g, " "));
}

function paragraph(value: string): string {
  return value.split(/\r?\n/).map(line => `> ${escapeMarkdown(line)}`).join("\n");
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未知" : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

/** A portable text keepsake, deliberately excluding media links, IDs and credentials. */
export function createTravelJournal(entries: LifeEntry[], year: string, search: string): string {
  const ordered = [...entries].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const parts = [
    `# 人生地图 · ${year === "all" ? "我的旅行手记" : `${oneLine(year)} 年旅行手记`}`,
    `共 ${entries.length} 段经历 · ${new Set(entries.map(entry => entry.locationName)).size} 个地点`,
    ...(search.trim() ? [`筛选关键词：${oneLine(search.trim())}`] : []),
    "按经历发生时间排列，日期使用导出设备的本地时间。仅含文字，不包含照片、音视频或完整数据备份。",
  ];
  for (const entry of ordered) {
    parts.push("---", `## ${oneLine(entry.title)}`, `时间：${dateLabel(entry.occurredAt)}${entry.endedAt ? ` 至 ${dateLabel(entry.endedAt)}` : ""}`,
      `地点：${oneLine(entry.locationName)}`);
    if (entry.people.trim()) parts.push(`同行 / 人物：${oneLine(entry.people)}`);
    if (entry.tags.length) parts.push(`标签：${entry.tags.map(oneLine).join("、")}`);
    if (entry.summary.trim()) parts.push("### 一句话回忆", paragraph(entry.summary));
    const story = entry.detail.trim() || entry.rawDetail?.trim() || "";
    if (story) parts.push("### 这段经历", paragraph(story));
    if (entry.rawDetail?.trim() && entry.rawDetail.trim() !== story) parts.push("### 当时写下的原文", paragraph(entry.rawDetail));
    if (entry.lessons.trim()) parts.push("### 留下的感悟", paragraph(entry.lessons));
  }
  return `${parts.join("\n\n")}\n`;
}
