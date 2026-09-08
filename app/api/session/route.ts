import { isLocalRequest, VISITOR_SESSION_COOKIE, visitorOwner } from "@/app/lib/visitor-session";

export async function GET(request: Request) {
  const existing = visitorOwner(request);
  if (existing) return Response.json({ ready: true });
  if (import.meta.env.ATLAS_PRIVATE_HOST) return Response.json({ error: "请先解锁你的人生地图" }, { status: 401 });
  const visitor = `visitor_${crypto.randomUUID()}`;
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return Response.json({ ready: true }, { headers: { "Set-Cookie": `${VISITOR_SESSION_COOKIE}=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` } });
}
