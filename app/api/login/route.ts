import { authConfigured, createSession, validPassword, sameOrigin, SESSION_COOKIE, SESSION_SECONDS } from "@/runtime/private-session";

let attempts = 0;
let windowStart = Date.now();

export async function POST(request: Request) {
  if (!import.meta.env.ATLAS_PRIVATE_HOST) return new Response(null, { status: 404 });
  if (!authConfigured()) return Response.json({ error: "私人访问尚未配置完成" }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (Date.now() - windowStart > 60_000) { attempts = 0; windowStart = Date.now(); }
  if (++attempts > 20) return Response.json({ error: "尝试次数较多，请一分钟后再试" }, { status: 429 });
  if (Number(request.headers.get("content-length")) > 4096) return new Response(null, { status: 413 });
  let password: unknown;
  const nativeForm = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
  try { password = nativeForm ? (await request.formData()).get("password") : (await request.json() as { password?: unknown })?.password; } catch { return new Response(null, { status: 400 }); }
  if (typeof password !== "string" || password.length > 256 || !validPassword(password)) return Response.json({ error: "访问口令不正确" }, { status: 401 });
  const headers = {
    "Cache-Control": "no-store",
    "Set-Cookie": `${SESSION_COOKIE}=${createSession()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
  };
  // A submit before hydration must keep the password out of the URL.
  if (nativeForm) return new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  return Response.json({ ok: true }, { headers });
}
