import type { PracticePaper, MistakeRecord } from "@/lib/math-schema";

// These templates use closed-form results, not model-generated mathematics.
export function offlinePaper(mistakes: MistakeRecord[], count = 5): PracticePaper {
  const topics = mistakes.flatMap((item) => item.topics).join(" ");
  const supported = /二次函数|配方|零点|导数|切线|极值|积分|原函数|面积/.test(topics);
  if (!supported) throw new Error("离线题库当前支持二次函数、导数与积分；其他知识点请使用 AI 出卷。");
  const families = [
    ...(/二次函数|配方|零点/.test(topics) ? ["quadratic"] : []),
    ...(/导数|切线|极值/.test(topics) ? ["derivative"] : []),
    ...(/积分|原函数|面积/.test(topics) ? ["integral"] : []),
  ];
  const questions: PracticePaper["questions"] = Array.from({ length: count }, (_, index) => {
    const family = families[index % families.length];
    const a = index + 2;
    if (family === "quadratic") return { id: crypto.randomUUID(), question: `求 f(x)=x²-${2 * a}x+${a * a - 1} 的零点和顶点，说明其对称轴。`, hint: "先写成 (x-a)²-1，再令函数值为0。", answerLatex: `x_1=${a - 1},\\quad x_2=${a + 1},\\quad V=(${a},-1),\\quad x=${a}`, topics: ["二次函数", "配方法", "函数零点"], difficulty: "基础", expectedConcepts: ["配方法", "顶点式", "零点"] };
    if (family === "derivative") return { id: crypto.randomUUID(), question: `求 f(x)=x³-${3 * a * a}x 的极值点，并写出 x=0 处的切线。`, hint: "先求导并检查导数在驻点两侧的符号；切线经过 (0,0)。", answerLatex: `\\text{极大值点 }(-${a},${2 * a ** 3}),\\quad \\text{极小值点 }(${a},-${2 * a ** 3}),\\quad y=-${3 * a * a}x`, topics: ["导数", "极值", "切线"], difficulty: "中等", expectedConcepts: ["驻点", "导数符号", "切线斜率"] };
    return { id: crypto.randomUUID(), question: `计算从 0 到 ${a} 的定积分 ∫(${a}x-x²)dx，说明是否等于几何面积。`, hint: `被积函数 x(${a}-x) 在积分区间非负，用原函数上限值减下限值。`, answerLatex: `\\int_0^{${a}}(${a}x-x^2)\\,dx=\\frac{${a ** 3}}{6}\\approx ${(a ** 3 / 6).toFixed(4)},\\quad \\text{等于几何面积}`, topics: ["定积分", "原函数", "几何面积"], difficulty: "基础", expectedConcepts: ["牛顿莱布尼茨公式", "带符号面积"] };
  });
  return { title: "错题专项模拟试卷（离线题库）", rationale: "从你的错题知识点选择二次函数、导数或积分模板，以独立计算的数值构造变式。离线题库不覆盖其他课程。", questions };
}
