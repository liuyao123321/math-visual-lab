"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathPlot } from "@/components/math-plot";
import { MathFormula } from "@/components/math-formula";
import { defaultParameterValues } from "@/lib/math";
import { experimentReadouts } from "@/lib/visual-analysis";
import { appropriateVisualization } from "@/lib/visualization-policy";
import type { SolveResult, VisualizationSpec } from "@/lib/math-schema";

export function VisualExperiment({ solution, parameters, onChange, activeLayerIds, specOverride, inline = false }: {
  solution: SolveResult; parameters: Record<string, number>; onChange: (parameters: Record<string, number>) => void; activeLayerIds: string[]; specOverride?: VisualizationSpec; inline?: boolean;
}) {
  const spec = useMemo(() => specOverride ?? appropriateVisualization(solution)!, [solution, specOverride]);
  const inputId = useId();
  const effectiveParameters = Object.fromEntries(spec.parameters.map((item) => [item.key, parameters[item.key] ?? item.defaultValue]));
  const [playing, setPlaying] = useState(false);
  const [animatedParameter, setAnimatedParameter] = useState(spec.parameters[0]?.key ?? "");
  const selectedParameter = spec.parameters.some((item) => item.key === animatedParameter) ? animatedParameter : spec.parameters[0]?.key ?? "";
  const [speed, setSpeed] = useState(1);
  const [axis, setAxis] = useState("vertical");
  const [coordinate, setCoordinate] = useState("0");
  const [helpers, setHelpers] = useState<Array<{ id: string; axis: string; value: number }>>([]);
  const [helperError, setHelperError] = useState("");
  const enhanced: VisualizationSpec = useMemo(() => ({ ...spec, layers: [...spec.layers, ...helpers.map((helper) => ({
    id: helper.id, label: `${helper.axis === "vertical" ? "x" : "y"}=${helper.value}`, type: "line" as const,
    x: helper.axis === "vertical" ? [helper.value, helper.value] : [...spec.xDomain],
    y: helper.axis === "vertical" ? [...(spec.yDomain ?? [-10, 10])] : [helper.value, helper.value],
    dashed: true, color: "#ec4899",
  }))] }), [spec, helpers]);

  useEffect(() => {
    if (!playing) return;
    const parameter = spec.parameters.find((item) => item.key === selectedParameter);
    if (!parameter) return;
    const timer = window.setInterval(() => {
      const fineStep = parameter.step / 10;
      const step = Math.max(1, Math.round((parameter.max - parameter.min) / 200 / fineStep)) * fineStep;
      const target = (parameters[parameter.key] ?? parameter.defaultValue) + step;
      // Align animation frames to the slider grid so its value matches the readout.
      const next = parameter.min + Math.round((target - parameter.min) / fineStep) * fineStep;
      onChange({ ...parameters, [parameter.key]: next > parameter.max ? parameter.min : Number(next.toFixed(8)) });
    }, 80 / speed);
    return () => window.clearInterval(timer);
  }, [playing, selectedParameter, spec, parameters, onChange, speed]);

  useEffect(() => {
    // A shared canvas must never resume the previous step's autoplay implicitly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(false);
  }, [spec.title]);

  function addHelper() {
    const value = Number(coordinate);
    if (!coordinate.trim() || !Number.isFinite(value) || Math.abs(value) > 10000) { setHelperError("请输入 -10000 到 10000 之间的有效数值。"); return; }
    if (helpers.length >= 5) { setHelperError("最多添加 5 条辅助线。"); return; }
    setHelpers([...helpers, { id: crypto.randomUUID(), axis, value }]); setHelperError("");
  }

  return <>
    <MathPlot spec={enhanced} compact={inline} revisionKey={solution.id + ":" + solution.normalizedQuestion} parameters={effectiveParameters} activeLayerIds={[...activeLayerIds, ...helpers.map((item) => item.id)]} />
    <div className="space-y-4 border-t py-4">
      {spec.parameters.length > 0 && <p className="text-sm text-muted-foreground">移动参数，观察题目要求的变化；下方公式和图中关键点同步更新。</p>}
      {spec.parameters.map((parameter) => <div key={parameter.key}><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor={`${inputId}-range-${parameter.key}`} className="text-sm">{parameter.label}</label><Input type="number" aria-label={`${parameter.label}数值`} className="w-28" min={parameter.min} max={parameter.max} step={parameter.step / 10} value={parameters[parameter.key] ?? parameter.defaultValue} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= parameter.min && value <= parameter.max) onChange({ ...parameters, [parameter.key]: value }); }} /></div><input id={`${inputId}-range-${parameter.key}`} type="range" className="w-full accent-primary" min={parameter.min} max={parameter.max} step={parameter.step / 10} value={parameters[parameter.key] ?? parameter.defaultValue} onChange={(event) => onChange({ ...parameters, [parameter.key]: Number(event.target.value) })} /></div>)}
      {spec.parameters.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="动画参数" className="rounded-md border bg-background p-2 text-sm" value={selectedParameter} onChange={(event) => setAnimatedParameter(event.target.value)}>{spec.parameters.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><Button variant="outline" onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}{playing ? "暂停动画" : "播放动画"}</Button><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="动画速度" className="rounded-md border bg-background p-2 text-sm"><option value={0.5}>0.5 倍速</option><option value={1}>1 倍速</option><option value={2}>2 倍速</option></select><Button variant="ghost" onClick={() => { setPlaying(false); onChange(defaultParameterValues(spec)); }}><RotateCcw />重置</Button></div>}
      {!inline && <div className="space-y-3" aria-live="polite">{experimentReadouts({ ...solution, visualization: spec }, effectiveParameters).map((readout) => <div key={readout.label}><p className="mb-1 text-sm font-medium">{readout.label}</p><MathFormula value={readout.latex} /></div>)}</div>}
      <details className="border-t pt-3" open={inline ? undefined : true}><summary className="cursor-pointer text-sm font-medium">辅助线工具</summary><div className="pt-3"><div className="flex flex-wrap gap-2"><select aria-label="辅助线方向" value={axis} onChange={(event) => setAxis(event.target.value)} className="rounded-md border bg-background p-2 text-sm"><option value="vertical">竖线 x=</option><option value="horizontal">横线 y=</option></select><Input aria-label="辅助线坐标" type="number" className="w-28" value={coordinate} onChange={(event) => setCoordinate(event.target.value)} /><Button variant="outline" onClick={addHelper}><Plus />添加</Button></div>{helperError && <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-300">{helperError}</p>}<div className="mt-2 flex flex-wrap gap-2">{helpers.map((helper) => <Button size="sm" variant="secondary" key={helper.id} onClick={() => setHelpers(helpers.filter((item) => item.id !== helper.id))}>{helper.axis === "vertical" ? "x" : "y"}={helper.value}<X className="size-3" /><span className="sr-only">移除辅助线</span></Button>)}</div></div></details>
    </div>
  </>;
}
