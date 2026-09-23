"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle } from "lucide-react";
import type { VisualizationSpec } from "@/lib/math-schema";
import { compileSafeExpression, sampleExpression } from "@/lib/math";

type Trace = Record<string, unknown>;

function createTraces(spec: VisualizationSpec, parameters: Record<string, number>, activeIds: string[]) {
  const traces: Trace[] = [];
  const activeSet = new Set(activeIds);
  for (const layer of spec.layers) {
    const isActive = activeSet.size === 0 || activeSet.has(layer.id);
    const color = layer.color ?? "#22d3ee";
    if ((layer.type === "function" || layer.type === "area" || layer.type === "line") && layer.expression) {
      const domain: [number, number] = layer.type === "area" && typeof parameters.b === "number"
        ? [layer.domain?.[0] ?? 0, parameters.b]
        : layer.domain ?? spec.xDomain;
      const sampled = sampleExpression(layer.expression, domain, parameters);
      traces.push({
        x: sampled.x,
        y: sampled.y,
        type: "scatter",
        mode: "lines",
        name: layer.label,
        line: { color, width: isActive ? 3.5 : 1.8, dash: layer.dashed ? "dash" : "solid" },
        fill: layer.type === "area" ? "tozeroy" : "none",
        fillcolor: layer.type === "area" ? "rgba(245, 158, 11, 0.25)" : undefined,
        opacity: isActive ? 1 : 0.28,
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<extra>" + layer.label + "</extra>",
      });
      continue;
    }
    if (layer.x && layer.y) {
      let x = layer.x;
      let y = layer.y;
      if (layer.id === "moving-point" && typeof parameters.t === "number") {
        x = [parameters.t];
        y = [parameters.t ** 3 - 3 * parameters.t];
      }
      traces.push({
        x, y, type: "scatter", mode: layer.type === "line" ? "lines" : "markers",
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

export function MathPlot({ spec, parameters, activeLayerIds }: { spec: VisualizationSpec; parameters: Record<string, number>; activeLayerIds: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [runtimeError, setRuntimeError] = useState("");
  const plotState = useMemo(() => {
    try {
      for (const layer of spec.layers) if (layer.expression) compileSafeExpression(layer.expression, Object.keys(parameters));
      return { traces: createTraces(spec, parameters, activeLayerIds), error: "" };
    } catch {
      return { traces: [] as Trace[], error: "图像数据无法解析，文字解析仍可正常查看。" };
    }
  }, [spec, parameters, activeLayerIds]);
  const { traces, error } = plotState;

  useEffect(() => {
    if (!ref.current || !traces.length) return;
    const element = ref.current;
    setRuntimeError("");
    let cancelled = false;
    let plotly: typeof import("plotly.js-basic-dist-min").default | null = null;
    import("plotly.js-basic-dist-min").then(async (module) => {
      if (cancelled) return;
      plotly = module.default;
      const dark = resolvedTheme === "dark";
      await plotly.react(element, traces, {
        autosize: true,
        margin: { l: 48, r: 18, t: 45, b: 45 },
        title: { text: spec.title, x: 0.03, font: { size: 15 } },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: dark ? "#dbeafe" : "#234057", family: "Microsoft YaHei, sans-serif" },
        xaxis: { title: spec.xLabel, range: spec.xDomain, gridcolor: dark ? "#20384a" : "#dbe7ed", zerolinecolor: dark ? "#6b8191" : "#94a3b8" },
        yaxis: { title: spec.yLabel, range: spec.yDomain, gridcolor: dark ? "#20384a" : "#dbe7ed", zerolinecolor: dark ? "#6b8191" : "#94a3b8" },
        legend: { orientation: "h", y: -0.18, x: 0 },
        hovermode: "closest",
        transition: { duration: 180 },
      }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] });
    }).catch(() => setRuntimeError("图像组件加载失败，请刷新页面重试。"));
    return () => {
      cancelled = true;
      if (plotly) plotly.purge(element);
    };
  }, [traces, spec, resolvedTheme]);

  if (error || runtimeError) return <div className="m-5 flex min-h-72 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/8 p-6 text-center text-sm text-amber-700 dark:text-amber-200"><AlertTriangle className="mr-2 size-5" />{error || runtimeError}</div>;
  return <div ref={ref} className="h-[420px] min-h-[360px] w-full" aria-label={spec.title} />;
}
