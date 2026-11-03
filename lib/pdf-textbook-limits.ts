// PDF bytes are never persisted. No artificial page limit; text remains bounded
// by the existing browser-local storage architecture.
export const PDF_TEXTBOOK_MAX_BYTES = 100 * 1024 * 1024;
export const PERSONAL_LIBRARY_MAX_CHARS = 1_800_000;
export const PDF_TEXTBOOK_MAX_TEXT_CHARS = 1_500_000;
export const PDF_TEXTBOOK_MAX_PAGE_CHARS = 200_000;
export const PDF_TEXTBOOK_STALL_MS = 45_000;
export const PDF_PREVIEW_PAGE_SIZE = 10;
