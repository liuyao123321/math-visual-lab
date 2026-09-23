"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, BookOpenCheck, ChartNoAxesCombined, FunctionSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { examples } from "@/lib/examples";
import { useMathLabStore } from "@/lib/store";

export function HomeDashboard() {
  const router = useRouter();
  const [question, setQuestion] = useState("求函数 f(x)=x²-4x+3 的零点、顶点，并结合图像说明。");
  const mistakes = useMathLabStore((state) => state.mistakes);
  const mastered = mistakes.filter((item) => item.mastery === "mastered").length;

  function start() {
    if (question.trim()) router.push("/solve?question=" + encodeURIComponent(question.trim()));
  }

  return (
    <main className="mx-auto max-w-[1540px] px-4 py-8 lg:px-8 lg:py-12">
      <section className="grid items-stretch gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="relative overflow-hidden rounded-[1.6rem] bg-[#0b2639] p-7 text-white shadow-2xl shadow-slate-950/15 md:p-10">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="relative z-10">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm text-cyan-100"><Sparkles className="size-4" />不只给答案，更展示为什么</p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.12] tracking-[-0.045em] md:text-6xl">把抽象公式，变成看得见的推理。</h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">输入高等数学题，逐步查看依据，让函数、切线与积分区域随思路同步变化。</p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
              <label htmlFor="home-question" className="mb-2 block text-sm font-medium text-cyan-100">现在想解决什么题？</label>
              <Textarea id="home-question" value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-28 border-white/15 bg-slate-950/25 text-base leading-7 text-white placeholder:text-slate-500" />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button size="lg" className="flex-1 bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={start}>进入答疑工作台<ArrowRight /></Button><Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href="/settings">配置 DeepSeek</Link></Button></div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <article className="laboratory-panel col-span-full p-6">
            <div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">学习概览</p><h2 className="mt-1 text-xl font-semibold">你的数学实验记录</h2></div><BarChart3 className="size-7 text-cyan-500" /></div>
            <div className="mt-6 grid grid-cols-3 gap-3"><div className="rounded-xl bg-muted/65 p-4"><p className="text-2xl font-semibold">{mistakes.length}</p><p className="mt-1 text-xs text-muted-foreground">错题总数</p></div><div className="rounded-xl bg-muted/65 p-4"><p className="text-2xl font-semibold">{mastered}</p><p className="mt-1 text-xs text-muted-foreground">已掌握</p></div><div className="rounded-xl bg-muted/65 p-4"><p className="text-2xl font-semibold">{mistakes.reduce((sum, item) => sum + item.attempts, 0)}</p><p className="mt-1 text-xs text-muted-foreground">复习次数</p></div></div>
          </article>
          <article className="laboratory-panel p-6"><ChartNoAxesCombined className="mb-5 size-7 text-cyan-500" /><h2 className="font-semibold">图像随步骤变化</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">点击解析步骤，突出当前相关的曲线、切线、零点或面积。</p></article>
          <article className="laboratory-panel p-6"><BookOpenCheck className="mb-5 size-7 text-amber-500" /><h2 className="font-semibold">错题形成复习闭环</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">记录错误原因和掌握状态，报告会自动识别薄弱知识点。</p></article>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-medium text-cyan-600 dark:text-cyan-400">无需密钥也能演示</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">从三个典型问题开始</h2></div><Button asChild variant="ghost"><Link href="/solve">打开工作台<ArrowRight /></Link></Button></div>
        <div className="grid gap-4 md:grid-cols-3">{examples.map((example, index) => <Link key={example.id} href={"/solve?example=" + example.id} className="laboratory-panel group p-6 transition hover:-translate-y-1 hover:border-cyan-500/40"><div className="flex items-center justify-between"><span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{example.questionType}</span><span className="font-mono text-sm text-cyan-600 dark:text-cyan-300">0{index + 1}</span></div><FunctionSquare className="mt-8 size-8 text-cyan-500" /><h3 className="mt-4 font-semibold">{example.topics.join(" · ")}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{example.normalizedQuestion}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 dark:text-cyan-300">查看完整解析<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span></Link>)}</div>
      </section>
    </main>
  );
}
