import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./settings-view";
import { defaultSettings } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";

const theme = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => theme }));
vi.mock("@/lib/storage", async (original) => ({ ...await original<typeof import("@/lib/storage")>(), getApiKey: () => "", setApiKey: vi.fn() }));
beforeEach(() => {
  // jsdom does not implement the scrolling used by Radix's keyboard menu.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  theme.setTheme.mockReset();
  useMathLabStore.setState({ settings: defaultSettings, hydrated: true });
});
afterEach(cleanup);

describe("appearance lives in settings", () => {
  it("offers all three color modes and persists an explicit selection", async () => {
    render(<SettingsView />);
    const label = screen.getByText("颜色模式").closest("label")!;
    const trigger = label.querySelector('[role="combobox"]')!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "深色模式" }));
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
    expect(useMathLabStore.getState().settings.theme).toBe("dark");
  });
});
