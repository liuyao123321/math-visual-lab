import { getOperationsConfig, getOperationsStore } from "@operations-store";
import type { OperationsConfig, OperationsStore, SqlValue } from "./contract";
import { adminCookie, authorized, cookieValue, opaqueId, readCookie, readToken, signedToken, verifyPassword, visitorCookie } from "./auth";
import { eventSchema, feedbackSchema, feedbackStatuses, feedbackUpdateSchema, type Feedback, type Stats } from "./schema";

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new HttpError(403, "请从本站页面提交。");
}
async function body(request: Request, limit = 20000) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "请提交 JSON 数据。");
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "提交内容过长。");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "提交内容为空。");
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > limit) { await reader.cancel(); throw new HttpError(413, "提交内容过长。"); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, "提交内容格式不正确。"); }
}
async function configOrThrow() {
  const config = await getOperationsConfig();
  if (!config) throw new HttpError(503, "统计与反馈服务尚未配置，请联系维护者完成初始化。");
  return config;
}
async function requireAdmin(request: Request, config: OperationsConfig) {
  if (!await authorized(request, config)) throw new HttpError(401, "请先登录开发者后台。");
}
async function visitor(request: Request, config: OperationsConfig, now: number) {
  const previous = await readToken(readCookie(request, visitorCookie), "visitor", config.secret, now);
  if (previous && uuid.test(previous)) return { id: previous, cookie: null };
  const id = crypto.randomUUID();
  return { id, cookie: cookieValue(visitorCookie, await signedToken({ kind: "visitor", id, exp: now + 90 * 86400000 }, config.secret), 90 * 86400, request) };
}
async function limit(store: OperationsStore, key: string, max: number, windowMs: number, now: number) {
  const rows = await store.query<{ count: number }>(`INSERT INTO operations_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE MIN(count+1,?) END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`, [key, now + windowMs, now, max + 1, now]);
  if (rows[0].count > max) throw new HttpError(429, "操作过于频繁，请稍后重试。");
}
async function sourceKey(request: Request, config: OperationsConfig, store: OperationsStore) {
  // Only the Workers adapter trusts the platform's source header. Raw addresses are never saved.
  return opaqueId(store.mode === "d1" ? request.headers.get("cf-connecting-ip") || "unknown" : "local", config.secret);
}
function seenVisitor(id: string, now: number, table: "operations_events" | "operations_requests", recordId: string) {
  return { sql: `INSERT INTO operations_visitors(id,first_seen,last_seen) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id=?) ON CONFLICT(id) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)`, params: [id, now, now, recordId] };
}
export type RequestTelemetry = { action?: string; ragAttempted?: boolean; rag?: { status: string; retrievalMode: string }; startedAt: number };
export async function recordRequest(request: Request, response: Response, info: RequestTelemetry) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([recordRequestInternal(request, response, info), new Promise<void>((resolve) => { timer = setTimeout(resolve, 800); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function recordRequestInternal(request: Request, response: Response, info: RequestTelemetry) {
  // Existing API clients and malformed requests keep their old behavior. Metrics are best effort.
  if (request.headers.get("x-mathlab-usage") !== "1" || !info.action) return;
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return;
    const config = await getOperationsConfig(); if (!config) return;
    const store = await getOperationsStore(); const now = Date.now(); const person = await visitor(request, config, now);
    const candidate = request.headers.get("x-mathlab-request-id"); const id = candidate && uuid.test(candidate) ? candidate : crypto.randomUUID();
    await store.batch([
      seenVisitor(person.id, now, "operations_requests", id),
      { sql: "INSERT OR IGNORE INTO operations_requests(id,visitor_id,action,status,created_at,duration_ms,rag_attempted,rag_matched,retrieval_mode) VALUES (?,?,?,?,?,?,?,?,?)", params: [id, person.id, info.action, response.status, info.startedAt, Math.max(0, now - info.startedAt), info.ragAttempted || info.rag ? 1 : 0, info.rag?.status === "matched" ? 1 : 0, info.rag?.retrievalMode ?? "none"] },
    ]);
    if (person.cookie) response.headers.append("Set-Cookie", person.cookie);
  } catch { /* A metrics failure must never replace a tutoring response. */ }
}

type FeedbackRow = { id: string; category: Feedback["category"]; title: string; description: string; steps: string; contact: string; page: Feedback["page"]; status: Feedback["status"]; note: string; version: number; created_at: number; updated_at: number; request_hash: string };
const publicFeedback = (row: FeedbackRow): Feedback => ({ id: row.id, category: row.category, title: row.title, description: row.description, steps: row.steps, contact: row.contact, page: row.page, status: row.status, note: row.note, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });

export async function handleOperations(request: Request, task: "session" | "events" | "feedback" | "feedback-list" | "feedback-update" | "stats", id?: string): Promise<Response> {
  try {
    const now = Date.now();
    if (task === "session" && request.method === "GET") {
      const config = await getOperationsConfig();
      return json({ configured: !!config && (config.auth.mode === "local" || config.auth.userIds.length > 0), mode: config?.auth.mode ?? "local", authenticated: !!config && await authorized(request, config, now) });
    }
    if (request.method !== "GET") sameOrigin(request);
    const config = await configOrThrow();
    if (task === "session" && request.method === "DELETE") {
      const response = json({ ok: true }); response.headers.set("Set-Cookie", cookieValue(adminCookie, "", 0, request)); return response;
    }
    if (["stats", "feedback-list", "feedback-update"].includes(task)) await requireAdmin(request, config);
    const store = await getOperationsStore();
    if (task === "session" && request.method === "POST") {
      if (config.auth.mode !== "local") throw new HttpError(403, "请通过网站登录入口验证开发者身份。");
      await limit(store, "login:" + await sourceKey(request, config, store), 10, 15 * 60000, now);
      const value = await body(request, 2048) as { password?: unknown };
      if (typeof value?.password !== "string" || !await verifyPassword(value.password, config.auth.passwordHash)) throw new HttpError(401, "开发者密码不正确。");
      const response = json({ authenticated: true });
      response.headers.set("Set-Cookie", cookieValue(adminCookie, await signedToken({ kind: "admin", id: "admin", exp: now + 8 * 3600000 }, config.secret), 8 * 3600, request));
      return response;
    }
    if (task === "events") {
      const parsed = eventSchema.safeParse(await body(request, 1024));
      if (!parsed.success) throw new HttpError(400, "统计事件不符合约定。");
      const person = await visitor(request, config, now);
      await limit(store, "events:" + person.id, 180, 60000, now);
      await limit(store, "event-source:" + await sourceKey(request, config, store), 5000, 3600000, now);
      const event = parsed.data;
      await store.batch([seenVisitor(person.id, now, "operations_events", event.id), { sql: "INSERT OR IGNORE INTO operations_events(id,visitor_id,kind,path,created_at) VALUES (?,?,?,?,?)", params: [event.id, person.id, event.kind, event.path, now] }]);
      const response = json({ accepted: true }); if (person.cookie) response.headers.set("Set-Cookie", person.cookie); return response;
    }
    if (task === "feedback") {
      const parsed = feedbackSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, "请填写4至100字标题、10至4000字问题描述，并检查其他字段长度。");
      const input = parsed.data;
      const hash = await opaqueId(JSON.stringify(input), config.secret);
      const [existing] = await store.query<{ id: string; request_hash: string }>("SELECT id,request_hash FROM operations_feedback WHERE submission_id=?", [input.submissionId]);
      if (existing) {
        if (existing.request_hash !== hash) throw new HttpError(409, "此提交编号已使用，请重新提交。");
        return json({ id: existing.id, message: "反馈已收到，请勿重复提交。" });
      }
      const person = await visitor(request, config, now);
      await limit(store, "feedback:" + person.id, 5, 3600000, now);
      await limit(store, "feedback-source:" + await sourceKey(request, config, store), 30, 3600000, now);
      const receipt = "FDB-" + crypto.randomUUID();
      await store.run("INSERT OR IGNORE INTO operations_feedback(id,submission_id,request_hash,category,title,description,steps,contact,page,status,note,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'new','',1,?,?)", [receipt, input.submissionId, hash, input.category, input.title, input.description, input.steps, input.contact, input.page, now, now]);
      const [saved] = await store.query<{ id: string; request_hash: string }>("SELECT id,request_hash FROM operations_feedback WHERE submission_id=?", [input.submissionId]);
      if (saved.request_hash !== hash) throw new HttpError(409, "此提交编号已使用，请重新提交。");
      const response = json({ id: saved.id, message: "反馈已提交，感谢你帮助改进知数实验室。" }, 201);
      if (person.cookie) response.headers.set("Set-Cookie", person.cookie); return response;
    }
    if (task === "feedback-list") {
      const url = new URL(request.url); const status = url.searchParams.get("status") ?? "all";
      if (status !== "all" && !Object.hasOwn(feedbackStatuses, status)) throw new HttpError(400, "未知处理状态。");
      const page = Number(url.searchParams.get("page") ?? "1");
      if (!Number.isInteger(page) || page < 1 || page > 10000) throw new HttpError(400, "页码不正确。");
      const where = status === "all" ? "" : " WHERE status=?"; const params: SqlValue[] = status === "all" ? [] : [status];
      const [total] = await store.query<{ count: number }>("SELECT COUNT(*) AS count FROM operations_feedback" + where, params);
      const rows = await store.query<FeedbackRow>("SELECT * FROM operations_feedback" + where + " ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?", [...params, (page - 1) * 20]);
      return json({ data: rows.map(publicFeedback), total: total.count, page, pageSize: 20 });
    }
    if (task === "feedback-update") {
      if (!id || !/^FDB-[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "反馈编号不正确。");
      const parsed = feedbackUpdateSchema.safeParse(await body(request, 8192));
      if (!parsed.success) throw new HttpError(400, "请检查处理状态和备注。");
      const changed = await store.run("UPDATE operations_feedback SET status=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=?", [parsed.data.status, parsed.data.note, now, id, parsed.data.version]);
      const [row] = await store.query<FeedbackRow>("SELECT * FROM operations_feedback WHERE id=?", [id]);
      if (!row) throw new HttpError(404, "反馈不存在。");
      if (!changed) throw new HttpError(409, "反馈已被其他窗口更新，请刷新后再处理。");
      return json({ data: publicFeedback(row) });
    }
    if (task === "stats") {
      const days = Number(new URL(request.url).searchParams.get("days") ?? "7");
      if (![1, 7, 30].includes(days)) throw new HttpError(400, "请选择今天、近7天或近30天。");
      return json({ data: await readStats(store, days, now), storage: store.mode });
    }
    throw new HttpError(405, "不支持此操作。");
  } catch (error) {
    return json({ message: error instanceof HttpError ? error.message : "服务暂不可用，内容未确认保存，请稍后重试。" }, error instanceof HttpError ? error.status : 503);
  }
}

export async function readStats(store: OperationsStore, days: number, now = Date.now()): Promise<Stats> {
  const dayMs = 86400000, offset = 8 * 3600000;
  const today = Math.floor((now + offset) / dayMs) * dayMs - offset;
  const start = today - (days - 1) * dayMs, end = today + dayMs;
  const day = (time: number) => new Date(time + offset).toISOString().slice(0, 10);
  const [event] = await store.query<{ pv: number; uv: number }>("SELECT COUNT(*) AS pv,COUNT(DISTINCT visitor_id) AS uv FROM operations_events WHERE kind='page_view' AND created_at>=? AND created_at<?", [start, end]);
  const [newVisitors] = await store.query<{ count: number }>("SELECT COUNT(*) AS count FROM operations_visitors WHERE first_seen>=? AND first_seen<?", [start, end]);
  const [active] = await store.query<{ count: number }>("SELECT COUNT(DISTINCT visitor_id) AS count FROM (SELECT visitor_id FROM operations_events WHERE kind<>'page_view' AND created_at>=? AND created_at<? UNION ALL SELECT visitor_id FROM operations_requests WHERE created_at>=? AND created_at<?)", [start, end, start, end]);
  const [ai] = await store.query<{ total: number; success: number | null; average: number | null; solve: number | null }>("SELECT COUNT(*) AS total,SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success,AVG(duration_ms) AS average,SUM(CASE WHEN action IN ('solve','photo-tutor') THEN 1 ELSE 0 END) AS solve FROM operations_requests WHERE action<>'knowledge-search' AND created_at>=? AND created_at<?", [start, end]);
  const [rag] = await store.query<{ total: number; matched: number | null }>("SELECT COUNT(*) AS total,SUM(rag_matched) AS matched FROM operations_requests WHERE rag_attempted=1 AND created_at>=? AND created_at<?", [start, end]);
  const [pending] = await store.query<{ count: number }>("SELECT COUNT(*) AS count FROM operations_feedback WHERE status IN ('new','in_progress')");
  const rows = await store.query<{ date: string; pv: number; uv: number }>("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+8 hours') AS date,COUNT(*) AS pv,COUNT(DISTINCT visitor_id) AS uv FROM operations_events WHERE kind='page_view' AND created_at>=? AND created_at<? GROUP BY date ORDER BY date", [start, end]);
  const local = await store.query<{ name: string; count: number }>("SELECT kind AS name,COUNT(*) AS count FROM operations_events WHERE kind<>'page_view' AND created_at>=? AND created_at<? GROUP BY kind", [start, end]);
  const api = await store.query<{ name: string; count: number }>("SELECT action AS name,COUNT(*) AS count FROM operations_requests WHERE created_at>=? AND created_at<? GROUP BY action", [start, end]);
  const failures = await store.query<{ status: number; count: number }>("SELECT status,COUNT(*) AS count FROM operations_requests WHERE status>=400 AND action<>'knowledge-search' AND created_at>=? AND created_at<? GROUP BY status ORDER BY count DESC", [start, end]);
  return { days, start: day(start), end: day(today), pv: event.pv, uv: event.uv, newVisitors: newVisitors.count, activeVisitors: active.count, aiRequests: ai.total, aiSuccess: ai.success ?? 0, aiAverageMs: ai.average === null ? null : Math.round(ai.average), solveRequests: ai.solve ?? 0, ragRequests: rag.total, ragMatches: rag.matched ?? 0, pendingFeedback: pending.count,
    daily: Array.from({ length: days }, (_, index) => { const date = day(start + index * dayMs); return rows.find((row) => row.date === date) ?? { date, pv: 0, uv: 0 }; }), features: [...local, ...api].sort((a, b) => b.count - a.count), failures };
}
