export type SqlValue = string | number | null;
export type SqlStatement = { sql: string; params: SqlValue[] };
export interface OperationsStore {
  mode: "sqlite" | "d1";
  query<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<number>;
  batch(statements: SqlStatement[]): Promise<void>;
}
export type OperationsConfig = { secret: string; auth: { mode: "local"; passwordHash: string } | { mode: "platform"; userIds: string[] } };
