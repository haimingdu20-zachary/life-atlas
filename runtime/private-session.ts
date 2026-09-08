import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "life_atlas_private";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authConfigured() {
  return /^[a-f0-9]{64}$/.test(process.env.LIFE_ATLAS_PASSWORD_HASH || "") &&
    (process.env.LIFE_ATLAS_SESSION_SECRET || "").length >= 32;
}

export function validPassword(password: string) {
  return authConfigured() && equal(createHash("sha256").update(password).digest("hex"), process.env.LIFE_ATLAS_PASSWORD_HASH!);
}

function signature(payload: string) {
  return createHmac("sha256", process.env.LIFE_ATLAS_SESSION_SECRET!).update(payload).digest("base64url");
}

export function createSession(now = Date.now()) {
  if (!authConfigured()) throw new Error("Private access is not configured");
  const payload = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${payload}.${signature(payload)}`;
}

export function validSession(cookieHeader: string | null, now = Date.now()) {
  if (!authConfigured()) return false;
  const token = cookieHeader?.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const match = token?.match(/^(\d{10})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expires = Number(match[1]);
  const current = Math.floor(now / 1000);
  return expires > current && expires <= current + SESSION_SECONDS && equal(signature(match[1]), match[2]);
}

export function personalOwner() {
  const value = process.env.LIFE_ATLAS_OWNER_KEY || "user_personal";
  if (!/^user_[A-Za-z0-9-]+$/.test(value)) throw new Error("Invalid personal owner key");
  return value;
}

export function sameOrigin(request: Request) {
  try {
    const expected = new URL(process.env.LIFE_ATLAS_PUBLIC_ORIGIN || request.url);
    const origin = new URL(request.headers.get("origin") || "");
    return origin.host === expected.host && ["http:", "https:"].includes(origin.protocol);
  } catch { return false; }
}
