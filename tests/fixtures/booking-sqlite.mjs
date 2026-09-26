import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Execute the actual storage SQL. batch models D1's ordered transaction; this
// fixture does not claim to reproduce remote D1 replication or scheduling.
export function createBookingSqliteFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "website-crm-retry-"));
  const filename = path.join(directory, "booking.sqlite");
  let sqlite = new DatabaseSync(filename);
  const root = new URL("../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("config/booking/migration-manifest.json", root)));
  for (const entry of manifest.migrations) {
    sqlite.exec(readFileSync(new URL(`migrations/${entry.filename}`, root), "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  const prepare = (sql, values = []) => {
    const statement = () => sqlite.prepare(sql);
    const run = () => {
      const result = statement().run(...values);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    };
    return {
      bind(...params) { return prepare(sql, params); },
      async first() { return statement().get(...values) || null; },
      async all() { return { results: statement().all(...values), success: true }; },
      async run() { return run(); },
      runInBatch: run
    };
  };
  const db = {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.runInBatch());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
  t.after(() => { sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    db,
    get sqlite() { return sqlite; },
    reopen() {
      sqlite.close();
      sqlite = new DatabaseSync(filename);
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  };
}
