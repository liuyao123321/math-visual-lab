import { mistakeRecordSchema, userSettingsSchema, type MistakeRecord, type UserSettings } from "@/lib/math-schema";
import { z } from "zod";

export const STORAGE_KEYS = {
  mistakes: "mathlab.mistakes.v1",
  settings: "mathlab.settings.v1",
  apiKey: "mathlab.deepseek-key.v1",
} as const;

export const defaultSettings: UserSettings = { version: 1, theme: "system", defaultMode: "visual" };

function readJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
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
  return readJson(STORAGE_KEYS.settings, userSettingsSchema, defaultSettings);
}

export function writeSettings(settings: UserSettings) {
  window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
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
