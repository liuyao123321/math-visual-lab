"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { gsap } from "gsap";

export function useBrowserGSAP(callback: (animation: typeof gsap) => void | (() => void), options: { scope: RefObject<HTMLElement | null>; dependencies?: unknown[]; revertOnUpdate?: boolean }) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    let cancelled = false;
    let context: gsap.Context | undefined;
    void import("gsap").then(({ gsap: animation }) => {
      if (!cancelled) context = animation.context(() => latest.current(animation), options.scope);
    });
    return () => { cancelled = true; context?.revert(); };
    // Callers explicitly select the state that rebuilds their animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.scope, ...(options.dependencies ?? [])]);
}
