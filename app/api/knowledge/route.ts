import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { knowledgeCards, knowledgeCorpus, retrieveKnowledge } from "@/lib/rag/retrieve";
import { textbookCatalog, textbookIdsSchema } from "@/lib/textbooks";
import { recordRequest, type RequestTelemetry } from "@/lib/operations/service";

export const runtime = "edge";
const searchSchema = z.object({ query: z.string().trim().min(2).max(2000), mode: z.enum(["text", "vector", "hybrid"]).default("hybrid"), textbookIds: textbookIdsSchema.optional() });

export async function GET() {
  return NextResponse.json({ version: knowledgeCorpus.version, count: knowledgeCards.length, scope: knowledgeCorpus.scope,
    textbooks: textbookCatalog.textbooks.map((book) => ({ ...book, count: knowledgeCards.filter((card) => book.sourceIds.includes(card.sourceId)).length })) });
}

export async function POST(request: NextRequest) {
  const telemetry: RequestTelemetry = { startedAt: Date.now() };
  const response = await handleKnowledge(request, telemetry);
  await recordRequest(request, response, telemetry);
  return response;
}

async function handleKnowledge(request: NextRequest, telemetry: RequestTelemetry) {
  const body = searchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: "请输入2至2000字的数学问题，并选择已收录的教材。" }, { status: 400 });
  telemetry.action = "knowledge-search";
  telemetry.ragAttempted = true;
  try {
    const { snapshot } = await retrieveKnowledge(body.data.query, { mode: body.data.mode, textbookIds: body.data.textbookIds, deadline: Date.now() + 4500 });
    telemetry.rag = snapshot;
    // Public course knowledge only; no user key, profile, local files or AI call.
    return NextResponse.json({ data: snapshot });
  } catch {
    return NextResponse.json({ message: "课程知识检索暂不可用，请稍后重试。" }, { status: 503 });
  }
}
