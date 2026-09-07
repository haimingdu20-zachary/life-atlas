import { ensureDatabase } from "@/db/bootstrap";
import { requireVisitorOwner } from "@/app/lib/visitor-session";

type ProfileInput = {
  displayName?: string;
  birthDate?: string;
  birthCity?: string;
  currentCity?: string;
  identity?: string;
  planningAge?: number;
  values?: string[];
  avatarSymbol?: string;
};

const selectSql = `SELECT id, display_name AS displayName, birth_date AS birthDate,
  birth_city AS birthCity, current_city AS currentCity, identity,
  planning_age AS planningAge, core_values AS "values", avatar_symbol AS avatarSymbol,
  created_at AS createdAt, updated_at AS updatedAt
  FROM life_profiles`;

function profileId(owner: string) { return owner === "legacy" ? "self" : owner; }

function normalize(row: Record<string, unknown> | null) {
  if (!row) return null;
  let values: string[] = [];
  try { values = JSON.parse(String(row.values || "[]")) as string[]; } catch { values = []; }
  return { ...row, values };
}

export async function GET(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const db = await ensureDatabase();
  return Response.json({ profile: normalize(await db.prepare(`${selectSql} WHERE id=?`).bind(profileId(session.owner)).first<Record<string, unknown>>()) });
}

export async function PUT(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as ProfileInput;
  const birth = new Date(body.birthDate || "");
  const planningAge = Number(body.planningAge || 80);
  if (!body.displayName?.trim() || !Number.isFinite(birth.getTime()) || birth > new Date()) return Response.json({ error: "请填写姓名和有效的出生日期" }, { status: 400 });
  if (!Number.isInteger(planningAge) || planningAge < 1 || planningAge > 120) return Response.json({ error: "规划年龄必须在 1—120 岁之间" }, { status: 400 });
  const values = Array.from(new Set((body.values || []).map(item => item.trim()).filter(Boolean))).slice(0, 5);
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO life_profiles
    (id,display_name,birth_date,birth_city,current_city,identity,planning_age,core_values,avatar_symbol,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,birth_date=excluded.birth_date,
    birth_city=excluded.birth_city,current_city=excluded.current_city,identity=excluded.identity,
    planning_age=excluded.planning_age,core_values=excluded.core_values,avatar_symbol=excluded.avatar_symbol,updated_at=excluded.updated_at`)
    .bind(profileId(session.owner), body.displayName.trim(), body.birthDate, body.birthCity?.trim() || "", body.currentCity?.trim() || "", body.identity?.trim() || "", planningAge, JSON.stringify(values), body.avatarSymbol?.trim().slice(0, 2) || "星", now, now).run();
  return Response.json({ profile: normalize(await db.prepare(`${selectSql} WHERE id=?`).bind(profileId(session.owner)).first<Record<string, unknown>>()) });
}
