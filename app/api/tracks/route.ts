import { ensureDatabase } from "@/db/bootstrap";
import { ownedId, ownerPattern, requireVisitorOwner } from "@/app/lib/visitor-session";

type TrackInput = { id?: string; title?: string; description?: string; why?: string; nextStep?: string; startDate?: string; endDate?: string; status?: string; progress?: number; color?: string; sortOrder?: number };
const selectSql = `SELECT id, title, description, why, next_step AS nextStep, start_date AS startDate, end_date AS endDate, status, progress, color, sort_order AS sortOrder, created_at AS createdAt FROM life_tracks`;

function validationError(body: TrackInput) {
  if (!body.title?.trim() || !body.startDate || !body.endDate) return "请填写主线名称和时间范围";
  if (!Number.isFinite(new Date(body.startDate).getTime()) || !Number.isFinite(new Date(body.endDate).getTime()) || body.startDate > body.endDate) return "主线日期范围无效";
  const progress = Number(body.progress || 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return "主线进度必须在 0—100 之间";
  return null;
}

export async function GET(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const db = await ensureDatabase();
  const result = await db.prepare(`${selectSql} WHERE id LIKE ? ORDER BY sort_order, created_at`).bind(ownerPattern(session.owner)).all();
  return Response.json({ tracks: result.results || [] });
}

export async function POST(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as TrackInput;
  const error = validationError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  const id = ownedId(session.owner);
  await db.prepare("INSERT INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, body.title!.trim(), body.description || "", body.why || "", body.nextStep || "", body.startDate, body.endDate, body.status || "active", Number(body.progress || 0), body.color || "#ff9c69", Number(body.sortOrder || Date.now()), new Date().toISOString()).run();
  const track = await db.prepare(`${selectSql} WHERE id=?`).bind(id).first();
  return Response.json({ track }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as TrackInput;
  if (!body.id) return Response.json({ error: "缺少主线 ID" }, { status: 400 });
  const error = validationError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  await db.prepare("UPDATE life_tracks SET title=?,description=?,why=?,next_step=?,start_date=?,end_date=?,status=?,progress=?,color=? WHERE id=? AND id LIKE ?")
    .bind(body.title || "未命名主线", body.description || "", body.why || "", body.nextStep || "", body.startDate, body.endDate, body.status || "active", Number(body.progress || 0), body.color || "#ff9c69", body.id, ownerPattern(session.owner)).run();
  const track = await db.prepare(`${selectSql} WHERE id=? AND id LIKE ?`).bind(body.id, ownerPattern(session.owner)).first();
  return Response.json({ track });
}

export async function DELETE(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少主线 ID" }, { status: 400 });
  const db = await ensureDatabase();
  await db.batch([db.prepare("UPDATE life_entries SET track_id=NULL WHERE track_id=? AND id LIKE ?").bind(id, ownerPattern(session.owner)), db.prepare("DELETE FROM life_tracks WHERE id=? AND id LIKE ?").bind(id, ownerPattern(session.owner))]);
  return Response.json({ ok: true });
}
