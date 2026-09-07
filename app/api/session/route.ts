import { isLocalRequest, VISITOR_SESSION_COOKIE, visitorOwner } from "@/app/lib/visitor-session";

export async function GET(request: Request) {
  const existing = visitorOwner(request);
  if (existing) return Response.json({ ready: true });
  const visitor = `visitor_${crypto.randomUUID()}`;
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return Response.json({ ready: true }, { headers: { "Set-Cookie": `${VISITOR_SESSION_COOKIE}=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` } });
}
