import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fill() { fireEvent.change(screen.getByLabelText("反馈标题"), { target: { value: "虚构测试问题反馈" } }); fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "这是一个用于验证反馈功能的虚构描述，没有真实用户资料。" } }); }
describe("user feedback", () => {
  it("keeps the draft and submission ID after a network failure, and shows the server receipt on retry", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("连接中断")).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "FDB-fixture" }) });
    vi.stubGlobal("fetch", fetcher); render(<FeedbackForm />); fill();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByRole("alert"); expect(screen.getByLabelText("反馈标题")).toHaveValue("虚构测试问题反馈");
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByRole("heading", { name: "反馈已收到" });
    const first = JSON.parse(fetcher.mock.calls[0][1].body), retry = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(first.submissionId).toBe(retry.submissionId); expect(screen.getByLabelText("反馈编号")).toHaveTextContent("FDB-fixture");
    expect(first).not.toHaveProperty("apiKey"); expect(first).not.toHaveProperty("image");
  });
  it("keeps an explicit server failure visible and never claims success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "服务暂不可用" }) }));
    render(<FeedbackForm />); fill(); fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("服务暂不可用"));
    expect(screen.queryByRole("heading", { name: "反馈已收到" })).not.toBeInTheDocument();
  });
});
