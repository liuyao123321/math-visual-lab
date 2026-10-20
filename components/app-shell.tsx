"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves reliable hosted routing. */

import { usePathname } from "next/navigation";
import { FlaskConical, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/solve", label: "智能答疑" },
  { href: "/knowledge", label: "课程知识检索" },
  { href: "/mistakes", label: "错题集" },
  { href: "/report", label: "学习报告" },
  { href: "/practice", label: "专项模拟" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={cn("min-h-svh bg-background text-foreground", pathname === "/" && "app-shell-home")}>
      <header className="site-header sticky top-0 z-40">
        <div className="site-header-inner">
          <a href="/" className="site-brand" aria-label="首页" aria-current={pathname === "/" ? "page" : undefined}>
            <span className="site-brand-icon"><FlaskConical aria-hidden="true" /></span>
            <span>知数实验室</span>
          </a>
          <nav className="site-navigation" aria-label="主导航">
            {navItems.map(({ href, label }) => <a key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</a>)}
          </nav>
          <a href="/settings" className="site-settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
            <Settings aria-hidden="true" className="size-4" /><span>设置</span>
          </a>
        </div>
      </header>
      {children}
    </div>
  );
}
