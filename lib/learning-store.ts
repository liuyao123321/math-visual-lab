"use client";

import { create } from "zustand";
import { trackUsage } from "@/lib/usage-client";
import { learningDataSchema, type LearningData, type PaperSession, type ReviewPlan } from "@/lib/learning-schema";
import type { MaterialAnalysis, UnderstandingFeedback } from "@/lib/math-schema";
import { localDay } from "@/lib/learning";

export const LEARNING_KEY = "mathlab.learning.v1";
export const emptyLearning: LearningData = { version: 1, plan: null, materials: [], sessions: [], activityDays: [] };
export function readLearning(): LearningData {
  if (typeof window === "undefined") return emptyLearning;
  try { const raw = localStorage.getItem(LEARNING_KEY); return raw ? learningDataSchema.parse(JSON.parse(raw)) : emptyLearning; }
  catch { return emptyLearning; }
}
function persist(data: LearningData) { localStorage.setItem(LEARNING_KEY, JSON.stringify(learningDataSchema.parse(data))); }
type State = { data: LearningData; hydrated: boolean; hydrate: () => void; savePlan: (plan: ReviewPlan) => void; completeTask: (id: string, completed: boolean) => void; activity: () => void; saveMaterial: (analysis: MaterialAnalysis, name: string) => void; removeMaterial: (id: string) => void; createSession: (session: PaperSession) => void; answer: (id: string, questionId: string, text: string) => void; grade: (id: string, questionId: string, feedback: UnderstandingFeedback) => void; submit: (id: string) => void };
export const useLearningStore = create<State>((set, get) => {
  // Mutations may run before the provider effect: load the existing record first.
  const current = () => { get().hydrate(); return get().data; };
  const save = (patch: Partial<LearningData>) => { const data = { ...current(), ...patch }; persist(data); set({ data }); };
  return {
    data: emptyLearning, hydrated: false,
    hydrate: () => { if (!get().hydrated) set({ data: readLearning(), hydrated: true }); },
    savePlan: (plan) => save({ plan }),
    completeTask: (id, completed) => { const plan = current().plan; if (plan) { save({ plan: { ...plan, tasks: plan.tasks.map((task) => task.id === id ? { ...task, completed } : task) } }); if (completed) get().activity(); } },
    activity: () => save({ activityDays: [...new Set([localDay(), ...current().activityDays])].sort().reverse().slice(0, 366) }),
    saveMaterial: (analysis, name) => save({ materials: [{ ...analysis, name, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...current().materials].slice(0, 20) }),
    removeMaterial: (id) => save({ materials: current().materials.filter((item) => item.id !== id) }),
    createSession: (session) => save({ sessions: [session, ...current().sessions].slice(0, 10) }),
    answer: (id, questionId, text) => save({ sessions: current().sessions.map((session) => {
      if (session.id !== id || session.submittedAt) return session;
      const feedback = { ...session.feedback }; delete feedback[questionId];
      return { ...session, answers: { ...session.answers, [questionId]: text.slice(0, 1200) }, feedback };
    }) }),
    grade: (id, questionId, feedback) => save({ sessions: current().sessions.map((session) => session.id === id ? { ...session, feedback: { ...session.feedback, [questionId]: feedback } } : session) }),
    submit: (id) => { const session = current().sessions.find((item) => item.id === id); if (!session || session.submittedAt) return; save({ sessions: current().sessions.map((item) => item.id === id ? { ...item, submittedAt: new Date().toISOString() } : item) }); get().activity(); trackUsage("practice_submitted", "/practice"); },
  };
});
