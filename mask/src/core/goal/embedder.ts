/**
 * hashed-bow-v1: deterministic goal embedder that works offline and is reproducible in the training export.
 *
 * Algorithm (replicate exactly in Python):
 *  1. text → NFKC → lowercase; dashes U+2010..U+2015 and U+2212 → "-"; whitespace collapsed.
 *  2. tokens = regex /[\p{L}][\p{L}\p{N}]*|\p{N}+/gu  (letter followed by letters/digits, or a digit run).
 *  3. features = tokens + bigrams "tok_i tok_{i+1}" (joined by one space).
 *  4. h = FNV-1a 32-bit over the UTF-8 bytes of the feature (offset 2166136261, prime 16777619, uint32).
 *     index = h mod 256; sign = -1 if the top bit (h >>> 31) is 1, else +1; v[index] += sign.
 *  5. L2-normalise (all-zero vector stays zero).
 * The interface is the GoalEmbedder one, so a MiniLM-style sentence model can replace it later.
 */
import type { GoalEmbedder } from "./types";
import { wordTokens } from "./text";

export const HASHED_BOW_MODEL = "hashed-bow-v1";
export const HASHED_BOW_DIMS = 256;

const enc = new TextEncoder();

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of enc.encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashedBowFeatures(text: string): string[] {
  const toks = wordTokens(text);
  const out = [...toks];
  for (let i = 0; i + 1 < toks.length; i++) out.push(`${toks[i]} ${toks[i + 1]}`);
  return out;
}

export function hashedBowEmbed(text: string, dims = HASHED_BOW_DIMS): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const f of hashedBowFeatures(text)) {
    const h = fnv1a32(f);
    v[h % dims]! += h >>> 31 ? -1 : 1;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i]! * b[i]!;
  return s;
}

export class HashedBowEmbedder implements GoalEmbedder {
  readonly model = HASHED_BOW_MODEL;
  readonly dims = HASHED_BOW_DIMS;
  async embed(text: string): Promise<number[]> {
    return hashedBowEmbed(text, this.dims);
  }
}
