import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("production migrations create a durable empty database with working entry/media relations", () => {
  const directory = mkdtempSync(join(tmpdir(), "life-atlas-migration-"));
  const file = join(directory, "test.sqlite");
  let db = new DatabaseSync(file);
  try {
    const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const migration of journal.entries) {
      db.exec(readFileSync(new URL(`../drizzle/${migration.tag}.sql`, import.meta.url), "utf8"));
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM life_entries").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM life_tracks").get().total, 0);
    db.prepare("INSERT INTO life_entries (id, title, occurred_at, location_name, latitude, longitude, raw_detail, emotion_tags, life_phase, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("test-owner.memory", "旅行测试", "2026-09-08", "测试地点", 0, 0, "一段原文", '["joy"]', "turning", "2026-09-08");
    db.prepare("INSERT INTO life_media (id, entry_id, object_key, file_name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("test-media", "test-owner.memory", "test-key", "test.txt", "text/plain", 10, "2026-09-08");
    db.close();
    db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys=ON");
    const entry = db.prepare("SELECT * FROM life_entries WHERE id=?").get("test-owner.memory");
    assert.equal(entry.raw_detail, "一段原文");
    assert.equal(entry.visibility, "private");
    assert.equal(entry.emotion_tags, '["joy"]');
    assert.ok(db.prepare("PRAGMA table_info(life_profiles)").all().some(column => column.name === "core_values"));
    assert.ok(db.prepare("PRAGMA table_info(life_goals)").all().some(column => column.name === "time_mode"));
    db.prepare("DELETE FROM life_entries WHERE id=?").run("test-owner.memory");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM life_media").get().total, 0);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
