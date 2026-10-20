"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ArrowUp, BookOpen, Check, ChevronRight, FlaskConical, Maximize2, Pause, Play, RotateCcw, Search, Sparkles } from "lucide-react";
import "./home-product-demo.css";

gsap.registerPlugin(useGSAP);

const chapters = [
  { label: "输入问题", at: 0 },
  { label: "检索教材", at: 5 },
  { label: "分步解析", at: 9 },
  { label: "图像验证", at: 15 },
] as const;
const duration = 26;
const chapterStill = [3.8, 8.2, 14.3, 21];

// This is a scripted product film, with no model calls or student data.
const curve = Array.from({ length: 181 }, (_, index) => {
  const x = -2.3 + index * 4.6 / 180;
  return `${index ? "L" : "M"}${(190 + x * 65).toFixed(2)},${(145 - (x ** 3 - 3 * x) * 28).toFixed(2)}`;
}).join(" ");

export function HomeProductDemo() {
  const root = useRef<HTMLElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const manualPause = useRef(false);
  const inView = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useGSAP(() => {
    if (reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const section = root.current;
    if (!section) return;
    const select = gsap.utils.selector(section);
    const reveal = "[data-demo-retrieval], [data-demo-source], [data-demo-step], [data-demo-graph], [data-demo-extrema], [data-demo-conclusion]";
    const film = gsap.timeline({
      paused: true,
      repeat: -1,
      defaults: { ease: "power2.out", duration: 0.65 },
      onUpdate: () => {
        const time = film.time();
        const next = chapters.reduce<number>((current, chapter, index) => time >= chapter.at ? index : current, 0);
        if (next !== activeRef.current) {
          activeRef.current = next;
          setActive(next);
        }
      },
    });
    timeline.current = film;
    film
      .set(select(reveal), { autoAlpha: 0, y: 12 }, 0)
      .set(select("[data-demo-question]"), { clipPath: "inset(0 100% 0 0)" }, 0)
      .set(select("[data-demo-curve]"), { strokeDashoffset: 1 }, 0)
      .set(select("[data-demo-progress]"), { scaleX: 0 }, 0)
      .set(select("[data-demo-window]"), { opacity: 1, scale: 0.975, y: 12 }, 0)
      .set(select("[data-demo-caret]"), { opacity: 1 }, 0)
      .to(select("[data-demo-window]"), { scale: 1, y: 0, duration: 2.5, ease: "power2.inOut" }, 0)
      .to(select("[data-demo-question]"), { clipPath: "inset(0 0% 0 0)", duration: 2.8, ease: "steps(34)" }, 0.7)
      .to(select("[data-demo-caret]"), { opacity: 0, duration: 0.2 }, 4)
      .to(select("[data-demo-retrieval]"), { autoAlpha: 1, y: 0 }, 5)
      .to(select("[data-demo-source]"), { autoAlpha: 1, y: 0, stagger: 0.65 }, 5.8)
      .to(select("[data-demo-step='derivative']"), { autoAlpha: 1, y: 0 }, 9)
      .to(select("[data-demo-step='sign']"), { autoAlpha: 1, y: 0 }, 11.5)
      .to(select("[data-demo-step='result']"), { autoAlpha: 1, y: 0 }, 13.3)
      .to(select("[data-demo-graph]"), { autoAlpha: 1, y: 0, duration: 0.9 }, 15)
      .to(select("[data-demo-curve]"), { strokeDashoffset: 0, duration: 2.8, ease: "power1.inOut" }, 15.5)
      .to(select("[data-demo-extrema]"), { autoAlpha: 1, y: 0, stagger: 0.45 }, 18.5)
      .to(select("[data-demo-conclusion]"), { autoAlpha: 1, y: 0 }, 20)
      .to(select("[data-demo-progress]"), { scaleX: 1, duration, ease: "none" }, 0)
      .to(select("[data-demo-window]"), { opacity: 0, duration: 0.45 }, duration - 0.45);
    film.pause(0);

    const syncPlayback = () => {
      if (inView.current && !document.hidden && !manualPause.current) film.play();
      else film.pause();
    };
    // Offscreen and background tabs do no animation work.
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.18 });
    observer.observe(section);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      film.kill();
      timeline.current = null;
    };
  }, { scope: root, dependencies: [reducedMotion], revertOnUpdate: true });

  const toggle = () => {
    manualPause.current = !manualPause.current;
    setPaused(manualPause.current);
    if (manualPause.current) timeline.current?.pause();
    else if (inView.current && !document.hidden) timeline.current?.play();
  };
  const jump = (index: number) => {
    activeRef.current = index;
    setActive(index);
    timeline.current?.seek(manualPause.current ? chapterStill[index] : chapters[index].at + 0.05, false);
  };
  const replay = () => {
    manualPause.current = false;
    setPaused(false);
    activeRef.current = 0;
    setActive(0);
    timeline.current?.pause(0);
    if (inView.current && !document.hidden) timeline.current?.play();
  };

  return (
    <section ref={root} className="product-film" aria-label="知数实验室功能演示">
      <figure className="product-film-figure">
        <div className="product-film-stage" data-ui>
          <div className="product-film-light" aria-hidden="true" />
          <div className="product-film-window" data-demo-window aria-hidden="true">
            <div className="demo-titlebar">
              <div className="demo-traffic"><i /><i /><i /></div>
              <span><FlaskConical /> 知数实验室</span>
              <span className="demo-titlebar-note">让思路有迹可循</span>
              <Maximize2 className="demo-window-icon" />
            </div>
            <div className="demo-workspace">
              <aside className="demo-sidebar">
                <div className="demo-sidebar-brand"><span>知</span> 我的学习空间</div>
                <div className="demo-sidebar-item selected"><Sparkles /> 智能答疑</div>
                <div className="demo-sidebar-item"><Search /> 课程知识检索</div>
                <div className="demo-sidebar-item"><BookOpen /> 错题集</div>
                <div className="demo-sidebar-heading">正在探索</div>
                <div className="demo-session"><i /> 导数与函数极值</div>
                <div className="demo-session muted">定积分的几何意义</div>
                <div className="demo-session muted">切线，为什么会动？</div>
                <div className="demo-sidebar-bottom"><span className="demo-avatar">同</span><span>每一步，都算数。<small>知数实验室</small></span></div>
              </aside>
              <div className="demo-main">
                <div className="demo-breadcrumb">智能答疑 <ChevronRight /> <span>导数与函数极值</span><span className="demo-example">示例演示</span></div>
                <div className="demo-question"><span className="demo-question-avatar">你</span><div><span className="demo-question-text" data-demo-question>求 f(x) = x³ − 3x 的单调区间与极值。<span className="demo-caret" data-demo-caret /></span></div></div>
                <div className="demo-response">
                  <span className="demo-assistant-avatar"><FlaskConical /></span>
                  <div className="demo-answer">
                    <div className="demo-retrieval" data-demo-retrieval><span><Search /> 从教材中找到解题依据</span><span className="demo-retrieval-mode">RAG · 课程知识辅助</span></div>
                    <div className="demo-sources">
                      <div className="demo-source" data-demo-source><BookOpen /><span>导数与单调性<small>OpenStax · §4.5</small></span><Check /></div>
                      <div className="demo-source" data-demo-source><BookOpen /><span>一阶导数判别法<small>OpenStax · §4.5</small></span><Check /></div>
                    </div>
                    <div className="demo-solution-layout">
                      <div className="demo-steps">
                        <div className="demo-step" data-demo-step="derivative"><h3>先求导，找到临界点。</h3><div className="demo-formula">f ′(x) = 3x² − 3 = 3(x − 1)(x + 1)</div><p>令 f ′(x) = 0，得 x = −1 或 x = 1。</p></div>
                        <div className="demo-step" data-demo-step="sign"><h3>再看导数符号，判断增减。</h3><div className="demo-sign-table"><div><span>x</span><span>(−∞, −1)</span><span>(−1, 1)</span><span>(1, +∞)</span></div><div><span>f ′(x)</span><b>+</b><b>−</b><b>+</b></div><div><span>f(x)</span><b>↗</b><b>↘</b><b>↗</b></div></div><p className="demo-citation"><BookOpen /> 依据：导数与单调性 · 连续且可导</p></div>
                        <div className="demo-step demo-result" data-demo-step="result"><span><Check /></span><p>极大值 <strong>f(−1) = 2</strong><br />极小值 <strong>f(1) = −2</strong></p></div>
                      </div>
                      <div className="demo-graph" data-demo-graph>
                        <div className="demo-graph-title"><span>让图像解释答案</span><span>f(x) = x³ − 3x</span></div>
                        <svg viewBox="0 0 380 290" className="demo-plot" role="presentation">
                          <defs><pattern id="home-demo-grid" width="32.5" height="28" patternUnits="userSpaceOnUse" x="27.5" y="5"><path d="M32.5 0H0V28" fill="none" stroke="currentColor" strokeWidth="0.5" /></pattern></defs>
                          <rect x="20" y="12" width="340" height="266" fill="url(#home-demo-grid)" className="demo-grid" />
                          <path d="M20 145H362m-172 133V12" className="demo-axes" />
                          <g className="demo-axis-labels"><text x="352" y="163">x</text><text x="200" y="23">y</text><text x="200" y="162">0</text><text x="117" y="162">−1</text><text x="251" y="162">1</text><text x="201" y="94">2</text><text x="200" y="207">−2</text></g>
                          <path d={curve} className="demo-curve" pathLength="1" strokeDasharray="1" strokeDashoffset="0" data-demo-curve />
                          <g data-demo-extrema><path d="M125 89V145M125 89H190" className="demo-guide" /><circle cx="125" cy="89" r="5" className="demo-extremum" /><rect x="63" y="49" width="106" height="28" rx="5" className="demo-point-label-bg" /><text x="73" y="68" className="demo-point-label">极大值 (−1, 2)</text></g>
                          <g data-demo-extrema><path d="M255 201V145M190 201H255" className="demo-guide" /><circle cx="255" cy="201" r="5" className="demo-extremum" /><rect x="211" y="219" width="112" height="28" rx="5" className="demo-point-label-bg" /><text x="220" y="238" className="demo-point-label">极小值 (1, −2)</text></g>
                        </svg>
                        <div className="demo-graph-legend"><span /> 函数曲线 <i /> 极值点</div>
                      </div>
                    </div>
                    <div className="demo-conclusion" data-demo-conclusion><Sparkles /><span>每一步推导，都能与图像对应。</span><Check /></div>
                  </div>
                </div>
                <div className="demo-composer"><span>沿着你的思路，继续追问…</span><span className="demo-composer-send"><ArrowUp /></span><small><BookOpen /> 课程知识辅助已开启</small></div>
              </div>
            </div>
          </div>
          <span className="product-film-watermark" aria-hidden="true">知数实验室 / 产品演示</span>
        </div>
        <figcaption className="product-film-caption">
          <p>从一个问题，到一条清晰的思路。<span>导数与极值 · 预设流程演示</span></p>
          {!reducedMotion ? <div className="product-film-controls" role="group" aria-label="演示播放控制">
            <button type="button" onClick={toggle} aria-label={paused ? "播放演示" : "暂停演示"}>{paused ? <Play /> : <Pause />}</button>
            <button type="button" onClick={replay} aria-label="重播演示"><RotateCcw /></button>
          </div> : <span className="product-film-motion-note">已按系统偏好显示静态演示</span>}
        </figcaption>
        {!reducedMotion && <div className="product-film-chapters" role="group" aria-label="演示章节">
          {chapters.map((chapter, index) => <button type="button" key={chapter.label} onClick={() => jump(index)} aria-pressed={active === index}><span className="product-film-chapter-track"><i className={active === index ? "is-current" : index < active ? "is-complete" : ""} /></span>{chapter.label}</button>)}
          <span className="product-film-progress" aria-hidden="true"><i data-demo-progress /></span>
        </div>}
        <p className="sr-only">预设演示：输入函数 f(x) = x³ − 3x，检索 OpenStax 教材的导数与单调性、一阶导数判别法，求得临界点 −1 和 1。函数在 (−∞, −1) 和 (1, +∞) 递增，在 (−1, 1) 递减；极大值为 2，极小值为 −2。图像展示对应极值点。演示不发起 AI 请求。</p>
      </figure>
    </section>
  );
}
