import { tokenize } from "./tokenize";

export type RankedHit = { id: string; score: number };
export function createBm25(documents: Array<{ id: string; text: string }>) {
  const rows = documents.map((document) => {
    const tokens = tokenize(document.text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return { id: document.id, length: tokens.length, frequencies };
  });
  const documentFrequencies = new Map<string, number>();
  for (const row of rows) for (const token of row.frequencies.keys()) documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
  const average = rows.reduce((sum, row) => sum + row.length, 0) / Math.max(rows.length, 1) || 1;
  return (query: string, limit = 8): RankedHit[] => {
    const queryTokens = [...new Set(tokenize(query))];
    return rows.map((row) => {
      let score = 0;
      for (const token of queryTokens) {
        const frequency = row.frequencies.get(token) ?? 0;
        if (!frequency) continue;
        const df = documentFrequencies.get(token) ?? 0;
        const idf = Math.log(1 + (rows.length - df + 0.5) / (df + 0.5));
        score += idf * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * row.length / average));
      }
      return { id: row.id, score };
    }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  };
}

export function reciprocalRankFusion(lists: RankedHit[][], limit = 4, constant = 60): RankedHit[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((item, index) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (constant + index + 1));
    });
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
