import { z } from "zod";
import { questionAssessmentSchema, solveResultSchema } from "./math-schema";
import { handwritingRecognitionSchema } from "./handwriting-schema";

// One image pass: classify content and transcribe it, never solve student work.
export const photoWorkSchema = z.object({
  kind: z.enum(["student_work", "uncertain"]),
  reason: z.string().trim().min(1).max(500),
  recognition: handwritingRecognitionSchema,
}).refine((v) => v.kind !== "student_work" || (v.recognition.status !== "unreadable" && v.recognition.steps.length > 0),
  "检测到解题过程时必须有可核对的原始步骤；无法确定时使用 uncertain");
export const photoAnalysisSchema = z.union([
  z.object({ kind: z.literal("question"), assessment: questionAssessmentSchema }),
  photoWorkSchema,
]);
export const photoTutorResultSchema = z.union([
  z.object({ kind: z.literal("solution"), solution: solveResultSchema }),
  photoWorkSchema,
]);
export type PhotoWork = z.infer<typeof photoWorkSchema>;
export type PhotoTutorResult = z.infer<typeof photoTutorResultSchema>;

export const photoRoutingInstructions = [
  "这是统一图片答疑入口。先判断图片内容，再决定辅导路径。这里只识别与核对，禁止解题、纠错、生成答案或评价步骤。",
  "kind=question：只有题目或已知条件。题干自带的等式、示例、印刷参考解答、手抄的题目均不能仅因包含公式或手写就被当成学生作答。",
  "kind=student_work：图片明确包含学生正在尝试的计算、推导、证明或作答，即使只有一行或已做完，也必须走过程辅导，不能直接展示完整答案。原题可以缺失，此时请求核对或补充。",
  "无法区分题干和学生作答、出现参考解答且用途不明、只有圈画批注而无法判断意图，kind=uncertain，请用户选择；不得用猜测触发完整解题。模糊或空白图片同样用 uncertain。",
  "过程转录必须忠实保留学生的错误；不能自动改成正确式子。分开 question原题、conditions已知条件、steps学生原文步骤。按书写逻辑排序，每步唯一id、text原文、formulas独立LaTeX、uncertainties歧义。",
  String.raw`文字中的数学表达式用 \( ... \) 包围，formulas用独立LaTeX，不带美元符号；JSON反斜杠正确转义，不产生控制字符。不能为了公式渲染而改变学生的数学内容。`,
  "负号/横线、1/l、0/O、上下标、分式、积分上下限、矩阵或步骤顺序不明，给uncertainties的description与candidates（无候选用[]）。无法辨认用[无法辨认]占位，不猜测、不伪造坐标或置信度。",
  "recognition.status=recognized仅在题目与至少一步清晰时使用；条件缺失或有歧义用needs_review；完全无法辨认用unreadable。每步文字及公式至多1200字符，最多20步、每步4个公式/6个歧义；条件最多10项、全局歧义10项、warnings8项。",
  '唯一输出协议：只有题目时 {"kind":"question","assessment":{按上述题目核对协议}}；有学生过程或无法区分时 {"kind":"student_work或uncertain","reason":"分类依据或需用户核对的问题","recognition":{"status":"recognized|needs_review|unreadable","question":"原题或可辨认部分","conditions":[],"steps":[{"id":"s1","text":"学生原文","formulas":[],"uncertainties":[]}],"uncertainties":[],"warnings":[]}}。不要混用两种结构，不输出答案字段。',
].join("\n");
