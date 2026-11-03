import { env } from "cloudflare:workers";
import type { OperationsConfig, OperationsStore, SqlValue } from "./contract";

export async function getOperationsStore(): Promise<OperationsStore> {
  if (!env.DB) throw new Error("Operations database is not configured");
  const db = env.DB;
  return {
    mode: "d1",
    async query<T>(sql: string, params: SqlValue[] = []) { return (await db.prepare(sql).bind(...params).all<T>()).results; },
    async run(sql, params = []) { return (await db.prepare(sql).bind(...params).run()).meta.changes; },
    async batch(statements) { await db.batch(statements.map(({ sql, params }) => db.prepare(sql).bind(...params))); },
  };
}
export async function getOperationsConfig(): Promise<OperationsConfig | null> {
  const settings = env as unknown as Record<string, unknown>;
  const secret = settings.MATHLAB_OPERATIONS_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return null;
  return { secret, auth: { mode: "platform", userIds: typeof settings.MATHLAB_ADMIN_USER_IDS === "string" ? settings.MATHLAB_ADMIN_USER_IDS.split(",").map((id) => id.trim()).filter(Boolean) : [] } };
}
