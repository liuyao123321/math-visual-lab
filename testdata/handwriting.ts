// Independently checked classroom scenarios. These are MOCK fixtures for
// protocol/UI regression, never presented as real OCR or real model judgments.
import { handwritingEvaluationSchema, type ConfirmedWork } from "@/lib/handwriting-schema";
export const work: ConfirmedWork = {
  question: "解方程 2x+1=5。", conditions: [], confirmed: true,
  steps: [{ id: "s1", text: "两边减1", formulas: ["2x=6"] }, { id: "s2", text: "两边除以2", formulas: ["x=3"] }],
};
export const evaluation = handwritingEvaluationSchema.parse({
  subject: "高等数学", topics: ["一元一次方程"], difficulty: "基础",
  status: "in_progress", summary: "先检查减法，后一步运算依赖前面的结果。", firstErrorStepId: "s1",
  steps: [
    { stepId: "s1", status: "incorrect", basis: "等式两边应同时减去相同的数。", strengths: ["移项方向合理"], issues: ["右边减法需重算"], errorTypes: ["calculation"], hint: "请重新计算右边的差，不要改变左边系数。" },
    { stepId: "s2", status: "dependent_error", basis: "按上一步的等式除以2成立，但上一步前提有误。", strengths: ["除法正确"], issues: ["依赖前一步错误"], errorTypes: [], hint: "改正前一步后再更新这一行。" },
  ], understandingQuestion: "", limitations: [],
});
export const recognition = {
  status: "needs_review", question: work.question, conditions: [],
  steps: work.steps.map((s, i) => ({ ...s, uncertainties: i === 0 ? [{ description: "右边数字可能是6或4，请对照原笔迹", candidates: ["6", "4"] }] : [] })),
  uncertainties: [], warnings: ["这里只转录，尚未判断数学正确性。"],
};
export const mathematicalCases = [
  { name: "正确完整", question: "解2x+1=5", steps: ["2x=4", "x=2"], reference: "每步等价，答案2；可标记完成。" },
  { name: "计算错与依赖", question: "解2x+1=5", steps: ["2x=6", "x=3"], reference: "第一步减法错；第二步运算本身成立但依赖错误。" },
  { name: "符号错", question: "解x-2=0", steps: ["x=-2"], reference: "移项符号错误，应检查等式两边同时加2。" },
  { name: "正确结论非法依据", question: "证明1=1", steps: ["设a=b=1", "(a-b)(a+b)=b(a-b)", "a+b=b", "所以1=1"], reference: "第三步除以零，末步正确结论不能挽救非法推理。" },
  { name: "定义域遗漏", question: "对所有非零实数证明ln(x²)=2ln(x)", steps: ["利用对数乘法公式得等式"], reference: "x=-1时右边实数范围未定义，原命题条件不足。" },
  { name: "合法替代方法", question: "解x²-4x+3=0", steps: ["(x-2)²=1", "x-2=±1", "x=1或3"], reference: "配方法合法，与因式分解不同不应判错。" },
  { name: "等价表达", question: "计算∫₀¹x dx", steps: ["[x²/2]₀¹=0.5"], reference: "0.5与1/2等价。" },
  { name: "条件不全", question: "计算函数的导数", steps: ["f'(x)=2x"], reference: "原函数未知，不能认定正确或编造原函数。" },
  { name: "部分作答", question: "解2x+1=5", steps: ["2x=4"], reference: "当前步骤正确但尚未解出x，应启发学生下一步。" },
];
