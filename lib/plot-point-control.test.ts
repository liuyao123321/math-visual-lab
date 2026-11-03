import { describe, expect, it } from "vitest";
import { examples } from "./examples";
import { appropriateVisualization } from "./visualization-policy";
import { pointControls, plotPointPosition, plotDragValue } from "./plot-point-control";
import { createPlotTraces } from "@/components/math-plot";

const spec = appropriateVisualization(examples[1])!;
const active = ["function", "tangent", "moving-point"];
const axis = { range: [-3, 3], _offset: 48, _length: 300 };

describe("constrained plot point control", () => {
  it("moves the point and the dependent tangent without changing the original curve", () => {
    const [point] = pointControls(spec, { t: 1 }, active);
    expect(point).toMatchObject({ x: 1, y: -2, layerId: "moving-point" });
    const before = createPlotTraces(spec, { t: 0 }, active);
    const after = createPlotTraces(spec, { t: 1 }, active);
    expect(after[0]).toEqual(before[0]);
    expect(after.find((trace) => trace.name === "切线")?.y).toEqual(Array(161).fill(-2));
    expect(after.find((trace) => trace.uid === "moving-point")).toMatchObject({ x: [1], y: [-2] });
  });
  it("does not expose fixed points, inactive layers or unapproved parameters", () => {
    expect(pointControls(spec, { t: 0 }, ["function", "critical"])).toEqual([]);
    expect(pointControls(appropriateVisualization({ ...examples[1], normalizedQuestion: "求函数极值" })!, {}, [])).toEqual([]);
    expect(pointControls({ ...spec, interactiveParameters: [] }, { t: 0 }, active)).toEqual([]);
    expect(pointControls(appropriateVisualization(examples[0])!, {}, [])).toEqual([]);
  });
  it("uses the current zoomed axes, clamps and snaps the parameter", () => {
    const [point] = pointControls(spec, { t: 0 }, active);
    expect(plotDragValue(axis, 248.2, point.parameter)).toBe(1);
    expect(plotDragValue({ ...axis, range: [0, 1] }, 198, point.parameter)).toBe(0.5);
    expect(plotDragValue(axis, 999, point.parameter)).toBe(2);
    expect(plotDragValue(axis, -99, point.parameter)).toBe(-2);
    expect(plotDragValue({ ...axis, _length: 0 }, 99, point.parameter)).toBeNull();
    expect(plotPointPosition({ xaxis: axis, yaxis: { ...axis, range: [-8, 8] } }, 0, 0)).toEqual({ left: 198, top: 198 });
    expect(plotPointPosition({ xaxis: axis, yaxis: axis }, 10, 0)).toBeNull();
  });
});
