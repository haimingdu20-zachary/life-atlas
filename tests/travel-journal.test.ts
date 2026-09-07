import { describe, expect, it } from "vitest";
import { createTravelJournal, entryYear, filterMemories } from "../app/lib/travel-journal";
import type { LifeEntry } from "../app/lib/types";

const memory: LifeEntry = {
  id: "private-id", title: "西湖散步", occurredAt: new Date(2026, 7, 18, 9, 30).toISOString(),
  locationName: "杭州", latitude: 30.27, longitude: 120.15, category: "adventure", status: "memory",
  mood: 4, significance: 3, summary: "一段轻松的旅途", detail: "沿湖走走。\n停下来喝茶。", rawDetail: "走走，喝茶。",
  lessons: "放慢一点。", people: "朋友", tags: ["散步"], trackId: null, createdAt: "2026-08-18T01:30:00Z",
};
const older = { ...memory, id: "older", title: "成都漫游", locationName: "成都", occurredAt: new Date(2025, 0, 1, 0, 15).toISOString() };

describe("travel journal", () => {
  it("combines local-calendar years and case-insensitive search, with reset and empty results", () => {
    expect(entryYear(older)).toBe("2025");
    expect(filterMemories([memory, older], "2026", " 散步 ")).toEqual([memory]);
    expect(filterMemories([memory, older], "2025", "西湖")).toEqual([]);
    expect(filterMemories([{ ...memory, tags: ["Hiking"] }], "all", "hIKING")).toHaveLength(1);
    expect(filterMemories([memory, older], "all", " ")).toHaveLength(2);
    expect(filterMemories([], "2026", "")).toEqual([]);
  });

  it("exports in chronological order with original text and no IDs, leaving input order intact", () => {
    const entries = [memory, older];
    const journal = createTravelJournal(entries, "all", "");
    expect(journal.indexOf("## 成都漫游")).toBeLessThan(journal.indexOf("## 西湖散步"));
    expect(journal).toContain("共 2 段经历 · 2 个地点");
    expect(journal).toContain("> 沿湖走走。\n> 停下来喝茶。");
    expect(journal).toContain("### 当时写下的原文\n\n> 走走，喝茶。");
    expect(journal).toContain("### 留下的感悟\n\n> 放慢一点。");
    expect(journal).not.toContain("private-id");
    expect(entries[0]).toBe(memory);
    const filtered = createTravelJournal(filterMemories(entries, "2026", "西湖"), "2026", "西湖");
    expect(filtered).toContain("2026 年旅行手记");
    expect(filtered).not.toContain("成都");
  });

  it("exports raw text as a fallback and escapes embedded HTML and Markdown", () => {
    const journal = createTravelJournal([{ ...memory, title: "标题\n# 意外标题", detail: "", rawDetail: '<script>alert(1)</script>\n![x](https://example.com/track)', endedAt: memory.occurredAt }], "2026", "<b>文字</b>");
    expect(journal).toContain("## 标题 \\# 意外标题");
    expect(journal).toContain("&lt;script&gt;");
    expect(journal).not.toContain("<script>");
    expect(journal).toContain("\\!\\[x\\]\\(https://example\\.com/track\\)");
    expect(journal).toContain(" 至 ");
  });
});
