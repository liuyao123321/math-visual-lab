import type { SolveResult } from "@/lib/math-schema";

export const examples: SolveResult[] = [
  {
    id: "example-quadratic",
    normalizedQuestion: "求函数 f(x)=x²-4x+3 的零点、顶点，并结合图像说明。",
    subject: "高等数学",
    questionType: "二次函数",
    topics: ["二次函数", "配方法", "函数零点"],
    difficulty: "基础",
    status: "solved",
    steps: [
      { id: "q1", title: "识别函数结构", explanation: "这是开口向上的二次函数。先分别用配方法和因式分解寻找顶点与零点。", formulas: ["f(x)=x^2-4x+3"], basis: "二次函数的一般形式", visualLayerIds: ["curve"] },
      { id: "q2", title: "配方求顶点", explanation: "把前两项配成完全平方，可直接读出对称轴和顶点坐标。", formulas: ["f(x)=(x-2)^2-1"], basis: "完全平方公式", commonMistake: "常见错误是展开 (x-2)² 时漏掉常数 4。", visualLayerIds: ["curve", "vertex"] },
      { id: "q3", title: "因式分解求零点", explanation: "令函数值为零并因式分解，两个因子分别为零。", formulas: ["x^2-4x+3=(x-1)(x-3)=0", "x_1=1,\\quad x_2=3"], basis: "零乘积定理", visualLayerIds: ["curve", "zeros"] },
      { id: "q4", title: "结合图像验证", explanation: "图像关于 x=2 对称，在 (2,-1) 处取得最小值，并与 x 轴交于 x=1 和 x=3。", formulas: ["\\text{顶点 }(2,-1)", "\\text{对称轴 }x=2"], basis: "函数图像的几何性质", visualLayerIds: ["curve", "vertex", "zeros", "axis"] },
    ],
    finalAnswerLatex: "x_1=1,\\ x_2=3;\\quad \\text{顶点}(2,-1),\\ \\text{对称轴 }x=2",
    commonMistakes: ["配方时常数项计算错误", "把顶点横坐标误写成 -2", "求出零点后未说明图像交点"],
    limitations: [],
    visualization: {
      kind: "cartesian", title: "二次函数的零点与顶点", xLabel: "x", yLabel: "f(x)", xDomain: [-2, 6], yDomain: [-3, 10],
      parameters: [{ key: "k", label: "常数项 k", min: 0, max: 6, step: 0.5, defaultValue: 3 }],
      layers: [
        { id: "curve", label: "函数曲线", type: "function", expression: "x^2-4*x+k", color: "#22d3ee" },
        { id: "axis", label: "对称轴", type: "line", x: [2, 2], y: [-3, 10], color: "#94a3b8", dashed: true },
        { id: "vertex", label: "顶点", type: "points", x: [2], y: [-1], color: "#f59e0b" },
        { id: "zeros", label: "零点", type: "points", x: [1, 3], y: [0, 0], color: "#22d3ee" },
      ],
    },
  },
  {
    id: "example-derivative",
    normalizedQuestion: "求函数 f(x)=x³-3x 的极值点，并观察不同位置的切线变化。",
    subject: "高等数学", questionType: "导数与极值", topics: ["导数", "切线", "极值"], difficulty: "中等", status: "solved",
    steps: [
      { id: "d1", title: "求导", explanation: "对幂函数逐项求导，得到导函数。", formulas: ["f'(x)=3x^2-3"], basis: "幂函数求导法则", visualLayerIds: ["function"] },
      { id: "d2", title: "寻找驻点", explanation: "令导数为零，得到两个驻点横坐标。", formulas: ["3x^2-3=0", "x=\\pm1"], basis: "极值的必要条件", visualLayerIds: ["function", "critical"] },
      { id: "d3", title: "判断极值", explanation: "导数在 x=-1 两侧由正变负，为极大值；在 x=1 两侧由负变正，为极小值。", formulas: ["f(-1)=2", "f(1)=-2"], basis: "一阶导数符号变化", visualLayerIds: ["function", "critical"] },
      { id: "d4", title: "观察切线", explanation: "移动切点 t，切线斜率等于 f'(t)。在驻点处斜率为零。", formulas: ["y=f'(t)(x-t)+f(t)"], basis: "导数的几何意义", visualLayerIds: ["function", "tangent", "moving-point"] },
    ],
    finalAnswerLatex: "\\text{极大值点 }(-1,2),\\quad \\text{极小值点 }(1,-2)",
    commonMistakes: ["只求出驻点但没有判断极大或极小", "把 f'(x) 的零点当作函数零点"], limitations: [],
    visualization: {
      kind: "cartesian", title: "函数与动态切线", xLabel: "x", yLabel: "y", xDomain: [-3, 3], yDomain: [-8, 8],
      parameters: [{ key: "t", label: "切点 t", min: -2, max: 2, step: 0.1, defaultValue: 0 }],
      layers: [
        { id: "function", label: "f(x)", type: "function", expression: "x^3-3*x", color: "#22d3ee" },
        { id: "tangent", label: "切线", type: "function", expression: "(3*t^2-3)*(x-t)+(t^3-3*t)", color: "#f59e0b" },
        { id: "critical", label: "极值点", type: "points", x: [-1, 1], y: [2, -2], color: "#a78bfa" },
        { id: "moving-point", label: "当前切点", type: "points", x: [0], y: [0], color: "#f59e0b" },
      ],
    },
  },
  {
    id: "example-integral",
    normalizedQuestion: "计算定积分 ∫₀²(2x-x²)dx，并用图像解释其几何意义。",
    subject: "高等数学", questionType: "定积分", topics: ["定积分", "原函数", "几何面积"], difficulty: "基础", status: "solved",
    steps: [
      { id: "i1", title: "确认积分区间", explanation: "函数在 [0,2] 上不小于零，因此定积分等于曲线与 x 轴围成的面积。", formulas: ["f(x)=2x-x^2=x(2-x)\\ge 0"], basis: "定积分的几何意义", visualLayerIds: ["integrand"] },
      { id: "i2", title: "求原函数", explanation: "使用幂函数积分公式逐项积分。", formulas: ["F(x)=x^2-\\frac{x^3}{3}"], basis: "牛顿—莱布尼茨公式", visualLayerIds: ["integrand", "area"] },
      { id: "i3", title: "代入上下限", explanation: "用上限处的原函数值减去下限处的原函数值。", formulas: ["F(2)-F(0)=4-\\frac{8}{3}=\\frac{4}{3}"], basis: "定积分计算公式", visualLayerIds: ["integrand", "area", "bounds"] },
    ],
    finalAnswerLatex: "\\int_0^2(2x-x^2)\\,dx=\\frac{4}{3}",
    commonMistakes: ["忘记用上限值减下限值", "把面积误写成负数", "积分后指数增加但没有除以新指数"], limitations: [],
    visualization: {
      kind: "cartesian", title: "定积分与面积", xLabel: "x", yLabel: "f(x)", xDomain: [-0.5, 2.5], yDomain: [-0.5, 1.5],
      parameters: [{ key: "b", label: "积分上限 b", min: 0.2, max: 2, step: 0.1, defaultValue: 2 }],
      layers: [
        { id: "integrand", label: "被积函数", type: "function", expression: "2*x-x^2", color: "#22d3ee" },
        { id: "area", label: "积分区域", type: "area", expression: "2*x-x^2", domain: [0, 2], color: "#f59e0b" },
        { id: "bounds", label: "积分端点", type: "points", x: [0, 2], y: [0, 0], color: "#f59e0b" },
      ],
    },
  },
];

export const exampleById = Object.fromEntries(examples.map((example) => [example.id, example])) as Record<string, SolveResult>;
