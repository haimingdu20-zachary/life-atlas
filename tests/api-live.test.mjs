import assert from "node:assert/strict";
import test, { after } from "node:test";

const baseUrl = process.env.LIFE_ATLAS_URL || "http://localhost:3000";
const jsonHeaders = { "Content-Type": "application/json" };
let trackId;
let mediaId;
let customDomainId;
const goalIds = [];
const entryId = "qa-api-live-entry";

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

after(async () => {
  for (const id of goalIds) await fetch(`${baseUrl}/api/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  await fetch(`${baseUrl}/api/entries?id=${entryId}`, { method: "DELETE" }).catch(() => {});
  if (trackId) await fetch(`${baseUrl}/api/tracks?id=${encodeURIComponent(trackId)}`, { method: "DELETE" }).catch(() => {});
  if (customDomainId) await fetch(`${baseUrl}/api/domains?id=${encodeURIComponent(customDomainId)}`, { method: "DELETE" }).catch(() => {});
});

test("home and collection APIs respond", async () => {
  const home = await fetch(baseUrl);
  assert.equal(home.status, 200);
  const entries = await request("/api/entries");
  const tracks = await request("/api/tracks");
  const goals = await request("/api/goals");
  const profile = await request("/api/life-profile");
  assert.equal(entries.response.status, 200);
  assert.equal(tracks.response.status, 200);
  assert.equal(goals.response.status, 200);
  assert.equal(profile.response.status, 200);
  assert.ok(Array.isArray(entries.body.entries));
  assert.ok(Array.isArray(tracks.body.tracks));
  assert.ok(Array.isArray(goals.body.goals));
  assert.ok(Array.isArray(goals.body.edges));
});

test("anonymous visitor session is available without a test code", async () => {
  const session = await request("/api/session");
  assert.equal(session.response.status, 200);
  assert.equal(session.body.ready, true);
});

test("administrator console and overview API respond locally", async () => {
  const page = await fetch(`${baseUrl}/admin`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /管理后台/);
  const overview = await request("/api/admin/overview");
  assert.equal(overview.response.status, 200);
  assert.equal(typeof overview.body.stats.entries, "number");
  assert.ok(Array.isArray(overview.body.entries));
  assert.ok(Array.isArray(overview.body.goals));
  assert.ok(Array.isArray(overview.body.mediaTypes));
});

test("entry and track validation rejects invalid input", async () => {
  const badEntry = await request("/api/entries", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "invalid", occurredAt: new Date().toISOString(), locationName: "invalid", latitude: 999, longitude: 0 }) });
  const badTrack = await request("/api/tracks", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "invalid", startDate: "2027-01-01", endDate: "2026-01-01", progress: 0 }) });
  const badGoal = await request("/api/goals", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "invalid", startDate: "2027-01-01", targetDate: "2026-01-01", domain: "unknown", nodeType: "goal", status: "planned" }) });
  const badProfile = await request("/api/life-profile", { method: "PUT", headers: jsonHeaders, body: JSON.stringify({ displayName: "QA", birthDate: "invalid", planningAge: 200 }) });
  assert.equal(badEntry.response.status, 400);
  assert.equal(badTrack.response.status, 400);
  assert.equal(badGoal.response.status, 400);
  assert.equal(badProfile.response.status, 400);
});

test("custom life domains can be created, edited and listed", async () => {
  const created = await request("/api/domains", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ label: "QA 学习", description: "测试自定义领域", color: "#52b9c2" }) });
  assert.equal(created.response.status, 201); customDomainId = created.body.domain.id;
  const updated = await request("/api/domains", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id: customDomainId, label: "QA 学习成长", description: "已更新", color: "#ef8d5b" }) });
  assert.equal(updated.response.status, 200);
  const collection = await request("/api/domains");
  assert.equal(collection.body.domains.some(item => item.id === customDomainId && item.label === "QA 学习成长"), true);
  const removed = await request(`/api/domains?id=${encodeURIComponent(customDomainId)}`, { method: "DELETE" });
  assert.equal(removed.response.status, 200); customDomainId = null;
});

test("track create and update persists", async () => {
  const created = await request("/api/tracks", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "QA 人生主线", description: "临时自动测试", why: "验证持久化", nextStep: "完成回归", startDate: "2026-01-01", endDate: "2026-12-31", status: "active", progress: 10, color: "#ff9c69" }) });
  assert.equal(created.response.status, 201);
  trackId = created.body.track.id;
  const updated = await request("/api/tracks", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ...created.body.track, progress: 67, nextStep: "删除测试数据" }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.track.progress, 67);
});

test("goal nodes and dependency edges persist", async () => {
  const base = { description: "临时自动测试", why: "验证星轨", nextStep: "继续回归", startDate: "2026-09-01", targetDate: "2027-09-01", domain: "creation", timeMode: "range", nodeType: "goal", status: "active", progress: 10, trackId };
  const first = await request("/api/goals", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...base, title: "QA 前置命星" }) });
  assert.equal(first.response.status, 201); goalIds.push(first.body.goal.id);
  const second = await request("/api/goals", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...base, title: "QA 未来命星", targetDate: "2028-09-01", prerequisiteId: first.body.goal.id }) });
  assert.equal(second.response.status, 201); goalIds.push(second.body.goal.id);
  const collection = await request("/api/goals");
  assert.equal(collection.body.goals.some(item => item.id === second.body.goal.id), true);
  assert.equal(collection.body.goals.find(item => item.id === second.body.goal.id).timeMode, "range");
  assert.equal(collection.body.edges.some(edge => edge.fromGoalId === first.body.goal.id && edge.toGoalId === second.body.goal.id), true);
  const updated = await request("/api/goals", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ...second.body.goal, progress: 72, prerequisiteId: null }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.goal.progress, 72);
});

test("entry create, update and track relation persists", async () => {
  const payload = { id: entryId, title: "QA 地点经历", occurredAt: "2026-08-28T10:00:00.000Z", locationName: "中国 · 上海 · QA", latitude: 31.2304, longitude: 121.4737, category: "growth", status: "memory", mood: 4, significance: 2, summary: "临时测试", detail: "测试详情", lessons: "回归后删除", people: "QA", emotion: "longing", emotions: ["longing", "regret"], lifePhase: "turning", tags: ["测试"], trackId };
  const created = await request("/api/entries", { method: "POST", headers: jsonHeaders, body: JSON.stringify(payload) });
  assert.equal(created.response.status, 201);
  const updated = await request("/api/entries", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ...payload, title: "QA 已更新经历", mood: 5 }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.entry.mood, 5);
  const collection = await request("/api/entries");
  const saved = collection.body.entries.find(item => item.id === entryId);
  assert.equal(saved.title, "QA 已更新经历");
  assert.equal(saved.trackId, trackId);
  assert.equal(saved.emotion, "longing");
  assert.deepEqual(saved.emotions, ["longing", "regret"]);
  assert.equal(saved.lifePhase, "turning");
  assert.deepEqual(saved.tags, ["测试"]);
});

test("media upload, timeline metadata and private retrieval persist", async () => {
  const form = new FormData();
  form.set("entryId", entryId);
  form.set("stage", "moment");
  form.set("file", new File(["人生地图媒体测试"], "memory-note.txt", { type: "text/plain" }));
  const upload = await fetch(`${baseUrl}/api/media`, { method: "POST", body: form });
  assert.equal(upload.status, 201);
  const uploaded = await upload.json();
  mediaId = uploaded.media.id;
  const list = await request(`/api/media?entryId=${entryId}`);
  assert.equal(list.body.media.some(item => item.id === mediaId && item.stage === "moment"), true);
  const content = await fetch(`${baseUrl}/api/media?id=${mediaId}`);
  assert.equal(content.status, 200);
  assert.equal(await content.text(), "人生地图媒体测试");
  const directDelete = await request(`/api/media?id=${mediaId}`, { method: "DELETE" });
  assert.equal(directDelete.response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/media?id=${mediaId}`)).status, 404);
  const replacement = new FormData();
  replacement.set("entryId", entryId); replacement.set("stage", "end"); replacement.set("file", new File(["结束节点"], "ending.txt", { type: "text/plain" }));
  const replacementResponse = await fetch(`${baseUrl}/api/media`, { method: "POST", body: replacement });
  mediaId = (await replacementResponse.json()).media.id;
});

