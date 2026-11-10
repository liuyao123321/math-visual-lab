"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { useBrowserGSAP } from "./use-browser-gsap";
import type { gsap } from "gsap";
import { MathFormula } from "@/components/math-formula";
import type { ExplanationMode } from "@/lib/math-schema";
import { tutorModes } from "@/lib/tutor-navigation";


const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(notify: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(reducedQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function readMotion() { return typeof window.matchMedia !== "function" || window.matchMedia(reducedQuery).matches; }

export function TutorModePreview({ mode }: { mode: ExplanationMode }) {
  const root = useRef<HTMLElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, () => true);
  const [paused, setPaused] = useState(false);
  const item = tutorModes.find((item) => item.mode === mode)!;

  useBrowserGSAP((gsap) => {
    if (reduced || !root.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const scene = root.current!;
      const lines = scene.querySelectorAll("[data-preview-line]");
      const answer = scene.querySelectorAll("[data-preview-answer]");
      const curve = scene.querySelectorAll("[data-preview-curve]");
      const points = scene.querySelectorAll("[data-preview-point]");
      const progress = scene.querySelector("[data-preview-progress]");
      const animation = gsap.timeline({ repeat: -1, repeatDelay: 1.4, paused });
      timeline.current = animation;
      animation.fromTo(scene.querySelector("[data-preview-scene]"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22 }, 0);
      animation.fromTo(lines, { opacity: 0.1, y: 5 }, { opacity: 1, y: 0, duration: 0.35, stagger: mode === "detailed" ? 0.8 : 0.5 }, 0.25);
      if (curve.length) animation.fromTo(curve, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: "power1.inOut" }, 0.35);
      if (points.length) animation.fromTo(points, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.45 }, 1.8);
      animation.fromTo(answer, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.4 }, mode === "concise" ? 1.2 : 3.1);
      animation.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: 6, ease: "none" }, 0);
      return () => { animation.kill(); if (timeline.current === animation) timeline.current = null; };
    });
    return () => media.revert();
    // Pausing controls the current timeline without rebuilding or resetting it.
  }, { scope: root, dependencies: [mode, reduced], revertOnUpdate: true });
  useEffect(() => { timeline.current?.paused(paused); }, [paused]);

  return <section ref={root} className="tutor-preview" aria-label={`${item.label}演示`} data-preview-mode={mode} data-reduced-motion={reduced ? "true" : "false"}>
<div className="tutor-preview-heading"><span>{item.label}</span></div>  
    <div className="tutor-preview-question"><span>求零点与顶点</span><MathFormula value={String.raw`f(x)=x^2-4x+3`} block={false} /></div>
    <div className="tutor-preview-scene" data-preview-scene key={mode}>
      {mode === "concise" && <div className="tutor-preview-concise">
        <p data-preview-line>因式分解，直接求零点。</p>
        <div data-preview-line><MathFormula value={String.raw`f(x)=(x-1)(x-3)`} block={false} /></div>
        <div className="tutor-preview-answer" data-preview-answer><p>零点为 1、3</p><MathFormula value={String.raw`\text{顶点 }(2,-1)`} block={false} /></div>
      </div>}
      {mode === "detailed" && <ol className="tutor-preview-derivation">
        <li data-preview-line><p>先配方，找到顶点</p><MathFormula value={String.raw`x^2-4x+3=(x-2)^2-1`} block={false} /></li>
        <li data-preview-line><p>令函数值为零</p><MathFormula value={String.raw`(x-2)^2=1\;\Rightarrow\;x=1\text{ 或 }3`} block={false} /></li>
        <li data-preview-line><p>平方项最小为零，且在 x=2 处取得</p><span data-preview-answer><MathFormula value={String.raw`\text{顶点 }(2,-1)`} block={false} /></span></li>
      </ol>}
      {mode === "visual" && <div className="tutor-preview-visual">
        <svg viewBox="0 0 320 194" role="img" aria-label="固定函数 x²−4x+3 的图像，零点为1与3，顶点为(2,−1)">
          <g className="tutor-preview-grid" aria-hidden="true"><path d="M94 14V180M160 14V180M226 14V180M292 14V180M28 29H306M28 61H306M28 93H306M28 157H306" /></g>
          <path className="tutor-preview-axis" d="M12 125H308M28 14V180" />
          <g className="tutor-preview-axis-label" aria-hidden="true"><text x="15" y="140">0</text><text x="304" y="141">x</text><text x="15" y="20">y</text></g>
          {/* x maps to 28+66x, y to 125-32y. This exact quadratic Bezier
              has its vertex at (160,157), not an illustrative arbitrary curve. */}
          <path data-preview-curve className="tutor-preview-curve" d="M28 29 Q160 285 292 29" pathLength="1" strokeDasharray="1" />
          <g data-preview-point className="tutor-preview-root"><circle cx="94" cy="125" r="4" /><text x="90" y="143">1</text></g>
          <g data-preview-point className="tutor-preview-root"><circle cx="226" cy="125" r="4" /><text x="222" y="143">3</text></g>
          <g data-preview-point className="tutor-preview-vertex"><path d="M160 125V157" /><circle cx="160" cy="157" r="4" /><text x="172" y="175">(2, −1)</text></g>
        </svg>
        <p data-preview-answer className="tutor-preview-graph-note">与 x 轴交于 1、3，最低点是 (2, −1)。</p>
      </div>}
    </div>
    <div className="tutor-preview-footer"><span>{reduced ? "按系统偏好显示静态演示" : "固定示例，不调用 AI"}</span>{!reduced && <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "播放答疑方式演示" : "暂停答疑方式演示"}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}</div>
    <div className="tutor-preview-progress" aria-hidden="true"><span data-preview-progress /></div>
  </section>;
}
