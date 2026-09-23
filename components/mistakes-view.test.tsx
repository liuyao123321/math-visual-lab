import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MistakesView } from "@/components/mistakes-view";
import { defaultSettings } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";

describe("MistakesView", () => {
  beforeEach(() => {
    useMathLabStore.setState({ mistakes: [], settings: defaultSettings, hydrated: true, currentSolution: null });
  });

  it("shows a useful empty state", () => {
    render(<MistakesView />);
    expect(screen.getByText("错题集还是空的")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看示例题" })).toHaveAttribute("href", "/solve?example=example-quadratic");
  });
});
