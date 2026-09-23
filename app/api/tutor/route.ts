import { NextRequest, NextResponse } from "next/server";
import {
  explainResultSchema,
  practiceResultSchema,
  solveResultSchema,
  tutorRequestSchema,
  type TutorRequest,
} from "@/lib/math-schema";

export const runtime = "edge";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

const RESPONSE_SHAPES = {
  solve: '{"id":"short-id","normalizedQuestion":"完整题目","subject":"高等数学|线性代数|概率统计|其他","questionType":"题型","topics":["知识点"],"difficulty":"基础|中等|进阶","status":"solved|needs_more_info|unsupported","steps":[{"id":"step-1","title":"步骤名","explanation":"中文解释","formulas":["LaTeX，不含美元符号"],"basis":"公式或定理依据","commonMistake":"可选","visualLayerIds":["layer-id"]}],"finalAnswerLatex":"LaTeX","commonMistakes":["常见错误"],"limitations":["限制"],"visualization":{"kind":"cartesian","title":"图像标题","xLabel":"x","yLabel":"y","xDomain":[-5,5],"yDomain":[-5,5],"parameters":[{"key":"a","label":"参数 a","min":-3,"max":3,"step":0.1,"defaultValue":1}],"layers":[{"id":"curve","label":"函数","type":"function|line|points|area","expression":"mathjs 表达式","x":[0],"y":[0],"domain":[-5,5],"color":"#22d3ee","dashed":false}]}}',
  "explain-step": '{"title":"针对性标题","explanation":"详细中文解释","formulas":["LaTeX"],"analogy":"直观类比","checkQuestion":"检查理解的小问题"}',
  "similar-practice": '{"question":"练习题","hint":"分层提示","answerLatex":"LaTeX 答案","topics":["知识点"],"difficulty":"基础|中等|进阶"}',
} as const;

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "original" } }
  >;
};

function buildMessages(request: TutorRequest): DeepSeekMessage[] {
  const common = [
    "你是一位严谨的大学数学助教。只能输出合法 JSON，禁止输出 Markdown 代码围栏或额外说明。",
    "数学结论不确定、条件不足或超出能力时必须明确标记，不能编造。",
    "公式使用 LaTeX 字符串且不包含美元符号。所有自然语言使用简体中文。",
    "可视化仅限二维笛卡尔坐标。expression 只能使用数字、x、参数名、sin、cos、tan、exp、log、sqrt、abs、pi 及基本运算，禁止代码。",
    "line 类型若表示竖线，可省略 expression 并使用 x/y 数组；points 必须提供等长 x/y；area 必须提供 expression 和 domain。",
    "输出 JSON 结构必须匹配下面示例：",
    RESPONSE_SHAPES[request.action],
  ].join("\n");

  if (request.action === "solve") {
    const prompt = request.imageDataUrl
      ? [
          "请先准确识别图片中的完整数学题，再按要求求解。",
          "若图片模糊、题目被裁切、符号无法辨认或条件不完整，不要猜测；请将 status 设为 needs_more_info，并在 limitations 中说明需要用户补充什么。",
          "解析模式：" + request.mode + "。",
          request.question ? "用户补充说明：" + request.question : "用户没有补充文字说明。",
        ].join("\n")
      : "解析模式：" + request.mode + "。题目：" + request.question;
    return [
      { role: "system", content: common },
      {
        role: "user",
        content: request.imageDataUrl
          ? [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: request.imageDataUrl, detail: "original" } },
            ]
          : prompt,
      },
    ];
  }
  if (request.action === "explain-step") {
    return [
      { role: "system", content: common },
      { role: "user", content: "原题：" + request.question + "\n学生不理解的步骤：" + JSON.stringify(request.step) + "\n学生反馈：" + request.reason + "\n解析模式：" + request.mode },
    ];
  }
  return [
    { role: "system", content: common },
    { role: "user", content: "根据原题生成一道不同数值、相同核心方法的练习题。\n原题：" + request.sourceQuestion + "\n知识点：" + request.topics.join("、") + "\n难度：" + request.difficulty },
  ];
}

class UpstreamError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}

class ValidationError extends Error {
  constructor(message: string, public raw: string) { super(message); }
}

async function deepSeekJson(apiKey: string, messages: DeepSeekMessage[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 5200,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new UpstreamError("密钥无效或无权访问该模型。", "invalid_key", 401);
      if (response.status === 429) throw new UpstreamError("请求过于频繁或账户额度不足，请稍后再试。", "rate_limited", 429);
      throw new UpstreamError("DeepSeek 服务暂时不可用。", "upstream_error", 502);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new UpstreamError("模型返回了空内容，请重试。", "empty_response", 502);
    try { return { parsed: JSON.parse(content), raw: content }; }
    catch { throw new ValidationError("模型返回内容不是合法 JSON。", content); }
  } catch (error) {
    if (error instanceof UpstreamError || error instanceof ValidationError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new UpstreamError("DeepSeek 请求超时。", "timeout", 504);
    throw new UpstreamError("无法连接 DeepSeek 服务。", "network_error", 502);
  } finally {
    clearTimeout(timer);
  }
}

function schemaFor(action: TutorRequest["action"]) {
  return action === "solve" ? solveResultSchema : action === "explain-step" ? explainResultSchema : practiceResultSchema;
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const apiKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!apiKey) return NextResponse.json({ code: "missing_key", message: "请先配置 DeepSeek API 密钥。" }, { status: 401 });

  let parsedRequest: TutorRequest;
  try {
    parsedRequest = tutorRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ code: "invalid_request", message: "题目或请求参数不完整。" }, { status: 400 });
  }

  const schema = schemaFor(parsedRequest.action);
  try {
    const messages = buildMessages(parsedRequest);
    let first: { parsed: unknown; raw: string };
    try {
      first = await deepSeekJson(apiKey, messages);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      first = { parsed: null, raw: error.raw };
    }

    const normalized = parsedRequest.action === "solve" && first.parsed && typeof first.parsed === "object"
      ? { ...(first.parsed as object), id: crypto.randomUUID() }
      : first.parsed;
    const checked = schema.safeParse(normalized);
    if (checked.success) return NextResponse.json({ data: checked.data });

    const issueText = checked.error.issues.slice(0, 8).map((issue) => issue.path.join(".") + ": " + issue.message).join("; ");
    const repairMessages = [
      ...messages,
      { role: "assistant", content: first.raw },
      { role: "user", content: "上面的 JSON 未通过结构校验。请只返回修复后的完整 JSON。错误：" + issueText },
    ];
    const repaired = await deepSeekJson(apiKey, repairMessages);
    const repairedNormalized = parsedRequest.action === "solve" && repaired.parsed && typeof repaired.parsed === "object"
      ? { ...(repaired.parsed as object), id: crypto.randomUUID() }
      : repaired.parsed;
    const repairedChecked = schema.safeParse(repairedNormalized);
    if (!repairedChecked.success) {
      return NextResponse.json({ code: "invalid_model_output", message: "模型解析格式异常，请调整题目后重试。" }, { status: 502 });
    }
    return NextResponse.json({ data: repairedChecked.data });
  } catch (error) {
    if (error instanceof UpstreamError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ code: "internal_error", message: "解析过程中出现异常，请稍后重试。" }, { status: 500 });
  }
}
