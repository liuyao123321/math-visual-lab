import { MathFormula, MathText } from "@/components/math-formula";
import { StepKnowledgeEvidence } from "@/components/knowledge-evidence";
import type { ExplanationMode, SolutionStep } from "@/lib/math-schema";
import type { RagSnapshot } from "@/lib/rag/schema";

export function SolutionStepContent({ step, mode, rag }: { step: SolutionStep; mode: ExplanationMode; rag?: RagSnapshot }) {
  const concise = mode === "concise";
  return <div className={concise ? "mt-3 space-y-2" : "mt-4 space-y-4"}>
    {!concise && step.goal && <p className="text-sm leading-6"><span className="font-medium">本步目标：</span><MathText value={step.goal} /></p>}
    <div className="text-sm leading-7">{!concise && <p className="mb-1 font-medium">为什么这样做</p>}<MathText value={concise ? step.summary || step.explanation : step.explanation} /></div>
    {step.formulas.length > 0 && <div className="space-y-2">{mode === "detailed" && <p className="text-sm font-medium">推导过程</p>}{step.formulas.map((formula, index) => <MathFormula key={index} value={formula} />)}</div>}
    {step.basis && <p className="text-sm leading-6 text-muted-foreground">依据：<MathText value={step.basis} /></p>}
    {!!step.conditions?.length && <div className="text-sm leading-6"><p className="font-medium">成立条件</p><ul className="list-disc space-y-1 pl-5">{step.conditions.map((condition, index) => <li key={index}><MathText value={condition} /></li>)}</ul></div>}
    <StepKnowledgeEvidence step={step} rag={rag} />
    {concise ? ((step.summary && step.summary !== step.explanation) || step.commonMistake || step.verification) && <details className="text-sm leading-7"><summary className="cursor-pointer text-muted-foreground">展开本步说明与自检</summary><div className="mt-2 space-y-2">{step.summary && step.summary !== step.explanation && <MathText value={step.explanation} />}{step.commonMistake && <p>易错提醒：<MathText value={step.commonMistake} /></p>}{step.verification && <p>自检：<MathText value={step.verification} /></p>}</div></details>
      : <>{step.commonMistake && <p className="rounded-lg bg-muted p-3 text-sm leading-6">易错提醒：<MathText value={step.commonMistake} /></p>}{step.verification && <p className="text-sm leading-7"><span className="font-medium">如何自检：</span><MathText value={step.verification} /></p>}</>}
  </div>;
}
