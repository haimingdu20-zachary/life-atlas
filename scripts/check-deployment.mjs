// Explicit live acceptance check; creates and then removes its own test record.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const origin = process.env.LIFE_ATLAS_PUBLIC_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "A verified HTTPS deployment origin is required");
const password = readFileSync("private-deploy/人生地图登录信息.txt", "utf8").split("\n")[2];
const login = await fetch(`${origin}/api/login`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
});
assert.equal(login.status, 200, "Private login must work");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Login must return a session cookie");
const headers = { Cookie: cookie, Origin: origin };
const testId = `deployment-check-${randomUUID()}`;
let entryId;
try {
  assert.equal((await fetch(`${origin}/api/entries`)).status, 401, "Anonymous diaries must stay private");
  const initial = await fetch(`${origin}/api/entries`, { headers });
  assert.equal(initial.status, 200, "Cloud database must load");
  const input = { id: testId, title: "部署验证临时记录", occurredAt: new Date().toISOString(), locationName: "部署验证地点", latitude: 0, longitude: 0, category: "reflection", status: "memory", detail: "自动验收结束后移除", tags: ["deployment-check"] };
  const created = await fetch(`${origin}/api/entries`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  assert.equal(created.status, 201, "Travel record must save");
  entryId = (await created.json()).entry?.id;
  assert.ok(entryId?.endsWith(testId), "Only the disposable test record may be used");
  const updated = await fetch(`${origin}/api/entries`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ...input, id: entryId, title: "部署验证临时记录（已编辑）" }) });
  assert.equal(updated.status, 200);
  const form = new FormData();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9e8AAAAASUVORK5CYII=", "base64");
  form.set("entryId", entryId);
  form.set("stage", "moment");
  form.set("file", new Blob([png], { type: "image/png" }), "deployment-check.png");
  const upload = await fetch(`${origin}/api/media`, { method: "POST", headers, body: form });
  assert.equal(upload.status, 201, "Photo must persist in the private bucket");
  const media = (await upload.json()).media;
  const image = await fetch(`${origin}${media.url}`, { headers });
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await fetch(`${origin}${media.url}`)).status, 401, "Photos require private login");
  const reloaded = await fetch(`${origin}/api/entries`, { headers });
  assert.ok((await reloaded.json()).entries.some(entry => entry.id === entryId && entry.title.endsWith("（已编辑）")), "Saved edits must survive a new request");
  console.log("Live private login, record creation/edit/read and photo upload/download passed.");
} finally {
  if (entryId?.endsWith(testId)) {
    const removed = await fetch(`${origin}/api/entries?id=${encodeURIComponent(entryId)}`, { method: "DELETE", headers });
    assert.equal(removed.status, 200, "Disposable record and its photo must be removed");
    const remaining = await fetch(`${origin}/api/entries`, { headers });
    assert.ok(!(await remaining.json()).entries.some(entry => entry.id === entryId));
    console.log("Disposable live record and photo removed.");
  }
}
