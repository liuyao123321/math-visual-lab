"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mistakeFilterOptions, timeFilterLabels, type MistakeFilters } from "@/lib/mistake-view";
import type { MistakeRecord } from "@/lib/math-schema";

type Dimension = "time" | "subject" | "difficulty" | "errorReason";
const dimensionLabels: Record<Dimension, string> = { time: "按时间分类", subject: "按科目分类", difficulty: "按难度分类", errorReason: "按错因分类" };

export function MistakeFiltersMenu({ records, value, onChange }: { records: MistakeRecord[]; value: MistakeFilters; onChange: (next: MistakeFilters) => void }) {
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const options = mistakeFilterOptions(records);
  const choices: Array<{ value: string | null; label: string }> = dimension === "time" ? Object.entries(timeFilterLabels).map(([value, label]) => ({ value, label }))
    : dimension === "subject" ? [{ value: null, label: "全部科目" }, ...options.subjects.map((value) => ({ value, label: value }))]
    : dimension === "difficulty" ? [{ value: null, label: "全部难度" }, ...options.difficulties.map((value) => ({ value, label: value }))]
    : [{ value: null, label: "全部错因" }, ...options.reasons.map((value) => ({ value, label: value || "未填写" }))];
  const count = Number(value.time !== "all") + Number(value.subject !== null) + Number(value.difficulty !== null) + Number(value.errorReason !== null);
  return <Popover onOpenChange={(open) => { if (!open) setDimension(null); }}>
    <PopoverTrigger asChild><Button variant="outline" className="h-11 shadow-none"><SlidersHorizontal aria-hidden="true" />过滤{count > 0 && <span className="tabular-nums text-muted-foreground">{count}</span>}<ChevronDown aria-hidden="true" className="size-3.5" /></Button></PopoverTrigger>
    <PopoverContent align="end" aria-label="错题过滤" className="mistake-filter-popover w-[min(340px,calc(100vw-2rem))] p-2">
      {dimension === null ? <div className="space-y-1">{(Object.keys(dimensionLabels) as Dimension[]).map((key) => <button key={key} type="button" className="mistake-filter-dimension" onClick={() => setDimension(key)}><span>{dimensionLabels[key]}<small>{key === "time" ? timeFilterLabels[value.time] : value[key] === null ? "全部" : value[key] || "未填写"}</small></span><ChevronRight className="size-4 shrink-0" aria-hidden="true" /></button>)}</div> : <>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDimension(null)} className="mb-2"><ArrowLeft aria-hidden="true" />返回分类</Button>
        <fieldset className="max-h-72 space-y-1 overflow-y-auto"><legend className="px-3 py-2 text-sm font-medium">{dimensionLabels[dimension]}</legend>{choices.map((choice, index) => <label className="mistake-filter-choice" key={index}><input type="radio" name={`mistake-filter-${dimension}`} value={String(index)} checked={value[dimension] === choice.value} onChange={() => onChange({ ...value, [dimension]: choice.value })} /><span>{choice.label}</span></label>)}</fieldset>
      </>}
    </PopoverContent>
  </Popover>;
}
