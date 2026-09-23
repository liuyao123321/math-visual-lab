import { Suspense } from "react";
import { SolveWorkspace } from "@/components/solve-workspace";

export default function SolvePage() {
  return <Suspense fallback={<main className="mx-auto max-w-[1540px] p-8 text-muted-foreground">正在准备数学工作台…</main>}><SolveWorkspace /></Suspense>;
}
