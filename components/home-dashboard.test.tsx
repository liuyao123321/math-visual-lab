import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeDashboard } from "@/components/home-dashboard";

vi.mock("./use-browser-gsap", () => ({ useBrowserGSAP: vi.fn() }));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("editorial homepage", () => {
  it("shows the two-line headline and one native tutoring action", () => {
    render(<HomeDashboard />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("把每一道难题，变成真正的理解。");
    expect(heading.querySelectorAll("[data-home-line]")).toHaveLength(2);
    const action = screen.getByRole("link", { name: "开始答疑" });
    expect(action).toHaveAttribute("href", "/solve");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
  it("leaves text and camera input in the tutor rather than duplicating them on the landing page", () => {
    render(<HomeDashboard />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByText("输入错题")).not.toBeInTheDocument();
    expect(screen.queryByText("离线演示题")).not.toBeInTheDocument();
  });
  it("keeps the content visible without JavaScript animation", () => {
    render(<HomeDashboard />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).not.toHaveAttribute("style");
    expect(screen.getByRole("link", { name: "开始答疑" })).not.toHaveAttribute("style");
    expect(heading.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
  it("labels the scripted film and exposes pause, chapter selection and replay", () => {
    render(<HomeDashboard />);
    expect(screen.getByText(/演示不发起 AI 请求/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "暂停演示" }));
    expect(screen.getByRole("button", { name: "播放演示" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "图像验证" }));
    expect(screen.getByRole("button", { name: "图像验证" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "重播演示" }));
    expect(screen.getByRole("button", { name: "暂停演示" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "输入问题" })).toHaveAttribute("aria-pressed", "true");
  });
  it("uses a complete still and removes playback controls for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<HomeDashboard />);
    expect(screen.getByText("已按系统偏好显示静态演示")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "演示播放控制" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "演示章节" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始答疑" })).toHaveAttribute("href", "/solve");
  });
});
