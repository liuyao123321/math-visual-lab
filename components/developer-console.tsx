"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { feedbackCategories, feedbackStatuses, type Feedback, type FeedbackStatus, type Stats } from "@/lib/operations/schema";

type Session = { configured: boolean; authenticated: boolean; mode: "local" | "platform" };
type FeedbackList = { data: Feedback[]; total: number; page: number; pageSize: number };
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" }); const data = await response.json() as { message?: string };
  if (!response.ok) throw new ApiError(data.message || "请求失败，请稍后重试。", response.status);
  return data as T;
}
const dateTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(value);
const featureLabels: Record<string, string> = { mistake_saved: "收藏错题", practice_submitted: "提交专项模拟", solve: "文字解题", "photo-tutor": "图片答疑", "knowledge-search": "课程知识检索", "explain-step": "专属步骤讲解", "similar-practice": "相似练习", "generate-check": "生成理解检查", "evaluate-answer": "评价回答", "generate-paper": "生成模拟卷", "analyze-material": "整理资料", "multi-method": "一题多解", "recognize-work": "识别手写过程", "evaluate-work": "检查手写过程", "work-hint": "过程提示" };

function Statistics({ data }: { data: Stats }) {
  const cards = [
    ["独立访客 UV", String(data.uv), "按匿名浏览器标识去重"], ["页面浏览量 PV", String(data.pv), "页面打开与导航次数"],
    ["新增访客", String(data.newVisitors), "首次产生统计记录的浏览器"], ["活跃访客", String(data.activeVisitors), "使用过学习功能的匿名访客"],
    ["解题请求", String(data.solveRequests), "文字解题与图片答疑"], ["AI 请求完成率", data.aiRequests ? `${Math.round(data.aiSuccess / data.aiRequests * 100)}%` : "—", `${data.aiSuccess} / ${data.aiRequests} 个 AI 业务请求`],
    ["AI 平均响应", data.aiAverageMs === null ? "—" : `${(data.aiAverageMs / 1000).toFixed(1)} 秒`, "包含题意核对和服务端处理"], ["待处理反馈", String(data.pendingFeedback), "全站待处理与处理中反馈"],
  ];
  const maximum = Math.max(1, ...data.daily.map((point) => point.pv));
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, note]) => <article key={label} className="laboratory-panel p-5"><h2 className="text-sm text-muted-foreground">{label}</h2><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p></article>)}</div>
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
      <section className="laboratory-panel min-w-0 p-5 sm:p-6"><h2 className="text-lg font-semibold">访问趋势</h2><p className="mt-1 text-sm text-muted-foreground">{data.start} 至 {data.end} · 北京时间</p>
        {data.pv === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">该时间范围尚无页面访问记录。数据从启用统计后开始累计。</p> : <svg viewBox="0 0 640 230" className="mt-6 w-full" role="img" aria-label="每日页面浏览量柱状图">{data.daily.map((point, index) => { const width = 600 / data.daily.length; const height = point.pv / maximum * 165; const x = 20 + index * width; return <g key={point.date}><title>{point.date}：PV {point.pv}，UV {point.uv}</title><rect x={x + width * .15} y={185 - height} width={width * .7} height={point.pv ? Math.max(2, height) : 0} rx="3" fill="var(--primary)" />{(index % Math.max(1, Math.ceil(data.days / 7)) === 0 || index === data.days - 1) && <text x={x + width / 2} y="212" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">{point.date.slice(5)}</text>}</g>; })}</svg>}
        <details className="mt-4 text-sm"><summary className="cursor-pointer text-primary">查看每日数值</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">每日访问数据</caption><thead><tr><th className="py-2">日期</th><th>PV</th><th>UV</th></tr></thead><tbody>{data.daily.map((point) => <tr key={point.date}><td className="py-2">{point.date}</td><td>{point.pv}</td><td>{point.uv}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="laboratory-panel p-5 sm:p-6"><h2 className="text-lg font-semibold">功能使用</h2>{data.features.length ? <ul className="mt-5 space-y-4">{data.features.map((feature) => <li key={feature.name} className="flex justify-between gap-4 text-sm"><span>{featureLabels[feature.name] ?? feature.name}</span><strong className="tabular-nums">{feature.count}</strong></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">暂无功能使用记录。</p>}<div className="mt-7 border-t pt-5"><h3 className="font-medium">RAG 资料匹配</h3><p className="mt-2 text-sm">{data.ragMatches} / {data.ragRequests} 次检索找到资料</p><p className="mt-2 text-xs leading-5 text-muted-foreground">包括课程检索和解题中的知识辅助。匹配到资料不代表答案正确；AI 完成率也不是数学正确率。</p></div>{data.failures.length > 0 && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-medium">AI 请求失败分类</h3>{data.failures.map((failure) => <p key={failure.status} className="mt-2 text-sm text-muted-foreground">HTTP {failure.status}：{failure.count} 次</p>)}</div>}</section>
    </div>
  </>;
}

