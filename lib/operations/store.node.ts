import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OperationsConfig, OperationsStore, SqlStatement, SqlValue } from "./contract";

export function createSqliteStore(filename: string): OperationsStore & { close(): void } {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=500; PRAGMA foreign_keys=ON;");
  db.exec("CREATE TABLE IF NOT EXISTS operations_migrations (tag TEXT PRIMARY KEY)");
  const journal = JSON.parse(readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
  for (const { tag } of journal.entries) {
    if (db.prepare("SELECT tag FROM operations_migrations WHERE tag=?").get(tag)) continue;
    const sql = readFileSync(resolve(process.cwd(), "drizzle", `${tag}.sql`), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(sql); db.prepare("INSERT INTO operations_migrations(tag) VALUES (?)").run(tag); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  return {
    mode: "sqlite", close: () => db.close(),
    async query<T>(sql: string, params: SqlValue[] = []) { return db.prepare(sql).all(...params) as T[]; },
    async run(sql: string, params: SqlValue[] = []) { return Number(db.prepare(sql).run(...params).changes); },
    async batch(statements: SqlStatement[]) {
      db.exec("BEGIN IMMEDIATE");
      try { for (const statement of statements) db.prepare(statement.sql).run(...statement.params); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
let store: ReturnType<typeof createSqliteStore> | undefined;
export async function getOperationsStore(): Promise<OperationsStore> {
  store ??= createSqliteStore(resolve(process.cwd(), ".local-server/operations.sqlite"));
  return store;
}
export async function getOperationsConfig(): Promise<OperationsConfig | null> {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(readFileSync(resolve(process.cwd(), ".local-server/operations-admin.json"), "utf8")); } catch { /* An environment configuration can also be used. */ }
    const passwordHash = process.env.MATHLAB_ADMIN_PASSWORD_HASH || config.passwordHash;
    const secret = process.env.MATHLAB_OPERATIONS_SECRET || config.secret;
    return typeof passwordHash === "string" && typeof secret === "string" && secret.length >= 32
      ? { secret, auth: { mode: "local", passwordHash } } : null;
}
