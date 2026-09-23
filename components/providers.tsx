"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useMathLabStore } from "@/lib/store";

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

function RuntimeBridge() {
  const router = useRouter();
  const hydrate = useMathLabStore((state) => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({
      name: "open_math_example",
      title: "打开数学示例",
      description: "在知数实验室中打开指定的内置示例题。",
      inputSchema: {
        type: "object",
        properties: { exampleId: { type: "string", enum: ["example-quadratic", "example-derivative", "example-integral"] } },
        required: ["exampleId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const exampleId = (input as { exampleId?: string }).exampleId;
        if (!["example-quadratic", "example-derivative", "example-integral"].includes(exampleId ?? "")) throw new Error("未知示例");
        router.push("/solve?example=" + encodeURIComponent(exampleId!));
        return { opened: exampleId };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [router]);
  return <Toaster richColors position="top-center" />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <RuntimeBridge />
    </ThemeProvider>
  );
}
