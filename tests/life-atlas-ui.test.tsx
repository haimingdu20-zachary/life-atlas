// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEntry, LifeGoal, LifeProfile, LifeTrack } from "../app/lib/types";

vi.mock("../app/components/GlobeMap", async () => {
  const React = await import("react");
  function MockGlobeMap({ entries, onMapClick, onZoomChange, onEntrySelect, language, visualMode }: { entries: LifeEntry[]; onMapClick: (value: { lat: number; lng: number }) => void; onZoomChange: (zoom: number) => void; onEntrySelect: (id: string) => void; language: "zh" | "en"; visualMode: "memory" | "real" | "minimal" }) {
    React.useEffect(() => onZoomChange(7), [onZoomChange]);
    return React.createElement("div", { "data-testid": "map-memories", "data-entry-ids": entries.map(item => item.id).join(","), "data-language": language, "data-visual-mode": visualMode },
      React.createElement("button", { "data-testid": "mock-map", onClick: () => onMapClick({ lat: 30.2741, lng: 120.1551 }) }, "点击杭州地图"),
      React.createElement("button", { "data-testid": "mock-entry", onClick: () => onEntrySelect("entry-1") }, "点击已有坐标"),
    );
  }
  return {
    default: MockGlobeMap,
  };
});

import LifeAtlas from "../app/components/LifeAtlas";

