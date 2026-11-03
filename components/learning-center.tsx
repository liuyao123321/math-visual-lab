"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MathFormula, MathText } from "@/components/math-formula";
import { useMathLabStore } from "@/lib/store";
import { useLearningStore } from "@/lib/learning-store";
import { activityStreak, localDay } from "@/lib/learning";
import { buildLearningContext } from "@/lib/personalization";
import { callTutor } from "@/lib/tutor-client";
import { getApiKey } from "@/lib/storage";
import { offlinePaper } from "@/lib/offline-paper";
import { paperSchema, type PracticePaper, type UnderstandingFeedback } from "@/lib/math-schema";

const feedbackLabels = { correct: "理解正确", partially_correct: "部分正确", incorrect: "需要巩固", uncertain: "需人工核对" };

export function LearningCenter() {
  const hydrated = useMathLabStore((state) => state.hydrated);
  const mistakes = useMathLabStore((state) => state.mistakes);
  const settings = useMathLabStore((state) => state.settings);
  const recordAttempt = useMathLabStore((state) => state.recordUnderstandingAttempt);
  const learning = useLearningStore();
  const { data } = learning;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [sourceIds, setSourceIds] = useState<string[] | null>(null);
  const [count, setCount] = useState(5);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const context = useMemo(() => buildLearningContext(settings.learnerProfile, mistakes), [settings.learnerProfile, mistakes]);
  const session = data.sessions.find((item) => item.id === activeSessionId) ?? data.sessions[0];
  const selectedMistakes = sourceIds !== null ? mistakes.filter((item) => sourceIds.includes(item.id)) : mistakes.filter((item) => item.mastery !== "mastered").slice(0, 5);
  const learnedToday = data.activityDays.includes(localDay());

  function showError(caught: unknown) { setError(caught instanceof Error ? caught.message : "操作未完成，请重试。"); }
  async function makePaper(origin: "ai" | "offline") {
    setBusy("paper"); setError("");
    try {
      if (!selectedMistakes.length) throw new Error("请选择至少一道错题作为出题依据。");
      if (selectedMistakes.length > 5) throw new Error("一次最多选择 5 道错题。");
      if (data.sessions.length >= 10 && !window.confirm("测验最多保存10份，继续将移除最早的一份及其作答记录。继续吗？")) return;
      const paper = origin === "offline" ? offlinePaper(selectedMistakes, count) : await callTutor({ action: "generate-paper", count, sources: selectedMistakes.map((item) => ({ question: item.question, topics: item.topics, errorReason: item.errorReason })), learningContext: context }) as PracticePaper;
      paperSchema.parse(paper);
      if (paper.questions.length !== count) throw new Error("模型返回题数与要求不一致，请重新出卷。");
      const created = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), origin, paper, answers: {}, feedback: {}, submittedAt: null };
      learning.createSession(created); setActiveSessionId(created.id); toast.success("模拟试卷已生成");
    } catch (caught) { showError(caught); }
    finally { setBusy(""); }
  }

  async function submitPaper() {
    if (!session) return;
    setBusy("grade"); setError("");
    try {
      if (session.paper.questions.some((question) => !session.answers[question.id]?.trim())) throw new Error("请先完成所有题目的回答，空白题目不会被自动判错。");
      if (!getApiKey()) { learning.submit(session.id); toast.success("已交卷，请对照参考答案自行核对；AI 评价需配置密钥。"); return; }
      for (const question of session.paper.questions) {
        if (session.feedback[question.id]) continue;
        const feedback = await callTutor({ action: "evaluate-answer", sourceQuestion: question.question, check: { id: question.id, question: question.question, type: "variation", hint: question.hint, expectedConcepts: question.expectedConcepts }, answer: session.answers[question.id], learningContext: context }) as UnderstandingFeedback;
        learning.grade(session.id, question.id, feedback);
        recordAttempt({ solutionId: session.id, topics: question.topics, status: feedback.status });
      }
      learning.submit(session.id); toast.success("已完成专项测验与反馈");
    } catch (caught) { showError(caught); }
    finally { setBusy(""); }
  }

  if (!hydrated || !learning.hydrated) return <main className="mx-auto max-w-7xl px-4 py-8" role="status">正在读取本地学习记录…</main>;

  return <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-sm font-medium text-primary dark:text-primary">专项模拟</p><h1 className="mt-1 text-3xl font-semibold">根据错题练习与测验</h1></div><div className="flex items-center gap-3 rounded-xl border bg-card p-4"><Flame className="text-amber-500" /><div><p className="font-medium">有效学习连续 {activityStreak(data.activityDays)} 天</p><p className="text-sm text-muted-foreground">{learnedToday ? "今天已完成学习任务" : "完成模拟测验后自动打卡"}</p></div></div></div>
    {error && <div role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{error}<a className="ml-3 underline" href="/settings">检查 AI 配置</a></div>}




    <section className="mt-6 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]"><article className="laboratory-panel space-y-4 p-6"><h2 className="text-xl font-semibold">根据错题生成模拟试卷</h2><p className="text-sm leading-6 text-muted-foreground">默认选择前 5 道未掌握错题，也可手动选择。每道题包含提示、答案与理解评价。</p><label className="block text-sm">题目数量<select className="mt-2 block w-full rounded-md border bg-background p-2" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 5, 8].map((value) => <option key={value} value={value}>{value} 道题</option>)}</select></label><div className="max-h-64 space-y-2 overflow-auto">{mistakes.map((item) => <label key={item.id} className="flex gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selectedMistakes.some((selected) => selected.id === item.id)} onChange={(event) => { const current = selectedMistakes.map((selected) => selected.id); setSourceIds(event.target.checked ? [...new Set([...current, item.id])].slice(0, 5) : current.filter((id) => id !== item.id)); }} /><span><MathText value={item.question} /><span className="mt-1 block text-xs text-muted-foreground">{item.topics.join("、")}</span></span></label>)}</div><Button className="w-full" onClick={() => makePaper("ai")} disabled={!!busy || !selectedMistakes.length}>{busy === "paper" ? "正在生成试卷" : "AI 出卷"}</Button><Button variant="outline" className="w-full" onClick={() => makePaper("offline")} disabled={!!busy || !selectedMistakes.length}>使用离线变式题库</Button>{data.sessions.length > 0 && <label className="block text-sm">历史测验<select className="mt-2 block w-full rounded-md border bg-background p-2" value={session?.id ?? ""} onChange={(event) => setActiveSessionId(event.target.value)}>{data.sessions.map((item) => <option key={item.id} value={item.id}>{item.paper.title} · {item.submittedAt ? "已交卷" : "作答中"}</option>)}</select></label>}</article><article className="laboratory-panel p-6">{!session ? <div className="py-16 text-center"><ClipboardList className="mx-auto mb-4 size-10 text-muted-foreground" /><p>选择错题并生成一份专项模拟试卷。</p></div> : <><h2 className="text-xl font-semibold">{session.paper.title}</h2>{session.origin === "ai" && <p className="mt-2 text-sm leading-6 text-muted-foreground"><MathText value={session.paper.rationale} /></p>}<p className="mt-2 text-sm text-primary dark:text-primary">{session.origin === "ai" ? "AI 生成试卷" : "确定性离线题库"} · 已答 {Object.values(session.answers).filter((answer) => answer.trim()).length}/{session.paper.questions.length} 题</p><div className="mt-5 space-y-5">{session.paper.questions.map((question, index) => <div className="space-y-3 rounded-xl border p-4" key={question.id}><p className="font-medium">{index + 1}. <MathText value={question.question} /></p><p className="text-sm text-muted-foreground">{question.topics.join("、")} · {question.difficulty}</p><details className="text-sm"><summary className="cursor-pointer text-primary dark:text-primary">查看提示</summary><p className="mt-2 leading-6"><MathText value={question.hint} /></p></details><Textarea aria-label={`第${index + 1}题回答`} maxLength={1200} value={session.answers[question.id] ?? ""} readOnly={!!session.submittedAt} disabled={busy === "grade"} onChange={(event) => learning.answer(session.id, question.id, event.target.value)} placeholder="写下计算过程和答案" />{session.feedback[question.id] && <div className="rounded-lg bg-primary/[0.06] p-3"><p className="text-sm font-medium">AI 反馈：{feedbackLabels[session.feedback[question.id].status]}</p><p className="mt-2 text-sm leading-6"><MathText value={session.feedback[question.id].explanation} /></p><p className="mt-2 text-sm"><MathText value={session.feedback[question.id].nextHint} /></p></div>}{session.submittedAt && <><details className="text-sm"><summary className="cursor-pointer">查看参考答案</summary><div className="mt-3"><MathFormula value={question.answerLatex} /></div></details><a href={`/solve?question=${encodeURIComponent(question.question)}&auto=1`} className="inline-block text-sm text-primary underline dark:text-primary">分步解析与错题收藏</a></>}</div>)}</div>{!session.submittedAt ? <Button className="mt-5 w-full" onClick={submitPaper} disabled={!!busy}>{busy === "grade" ? <><Loader2 className="animate-spin" />逐题评价中</> : "交卷并查看反馈"}</Button> : <div className="mt-5 rounded-xl bg-emerald-500/[0.07] p-4"><p className="font-medium">已完成本次测验</p>{Object.keys(session.feedback).length > 0 && <p className="mt-2 text-sm leading-6">{`AI 判断：${Object.values(session.feedback).filter((feedback) => feedback.status === "correct").length} 题正确；需要巩固的题目可进入分步解析并加入错题集。`}</p>}</div>}</>}</article></section>
  </main>;
}
