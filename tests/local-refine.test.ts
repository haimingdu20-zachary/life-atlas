import { describe, expect, it } from "vitest";
import { localRefine } from "../app/lib/local-refine";

describe("local experience refinement", () => {
  it("在无 API Key 时断句、分段并提取摘要与显式标签", () => {
    const result = localRefine({
      title: "毕业后的一次散步",
      locationName: "中国 · 浙江省 · 杭州市",
      detail: "我刚刚毕业  我沿着湖边走了很久  后来我意识到自己需要重新安排生活节奏",
      tags: [],
      tone: "honest",
    });
    expect(result.detail).toContain("。");
    expect(result.detail).toContain("\n\n");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.lessons).toContain("意识到");
    expect(result.tags).toContain("毕业");
    expect(result.tags).toContain("杭州市");
  });

  it("不凭空生成原文中没有的感悟", () => {
    const result = localRefine({ detail: "我下午去了公园，然后回家。", tags: [] });
    expect(result.lessons).toBe("");
    expect(result.detail).toContain("我下午去了公园");
  });

  it("切换整理模板后必须生成不同的组织结构", () => {
    const input = {
      title: "一次重要的告别",
      locationName: "北京市 · 海淀区",
      occurredAt: "2026-08-30T10:00:00.000Z",
      detail: "我今天和朋友见了最后一面  我们聊了很久  最后我意识到这段经历已经走到了终点",
      tags: [] as string[],
    };
    const honest = localRefine({ ...input, tone: "honest" });
    const diary = localRefine({ ...input, tone: "diary" });
    const literary = localRefine({ ...input, tone: "literary" });
    const growth = localRefine({ ...input, tone: "growth" });
    const storymaster = localRefine({ ...input, tone: "storymaster" });
    const grammar = localRefine({ ...input, tone: "grammar" });
    expect(diary.detail).toContain("2026年8月30日");
    expect(literary.detail.split("\n\n").length).toBeGreaterThan(honest.detail.split("\n\n").length);
    expect(growth.detail).toContain("【事情经过】");
    expect(growth.detail).toContain("【感受与影响】");
    expect(storymaster.detail.split("\n\n")[0]).toContain("最后");
    expect(new Set([honest.detail, diary.detail, literary.detail, growth.detail, storymaster.detail, grammar.detail]).size).toBeGreaterThanOrEqual(5);
  });

  it("叙事润色模板会保持原有顺序，并突出改变事情的时刻", () => {
    const result = localRefine({ detail: "我每天都按同样的路线上下班  我以为生活会一直这样  直到公司通知我项目结束  后来我决定重新选择工作方向", tags: [], tone: "storymaster" });
    expect(result.detail.split("\n\n")[0]).toContain("同样的路线上下班");
    expect(result.detail).toContain("直到公司通知我项目结束");
    expect(result.detail.indexOf("同样的路线上下班")).toBeLessThan(result.detail.indexOf("项目结束"));
    expect(result.detail).toContain("后来，我决定重新选择工作方向");
  });

  it("长篇口述中不会把创作意图误当成标题和摘要", () => {
    const detail = "我是一名刚刚毕业的大学生 由于性压抑以及培训的压力在抖音认识了一个05年比我小三岁的女孩子 因为没钱而下海的 让我体验到了前所未有的感受 也见识到了一些其他的东西 我特别感谢和她的相遇 有些人出场方式就决定了最终的结局 我们的结局已经注定 她马上离开北京去大连了 今天我和她见完了最后一面 我对此特别忧郁 心里感慨万千 我想做一首曲来纪念我这个他乡遇淑人";
    const result = localRefine({ detail, tags: [], tone: "honest" });
    expect(result.title).toBe("与一段相遇告别");
    expect(result.summary).toBe("我与她相遇，也在她离开北京前见完了最后一面。");
    expect(result.summary).not.toContain("做一首曲");
    expect(result.lessons).not.toContain("做一首曲");
    expect(result.detail).toContain("抖音认识");
    expect(result.detail).toContain("离开北京去大连");
    expect(result.emotion).toBe("sadness");
    expect(result.lifePhase).toBe("");
  });

  it("情绪与人生阶段分别识别", () => {
    const result = localRefine({ detail: "那段时间我很迷茫，也经历了人生低谷。后来我慢慢放下，终于感到释然。", tags: [] });
    expect(result.emotion).toBe("confusion");
    expect(result.emotions).toEqual(["confusion", "relief"]);
    expect(result.lifePhase).toBe("low");
  });

  it("只有标题时不会生成一个句号作为摘要", () => {
    const result = localRefine({ title: "只留下标题的记录", detail: "", tags: [] });
    expect(result.summary).toBe("只留下标题的记录");
  });
});
