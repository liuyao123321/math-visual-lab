"use client";
import { pagePaths } from "@/lib/operations/schema";
let previousPage: string | undefined;
let pending = Promise.resolve();
export function usageHeaders() { return { "x-mathlab-usage": "1", "x-mathlab-request-id": crypto.randomUUID() }; }
export function trackUsage(kind: "page_view" | "mistake_saved" | "practice_submitted", path: string) {
  if (typeof window === "undefined" || !pagePaths.includes(path as typeof pagePaths[number])) return;
  const event = { id: crypto.randomUUID(), kind, path };
  pending = pending.then(async () => { try { await fetch("/api/operations/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), keepalive: true }); } catch { /* Statistics never interrupt learning. */ } });
}
export function trackPageView(path: string) { if (previousPage === path) return; previousPage = path; trackUsage("page_view", path); }
