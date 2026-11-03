"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/usage-client";
export function UsageTracker() { const path = usePathname(); useEffect(() => { if (path) trackPageView(path); }, [path]); return null; }
