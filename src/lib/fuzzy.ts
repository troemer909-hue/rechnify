import { distance } from "fastest-levenshtein";

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function nameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  return 1 - distance(normalizedA, normalizedB) / Math.max(normalizedA.length, normalizedB.length);
}
