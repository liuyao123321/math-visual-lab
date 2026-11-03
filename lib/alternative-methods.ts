import type { MultiMethodResult } from "@/lib/math-schema";
import { exampleById } from "@/lib/examples";

export function exampleMethods(id: string): MultiMethodResult | null {
  const solution = exampleById[id];
  if (!solution) return null;
  const alternatives = {
    "example-triple-integral": { name: "三棱锥体积公式", idea: "以 xy 平面上的三角形为底，直接计算底面积与垂直高度。", applicability: "该区域是平面围成的三棱锥；一般曲面围成的立体不能套用。", steps: [{ id: "alt-v", title: "计算底面积与高度", explanation: "底面是两直角边均为 1 的三角形，顶点 (0,0,1) 到底面的距离为 1。", formulas: ["S=\\frac12,\\quad h=1,\\quad V=\\frac13Sh=\\frac16"], basis: "棱锥体积公式", visualLayerIds: [] }] },
    "example-quadratic": { name: "求根公式与顶点公式", idea: "直接使用二次函数的系数计算零点、对称轴与顶点。", applicability: "适用于所有 a 不为零的二次函数；实根存在需要判别式不小于零。", steps: [{ id: "alt-q", title: "代入系数公式", explanation: "a=1，b=-4，c=3。判别式为4，两个实根为1和3；顶点横坐标为2，纵坐标为-1。", formulas: ["\\Delta=b^2-4ac=4", "x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}=2\\pm1", "x_V=-\\frac{b}{2a}=2,\\quad y_V=-1"], basis: "求根公式与顶点公式", visualLayerIds: [] }] },
    "example-derivative": { name: "二阶导数判别", idea: "先找驻点，再用二阶导数判断局部凹凸性。", applicability: "函数二阶可导且驻点处二阶导数不为零；为零时不能据此下结论。", steps: [{ id: "alt-d", title: "计算二阶导数", explanation: "驻点为±1。二阶导数在-1处为负，所以是极大值点；在1处为正，所以是极小值点。", formulas: ["f''(x)=6x", "f''(-1)=-6<0,\\quad f''(1)=6>0"], basis: "二阶导数极值判别法", visualLayerIds: [] }] },
    "example-integral": { name: "平移后利用对称性", idea: "以区间中点为原点，把抛物线化为偶函数。", applicability: "积分区间关于中点对称且平移后的被积函数为偶函数时，可以减少计算。", steps: [{ id: "alt-i", title: "令 u=x-1", explanation: "区间变为[-1,1]，被积函数为1-u²。偶函数积分等于正半区间积分的两倍。", formulas: ["2x-x^2=1-(x-1)^2=1-u^2", "\\int_{-1}^1(1-u^2)\\,du=2\\int_0^1(1-u^2)\\,du=\\frac43"], basis: "变量代换与偶函数积分性质", visualLayerIds: [] }] },
  };
  const alternative = alternatives[id as keyof typeof alternatives];
  if (!alternative) return null;
  return { methods: [
    { name: "原解析方法", idea: solution.steps[0].explanation, applicability: solution.steps.map((step) => step.basis).join("、"), steps: solution.steps, answerLatex: solution.finalAnswerLatex },
    { ...alternative, answerLatex: solution.finalAnswerLatex },
  ], comparison: "两种方法的结论一致。原方法更适合解释推理过程，另一方法提供独立验证；选择方法时应先确认其适用条件。" };
}
