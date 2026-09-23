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
