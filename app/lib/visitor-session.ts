export const VISITOR_SESSION_COOKIE = "life_atlas_visitor";

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function visitorOwner(request: Request) {
  if (isLocalRequest(request)) return "legacy";
  const authenticatedUser = request.headers.get("oai-authenticated-user-id")?.trim();
  if (authenticatedUser) return `user_${authenticatedUser}`;
  const cookie = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${VISITOR_SESSION_COOKIE}=`))?.slice(VISITOR_SESSION_COOKIE.length + 1);
  return cookie && /^visitor_[a-f0-9-]{36}$/.test(cookie) ? cookie : null;
}

export function requireVisitorOwner(request: Request) {
  const owner = visitorOwner(request);
  return owner ? { owner } : { response: Response.json({ error: "正在建立独立数据空间，请刷新页面" }, { status: 401 }) };
}

export function ownerPattern(owner: string) {
  return owner === "legacy" ? "%" : `${owner}.%`;
}

export function ownedId(owner: string, id = crypto.randomUUID()) {
  return owner === "legacy" ? id : `${owner}.${id.replace(/^visitor_[a-f0-9-]{36}\./, "")}`;
}
