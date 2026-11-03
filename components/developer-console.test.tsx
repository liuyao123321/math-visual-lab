import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeveloperConsole } from "./developer-console";
import type { Feedback, Stats } from "@/lib/operations/schema";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const stats: Stats = { days: 7, start: "2026-10-21", end: "2026-10-27", uv: 0, pv: 0, newVisitors: 0, activeVisitors: 0, aiRequests: 0, aiSuccess: 0, aiAverageMs: null, solveRequests: 0, ragRequests: 0, ragMatches: 0, pendingFeedback: 1, daily: [], features: [], failures: [] };
describe("developer dashboard", () => {
  it("uses platform sign-out instead of pretending to end platform identity with a local cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url === "/api/operations/session" ? { configured: true, authenticated: true, mode: "platform" } : url.startsWith("/api/developer/stats") ? { data: stats } : { data: [], total: 0, page: 1, pageSize: 20 } })));
    render(<DeveloperConsole signInPath="/test-signin" signOutPath="/test-signout" />);
    expect(await screen.findByRole("link", { name: "退出网站账号" })).toHaveAttribute("href", "/test-signout");
    expect(screen.queryByRole("button", { name: "退出后台" })).not.toBeInTheDocument();
  });
  it("does not fetch protected records until the server verifies a session", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, authenticated: false, mode: "local" }) });
    vi.stubGlobal("fetch", fetcher); render(<DeveloperConsole signInPath="/test-signin" signOutPath="/test-signout" />);
    await screen.findByLabelText("开发者密码");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toBe("/api/operations/session");
    expect(screen.queryByRole("heading", { name: "独立访客 UV" })).not.toBeInTheDocument();
  });
  it("shows real empty states and safely saves feedback state/notes", async () => {
    const item: Feedback = { id: "FDB-test", title: "虚构测试反馈标题", description: "<img src=x onerror=alert(1)>这是反馈文字，不是网页代码。", steps: "复现步骤", contact: "", category: "bug", page: "/solve", status: "new", note: "", version: 1, createdAt: 1793070000000, updatedAt: 1793070000000 };
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/operations/session") return { ok: true, json: async () => ({ configured: true, authenticated: true, mode: "local" }) };
      if (url.startsWith("/api/developer/stats")) return { ok: true, json: async () => ({ data: stats }) };
      if (options?.method === "PATCH") { Object.assign(item, JSON.parse(options.body as string)); item.version++; return { ok: true, json: async () => ({ data: item }) }; }
      return { ok: true, json: async () => ({ data: [{ ...item }], total: 1, page: 1, pageSize: 20 }) };
    });
    vi.stubGlobal("fetch", fetcher); const page = render(<DeveloperConsole signInPath="/test-signin" signOutPath="/test-signout" />);
    await screen.findByText(/该时间范围尚无页面访问记录/);
    fireEvent.click(screen.getByRole("button", { name: "问题反馈" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看反馈：虚构测试反馈标题" }));
    expect(page.container.querySelector("img")).toBeNull();
    fireEvent.change(screen.getByLabelText("处理状态"), { target: { value: "resolved" } });
    fireEvent.change(screen.getByLabelText("内部处理备注"), { target: { value: "已核对该虚构问题。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存处理结果" }));
    await screen.findByText("处理结果已保存。");
    await waitFor(() => expect(screen.getByRole("button", { name: "查看反馈：虚构测试反馈标题" })).toHaveTextContent("已解决"));
    const patch = fetcher.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(patch![1]!.body as string)).toEqual({ status: "resolved", note: "已核对该虚构问题。", version: 1 });
  });
});
