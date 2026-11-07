/**
 * Text helpers shared by the goal interpreter, the scenario matcher and the embedder.
 * Unicode aware so Finnish and Swedish letters (ä, ö, å) survive.
 */

/** Lowercase, NFKC, unify dashes and quotes, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_RE = /[\p{L}][\p{L}\p{N}]*|\p{N}+/gu;

/** Lowercase unicode word tokens (letters followed by letters/digits, or digit runs). */
export function wordTokens(text: string): string[] {
  return normalizeText(text).match(WORD_RE) ?? [];
}

/** Very light English/Finnish stemmer used only for matching: strip common plural endings, cut to 6 chars. */
export function stem(token: string): string {
  let t = token;
  if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (t.length > 4 && t.endsWith("es") && /(ss|x|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) t = t.slice(0, -1);
  return t.length > 6 ? t.slice(0, 6) : t;
}

export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "by", "per", "with", "from", "into", "so", "that", "this",
  "these", "those", "we", "i", "our", "us", "they", "their", "them", "it", "its", "is", "are", "be", "been", "was", "will", "would",
  "can", "could", "should", "need", "needs", "want", "wants", "like", "do", "does", "how", "what", "which", "who", "whom", "all",
  "any", "some", "each", "every", "as", "also", "only", "just", "then", "than", "about", "over", "under", "between", "across",
  "me", "my", "you", "your", "there", "here", "not", "no", "yes", "if", "but", "too", "very", "up", "out", "get", "give", "send",
  "share", "data", "dataset",
  // Finnish
  "ja", "tai", "on", "ovat", "että", "jotta", "se", "ne", "me", "he", "meidän", "heidän", "kanssa", "varten", "ei", "myös", "kuin",
  "haluamme", "haluaa", "tarvitsee", "tarvitsemme", "pitää", "voi", "voivat", "kaikki", "sekä", "mukaan",
  // Swedish
  "och", "eller", "att", "det", "den", "vi", "de", "med", "för", "till", "som", "är", "vill", "behöver", "på", "av",
]);

/** Content tokens: words minus stopwords, stemmed. */
export function contentStems(text: string): string[] {
  return wordTokens(text).filter((t) => !STOPWORDS.has(t) && t.length > 1).map(stem);
}

/**
 * Build a cue regex from a list of terms. A trailing "*" allows any letter suffix (needed for Finnish inflection);
 * otherwise an optional English plural is allowed. Terms may contain spaces (matched as any whitespace or hyphen).
 */
export function cue(terms: readonly string[]): RegExp {
  const parts = terms.map((raw) => {
    const prefix = raw.endsWith("*");
    const term = prefix ? raw.slice(0, -1) : raw;
    const body = term
      .split(/[\s-]+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s-]*");
    if (prefix) return `${body}[\\p{L}\\p{N}]*`;
    // short words ("ed", "od", "qa") must not match inside hyphenated compounds such as "ed-tech"
    return term.length <= 3 ? `${body}(?:s|es)?(?![\\p{L}\\p{N}]|-)` : `${body}(?:s|es)?(?![\\p{L}\\p{N}])`;
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})`, "gu");
}

export interface CueHit { term: string; index: number }

/** All matches of a cue regex in normalised text. */
export function findAll(re: RegExp, text: string): CueHit[] {
  const out: CueHit[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ term: m[0], index: m.index });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

export function hasCue(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  const ok = re.test(text);
  re.lastIndex = 0;
  return ok;
}

export const unique = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
