import { authorizeAdminRequest } from "@/app/lib/admin-auth";
import { ensureDatabase } from "@/db/bootstrap";
import { env } from "cloudflare:workers";

export async function DELETE(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  if (!id || !["entry", "goal", "track"].includes(kind || "")) return Response.json({ error: "管理目标无效" }, { status: 400 });
  const db = await ensureDatabase();
  if (kind === "entry") {
    const media = await db.prepare("SELECT object_key AS objectKey FROM life_media WHERE entry_id=?").bind(id).all<{ objectKey: string }>();
    await Promise.all((media.results || []).map(item => env.MEDIA.delete(item.objectKey)));
    await db.batch([db.prepare("DELETE FROM life_media WHERE entry_id=?").bind(id), db.prepare("DELETE FROM life_entries WHERE id=?").bind(id)]);
  } else if (kind === "goal") {
    await db.batch([db.prepare("DELETE FROM life_goal_edges WHERE from_goal_id=? OR to_goal_id=?").bind(id, id), db.prepare("DELETE FROM life_goals WHERE id=?").bind(id)]);
  } else {
    await db.batch([
      db.prepare("UPDATE life_entries SET track_id=NULL WHERE track_id=?").bind(id),
      db.prepare("UPDATE life_goals SET track_id=NULL WHERE track_id=?").bind(id),
      db.prepare("DELETE FROM life_tracks WHERE id=?").bind(id),
    ]);
  }
  return Response.json({ ok: true });
}
