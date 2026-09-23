"use client";

import Link from "next/link";
import { BarChart3, BookOpenCheck, CheckCircle2, Lightbulb, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { reportSummary } from "@/lib/math";
import { useMathLabStore } from "@/lib/store";

const topicConfig = { count: { label: "待复习错题", color: "#22d3ee" } } satisfies ChartConfig;
const masteryConfig = {
  value: { label: "题目数" },
  mastered: { label: "已掌握", color: "#10b981" },
  pending: { label: "复习中", color: "#f59e0b" },
} satisfies ChartConfig;

export function ReportView() {
  const mistakes = useMathLabStore((state) => state.mistakes);
  const summary = reportSummary(mistakes);
  const masteryData = [
    { name: "已掌握", value: summary.mastered, fill: "#10b981" },
    { name: "待巩固", value: summary.total - summary.mastered, fill: "#f59e0b" },
  ];
  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const key = date.toISOString().slice(0, 10);
    return { day: (date.getMonth() + 1) + "/" + date.getDate(), count: summary.dayCounts.get(key) ?? 0 };
  });

  if (!mistakes.length) return (
    <main className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
      <div><p className="text-sm font-medium text-cyan-600 dark:text-cyan-300">学习报告</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">让每次出错都有下一步</h1></div>
      <section className="mt-8 grid min-h-[430px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 text-center"><div className="max-w-md p-8"><BarChart3 className="mx-auto size-12 text-muted-foreground/45" /><h2 className="mt-5 text-xl font-semibold">完成第一条错题记录后，这里会生成报告</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">报告会分析掌握率、薄弱知识点和最近七天的复习节奏。</p><Button asChild className="mt-6"><Link href="/solve?example=example-quadratic">从示例题开始</Link></Button></div></section>
    </main>
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-sm font-medium text-cyan-600 dark:text-cyan-300">学习报告</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">让数据告诉你下一步复习什么</h1><p className="mt-2 text-sm text-muted-foreground">统计仅来自当前浏览器中的错题记录。</p></div><Button asChild variant="outline"><Link href="/mistakes">管理错题</Link></Button></div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="laboratory-panel p-5"><BookOpenCheck className="size-5 text-cyan-500" /><p className="mt-5 text-3xl font-semibold">{summary.total}</p><p className="mt-1 text-sm text-muted-foreground">错题总数</p></article>
        <article className="laboratory-panel p-5"><CheckCircle2 className="size-5 text-emerald-500" /><p className="mt-5 text-3xl font-semibold">{summary.mastered}</p><p className="mt-1 text-sm text-muted-foreground">已经掌握</p></article>
        <article className="laboratory-panel p-5"><Target className="size-5 text-amber-500" /><p className="mt-5 text-3xl font-semibold">{summary.masteredRate}%</p><p className="mt-1 text-sm text-muted-foreground">总体掌握率</p></article>
        <article className="laboratory-panel p-5"><BarChart3 className="size-5 text-violet-500" /><p className="mt-5 text-3xl font-semibold">{mistakes.reduce((sum, item) => sum + item.attempts, 0)}</p><p className="mt-1 text-sm text-muted-foreground">累计复习次数</p></article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="laboratory-panel p-5"><div className="mb-5"><h2 className="font-semibold">薄弱知识点</h2><p className="mt-1 text-sm text-muted-foreground">按尚未掌握的错题数量排序</p></div><ChartContainer config={topicConfig} className="h-[300px] w-full"><BarChart accessibilityLayer data={summary.weakTopics} layout="vertical" margin={{ left: 20, right: 20 }}><CartesianGrid horizontal={false} /><YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={72} /><XAxis type="number" allowDecimals={false} hide /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Bar dataKey="count" fill="var(--color-count)" radius={6} /></BarChart></ChartContainer></article>
        <article className="laboratory-panel p-5"><div className="mb-5"><h2 className="font-semibold">掌握情况</h2><p className="mt-1 text-sm text-muted-foreground">把复习中的题逐步变成已掌握</p></div><ChartContainer config={masteryConfig} className="mx-auto h-[250px] max-w-sm"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="name" />} /><Pie data={masteryData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>{masteryData.map((item) => <Cell key={item.name} fill={item.fill} />)}</Pie></PieChart></ChartContainer><div className="mt-2"><div className="mb-2 flex justify-between text-sm"><span>掌握进度</span><span>{summary.masteredRate}%</span></div><Progress value={summary.masteredRate} /></div></article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="laboratory-panel p-5"><div className="mb-5"><h2 className="font-semibold">近 7 天学习节奏</h2><p className="mt-1 text-sm text-muted-foreground">新增或再次练习都会计入当天</p></div><ChartContainer config={topicConfig} className="h-[230px] w-full"><BarChart accessibilityLayer data={recentDays}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} /></BarChart></ChartContainer></article>
        <article className="laboratory-panel p-6"><div className="flex items-center gap-2"><Lightbulb className="size-5 text-amber-500" /><h2 className="font-semibold">本次复习建议</h2></div><div className="mt-5 space-y-4">{summary.weakTopics.slice(0, 3).map((item, index) => <div key={item.topic} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/10 text-sm font-semibold text-amber-700 dark:text-amber-300">{index + 1}</span><div><p className="font-medium">{item.topic}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">优先重做相关错题，并用自己的话解释关键步骤。</p></div></div>)}</div><Button asChild className="mt-6 w-full"><Link href="/mistakes">开始复习薄弱项</Link></Button></article>
      </section>
    </main>
  );
}
