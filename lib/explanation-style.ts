import type { ExplanationMode } from "./math-schema";

export function explanationStyle(mode: ExplanationMode) {
  if (mode === "concise") return [
    "简洁答疑：像考前核对解法的答案卡，先给最短可核验的解题路径，不写授课式铺垫。",
    "简单题通常1—3步；复杂题按关键转折增加必要步骤，不为凑短而跳过证明、分类讨论、定义域或定理条件。",
    "每步 summary 用一句话交代关键操作及必要条件，explanation 只补直接相关理由，formulas 保留决定结论的等价变形，basis 简短准确。不要在 summary 和 explanation 重复同一句话。",
    "不添加 goal、verification 或泛泛的学习建议；条件仍放 conditions，不能省略。不要重复复述题干或为每步编造易错提醒。",
  ].join("\n");
  if (mode === "detailed") return [
    "详细答疑：面向第一次学习此方法的大学生，用可复核的教学说明讲清为什么，绝不是把简洁版换成更长的同义句。",
    "按一个推理动作一步组织；简单题无需硬凑步骤，复杂题最多8步。关键变形在 formulas 中展开中间等式，不用‘显然’、‘易得’跳过关键推理。",
    "每步 goal 说明当前要解决什么；explanation 连接已知条件、选用方法的原因和这一变形如何成立；basis 写定理名称及适用依据；conditions 只列真正需要核对的数学条件。",
    "verification 给一个可实际执行的局部自检（代回、求导验证、符号检查等）；无法合理自检时省略，不能编造。commonMistake 只指出当前步骤真实易错点。summary 可用一句话概括，不能代替正文。",
    "最后核对结论与原题条件。展示的是教学推导和证明依据，不输出内部思考、自我对话或未经验证的猜测；不擅自添加无用图像。",
  ].join("\n");
  return "可视化答疑：公式与必要图像联动，说明当前图层如何验证关键推理；不为简单计算添加装饰性图像或改变固定条件。";
}
