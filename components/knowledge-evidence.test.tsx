import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KnowledgeEvidence, StepKnowledgeEvidence } from "./knowledge-evidence";
import { ragSnapshotSchema, type RagSnapshot } from "@/lib/rag/schema";

const snapshot: RagSnapshot = {
  version: 1, knowledgeBaseVersion: "test-only", status: "matched", retrievalMode: "text", vectorStatus: "unavailable",
  message: "已使用文本检索课程资料。", usedKnowledgeIds: ["TEST-1"], retrievalMs: 2,
  cards: [{ id: "TEST-1", title: "测试知识卡", kind: "theorem", keywords: ["导数"], statement: "这是测试资料。", formulas: [],
    conditions: [{ id: "c1", text: "函数在该点可导" }], pitfalls: [], sourceId: "test", reviewStatus: "source_checked",
    source: { title: "公开教材", section: "测试章节", url: "https://openstax.org/books/calculus-volume-1/pages/4-3-maxima-and-minima" } }],
};

describe("knowledge evidence presentation", () => {
  it("distinguishes actual references from retrieved candidates and does not imply teacher approval", () => {
    render(<KnowledgeEvidence rag={snapshot} />);
    expect(screen.getByText("解析已引用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("测试知识卡"));
    expect(screen.getByText(/待团队及教师复核/)).toBeInTheDocument();
    expect(screen.getByRole("link").getAttribute("href")).toContain("openstax.org");
    expect(screen.getByText(/不代表数学结论已经证明/)).toBeInTheDocument();
  });
  it("shows unknown conditions as unknown rather than verified", () => {
    render(<StepKnowledgeEvidence rag={snapshot} step={{ id: "s1", title: "对比", explanation: "解释", formulas: [], basis: "", visualLayerIds: [], knowledgeIds: ["TEST-1"], citationPurpose: "contrast", conditionChecks: [{ knowledgeId: "TEST-1", conditionId: "c1", status: "unknown", evidence: "题干没有说明" }] }} />);
    fireEvent.click(screen.getByText("查看本步知识依据与条件"));
    expect(screen.getByText(/尚未确认/)).toBeInTheDocument();
    expect(screen.getByText("题干没有说明")).toBeInTheDocument();
  });
  it("never renders sources with executable URL schemes", () => {
    const bad = structuredClone(snapshot); bad.cards[0].source.url = "javascript:alert(1)";
    expect(ragSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
