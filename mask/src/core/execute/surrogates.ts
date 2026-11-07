/**
 * Surrogate generators for redact_surrogate. Values are drawn from fixed bundled lists (never from the data),
 * chosen by a keyed PRNG so the same (consistency scope, label, original) gives the same surrogate.
 */
import type { SpanLabel } from "@/contracts";
import { shiftDateText } from "./datetime";

export const FIRST_NAMES = [
  "Aino", "Eero", "Helmi", "Ilkka", "Johanna", "Kalle", "Laura", "Mikko", "Noora", "Otto", "Pirjo", "Risto", "Sanna", "Tuomas", "Veera",
  "Anders", "Britta", "Elsa", "Gustav", "Ingrid", "Johan", "Karin", "Lars", "Maja", "Nils", "Sofia", "Erik",
  "Alice", "Daniel", "Emily", "George", "Hannah", "James", "Lucy", "Oliver", "Rachel", "Thomas",
];
export const LAST_NAMES = [
  "Aaltonen", "Heikkilä", "Hiltunen", "Jokinen", "Kallio", "Koskinen", "Laaksonen", "Lehtonen", "Mäkelä", "Nurmi", "Pelkonen", "Rantanen", "Salonen", "Toivonen", "Väisänen",
  "Berg", "Holmström", "Lindqvist", "Nyberg", "Sjöberg", "Wikström", "Åberg",
  "Baker", "Clarke", "Fletcher", "Harris", "Mitchell", "Palmer", "Turner", "Walker",
];
export const STREETS = [
  "Koivukuja", "Rantatie", "Myllykatu", "Kirkkokatu", "Puistotie", "Mäntypolku", "Asemakatu", "Kalliotie", "Niittykuja", "Satamakatu",
  "Pihlajatie", "Tehtaankatu", "Lehtikuja", "Harjutie", "Kauppakatu",
];
export const TOWNS = [
  "Hämeenlinna", "Kuopio", "Lahti", "Mikkeli", "Pori", "Rauma", "Savonlinna", "Seinäjoki", "Kokkola", "Lappeenranta", "Kajaani", "Porvoo", "Iisalmi", "Salo",
];
export const ORGS = [
  "Example Oy", "Pohjola Logistiikka Oy", "Järvi Consulting Ab", "Nordic Sample Ltd", "Kuusi Rakennus Oy", "Meri Data Oy", "Aurora Services Ltd", "Kide Media Oy",
];
const EMAIL_DOMAINS = ["example.com", "example.org", "example.net", "mail.example"];

export const SURROGATE_LABELS: ReadonlySet<SpanLabel> = new Set(["PERSON", "EMAIL", "PHONE", "ADDRESS", "LOCATION", "DATE", "AGE", "ORG", "ACCOUNT_NUMBER"]);

/** Small deterministic PRNG (mulberry32) seeded from a 32-bit integer. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const digits = (rnd: () => number, n: number): string => { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(rnd() * 10); return s; };

const isLower = (s: string): boolean => s === s.toLowerCase() && s !== s.toUpperCase();
const isUpper = (s: string): boolean => s === s.toUpperCase() && s !== s.toLowerCase();
function matchCase(original: string, out: string): string {
  if (isLower(original)) return out.toLowerCase();
  if (isUpper(original) && original.length > 1) return out.toUpperCase();
  return out;
}
const ascii = (s: string): string => s.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a").replace(/[^a-z]/g, "");

/**
 * Surrogate for one span. `seedOf(key)` returns a keyed 32-bit seed for a normalised key within the consistency scope.
 * Returns null when no generator exists for this label or value (the caller falls back to a typed placeholder).
 */
export function makeSurrogate(label: SpanLabel, original: string, seedOf: (key: string) => number): string | null {
  const orig = original.trim();
  const norm = orig.toLowerCase().replace(/\s+/g, " ");
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = label === "PERSON" ? personName(orig, seedOf, attempt) : generate(label, orig, prng(seedOf(`${norm}#${attempt}`)));
    if (s === null) return null;
    if (s.toLowerCase() !== norm) return s;
  }
  return null;
}

/** Names are keyed per word so "Ksenia Sokolova" and a later "ksenia" get the same first name. */
function personName(orig: string, seedOf: (key: string) => number, attempt: number): string {
  const words = orig.split(/\s+/).filter(Boolean);
  const w0 = (words[0] ?? "").toLowerCase(), wl = (words[words.length - 1] ?? "").toLowerCase();
  const first = pick(prng(seedOf(`first:${w0}#${attempt}`)), FIRST_NAMES);
  if (words.length === 1 && /^[A-ZÅÄÖ]{3,5}$/.test(orig)) {
    const last = pick(prng(seedOf(`last:${w0}#${attempt}`)), LAST_NAMES);
    return (first.slice(0, 1) + ascii(last).slice(0, 3)).toUpperCase();
  }
  if (words.length < 2) return matchCase(orig, first);
  const last = pick(prng(seedOf(`last:${wl}#${attempt}`)), LAST_NAMES);
  return matchCase(orig, `${first} ${last}`);
}

function generate(label: SpanLabel, orig: string, rnd: () => number): string | null {
  switch (label) {
    case "EMAIL": {
      const out = `${ascii(pick(rnd, FIRST_NAMES))}.${ascii(pick(rnd, LAST_NAMES))}${digits(rnd, 2)}@${pick(rnd, EMAIL_DOMAINS)}`;
      return out;
    }
    case "PHONE": {
      const compact = !/\s/.test(orig);
      const intl = /^\+|^00/.test(orig) || !/^0/.test(orig);
      const prefix = pick(rnd, ["40", "44", "45", "50"]);
      const a = digits(rnd, 3), b = digits(rnd, 4);
      if (intl) return compact ? `+358${prefix}${a}${b}` : `+358 ${prefix} ${a} ${b}`;
      return compact ? `0${prefix}${a}${b}` : `0${prefix} ${a} ${b}`;
    }
    case "ADDRESS": {
      const n = 1 + Math.floor(rnd() * 40);
      const extra = /\d\s*[A-Z]\s*\d/.test(orig) ? ` ${pick(rnd, ["A", "B", "C", "D"])} ${1 + Math.floor(rnd() * 20)}` : "";
      return matchCase(orig, `${pick(rnd, STREETS)} ${n}${extra}`);
    }
    case "LOCATION": return matchCase(orig, pick(rnd, TOWNS));
    case "ORG": return matchCase(orig, pick(rnd, ORGS));
    case "DATE": {
      const shift = (1 + Math.floor(rnd() * 30)) * (rnd() < 0.5 ? -1 : 1);
      return shiftDateText(orig, shift);
    }
    case "AGE": {
      if (!/\d/.test(orig)) return null;
      const delta = (1 + Math.floor(rnd() * 3)) * (rnd() < 0.5 ? -1 : 1);
      return orig.replace(/\d+/, (n) => String(Math.max(1, Number(n) + delta)));
    }
    case "ACCOUNT_NUMBER": {
      if (!/\d/.test(orig)) return digits(rnd, 8);
      let out = "";
      for (const ch of orig) out += ch >= "0" && ch <= "9" ? String(Math.floor(rnd() * 10)) : ch;
      return out;
    }
    default:
      return null;
  }
}
