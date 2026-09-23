// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tutor/route";
import { examples } from "@/lib/examples";

afterEach(() => vi.restoreAllMocks());

describe("POST /api/tutor", () => {
  it("rejects requests without an API key", async () => {
    const request = new NextRequest("http://localhost/api/tutor", { method: "POST", body: JSON.stringify({ action: "solve", question: "求 x+1=0", mode: "concise" }) });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns validated structured solutions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(examples[0]) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "求 x²-4x+3 的零点", mode: "visual" }),
    });
    const response = await POST(request);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.status).toBe("solved");
    expect(payload.data.id).not.toBe(examples[0].id);
  });

  it("sends an uploaded question image as a vision input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(examples[0]) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "", mode: "visual", imageDataUrl }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const upstreamBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(upstreamBody.messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url", image_url: { url: imageDataUrl, detail: "original" } }),
    ]));
  });

  it("maps an upstream authentication failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer bad-key", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "求 x+1=0", mode: "concise" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("invalid_key");
  });
});
