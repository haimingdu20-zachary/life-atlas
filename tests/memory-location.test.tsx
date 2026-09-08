import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MemoryEditor, { type MemoryEditorProps } from "../app/components/MemoryEditor";

const props: MemoryEditorProps = { initial: null, coordinates: { lat: 39.91234, lng: 116.42345 }, placeName: "中国 · 北京", onClose: vi.fn(), onSave: vi.fn(async () => {}) };
const response = (data: unknown) => Response.json(data);
const venue = { name: "北京 · 测试街道 · 测试地点", lat: 39.93456, lng: 116.43456, type: "restaurant" };

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?q=")) return response({ results: [venue], source: "online" });
    if (url === "/api/ai/refine") return response({ mode: "local" });
    return response({ tracks: [], media: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function writeStory() { fireEvent.change(screen.getByPlaceholderText(/发生了什么/), { target: { value: "上课后和新朋友在附近吃饭，聊了很久。" } }); }

it("手动补充店名用于保存及 AI 整理，保留所选坐标", async () => {
  render(<MemoryEditor {...props} />);
  const name = "北京 · 南门涮肉（用户填写的分店）";
  fireEvent.change(screen.getByLabelText("具体地点"), { target: { value: name } });
  writeStory();
  fireEvent.click(screen.getByRole("button", { name: /帮我整理/ }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => url === "/api/ai/refine" && init?.method === "POST" && JSON.parse(String(init.body)).locationName === name)).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ locationName: name, latitude: props.coordinates.lat, longitude: props.coordinates.lng }), []));
});

it("选择搜索结果后地点和坐标一起进入草稿，重开后可保存", async () => {
  const view = render(<MemoryEditor {...props} />);
  fireEvent.change(screen.getByLabelText("具体地点"), { target: { value: "北京测试地点" } });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("geocode"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "查找位置" }));
  fireEvent.click(await screen.findByRole("button", { name: venue.name }));
  writeStory();
  const draftKey = "life-atlas-draft-39.912-116.423";
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftKey) || "{}")).toMatchObject({ locationName: venue.name, latitude: venue.lat, longitude: venue.lng }));
  view.unmount();
  render(<MemoryEditor {...props} />);
  expect((screen.getByLabelText("具体地点") as HTMLInputElement).value).toBe(venue.name);
  fireEvent.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ locationName: venue.name, latitude: venue.lat, longitude: venue.lng }), []));
  await waitFor(() => expect(window.localStorage.getItem(draftKey)).toBeNull());
});

it("较晚返回的自动识别可以补齐地址，但不会覆盖手动输入", async () => {
  const view = render(<MemoryEditor {...props} placeName="正在识别具体地址…" />);
  expect((screen.getByLabelText("具体地点") as HTMLInputElement).value).toBe("");
  view.rerender(<MemoryEditor {...props} placeName="北京 · 测试街道" />);
  expect((screen.getByLabelText("具体地点") as HTMLInputElement).value).toBe("北京 · 测试街道");
  fireEvent.change(screen.getByLabelText("具体地点"), { target: { value: "自己确认的分店" } });
  view.rerender(<MemoryEditor {...props} placeName="北京 · 其他地址" />);
  expect((screen.getByLabelText("具体地点") as HTMLInputElement).value).toBe("自己确认的分店");
});

it("详细搜索不可用时保留手填地址和选点，不把城市中心当成店址", async () => {
  const auxiliaryFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => String(input).includes("geocode") ? Promise.resolve(response({ results: [], source: "offline" })) : auxiliaryFetch(input, init)));
  render(<MemoryEditor {...props} />);
  fireEvent.change(screen.getByLabelText("具体地点"), { target: { value: "北京南门涮肉用户确认的分店" } });
  fireEvent.click(screen.getByRole("button", { name: "查找位置" }));
  expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("详细地图服务暂不可用"));
  writeStory();
  fireEvent.click(screen.getByRole("button", { name: /保存为私人记忆/ }));
  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ locationName: "北京南门涮肉用户确认的分店", latitude: props.coordinates.lat, longitude: props.coordinates.lng }), []));
});

it("搜索期间修改地点会丢弃旧结果，回车只搜索而不提交经历", async () => {
  let resolveLookup!: (value: Response) => void;
  const auxiliaryFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => String(input).includes("geocode") ? new Promise<Response>(resolve => { resolveLookup = resolve; }) : auxiliaryFetch(input, init)));
  render(<MemoryEditor {...props} />);
  const input = screen.getByLabelText("具体地点");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "新的地点" } });
  await act(async () => resolveLookup(response({ results: [venue], source: "online" })));
  expect(screen.queryByRole("button", { name: venue.name })).toBeNull();
  expect(input).toHaveProperty("value", "新的地点");
});
