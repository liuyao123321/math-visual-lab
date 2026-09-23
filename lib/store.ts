"use client";

import { create } from "zustand";
import type { Mastery, MistakeRecord, SolveResult, UserSettings } from "@/lib/math-schema";
import { defaultSettings, readMistakes, readSettings, writeMistakes, writeSettings } from "@/lib/storage";

type AddMistakeInput = {
  solution: SolveResult;
  errorReason: string;
  note: string;
};

type MathLabState = {
  hydrated: boolean;
  mistakes: MistakeRecord[];
  settings: UserSettings;
  currentSolution: SolveResult | null;
  hydrate: () => void;
  setCurrentSolution: (solution: SolveResult | null) => void;
  addMistake: (input: AddMistakeInput) => MistakeRecord;
  updateMistake: (id: string, patch: Partial<Pick<MistakeRecord, "errorReason" | "note" | "mastery">>) => void;
  practiceMistake: (id: string) => void;
  removeMistake: (id: string) => void;
  updateSettings: (patch: Partial<Omit<UserSettings, "version">>) => void;
};

export const useMathLabStore = create<MathLabState>((set, get) => ({
  hydrated: false,
  mistakes: [],
  settings: defaultSettings,
  currentSolution: null,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    set({ mistakes: readMistakes(), settings: readSettings(), hydrated: true });
  },
  setCurrentSolution: (currentSolution) => set({ currentSolution }),
  addMistake: ({ solution, errorReason, note }) => {
    const now = new Date().toISOString();
    const record: MistakeRecord = {
      id: crypto.randomUUID(),
      question: solution.normalizedQuestion,
      solution,
      subject: solution.subject,
      topics: solution.topics,
      questionType: solution.questionType,
      difficulty: solution.difficulty,
      errorReason,
      note,
      mastery: "unreviewed",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      lastPracticedAt: null,
    };
    const next = [record, ...get().mistakes];
    writeMistakes(next);
    set({ mistakes: next });
    return record;
  },
  updateMistake: (id, patch) => {
    const next = get().mistakes.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item);
    writeMistakes(next);
    set({ mistakes: next });
  },
  practiceMistake: (id) => {
    const next = get().mistakes.map((item) => item.id === id ? { ...item, attempts: item.attempts + 1, lastPracticedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item);
    writeMistakes(next);
    set({ mistakes: next });
  },
  removeMistake: (id) => {
    const next = get().mistakes.filter((item) => item.id !== id);
    writeMistakes(next);
    set({ mistakes: next });
  },
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch, version: 1 as const };
    writeSettings(next);
    set({ settings: next });
  },
}));

export const masteryLabels: Record<Mastery, string> = {
  unreviewed: "待复习",
  reviewing: "复习中",
  mastered: "已掌握",
};