const entry: LifeEntry = {
  id: "entry-1", title: "在杭州开始新章节", occurredAt: "2026-08-18T09:30:00.000Z", locationName: "中国 · 杭州市 · 西湖区", latitude: 30.2741, longitude: 120.1551,
  category: "growth", status: "memory", mood: 4, significance: 5, summary: "一段新生活的起点。", detail: "沿着西湖走了很久。", lessons: "节奏比速度更重要。", people: "自己", tags: ["城市漫步"], trackId: "track-1", createdAt: "2026-08-18T09:30:00.000Z",
};
const track: LifeTrack = {
  id: "track-1", title: "建立自己的生活系统", description: "建立可持续的节奏。", why: "为了更自由。", nextStep: "完成周回顾", startDate: "2026-01-01", endDate: "2027-12-31", status: "active", progress: 42, color: "#ff9665", sortOrder: 1, createdAt: "2026-01-01T00:00:00.000Z",
};
const profile: LifeProfile = { id: "self", displayName: "星海旅人", birthDate: "2000-05-12", birthCity: "北京", currentCity: "上海", identity: "创作者", planningAge: 90, values: ["自由", "创造"], avatarSymbol: "辰", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const goal: LifeGoal = { id: "goal-1", title: "完成第一本书", description: "", why: "留下作品", nextStep: "写完第一章", targetDate: "2028-05-12", startDate: "2026-08-31", domain: "creation", timeMode: "point", nodeType: "milestone", status: "active", progress: 20, trackId: "track-1", linkedEntryId: null, locationName: "上海", createdAt: "2026-08-31T00:00:00.000Z" };

let calls: Array<{ url: string; method: string; body?: Record<string, unknown> }>;
let aiConfigured: boolean;
let entryCollection: LifeEntry[];

beforeEach(() => {
  calls = [];
  aiConfigured = true;
  entryCollection = [entry];
  window.localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:memory") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const method = init?.method || "GET";
    const requestProvider = new Headers(init?.headers).get("X-Life-Atlas-Provider");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    const reply = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;
    if (url === "/api/entries" && method === "GET") return reply({ entries: entryCollection });
    if (url === "/api/ai/test" && method === "POST") return reply({ ok: true, model: "gpt-5.4-mini", owner: "openai" });
    if (url.startsWith("/api/media") && method === "GET") return reply({ media: [
      { id: "media-image", entryId: "entry-1", fileName: "west-lake.jpg", contentType: "image/jpeg", size: 1200, stage: "moment", capturedAt: entry.occurredAt, latitude: entry.latitude, longitude: entry.longitude, url: "/api/media?id=media-image", createdAt: entry.createdAt },
      { id: "media-audio", entryId: "entry-1", fileName: "memory.m4a", contentType: "audio/mp4", size: 800, stage: "moment", capturedAt: entry.occurredAt, latitude: null, longitude: null, url: "/api/media?id=media-audio", createdAt: entry.createdAt },
    ] });
    if (url === "/api/media" && method === "POST") return reply({ media: { id: "media-1", entryId: "entry-new", fileName: "memory.txt", contentType: "text/plain", size: 6, stage: "moment", url: "/api/media?id=media-1" } }, 201);
    if (url === "/api/tracks" && method === "GET") return reply({ tracks: [track] });
    if (url === "/api/tracks" && (method === "POST" || method === "PATCH")) return reply({ track: { ...track, ...body, id: body?.id || "track-new" } }, method === "POST" ? 201 : 200);
    if (url === "/api/life-profile" && method === "GET") return reply({ profile });
    if (url === "/api/life-profile" && method === "PUT") return reply({ profile: { ...profile, ...body } });
    if (url === "/api/goals" && method === "GET") return reply({ goals: [goal], edges: [] });
    if (url === "/api/goals" && (method === "POST" || method === "PATCH")) return reply({ goal: { ...goal, ...body, id: body?.id || "goal-new" } }, method === "POST" ? 201 : 200);
    if (url === "/api/domains" && method === "GET") return reply({ domains: [] });
    if (url === "/api/domains" && (method === "POST" || method === "PATCH")) return reply({ domain: { id: body?.id || "custom-learning", label: body?.label, description: body?.description, color: body?.color, sortOrder: 1, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } }, method === "POST" ? 201 : 200);
    if (url.startsWith("/api/geocode?lat=")) return reply({ results: [{ name: "中国 · 浙江省 · 杭州市 · 西湖区", lat: 30.2741, lng: 120.1551 }] });
    if (url.startsWith("/api/geocode?q=")) return reply({ results: [{ name: "中国 · 浙江省 · 杭州市", lat: 30.2741, lng: 120.1551 }] });
    if (url === "/api/ai/refine" && method === "GET") return reply({ configured: requestProvider === "deepseek" || aiConfigured, mode: requestProvider === "deepseek" ? "deepseek" : aiConfigured ? "openai" : "local", model: requestProvider === "deepseek" ? "deepseek-v4-flash" : aiConfigured ? "gpt-5.4-mini" : "local-editor" });
    if (url === "/api/ai/refine" && method === "POST") return reply({ mode: requestProvider === "deepseek" ? "deepseek" : aiConfigured ? "openai" : "local", refined: { title: "西湖边的想法", summary: "在西湖边重新看见生活的节奏。", detail: body?.tone === "growth" ? "【事情经过】\n我沿着西湖走了很久。\n\n【感受与影响】\n我开始重新思考生活节奏。" : "我沿着西湖走了很久，开始重新思考自己的生活节奏。", lessons: "放慢速度，才能听见自己。", emotion: "calm", emotions: ["calm"], lifePhase: "", people: [], tags: ["西湖", "生活节奏"] } });
    if (url === "/api/entries" && (method === "POST" || method === "PATCH")) return reply({ entry: { ...entry, ...body, id: body?.id || "entry-new" } }, method === "POST" ? 201 : 200);
    if (method === "DELETE") return reply({ ok: true });
    return reply({ error: "unexpected" }, 500);
  }));
  vi.stubGlobal("confirm", vi.fn(() => true));
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 31.22, longitude: 121.48, accuracy: 5 } } as GeolocationPosition) } });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderReady() {
  render(<LifeAtlas />);
  await waitFor(() => expect(screen.getByRole("button", { name: /1 段经历/ })).toBeTruthy());
}

