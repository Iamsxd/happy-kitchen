import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppDatabase, AppPreparedStatement, QueryResult } from "./types";

let sqlite: Database.Database | null = null;

function connection() {
  if (sqlite) return sqlite;
  const configuredPath = process.env.DATABASE_PATH;
  const databasePath = configuredPath ? resolve(/* turbopackIgnore: true */ configuredPath) : join(process.cwd(), "data", "happy-kitchen.db");
  mkdirSync(dirname(databasePath), { recursive: true });
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

class SqliteStatement implements AppPreparedStatement {
  constructor(private readonly sql: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]) {
    return new SqliteStatement(this.sql, values);
  }

  run(): Promise<QueryResult> {
    return Promise.resolve(this.executeRun());
  }

  all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const rows = connection().prepare(this.sql).all(...this.values) as T[];
    return Promise.resolve({ results: rows, success: true, meta: { changes: 0 } });
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = connection().prepare(this.sql).get(...this.values) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  executeRun(): QueryResult {
    const result = connection().prepare(this.sql).run(...this.values);
    return { results: [], success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid.toString() } };
  }
}

class SqliteDatabase implements AppDatabase {
  prepare(sql: string): AppPreparedStatement {
    return new SqliteStatement(sql);
  }

  async batch(statements: AppPreparedStatement[]) {
    const db = connection();
    db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteStatement)) throw new Error("Unsupported database statement");
        return statement.executeRun();
      });
      db.exec("COMMIT");
      return results;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export const env = { DB: new SqliteDatabase() };

export function getSqliteConnection() {
  return connection();
}
