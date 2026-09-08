import { env } from "cloudflare:workers";
import { validSession } from "../../runtime/private-session";

export type AdminIdentity = {
  displayName: string;
  email: string;
  local: boolean;
};

function allowedEmails() {
  return new Set((env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
}

export function isLocalAdminUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function authorizeAdminRequest(request: Request): { ok: true; identity: AdminIdentity } | { ok: false; status: 401 | 403; error: string } {
  if (import.meta.env.ATLAS_PRIVATE_HOST) return validSession(request.headers.get("cookie"))
    ? { ok: true, identity: { displayName: "海铭", email: "owner@life-atlas", local: false } }
    : { ok: false, status: 401, error: "请先解锁你的人生地图" };
  if (isLocalAdminUrl(request.url)) return { ok: true, identity: { displayName: "本地管理员", email: "local@life-atlas", local: true } };
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
  if (!userId || !email) return { ok: false, status: 401, error: "请先登录后访问管理后台" };
  const allowlist = allowedEmails();
  if (allowlist.size && !allowlist.has(email)) return { ok: false, status: 403, error: "当前账号没有管理员权限" };
  return { ok: true, identity: { displayName: request.headers.get("oai-authenticated-user-full-name") || email, email, local: false } };
}
