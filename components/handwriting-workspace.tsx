"use client";

/* eslint-disable @next/next/no-img-element -- Original photos remain in memory only. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MathFormula, MathText } from "@/components/math-formula";
import { MathInputPreview } from "@/components/math-input-preview";
import { callTutor, TutorError } from "@/lib/tutor-client";
import { confirmedWorkSchema, evaluationMatches, handwritingEvaluationSchema, handwritingHintSchema,
  handwritingRecognitionSchema, verdictLabels, type StudentStep } from "@/lib/handwriting-schema";
import { emptyHandwritingSession, invalidateHandwriting, moveStudentStep, readHandwritingSession,
  writeHandwritingSession, type HandwritingSession } from "@/lib/handwriting-session";
import { readQuestionPhoto } from "@/lib/question-photo";
import { buildLearningContext } from "@/lib/personalization";
import { useMathLabStore } from "@/lib/store";
import { solveResultSchema, type SolveResult, type TutorRequest } from "@/lib/math-schema";

type Props = { initialRecord?: { id: string; handwriting: HandwritingSession }; embedded?: boolean; onUseQuestion?: (question: string) => void };
const newStep = (): StudentStep => ({ id: crypto.randomUUID(), text: "", formulas: [] });
const levelLabels = ["方向提示", "方法提示", "局部示范"];

export function HandwritingWorkspace({ initialRecord, embedded = false, onUseQuestion }: Props) {
  const [doc, setDoc] = useState<HandwritingSession>(emptyHandwritingSession);
  const current = useRef(doc);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [photo, setPhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [fullSolution, setFullSolution] = useState<SolveResult | null>(null);
  const [fullVisible, setFullVisible] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const settings = useMathLabStore((s) => s.settings);
  const mistakes = useMathLabStore((s) => s.mistakes);
  const addMistake = useMathLabStore((s) => s.addMistake);
  const learningContext = useMemo(() => buildLearningContext(settings.learnerProfile, mistakes), [settings.learnerProfile, mistakes]);

  function commit(next: HandwritingSession) { current.current = next; setDoc(next); }
  useEffect(() => {
    alive.current = true;
    const session = readHandwritingSession();
    const resumingRecord = !!initialRecord && session?.entryKey === initialRecord.id;
    const stored = initialRecord
      ? resumingRecord ? session : initialRecord.handwriting
      : session;
    if (stored) {
      const restored = { ...stored, entryKey: initialRecord?.id ?? stored.entryKey, pending: false, hadPhoto: false,
        savedMistakeId: initialRecord && !resumingRecord && !initialRecord.id.startsWith("photo:") ? initialRecord.id : stored.savedMistakeId };
      current.current = restored; setDoc(restored);
      if (stored.pending || stored.hadPhoto) setNotice("文字与已完成评价已恢复；未完成请求不会自动重发，原图未保存，需要时请重新选择。");
    }
    setReady(true);
    return () => { alive.current = false; sequence.current++; controller.current?.abort(); writeHandwritingSession(current.current); };
    // One restoration per workspace mount; never call the model on restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) setSaveFailed(!writeHandwritingSession(doc));
  }, [doc, ready]);
  useEffect(() => {
    const flush = () => writeHandwritingSession(current.current);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  function cancel() { sequence.current++; controller.current?.abort(); setBusy(""); }
  function edit(patch: Partial<Pick<HandwritingSession, "question" | "conditions" | "steps">>) {
    cancel(); setError(""); setFullSolution(null); setFullVisible(false);
    if (current.current.evaluation || current.current.pending) setNotice("内容已修改，旧评价和提示已失效，请核对后重新检查。");
    commit(invalidateHandwriting(current.current, patch));
  }
  function editStep(index: number, patch: Partial<StudentStep>) {
    edit({ steps: current.current.steps.map((s, i) => i === index ? { ...s, ...patch, id: s.id } : s) });
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    cancel();
    const ticket = sequence.current;
    setError("");
    try {
      const dataUrl = await readQuestionPhoto(file);
      if (!alive.current || ticket !== sequence.current) return;
      setPhoto({ name: file.name, dataUrl }); setPhotoConsent(false);
      commit({ ...current.current, pending: false, hadPhoto: true });
      setNotice("选择新图片不会覆盖当前文字；点击识别前请确认是否替换。原图不写入浏览器存储。");
    } catch (caught) { if (ticket === sequence.current) setError(caught instanceof Error ? caught.message : "图片无法读取。"); }
  }
  async function request(action: string, input: TutorRequest, apply: (result: unknown) => void) {
    cancel(); const ticket = sequence.current; const abort = new AbortController(); controller.current = abort;
    setBusy(action); setError(""); setNotice(""); commit({ ...current.current, pending: true });
    try {
      const result = await callTutor(input, { signal: abort.signal });
      if (!alive.current || sequence.current !== ticket) return;
      apply(result);
    } catch (caught) {
      if (!alive.current || sequence.current !== ticket) return;
      setError(caught instanceof TutorError ? caught.message : "结果无法可靠校验，已保留输入，请重试或修改文字。");
    } finally {
      if (alive.current && sequence.current === ticket) { setBusy(""); commit({ ...current.current, pending: false }); }
    }
  }
  function recognize() {
    if (!photo || !photoConsent) return;
    if ((doc.question || doc.steps.length) && !window.confirm("识别成功后将替换当前题目和步骤，已有评价也将失效。是否继续？")) return;
    void request("识别笔迹", { action: "recognize-work", question: doc.question, imageDataUrl: photo.dataUrl }, (result) => {
      const recognition = handwritingRecognitionSchema.parse(result);
      if (recognition.status === "unreadable") {
        commit({ ...current.current, recognition, hadPhoto: true });
        setNotice("图片无法可靠辨认，已有文字已保留。请重新拍摄或手动输入，不会生成猜测的评价。");
        return;
      }
      commit({ ...invalidateHandwriting(current.current, { question: recognition.question, conditions: recognition.conditions,
        steps: recognition.steps.map(({ id, text, formulas }) => ({ id, text, formulas })) }), recognition, hadPhoto: false });
      setPhoto(null); setPhotoConsent(false); setFullSolution(null); setFullVisible(false);
      setNotice("识别结果尚未评价。请逐项核对题目、公式与步骤顺序，再确认并检查。");
    });
  }
  function checkedWork() {
    const work = confirmedWorkSchema.safeParse({ ...current.current });
    if (!work.success) { setError("请填写完整题目和至少一个非空步骤，并勾选核对确认。空白步骤请填写或移除。"); return null; }
    return work.data;
  }
  function evaluate() {
    const work = checkedWork(); if (!work) return;
    commit({ ...current.current, evaluation: null, hints: [], revealedHints: 0 });
    void request("检查过程", { action: "evaluate-work", ...work, learningContext }, (result) => {
      const evaluation = handwritingEvaluationSchema.parse(result);
      if (!evaluationMatches(work, evaluation)) throw new Error("步骤错位");
      commit({ ...current.current, evaluation, hints: [], revealedHints: 0 });
    });
  }
  function hint(level: 1 | 2 | 3, perspective: "next" | "alternative" = "next") {
    const work = checkedWork(); if (!work || !doc.evaluation || doc.evaluation.status === "completed") return;
    const cached = doc.hints.find((h) => h.level === level);
    if (cached && perspective === "next") { commit({ ...doc, revealedHints: level }); return; }
    void request("生成提示", { action: "work-hint", ...work, evaluation: doc.evaluation, level, perspective, learningContext }, (result) => {
      const next = handwritingHintSchema.parse(result);
      if (next.level !== level || (next.targetStepId && !work.steps.some((s) => s.id === next.targetStepId))) throw new Error("提示错位");
      commit({ ...current.current, hints: [...current.current.hints.filter((h) => h.level !== level), next], revealedHints: level });
    });
  }
  function revealFullSolution() {
    const work = checkedWork(); if (!work) return;
    if (fullSolution) { setFullVisible(true); return; }
    void request("完整解析", { action: "solve", question: [work.question, ...work.conditions].join("\n"), mode: "auto", learningContext }, (result) => {
      setFullSolution(solveResultSchema.parse(result)); setFullVisible(true);
    });
  }
  function save() {
    const work = checkedWork(); if (!work || !doc.evaluation || doc.savedMistakeId) return;
    if (!doc.errorReason.trim()) { setError("请确认或自行填写错误原因；AI 建议不会自动保存为你的错误原因。"); return; }
    try {
      // This is a PROCESS snapshot, not a fabricated final solution. Keeping an
      // honest unsupported lesson avoids making reports claim an unsolved answer.
      const snapshot = { ...doc, recognition: null, pending: false, hadPhoto: false };
      const evaluation = doc.evaluation;
      const solution: SolveResult = { id: crypto.randomUUID(), normalizedQuestion: work.question,
        subject: evaluation.subject, topics: evaluation.topics, questionType: "手写过程辅导", difficulty: evaluation.difficulty,
        status: "unsupported", steps: [], finalAnswerLatex: "", finalAnswerText: "", commonMistakes: [],
        limitations: ["本记录保存的是学生过程及AI逐步评价，不是标准答案；请在手写过程辅导中继续检查。", evaluation.summary] };
      const saved = addMistake({ solution, errorReason: doc.errorReason, note: doc.note, handwriting: snapshot });
      commit({ ...doc, savedMistakeId: saved.id }); setNotice("已保存经确认的文字步骤与评价，不含原图；错误原因由你确认。可在错题集继续复盘。");
    } catch { setError("错题保存失败，可能存储空间不足。当前文字仍保留，请先复制；未覆盖已有错题。"); }
  }

  if (!ready) return <p role="status">正在恢复手写过程…</p>;
  const firstErrorIndex = doc.evaluation?.firstErrorStepId ? doc.steps.findIndex((s) => s.id === doc.evaluation?.firstErrorStepId) : -1;
  return <section aria-label="手写过程辅导" className="space-y-4">
    <p className="text-sm text-muted-foreground">先核对你写的过程，再逐步检查。默认只给下一步启发，不直接展示整题答案。AI 评价仍需核验，疑难结论请对照教材或询问老师。</p>
    {onUseQuestion && <Button variant="ghost" disabled={!!busy || !doc.question.trim()} onClick={() => onUseQuestion(doc.question)}>识别有误？这张图片只有题目，改为普通答疑</Button>}
    {error && <div role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{error} <a href="/settings" className="underline">检查服务设置</a></div>}
    {notice && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</p>}
    {saveFailed && <p role="alert" className="text-sm text-amber-700 dark:text-amber-200">浏览器暂存失败，切换页面前请复制文字。未清除其他学习数据。</p>}
    {busy && <p role="status" aria-live="polite">正在{busy}…修改内容会取消本次请求。</p>}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="min-w-0"><CardHeader><CardTitle>题目与我的步骤</CardTitle></CardHeader><CardContent className="space-y-4">
        {!embedded && <><div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>上传手写过程</Button>
          <Button variant="outline" onClick={() => cameraRef.current?.click()}>拍摄手写过程</Button>
        </div>
        <input className="sr-only" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="上传手写过程图片" onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input className="sr-only" ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" aria-label="拍摄手写过程图片" onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="text-sm leading-6 text-muted-foreground">支持 JPG、PNG、WebP、GIF，最大8 MB。原图只用于当次识别，不进入会话、日志或错题集。请避免拍入姓名、学号；也可不上传，直接输入。</p>
        {photo && <div className="space-y-3 rounded-xl border p-3">
          <img src={photo.dataUrl} alt="待核对的手写解答" className="max-h-64 w-full object-contain" />
          <p className="break-all text-sm">{photo.name}</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} />我同意将这张图片发送给已配置的 DeepSeek 服务进行识别；图片处理会产生模型调用费用。</label>
          <div className="flex flex-wrap gap-2"><Button disabled={!photoConsent || !!busy} onClick={recognize}>识别笔迹（不评价）</Button><Button variant="outline" onClick={() => { cancel(); setPhoto(null); setPhotoConsent(false); commit({ ...current.current, hadPhoto: false, pending: false }); }}>移除本次图片</Button></div>
        </div>}</>}
        {doc.recognition && <details className="rounded-xl border p-3 text-sm" open={doc.recognition.status !== "recognized"}>
          <summary className="cursor-pointer font-medium">原始识别记录（未自动纠错）</summary>
          <p className="mt-2 whitespace-pre-wrap">{doc.recognition.question || "原题未辨认，请补充。"}</p>
          {doc.recognition.steps.map((s, i) => <div key={s.id} className="mt-3 border-t pt-2"><p className="whitespace-pre-wrap">原步骤{i + 1}：{s.text}</p>{s.formulas.map((f, j) => <pre key={j} className="overflow-auto whitespace-pre-wrap break-all">{f}</pre>)}{s.uncertainties.map((a, j) => <p key={j}>待核对：{a.description}{a.candidates.length ? `（候选：${a.candidates.join(" / ")}）` : ""}</p>)}</div>)}
          {[...doc.recognition.uncertainties.map((a) => a.description + (a.candidates.length ? "；候选：" + a.candidates.join(" / ") : "")), ...doc.recognition.warnings].map((w, i) => <p key={i} className="mt-2 text-amber-800 dark:text-amber-200">{w}</p>)}
        </details>}
        <label className="block space-y-2"><span className="text-sm font-medium">核对后的题目</span><Textarea aria-label="手写题目" spellCheck={false} maxLength={2000} value={doc.question} onChange={(e) => edit({ question: e.target.value })} /><MathInputPreview value={doc.question} /></label>
        <label className="block space-y-2"><span className="text-sm">已知条件（每行一项，可空）</span><Textarea aria-label="已知条件" spellCheck={false} value={doc.conditions.join("\n")} onChange={(e) => edit({ conditions: e.target.value.split("\n").slice(0, 10).map((s) => s.slice(0, 300)) })} /></label>
        {doc.steps.map((s, i) => <fieldset key={s.id} className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">我的第{i + 1}步</legend>
          <Textarea aria-label={`第${i + 1}步文字`} spellCheck={false} maxLength={1200} value={s.text} onChange={(e) => editStep(i, { text: e.target.value })} placeholder="写下运算和依据，或在下方填写公式" />
          <MathInputPreview value={s.text} />
          <label className="block space-y-2 text-sm"><span>公式（LaTeX，可留空）</span><Textarea aria-label={`第${i + 1}步公式`} spellCheck={false} maxLength={1200} value={s.formulas.join("\n")} onChange={(e) => editStep(i, { formulas: e.target.value ? [e.target.value] : [] })} />{s.formulas.map((f, j) => <MathFormula key={j} value={f} />)}</label>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={i === 0} onClick={() => edit({ steps: moveStudentStep(doc.steps, i, -1) })} aria-label={`上移第${i + 1}步`}>上移</Button><Button size="sm" variant="outline" disabled={i === doc.steps.length - 1} onClick={() => edit({ steps: moveStudentStep(doc.steps, i, 1) })} aria-label={`下移第${i + 1}步`}>下移</Button><Button size="sm" variant="ghost" onClick={() => edit({ steps: doc.steps.filter((step) => step.id !== s.id) })} aria-label={`移除第${i + 1}步`}>移除空白或多余步骤</Button></div>
        </fieldset>)}
        <Button variant="outline" disabled={doc.steps.length >= 20} onClick={() => edit({ steps: [...doc.steps, newStep()] })}>补充新步骤</Button>
        {!doc.steps.length && <p className="text-sm text-muted-foreground">尚无步骤，请识别图片或补充新步骤；此时不会显示“全部正确”。</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={doc.confirmed} onChange={(e) => { cancel(); commit({ ...current.current, confirmed: e.target.checked, pending: false, ...(!e.target.checked ? { evaluation: null, hints: [], revealedHints: 0 } : {}) }); }} />我已核对原题、已知条件、每一步公式和顺序；仍不确定的内容已注明，不代表数学正确。</label>
        <Button className="w-full" disabled={!!busy || !doc.confirmed || !doc.steps.length} onClick={evaluate}>确认并检查过程 / 检查我新写的一步</Button>
      </CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>过程评价与下一步启发</CardTitle></CardHeader><CardContent className="space-y-4">
        {!doc.evaluation ? <p className="text-sm leading-6 text-muted-foreground">核对并检查后，这里会逐步说明依据，定位首次错误。不会把笔迹识别结果当成正确答案。</p> : <>
          <div className="rounded-xl bg-muted p-4"><p className="font-medium">{doc.evaluation.status === "completed" ? "本题已完成" : doc.evaluation.status === "needs_more_info" ? "需要补充条件或核对笔迹" : doc.evaluation.status === "uncertain" ? "暂时无法可靠判断" : "继续完善解题过程"}</p><div className="mt-2 text-sm leading-6"><MathText value={doc.evaluation.summary} /></div>{firstErrorIndex >= 0 && <p className="mt-2 text-sm font-medium">首次影响结论的错误：第{firstErrorIndex + 1}步</p>}</div>
          {doc.evaluation.steps.map((v, i) => <article key={v.stepId} className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">第{i + 1}步 · {verdictLabels[v.status]}</h3>
            <div className="text-sm"><MathText value={doc.steps[i].text} />{doc.steps[i].formulas.map((f, j) => <MathFormula key={j} value={f} />)}</div>
            <p className="text-sm leading-6">依据：<MathText value={v.basis} /></p>
            {v.strengths.length > 0 && <p className="text-sm leading-6">做对的部分：<MathText value={v.strengths.join("；")} /></p>}
            {v.issues.length > 0 && <p className="text-sm leading-6">需要检查：<MathText value={v.issues.join("；")} /></p>}
            {v.hint && <p className="text-sm leading-6">修正方向：<MathText value={v.hint} /></p>}
            {v.suggestedRewrite && <details className="text-sm"><summary className="cursor-pointer">查看局部建议修改（不是原笔迹）</summary><MathText value={v.suggestedRewrite} /></details>}
          </article>)}
          {doc.evaluation.limitations.map((l, i) => <p key={i} className="text-sm text-muted-foreground"><MathText value={l} /></p>)}
          {doc.evaluation.status === "completed" ? <div className="rounded-xl border p-4 text-sm">理解检查：<MathText value={doc.evaluation.understandingQuestion} /></div> : <div className="space-y-3">
            <div className="flex flex-wrap gap-2"><Button disabled={!!busy} onClick={() => hint(Math.min(doc.revealedHints + 1, 3) as 1 | 2 | 3)}>{doc.revealedHints === 0 ? "给我下一步提示" : doc.revealedHints === 1 ? "再给方法提示" : doc.revealedHints === 2 ? "展开局部示范" : "重看提示"}</Button><Button variant="outline" disabled={!!busy || !doc.revealedHints} onClick={() => hint(doc.revealedHints as 1 | 2 | 3, "alternative")}>换种讲法</Button></div>
            {doc.hints.filter((h) => h.level <= doc.revealedHints).sort((a, b) => a.level - b.level).map((h) => <div key={h.level} className="space-y-2 rounded-xl border p-4 text-sm"><p className="font-semibold">{levelLabels[h.level - 1]} · {h.title}</p><MathText value={h.text} />{h.formulas.map((f, i) => <MathFormula key={i} value={f} />)}</div>)}
          </div>}
          <Button variant="outline" disabled={!!busy} onClick={revealFullSolution}>查看完整解析（首次会调用 AI）</Button>
          {fullVisible && fullSolution && <section aria-label="主动展开的完整解析" className="space-y-3 rounded-xl border p-4">
            {fullSolution.status !== "solved" ? <p className="text-sm"><MathText value={fullSolution.limitations.join("；")} /></p> : <>{fullSolution.steps.map((s) => <div key={s.id} className="space-y-2 text-sm"><p className="font-medium">{s.title}</p><MathText value={s.explanation} />{s.formulas.map((f, i) => <MathFormula key={i} value={f} />)}<MathText value={s.basis} /></div>)}<p className="font-medium">最终答案</p>{fullSolution.finalAnswerLatex && <MathFormula value={fullSolution.finalAnswerLatex} />}{fullSolution.finalAnswerText && <MathText value={fullSolution.finalAnswerText} />}</>}
            <Button size="sm" variant="ghost" onClick={() => setFullVisible(false)}>收起完整解析</Button>
          </section>}
          <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-medium">保存过程到错题集</h3><p className="text-sm text-muted-foreground">AI 提示仅供参考。请自行确认错误原因，不会自动记为你的错误。</p><label className="block text-sm">我确认的错误原因<Input aria-label="手写错误原因" maxLength={300} value={doc.errorReason} onChange={(e) => commit({ ...doc, errorReason: e.target.value })} /></label><label className="block text-sm">复盘笔记<Textarea aria-label="手写复盘笔记" maxLength={5000} value={doc.note} onChange={(e) => commit({ ...doc, note: e.target.value })} /></label><Button disabled={!!busy || !doc.errorReason.trim() || !!doc.savedMistakeId} onClick={save}>{doc.savedMistakeId ? "此版本过程已保存" : "保存已确认的过程与评价"}</Button></div>
        </>}
      </CardContent></Card>
    </div>
  </section>;
}
