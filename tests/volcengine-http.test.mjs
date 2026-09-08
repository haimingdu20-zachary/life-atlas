import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";

test("standalone server protects pages and APIs and supports private login", async () => {
  const password = randomBytes(24).toString("base64url");
  const base = "http://127.0.0.1:43873";
  const child = spawn(process.execPath, ["dist/standalone/server.js"], {
    env: { ...process.env, PORT: "43873", HOST: "127.0.0.1", NODE_ENV: "production",
      LIFE_ATLAS_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
      LIFE_ATLAS_SESSION_SECRET: randomBytes(32).toString("hex"),
      LIFE_ATLAS_PUBLIC_ORIGIN: base,
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Server failed: ${output}`);
      try { if ((await fetch(`${base}/login`)).status === 200) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "Server must start");
    const loginHtml = await (await fetch(`${base}/login`)).text();
    const loginForm = loginHtml.match(/<form\b[^>]*>/)?.[0] || "";
    assert.match(loginForm, /method="post"/);
    assert.match(loginForm, /action="\/api\/login"/);
    const nativeLogin = await fetch(`${base}/api/login`, { method: "POST", redirect: "manual", headers: { Origin: base }, body: new URLSearchParams({ password }) });
    assert.equal(nativeLogin.status, 303, "A login before hydration must use POST and redirect");
    assert.equal(nativeLogin.headers.get("location"), "/");
    assert.ok(nativeLogin.headers.get("set-cookie")?.includes("HttpOnly"));
    const home = await fetch(base, { redirect: "manual" });
    assert.ok([302, 307].includes(home.status));
    assert.equal(new URL(home.headers.get("location"), base).pathname, "/login");
    for (const path of ["entries", "goals", "tracks", "media", "session", "life-profile", "admin/overview", "ai/refine"]) {
      const response = await fetch(`${base}/api/${path}`, { headers: { "oai-authenticated-user-id": "forged-owner", Cookie: "life_atlas_visitor=visitor_12345678-1234-1234-1234-123456789012" } });
      assert.equal(response.status, 401, path);
    }
    const foreign = await fetch(`${base}/api/login`, { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    assert.equal(foreign.status, 403);
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(cookie.includes(flag));
    const headers = { Cookie: cookie.split(";")[0] };
    assert.equal((await fetch(`${base}/api/session`, { headers })).status, 200);
    const unlocked = await fetch(base, { headers });
    assert.equal(unlocked.status, 200);
    assert.match(await unlocked.text(), /人生地图/);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  }
});
