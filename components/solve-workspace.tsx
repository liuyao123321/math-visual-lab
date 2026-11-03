"use client";

/* eslint-disable @next/next/no-img-element -- Camera previews use short-lived data URLs. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, BookOpenCheck, Camera, Check, CircleHelp, Lightbulb, Loader2, Save, Sparkles, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MathFormula, MathText } from "@/components/math-formula";
import { MathInputPreview } from "@/components/math-input-preview";
import { PhotoUploadNotice } from "@/components/photo-upload-notice";
import { StepVisualization } from "@/components/step-visualization";
import { StepTutoringPanel, type StepFeedback } from "@/components/step-tutoring-panel";
import { readQuestionPhoto } from "@/lib/question-photo";
import { MultiMethodPanel } from "@/components/multi-method-panel";
import { QuestionClarification } from "@/components/question-clarification";
import { HandwritingWorkspace } from "@/components/handwriting-workspace";
import { KnowledgeEvidence } from "@/components/knowledge-evidence";
import { clarificationQuestionsFor, type ClarificationDraft } from "@/lib/question-clarification";
import { examples, exampleById } from "@/lib/examples";
import { exampleExplanation } from "@/lib/example-explanations";
import { SolutionStepContent } from "@/components/solution-step-content";
import { defaultParameterValues } from "@/lib/math";
import type { ExplainResult, ExplanationMode, ExplanationSelection, PracticeResult, SolveResult, TutoringStyle, UnderstandingCheck, UnderstandingFeedback } from "@/lib/math-schema";
import { buildLearningContext, tutoringStyleLabels } from "@/lib/personalization";
import { appropriateVisualization } from "@/lib/visualization-policy";
import { getApiKey } from "@/lib/storage";
import { consumePhotoHandoff } from "@/lib/solve-handoff";
import type { PhotoTutorResult, PhotoWork } from "@/lib/photo-tutoring";
import { emptyHandwritingSession, type HandwritingSession } from "@/lib/handwriting-session";
import { readSolveSession, writeSolveSession, type SolveSession } from "@/lib/solve-session";
import { solveResultSchema } from "@/lib/math-schema";
import { useMathLabStore } from "@/lib/store";
import { callTutor, TutorError } from "@/lib/tutor-client";
import { cn } from "@/lib/utils";
import { parseTutorMode, TUTOR_MODE_EVENT } from "@/lib/tutor-navigation";

const modeLabels: Record<ExplanationMode, string> = { concise: "简洁", detailed: "详细", visual: "可视化" };
const reasons = ["概念没有理解", "公式不会使用", "计算过程出错", "图像与公式联系不清", "其他"];

function initialRevealCount(style: TutoringStyle, solution: SolveResult) {
  if (solution.status !== "solved") return solution.steps.length;
  if (style === "complete") return solution.steps.length;
  if (style === "guided") return Math.min(1, solution.steps.length);
  return 0;
}

export function SolveWorkspace() {
  const searchParams = useSearchParams();
  const storeSolution = useMathLabStore((state) => state.currentSolution);
  const setStoreSolution = useMathLabStore((state) => state.setCurrentSolution);
  const addMistake = useMathLabStore((state) => state.addMistake);
  const settings = useMathLabStore((state) => state.settings);
  const mistakes = useMathLabStore((state) => state.mistakes);
  const practiceMistake = useMathLabStore((state) => state.practiceMistake);
  const recordUnderstandingAttempt = useMathLabStore((state) => state.recordUnderstandingAttempt);

  const requestedExample = searchParams.get("example");
  const mistakeId = searchParams.get("mistake");
  const customQuestion = searchParams.get("question");
  const autoStart = searchParams.get("auto") === "1";
  const handoffToken = searchParams.get("handoff");
  const requestedMode = parseTutorMode(searchParams.get("mode"));
  const requestedEntryKey = handoffToken ? `handoff:${handoffToken}` : customQuestion ? `question:${customQuestion}` : mistakeId ? `mistake:${mistakeId}` : requestedExample ? `example:${requestedExample}` : "";
  const sessionEntryRef = useRef(requestedEntryKey);
  const sessionSnapshotRef = useRef<SolveSession | null>(null);
  const mountedRef = useRef(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [answerMethod, setAnswerMethod] = useState<"standard" | "handwriting">("standard");
  const [photoReview, setPhotoReview] = useState<PhotoWork | null>(null);
  const [initialWork, setInitialWork] = useState<{ id: string; handwriting: HandwritingSession }>();
  const [ragEnabled, setRagEnabled] = useState(true);
  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);
  const consumedHandoffRef = useRef<string | null>(null);
  const practicedRef = useRef<string | null>(null);
  const autoStartedRef = useRef(false);
  const solveRef = useRef<() => Promise<void>>(async () => undefined);
  const navigationModeRef = useRef<(selection: ExplanationMode) => void>(() => undefined);
  const initialModeChangeRef = useRef<ExplanationMode | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const initial = (requestedExample && exampleById[requestedExample]) || (mistakeId && mistakes.find((item) => item.id === mistakeId)?.solution) || storeSolution || examples[0];
  const [question, setQuestion] = useState(customQuestion || initial.normalizedQuestion);
  const [solution, setSolution] = useState<SolveResult>(() => exampleById[initial.id] && requestedMode ? exampleExplanation(initial, requestedMode) : initial);
  const [mode, setMode] = useState<ExplanationMode>(requestedMode ?? initial.explanationMode ?? initial.recommendedMode ?? (initial.visualization ? "visual" : settings.defaultMode === "concise" ? "concise" : "detailed"));
  const [modeSelection, setModeSelection] = useState<ExplanationSelection>(requestedMode ?? "auto");
  const [resultReady, setResultReady] = useState(!customQuestion && !handoffToken && solveResultSchema.safeParse(initial).success);
  const [tutoringStyleOverride, setTutoringStyleOverride] = useState<TutoringStyle | null>(null);
  const [progressCount, setProgressCount] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [parameters, setParameters] = useState<Record<string, number>>(defaultParameterValues(initial.visualization));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [mobileView, setMobileView] = useState(requestedExample === "example-triple-integral" ? "steps" : "input");
  const [errorReason, setErrorReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [detailReason, setDetailReason] = useState("我不理解这一步为什么这样变形");
  const [detail, setDetail] = useState<ExplainResult | null>(null);
  const [stepFeedback, setStepFeedback] = useState<Record<string, StepFeedback>>({});
  const [photoReading, setPhotoReading] = useState(false);
  const [requestNotice, setRequestNotice] = useState("");
  const photoReadId = useRef(0);
  const hintRequest = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  const [practice, setPractice] = useState<PracticeResult | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState<"detail" | "practice" | "check" | "evaluate" | "">("");
  const [hasKey, setHasKey] = useState(false);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string; size: number } | null>(null);
  const [understandingCheck, setUnderstandingCheck] = useState<UnderstandingCheck | null>(null);
  const [checkAnswer, setCheckAnswer] = useState("");
  const [checkFeedback, setCheckFeedback] = useState<UnderstandingFeedback | null>(null);
  const [clarificationDraft, setClarificationDraft] = useState<ClarificationDraft>({});

  const learningContext = useMemo(() => buildLearningContext({ ...settings.learnerProfile, tutoringStyle: tutoringStyleOverride ?? settings.learnerProfile.tutoringStyle }, mistakes), [settings.learnerProfile, tutoringStyleOverride, mistakes]);
  const tutoringStyle = tutoringStyleOverride ?? settings.learnerProfile.tutoringStyle;
  const revealedCount = solution.status !== "solved"
    ? solution.steps.length
    : tutoringStyle === "complete"
      ? solution.steps.length
      : Math.min(solution.steps.length, Math.max(progressCount, tutoringStyle === "guided" ? 1 : 0));
  const completedFlow = solution.steps.length === 0 || revealedCount >= solution.steps.length;
  const visibleSteps = solution.steps.slice(0, revealedCount);
  const step = visibleSteps[activeStep];
  const visual = useMemo(() => appropriateVisualization(solution), [solution]);
  const statusText = solution.status === "solved" ? "解析完成" : solution.status === "needs_more_info" ? "需要补充条件" : "暂不支持";
  const showResult = resultReady && question.trim() === solution.normalizedQuestion.trim();
  const showPlot = showResult && solution.status === "solved" && mode === "visual" && Boolean(visual);
  solveRef.current = () => solve();
  navigationModeRef.current = changeMode;

  // Restore after hydration, before auto-start, practice counting or draft writes.
  // Plain /solve resumes the last draft; a DIFFERENT explicit entry opens a new task.
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration synchronizes the browser-only tab snapshot before any draft can be written. */
  useEffect(() => {
    mountedRef.current = true;
    const hintState = hintRequest.current;
    const saved = readSolveSession();
    if (saved && !handoffToken && (!requestedEntryKey || saved.entryKey === requestedEntryKey)) {
      sessionEntryRef.current = saved.entryKey;
      setQuestion(saved.question); setSolution(saved.solution ?? examples[0]); setStoreSolution(saved.resultReady ? saved.solution : null);
      setResultReady(saved.resultReady); setMode(saved.mode); setModeSelection(requestedMode ?? saved.modeSelection);
      if (requestedMode && requestedMode !== saved.mode && saved.resultReady && saved.solution?.status === "solved") initialModeChangeRef.current = requestedMode;
      setTutoringStyleOverride(saved.tutoringStyle); setProgressCount(saved.progressCount); setActiveStep(saved.activeStep);
      setParameters(saved.parameters); setMobileView(saved.mobileView === "visual" ? "steps" : saved.mobileView); setErrorReason(saved.errorReason); setNote(saved.note);
      setDetailReason(saved.detailReason); setDetail(saved.detail);
      const legacyStep = saved.solution?.steps[saved.activeStep];
      setStepFeedback(saved.stepFeedback ?? (legacyStep ? { [legacyStep.id]: { reason: saved.detailReason, detail: saved.detail } } : {}));
      setPractice(saved.practice);
      setUnderstandingCheck(saved.understandingCheck); setCheckAnswer(saved.checkAnswer); setCheckFeedback(saved.checkFeedback);
      setClarificationDraft(saved.clarificationDraft ?? {});
      setAnswerMethod(saved.answerMethod ?? "standard");
      setPhotoReview(saved.photoReview ?? null);
      setRagEnabled(saved.ragEnabled ?? true);
      setError(saved.hadPhoto ? "文字和进度已恢复；为保护隐私，照片未暂存，请重新选择图片。"
        : saved.pendingAction ? "上次请求在离开页面时中断，题目和进度已保留，请手动重试。" : saved.error);
      setErrorCode(saved.pendingAction || saved.hadPhoto ? "interrupted" : saved.errorCode);
      autoStartedRef.current = true;
      practicedRef.current = mistakeId;
      consumedHandoffRef.current = handoffToken;
    }
    if (mistakeId && mistakes.find((item) => item.id === mistakeId)?.handwriting) setAnswerMethod("handwriting");
    setSessionReady(true);
    return () => { mountedRef.current = false; hintState.id++; hintState.controller?.abort(); };
    // Restoration is for this document mount, not each local history change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!sessionReady) return;
    const selectMode = (event: Event) => {
      const selection = parseTutorMode((event as CustomEvent<{ mode?: unknown }>).detail?.mode);
      if (!selection) return;
      event.preventDefault();
      navigationModeRef.current(selection);
    };
    window.addEventListener(TUTOR_MODE_EVENT, selectMode);
    const timer = window.setTimeout(() => {
      const selection = initialModeChangeRef.current;
      initialModeChangeRef.current = null;
      if (selection) navigationModeRef.current(selection);
    }, 0);
    return () => { window.removeEventListener(TUTOR_MODE_EVENT, selectMode); window.clearTimeout(timer); };
  }, [sessionReady]);

  const sessionSnapshot: SolveSession = {
    version: 1, entryKey: sessionEntryRef.current, question,
    solution: solveResultSchema.safeParse(solution).success ? solution : null,
    resultReady: resultReady && solveResultSchema.safeParse(solution).success, mode, modeSelection, tutoringStyle,
    progressCount, activeStep, parameters, mobileView: mobileView as SolveSession["mobileView"], error, errorCode,
    errorReason, note, detailReason, detail, practice, understandingCheck, checkAnswer, checkFeedback,
    pendingAction: loading ? "solve" : secondaryLoading, hadPhoto: !!photo, clarificationDraft, answerMethod, ragEnabled, photoReview, stepFeedback,
  };
  sessionSnapshotRef.current = sessionReady ? sessionSnapshot : null;
  useEffect(() => {
    if (!sessionReady) return;
    setSessionSaveFailed(!writeSolveSession(sessionSnapshotRef.current!));
  }, [sessionReady, question, solution, resultReady, mode, modeSelection, tutoringStyle, progressCount, activeStep, parameters,
    mobileView, error, errorCode, errorReason, note, detailReason, detail, practice, understandingCheck, checkAnswer, checkFeedback, loading, secondaryLoading, photo, clarificationDraft, answerMethod, ragEnabled, photoReview, stepFeedback]);

  useEffect(() => {
    const flush = () => { if (sessionSnapshotRef.current) writeSolveSession(sessionSnapshotRef.current); };
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); };
  }, []);

  useEffect(() => {
    const update = () => setHasKey(Boolean(getApiKey()));
    update();
    window.addEventListener("mathlab:key-change", update);
    return () => window.removeEventListener("mathlab:key-change", update);
  }, []);

  useEffect(() => {
    if (!sessionReady || !mistakeId) return;
    const next = mistakes.find((item) => item.id === mistakeId)?.solution;
    if (!next || practicedRef.current === mistakeId) return;
    const timer = window.setTimeout(() => {
      applySolution(next);
      setQuestion(next.normalizedQuestion);
      practicedRef.current = mistakeId;
      practiceMistake(mistakeId);
    }, 0);
    return () => window.clearTimeout(timer);
    // applySolution is local and intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, mistakeId, mistakes, practiceMistake]);

  useEffect(() => {
    if (!sessionReady || !handoffToken || consumedHandoffRef.current === handoffToken) return;
    const timer = window.setTimeout(() => {
      consumedHandoffRef.current = handoffToken;
      const next = consumePhotoHandoff(handoffToken);
      if (next) {
        applyPhotoResult(next);
        setMobileView("steps");
        sessionEntryRef.current = "";
        window.history.replaceState(null, "", "/solve");
      } else {
        setError("照片解析结果已失效，请重新上传照片。");
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, handoffToken]);

  useEffect(() => {
    if (!sessionReady || !autoStart || !customQuestion || autoStartedRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;
      void solveRef.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sessionReady, autoStart, customQuestion]);

  function clearFollowUps() {
    hintRequest.current.id++; hintRequest.current.controller?.abort(); setSecondaryLoading("");
    setStepFeedback({});
    setDetail(null);
    setPractice(null);
    setUnderstandingCheck(null);
    setCheckAnswer("");
    setCheckFeedback(null);
  }

  function applySolution(next: SolveResult) {
    if (!solveResultSchema.safeParse(next).success) {
      setResultReady(false);
      setError("这份历史解析缺少可靠步骤或答案，请重新解析。原题与错题记录已保留。");
      return;
    }
    setSolution(next);
    setStoreSolution(next);
    setResultReady(true);
    setMode(next.explanationMode ?? next.recommendedMode ?? (next.visualization ? "visual" : settings.defaultMode === "concise" ? "concise" : "detailed"));
    setParameters(defaultParameterValues(next.visualization));
    setProgressCount(initialRevealCount(tutoringStyle, next));
    setActiveStep(0);
    setClarificationDraft({});
    clearFollowUps();
  }

  function openStudentWork(work: PhotoWork) {
    const id = "photo:" + crypto.randomUUID();
    const recognition = work.recognition;
    setInitialWork({ id, handwriting: { ...emptyHandwritingSession(), entryKey: id,
      question: recognition.question || question, conditions: recognition.conditions,
      steps: recognition.steps.map(({ id, text, formulas }) => ({ id, text, formulas })), recognition } });
    sessionEntryRef.current = "";
    setPhotoReview(null); setResultReady(false); setStoreSolution(null);
    setPhoto(null); setAnswerMethod("handwriting"); setError(""); setErrorCode("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function applyPhotoResult(result: PhotoTutorResult) {
    sessionEntryRef.current = "";
    window.history.replaceState(null, "", "/solve");
    if (result.kind === "solution") {
      setPhotoReview(null); setAnswerMethod("standard");
      applySolution(result.solution); setQuestion(result.solution.normalizedQuestion);
      if (result.solution.status === "solved") removePhoto();
    } else if (result.kind === "student_work") {
      openStudentWork(result);
    } else {
      setResultReady(false); setStoreSolution(null); setPhotoReview({ ...result, recognition: { ...result.recognition, question: result.recognition.question || question } });
      // The ambiguity itself is retained without the original image on refresh.
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function solveQuestionOnly(text: string) {
    setPhotoReview(null); setAnswerMethod("standard"); setPhoto(null);
    setQuestion(text);
    void solve(modeSelection, text);
  }

  function showError(caught: unknown, fallback: string) {
    if (caught instanceof TutorError) {
      setError(caught.message);
      setErrorCode(caught.code);
    } else {
      setError(fallback);
      setErrorCode("unknown");
    }
  }

  async function solve(selection: ExplanationSelection = modeSelection, confirmedQuestion?: string) {
    if (loading || photoReading) return;
    const trimmed = (confirmedQuestion ?? question).trim();
    // Confirmed supplements use the transcribed text, not the old ambiguous image.
    const solvePhoto = confirmedQuestion === undefined ? photo : null;
    if (photoReview && !solvePhoto && confirmedQuestion === undefined) { setError("请先确认图片是否包含你的解题过程，或重新上传。"); return; }
    if (!trimmed && !solvePhoto) { setError("请输入数学问题，或拍照上传题目。"); return; }
    setLoading(true); setResultReady(false); setStoreSolution(null);
    setMobileView("steps"); setError(""); setErrorCode(""); setRequestNotice(""); clearFollowUps();
    try {
      if (solvePhoto) {
        const result = await callTutor({ action: "photo-tutor", question: trimmed, mode: selection, imageDataUrl: solvePhoto.dataUrl, learningContext, ragEnabled }, { onNotice: setRequestNotice }) as PhotoTutorResult;
        if (mountedRef.current) { applyPhotoResult(result); setMobileView("steps"); }
        return;
      }
      const result = await callTutor({ action: "solve", question: trimmed, mode: selection, imageDataUrl: undefined, learningContext, ragEnabled }, { onNotice: setRequestNotice }) as SolveResult;
      if (!mountedRef.current) return;
      setAnswerMethod("standard"); setPhotoReview(null);
      applySolution(result);
      setQuestion(result.normalizedQuestion);
      setMobileView("steps");
      if (result.status === "solved") {
        setPhoto(null);
        if (photoInputRef.current) photoInputRef.current.value = "";
        toast.success("解析已生成");
      } else toast.message(result.status === "needs_more_info" ? "请补充题目条件" : "请输入数学问题");
    } catch (caught) { if (mountedRef.current) showError(caught, "解析失败，请稍后重试。"); }
    finally { if (mountedRef.current) setLoading(false); }
  }

  function confirmClarification(confirmedQuestion: string) {
    if (loading) return;
    setQuestion(confirmedQuestion);
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    void solve(modeSelection, confirmedQuestion);
  }

  function changeMode(selection: ExplanationMode) {
    if (loading || photoReading || answerMethod === "handwriting" || photoReview) {
      toast.message(answerMethod === "handwriting" || photoReview ? "请先完成解题过程核对，或返回普通答疑后切换。" : "当前请求正在进行，请完成后再切换答疑方式。");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("mode", selection);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setModeSelection(selection);
    setMode(selection);
    if (showResult && solution.status === "solved" && exampleById[solution.id]) {
      const next = exampleExplanation(solution, selection);
      setSolution(next); setStoreSolution(next);
    }
    // Existing AI lessons are genuinely regenerated, not merely relabelled.
    // Offline examples remain available without calling a paid service.
    if (showResult && solution.status === "solved" && !exampleById[solution.id] && mode !== selection) void solve(selection);
  }

  function changeTutoringStyle(value: TutoringStyle) {
    if (tutoringStyle === "complete" && value !== "complete") setProgressCount(solution.steps.length);
    setTutoringStyleOverride(value);
  }

  function revealNextStep() {
    const nextCount = Math.min(revealedCount + 1, solution.steps.length);
    setProgressCount(nextCount);
    setActiveStep(Math.max(0, nextCount - 1));
    setDetail(null);
  }

  function choosePhoto() { photoInputRef.current?.click(); }

  function removePhoto() {
    photoReadId.current++; setPhotoReading(false);
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function selectPhoto(file: File) {
    const ticket = ++photoReadId.current;
    setPhotoReading(true); setError(""); setErrorCode("");
    try {
      const dataUrl = await readQuestionPhoto(file);
      if (ticket !== photoReadId.current || !mountedRef.current) return;
      setPhoto({ dataUrl, name: file.name, size: file.size });
      // Clear only the untouched old example, not a caption typed while reading.
      if (showResult) setQuestion((current) => current.trim() === solution.normalizedQuestion.trim() ? "" : current);
      setPhotoReview(null); setResultReady(false);
    } catch (caught) {
      if (ticket === photoReadId.current && mountedRef.current) setError(caught instanceof Error ? caught.message : "图片读取失败，请重新选择。");
    } finally { if (ticket === photoReadId.current && mountedRef.current) setPhotoReading(false); }
  }

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void selectPhoto(file);
    event.target.value = "";
  }

  async function explainStep(perspective?: "alternative" | "visual" | "foundation" | "hint-only") {
    if (!step) return;
    hintRequest.current.controller?.abort();
    const controller = new AbortController();
    const ticket = ++hintRequest.current.id;
    hintRequest.current.controller = controller;
    setSecondaryLoading("detail"); setError(""); setErrorCode("");
    try {
      const result = await callTutor({ action: "explain-step", question: solution.normalizedQuestion, step, reason: stepFeedback[step.id]?.reason ?? detailReason, mode, perspective, learningContext }, { signal: controller.signal }) as ExplainResult;
      if (!mountedRef.current || ticket !== hintRequest.current.id) return;
      setDetail(result);
      setStepFeedback((previous) => ({ ...previous, [step.id]: { reason: previous[step.id]?.reason ?? detailReason, detail: result } }));
      toast.success(perspective === "hint-only" ? "提示已生成" : "专属讲解已生成");
    } catch (caught) { if (mountedRef.current && ticket === hintRequest.current.id) showError(caught, "无法生成讲解。"); }
    finally { if (mountedRef.current && ticket === hintRequest.current.id) setSecondaryLoading(""); }
  }

  async function makePractice() {
    setSecondaryLoading("practice"); setError(""); setErrorCode("");
    try {
      setPractice(await callTutor({ action: "similar-practice", sourceQuestion: solution.normalizedQuestion, topics: solution.topics, difficulty: solution.difficulty, learningContext }) as PracticeResult);
      toast.success("相似练习已生成");
    } catch (caught) { showError(caught, "无法生成练习题。"); }
    finally { setSecondaryLoading(""); }
  }

  async function generateCheck() {
    setSecondaryLoading("check"); setError(""); setErrorCode(""); setCheckFeedback(null); setCheckAnswer("");
    try {
      setUnderstandingCheck(await callTutor({ action: "generate-check", sourceQuestion: solution.normalizedQuestion, topics: solution.topics, difficulty: solution.difficulty, learningContext }) as UnderstandingCheck);
    } catch (caught) { showError(caught, "无法生成理解检查。"); }
    finally { setSecondaryLoading(""); }
  }

  async function evaluateCheck() {
    if (!understandingCheck || !checkAnswer.trim()) return;
    setSecondaryLoading("evaluate"); setError(""); setErrorCode("");
    try {
      const feedback = await callTutor({ action: "evaluate-answer", sourceQuestion: solution.normalizedQuestion, check: understandingCheck, answer: checkAnswer.trim(), learningContext }) as UnderstandingFeedback;
      setCheckFeedback(feedback);
      recordUnderstandingAttempt({ solutionId: solution.id, topics: solution.topics, status: feedback.status });
      toast.success("已完成理解检查");
    } catch (caught) { showError(caught, "无法评估当前回答。"); }
    finally { setSecondaryLoading(""); }
  }

  function saveMistake() {
    addMistake({ solution, errorReason, note });
    toast.success("已加入错题集");
    setNote("");
  }

  if (!sessionReady) return <main className="mx-auto max-w-[1540px] p-8 text-muted-foreground" role="status">正在恢复本次答疑…</main>;

  return (
    <main className="solve-workspace mx-auto max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div><p className="mb-1 text-sm font-medium text-primary dark:text-primary">智能答疑工作台</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">把题目变成看得见的推理</h1></div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><a className="font-medium text-primary underline-offset-4 hover:underline" href="/solve?example=example-triple-integral&mode=visual">试用三重积分示例</a><span aria-hidden="true">·</span><span className={cn("size-2 rounded-full", hasKey ? "bg-emerald-500" : "bg-amber-500")} />{hasKey ? "DeepSeek 已配置" : <><span>当前可使用内置示例</span><a className="font-medium text-primary underline-offset-4 hover:underline" href="/settings">配置密钥</a></>}</div>
      </div>

      {answerMethod === "handwriting" ? <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted-foreground">已转入过程辅导：核对你的步骤后，检查思路并获取下一步提示。</p><Button variant="outline" onClick={() => { setAnswerMethod("standard"); setMobileView("input"); }}>重新输入或上传题目</Button></div>
        <HandwritingWorkspace key={initialWork?.id ?? "restored-work"} embedded onUseQuestion={solveQuestionOnly} initialRecord={initialWork ?? (() => { const record = sessionEntryRef.current === `mistake:${mistakeId}` && mistakes.find((item) => item.id === mistakeId); return record && record.handwriting ? { id: record.id, handwriting: record.handwriting } : undefined; })()} />
      </> : <>
      {photoReview && <section aria-label="核对图片内容" className="mb-5 space-y-3 rounded-xl border border-amber-500/30 bg-card p-4">
        <h2 className="font-medium">图片里包含你的解题过程吗？</h2><p className="text-sm text-muted-foreground"><MathText value={photoReview.reason} /></p>
        <label className="block space-y-2 text-sm">核对原题<Textarea aria-label="图片核对题目" maxLength={2000} spellCheck={false} value={photoReview.recognition.question} onChange={(e) => setPhotoReview({ ...photoReview, recognition: { ...photoReview.recognition, question: e.target.value } })} /><MathInputPreview value={photoReview.recognition.question} /></label>
        {photoReview.recognition.steps.map((step, i) => <div key={step.id} className="rounded-lg border p-3 text-sm"><span>可能的步骤 {i + 1}：</span><MathText value={step.text} />{step.formulas.map((formula, j) => <MathFormula key={j} value={formula} />)}</div>)}
        {[...photoReview.recognition.warnings, ...photoReview.recognition.uncertainties.map((a) => a.description)].map((warning, i) => <p key={i} className="text-sm text-muted-foreground"><MathText value={warning} /></p>)}
        <div className="flex flex-wrap gap-2"><Button disabled={loading || !photoReview.recognition.question.trim()} onClick={() => solveQuestionOnly(photoReview.recognition.question)}>只有题目，开始普通答疑</Button><Button variant="outline" disabled={loading} onClick={() => openStudentWork(photoReview)}>包含我的解题过程，先帮我点拨</Button><Button variant="ghost" disabled={loading} onClick={() => { setPhotoReview(null); setMobileView("input"); }}>重新上传</Button></div>
      </section>}
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1 lg:hidden" role="tablist" aria-label="答疑区域切换">
        {[["input", "题目"], ["steps", "解析"]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mobileView === value} className={cn("rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", mobileView === value ? "bg-background" : "text-muted-foreground")} onClick={() => setMobileView(value)}>{label}</button>)}
      </div>

      {error && <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-start"><div className="flex flex-1 items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>{errorCode === "missing_key" && <Button asChild size="sm" variant="outline"><a href="/settings">前往设置</a></Button>}</div>}
      {requestNotice && <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{requestNotice}</p>}
      {sessionSaveFailed && <p role="status" className="mb-4 text-sm text-amber-800 dark:text-amber-200">浏览器无法暂存本次答疑，切换页面前请复制题目和笔记，或检查会话存储权限。</p>}

      <div className="solve-layout grid items-start gap-6">
        <Card className={cn("solve-input min-w-0 gap-0 py-0", mobileView !== "input" && "hidden lg:flex")}>
          <CardHeader className="border-b py-4"><CardTitle className="flex flex-wrap items-center gap-2 text-base"><BookOpenCheck className="size-4 text-primary" />题目输入<span aria-label="当前答疑方式" className="ml-auto text-xs font-normal text-muted-foreground">{modeSelection === "auto" ? "自动匹配" : modeLabels[modeSelection] + "答疑"}</span></CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5">
            <Textarea value={question} maxLength={2000} disabled={loading} spellCheck={false} onPaste={(event) => { const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/")); if (image) { event.preventDefault(); void selectPhoto(image); } }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void solve(); } }} onChange={(event) => {
              setQuestion(event.target.value);
              setPhotoReview(null);
              if (resultReady) setResultReady(false);
            }} className="min-h-36 resize-none text-base leading-7" aria-label="数学题目" placeholder="例如：求函数 f(x)=x²-4x+3 的零点与顶点。" />
            <MathInputPreview value={question} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ragEnabled} disabled={loading} onChange={(event) => setRagEnabled(event.target.checked)} />使用课程知识库辅助解题</label>
            <p className="-mt-2 text-xs leading-5 text-muted-foreground">按“课程知识检索”中选择的教材检索；解析后可查看引用依据。</p>
            <input ref={photoInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={handlePhoto} disabled={loading} aria-label="拍照或选择数学题图片" />
            {photo ? <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.05]"><div className="relative aspect-[16/9] bg-slate-950/5 dark:bg-slate-950/40"><img src={photo.dataUrl} alt="待识别题目预览" className="size-full object-contain" /><Button type="button" variant="secondary" size="icon" className="absolute right-2 top-2 size-8 rounded-full" onClick={removePhoto} disabled={loading} aria-label="移除题目图片"><X /></Button></div><div className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="min-w-0 truncate text-muted-foreground">{photo.name}</span><span className="shrink-0 text-primary dark:text-primary">{(photo.size / 1024 / 1024).toFixed(1)} MB</span></div></div> : <Button type="button" variant="outline" className="w-full border-dashed" onClick={choosePhoto} disabled={loading}><Camera />拍照 / 选择题目图片</Button>}
            <PhotoUploadNotice />

            <div className="grid gap-3">
              <label><span className="mb-2 block text-sm text-muted-foreground">辅导方式</span><Select value={tutoringStyle} onValueChange={(value) => changeTutoringStyle(value as TutoringStyle)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(tutoringStyleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            </div>
            {showResult && solution.status === "solved" && solution.recommendedMode && <p className="text-sm leading-6 text-muted-foreground">{exampleById[solution.id] ? "示例推荐" : "AI 推荐"}：{modeLabels[solution.recommendedMode]}{solution.modeReason && ` · ${solution.modeReason}`}{solution.explanationMode !== solution.recommendedMode && <span className="block">当前采用：{modeLabels[mode]}</span>}</p>}
            {showResult && !exampleById[solution.id] && solution.status === "solved" && <p className="text-sm text-muted-foreground">切换讲解方式会重新调用 AI 生成解析。</p>}
            <Button size="lg" className="w-full" onClick={() => void solve()} disabled={loading || photoReading || !!photoReview}>{photoReading ? <><Loader2 className="animate-spin" />正在读取图片…</> : loading ? <><Loader2 className="animate-spin" />{photo ? "正在识别图片并选择辅导方式" : "正在核对题目并生成解析"}</> : <>{photo ? "识别并解析" : "开始解析"}</>}</Button>
          </CardContent>
        </Card>

        <Card className={cn("solve-lesson min-w-0 gap-0 py-0", mobileView !== "steps" && "hidden lg:flex")}>
          <CardHeader className="border-b py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">{showResult ? solution.subject + " · " + solution.questionType : "题目解析"}</p><CardTitle className="mt-1 text-base">{loading ? "正在核对题目与生成解析…" : showResult ? statusText : "等待题目解析"}</CardTitle></div>{showResult && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary dark:text-primary">{solution.difficulty}</span>}</div></CardHeader>
          <CardContent className="p-5">
            {!showResult ? <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">{loading ? <><Loader2 className="size-4 animate-spin" />先核对题目条件，再生成合适的讲解。</> : error ? "本次未获得有效解析。输入已保留，可修改或重试。" : "提交题目后显示解析。"}</div> : <>
            <p className="mb-4 text-sm leading-6"><MathText value={solution.normalizedQuestion} /></p>
            {solution.status === "solved" && <p role="status" className="mb-4 text-sm text-muted-foreground">{mode === "concise" ? "简洁答疑 · 关键操作、必要条件与结论；可按需展开说明。" : mode === "detailed" ? "详细答疑 · 逐步理解目标、推理依据与自检方法。" : "可视化答疑 · 结合必要图像理解每一步。"}</p>}
            {solution.rag && <KnowledgeEvidence rag={solution.rag} />}
            {solution.status === "solved" && completedFlow && <MultiMethodPanel key={solution.id} solution={solution} learningContext={learningContext} />}
            {solution.status !== "solved" && <div role="status" className="mb-4 rounded-xl bg-amber-500/8 p-4 text-sm text-amber-800 dark:text-amber-200"><p><MathText value={solution.inputAssessment?.classification !== "complete" && solution.inputAssessment?.message || solution.limitations.join("；") || "请补充题目条件后重新提交。"} /></p></div>}
            {solution.status === "needs_more_info" && <QuestionClarification question={solution.normalizedQuestion} questions={clarificationQuestionsFor(solution)} value={clarificationDraft} onChange={setClarificationDraft} onConfirm={confirmClarification} disabled={loading} />}
            {solution.status === "solved" && solution.steps.length > 0 && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-4 py-3 text-sm"><span>{tutoringStyleLabels[tutoringStyle]}</span><span className="text-muted-foreground">已展开 {revealedCount}/{solution.steps.length} 步</span></div>}
            {solution.status === "solved" && revealedCount === 0 && <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-5"><p className="flex items-center gap-2 text-sm font-medium text-primary dark:text-primary"><Lightbulb className="size-4" />先想一想</p><p className="mt-3 text-sm leading-7">这是一道关于“{solution.topics.join("、")}”的题。你准备从哪个已知条件或基本公式开始？</p>{solution.steps[0]?.basis && <p className="mt-3 text-xs leading-5 text-muted-foreground">小提示：回忆 <MathText value={solution.steps[0].basis} /></p>}<Button className="mt-4 w-full" variant="secondary" onClick={revealNextStep}>查看第一步</Button></div>}
            <div className={cn("lesson-steps", mode === "concise" ? "space-y-3" : "space-y-6")}>{visibleSteps.map((item, index) => <article key={solution.id + ":" + item.id} className="lesson-step" data-step-id={item.id} aria-label={`第${index + 1}步：${item.title}`}>
              <div className="flex items-start gap-3"><span className="step-number">{index + 1}</span><h2 className="min-w-0 text-lg font-medium"><MathText value={item.title} /></h2></div>
              <SolutionStepContent step={item} mode={mode} rag={solution.rag} />
              {showPlot && visual && <StepVisualization solution={solution} spec={visual} step={item} parameters={parameters} onChange={setParameters} />}
              <StepTutoringPanel step={item} question={solution.normalizedQuestion} mode={mode} learningContext={learningContext}
                value={stepFeedback[item.id] ?? { reason: "我不理解这一步为什么这样变形", detail: null }}
                onFocus={() => setActiveStep(index)} onChange={(next) => { setStepFeedback((previous) => ({ ...previous, [item.id]: next })); setDetailReason(next.reason); setDetail(next.detail); }} />
            </article>)}</div>
            {solution.status === "solved" && revealedCount > 0 && !completedFlow && <div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => explainStep("hint-only")} disabled={!step || secondaryLoading === "detail"}>{secondaryLoading === "detail" ? <Loader2 className="animate-spin" /> : <Lightbulb />}给更小提示</Button><Button onClick={revealNextStep}><Check />我理解了，继续</Button></div>}
            {solution.status === "solved" && completedFlow && <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-4" />最终答案</p>{solution.finalAnswerLatex && <MathFormula value={solution.finalAnswerLatex} />}{solution.finalAnswerText && <p className="text-sm leading-7"><MathText value={solution.finalAnswerText} /></p>}</div>}

            {solution.status === "solved" && completedFlow && <div className="mt-5 rounded-xl border border-primary/25 bg-primary/[0.04] p-4"><div className="flex items-center gap-2"><Target className="size-4 text-primary" /><p className="text-sm font-medium">理解检查</p></div>{!understandingCheck ? <><p className="mt-2 text-sm leading-6 text-muted-foreground">用一道小题确认你掌握了方法，而不只是看懂答案。结果只用于学习反馈，不会自动标记“已掌握”。</p><Button className="mt-3 w-full" variant="outline" onClick={generateCheck} disabled={secondaryLoading === "check"}>{secondaryLoading === "check" ? <Loader2 className="animate-spin" /> : <CircleHelp />}生成理解检查</Button></> : <div className="mt-3 space-y-3"><p className="text-sm leading-7"><MathText value={understandingCheck.question} /></p><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">需要一点提示</summary><p className="mt-2 rounded-lg bg-background/70 p-3"><MathText value={understandingCheck.hint} /></p></details><Textarea value={checkAnswer} onChange={(event) => setCheckAnswer(event.target.value)} placeholder="写下你的思路或答案" className="min-h-24" /><Button className="w-full" onClick={evaluateCheck} disabled={!checkAnswer.trim() || secondaryLoading === "evaluate"}>{secondaryLoading === "evaluate" ? <Loader2 className="animate-spin" /> : <Check />}检查我的理解</Button>{checkFeedback && <div className="space-y-3 rounded-xl border bg-background/70 p-4"><p className="text-sm font-medium">{checkFeedback.status === "correct" ? "理解正确" : checkFeedback.status === "partially_correct" ? "方向基本正确，还可补充" : checkFeedback.status === "incorrect" ? "这里需要再理清一步" : "暂时无法可靠判断"}</p><p className="text-sm leading-6 text-muted-foreground"><MathText value={checkFeedback.explanation} /></p>{checkFeedback.strengths.length > 0 && <p className="text-sm text-emerald-700 dark:text-emerald-300">做得好：<MathText value={checkFeedback.strengths.join("；")} /></p>}{checkFeedback.issues.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-200">需要留意：<MathText value={checkFeedback.issues.join("；")} /></p>}{checkFeedback.nextHint && <p className="text-sm">下一条提示：<MathText value={checkFeedback.nextHint} /></p>}{checkFeedback.answerLatex && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">查看参考答案</summary><div className="mt-2"><MathFormula value={checkFeedback.answerLatex} /></div></details>}</div>}</div>}</div>}
            {solution.status === "solved" && solution.limitations.length > 0 && <p className="mt-4 text-sm text-muted-foreground"><MathText value={solution.limitations.join("；")} /></p>}
            </>}
            {showResult && solution.status === "solved" && <section aria-label="练习与收藏" className="lesson-collection mt-6"><h2 className="px-5 pt-5 text-lg">练习与收藏</h2>
            <div className="space-y-3 border-t p-5"><p className="text-sm font-medium">加入错题集</p><Select value={errorReason} onValueChange={setErrorReason}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select><Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" placeholder="写下当时的错误思路或复习提醒（可选）" /><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={makePractice} disabled={secondaryLoading === "practice" || solution.status !== "solved"}>{secondaryLoading === "practice" ? <Loader2 className="animate-spin" /> : <Sparkles />}相似练习</Button><Button onClick={saveMistake} disabled={solution.status !== "solved"}><Save />收藏错题</Button></div>{practice && <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4"><p className="text-xs font-medium text-primary dark:text-primary">相似练习 · {practice.difficulty}</p><p className="mt-2 text-sm leading-6"><MathText value={practice.question} /></p><details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">查看提示和答案</summary><p className="mt-2 text-muted-foreground"><MathText value={practice.hint} /></p><div className="mt-2"><MathFormula value={practice.answerLatex} /></div></details></div>}</div>
            {practice && <Button asChild variant="outline" className="mx-5 mb-5"><a href={`/solve?question=${encodeURIComponent(practice.question)}&auto=1`}>继续解析这道相似题</a></Button>}

            </section>}
          </CardContent>
        </Card>


      </div>
      </>}
    </main>
  );
}
