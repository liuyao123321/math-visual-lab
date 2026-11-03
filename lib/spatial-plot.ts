import type { VisualizationSpec } from "./math-schema";
import { compileSafeExpression } from "./math";

const SIZE = 25;
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
// At an exact boundary (e.g. y = sqrt(1 - x²)) an earlier rounded
// square root can leave a few ulps below zero in a subsequent radicand.
// Keep this absolute tolerance tiny and never apply it to interior samples.
const boundarySqrt = (value: number) => typeof value !== "number" ? NaN
  : value < 0 && value >= -16 * Number.EPSILON ? 0 : Math.sqrt(value);
function coordinate(value: number | null) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error("三维边界包含无效坐标");
  return value;
}

/** Sample a nested x/y/z domain. Explicit face indices preserve concave boundaries. */
export function createSpatialTraces(spec: VisualizationSpec, activeIds: string[]) {
  if (spec.kind !== "space" || !spec.yDomain) throw new Error("缺少三维坐标范围");
  const yDomain = spec.yDomain;
  return spec.layers.map((layer) => {
    const [xmin, xmax] = layer.domain ?? spec.xDomain;
    const [ylo, yhi] = layer.yBounds?.map((expr) => compileSafeExpression(expr)) ?? [];
    const [bottom, top] = layer.type === "solid" && layer.zBounds
      ? layer.zBounds.map((expr) => compileSafeExpression(expr, ["y"]))
      : [undefined, compileSafeExpression(layer.expression ?? "", ["y"])];
    const x: number[] = [], y: number[] = [], z: number[] = [];
    const i: number[] = [], j: number[] = [], k: number[] = [];
    const count = SIZE * SIZE;
    const lower: number[] = [];
    let positiveHeight = false;
    for (let row = 0; row < SIZE; row++) {
      const u = coordinate(mix(xmin, xmax, row / (SIZE - 1)));
      const xEdge = row === 0 || row === SIZE - 1;
      const a = coordinate(ylo ? ylo({ x: u }, xEdge ? boundarySqrt : undefined) : yDomain[0]);
      const b = coordinate(yhi ? yhi({ x: u }, xEdge ? boundarySqrt : undefined) : yDomain[1]);
      if (b < a) throw new Error("y 的上下限相反");
      for (let col = 0; col < SIZE; col++) {
        const v = mix(a, b, col / (SIZE - 1));
        const sqrt = xEdge || col === 0 || col === SIZE - 1 ? boundarySqrt : undefined;
        const high = coordinate(top!({ x: u, y: v }, sqrt));
        x.push(u); y.push(v); z.push(high);
        if (bottom) {
          const low = coordinate(bottom({ x: u, y: v }, sqrt));
          if (high < low) throw new Error("z 的上下限相反");
          positiveHeight ||= high > low && b > a;
          lower.push(low);
        }
      }
    }
    const quad = (a: number, b: number, c: number, d: number) => { i.push(a, a); j.push(b, c); k.push(c, d); };
    for (let row = 0; row < SIZE - 1; row++) {
      for (let col = 0; col < SIZE - 1; col++) {
        const a = row * SIZE + col, b = a + SIZE;
        quad(a, b, b + 1, a + 1);
        if (bottom) quad(a + count, a + 1 + count, b + 1 + count, b + count);
      }
    }
    if (bottom) {
      if (!positiveHeight) throw new Error("积分区域没有可显示的体积");
      x.push(...x); y.push(...y); z.push(...lower);
      const edge = (a: number, b: number) => quad(b, a, a + count, b + count);
      for (let p = 0; p < SIZE - 1; p++) {
        edge(p + 1, p);
        edge(count - SIZE + p, count - SIZE + p + 1);
        edge(p * SIZE, (p + 1) * SIZE);
        edge((p + 2) * SIZE - 1, (p + 1) * SIZE - 1);
      }
    }
    const active = !activeIds.length || activeIds.includes(layer.id);
    return { type: "mesh3d", name: layer.label, x, y, z, i, j, k, showlegend: true,
      color: /^#[0-9a-f]{6}$/i.test(layer.color ?? "") ? layer.color : "#66876e",
      opacity: active ? bottom ? 0.65 : 0.85 : 0.25,
      hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>" };
  });
}
