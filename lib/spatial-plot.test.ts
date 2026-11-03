import { describe, expect, it } from "vitest";
import { exampleById } from "./examples";
import { solveResultSchema, visualizationSpecSchema } from "./math-schema";
import { createSpatialTraces } from "./spatial-plot";
import { visualizationForStep } from "./step-visualization";

const solution = exampleById["example-triple-integral"];
const scene = solution.visualization!;
const solid = scene.layers[2];

describe("three-dimensional integral visualization", () => {
  it("renders the unit ball when boundary roots have negative roundoff", () => {
    const ball = { ...scene, xDomain: [-1, 1] as [number, number], yDomain: [-1, 1] as [number, number], zDomain: [-1, 1] as [number, number], layers: [{ ...solid,
      yBounds: ["-sqrt(1-x^2)", "sqrt(1-x^2)"] as [string, string],
      zBounds: ["-sqrt(1-x^2-y^2)", "sqrt(1-x^2-y^2)"] as [string, string],
    }] };
    const [{ x, y, z, i }] = createSpatialTraces(ball, []);
    expect(z).toHaveLength(1250);
    expect(Math.min(...z)).toBe(-1);
    expect(Math.max(...z)).toBe(1);
    expect(i.length).toBeGreaterThan(0);
    expect(x.every((value, n) => Math.abs(value ** 2 + y[n] ** 2 + z[n] ** 2 - 1) < 1e-12)).toBe(true);
  });

  it("does not hide a genuinely invalid radicand at the boundary or an invalid interior", () => {
    for (const expression of ["sqrt(1-x^2-y^2-0.001)", "sqrt(-0.0000000000000001)"]) {
      const layer = { ...solid, type: "surface" as const, expression, yBounds: undefined, zBounds: undefined };
      expect(() => createSpatialTraces({ ...scene, layers: [layer] }, [])).toThrow("无效坐标");
    }
  });

  it("validates the offline solution and shows only the boundaries for each step", () => {
    expect(solveResultSchema.safeParse(solution).success).toBe(true);
    expect(solution.steps.map((step) => visualizationForStep(scene, step)?.layers.map((layer) => layer.id)))
      .toEqual([["projection"], ["projection", "roof"], ["solid"]]);
  });

  it("creates a closed oriented mesh with the tetrahedron's exact volume", () => {
    const [{ x, y, z, i, j, k }] = createSpatialTraces({ ...scene, layers: [solid] }, []);
    let volume = 0;
    const edges = new Map<string, number>();
    for (let t = 0; t < i.length; t++) {
      const a = i[t], b = j[t], c = k[t];
      for (const [from, to] of [[a, b], [b, c], [c, a]]) {
        const key = from < to ? `${from},${to}` : `${to},${from}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      volume += (x[a] * (y[b] * z[c] - z[b] * y[c]) + y[a] * (z[b] * x[c] - x[b] * z[c]) + z[a] * (x[b] * y[c] - y[b] * x[c])) / 6;
    }
    expect([...edges.values()].every((faces) => faces === 2)).toBe(true);
    expect(x.every((v, n) => v >= 0 && y[n] >= 0 && z[n] >= 0 && v + y[n] + z[n] <= 1 + 1e-12)).toBe(true);
    expect(volume).toBeCloseTo(1 / 6, 10);
  });

  it("rejects dimension mismatches, missing bounds, reversed bounds and unsafe expressions", () => {
    expect(visualizationSpecSchema.safeParse({ ...scene, kind: "cartesian" }).success).toBe(false);
    expect(visualizationSpecSchema.safeParse({ ...scene, layers: [{ ...solid, zBounds: undefined }] }).success).toBe(false);
    expect(() => createSpatialTraces({ ...scene, layers: [{ ...solid, zBounds: ["1", "0"] }] }, [])).toThrow("上下限相反");
    expect(() => createSpatialTraces({ ...scene, layers: [{ ...solid, zBounds: ["0", "import(1)"] }] }, [])).toThrow();
  });

  it("uses both x and y for a nonplanar surface", () => {
    const [trace] = createSpatialTraces({ ...scene, layers: [{ id: "paraboloid", label: "抛物面", type: "surface", expression: "x^2+y^2" }] }, []);
    expect(trace.z[0]).toBe(0);
    expect(trace.z.at(-1)).toBe(2);
    expect(trace.x.length).toBe(625);
  });
});
