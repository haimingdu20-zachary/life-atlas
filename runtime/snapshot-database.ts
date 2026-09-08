import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
let sqlite: Promise<SqlJsStatic> | undefined;
export const MAX_DATABASE_BYTES = 16 * 1024 * 1024;

export class WriteConflict extends Error {}
export interface SnapshotStore {
  read(): Promise<{ bytes: Uint8Array; etag: string } | null>;
  commit(bytes: Uint8Array, etag: string | null): Promise<void>;
}

type Result = { results: Record<string, SqlValue>[]; success: true; meta: { changes: number; last_row_id: number } };

function query(database: Database, sql: string, values: SqlValue[]): Result {
  const statement = database.prepare(sql);
  try {
    statement.bind(values);
    const results = [];
    while (statement.step()) results.push(statement.getAsObject());
    const last = database.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0];
    return { results, success: true, meta: { changes: database.getRowsModified(), last_row_id: Number(last || 0) } };
  } finally { statement.free(); }
}

export class SnapshotDatabase {
  constructor(private store: SnapshotStore, private migrations: Record<string, string>) {}

  prepare(sql: string) { return new Statement(this, sql); }

  async batch(statements: Statement[]) {
    if (statements.some(statement => statement.database !== this)) throw new Error("Statements belong to different databases");
    return this.execute(statements);
  }

  async execute(statements: Statement[]) {
    // The external Node package resolves WASM relative to its deployed module.
    // Build tools may rewrite import.meta.url to the original source path.
    sqlite ??= initSqlJs(process.env.SQLJS_WASM_PATH ? { locateFile: () => process.env.SQLJS_WASM_PATH! } : {});
    const SQL = await sqlite;
    for (let attempt = 0; attempt < 6; attempt++) {
      const previous = await this.store.read();
      if (previous && previous.bytes.byteLength > MAX_DATABASE_BYTES) throw new Error("Database exceeds personal deployment size limit");
      const db = new SQL.Database(previous?.bytes);
      try {
        db.exec("PRAGMA foreign_keys=ON");
        db.exec("BEGIN");
        db.exec("CREATE TABLE IF NOT EXISTS __atlas_migrations (name TEXT PRIMARY KEY)");
        const applied = new Set(query(db, "SELECT name FROM __atlas_migrations", []).results.map(row => row.name));
        let dirty = !previous;
        for (const [name, sql] of Object.entries(this.migrations).sort(([a], [b]) => a.localeCompare(b))) {
          if (applied.has(name)) continue;
          db.exec(sql);
          query(db, "INSERT INTO __atlas_migrations(name) VALUES (?)", [name]);
          dirty = true;
        }
        const results = statements.map(statement => {
          if (!/^\s*SELECT\b/i.test(statement.sql)) dirty = true;
          return query(db, statement.sql, statement.values);
        });
        db.exec("COMMIT");
        if (dirty) {
          const bytes = db.export();
          if (bytes.byteLength > MAX_DATABASE_BYTES) throw new Error("Database size limit reached; export or migrate before adding more records");
          try { await this.store.commit(bytes, previous?.etag || null); }
          catch (cause) {
            if (!(cause instanceof WriteConflict) || attempt === 5) throw cause;
            await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
            continue;
          }
        }
        return results;
      } finally { db.close(); }
    }
    throw new WriteConflict("Multiple devices are saving; please retry");
  }
}

class Statement {
  constructor(readonly database: SnapshotDatabase, readonly sql: string, readonly values: SqlValue[] = []) {}
  bind(...values: SqlValue[]) { return new Statement(this.database, this.sql, values); }
  async all() { return (await this.database.execute([this]))[0]; }
  async run() { return this.all(); }
  async first(column?: string) {
    const row = (await this.all()).results[0];
    return row ? column ? row[column] : row : null;
  }
}