describe("globe map experience workflows", () => {
  it("按年份与关键词同步筛选列表和地图，关闭列表后可恢复全部足迹", async () => {
    entryCollection = [entry, { ...entry, id: "entry-2025", title: "成都慢游", locationName: "成都", occurredAt: "2025-08-18T09:30:00Z" }];
    const user = userEvent.setup(); render(<LifeAtlas />);
    await user.click(await screen.findByRole("button", { name: /2 段经历/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "回看年份" }), "2025");
    expect(screen.getByRole("button", { name: /成都慢游/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /在杭州开始新章节/ })).toBeNull();
    expect(screen.getByTestId("map-memories").getAttribute("data-entry-ids")).toBe("entry-2025");
    await user.type(screen.getByPlaceholderText("搜索地点、经历或标签"), "杭州");
    expect(screen.getByText("还没有匹配的经历")).toBeTruthy();
    expect((screen.getByRole("button", { name: "导出旅行手记" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("map-memories").getAttribute("data-entry-ids")).toBe("");
    await user.click(screen.getByRole("button", { name: "关闭经历列表" }));
    expect(screen.getByRole("button", { name: /2025 年 · 关键词筛选/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "清除足迹筛选" }));
    expect(screen.getByTestId("map-memories").getAttribute("data-entry-ids")).toBe("entry-1,entry-2025");
  });

  it("下载的文字手记只包含当前筛选结果", async () => {
    entryCollection = [entry, { ...entry, id: "entry-2025", title: "成都慢游", locationName: "成都", occurredAt: "2025-08-18T09:30:00Z" }];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup(); render(<LifeAtlas />);
    await user.click(await screen.findByRole("button", { name: /2 段经历/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "回看年份" }), "2026");
    await user.click(screen.getByRole("button", { name: "导出旅行手记" }));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const content = await blob.text();
    expect(content).toContain("在杭州开始新章节");
    expect(content).not.toContain("成都慢游");
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("人生地图-2026-旅行手记.md");
    expect(screen.getByText("已导出 1 段文字经历")).toBeTruthy();
  });

  it("可放大到城市区域、点击位置并打开经历编辑器", async () => {
    const user = userEvent.setup(); await renderReady();
    await user.click(screen.getByTestId("mock-map"));
    expect(await screen.findByText(/杭州市 · 西湖区/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /记录这里/ }));
    expect(screen.getByText("把这段人生轻轻放回地图")).toBeTruthy();
  });

  it("可搜索城市并选择为记录位置", async () => {
    const user = userEvent.setup(); await renderReady();
    const search = screen.getByPlaceholderText("搜索城市、街道或地点"); await user.type(search, "杭州"); await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /浙江省 · 杭州市/ }));
    expect(screen.getByRole("button", { name: /记录这里/ })).toBeTruthy();
  });

  it("旧的城市级地点自动显示附近详细地址，编辑确认时沿用地址且不移动选点", async () => {
    entryCollection = [{ ...entry, locationName: "中国 · 北京" }];
    const detailedName = "中国 · 北京市 · 测试区 · 测试路 · 测试建筑附近";
    const defaultFetch = fetch;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => String(input).startsWith("/api/geocode?lat=") ? Promise.resolve(Response.json({ source: "online", provider: "photon", areaName: "中国 · 北京", results: [{ name: detailedName, type: "house", lat: entry.latitude, lng: entry.longitude }] })) : defaultFetch(input, init)));
    const user = userEvent.setup(); await renderReady();
    await user.click(screen.getByTestId("mock-entry"));
    expect(await screen.findByText(detailedName)).toBeTruthy();
    expect(calls.some(call => call.method === "PATCH")).toBe(false);
    await user.click(screen.getByRole("button", { name: "编辑经历" }));
    expect((screen.getByLabelText("具体地点") as HTMLInputElement).value).toBe(detailedName);
    await user.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
    await waitFor(() => expect(calls.find(call => call.url === "/api/entries" && call.method === "PATCH")?.body).toMatchObject({ locationName: detailedName, latitude: entry.latitude, longitude: entry.longitude }));
  });

  it("自动地址不覆盖用户填写的店名", async () => {
    entryCollection = [{ ...entry, locationName: "中国 · 用户确认的分店" }];
    const defaultFetch = fetch;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => String(input).startsWith("/api/geocode?lat=") ? Promise.resolve(Response.json({ source: "online", areaName: "中国 · 北京", results: [{ name: "中国 · 测试路附近", type: "house" }] })) : defaultFetch(input, init)));
    const user = userEvent.setup(); await renderReady();
    await user.click(screen.getByTestId("mock-entry"));
    expect(await screen.findByText("中国 · 用户确认的分店")).toBeTruthy();
    expect(screen.queryByText("中国 · 测试路附近")).toBeNull();
  });

  it("AI 可根据真实片段完善摘要、叙事、感悟和标签，然后保存", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    await screen.findByRole("heading", { name: "OpenAI 帮我整理" });
    await user.selectOptions(screen.getByRole("combobox", { name: "整理风格" }), "literary");
    await user.type(screen.getByPlaceholderText(/经历标题/), "西湖边的想法");
    const rawText = "我沿着西湖走了很久，开始思考生活节奏。";
    await user.type(screen.getByPlaceholderText(/发生了什么/), rawText);
    await user.click(screen.getByRole("button", { name: /帮我整理/ }));
    expect((await screen.findAllByText("在西湖边重新看见生活的节奏。")).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(rawText)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /全部接受/ }));
    await user.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/entries" && call.method === "POST" && call.body?.title === "西湖边的想法")).toBe(true));
    expect(calls.find(call => call.url === "/api/entries" && call.method === "POST")?.body?.detail).not.toBe(rawText);
    expect(calls.find(call => call.url === "/api/ai/refine" && call.method === "POST")?.body?.tone).toBe("literary");
  });

  it("没有 API Key 时自动切换到可用的本地智能整理", async () => {
    aiConfigured = false;
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    expect(await screen.findByRole("heading", { name: "本地智能整理" })).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/经历标题/), "本地整理测试");
    await user.type(screen.getByPlaceholderText(/发生了什么/), "我在这里走了很久，后来开始思考自己的生活节奏。");
    await user.click(screen.getByRole("button", { name: /帮我整理/ }));
    expect(await screen.findByText(/7 项建议/)).toBeTruthy();
  });

  it("AI 生成后的文字、人物和标签可以编辑再接受", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    await user.type(screen.getByPlaceholderText(/发生了什么/), "我今天在西湖边认真思考了下一份工作的方向。希望先行动，再等待结果。");
    await user.click(screen.getByRole("button", { name: /帮我整理/ }));
    const summaryEditor = await screen.findByRole("textbox", { name: "编辑 AI 建议：一句话概括" });
    await user.clear(summaryEditor); await user.type(summaryEditor, "我在西湖边重新确认了求职方向。");
    await user.click(within(summaryEditor.closest("article")!).getByRole("button", { name: "接受" }));
    const peopleEditor = screen.getByRole("textbox", { name: "编辑 AI 建议的人物" }); await user.type(peopleEditor, "自己");
    await user.click(within(peopleEditor.closest("label")!).getByRole("button", { name: "接受人物建议" }));
    await user.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/entries" && call.method === "POST" && call.body?.summary === "我在西湖边重新确认了求职方向。" && call.body?.people === "自己")).toBe(true));
  });

  it("逐项接受建议后仍可恢复生成前的原文", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    const titleInput = screen.getByPlaceholderText(/经历标题/);
    await user.type(titleInput, "我原来的标题");
    await user.type(screen.getByPlaceholderText(/发生了什么/), "我沿着西湖走了很久，后来开始思考自己的生活节奏。");
    await user.click(screen.getByRole("button", { name: /帮我整理/ }));
    await screen.findByText(/7 项建议/);
    await user.click(screen.getAllByRole("button", { name: "接受" })[0]);
    expect((titleInput as HTMLInputElement).value).toBe("西湖边的想法");
    await user.click(screen.getAllByRole("button", { name: "保留原文" })[0]);
    expect((titleInput as HTMLInputElement).value).toBe("我原来的标题");
  });

  it("切换整理模板并重新生成时会替换下方的整理结果", async () => {
    aiConfigured = false;
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    await user.type(screen.getByPlaceholderText(/发生了什么/), "我沿着西湖走了很久，最后开始思考自己的生活节奏。");
    await user.click(screen.getByRole("button", { name: /帮我整理/ }));
    expect((await screen.findAllByText(/我沿着西湖走了很久/)).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByRole("combobox", { name: "整理风格" }), "growth");
    await user.click(screen.getByRole("button", { name: /重新生成/ }));
    expect(await screen.findByText(/【事情经过】/)).toBeTruthy();
    expect(screen.getByText(/【感受与影响】/)).toBeTruthy();
    const refineCalls = calls.filter(call => call.url === "/api/ai/refine" && call.method === "POST");
    expect(refineCalls.at(-1)?.body?.tone).toBe("growth");
    await user.selectOptions(screen.getByRole("combobox", { name: "整理风格" }), "storymaster");
    expect(screen.getByText("Storytelling Mastery")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /重新生成/ }));
    expect(calls.filter(call => call.url === "/api/ai/refine" && call.method === "POST").at(-1)?.body?.tone).toBe("storymaster");
  });

  it("可从经历库查看、编辑和删除已有记录", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: /1 段经历/ }));
    await user.click(screen.getByText("在杭州开始新章节")); expect(screen.getByText("一段新生活的起点。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "编辑经历" })); expect(screen.getByDisplayValue("在杭州开始新章节")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭记录器" })); await user.click(screen.getByRole("button", { name: /删除/ }));
    await waitFor(() => expect(calls.some(call => call.method === "DELETE" && call.url.includes("entry-1"))).toBe(true));
  });

  it("可使用当前定位选择记录城市", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "定位到我的城市" }));
    await waitFor(() => expect(calls.some(call => call.url.includes("lat=31.22") && call.url.includes("lng=121.48"))).toBe(true));
  });

  it("移动端可从底部主导航快速记录当前位置", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "快速记录" }));
    expect(await screen.findByText("把这段人生轻轻放回地图")).toBeTruthy();
    await waitFor(() => expect(calls.some(call => call.url.includes("lat=31.22") && call.url.includes("lng=121.48"))).toBe(true));
  });

  it("可在单向人生时间线上筛选并维护个人档案、目标和人生主线", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "人生时间轴" }));
    expect(await screen.findByRole("heading", { name: "人生时间线" })).toBeTruthy(); expect(screen.getByRole("button", { name: "未来 3 年" }).className).toContain("active"); expect(screen.getByRole("button", { name: "事业" })).toBeTruthy(); expect(screen.getByRole("button", { name: `编辑目标 ${goal.title}` })).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "添加这一阶段的目标" })[0]);
    expect(screen.getByRole("heading", { name: "创建一个新目标" })).toBeTruthy(); expect(screen.getByLabelText("计划完成时间")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭目标编辑器" }));
    await user.click(screen.getByRole("button", { name: "个人档案" }));
    const identity = screen.getByDisplayValue("创作者"); await user.clear(identity); await user.type(identity, "独立创作者"); await user.click(screen.getByRole("button", { name: "保存档案" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/life-profile" && call.method === "PUT" && call.body?.identity === "独立创作者")).toBe(true));
    await user.click(screen.getByText(track.title));
    const progress = screen.getByDisplayValue("42"); await user.clear(progress); await user.type(progress, "68"); await user.click(screen.getByRole("button", { name: "保存主线" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/tracks" && call.method === "PATCH" && call.body?.progress === 68)).toBe(true));
    await user.click(screen.getAllByRole("button", { name: /新建主线/ })[0]); await user.type(screen.getByPlaceholderText("例：带着作品去看世界"), "写完第一本书"); await user.click(screen.getByRole("button", { name: "创建主线" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/tracks" && call.method === "POST" && call.body?.title === "写完第一本书")).toBe(true));
    await user.click(screen.getByRole("button", { name: "新建目标" })); await user.type(screen.getByPlaceholderText(/完成并发布第一款/), "建立长期写作系统");
    fireEvent.change(screen.getByLabelText("计划完成时间"), { target: { value: "2030-05-12" } });
    await user.click(screen.getByText("更多设置")); await user.click(screen.getByRole("button", { name: /持续一段时间/ }));
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2027-05-12" } });
    await user.click(screen.getByRole("button", { name: "创建目标" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/goals" && call.method === "POST" && call.body?.title === "建立长期写作系统" && call.body?.timeMode === "range" && call.body?.startDate === "2027-05-12" && call.body?.targetDate === "2030-05-12")).toBe(true));
  });

  it("可用记忆明信片和沉浸回放重新进入过往经历", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "人生时间轴" }));
    await user.click(await screen.findByRole("button", { name: /重新进入这段记忆/ }));
    expect(screen.getByLabelText(`记忆回放：${entry.title}`)).toBeTruthy();
    expect(screen.getByText("当时发生了什么")).toBeTruthy(); expect(screen.getByText("听见当时的声音")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭记忆回放" }));
    expect(screen.queryByLabelText(`记忆回放：${entry.title}`)).toBeNull();
  });

  it("可添加自定义领域并同步到筛选和目标表单", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "人生时间轴" }));
    await user.click(screen.getByRole("button", { name: /自定义/ }));
    await user.type(screen.getByPlaceholderText(/学习、家庭/), "学习"); await user.type(screen.getByPlaceholderText(/领域对你意味着什么/), "持续输入与成长");
    await user.click(screen.getByRole("button", { name: "添加领域" }));
    expect(await screen.findByRole("button", { name: "学习" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "新建目标" }));
    expect(screen.getByRole("option", { name: "学习" })).toBeTruthy();
    expect(calls.some(call => call.url === "/api/domains" && call.method === "POST" && call.body?.label === "学习")).toBe(true);
  });

  it("可在中文和英文地图标签之间切换", async () => {
    const user = userEvent.setup(); await renderReady();
    expect(screen.getByTestId("mock-map").parentElement?.dataset.language).toBe("zh");
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("mock-map").parentElement?.dataset.language).toBe("en");
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByTestId("mock-map").parentElement?.dataset.language).toBe("zh");
  });

  it("可在记忆星球、真实地球和清晰地图之间切换", async () => {
    const user = userEvent.setup(); await renderReady();
    expect(screen.getByTestId("mock-map").parentElement?.dataset.visualMode).toBe("memory");
    await user.click(screen.getByRole("button", { name: "真实地球" }));
    expect(screen.getByTestId("mock-map").parentElement?.dataset.visualMode).toBe("real");
    await user.click(screen.getByRole("button", { name: "清晰地图" }));
    expect(screen.getByTestId("mock-map").parentElement?.dataset.visualMode).toBe("minimal");
    await user.click(screen.getByRole("button", { name: "记忆星球" }));
    expect(screen.getByTestId("mock-map").parentElement?.dataset.visualMode).toBe("memory");
  });

  it("支持快速/完整模式、现场文件、私密默认和草稿保护", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    expect(screen.getByRole("button", { name: "30 秒记录" })).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/发生了什么/), "今天在这里留下了一段值得保存的记忆。");
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["现场记录"], "memory.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("memory.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "完整经历" }));
    expect((screen.getByRole("combobox", { name: "私密等级" }) as unknown as HTMLSelectElement).value).toBe("private");
    await user.click(screen.getByRole("button", { name: "思念" })); await user.click(screen.getByRole("button", { name: "遗憾" })); await user.click(screen.getByRole("button", { name: "转折" }));
    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/media" && call.method === "POST")).toBe(true));
    const savedEntry = calls.find(call => call.url === "/api/entries" && call.method === "POST"); expect(savedEntry?.body?.emotion).toBe("longing"); expect(savedEntry?.body?.emotions).toEqual(["longing", "regret"]); expect(savedEntry?.body?.lifePhase).toBe("turning");
  });

  it("可在记录经历时新建并编辑自定义人生章节", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    await user.click(screen.getByRole("button", { name: "完整经历" }));
    await user.click(screen.getByRole("button", { name: "新建章节" }));
    await user.type(screen.getByRole("textbox", { name: "章节名称" }), "第一次独立生活");
    await user.click(screen.getByRole("button", { name: "保存章节" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/tracks" && call.method === "POST" && call.body?.title === "第一次独立生活")).toBe(true));
    expect((screen.getByRole("combobox", { name: "人生章节" }) as unknown as HTMLSelectElement).value).toBe("track-new");
    await user.click(screen.getByRole("button", { name: "编辑章节" }));
    const chapterInput = screen.getByRole("textbox", { name: "章节名称" }); await user.clear(chapterInput); await user.type(chapterInput, "在北京独立生活");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/tracks" && call.method === "PATCH" && call.body?.title === "在北京独立生活")).toBe(true));
  });

  it("可在界面内输入 API Key、选择模型、测试并记住连接", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "AI API 设置" }));
    const keyInput = screen.getByPlaceholderText("sk-proj-..."); await user.type(keyInput, "sk-proj-test-key");
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText(/连接成功/)).toBeTruthy();
    await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "保存并启用" }));
    expect(window.localStorage.getItem("life-atlas-ai-persistent")).toContain("gpt-5.4-mini");
    expect(calls.some(call => call.url === "/api/ai/test" && call.method === "POST")).toBe(true);
  });

  it("可独立配置 DeepSeek Key 并在记忆整理中立即切换提供商", async () => {
    const user = userEvent.setup(); await renderReady(); await user.click(screen.getByRole("button", { name: "AI API 设置" }));
    await user.click(screen.getByRole("button", { name: "DeepSeek" }));
    const keyInput = screen.getByPlaceholderText("sk-..."); await user.type(keyInput, "sk-deepseek-test-key");
    expect((screen.getByPlaceholderText("deepseek-v4-flash") as HTMLInputElement).value).toBe("deepseek-v4-flash");
    await user.click(screen.getByRole("button", { name: "测试连接" })); expect(await screen.findByText(/DeepSeek 连接成功/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "保存并启用" })); await user.click(screen.getByRole("button", { name: "关闭 API 设置" }));
    await user.click(screen.getByTestId("mock-map")); await screen.findByText(/西湖区/); await user.click(screen.getByRole("button", { name: /记录这里/ }));
    expect(await screen.findByRole("heading", { name: "DeepSeek 帮我整理" })).toBeTruthy();
    const stored = window.sessionStorage.getItem("life-atlas-ai-session") || "";
    expect(stored).toContain("deepseek-v4-flash"); expect(stored).toContain("sk-deepseek-test-key");
  });
});