function FeedbackDetail({ feedback, onSaved, onClose, onUnauthorized }: { feedback: Feedback; onSaved: () => void; onClose: () => void; onUnauthorized: () => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status); const [note, setNote] = useState(feedback.note);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { await api(`/api/developer/feedback/${encodeURIComponent(feedback.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note, version: feedback.version }) }); onSaved(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onUnauthorized(); setError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  return <section className="laboratory-panel mt-5 p-5 sm:p-6" aria-label="反馈详情"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="break-all text-xs text-muted-foreground">{feedback.id}</p><h2 className="mt-2 break-words text-xl font-semibold">{feedback.title}</h2></div><Button variant="ghost" onClick={onClose}>收起详情</Button></div><p className="mt-3 text-sm text-muted-foreground">{feedbackCategories[feedback.category]} · {feedback.page} · {dateTime(feedback.createdAt)}</p>
    <dl className="mt-6 space-y-5 text-sm"><div><dt className="font-semibold">问题描述</dt><dd className="mt-2 whitespace-pre-wrap break-words leading-7">{feedback.description}</dd></div>{feedback.steps && <div><dt className="font-semibold">复现步骤</dt><dd className="mt-2 whitespace-pre-wrap break-words leading-7">{feedback.steps}</dd></div>}<div><dt className="font-semibold">联系方式</dt><dd className="mt-2 break-words">{feedback.contact || "未提供（匿名反馈）"}</dd></div></dl>
    <form onSubmit={save} className="mt-6 space-y-4 border-t pt-5"><label className="block text-sm font-medium">处理状态<select aria-label="处理状态" disabled={busy} className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 sm:max-w-xs" value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus)}>{Object.entries(feedbackStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm font-medium">内部处理备注<Textarea aria-label="内部处理备注" className="mt-2" maxLength={1500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="记录排查结果或后续计划，不会自动发送给反馈人。" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{busy ? "保存中" : "保存处理结果"}</Button></form>
  </section>;
}

export function DeveloperConsole({ signInPath, signOutPath }: { signInPath: string; signOutPath: string }) {
  const [session, setSession] = useState<Session | null>(null); const [sessionError, setSessionError] = useState("");
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"stats" | "feedback">("stats"); const [days, setDays] = useState(7); const [refresh, setRefresh] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null); const [statsError, setStatsError] = useState("");
  const [filter, setFilter] = useState("all"); const [page, setPage] = useState(1); const [list, setList] = useState<FeedbackList | null>(null); const [listError, setListError] = useState(""); const [selected, setSelected] = useState<Feedback | null>(null);
  useEffect(() => { const controller = new AbortController(); api<Session>("/api/operations/session", { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) setSession(value); }).catch((error) => { if (!controller.signal.aborted) setSessionError(error.message); }); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    const controller = new AbortController(); setStats(null); setStatsError("");
    api<{ data: Stats }>(`/api/developer/stats?days=${days}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setStats(result.data); }).catch((error) => { if (!controller.signal.aborted) { setStatsError(error.message); if (error.status === 401) setSession((value) => value && { ...value, authenticated: false }); } });
    return () => controller.abort();
  }, [session?.authenticated, days, refresh]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const controller = new AbortController(); setList(null); setListError("");
    api<FeedbackList>(`/api/developer/feedback?status=${filter}&page=${page}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setList(result); }).catch((error) => { if (!controller.signal.aborted) { setListError(error.message); if (error.status === 401) setSession((value) => value && { ...value, authenticated: false }); } });
    return () => controller.abort();
  }, [session?.authenticated, filter, page, refresh]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setSessionError("");
    try { await api("/api/operations/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setPassword(""); setSession((value) => value && { ...value, authenticated: true }); }
    catch (error) { setSessionError(error instanceof Error ? error.message : "登录失败。"); } finally { setBusy(false); }
  }
  async function logout() { setBusy(true); try { await api("/api/operations/session", { method: "DELETE" }); setSession((value) => value && { ...value, authenticated: false }); setStats(null); setList(null); setSelected(null); } catch (error) { setSessionError(error instanceof Error ? error.message : "退出失败。"); } finally { setBusy(false); } }
  return <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8"><a href="/settings" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />返回设置</a>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">开发者控制台</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">网站使用统计与问题反馈。数据来自真实记录，从启用后开始累计。</p></div>{session?.authenticated && (session.mode === "platform" ? <a href={signOutPath} target="_top" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm"><LogOut className="size-4" />退出网站账号</a> : <Button variant="outline" disabled={busy} onClick={logout}><LogOut />退出后台</Button>)}</div>
    {sessionError && <p role="alert" className="mt-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{sessionError}</p>}
    {!session ? <p className="mt-8 text-sm text-muted-foreground">正在检查访问权限…</p> : !session.configured ? <section className="laboratory-panel mt-8 max-w-xl p-6"><LockKeyhole className="mb-4 size-7 text-primary" /><h2 className="text-xl font-semibold">后台尚未初始化</h2><p className="mt-3 leading-7 text-muted-foreground">本机维护者请在项目目录运行 <code>npm run operations:setup</code>，然后刷新本页。线上部署需配置数据库、平台管理员白名单和统计签名密钥。</p><Button className="mt-5" onClick={() => location.reload()}>重新检查配置</Button></section>
      : !session.authenticated ? <section className="laboratory-panel mt-8 max-w-md p-6"><LockKeyhole className="mb-4 size-7 text-primary" /><h2 className="text-xl font-semibold">开发者登录</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">统计数据、反馈内容和联系方式仅向已授权维护者开放。</p>{session.mode === "platform" ? <a href={signInPath} target="_top" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-primary-foreground">使用网站账号登录</a> : <form onSubmit={login} className="mt-5 space-y-4"><label className="block text-sm font-medium">开发者密码<Input aria-label="开发者密码" className="mt-2" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button type="submit" disabled={busy} className="min-h-11 w-full">{busy && <Loader2 className="animate-spin" />}{busy ? "验证中" : "登录后台"}</Button></form>}</section>
      : <>
        <div className="my-7 flex flex-wrap items-center justify-between gap-4"><div className="flex gap-2" role="group" aria-label="后台功能"><Button variant={tab === "stats" ? "default" : "outline"} onClick={() => setTab("stats")} aria-pressed={tab === "stats"}>使用统计</Button><Button variant={tab === "feedback" ? "default" : "outline"} onClick={() => setTab("feedback")} aria-pressed={tab === "feedback"}>问题反馈</Button></div><Button variant="outline" onClick={() => setRefresh((value) => value + 1)}><RefreshCw />刷新数据</Button></div>
        {notice && <p role="status" className="mb-5 text-sm text-emerald-700">{notice}</p>}
        {tab === "stats" ? <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-sm">统计范围<select aria-label="统计范围" className="min-h-11 rounded-md border bg-background px-3" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>今天</option><option value={7}>近7天</option><option value={30}>近30天</option></select></label><p className="max-w-2xl text-xs leading-5 text-muted-foreground">UV 是匿名浏览器数，不是注册用户数；换设备或清除 Cookie 可能被重复计数。后台访问不计入流量。</p></div>{statsError ? <p role="alert" className="text-sm text-destructive">{statsError}</p> : stats ? <Statistics data={stats} /> : <p role="status" className="py-10 text-muted-foreground">正在读取统计…</p>}</>
          : <><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-sm">反馈状态<select aria-label="反馈状态" className="min-h-11 rounded-md border bg-background px-3" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); setSelected(null); }}><option value="all">全部状态</option>{Object.entries(feedbackStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="text-sm text-muted-foreground">{list ? `共 ${list.total} 条反馈` : "正在读取…"}</p></div>{listError ? <p role="alert" className="text-sm text-destructive">{listError}</p> : !list ? <p role="status" className="py-10 text-muted-foreground">正在读取反馈…</p> : list.data.length === 0 ? <section className="laboratory-panel p-10 text-center text-sm text-muted-foreground">此状态下暂无反馈。</section> : <div className="space-y-3">{list.data.map((item) => <button type="button" className="laboratory-panel w-full p-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring" key={item.id} onClick={() => { setSelected(item); setNotice(""); }} aria-label={`查看反馈：${item.title}`}><div className="flex flex-wrap items-center justify-between gap-3"><strong className="break-words font-medium">{item.title}</strong><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{feedbackStatuses[item.status]}</span></div><p className="mt-3 text-xs text-muted-foreground">{feedbackCategories[item.category]} · {item.page} · {dateTime(item.createdAt)}</p><p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{item.description}</p></button>)}</div>}
            {list && list.total > list.pageSize && <div className="mt-5 flex items-center justify-between"><Button variant="outline" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected(null); }}><ArrowLeft />上一页</Button><span className="text-sm">第 {page} / {Math.ceil(list.total / list.pageSize)} 页</span><Button variant="outline" disabled={page * list.pageSize >= list.total} onClick={() => { setPage(page + 1); setSelected(null); }}>下一页<ArrowRight /></Button></div>}
            {selected && <FeedbackDetail key={selected.id + ":" + selected.version} feedback={selected} onClose={() => setSelected(null)} onUnauthorized={() => { setSession((value) => value && { ...value, authenticated: false }); setSelected(null); }} onSaved={() => { setRefresh((value) => value + 1); setSelected(null); setNotice("处理结果已保存。"); }} />}
          </>}
      </>}
  </main>;
}
