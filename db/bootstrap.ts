import { env } from "cloudflare:workers";

let ready = false;
let initialization: Promise<void> | null = null;

export async function ensureDatabase() {
  const db = env.DB;
  if (!db) throw new Error("Local D1 database is unavailable");
  if (ready) return db;
  initialization ??= initializeDatabase(db);
  try {
    await initialization;
  } catch (cause) {
    initialization = null;
    throw cause;
  }
  return db;
}

async function initializeDatabase(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
  const schemaVersion = await db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first<{ value: string }>();
  if (schemaVersion?.value === "8") {
    ready = true;
    return;
  }
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      why TEXT NOT NULL DEFAULT '',
      next_step TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      progress INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#ff9c69',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_domains (
      id TEXT PRIMARY KEY,
      owner_key TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#70cfcf',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      ended_at TEXT,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'growth',
      status TEXT NOT NULL DEFAULT 'memory',
      mood INTEGER NOT NULL DEFAULT 4,
      significance INTEGER NOT NULL DEFAULT 3,
      summary TEXT NOT NULL DEFAULT '',
      raw_detail TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      lessons TEXT NOT NULL DEFAULT '',
      people TEXT NOT NULL DEFAULT '',
      emotion TEXT NOT NULL DEFAULT 'calm',
      emotion_tags TEXT NOT NULL DEFAULT '[]',
      life_phase TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private',
      tags TEXT NOT NULL DEFAULT '[]',
      track_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (track_id) REFERENCES life_tracks(id) ON DELETE SET NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_media (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT 'moment',
      captured_at TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES life_entries(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL,
      birth_city TEXT NOT NULL DEFAULT '',
      current_city TEXT NOT NULL DEFAULT '',
      identity TEXT NOT NULL DEFAULT '',
      planning_age INTEGER NOT NULL DEFAULT 80,
      core_values TEXT NOT NULL DEFAULT '[]',
      avatar_symbol TEXT NOT NULL DEFAULT '星',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      why TEXT NOT NULL DEFAULT '',
      next_step TEXT NOT NULL DEFAULT '',
      target_date TEXT NOT NULL,
      start_date TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'career',
      time_mode TEXT NOT NULL DEFAULT 'point',
      node_type TEXT NOT NULL DEFAULT 'goal',
      status TEXT NOT NULL DEFAULT 'planned',
      progress INTEGER NOT NULL DEFAULT 0,
      track_id TEXT,
      linked_entry_id TEXT,
      location_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (track_id) REFERENCES life_tracks(id) ON DELETE SET NULL,
      FOREIGN KEY (linked_entry_id) REFERENCES life_entries(id) ON DELETE SET NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_goal_edges (
      id TEXT PRIMARY KEY,
      from_goal_id TEXT NOT NULL,
      to_goal_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'depends',
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_goal_id) REFERENCES life_goals(id) ON DELETE CASCADE,
      FOREIGN KEY (to_goal_id) REFERENCES life_goals(id) ON DELETE CASCADE
    )`),
  ]);

  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON life_entries(occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_entries_track_id ON life_entries(track_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tracks_status_order ON life_tracks(status, sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_media_entry_stage ON life_media(entry_id, stage)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_goals_domain_target ON life_goals(domain, target_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_goals_track_id ON life_goals(track_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_goal_edges_from ON life_goal_edges(from_goal_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_goal_edges_to ON life_goal_edges(to_goal_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_domains_owner_order ON life_domains(owner_key,sort_order)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_owner_label ON life_domains(owner_key,label)"),
  ]);

  const entryColumns = await db.prepare("PRAGMA table_info(life_entries)").all<{ name: string }>();
  const columnNames = new Set((entryColumns.results || []).map(column => column.name));
  const alterations: D1PreparedStatement[] = [];
  if (!columnNames.has("ended_at")) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN ended_at TEXT"));
  if (!columnNames.has("raw_detail")) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN raw_detail TEXT NOT NULL DEFAULT ''"));
  if (!columnNames.has("emotion")) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN emotion TEXT NOT NULL DEFAULT 'calm'"));
  const needsEmotionTags = !columnNames.has("emotion_tags");
  if (needsEmotionTags) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN emotion_tags TEXT NOT NULL DEFAULT '[]'"));
  const needsLifePhase = !columnNames.has("life_phase");
  if (needsLifePhase) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN life_phase TEXT NOT NULL DEFAULT ''"));
  if (!columnNames.has("visibility")) alterations.push(db.prepare("ALTER TABLE life_entries ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'"));
  if (alterations.length) await db.batch(alterations);
  if (needsEmotionTags) await db.prepare(`UPDATE life_entries SET emotion_tags='["' || emotion || '"]'`).run();
  if (needsLifePhase) {
    await db.batch([
      db.prepare("UPDATE life_entries SET life_phase=emotion WHERE emotion IN ('turning','low','rebirth')"),
      db.prepare("UPDATE life_entries SET emotion=CASE emotion WHEN 'low' THEN 'sadness' WHEN 'rebirth' THEN 'relief' WHEN 'turning' THEN 'calm' ELSE emotion END"),
    ]);
  }

  const goalColumns = await db.prepare("PRAGMA table_info(life_goals)").all<{ name: string }>();
  const goalColumnNames = new Set((goalColumns.results || []).map(column => column.name));
  if (!goalColumnNames.has("time_mode")) await db.prepare("ALTER TABLE life_goals ADD COLUMN time_mode TEXT NOT NULL DEFAULT 'point'").run();

  const seedFlag = await db.prepare("SELECT value FROM app_meta WHERE key = 'seed_version'").first<{ value: string }>();
  if (!seedFlag) {
    const trackCount = await db.prepare("SELECT COUNT(*) AS count FROM life_tracks").first<{ count: number }>();
    const entryCount = await db.prepare("SELECT COUNT(*) AS count FROM life_entries").first<{ count: number }>();
    if (!trackCount?.count) {
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("track-system", "建立自己的作品与生活系统", "让创作、工作和生活不再互相争夺，而是形成稳定节奏。", "为了更自由地选择时间和地点。", "完成第一版每周回顾模板", "2026-01-01", "2026-12-31", "active", 42, "#ff9c69", 1, now),
      db.prepare("INSERT INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("track-world", "带着作品去看世界", "用长期旅行和异地生活拓宽人生经验。", "世界观需要真实地踩在不同土地上。", "确定下一个三周生活城市", "2026-03-01", "2028-12-31", "active", 27, "#a6d8ff", 2, now),
      db.prepare("INSERT INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("track-body", "让身体成为可靠的同盟", "维持运动、睡眠和精神能量的底层系统。", "精力是所有人生计划的货币。", "连续四周记录睡眠与运动", "2026-06-01", "2027-06-01", "active", 18, "#f4d35e", 3, now),
    ]);
    }

    if (!entryCount?.count) {
      const now = new Date().toISOString();
      const insert = "INSERT INTO life_entries (id,title,occurred_at,location_name,latitude,longitude,category,status,mood,significance,summary,detail,lessons,people,tags,track_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
      await db.batch([
      db.prepare(insert).bind("entry-shanghai", "在上海重新定义下一段旅程", "2026-08-18T09:30:00.000Z", "中国 · 上海", 31.2304, 121.4737, "growth", "memory", 4, 5, "在梧桐树下写下新的年度主线。", "下午沿着苏州河走了很久，发现我真正想要的不是更多目标，而是更少、更长的主线。", "把计划变成节奏，比把生活变成清单更重要。", "自己", JSON.stringify(["城市漫步", "年度计划"]), "track-system", now),
      db.prepare(insert).bind("entry-nagano", "第一次独自看见雪山日出", "2025-11-02T21:15:00.000Z", "日本 · 长野", 36.6513, 138.181, "adventure", "memory", 5, 5, "天亮的时候，山谷安静得能听见呼吸。", "凌晨四点从小镇出发，天色从蓝黑变成金色。那一刻感觉世界没有要求我成为谁。", "独处不是抽离，是重新听见自己。", "自己", JSON.stringify(["日出", "徒步", "独旅"]), "track-world", now),
      db.prepare(insert).bind("entry-lisbon", "带着一个背包去海边工作", "2024-04-16T06:20:00.000Z", "葡萄牙 · 里斯本", 38.7223, -9.1393, "work", "memory", 4, 4, "第一次验证“工作可以不被一个地址定义”。", "住在阿尔法玛的小房间，早上写作，下午在海边开会。", "自由不只是移动，而是有能力在变化中保持秩序。", "合作伙伴", JSON.stringify(["远程工作", "海边"]), "track-world", now),
      db.prepare(insert).bind("entry-singapore", "第一次在海外分享自己的作品", "2023-09-21T11:00:00.000Z", "新加坡", 1.3521, 103.8198, "work", "memory", 5, 4, "在一个小型创作者聚会上讲自己的项目。", "紧张没有消失，但开始后我发现，真诚比完美更有说服力。", "先交付真实，再优化表达。", "五十位创作者", JSON.stringify(["分享", "作品"]), "track-system", now),
      db.prepare(insert).bind("entry-sydney", "给未来的自己写一封海边来信", "2022-12-31T13:45:00.000Z", "澳大利亚 · 悉尼", -33.8688, 151.2093, "reflection", "memory", 3, 4, "在跨年前写下三年后才能打开的信。", "没有给自己设定数字，只问了三个问题：你在保护什么？你在创造什么？你和谁一起？", "好的问题比匆忙的答案更长久。", "自己", JSON.stringify(["年度回顾", "写信"]), null, now),
      ]);
    }
    await db.prepare("INSERT INTO app_meta (key, value) VALUES ('seed_version', '1')").run();
  }

  const chapterSeedFlag = await db.prepare("SELECT value FROM app_meta WHERE key='chapter_seed_version'").first<{ value: string }>();
  if (!chapterSeedFlag) {
    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("chapter-study", "大学与毕业", "记录学习、毕业和身份转换时期。", "保留学生时代的重要变化。", "补充这一阶段的第一段经历", `${currentYear - 4}-09-01`, `${currentYear + 1}-06-30`, "active", 0, "#6fa8dc", 10, now),
      db.prepare("INSERT OR IGNORE INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("chapter-career", "职业起步与成长", "记录工作选择、能力积累和职业转折。", "看见自己如何建立长期能力。", "记录第一个职业节点", `${currentYear}-01-01`, `${currentYear + 5}-12-31`, "active", 0, "#f0a15f", 11, now),
      db.prepare("INSERT OR IGNORE INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("chapter-relationship", "重要关系", "记录影响自己的人、相遇、陪伴与告别。", "理解关系如何改变自己。", "写下一段重要相遇", `${currentYear - 2}-01-01`, `${currentYear + 10}-12-31`, "active", 0, "#b38adf", 12, now),
      db.prepare("INSERT OR IGNORE INTO life_tracks (id,title,description,why,next_step,start_date,end_date,status,progress,color,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind("chapter-migration", "城市迁徙与旅行", "记录居住城市、远行和对世界的探索。", "让地点与人生阶段彼此连接。", "补充一次改变自己的远行", `${currentYear - 2}-01-01`, `${currentYear + 10}-12-31`, "active", 0, "#63b8bd", 13, now),
      db.prepare("INSERT INTO app_meta (key,value) VALUES ('chapter_seed_version','1')"),
    ]);
  }

  await db.prepare("INSERT INTO app_meta (key,value) VALUES ('schema_version','8') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  await db.prepare("PRAGMA optimize").run();
  ready = true;
}
