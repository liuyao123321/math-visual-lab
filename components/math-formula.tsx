"use client";

import { BlockMath, InlineMath } from "react-katex";

export function MathFormula({ value, block = true }: { value: string; block?: boolean }) {
  const renderError = () => (
    <code
      className="inline-block whitespace-pre-wrap rounded-md bg-amber-500/15 px-2 py-1 text-sm text-amber-900 dark:text-amber-200"
      data-formula-error="true"
    >
      {value}
    </code>
  );
  return block
    ? <div className="overflow-x-auto rounded-lg bg-slate-100 px-4 py-3 text-slate-900 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-cyan-100 dark:ring-slate-800"><BlockMath math={value} renderError={renderError} /></div>
    : <InlineMath math={value} renderError={renderError} />;
}
