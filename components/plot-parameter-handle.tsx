"use client";

import { useEffect, useRef, useState } from "react";
import { plotDragValue, plotPointPosition, snapPlotParameter, type PlotPointControl, type PlotViewport } from "@/lib/plot-point-control";

export type InteractivePlotElement = HTMLDivElement & {
  _fullLayout?: PlotViewport;
  data?: Array<{ uid?: string; visible?: boolean | "legendonly" }>;
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
};

export function PlotParameterHandle({ plot, point, onChange, onStart }: {
  plot: InteractivePlotElement; point: PlotPointControl;
  onChange: (key: string, value: number) => void; onStart?: () => void;
}) {
  const [, refresh] = useState(0);
  const gesture = useRef<{ id: number; target: HTMLButtonElement; grab: number; frame: number; x: number; startX: number; moved: boolean; last: number } | null>(null);
  const { parameter } = point;
  const hidden = plot.data?.some((trace) => trace.uid === point.layerId && (trace.visible === false || trace.visible === "legendonly"));
  const position = hidden ? null : plotPointPosition(plot._fullLayout, point.x, point.y);
  function finish() {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    cancelAnimationFrame(drag.frame);
    if (drag.target.hasPointerCapture?.(drag.id)) drag.target.releasePointerCapture(drag.id);
  }
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    const events = ["plotly_afterplot", "plotly_relayout", "plotly_restyle"];
    for (const event of events) plot.on?.(event, update);
    window.addEventListener("blur", finish);
    return () => {
      for (const event of events) plot.removeListener?.(event, update);
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [plot, parameter.key]);
  function update(clientX: number) {
    const drag = gesture.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(clientX - drag.startX) < 2) return;
    drag.moved = true;
    const rect = plot.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = plotDragValue(plot._fullLayout?.xaxis, (clientX - rect.left) * plot.clientWidth / rect.width - drag.grab, parameter);
    if (next !== null && next !== drag.last) { drag.last = next; onChange(parameter.key, next); }
  }
  return <button type="button" role="slider" aria-label={point.label + "（可拖动）"} aria-valuemin={parameter.min} aria-valuemax={parameter.max} aria-valuenow={point.x}
    style={position ?? { visibility: "hidden" }} className="absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab place-items-center rounded-full select-none focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
    onPointerDown={(event) => {
      if (gesture.current || !position || event.button !== 0 || !event.isPrimary || !event.currentTarget.setPointerCapture) return;
      const rect = plot.getBoundingClientRect();
      if (rect.width <= 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { id: event.pointerId, target: event.currentTarget, grab: (event.clientX - rect.left) * plot.clientWidth / rect.width - position.left, frame: 0, x: event.clientX, startX: event.clientX, moved: false, last: point.x };
      event.stopPropagation(); onStart?.();
    }}
    onPointerMove={(event) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      drag.x = event.clientX;
      if (!drag.frame) drag.frame = requestAnimationFrame(() => { drag.frame = 0; update(drag.x); });
    }}
    onPointerUp={(event) => { if (gesture.current?.id === event.pointerId) { update(event.clientX); finish(); } }}
    onPointerCancel={(event) => { if (gesture.current?.id === event.pointerId) finish(); }}
    onLostPointerCapture={(event) => { if (gesture.current?.id === event.pointerId) finish(); }}
    onKeyDown={(event) => {
      const target = event.key === "Home" ? parameter.min : event.key === "End" ? parameter.max
        : ["ArrowRight", "ArrowUp"].includes(event.key) ? point.x + parameter.step / 10
          : ["ArrowLeft", "ArrowDown"].includes(event.key) ? point.x - parameter.step / 10 : null;
      if (target === null) return;
      event.preventDefault(); onStart?.();
      const next = snapPlotParameter(target, parameter);
      if (next !== null && next !== point.x) onChange(parameter.key, next);
    }}>
    <span aria-hidden="true" className="size-4 rounded-full border-2 border-background bg-primary ring-1 ring-primary" />
  </button>;
}
