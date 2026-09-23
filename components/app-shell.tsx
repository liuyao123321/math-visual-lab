"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { BarChart3, BookOpenCheck, FlaskConical, Home, Moon, Settings, Sparkles, Sun } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/solve", label: "智能答疑", icon: Sparkles },
  { href: "/mistakes", label: "错题集", icon: BookOpenCheck },
  { href: "/report", label: "学习报告", icon: BarChart3 },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1540px] items-center gap-4 px-4 lg:px-8">
          <Link href="/" className="mr-auto flex items-center gap-3" aria-label="知数实验室首页">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-cyan-500/15"><FlaskConical className="size-5" /></span>
            <span><span className="block font-semibold tracking-tight">知数实验室</span><span className="hidden text-xs text-muted-foreground sm:block">交互式数学答疑</span></span>
          </Link>
          <nav className="relative z-10 hidden items-center gap-1 md:flex" aria-label="主导航">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                    "pointer-events-auto cursor-pointer",
                    active && "text-cyan-700 dark:text-cyan-300",
                  )}
                >
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </nav>
          <Button variant="ghost" size="icon-sm" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="切换明暗主题">
            <Sun className="hidden dark:block" /><Moon className="block dark:hidden" />
          </Button>
        </div>
        <nav className="grid grid-cols-5 border-t border-border/70 md:hidden" aria-label="移动端导航">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("pointer-events-auto flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 text-[12px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", active && "bg-cyan-500/8 text-cyan-700 dark:text-cyan-300")}><Icon className="size-4" />{label}</Link>;
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
