import { requireVisitorOwner } from "@/app/lib/visitor-session";
import { ensureDatabase } from "@/db/bootstrap";

type DomainInput = { id?: string; label?: string; description?: string; color?: string };
const selectSql = `SELECT id,label,description,color,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt FROM life_domains`;

function validate(body: DomainInput) {
  const label = body.label?.trim() || "";
  if (!label || label.length > 12) return "领域名称需要控制在 1—12 个字";
  if ((body.description || "").trim().length > 30) return "领域说明不能超过 30 个字";
  if (!/^#[0-9a-fA-F]{6}$/.test(body.color || "")) return "请选择有效的领域颜色";
  return null;
}

export async function GET(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const db = await ensureDatabase();
  const result = await db.prepare(`${selectSql} WHERE owner_key=? ORDER BY sort_order,created_at`).bind(session.owner).all();
  return Response.json({ domains: result.results || [] });
}

export async function POST(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as DomainInput;
  const error = validate(body); if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  const duplicate = await db.prepare("SELECT id FROM life_domains WHERE owner_key=? AND label=?").bind(session.owner, body.label!.trim()).first();
  if (duplicate) return Response.json({ error: "已经有同名领域" }, { status: 409 });
  const id = `custom-${crypto.randomUUID()}`; const now = new Date().toISOString();
  const order = await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM life_domains WHERE owner_key=?").bind(session.owner).first<{ value: number }>();
  await db.prepare("INSERT INTO life_domains (id,owner_key,label,description,color,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, session.owner, body.label!.trim(), body.description?.trim() || "", body.color, Number(order?.value || 1), now, now).run();
  return Response.json({ domain: await db.prepare(`${selectSql} WHERE id=? AND owner_key=?`).bind(id, session.owner).first() }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as DomainInput;
  if (!body.id) return Response.json({ error: "缺少领域 ID" }, { status: 400 });
  const error = validate(body); if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  await db.prepare("UPDATE life_domains SET label=?,description=?,color=?,updated_at=? WHERE id=? AND owner_key=?")
    .bind(body.label!.trim(), body.description?.trim() || "", body.color, new Date().toISOString(), body.id, session.owner).run();
  return Response.json({ domain: await db.prepare(`${selectSql} WHERE id=? AND owner_key=?`).bind(body.id, session.owner).first() });
}

export async function DELETE(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少领域 ID" }, { status: 400 });
  const db = await ensureDatabase();
  const domain = await db.prepare("SELECT id FROM life_domains WHERE id=? AND owner_key=?").bind(id, session.owner).first();
  if (!domain) return Response.json({ error: "领域不存在" }, { status: 404 });
  const usage = await db.prepare("SELECT COUNT(*) AS count FROM life_goals WHERE domain=? AND id LIKE ?").bind(id, session.owner === "legacy" ? "%" : `${session.owner}.%`).first<{ count: number }>();
  if (usage?.count) return Response.json({ error: `这个领域下还有 ${usage.count} 个目标，请先修改目标领域` }, { status: 409 });
  await db.prepare("DELETE FROM life_domains WHERE id=? AND owner_key=?").bind(id, session.owner).run();
  return Response.json({ ok: true });
}
