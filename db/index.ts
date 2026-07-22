import { drizzle } from "drizzle-orm/better-sqlite3";
import { getSqliteConnection } from "./runtime";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getSqliteConnection(), { schema });
}
