import { describe, expect, it } from "vitest";
import { createPlotTraces } from "@/components/math-plot";
import { examples } from "@/lib/examples";

function traceByName(traces: Array<Record<string, unknown>>, name: string) {
  return traces.find((trace) => trace.name === name) as { x: number[]; y: number[]; fill?: string } | undefined;
}

describe("dynamic visualization traces", () => {
  it("does not fill across an undefined integrand", () => {
    const spec = { ...examples[2].visualization!, layers: [{ id: "unsafe-area", label: "未定义区间", type: "area" as const, expression: "1/x", domain: [-1, 1] as [number, number] }] };
    expect(() => createPlotTraces(spec, {}, [])).toThrow("未定义点");
  });
  it("keeps the original quadratic fixed even with old saved parameter values", () => {
    const spec = examples[0].visualization!;
    const original = createPlotTraces(spec, { k: 3 }, []);
    expect(traceByName(original, "顶点")).toMatchObject({ x: [2], y: [-1] });
    expect(traceByName(original, "零点")?.x).toEqual([1, 3]);

    const moved = createPlotTraces(spec, { k: 0 }, []);
    expect(traceByName(moved, "顶点")).toMatchObject({ x: [2], y: [-1] });
    expect(traceByName(moved, "零点")?.x).toEqual([1, 3]);

    const noRealZeros = createPlotTraces(spec, { k: 5 }, []);
    expect(traceByName(noRealZeros, "零点")?.x).toEqual([1, 3]);
  });

  it("builds a closed filled polygon over the fixed original interval", () => {
    const spec = examples[2].visualization!;
    const traces = createPlotTraces(spec, { b: 1.2 }, ["area"]);
    const area = traceByName(traces, "积分区域")!;
    expect(area.fill).toBe("toself");
    expect(area.x.at(-2)).toBeCloseTo(2);
    expect(area.x.at(-1)).toBeCloseTo(0);
    expect(area.y.slice(-2)).toEqual([0, 0]);
    expect(traceByName(traces, "积分端点")?.x).toEqual([0, 2]);
  });

  it("moves the derivative example point from its expression", () => {
    const traces = createPlotTraces(examples[1].visualization!, { t: 1.5 }, []);
    expect(traceByName(traces, "当前切点")).toMatchObject({ x: [1.5], y: [-1.125] });
  });
});
