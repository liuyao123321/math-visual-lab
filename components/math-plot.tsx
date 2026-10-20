"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle } from "lucide-react";
import type { VisualizationSpec } from "@/lib/math-schema";
import { compileSafeExpression, evaluateExpression, sampleExpression } from "@/lib/math";

export type PlotTrace = Record<string, unknown>;

function resolveExpressions(expressions: string[] | undefined, fallback: number[] | undefined, parameters: Record<string, number>) {
  if (!expressions) return fallback ?? [];
  return expressions.map((expression) => evaluateExpression(expression, parameters));
}

function resolveDomain(
  expressions: [string, string] | undefined,
  fallback: [number, number],
  parameters: Record<string, number>,
): [number, number] {
  if (!expressions) return fallback;
  const start = evaluateExpression(expressions[0], parameters);
  const end = evaluateExpression(expressions[1], parameters);
  if (start === null || end === null) throw new Error("动态图像区间无效");
  return start < end ? [start, end] : [end, start];
}

function colorWithAlpha(color: string, alpha: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return `rgba(245, 158, 11, ${alpha})`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function createPlotTraces(spec: VisualizationSpec, parameters: Record<string, number>, activeIds: string[]) {
  const traces: PlotTrace[] = [];
  const activeSet = new Set(activeIds);
  for (const layer of spec.layers) {
    const isActive = activeSet.size === 0 || activeSet.has(layer.id);
    const color = !layer.color || ["#22d3ee", "#06b6d4", "#67e8f9"].includes(layer.color.toLowerCase()) ? "#66876e" : layer.color;
    if ((layer.type === "function" || layer.type === "area" || layer.type === "line") && layer.expression) {
      const domain = resolveDomain(layer.domainExpressions, layer.domain ?? spec.xDomain, parameters);
      const sampled = sampleExpression(layer.expression, domain, parameters);
      const validPoints = sampled.x.flatMap((x, index) => typeof sampled.y[index] === "number" ? [{ x, y: sampled.y[index] as number }] : []);
      if (layer.type === "area" && validPoints.length !== sampled.x.length) throw new Error("积分区域含未定义点，不能可靠填充");
      if (!validPoints.length) continue;
      const x = validPoints.map((point) => point.x);
      const y = validPoints.map((point) => point.y);
      const trace: PlotTrace = {
        uid: layer.id,
        x: layer.type === "area" ? [...x, x[x.length - 1], x[0]] : sampled.x,
        y: layer.type === "area" ? [...y, 0, 0] : sampled.y,
        type: "scatter",
        mode: "lines",
        name: layer.label,
        line: { color, width: isActive ? 3.5 : 1.8, dash: layer.dashed ? "dash" : "solid" },
        fill: layer.type === "area" ? "toself" : "none",
        fillcolor: layer.type === "area" ? colorWithAlpha(color, isActive ? 0.32 : 0.16) : undefined,
        opacity: isActive ? 1 : layer.type === "area" ? 0.65 : 0.28,
        connectgaps: false,
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<extra>" + layer.label + "</extra>",
      };
      if (layer.type === "area") traces.unshift(trace);
      else traces.push(trace);
      continue;
    }
    if ((layer.x || layer.xExpressions) && (layer.y || layer.yExpressions)) {
      const rawX = resolveExpressions(layer.xExpressions, layer.x, parameters);
      const rawY = resolveExpressions(layer.yExpressions, layer.y, parameters);
      const coordinates = rawX.flatMap((x, index) => typeof x === "number" && typeof rawY[index] === "number" ? [{ x, y: rawY[index] as number }] : []);
      if (!coordinates.length) continue;
      const x = coordinates.map((point) => point.x);
      const y = coordinates.map((point) => point.y);
      traces.push({
        uid: layer.id,
        x, y, type: "scatter", mode: layer.type === "line" ? "lines" : "markers+text",
        text: layer.type === "points" ? coordinates.map((point) => `(${Number(point.x.toFixed(3))}, ${Number(point.y.toFixed(3))})`) : undefined,
        textposition: "top center",
        name: layer.label,
        marker: { color, size: isActive ? 11 : 8, line: { color: "#ffffff", width: 1.5 } },
        line: { color, width: isActive ? 3 : 1.5, dash: layer.dashed ? "dash" : "solid" },
        opacity: isActive ? 1 : 0.28,
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<extra>" + layer.label + "</extra>",
      });
    }
  }
  return traces;
}

export function MathPlot({ spec, parameters, activeLayerIds, compact = false, revisionKey }: { spec: VisualizationSpec; parameters: Record<string, number>; activeLayerIds: string[]; compact?: boolean; revisionKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-basic-dist-min").default | null>(null);
  const { resolvedTheme } = useTheme();
  const [runtimeError, setRuntimeError] = useState("");
  const plotState = useMemo(() => {
    try {
      for (const layer of spec.layers) if (layer.expression) compileSafeExpression(layer.expression, Object.keys(parameters));
      const traces = createPlotTraces(spec, parameters, activeLayerIds);
      return { traces, error: traces.length ? "" : "当前图像没有有效数据，文字解析仍可正常查看。" };
    } catch {
      return { traces: [] as PlotTrace[], error: "图像数据无法解析，文字解析仍可正常查看。" };
    }
  }, [spec, parameters, activeLayerIds]);
  const { traces, error } = plotState;

  useEffect(() => {
    if (!ref.current || !traces.length) return;
    const element = ref.current;
    setRuntimeError("");
    let cancelled = false;
    let plotly: typeof import("plotly.js-basic-dist-min").default | null = null;
    const removeDragCovers = () => document.querySelectorAll("body > .dragcover").forEach((cover) => cover.remove());
    window.addEventListener("pointerup", removeDragCovers, true);
    window.addEventListener("pointercancel", removeDragCovers, true);
    window.addEventListener("mouseup", removeDragCovers, true);
    import("plotly.js-basic-dist-min").then(async (module) => {
      if (cancelled) return;
      plotly = module.default;
      plotlyRef.current = plotly;
      const styles = getComputedStyle(element);
      const ink = styles.getPropertyValue("--foreground").trim() || "#272620";
      const grid = styles.getPropertyValue("--border").trim() || "#deded6";
      const axis = styles.getPropertyValue("--muted-foreground").trim() || "#69675f";
      await plotly.react(element, traces, {
        autosize: true,
        uirevision: revisionKey ?? spec.title,
        margin: { l: 48, r: 18, t: compact ? 20 : 45, b: 45 },
        title: compact ? undefined : { text: spec.title, x: 0.03, font: { size: 15 } },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: ink, family: "Microsoft YaHei, sans-serif" },
        xaxis: { title: spec.xLabel, range: spec.xDomain, gridcolor: grid, zerolinecolor: axis },
        yaxis: { title: spec.yLabel, range: spec.yDomain, gridcolor: grid, zerolinecolor: axis },
        legend: { orientation: "h", y: -0.18, x: 0 },
        hovermode: "closest",
        transition: { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180 },
      }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] });
    }).catch(() => setRuntimeError("图像组件加载失败，请刷新页面重试。"));
    return () => {
      cancelled = true;
      window.removeEventListener("pointerup", removeDragCovers, true);
      window.removeEventListener("pointercancel", removeDragCovers, true);
      window.removeEventListener("mouseup", removeDragCovers, true);
      removeDragCovers();
    };
  }, [traces, spec, resolvedTheme, revisionKey, compact]);

  useEffect(() => {
    const element = ref.current;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (element && element.clientWidth > 0 && plotlyRef.current) void Promise.resolve(plotlyRef.current.Plots.resize(element)).catch(() => undefined);
    }) : null;
    if (element) observer?.observe(element);
    return () => { observer?.disconnect(); if (element) plotlyRef.current?.purge(element); };
  }, []);

  if (error || runtimeError) return <div className="m-5 flex min-h-72 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/8 p-6 text-center text-sm text-amber-700 dark:text-amber-200"><AlertTriangle className="mr-2 size-5" />{error || runtimeError}</div>;
  return <div ref={ref} className={compact ? "h-[320px] min-h-[280px] w-full max-w-full overflow-hidden" : "h-[420px] min-h-[360px] w-full max-w-full overflow-hidden"} aria-label={spec.title} />;
}
