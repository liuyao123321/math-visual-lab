"use client";

import { create } from "zustand";
import type { LearnerProfile, Mastery, MistakeRecord, SolveResult, UnderstandingAttempt, UserSettings } from "@/lib/math-schema";
import { defaultLearnerProfile, defaultSettings, readMistakes, readSettings, readUnderstandingAttempts, writeMistakes, writeSettings, writeUnderstandingAttempts } from "@/lib/storage";
import { useLearningStore } from "@/lib/learning-store";
import type { HandwritingSession } from "@/lib/handwriting-session";

type AddMistakeInput = {
  solution: SolveResult;
  errorReason: string;
  note: string;
  handwriting?: HandwritingSession;
};

type MathLabState = {
  hydrated: boolean;
  mistakes: MistakeRecord[];
  settings: UserSettings;
  currentSolution: SolveResult | null;
  understandingAttempts: UnderstandingAttempt[];
  hydrate: () => void;
  setCurrentSolution: (solution: SolveResult | null) => void;
  addMistake: (input: AddMistakeInput) => MistakeRecord;
  updateMistake: (id: string, patch: Partial<Pick<MistakeRecord, "errorReason" | "note" | "mastery">>) => void;
  practiceMistake: (id: string) => void;
  removeMistake: (id: string) => void;
  updateSettings: (patch: Partial<Omit<UserSettings, "version">>) => void;
  updateLearnerProfile: (patch: Partial<Omit<LearnerProfile, "version">>) => void;
  resetLearnerProfile: () => void;
  recordUnderstandingAttempt: (attempt: Omit<UnderstandingAttempt, "id" | "createdAt">) => void;
};

export const useMathLabStore = create<MathLabState>((set, get) => ({
  hydrated: false,
  mistakes: [],
  settings: defaultSettings,
  currentSolution: null,
  understandingAttempts: [],
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    set({ mistakes: readMistakes(), settings: readSettings(), understandingAttempts: readUnderstandingAttempts(), hydrated: true });
  },
  setCurrentSolution: (currentSolution) => set({ currentSolution }),
  addMistake: ({ solution, errorReason, note, handwriting }) => {
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
      ...(handwriting ? { handwriting } : {}),
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
    if (next.some((item) => item.id === id)) useLearningStore.getState().activity();
  },
  removeMistake: (id) => {
    const next = get().mistakes.filter((item) => item.id !== id);
    writeMistakes(next);
    set({ mistakes: next });
  },
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch, version: 2 as const };
    writeSettings(next);
    set({ settings: next });
  },
  updateLearnerProfile: (patch) => {
    const next = {
      ...get().settings,
      learnerProfile: { ...get().settings.learnerProfile, ...patch, version: 1 as const },
      version: 2 as const,
    };
    writeSettings(next);
    set({ settings: next });
  },
  resetLearnerProfile: () => {
    const next = { ...get().settings, learnerProfile: defaultLearnerProfile, version: 2 as const };
    writeSettings(next);
    set({ settings: next });
  },
  recordUnderstandingAttempt: (attempt) => {
    const next = [{ ...attempt, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...get().understandingAttempts].slice(0, 100);
    writeUnderstandingAttempts(next);
    set({ understandingAttempts: next });
    useLearningStore.getState().activity();
  },
}));

export const masteryLabels: Record<Mastery, string> = {
  unreviewed: "待复习",
  reviewing: "复习中",
  mastered: "已掌握",
};
