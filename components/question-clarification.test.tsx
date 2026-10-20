import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionClarification } from "@/components/question-clarification";
import type { ClarificationQuestion } from "@/lib/math-schema";
import type { ClarificationDraft } from "@/lib/question-clarification";

const questions: ClarificationQuestion[] = [{ missingIndex: 0, title: "需要求什么？", options: [{ label: "求零点", value: "求函数零点", description: "找到函数值为零的位置" }, { label: "求极值", value: "求函数极值" }] }];
afterEach(cleanup);
function Harness({ onConfirm, disabled = false }: { onConfirm: (question: string) => void; disabled?: boolean }) {
  const [value, onChange] = useState<ClarificationDraft>({});
  return <QuestionClarification question="f(x)=x^2" questions={questions} value={value} onChange={onChange} onConfirm={onConfirm} disabled={disabled} />;
}
describe("clarification option cards", () => {
  it("starts without a default choice and submits only after explicit confirmation", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const submit = screen.getByRole("button", { name: "确认补充并继续解析" });
    expect(submit).toBeDisabled();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
    fireEvent.click(screen.getByRole("radio", { name: /求零点/ }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(submit).toBeEnabled();
    expect(screen.getByText("需要求什么？：求函数零点")).toBeInTheDocument();
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith(expect.stringContaining("需要求什么？：求函数零点"));
  });
  it("supports a free-text answer instead of a candidate and locks controls while busy", () => {
    const onConfirm = vi.fn();
    const page = render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("radio", { name: "自己填写" }));
    expect(screen.getByRole("button", { name: "确认补充并继续解析" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("补充：需要求什么？"), { target: { value: "求导数" } });
    fireEvent.click(screen.getByRole("button", { name: "确认补充并继续解析" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.stringContaining("需要求什么？：求导数"));
    page.rerender(<Harness onConfirm={onConfirm} disabled />);
    expect(screen.getByRole("button", { name: "确认补充并继续解析" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "自己填写" })).toBeDisabled();
  });
});
