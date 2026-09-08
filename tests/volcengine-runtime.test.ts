// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Readable } from "node:stream";
import { storageError } from "../runtime/tos-error";
import { SnapshotDatabase, WriteConflict, type SnapshotStore } from "../runtime/snapshot-database";
import { authConfigured, createSession, validPassword, validSession, SESSION_COOKIE } from "../runtime/private-session";

class MemoryStore implements SnapshotStore {
  bytes: Uint8Array | null = null;
  revision = 0;
  failCommit = false;
  async read() { return this.bytes ? { bytes: this.bytes.slice(), etag: String(this.revision) } : null; }
  async commit(bytes: Uint8Array, expected: string | null) {
    if (this.failCommit) throw new Error("storage unavailable");
    if (expected !== (this.bytes ? String(this.revision) : null)) throw new WriteConflict();
    this.bytes = bytes.slice(); this.revision++;
  }
}
const migrations = Object.fromEntries(readdirSync("drizzle").filter(name => name.endsWith(".sql")).map(name => [name, readFileSync(`drizzle/${name}`, "utf8")]));

it("recognizes streamed TOS missing-object errors without retaining signed requests", async () => {
  const error = await storageError({ statusCode: 404, data: Readable.from([JSON.stringify({ Code: "NoSuchKey" })]), request: { headers: { authorization: "sensitive-test-signature" } } });
  expect(error.code).toBe("NoSuchKey");
  expect(error.statusCode).toBe(404);
  expect(error).not.toHaveProperty("data");
  expect(error).not.toHaveProperty("request");
  expect((await storageError({ statusCode: 404, data: Buffer.from('{"Code":"NoSuchBucket"}') })).code).toBe("NoSuchBucket");
});

describe("durable personal database", () => {
  it("applies real migrations without demonstration records, persists across new instances", async () => {
    const store = new MemoryStore();
    const first = new SnapshotDatabase(store, migrations);
    expect(await first.prepare("SELECT COUNT(*) AS count FROM life_entries").first("count")).toBe(0);
    await first.prepare("INSERT INTO app_meta(key,value) VALUES (?,?)").bind("persistence-test", "saved").run();
    const second = new SnapshotDatabase(store, migrations);
    expect(await second.prepare("SELECT value FROM app_meta WHERE key=?").bind("persistence-test").first("value")).toBe("saved");
  });
  it("preserves concurrent changes from separate server instances", async () => {
    const store = new MemoryStore();
    const a = new SnapshotDatabase(store, migrations);
    const b = new SnapshotDatabase(store, migrations);
    await Promise.all([
      a.prepare("INSERT INTO app_meta(key,value) VALUES (?,?)").bind("device-a", "a").run(),
      b.prepare("INSERT INTO app_meta(key,value) VALUES (?,?)").bind("device-b", "b").run(),
    ]);
    expect((await a.prepare("SELECT key FROM app_meta WHERE key LIKE 'device-%'").all()).results).toHaveLength(2);
  });
  it("rolls back a failed batch and never reports a failed cloud commit as saved", async () => {
    const store = new MemoryStore();
    const db = new SnapshotDatabase(store, migrations);
    await db.prepare("SELECT COUNT(*) FROM app_meta").all();
    await expect(db.batch([
      db.prepare("INSERT INTO app_meta(key,value) VALUES ('rollback','x')"),
      db.prepare("INSERT INTO table_does_not_exist VALUES ('x')"),
    ])).rejects.toThrow();
    expect(await db.prepare("SELECT key FROM app_meta WHERE key='rollback'").first()).toBeNull();
    store.failCommit = true;
    await expect(db.prepare("INSERT INTO app_meta(key,value) VALUES ('fail','x')").run()).rejects.toThrow("storage unavailable");
    store.failCommit = false;
    expect(await db.prepare("SELECT key FROM app_meta WHERE key='fail'").first()).toBeNull();
  });
});

describe("private access", () => {
  afterEach(() => vi.unstubAllEnvs());
  function configure() {
    vi.stubEnv("LIFE_ATLAS_PASSWORD_HASH", createHash("sha256").update("a long random generated password").digest("hex"));
    vi.stubEnv("LIFE_ATLAS_SESSION_SECRET", "a".repeat(64));
  }
  it("fails closed when credentials are missing", () => {
    vi.stubEnv("LIFE_ATLAS_PASSWORD_HASH", "");
    vi.stubEnv("LIFE_ATLAS_SESSION_SECRET", "");
    expect(authConfigured()).toBe(false);
    expect(validPassword("")).toBe(false);
    expect(validSession(`${SESSION_COOKIE}=1234567890.forged`)).toBe(false);
  });
  it("rejects forged, expired and rotated sessions", () => {
    configure();
    const now = Date.now();
    const token = createSession(now);
    expect(validSession(`${SESSION_COOKIE}=${token}`, now)).toBe(true);
    expect(validSession(`${SESSION_COOKIE}=${token.slice(0, -3)}xxx`, now)).toBe(false);
    expect(validSession(`${SESSION_COOKIE}=${token}`, now + 31 * 86400_000)).toBe(false);
    vi.stubEnv("LIFE_ATLAS_SESSION_SECRET", "b".repeat(64));
    expect(validSession(`${SESSION_COOKIE}=${token}`, now)).toBe(false);
  });
  it("checks passwords without accepting a forged identity header as a session", () => {
    configure();
    expect(validPassword("a long random generated password")).toBe(true);
    expect(validPassword("wrong password")).toBe(false);
    expect(validSession("life_atlas_visitor=visitor_12345678-1234-1234-1234-123456789012")).toBe(false);
  });
});
