// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pbkdf2Sync } from "node:crypto";
import type { OperationsConfig, OperationsStore } from "./contract";
import { createSqliteStore } from "./store.node";
import { handleOperations, readStats, recordRequest } from "./service";
import { authorized, readToken, signedToken, verifyPassword } from "./auth";

const state = vi.hoisted(() => ({ store: null as OperationsStore | null, config: null as OperationsConfig | null }));
vi.mock("@operations-store", async (original) => ({ ...await original<typeof import("./store.node")>(), getOperationsStore: async () => { if (!state.store) throw new Error("offline"); return state.store; }, getOperationsConfig: async () => state.config }));
const salt = Buffer.alloc(16, 7);
const password = "fictional-test-password";
const passwordHash = `pbkdf2$210000$${salt.toString("base64url")}$${pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url")}`;
const config: OperationsConfig = { secret: "fictional-test-signing-secret-01234567890123456789", auth: { mode: "local", passwordHash } };
let db: ReturnType<typeof createSqliteStore>;
const request = (path: string, method = "GET", data?: unknown, cookie?: string) => new Request("http://math.test" + path, { method, headers: { origin: "http://math.test", "content-type": "application/json", ...(cookie ? { cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
const input = () => ({ submissionId: crypto.randomUUID(), category: "bug", title: "测试图像显示异常", description: "这是独立虚构测试反馈，没有包含真实题目或个人联系方式。", steps: "打开示例，然后移动滑块。", contact: "", page: "/solve" });
async function admin() { return "mathlab_admin=" + await signedToken({ kind: "admin", id: "admin", exp: Date.now() + 3600000 }, config.secret); }
beforeEach(() => { db = createSqliteStore(":memory:"); state.store = db; state.config = config; });
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe("operations authentication and data boundaries", () => {
  it("requires authorization before reading any private data, even if storage is offline", async () => {
    state.store = null;
    expect((await handleOperations(request("/api/developer/stats"), "stats")).status).toBe(401);
    expect((await handleOperations(request("/api/developer/feedback"), "feedback-list")).status).toBe(401);
  });
  it("logs in with a hash-backed password and issues a private expiring cookie", async () => {
    expect(await verifyPassword("wrong", passwordHash)).toBe(false);
    const result = await handleOperations(request("/api/operations/session", "POST", { password }), "session");
    expect(result.status).toBe(200); expect(result.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(await result.text()).not.toContain(password);
    expect(await authorized(request("/", "GET", undefined, cookieOf(result)), config)).toBe(true);
  });
  it("rejects tampered/expired sessions and forged platform identity in local mode", async () => {
    const token = await signedToken({ kind: "admin", id: "admin", exp: 10 }, config.secret);
    expect(await readToken(token, "admin", config.secret, 11)).toBeNull();
    expect(await readToken(token + "bad", "admin", config.secret, 0)).toBeNull();
    expect(await authorized(new Request("http://math.test", { headers: { "oai-authenticated-user-id": "owner" } }), config)).toBe(false);
    const platform: OperationsConfig = { secret: config.secret, auth: { mode: "platform", userIds: ["allowed-owner"] } };
    expect(await authorized(new Request("http://math.test", { headers: { "oai-authenticated-user-id": "other-user" } }), platform)).toBe(false);
  });
  it("rejects cross-origin writes and excessive login attempts", async () => {
    const cross = new Request("http://math.test/api/feedback", { method: "POST", headers: { origin: "https://other.test", "content-type": "application/json" }, body: JSON.stringify(input()) });
    expect((await handleOperations(cross, "feedback")).status).toBe(403);
    for (let i = 0; i < 10; i++) expect((await handleOperations(request("/api/operations/session", "POST", { password: "wrong" }), "session")).status).toBe(401);
    expect((await handleOperations(request("/api/operations/session", "POST", { password }), "session")).status).toBe(429);
  });
  it("fails explicitly when unconfigured or unavailable without returning fake success", async () => {
    state.config = null;
    expect((await handleOperations(request("/api/feedback", "POST", input()), "feedback")).status).toBe(503);
    state.config = config; state.store = null;
    expect((await handleOperations(request("/api/feedback", "POST", input()), "feedback")).status).toBe(503);
  });
  it("refuses oversized or undocumented fields", async () => {
    const oversize = { ...input(), description: "字".repeat(10000) };
    expect((await handleOperations(request("/api/feedback", "POST", oversize), "feedback")).status).toBe(413);
    expect((await handleOperations(request("/api/feedback", "POST", { ...input(), apiKey: "never-store-me" }), "feedback")).status).toBe(400);
    expect((await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM operations_feedback"))[0].count).toBe(0);
  });
});

describe("persisted feedback workflow", () => {
  it("deduplicates retries, rejects a reused ID with changed content, and restricts listing", async () => {
    const data = input();
    const first = await handleOperations(request("/api/feedback", "POST", data), "feedback");
    const receipt = await first.json() as { id: string };
    expect(first.status).toBe(201);
    const retry = await handleOperations(request("/api/feedback", "POST", data), "feedback");
    expect((await retry.json() as { id: string }).id).toBe(receipt.id);
    expect((await handleOperations(request("/api/feedback", "POST", { ...data, title: "变更过的标题" }), "feedback")).status).toBe(409);
    expect((await handleOperations(request("/api/developer/feedback"), "feedback-list")).status).toBe(401);
    const list = await handleOperations(request("/api/developer/feedback", "GET", undefined, await admin()), "feedback-list");
    const result = await list.json() as { total: number; data: Array<{ request_hash?: string }> };
    expect(result.total).toBe(1); expect(result.data[0].request_hash).toBeUndefined();
  });
  it("supports state changes with concurrency protection and filters", async () => {
    const created = await handleOperations(request("/api/feedback", "POST", input()), "feedback");
    const { id } = await created.json() as { id: string }; const session = await admin();
    const update = { status: "resolved", note: "这是测试处理备注。", version: 1 };
    expect((await handleOperations(request("/api/developer/feedback/" + id, "PATCH", update, session), "feedback-update", id)).status).toBe(200);
    expect((await handleOperations(request("/api/developer/feedback/" + id, "PATCH", update, session), "feedback-update", id)).status).toBe(409);
    const filtered = await handleOperations(request("/api/developer/feedback?status=new", "GET", undefined, session), "feedback-list");
    expect((await filtered.json() as { total: number }).total).toBe(0);
  });
  it("enforces submission limits while allowing safe retries", async () => {
    let cookie: string | undefined; let previous: ReturnType<typeof input>;
    for (let i = 0; i < 5; i++) { previous = input(); const response = await handleOperations(request("/api/feedback", "POST", previous, cookie), "feedback"); expect(response.status).toBe(201); cookie ||= cookieOf(response); }
    expect((await handleOperations(request("/api/feedback", "POST", previous!, cookie), "feedback")).status).toBe(200);
    expect((await handleOperations(request("/api/feedback", "POST", input(), cookie), "feedback")).status).toBe(429);
  });
});

describe("honest, deduplicated usage statistics", () => {
  it("counts page views once per event and visitors once per signed browser ID", async () => {
    const event = { id: crypto.randomUUID(), kind: "page_view", path: "/solve" };
    const first = await handleOperations(request("/api/operations/events", "POST", event), "events");
    expect(first.status).toBe(200); const session = cookieOf(first);
    await handleOperations(request("/api/operations/events", "POST", event, session), "events");
    await handleOperations(request("/api/operations/events", "POST", { ...event, id: crypto.randomUUID() }, session), "events");
    const stats = await readStats(db, 7); expect(stats.pv).toBe(2); expect(stats.uv).toBe(1); expect(stats.newVisitors).toBe(1);
    expect((await handleOperations(request("/api/operations/events", "POST", { ...event, path: "/developer" }), "events")).status).toBe(400);
  });
  it("records only request metadata and survives a metrics outage", async () => {
    const req = new Request("http://math.test/api/tutor", { headers: { "x-mathlab-usage": "1", "x-mathlab-request-id": crypto.randomUUID() } });
    const response = Response.json({ data: { privateQuestion: "not-stored" } });
    await recordRequest(req, response, { action: "solve", startedAt: Date.now() - 500, ragAttempted: true, rag: { status: "matched", retrievalMode: "hybrid" } });
    await recordRequest(req, response, { action: "solve", startedAt: Date.now() - 500 });
    const stats = await readStats(db, 7); expect(stats.aiRequests).toBe(1); expect(stats.aiSuccess).toBe(1); expect(stats.ragMatches).toBe(1);
    const rows = await db.query("SELECT * FROM operations_requests"); expect(JSON.stringify(rows)).not.toContain("not-stored");
    state.store = null;
    await expect(recordRequest(req, response, { action: "solve", startedAt: Date.now() })).resolves.toBeUndefined();
    expect(response.status).toBe(200);
  });
  it("buckets days by Shanghai time and excludes records outside the selected range", async () => {
    const now = Date.parse("2026-10-27T00:30:00+08:00");
    await db.batch([{ sql: "INSERT INTO operations_visitors VALUES (?,?,?)", params: ["a", now - 3600000, now] }, { sql: "INSERT INTO operations_events VALUES (?,?,?,?,?)", params: ["before", "a", "page_view", "/", now - 3600000] }, { sql: "INSERT INTO operations_events VALUES (?,?,?,?,?)", params: ["today", "a", "page_view", "/", now] }]);
    const stats = await readStats(db, 1, now); expect(stats.start).toBe("2026-10-27"); expect(stats.pv).toBe(1); expect(stats.daily).toEqual([{ date: "2026-10-27", pv: 1, uv: 1 }]);
  });
});
