import { NextResponse } from "next/server";
import { authConfigured, validSession, sameOrigin } from "./runtime/private-session";

export function middleware(request: Request) {
  if (!import.meta.env.ATLAS_PRIVATE_HOST) return NextResponse.next();
  const path = new URL(request.url).pathname;
  if (path === "/login" || path === "/api/login" || path.startsWith("/assets/") || path.startsWith("/_next/static/") || path.startsWith("/icons/") || path === "/apple-touch-icon.png" || path === "/favicon.ico" || path === "/manifest.webmanifest") return NextResponse.next();
  if (!authConfigured()) return new Response("人生地图正在配置私人访问，请稍后再试。", { status: 503 });
  if (!validSession(request.headers.get("cookie"))) {
    if (path.startsWith("/api/")) return Response.json({ error: "请先解锁你的人生地图" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  return NextResponse.next();
}
