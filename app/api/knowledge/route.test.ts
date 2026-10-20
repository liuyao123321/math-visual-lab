// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("public course retrieval", () => {
  it("returns chapter metadata without needing a generation key", async () => {
    expect((await (await GET()).json() as { count: number }).count).toBe(42);
  });
  it("retrieves real course cards with no model-generation call", async () => {
    const response = await POST(request({ query: "费马定理适用条件", mode: "text" }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { status: string; cards: unknown[] } };
    expect(payload.data.status).toBe("matched");
    expect(payload.data.cards.length).toBeGreaterThan(0);
  });
  it("rejects empty, overlong and malformed queries", async () => {
    for (const body of [{ query: "" }, { query: "x".repeat(2001) }, null]) expect((await POST(request(body))).status).toBe(400);
  });
  it("publishes the real textbook catalog and scopes retrieval to the chosen source set", async () => {
    const catalog = await (await GET()).json() as { textbooks: Array<{ id: string; count: number; coverage: string }> };
    expect(catalog.textbooks[0].count).toBe(42);
    expect(catalog.textbooks[0].coverage).toContain("部分");
    const response = await POST(request({ query: "费马定理适用条件", mode: "text", textbookIds: [catalog.textbooks[0].id] }));
    const payload = await response.json() as { data: { textbookIds: string[]; cards: Array<{ source: { title: string } }> } };
    expect(response.status).toBe(200);
    expect(payload.data.textbookIds).toEqual([catalog.textbooks[0].id]);
    expect(payload.data.cards.every((card) => card.source.title.includes("Calculus Volume 1"))).toBe(true);
  });
  it("does not silently substitute all textbooks for an unknown or empty choice", async () => {
    for (const textbookIds of [["missing"], []]) expect((await POST(request({ query: "导数定义", textbookIds }))).status).toBe(400);
  });
});
