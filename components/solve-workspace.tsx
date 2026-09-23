"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, BookOpenCheck, BrainCircuit, Camera, Check, FlaskConical, Lightbulb, Loader2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MathFormula } from "@/components/math-formula";
import { MathPlot } from "@/components/math-plot";
import { examples, exampleById } from "@/lib/examples";
import { defaultParameterValues } from "@/lib/math";
import type { ExplainResult, ExplanationMode, PracticeResult, SolveResult } from "@/lib/math-schema";
import { getApiKey } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";
import { callTutor, TutorError } from "@/lib/tutor-client";
import { cn } from "@/lib/utils";

const modeLabels: Record<ExplanationMode, string> = { concise: "简洁", detailed: "详细", visual: "可视化" };
const reasons = ["概念没有理解", "公式不会使用", "计算过程出错", "图像与公式联系不清", "其他"];
const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const maxImageBytes = 8 * 1024 * 1024;

export function SolveWorkspace() {
  const searchParams = useSearchParams();
  const storeSolution = useMathLabStore((state) => state.currentSolution);
  const setStoreSolution = useMathLabStore((state) => state.setCurrentSolution);
  const addMistake = useMathLabStore((state) => state.addMistake);
  const settings = useMathLabStore((state) => state.settings);
  const mistakes = useMathLabStore((state) => state.mistakes);
  const practiceMistake = useMathLabStore((state) => state.practiceMistake);

  const requestedExample = searchParams.get("example");
  const mistakeId = searchParams.get("mistake");
  const customQuestion = searchParams.get("question");
  const practicedRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const initial = (requestedExample && exampleById[requestedExample]) || (mistakeId && mistakes.find((item) => item.id === mistakeId)?.solution) || storeSolution || examples[0];
  const [question, setQuestion] = useState(customQuestion || initial.normalizedQuestion);
  const [solution, setSolution] = useState<SolveResult>(initial);
  const [mode, setMode] = useState<ExplanationMode>(settings.defaultMode);
  const [activeStep, setActiveStep] = useState(0);
  const [parameters, setParameters] = useState<Record<string, number>>(defaultParameterValues(initial.visualization));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileView, setMobileView] = useState("input");
  const [errorReason, setErrorReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [detailReason, setDetailReason] = useState("我不理解这一步为什么这样变形");
  const [detail, setDetail] = useState<ExplainResult | null>(null);
  const [practice, setPractice] = useState<PracticeResult | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState<"detail" | "practice" | "">("");
  const [hasKey, setHasKey] = useState(false);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string; size: number } | null>(null);

  useEffect(() => {
    const update = () => setHasKey(Boolean(getApiKey()));
    update();
    window.addEventListener("mathlab:key-change", update);
    return () => window.removeEventListener("mathlab:key-change", update);
  }, []);

  useEffect(() => {
    if (!mistakeId) return;
    const next = mistakes.find((item) => item.id === mistakeId)?.solution;
    if (!next || practicedRef.current === mistakeId) return;
    const timer = window.setTimeout(() => {
      setQuestion(next.normalizedQuestion);
      setSolution(next);
      setStoreSolution(next);
      setParameters(defaultParameterValues(next.visualization));
      setActiveStep(0);
      practicedRef.current = mistakeId;
      practiceMistake(mistakeId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedExample, mistakeId, mistakes, practiceMistake, setStoreSolution]);

  const step = solution.steps[activeStep];
  const activeLayerIds = step?.visualLayerIds ?? [];
  const visual = solution.visualization;
  const statusText = solution.status === "solved" ? "解析完成" : solution.status === "needs_more_info" ? "需要补充条件" : "暂不支持";

  async function solve() {
    const trimmed = question.trim();
    if (trimmed.length < 3 && !photo) { setError("请输入完整的数学题目，或拍照上传题目。"); return; }
    setLoading(true); setError(""); setDetail(null); setPractice(null);
    try {
      const result = await callTutor({ action: "solve", question: trimmed, mode, imageDataUrl: photo?.dataUrl }) as SolveResult;
      setSolution(result);
      setQuestion(result.normalizedQuestion);
      setStoreSolution(result);
      setParameters(defaultParameterValues(result.visualization));
      setActiveStep(0);
      setMobileView("steps");
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      toast.success("解析已生成");
    } catch (caught) {
      setError(caught instanceof TutorError ? caught.message : "解析失败，请稍后重试。");
    } finally { setLoading(false); }
  }

  function loadExample(example: SolveResult) {
    setQuestion(example.normalizedQuestion);
    setSolution(example);
    setStoreSolution(example);
    setParameters(defaultParameterValues(example.visualization));
    setActiveStep(0); setDetail(null); setPractice(null); setError("");
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    window.history.replaceState(null, "", "/solve?example=" + example.id);
  }

  function choosePhoto() {
    photoInputRef.current?.click();
  }

  function removePhoto() {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type)) {
      setError("仅支持 JPG、PNG、WebP 或 GIF 图片。");
      event.target.value = "";
      return;
    }
    if (file.size > maxImageBytes) {
      setError("图片不能超过 8 MB，请压缩或裁剪后重试。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("图片读取失败，请重新选择。");
        return;
      }
      setPhoto({ dataUrl: reader.result, name: file.name, size: file.size });
      setError("");
    };
    reader.onerror = () => setError("图片读取失败，请重新选择。");
    reader.readAsDataURL(file);
  }

  async function explainStep() {
    if (!step) return;
    setSecondaryLoading("detail"); setError("");
    try {
      setDetail(await callTutor({ action: "explain-step", question: solution.normalizedQuestion, step, reason: detailReason, mode }) as ExplainResult);
      toast.success("专属讲解已生成");
    } catch (caught) { setError(caught instanceof TutorError ? caught.message : "无法生成讲解。"); }
    finally { setSecondaryLoading(""); }
  }

  async function makePractice() {
    setSecondaryLoading("practice"); setError("");
    try {
      setPractice(await callTutor({ action: "similar-practice", sourceQuestion: solution.normalizedQuestion, topics: solution.topics, difficulty: solution.difficulty }) as PracticeResult);
      toast.success("相似练习已生成");
    } catch (caught) { setError(caught instanceof TutorError ? caught.message : "无法生成练习题。"); }
    finally { setSecondaryLoading(""); }
  }

  function saveMistake() {
    addMistake({ solution, errorReason, note });
    toast.success("已加入错题集");
    setNote("");
  }

  return (
    <main className="mx-auto max-w-[1540px] px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div><p className="mb-1 text-sm font-medium text-cyan-600 dark:text-cyan-400">智能答疑工作台</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">把题目变成看得见的推理</h1></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className={cn("size-2 rounded-full", hasKey ? "bg-emerald-500" : "bg-amber-500")} />{hasKey ? "DeepSeek 已配置" : <><span>当前可使用内置示例</span><Link className="font-medium text-cyan-600 underline-offset-4 hover:underline" href="/settings">配置密钥</Link></>}</div>
      </div>

      <div className="mb-4 grid grid-cols-3 rounded-xl bg-muted p-1 lg:hidden" role="tablist" aria-label="答疑区域切换">
        {[["input", "题目"], ["steps", "解析"], ["visual", "图像"]].map(([value, label]) => <button key={value} className={cn("rounded-lg px-3 py-2 text-sm font-medium", mobileView === value ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => setMobileView(value)}>{label}</button>)}
      </div>

      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-800 dark:text-amber-200"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>}

      <div className="grid items-start gap-4 lg:grid-cols-[0.9fr_1.08fr_1.12fr]">
        <Card className={cn("gap-0 py-0", mobileView !== "input" && "hidden lg:flex")}>
          <CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="size-4 text-cyan-500" />题目输入</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5">
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-36 resize-none text-base leading-7" aria-label="数学题目" placeholder="例如：求函数 f(x)=x²-4x+3 的零点与顶点。" />
            <input ref={photoInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={handlePhoto} aria-label="拍照或选择数学题图片" />
            {photo ? (
              <div className="overflow-hidden rounded-xl border border-cyan-500/30 bg-cyan-500/[0.05]">
                <div className="relative aspect-[16/9] bg-slate-950/5 dark:bg-slate-950/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl} alt="待识别题目预览" className="size-full object-contain" />
                  <Button type="button" variant="secondary" size="icon" className="absolute right-2 top-2 size-8 rounded-full" onClick={removePhoto} aria-label="移除题目图片"><X /></Button>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{photo.name}</span>
                  <span className="shrink-0 text-cyan-700 dark:text-cyan-300">{(photo.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={choosePhoto}><Camera />拍照 / 选择题目图片</Button>
            )}
            <p className="-mt-2 text-xs leading-5 text-muted-foreground">支持 JPG、PNG、WebP、GIF，最大 8 MB。原图仅用于本次识别，不会保存到错题集。</p>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">解析方式</p>
              <Tabs value={mode} onValueChange={(value) => setMode(value as ExplanationMode)}>
                <TabsList className="grid w-full grid-cols-3">{Object.entries(modeLabels).map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
              </Tabs>
            </div>
            <Button size="lg" className="w-full" onClick={solve} disabled={loading}>{loading ? <><Loader2 className="animate-spin" />{photo ? "正在识别并解析" : "正在分析题目"}</> : <>{photo ? "识别并解析" : "开始解析"}<ArrowRight /></>}</Button>
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">离线演示题</p>
              <div className="space-y-2">{examples.map((example) => <Button key={example.id} variant={example.id === solution.id ? "secondary" : "outline"} className="h-auto w-full justify-start py-3 text-left whitespace-normal" onClick={() => loadExample(example)}><FlaskConical className="shrink-0 text-cyan-500" /><span><span className="block text-sm font-medium">{example.questionType}</span><span className="line-clamp-1 text-xs text-muted-foreground">{example.normalizedQuestion}</span></span></Button>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("gap-0 py-0", mobileView !== "steps" && "hidden lg:flex")}>
          <CardHeader className="border-b py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">{solution.subject} · {solution.questionType}</p><CardTitle className="mt-1 text-base">{statusText}</CardTitle></div><span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">{solution.difficulty}</span></div></CardHeader>
          <CardContent className="p-5">
            {solution.status !== "solved" && <div className="mb-4 rounded-xl bg-amber-500/8 p-4 text-sm text-amber-800 dark:text-amber-200">{solution.limitations.join("；") || "请补充题目条件后重新提交。"}</div>}
            <div className="space-y-3">{solution.steps.map((item, index) => <button key={item.id} onClick={() => { setActiveStep(index); setMobileView("visual"); setDetail(null); }} className={cn("w-full rounded-xl border p-4 text-left transition", index === activeStep ? "border-cyan-500/50 bg-cyan-500/[0.06] shadow-sm" : "border-border/75 hover:border-cyan-500/30")}><div className="flex gap-3"><span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold", index <= activeStep ? "bg-cyan-500 text-slate-950" : "bg-muted text-muted-foreground")}>{index + 1}</span><div className="min-w-0"><h3 className="font-medium">{item.title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.explanation}</p>{index === activeStep && item.formulas.map((formula) => <div className="mt-3" key={formula}><MathFormula value={formula} /></div>)}{index === activeStep && item.basis && <p className="mt-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><Lightbulb className="mt-0.5 size-4 shrink-0" />依据：{item.basis}</p>}</div></div></button>)}</div>

            {solution.status === "solved" && <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-4" />最终答案</p><MathFormula value={solution.finalAnswerLatex} /></div>}

            <div className="mt-5 rounded-xl border border-border bg-muted/35 p-4">
              <p className="text-sm font-medium">这一步哪里没看懂？</p>
              <Input className="mt-2" value={detailReason} onChange={(event) => setDetailReason(event.target.value)} />
              <Button className="mt-3 w-full" variant="secondary" onClick={explainStep} disabled={!step || secondaryLoading === "detail"}>{secondaryLoading === "detail" ? <Loader2 className="animate-spin" /> : <BrainCircuit />}生成专属讲解</Button>
              {detail && <div className="mt-4 space-y-3 border-t pt-4"><h3 className="font-medium">{detail.title}</h3><p className="text-sm leading-7 text-muted-foreground">{detail.explanation}</p>{detail.formulas.map((formula) => <MathFormula key={formula} value={formula} />)}{detail.analogy && <p className="rounded-lg bg-cyan-500/8 p-3 text-sm">类比：{detail.analogy}</p>}{detail.checkQuestion && <p className="text-sm font-medium">检查理解：{detail.checkQuestion}</p>}</div>}
            </div>
          </CardContent>
        </Card>

        <Card className={cn("gap-0 overflow-hidden py-0", mobileView !== "visual" && "hidden lg:flex")}>
          <CardHeader className="border-b py-4"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-cyan-500" />实时可视化</CardTitle><span className="text-xs text-muted-foreground">拖动 · 缩放 · 图层开关</span></div></CardHeader>
          <CardContent className="p-0">
            {visual ? <><MathPlot spec={visual} parameters={parameters} activeLayerIds={activeLayerIds} /><div className="border-t p-5">{visual.parameters.map((parameter) => <div key={parameter.key} className="mb-4 last:mb-0"><div className="mb-3 flex justify-between text-sm"><label>{parameter.label}</label><span className="font-mono text-cyan-600 dark:text-cyan-300">{parameters[parameter.key]?.toFixed(1)}</span></div><Slider min={parameter.min} max={parameter.max} step={parameter.step} value={[parameters[parameter.key] ?? parameter.defaultValue]} onValueChange={(value) => setParameters((current) => ({ ...current, [parameter.key]: value[0] }))} aria-label={parameter.label} /></div>)}</div></> : <div className="grid min-h-[420px] place-items-center p-8 text-center text-sm text-muted-foreground"><div><AlertCircle className="mx-auto mb-3 size-8 opacity-50" />这道题暂时没有可用的二维图像。</div></div>}

            <div className="space-y-3 border-t p-5">
              <p className="text-sm font-medium">加入错题集</p>
              <Select value={errorReason} onValueChange={setErrorReason}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" placeholder="写下当时的错误思路或复习提醒（可选）" />
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={makePractice} disabled={secondaryLoading === "practice"}>{secondaryLoading === "practice" ? <Loader2 className="animate-spin" /> : <Sparkles />}相似练习</Button><Button onClick={saveMistake}><Save />收藏错题</Button></div>
              {practice && <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-4"><p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">相似练习 · {practice.difficulty}</p><p className="mt-2 text-sm leading-6">{practice.question}</p><details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">查看提示和答案</summary><p className="mt-2 text-muted-foreground">{practice.hint}</p><div className="mt-2"><MathFormula value={practice.answerLatex} /></div></details></div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
