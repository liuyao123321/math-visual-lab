"use client";

import { useId, useRef } from "react";
import { BookOpen, ChartNoAxesCombined, Grid2X2, MoreHorizontal, Sigma, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MathText } from "@/components/math-formula";
import { splitMathText } from "@/lib/formula";
import { masteryLabels } from "@/lib/store";
import { mistakeDateLabel, mistakeDifficulty, mistakePalette, mistakeSubject } from "@/lib/mistake-view";
import type { Mastery, MistakeRecord } from "@/lib/math-schema";

export function MistakeCard({ item, onOpen, onDelete, onMastery }: { item: MistakeRecord; onOpen: (id: string, source: HTMLElement | null) => void; onDelete: (id: string, source: HTMLElement | null) => void; onMastery: (id: string, value: Mastery) => void }) {
  const titleId = useId();
  const more = useRef<HTMLButtonElement>(null);
  const openingOverlay = useRef(false);
  const Icon = item.subject === "高等数学" ? Sigma : item.subject === "线性代数" ? Grid2X2 : item.subject === "概率统计" ? ChartNoAxesCombined : BookOpen;
  // Shorten only plain prose. Never slice a math token or the stored question.
  const hasMath = /\\[a-zA-Z]+|[∑∫√]/.test(item.question) || splitMathText(item.question).some((part) => part.kind === "math");
  const characters = Array.from(item.question);
  const preview = !hasMath && characters.length > 96 ? characters.slice(0, 96).join("") + "…" : item.question;
  return <article className={`mistake-card mistake-card--${mistakePalette(item.subject)}`} data-mistake-id={item.id} aria-labelledby={titleId}>
    <div className="mistake-card-top"><Icon aria-hidden="true" className="size-5 shrink-0" /><span className="mistake-card-difficulty">{mistakeDifficulty(item.difficulty)}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button ref={more} type="button" variant="ghost" size="icon" className="mistake-card-more" aria-label="更多操作"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (openingOverlay.current) { event.preventDefault(); openingOverlay.current = false; } }}>
        <DropdownMenuItem onSelect={() => { openingOverlay.current = true; onOpen(item.id, more.current); }}>查看详情</DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`/solve?mistake=${encodeURIComponent(item.id)}`}>再次练习</a></DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuLabel>掌握状态</DropdownMenuLabel><DropdownMenuRadioGroup value={item.mastery} onValueChange={(value) => onMastery(item.id, value as Mastery)}>{Object.entries(masteryLabels).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { openingOverlay.current = true; onDelete(item.id, more.current); }}><Trash2 aria-hidden="true" />删除错题</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
    <h2 id={titleId} className="mistake-card-question"><button type="button" aria-label={"查看错题详情：" + item.question} onClick={(event) => onOpen(item.id, event.currentTarget)}><MathText value={preview} /></button></h2>
    <div className="mistake-card-bottom"><span className="mistake-card-subject">{mistakeSubject(item.subject)}</span><span className="mistake-card-mastery">{masteryLabels[item.mastery]}</span></div>
    <p className="mistake-card-date">收藏于 {mistakeDateLabel(item.createdAt)}</p>
  </article>;
}