test("deleting a track preserves linked entries, then cleanup removes test entry", async () => {
  const deletedTrack = await request(`/api/tracks?id=${encodeURIComponent(trackId)}`, { method: "DELETE" });
  assert.equal(deletedTrack.response.status, 200);
  const collection = await request("/api/entries");
  const saved = collection.body.entries.find(item => item.id === entryId);
  assert.equal(saved.trackId, null);
  const deletedEntry = await request(`/api/entries?id=${entryId}`, { method: "DELETE" });
  assert.equal(deletedEntry.response.status, 200);
  const after = await request("/api/entries");
  assert.equal(after.body.entries.some(item => item.id === entryId), false);
  if (mediaId) assert.equal((await fetch(`${baseUrl}/api/media?id=${mediaId}`)).status, 404);
});

test("geocoder handles empty and real queries", async () => {
  const empty = await request("/api/geocode");
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.results, []);
  const real = await request(`/api/geocode?q=${encodeURIComponent("上海外滩")}`);
  assert.equal(real.response.status, 200);
  assert.ok(real.body.results.length > 0);
  assert.ok(Number.isFinite(real.body.results[0].lat));
  assert.ok(Number.isFinite(real.body.results[0].lng));
  const reverse = await request("/api/geocode?lat=31.2304&lng=121.4737");
  assert.equal(reverse.response.status, 200);
  assert.ok(reverse.body.results[0].name);
});

test("AI refinement rejects empty drafts locally", async () => {
  const status = await request("/api/ai/refine");
  assert.equal(status.response.status, 200);
  assert.equal(typeof status.body.configured, "boolean");
  const result = await request("/api/ai/refine", { method: "POST", headers: jsonHeaders, body: "{}" });
  assert.equal(result.response.status, 400);
  assert.match(result.body.error, /先写下/);
  const missingKey = await request("/api/ai/test", { method: "POST" });
  assert.equal(missingKey.response.status, 400);
  assert.match(missingKey.body.error, /API Key/);
  const deepSeekStatus = await fetch(`${baseUrl}/api/ai/refine`, { headers: { "X-Life-Atlas-Provider": "deepseek" } });
  const deepSeekStatusBody = await deepSeekStatus.json();
  assert.equal(deepSeekStatusBody.mode, "local");
  assert.equal(deepSeekStatusBody.provider, "deepseek");
  const unsupportedDeepSeekModel = await request("/api/ai/test", { method: "POST", headers: { "X-Life-Atlas-Provider": "deepseek", "X-Life-Atlas-API-Key": "sk-test-not-sent", "X-Life-Atlas-Model": "deepseek-v4-pro" } });
  assert.equal(unsupportedDeepSeekModel.response.status, 400);
  assert.match(unsupportedDeepSeekModel.body.error, /deepseek-v4-flash/);
});
