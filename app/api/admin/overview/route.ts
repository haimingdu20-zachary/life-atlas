import { authorizeAdminRequest } from "@/app/lib/admin-auth";
import { ensureDatabase } from "@/db/bootstrap";

type AggregateRow = {
  entries: number;
  goals: number;
  activeGoals: number;
  tracks: number;
  mediaCount: number;
  mediaBytes: number;
};

export async function GET(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const db = await ensureDatabase();
  const [aggregate, entries, goals, tracks, mediaTypes, years] = await db.batch([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM life_entries) AS entries,
      (SELECT COUNT(*) FROM life_goals) AS goals,
      (SELECT COUNT(*) FROM life_goals WHERE status='active') AS activeGoals,
      (SELECT COUNT(*) FROM life_tracks) AS tracks,
      (SELECT COUNT(*) FROM life_media) AS mediaCount,
      COALESCE((SELECT SUM(size) FROM life_media), 0) AS mediaBytes`),
    db.prepare(`SELECT id, title, occurred_at AS occurredAt, location_name AS locationName, category, visibility, emotion, significance, created_at AS createdAt
      FROM life_entries ORDER BY occurred_at DESC LIMIT 200`),
    db.prepare(`SELECT id, title, target_date AS targetDate, domain, status, progress, location_name AS locationName, created_at AS createdAt
      FROM life_goals ORDER BY target_date LIMIT 200`),
    db.prepare(`SELECT id, title, start_date AS startDate, end_date AS endDate, status, progress, color, created_at AS createdAt
      FROM life_tracks ORDER BY sort_order, created_at LIMIT 100`),
    db.prepare(`SELECT CASE
      WHEN content_type LIKE 'image/%' THEN 'image'
      WHEN content_type LIKE 'video/%' THEN 'video'
      WHEN content_type LIKE 'audio/%' THEN 'audio'
      ELSE 'file' END AS type, COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
      FROM life_media GROUP BY type ORDER BY count DESC`),
    db.prepare(`SELECT substr(occurred_at, 1, 4) AS year, COUNT(*) AS count
      FROM life_entries GROUP BY substr(occurred_at, 1, 4) ORDER BY year`),
  ]);
  const stats = (aggregate.results?.[0] || { entries: 0, goals: 0, activeGoals: 0, tracks: 0, mediaCount: 0, mediaBytes: 0 }) as unknown as AggregateRow;
  return Response.json({
    identity: authorization.identity,
    stats,
    entries: entries.results || [],
    goals: goals.results || [],
    tracks: tracks.results || [],
    mediaTypes: mediaTypes.results || [],
    years: years.results || [],
    generatedAt: new Date().toISOString(),
  });
}
