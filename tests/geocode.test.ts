// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const request = (query: string) => new Request(`https://atlas.test/api/geocode?${query}`);

it("反查建筑级地址并保留用户选点，相邻场所不会共用城市级缓存", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ display_name: "北京市，测试路，测试建筑", lat: "39.99", lon: "116.99", type: "building" })));
  const { GET } = await import("../app/api/geocode/route");
  const first = await (await GET(request("lat=39.91234&lng=116.42345"))).json();
  expect(first).toMatchObject({ results: [expect.objectContaining({ lat: 39.91234, lng: 116.42345 })] });
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get("zoom")).toBe("18");
  await GET(request("lat=39.91334&lng=116.42345"));
  const cached = await (await GET(request("lat=39.91234&lng=116.42345"))).json();
  expect(cached).toMatchObject({ source: "online", cached: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("较慢的地址响应仍能返回，超时后的城市回退不会永久缓存", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ display_name: "北京，测试街道", type: "road" })), 1500);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
  })));
  const { GET } = await import("../app/api/geocode/route");
  const slow = GET(request("lat=39.91234&lng=116.42345"));
  await vi.advanceTimersByTimeAsync(1500);
  expect(await (await slow).json()).toMatchObject({ source: "online" });
  vi.mocked(fetch).mockImplementation((_url, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
  const pending = GET(request("lat=39.92&lng=116.42"));
  await vi.advanceTimersByTimeAsync(4000);
  expect(await (await pending).json()).toMatchObject({ source: "offline", results: [expect.objectContaining({ name: "中国 · 北京", lat: 39.92, lng: 116.42 })] });
  expect(await (await GET(request("lat=39.92&lng=116.42"))).json()).toMatchObject({ source: "offline", cached: true });
  await vi.advanceTimersByTimeAsync(15_001);
  vi.mocked(fetch).mockResolvedValue(Response.json({ display_name: "北京，测试街道" }));
  expect(await (await GET(request("lat=39.92&lng=116.42"))).json()).toMatchObject({ source: "online" });
});

it("离线仅匹配城市查询，详细店名不会被替换成北京市中心", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  const { GET } = await import("../app/api/geocode/route");
  for (const query of ["北京南门涮肉", "中国北京市测试路88号"]) {
    expect(await (await GET(request(`q=${encodeURIComponent(query)}`))).json()).toEqual({ results: [], source: "offline" });
  }
  const city = await (await GET(request(`q=${encodeURIComponent("北京市")}`))).json();
  expect(city).toMatchObject({ results: [expect.objectContaining({ name: "中国 · 北京", type: "city" })] });
});

it("重复的同时查询只调用一次上游，无效坐标不外发", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ display_name: "测试建筑" })));
  const { GET } = await import("../app/api/geocode/route");
  await Promise.all([GET(request("lat=39.91234&lng=116.42345")), GET(request("lat=39.91234&lng=116.42345"))]);
  for (const query of ["", "lat=&lng=", "lat=91&lng=10", "lat=10&lng=181"]) expect(await (await GET(request(query))).json()).toEqual({ results: [] });
  expect(fetch).toHaveBeenCalledOnce();
});
