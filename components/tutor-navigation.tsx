"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useBrowserGSAP } from "./use-browser-gsap";
import { TUTOR_MODE_EVENT, tutorModes } from "@/lib/tutor-navigation";
import { TutorModePreview } from "@/components/tutor-mode-preview";
import type { ExplanationMode } from "@/lib/math-schema";


export function TutorNavigation({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<ExplanationMode>("concise");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFrame = useRef<number | undefined>(undefined);
  const openedByHover = useRef(false);
  const id = useId();
  const clearClose = useCallback(() => { clearTimeout(closeTimer.current); }, []);
  const close = useCallback((restoreFocus = false) => { clearClose(); openedByHover.current = false; setOpen(false); if (restoreFocus) trigger.current?.focus(); }, [clearClose]);
  function focusLink(index: number) {
    cancelAnimationFrame(focusFrame.current ?? 0);
    focusFrame.current = requestAnimationFrame(() => {
      const links = panel.current?.querySelectorAll<HTMLAnchorElement>("a");
      if (links?.length) links[(index + links.length) % links.length].focus();
    });
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);
  useEffect(() => () => { clearTimeout(closeTimer.current); cancelAnimationFrame(focusFrame.current ?? 0); }, []);
  useBrowserGSAP((gsap) => {
    if (!open || !panel.current || typeof window.matchMedia !== "function") return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(panel.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out", clearProps: "opacity,transform" });
      gsap.fromTo(".tutor-mode-link", { opacity: 0, y: 5 }, { opacity: 1, y: 0, stagger: 0.035, duration: 0.2, clearProps: "opacity,transform" });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [open], revertOnUpdate: true });

  return <div ref={root} className="tutor-navigation" onPointerEnter={(event) => { if (event.pointerType === "mouse") { clearClose(); if (!open) openedByHover.current = true; setOpen(true); } }} onPointerLeave={(event) => { if (event.pointerType === "mouse") closeTimer.current = setTimeout(() => { if (!root.current?.contains(document.activeElement)) close(); }, 160); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    <button ref={trigger} type="button" className="tutor-navigation-trigger" aria-expanded={open} aria-controls={id} aria-current={active ? "page" : undefined} onClick={() => { clearClose(); if (openedByHover.current) { openedByHover.current = false; setOpen(true); } else setOpen(!open); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); clearClose(); setOpen(true); focusLink(event.key === "ArrowDown" ? 0 : tutorModes.length - 1); }
    }}>智能答疑<ChevronDown aria-hidden="true" className="size-3.5" /></button>
    <div ref={panel} id={id} hidden={!open} className="tutor-navigation-panel">
      <ul className="tutor-mode-list" aria-label="选择答疑方式">{tutorModes.map((item, index) => <li key={item.mode}>
        <a href={`/solve?mode=${item.mode}`} className="tutor-mode-link" aria-label={item.label} data-preview-active={previewMode === item.mode ? "true" : "false"} onPointerEnter={() => setPreviewMode(item.mode)} onFocus={() => setPreviewMode(item.mode)} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
            event.preventDefault(); focusLink(event.key === "Home" ? 0 : event.key === "End" ? tutorModes.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1));
          }
        }} onClick={(event) => {
          if (active && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            const request = new CustomEvent(TUTOR_MODE_EVENT, { detail: { mode: item.mode }, cancelable: true });
            // Only intercept when a mounted tutor acknowledges this request.
            // Other pages, new tabs and modifier-clicks keep native navigation.
            if (!window.dispatchEvent(request)) event.preventDefault();
          }
          close(true);
        }}><span className={`tutor-mode-symbol tutor-mode-symbol--${item.mode}`} aria-hidden="true">{item.symbol}</span><span className="tutor-mode-copy"><span className="tutor-mode-title">{item.label}</span><span className="tutor-mode-description">{item.description}</span></span><ArrowUpRight className="tutor-mode-arrow size-4" aria-hidden="true" /></a>
      </li>)}</ul>
      {open && <TutorModePreview mode={previewMode} />}
    </div>
  </div>;
}
