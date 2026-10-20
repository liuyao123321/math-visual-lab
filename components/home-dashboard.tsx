"use client";

import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { HomeProductDemo } from "@/components/home-product-demo";

gsap.registerPlugin(useGSAP);

export function HomeDashboard() {
  const hero = useRef<HTMLElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    // Without motion or JavaScript, the content remains in its readable final state.
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-home-line]", { y: 22, opacity: 0, stagger: 0.1, duration: 0.65, ease: "power2.out", clearProps: "all" });
      gsap.from("[data-home-action]", { y: 10, opacity: 0, duration: 0.5, delay: 0.22, ease: "power2.out", clearProps: "all" });
    });
    return () => media.revert();
  }, { scope: hero });

  return (
    <main className="home-page w-full max-w-full overflow-x-hidden" aria-labelledby="home-heading">
      <section ref={hero} className="home-hero">
        <h1 id="home-heading" className="home-headline mx-auto w-full max-w-6xl">
          <span data-home-line>把每一道难题，</span>
          <span data-home-line className="home-headline-last">变成真正的理解。
            <svg className="home-pencil" viewBox="0 0 740 32" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path d="M9 25 C156 5 307 4 414 9 S630 12 729 26 M20 25 C245 8 442 4 719 25" />
            </svg>
          </span>
        </h1>
        <div data-home-action className="home-action">
          <p className="home-description">分步解析，过程点拨。沿着你的思路，找到下一步。</p>
          <a href="/solve" className="home-start">开始答疑<ArrowUpRight aria-hidden="true" className="size-5" /></a>
        </div>
      </section>
      <HomeProductDemo />
    </main>
  );
}
