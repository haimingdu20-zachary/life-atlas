import { ensureDatabase } from "@/db/bootstrap";
import { env } from "cloudflare:workers";
import { ownedId, ownerPattern, requireVisitorOwner } from "@/app/lib/visitor-session";

type EntryInput = {
  id?: string; title?: string; occurredAt?: string; endedAt?: string | null; locationName?: string;
  latitude?: number; longitude?: number; category?: string; status?: string;
  mood?: number; significance?: number; summary?: string; rawDetail?: string; detail?: string;
  lessons?: string; people?: string; emotion?: string; emotions?: string[]; lifePhase?: string; visibility?: string; tags?: string[]; trackId?: string | null;
};

const emotions = new Set(["calm", "joy", "excitement", "moved", "longing", "sadness", "regret", "anxiety", "anger", "loneliness", "confusion", "relief"]);
const lifePhases = new Set(["", "turning", "low", "rebirth"]);

const selectSql = `SELECT id, title, occurred_at AS occurredAt, ended_at AS endedAt, location_name AS locationName,
 latitude, longitude, category, status, mood, significance, summary, raw_detail AS rawDetail, detail, lessons,
 people, emotion, emotion_tags AS emotions, life_phase AS lifePhase, visibility, tags, track_id AS trackId, created_at AS createdAt FROM life_entries`;

function normalize(row: Record<string, unknown>) {
  let tags: string[] = [];
  let selectedEmotions: string[] = [];
  try { tags = JSON.parse(String(row.tags || "[]")); } catch { tags = []; }
  try { selectedEmotions = JSON.parse(String(row.emotions || "[]")); } catch { selectedEmotions = []; }
  if (!selectedEmotions.length) selectedEmotions = [String(row.emotion || "calm")];
  return { ...row, tags, emotions: selectedEmotions };
}

function validationError(body: EntryInput) {
  if (!body.title?.trim() || !body.occurredAt || !body.locationName?.trim()) return "请填写标题、时间和地点";
  const latitude = Number(body.latitude); const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "请提供有效的经纬度";
  if (!Number.isFinite(new Date(body.occurredAt).getTime())) return "请提供有效的时间";
  if (body.endedAt && (!Number.isFinite(new Date(body.endedAt).getTime()) || new Date(body.endedAt) < new Date(body.occurredAt))) return "结束时间不能早于开始时间";
  if (body.mood !== undefined && (Number(body.mood) < 1 || Number(body.mood) > 5)) return "心情评分必须在 1—5 之间";
  if (body.significance !== undefined && (Number(body.significance) < 1 || Number(body.significance) > 5)) return "人生权重必须在 1—5 之间";
  if (body.emotion && !emotions.has(body.emotion)) return "情绪类型无效";
  if (body.emotions && (!Array.isArray(body.emotions) || body.emotions.some(emotion => !emotions.has(emotion)))) return "多选情绪中包含无效类型";
  if (body.lifePhase !== undefined && !lifePhases.has(body.lifePhase)) return "人生阶段标记无效";
  return null;
}

export async function GET(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const db = await ensureDatabase();
  const result = await db.prepare(`${selectSql} WHERE id LIKE ? ORDER BY occurred_at DESC`).bind(ownerPattern(session.owner)).all<Record<string, unknown>>();
  return Response.json({ entries: (result.results || []).map(normalize) });
}

export async function POST(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as EntryInput;
  const error = validationError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  const id = ownedId(session.owner, body.id || crypto.randomUUID());
  const selectedEmotions = Array.from(new Set((body.emotions?.length ? body.emotions : [body.emotion || "calm"]).filter(emotion => emotions.has(emotion))));
  const primaryEmotion = selectedEmotions[0] || "calm";
  await db.prepare(`INSERT INTO life_entries (id,title,occurred_at,ended_at,location_name,latitude,longitude,category,status,mood,significance,summary,raw_detail,detail,lessons,people,emotion,emotion_tags,life_phase,visibility,tags,track_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, body.title!.trim(), body.occurredAt, body.endedAt || null, body.locationName!.trim(), Number(body.latitude), Number(body.longitude),
      body.category || "growth", body.status || "memory", Number(body.mood || 4), Number(body.significance || 3),
      body.summary || "", body.rawDetail || body.detail || "", body.detail || "", body.lessons || "", body.people || "", primaryEmotion, JSON.stringify(selectedEmotions), body.lifePhase || "", body.visibility || "private", JSON.stringify(body.tags || []),
      body.trackId || null, new Date().toISOString(),
    ).run();
  const row = await db.prepare(`${selectSql} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return Response.json({ entry: row ? normalize(row) : null }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const body = await request.json() as EntryInput;
  if (!body.id) return Response.json({ error: "缺少记录 ID" }, { status: 400 });
  const error = validationError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const db = await ensureDatabase();
  const selectedEmotions = Array.from(new Set((body.emotions?.length ? body.emotions : [body.emotion || "calm"]).filter(emotion => emotions.has(emotion))));
  const primaryEmotion = selectedEmotions[0] || "calm";
  await db.prepare(`UPDATE life_entries SET title=?, occurred_at=?, ended_at=?, location_name=?, latitude=?, longitude=?, category=?, status=?, mood=?, significance=?, summary=?, raw_detail=?, detail=?, lessons=?, people=?, emotion=?, emotion_tags=?, life_phase=?, visibility=?, tags=?, track_id=? WHERE id=? AND id LIKE ?`).bind(
    body.title || "未命名经历", body.occurredAt, body.endedAt || null, body.locationName || "未命名地点", Number(body.latitude), Number(body.longitude), body.category || "growth", body.status || "memory", Number(body.mood || 4), Number(body.significance || 3), body.summary || "", body.rawDetail || body.detail || "", body.detail || "", body.lessons || "", body.people || "", primaryEmotion, JSON.stringify(selectedEmotions), body.lifePhase || "", body.visibility || "private", JSON.stringify(body.tags || []), body.trackId || null, body.id, ownerPattern(session.owner),
  ).run();
  const row = await db.prepare(`${selectSql} WHERE id = ? AND id LIKE ?`).bind(body.id, ownerPattern(session.owner)).first<Record<string, unknown>>();
  return Response.json({ entry: row ? normalize(row) : null });
}

export async function DELETE(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少记录 ID" }, { status: 400 });
  const db = await ensureDatabase();
  const media = await db.prepare("SELECT object_key AS objectKey FROM life_media WHERE entry_id = ? AND entry_id LIKE ?").bind(id, ownerPattern(session.owner)).all<{ objectKey: string }>();
  await Promise.all((media.results || []).map(item => env.MEDIA.delete(item.objectKey)));
  await db.prepare("DELETE FROM life_media WHERE entry_id = ? AND entry_id LIKE ?").bind(id, ownerPattern(session.owner)).run();
  await db.prepare("DELETE FROM life_entries WHERE id = ? AND id LIKE ?").bind(id, ownerPattern(session.owner)).run();
  return Response.json({ ok: true });
}
