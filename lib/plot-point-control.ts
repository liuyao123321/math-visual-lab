import type { VisualizationSpec } from "./math-schema";
import { evaluateExpression } from "./math";

export type PlotAxis = { range: number[]; _offset: number; _length: number };
export type PlotViewport = { xaxis: PlotAxis; yaxis: PlotAxis };

/** A point is draggable only when its horizontal coordinate is an approved
 * experiment parameter. Its dependent y coordinate is never assigned by drag. */
export function pointControls(spec: VisualizationSpec, values: Record<string, number>, active: string[]) {
  if (spec.kind !== "cartesian") return [];
  return spec.layers.flatMap((layer) => {
    if (layer.type !== "points" || (active.length && !active.includes(layer.id))
      || layer.xExpressions?.length !== 1 || layer.yExpressions?.length !== 1) return [];
    const key = layer.xExpressions[0].trim();
    const parameter = spec.parameters.find((item) => item.key === key);
    if (!parameter || !spec.interactiveParameters?.some((item) => item.key === key)
      || !Number.isFinite(parameter.step / 10) || parameter.step / 10 <= 0 || parameter.max <= parameter.min) return [];
    const x = values[key] ?? parameter.defaultValue;
    const y = evaluateExpression(layer.yExpressions[0], { ...values, [key]: x });
    return y === null || !Number.isFinite(x) || x < parameter.min || x > parameter.max ? [] : [{ layerId: layer.id, label: layer.label, parameter, x, y }];
  });
}
export type PlotPointControl = ReturnType<typeof pointControls>[number];

function validAxis(axis: PlotAxis | undefined): axis is PlotAxis {
  return !!axis && axis.range?.length === 2 && axis.range.every(Number.isFinite) && axis.range[0] !== axis.range[1]
    && Number.isFinite(axis._offset) && Number.isFinite(axis._length) && axis._length > 0;
}

export function plotPointPosition(view: PlotViewport | undefined, x: number, y: number) {
  if (!validAxis(view?.xaxis) || !validAxis(view?.yaxis)) return null;
  const { xaxis, yaxis } = view;
  const px = (x - xaxis.range[0]) / (xaxis.range[1] - xaxis.range[0]);
  const py = (yaxis.range[1] - y) / (yaxis.range[1] - yaxis.range[0]);
  if (![px, py].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  return { left: xaxis._offset + px * xaxis._length, top: yaxis._offset + py * yaxis._length };
}

export function snapPlotParameter(value: number, { min, max, step }: PlotPointControl["parameter"]) {
  const fine = step / 10;
  if (!Number.isFinite(value) || !Number.isFinite(fine) || fine <= 0) return null;
  if (value <= min) return min;
  if (value >= max) return max;
  const rounded = min + Math.round((value - min) / fine) * fine;
  return Number.isFinite(rounded) ? Math.max(min, Math.min(max, Number(rounded.toPrecision(14)))) : null;
}

export function plotDragValue(axis: PlotAxis | undefined, localX: number, parameter: PlotPointControl["parameter"]) {
  if (!validAxis(axis)) return null;
  const ratio = (localX - axis._offset) / axis._length;
  return snapPlotParameter(axis.range[0] + ratio * (axis.range[1] - axis.range[0]), parameter);
}
