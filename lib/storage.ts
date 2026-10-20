import { legacyUserSettingsSchema, mistakeRecordSchema, understandingAttemptSchema, userSettingsSchema, type MistakeRecord, type UnderstandingAttempt, type UserSettings } from "@/lib/math-schema";
import { z } from "zod";

export const STORAGE_KEYS = {
  mistakes: "mathlab.mistakes.v1",
  settings: "mathlab.settings.v2",
  legacySettings: "mathlab.settings.v1",
  understandingAttempts: "mathlab.understanding-attempts.v1",
  apiKey: "mathlab.deepseek-key.v1",
} as const;

export const defaultLearnerProfile: UserSettings["learnerProfile"] = {
  version: 1,
  primarySubject: "高等数学",
  selfLevel: "intermediate",
  learningGoal: "review",
  preferredExplanation: "visual",
  tutoringStyle: "guided",
  personalizationEnabled: true,
};

export const defaultSettings: UserSettings = {
  version: 2,
  theme: "system",
  defaultMode: "visual",
  learnerProfile: defaultLearnerProfile,
};

function readJson<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? schema.parse(JSON.parse(raw)) : fallback;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

export function readMistakes(): MistakeRecord[] {
  return readJson(STORAGE_KEYS.mistakes, z.array(mistakeRecordSchema), []);
}

export function writeMistakes(records: MistakeRecord[]) {
  window.localStorage.setItem(STORAGE_KEYS.mistakes, JSON.stringify(records));
}

export function readSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings;
  const currentRaw = window.localStorage.getItem(STORAGE_KEYS.settings);
  if (currentRaw) {
    try {
      const current = userSettingsSchema.safeParse(JSON.parse(currentRaw));
      if (current.success) return current.data;
    } catch {
      // Fall through to safe defaults or the version 1 migration.
    }
    window.localStorage.removeItem(STORAGE_KEYS.settings);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.legacySettings);
    if (!raw) return defaultSettings;
    const legacy = legacyUserSettingsSchema.parse(JSON.parse(raw));
    const migrated: UserSettings = { ...defaultSettings, theme: legacy.theme, defaultMode: legacy.defaultMode };
    writeSettings(migrated);
    window.localStorage.removeItem(STORAGE_KEYS.legacySettings);
    return migrated;
  } catch {
    window.localStorage.removeItem(STORAGE_KEYS.legacySettings);
    return defaultSettings;
  }
}

export function writeSettings(settings: UserSettings) {
  window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function readUnderstandingAttempts(): UnderstandingAttempt[] {
  return readJson(STORAGE_KEYS.understandingAttempts, z.array(understandingAttemptSchema), []);
}

export function writeUnderstandingAttempts(attempts: UnderstandingAttempt[]) {
  window.localStorage.setItem(STORAGE_KEYS.understandingAttempts, JSON.stringify(attempts.slice(0, 100)));
}

export function getApiKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
}

export function setApiKey(value: string) {
  const trimmed = value.trim();
  if (trimmed) window.localStorage.setItem(STORAGE_KEYS.apiKey, trimmed);
  else window.localStorage.removeItem(STORAGE_KEYS.apiKey);
  window.dispatchEvent(new Event("mathlab:key-change"));
}
