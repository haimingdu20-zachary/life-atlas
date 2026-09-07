import { ensureDatabase } from "@/db/bootstrap";
import { env } from "cloudflare:workers";
import { ownerPattern, requireVisitorOwner } from "@/app/lib/visitor-session";

const maxBytes = 75 * 1024 * 1024;
const allowedPrefixes = ["image/", "video/", "audio/", "text/"];
const allowedExact = ["application/pdf", "application/json"];

function allowedType(contentType: string) {
  return allowedPrefixes.some(prefix => contentType.startsWith(prefix)) || allowedExact.includes(contentType);
}

export async function GET(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const entryId = params.get("entryId");
  const entryIds = Array.from(new Set((params.get("entryIds") || "").split(",").map(value => value.trim()).filter(Boolean))).slice(0, 100);
  const db = await ensureDatabase();
  if (id) {
    const media = await db.prepare("SELECT m.object_key AS objectKey, m.content_type AS contentType, m.file_name AS fileName FROM life_media m JOIN life_entries e ON e.id=m.entry_id WHERE m.id=? AND e.id LIKE ?").bind(id, ownerPattern(session.owner)).first<{ objectKey: string; contentType: string; fileName: string }>();
    if (!media) return new Response("Not found", { status: 404 });
    const object = await env.MEDIA.get(media.objectKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": media.contentType, "Content-Length": String(object.size), "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.fileName)}` } });
  }
  if (entryIds.length) {
    const placeholders = entryIds.map(() => "?").join(",");
    const result = await db.prepare(`SELECT id, entry_id AS entryId, file_name AS fileName, content_type AS contentType, size, stage, captured_at AS capturedAt, latitude, longitude, created_at AS createdAt FROM life_media WHERE entry_id IN (${placeholders}) AND entry_id LIKE ? ORDER BY entry_id, CASE stage WHEN 'start' THEN 1 WHEN 'moment' THEN 2 ELSE 3 END, created_at`).bind(...entryIds, ownerPattern(session.owner)).all();
    return Response.json({ media: (result.results || []).map(item => ({ ...item, url: `/api/media?id=${item.id}` })) });
  }
  if (!entryId) return Response.json({ error: "缺少经历 ID" }, { status: 400 });
  const result = await db.prepare(`SELECT id, entry_id AS entryId, file_name AS fileName, content_type AS contentType, size, stage, captured_at AS capturedAt, latitude, longitude, created_at AS createdAt FROM life_media WHERE entry_id=? AND entry_id LIKE ? ORDER BY CASE stage WHEN 'start' THEN 1 WHEN 'moment' THEN 2 ELSE 3 END, created_at`).bind(entryId, ownerPattern(session.owner)).all();
  return Response.json({ media: (result.results || []).map(item => ({ ...item, url: `/api/media?id=${item.id}` })) });
}

export async function POST(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const formData = await request.formData();
  const file = formData.get("file");
  const entryId = String(formData.get("entryId") || "");
  const stage = String(formData.get("stage") || "moment");
  if (!(file instanceof File) || !entryId) return Response.json({ error: "缺少文件或经历 ID" }, { status: 400 });
  if (file.size > maxBytes) return Response.json({ error: "单个文件不能超过 75MB" }, { status: 400 });
  if (!allowedType(file.type || "application/octet-stream")) return Response.json({ error: "暂不支持这种文件类型" }, { status: 400 });
  if (!["start", "moment", "end"].includes(stage)) return Response.json({ error: "时间线阶段无效" }, { status: 400 });
  const db = await ensureDatabase();
  const entry = await db.prepare("SELECT id FROM life_entries WHERE id=? AND id LIKE ?").bind(entryId, ownerPattern(session.owner)).first();
  if (!entry) return Response.json({ error: "经历不存在" }, { status: 404 });
  const id = crypto.randomUUID();
  const objectKey = `${entryId}/${id}`;
  await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name } });
  await db.prepare("INSERT INTO life_media (id,entry_id,object_key,file_name,content_type,size,stage,captured_at,latitude,longitude,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(
    id, entryId, objectKey, file.name, file.type || "application/octet-stream", file.size, stage,
    String(formData.get("capturedAt") || "") || null,
    formData.get("latitude") ? Number(formData.get("latitude")) : null,
    formData.get("longitude") ? Number(formData.get("longitude")) : null,
    new Date().toISOString(),
  ).run();
  return Response.json({ media: { id, entryId, fileName: file.name, contentType: file.type, size: file.size, stage, url: `/api/media?id=${id}` } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = requireVisitorOwner(request); if ("response" in session) return session.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少媒体 ID" }, { status: 400 });
  const db = await ensureDatabase();
  const media = await db.prepare("SELECT m.object_key AS objectKey FROM life_media m JOIN life_entries e ON e.id=m.entry_id WHERE m.id=? AND e.id LIKE ?").bind(id, ownerPattern(session.owner)).first<{ objectKey: string }>();
  if (media) await env.MEDIA.delete(media.objectKey);
  if (media) await db.prepare("DELETE FROM life_media WHERE id=?").bind(id).run();
  return Response.json({ ok: true });
}
