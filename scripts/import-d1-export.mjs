import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve(process.argv[2] ?? "");
const databasePath = resolve(process.env.DATABASE_PATH ?? "/data/happy-kitchen.db");
const stagingPath = `${databasePath}.importing`;

if (!process.argv[2] || !existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
  throw new Error("Usage: node scripts/import-d1-export.mjs /data/d1-export.sql");
}
if (existsSync(databasePath)) {
  throw new Error(`Refusing to overwrite existing database: ${databasePath}`);
}
if (existsSync(stagingPath)) {
  throw new Error(`Remove or inspect the unfinished staging file first: ${stagingPath}`);
}

const sql = readFileSync(sourcePath, "utf8");
if (!sql.includes("auth_users") || !sql.includes("households")) {
  throw new Error("The input does not look like a Happy Kitchen D1 SQL export.");
}

mkdirSync(dirname(databasePath), { recursive: true });
const db = new Database(stagingPath);
try {
  db.pragma("foreign_keys = OFF");
  db.exec(sql);
  const users = db.prepare("SELECT COUNT(*) AS count FROM auth_users").get();
  db.close();
  renameSync(stagingPath, databasePath);
  console.log(`Imported ${Number(users.count)} account(s) into ${databasePath}`);
} catch (error) {
  db.close();
  throw error;
}
