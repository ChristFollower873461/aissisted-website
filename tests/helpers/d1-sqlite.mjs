import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

function preparedStatement(database, sql, values = []) {
  return {
    bind(...nextValues) {
      return preparedStatement(database, sql, nextValues);
    },
    async first() {
      return database.prepare(sql).get(...values) || null;
    },
    async run() {
      const result = database.prepare(sql).run(...values);
      return {
        success: true,
        meta: {
          changes: Number(result.changes || 0),
          last_row_id: Number(result.lastInsertRowid || 0)
        }
      };
    },
    async all() {
      return {
        success: true,
        results: database.prepare(sql).all(...values)
      };
    }
  };
}

export function createTestD1(...migrationPaths) {
  const database = new DatabaseSync(":memory:");
  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"));
  }
  return {
    binding: {
      prepare(sql) {
        return preparedStatement(database, sql);
      }
    },
    database,
    close() {
      database.close();
    }
  };
}
