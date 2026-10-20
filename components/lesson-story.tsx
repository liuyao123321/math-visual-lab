"use client";

import { type ReactNode, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-formula";
import { StepVisualization } from "@/components/step-visualization";
import { VisualExperiment } from "@/components/visual-experiment";
import type { SolutionStep, SolveResult, VisualizationSpec } from "@/lib/math-schema";
import { visualizationForStep } from "@/lib/step-visualization";

gsap.registerPlugin(useGSAP);
export const storyMediaQuery = "(min-width: 1180px) and (prefers-reduced-motion: no-preference)";
function subscribeLayout(notify: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(storyMediaQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function readLayout() { return typeof window.matchMedia === "function" && window.matchMedia(storyMediaQuery).matches; }

export type StoryStepView = { active: boolean; activate: () => void; plot: ReactNode };

/** One shared desktop canvas. Narrow/reduced-motion layouts retain static inline figures. */
export function LessonStory({ solution, steps, spec, activeIndex, onActivate, parameters, onParametersChange, renderStep }: {
  solution: SolveResult; steps: SolutionStep[]; spec?: VisualizationSpec; activeIndex: number;
  onActivate: (index: number) => void; parameters: Record<string, number>;
  onParametersChange: (value: Record<string, number>) => void;
  renderStep: (step: SolutionStep, index: number, view: StoryStepView) => ReactNode;
}) {
  const wide = useSyncExternalStore(subscribeLayout, readLayout, () => false);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const current = useRef(activeIndex), activateRef = useRef(onActivate);
  const scrollSelection = useRef(false);
  useLayoutEffect(() => { current.current = activeIndex; activateRef.current = onActivate; }, [activeIndex, onActivate]);
  const [replay, setReplay] = useState(0);
  const boundedIndex = Math.max(0, Math.min(activeIndex, steps.length - 1));
  const active = steps[boundedIndex];
  const scenes = useMemo(() => steps.map((step) => visualizationForStep(spec, step)), [spec, steps]);
  const shared = wide && scenes.some(Boolean);
  const scene = scenes[boundedIndex];
  const stepKey = steps.map((step) => step.id).join("|");

  function choose(index: number, scrollToText = false) {
    if (index < 0 || index >= steps.length) return;
    // Clicking or editing a step takes precedence over refresh-induced triggers.
    scrollSelection.current = false;
    onActivate(index);
    if (scrollToText) root.current?.querySelectorAll<HTMLElement>("[data-story-step]")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useGSAP(() => {
    if (!shared || !root.current || !canvas.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const container = root.current, panel = canvas.current;
    const media = gsap.matchMedia();
    media.add(storyMediaQuery, () => {
      let refreshing = false;
      const refreshStart = () => { refreshing = true; };
      const refreshEnd = () => { refreshing = false; };
      ScrollTrigger.addEventListener("refreshInit", refreshStart);
      ScrollTrigger.addEventListener("refresh", refreshEnd);
      const offset = () => (document.querySelector(".site-header")?.getBoundingClientRect().height ?? 108) + 20;
      const pinned = ScrollTrigger.create({
        trigger: container, start: () => `top top+=${offset()}`,
        end: () => `+=${Math.max(1, container.offsetHeight - panel.offsetHeight)}`,
        pin: panel, pinSpacing: false, invalidateOnRefresh: true, anticipatePin: 1,
      });
      const trackers = Array.from(container.querySelectorAll<HTMLElement>("[data-story-step]")).map((element, index) => {
        const focus = () => {
          if (scrollSelection.current && !refreshing && current.current !== index) activateRef.current(index);
        };
        return ScrollTrigger.create({ trigger: element, start: "top 42%", end: "bottom 42%", onEnter: focus, onEnterBack: focus, onUpdate: (self) => { if (self.isActive) focus(); } });
      });
      const unlock = (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLElement && (target.closest("input,textarea,select,[contenteditable=true]") || panel.contains(target))) return;
        if (event instanceof KeyboardEvent && !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
        scrollSelection.current = true;
      };
      window.addEventListener("wheel", unlock, { passive: true, capture: true });
      window.addEventListener("touchmove", unlock, { passive: true, capture: true });
      window.addEventListener("keydown", unlock, true);
      let frame = 0;
      const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => ScrollTrigger.refresh()); };
      const resize = new ResizeObserver(refresh);
      resize.observe(container); resize.observe(panel);
      refresh();
      return () => {
        cancelAnimationFrame(frame); resize.disconnect();
        ScrollTrigger.removeEventListener("refreshInit", refreshStart); ScrollTrigger.removeEventListener("refresh", refreshEnd);
        window.removeEventListener("wheel", unlock, true); window.removeEventListener("touchmove", unlock, true); window.removeEventListener("keydown", unlock, true);
        trackers.forEach((tracker) => tracker.kill()); pinned.kill();
      };
    });
    return () => media.revert();
  }, { scope: root, dependencies: [shared, stepKey, solution.id], revertOnUpdate: true });

  useGSAP(() => {
    if (!shared) return;
    const media = gsap.matchMedia();
    media.add(storyMediaQuery, () => {
      const timeline = gsap.timeline();
      // Animate presentation only: no stretching of axes or fabricated math frames.
      timeline.fromTo(picture.current, { opacity: .5 }, { opacity: 1, duration: .38, ease: "power1.out" })
        .fromTo(caption.current, { opacity: .4, y: 5 }, { opacity: 1, y: 0, duration: .28, ease: "power2.out" }, 0);
      return () => { timeline.kill(); };
    });
    return () => media.revert();
  }, { scope: root, dependencies: [shared, active?.id, replay], revertOnUpdate: true });

  // renderStep returns UI; activate is only executed by the returned click/focus handlers.
  // eslint-disable-next-line react-hooks/refs
  const stepElements = steps.map((step, index) => renderStep(step, index, {
      active: index === boundedIndex, activate: () => choose(index),
      plot: !shared && spec ? <StepVisualization solution={solution} spec={spec} step={step} parameters={parameters} onChange={onParametersChange} /> : null,
    }));
  return <div ref={root} className={`lesson-story${shared ? " lesson-story--shared" : ""}`} data-shared-canvas={shared ? "true" : "false"}>
    <div className="story-steps">{stepElements}</div>
    {shared && active && <aside className="story-canvas-slot" aria-label="步骤联动画布">
      <section ref={canvas} className="story-canvas" aria-label="当前步骤可视化" data-active-step={active.id}>
        <header className="story-canvas-header">
          <div ref={caption}><p className="text-xs text-muted-foreground">随步骤理解 · {boundedIndex + 1} / {solution.steps.length}</p><h3 className="mt-2 text-xl font-medium"><MathText value={active.title} /></h3></div>
          <div className="story-canvas-navigation"><Button size="icon" variant="ghost" aria-label="回看上一步图像" disabled={boundedIndex === 0} onClick={() => choose(boundedIndex - 1, true)}><ArrowLeft /></Button><Button size="icon" variant="ghost" aria-label="重播本步图像过渡" disabled={!scene} onClick={() => setReplay((value) => value + 1)}><RotateCcw /></Button><Button size="icon" variant="ghost" aria-label="回看下一已展开步骤图像" disabled={boundedIndex >= steps.length - 1} onClick={() => choose(boundedIndex + 1, true)}><ArrowRight /></Button></div>
        </header>
        <div ref={picture} className="story-canvas-picture">{scene
          ? <VisualExperiment solution={solution} specOverride={scene} inline parameters={parameters} onChange={(next) => onParametersChange({ ...parameters, ...next })} activeLayerIds={active.visualLayerIds} />
          : <div className="story-no-plot"><p className="font-medium">这一步以文字和公式推理为主</p><p className="mt-2 text-sm text-muted-foreground">没有添加无关图像，继续阅读本步的推导依据。</p></div>}
        </div>
        <footer className="story-canvas-footer">{scene ? <p>当前图层：{scene.layers.map((layer) => layer.label).join("、")}</p> : null}<p className="mt-1 text-muted-foreground">阅读或点击已展开的步骤，图像同步切换。</p>{steps.length < solution.steps.length && <p className="mt-1 text-muted-foreground">下一步需点击“我理解了，继续”展开。</p>}</footer>
      </section>
    </aside>}
  </div>;
}
