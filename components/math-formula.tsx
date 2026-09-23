"use client";

import { BlockMath, InlineMath } from "react-katex";

export function MathFormula({ value, block = true }: { value: string; block?: boolean }) {
  const renderError = () => <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{value}</code>;
  return block
    ? <div className="overflow-x-auto rounded-lg bg-slate-950 px-4 py-3 text-cyan-100"><BlockMath math={value} renderError={renderError} /></div>
    : <InlineMath math={value} renderError={renderError} />;
}
