/**
 * Rules-based PII span detector for Finnish, Swedish and English chat, ASR and e-mail text.
 *
 * Covers all 20 span labels of metadata/pii_span_guidelines.md. Deterministic: compiled regexes, fixed lexicons,
 * fixed priorities. Candidates from independent passes are resolved into non-overlapping spans by priority,
 * then length, then position.
 *
 * Lexicons (first names, surnames, municipalities, name stoplist, known organisations) are built from the
 * TRAINING split of the synthetic package, so measurements on that split are optimistic.
 */
import type { SpanDetection, SpanLabel } from "@/contracts";
import type { SpanDetector } from "./types";
import { DIGIT_WORDS, WEAK_DIGIT_WORDS, SEP_WORDS, LETTER_WORDS, FILLERS, EMAIL_AT, EMAIL_DOT, EMAIL_JOIN } from "./spoken";
import { FIRST_NAME_SET, SURNAME_SET, NAME_STOP_SET, PLACE_FORMS, MULTIWORD_PLACES, KNOWN_ORGS } from "./lexicon";
import { isHetu, isIban, isIpv4, luhnOk, isDdmmyy, hetuCheckChar } from "./validators";

export const SPAN_DETECTOR_ID = "mask.rules.spans";
export const SPAN_DETECTOR_VERSION = "1.0.0";

// ------------------------------------------------------------------------------------------------ tokens
const K_NUM = 1, K_WORD = 2, K_ALNUM = 3, K_PUNCT = 4;
interface Tok { s: number; e: number; raw: string; low: string; k: number }

const TOKEN_RX = /[\p{L}\p{N}]+(?:['’_\-.@][\p{L}\p{N}]+)*|\S/gu;
const NUMLIKE_RX = /^\d+(?:-\d+)*$/;
const WORDLIKE_RX = /^[\p{L}]+(?:['’-][\p{L}]+)*$/u;
const HAS_DIGIT_RX = /\d/;

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  TOKEN_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RX.exec(text)) !== null) {
    const raw = m[0];
    let k: number;
    if (NUMLIKE_RX.test(raw)) k = K_NUM;
    else if (WORDLIKE_RX.test(raw)) k = K_WORD;
    else if (raw.length === 1 && !HAS_DIGIT_RX.test(raw) && !/\p{L}/u.test(raw)) k = K_PUNCT;
    else k = K_ALNUM;
    out.push({ s: m.index, e: m.index + raw.length, raw, low: raw.toLowerCase(), k });
  }
  return out;
}

/** gap between two tokens is a short run of spaces (no newline) */
function spaceGap(text: string, a: number, b: number): boolean {
  if (b - a > 3) return false;
  for (let i = a; i < b; i++) { const c = text.charCodeAt(i); if (c !== 32 && c !== 9 && c !== 160) return false; }
  return true;
}

// ------------------------------------------------------------------------------------------------ candidates
/** kwS/kwE: core of a trimmable candidate (health clause): the clause may shrink around higher-priority spans. */
interface Cand { start: number; end: number; label: SpanLabel; score: number; ruleId: string; prio: number; review?: boolean; kwS?: number; kwE?: number }

function resolve(cands: Cand[], text: string): SpanDetection[] {
  if (cands.length === 0) return [];
  cands.sort((a, b) => b.prio - a.prio || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept: Cand[] = [];
  for (const c of cands) {
    if (c.end <= c.start) continue;
    let ok = true;
    for (const k of kept) {
      if (!(c.start < k.end && k.start < c.end)) continue;
      if (c.kwS === undefined || c.kwE === undefined || (k.start < c.kwE && c.kwS < k.end)) { ok = false; break; }
      if (k.end <= c.kwS) c.start = Math.max(c.start, k.end); else c.end = Math.min(c.end, k.start);
    }
    if (ok && c.kwS !== undefined) {
      while (c.start < c.end && /[\s,.;:]/.test(text[c.start]!)) c.start++;
      while (c.end > c.start && /[\s,.;:]/.test(text[c.end - 1]!)) c.end--;
      ok = c.end > c.start;
    }
    if (ok) kept.push(c);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept.map((c) => {
    const d: SpanDetection = { start: c.start, end: c.end, label: c.label, score: c.score, ruleId: c.ruleId };
    if (c.review) d.needsReview = true;
    return d;
  });
}

// ------------------------------------------------------------------------------------------------ cues
type CueCat = "NID" | "ACCT" | "IBAN" | "CARD" | "CARD4" | "DEVICE" | "PHONE" | "SECRET" | "USER" | "PROP" | "PLATE" | "DATEB" | "SERIAL";
/** Cue regexes tested against the lower-cased window before a value; the cue closest to the value wins. */
const CUE_RX: [CueCat, RegExp][] = [
  ["NID", /(henkil\p{L}*tun\p{L}*|hetu\p{L}*|personbeteck\p{L}*|personnum\p{L}*|person nummer|sotu|id[- ]?code|identity code|personal id\p{L}*|social security|födelsenummer|personal identity)/gu],
  ["ACCT", /(asiakasn\p{L}*|asiakasnro|kundn\p{L}*|kundnr|customer (?:number|no\.?|nr|id)|client number|lasku\p{L}*|faktur\p{L}*|invoice\p{L}*|sopimusn\p{L}*|contract (?:number|no)|avtalsnummer|tilausn\p{L}*|order (?:number|no)|ordernummer|viitenum\p{L}*|asiakas \p{L}+ \p{L}+ \(|customer \p{L}+ \p{L}+ \(|kund \p{L}+ \p{L}+ \()/gu],
  ["IBAN", /(tilinum\p{L}*|tilille|tilil\p{L}*|kontonum\p{L}*|konto\p{L}*|iban|bank account|account number|accuont number)/gu],
  ["CARD4", /(päättyy|päätyy|slutar på|slutar med|ending in|ending|ends in|ends with)/gu],
  ["CARD", /(kortti\p{L}*|kortil\p{L}*|kortin|kortet|kort|card\p{L}*|luottokort\p{L}*|visa|mastercard)/gu],
  ["DEVICE", /(imei|iccid|sim-kort\p{L}*|sim card|sim-kortets|laitetunn\p{L}*)/gu],
  ["SERIAL", /(sarjanum\p{L}*|serial(?: number)?|serienummer\p{L}*|s\/n)/gu],
  ["SECRET", /(salasan\p{L}*|password|passcode|lösenord\p{L}*|(?<![\p{L}])pin(?![\p{L}])|pin-ko\p{L}*|pinkoodi\p{L}*|puk\p{L}*|wifi-avain|verkkoavain|tunnusluku\p{L}*)/gu],
  ["USER", /(käyttäjätun\p{L}*|username|user name|användarnamn\p{L}*|login name|tunnukseni)/gu],
  ["PROP", /(kiinteistötun\p{L}*|property id|fastighetsbet\p{L}*)/gu],
  ["PHONE", /((?<![\p{L}])numero\p{L}*|(?<![\p{L}])nummer\p{L}*|(?<![\p{L}])number|numret|puhelin\p{L}*|phone|(?<![\p{L}])soit\p{L}*|(?<![\p{L}])call\p{L}*|ring\p{L}*|sms|tekstiviest\p{L}*|text from|gsm|(?<![\p{L}])puh|(?<![\p{L}])tel|mobiili\p{L}*|mobile|liittymä\p{L}*)/gu],
  ["DATEB", /(syntymä\p{L}*|syntyn\p{L}*|born|birth|född\p{L}*)/gu],
];

/** Canonical cue words for fuzzy matching of typos ("asiakasnmueroni", "slaasanani", "passwword"). */
const FUZZY_CUES: [CueCat, string][] = [
  ["NID", "henkilötunnus"], ["NID", "henkilötunnukseni"], ["NID", "personbeteckning"], ["NID", "personbeteckningen"],
  ["ACCT", "asiakasnumero"], ["ACCT", "asiakasnumeroni"], ["ACCT", "kundnummer"], ["ACCT", "kundnumret"], ["ACCT", "customer"], ["ACCT", "laskun"], ["ACCT", "invoice"],
  ["SECRET", "salasana"], ["SECRET", "salasanani"], ["SECRET", "password"], ["SECRET", "lösenord"], ["SECRET", "lösenordet"], ["SECRET", "pin-koodi"], ["SECRET", "pin-koden"],
  ["USER", "käyttäjätunnukseni"], ["USER", "käyttäjätunnus"], ["USER", "username"], ["USER", "användarnamn"],
  ["PROP", "kiinteistötunnus"], ["PROP", "property"],
  ["IBAN", "tilinumero"], ["IBAN", "kontonummer"], ["IBAN", "account"],
  ["PHONE", "numero"], ["PHONE", "number"], ["PHONE", "nummer"], ["PHONE", "numret"],
  ["PLATE", "rekkari"], ["PLATE", "rekisterinumero"], ["PLATE", "plate"], ["PLATE", "registreringsnummer"],
];

/** Bounded Damerau-Levenshtein: true when distance(a, b) <= k. */
export function withinEdits(a: string, b: string, k: number): boolean {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > k) return false;
  let prev2: number[] = [], prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > k) return false;
    prev2 = prev; prev = cur;
  }
  return prev[lb]! <= k;
}

function fuzzyCue(word: string): CueCat | null {
  if (word.length < 4) return null;
  for (const [cat, cw] of FUZZY_CUES) {
    const k = cw.length >= 8 ? 2 : 1;
    if (Math.abs(cw.length - word.length) > k) continue;
    if (cw.charCodeAt(0) !== word.charCodeAt(0) && cw.charCodeAt(1) !== word.charCodeAt(1)) continue;
    if (withinEdits(word, cw, k)) return cat;
  }
  return null;
}

const WORD_IN_WINDOW_RX = /[\p{L}-]+/gu;
/** Find the cue category closest to the end of `win` (lower-cased text before the value). */
function cueBefore(winIn: string, allow?: ReadonlySet<CueCat>): CueCat | null {
  // a cue only binds the nearest value: ignore anything before the last digit in the window
  let cut = -1;
  for (let i = winIn.length - 1; i >= 0; i--) { const c = winIn.charCodeAt(i); if (c >= 48 && c <= 57) { cut = i; break; } }
  const win = cut >= 0 ? winIn.slice(cut + 1) : winIn;
  let best: CueCat | null = null, bestEnd = -1;
  for (const [cat, rx] of CUE_RX) {
    if (allow && !allow.has(cat)) continue;
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(win)) !== null) {
      const end = m.index + m[0].length;
      if (end > bestEnd || (end === bestEnd && m[0].length > 0 && best === "PHONE")) { bestEnd = end; best = cat; }
    }
  }
  // fuzzy: the last few words, only when no exact cue sits in the last 30 chars
  if (best === null || bestEnd < win.length - 30) {
    const words = win.slice(-45).match(WORD_IN_WINDOW_RX);
    if (words) {
      for (let i = words.length - 1; i >= Math.max(0, words.length - 4); i--) {
        const f = fuzzyCue(words[i]!);
        if (f && (!allow || allow.has(f))) return f;
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ word lists
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // fi
  "on", "ja", "ei", "se", "ne", "että", "kun", "jos", "mutta", "tai", "myös", "nyt", "vielä", "joo", "kyllä", "hei", "moi", "kiitos",
  "terve", "päivää", "olen", "olin", "oli", "minä", "mä", "sinä", "hän", "me", "te", "he", "tässä", "täällä", "siellä", "puhuu",
  "asiakas", "asiakaspalvelu", "aallokko", "aallokon", "aallokolta", "aallokosta", "aallokolle", "aava", "hetu", "tunnistus",
  "onnistui", "puhelimessa", "nimellä", "nimeni", "terveisin", "ystävällisin", "yhteyshenkilö", "tota", "öö", "ööh", "niinku",
  "elikkä", "eli", "siis", "no", "okei", "ok", "selvä", "asia", "lasku", "laskun", "uusi", "vanha", "hyvää", "huomenta",
  "iltaa", "kuinka", "miten", "voin", "auttaa", "tänään", "huomenna", "eilen", "äitini", "isäni", "mieheni", "vaimoni", "puolisoni",
  // sv
  "och", "är", "det", "jag", "du", "han", "hon", "vi", "ni", "de", "en", "ett", "hej", "tack", "här", "från", "med", "för",
  "min", "mitt", "mina", "kund", "kundtjänst", "god", "dag", "vänliga", "hälsningar", "heter", "nu", "inte", "kan",
  // en
  "the", "and", "is", "my", "i", "me", "you", "we", "they", "he", "she", "it", "this", "that", "hi", "hello", "thanks", "thank",
  "customer", "service", "speaking", "regards", "best", "kind", "name", "dear", "from", "with", "for", "to", "of", "in",
  "on", "at", "a", "an", "so", "yes", "no", "not", "just", "can", "will", "may", "june", "july", "april", "august", "march",
]);
/** lexicon names that are also ordinary words: only accepted after a name cue */
const AMBIGUOUS_NAMES: ReadonlySet<string> = new Set([
  "grace", "hope", "joy", "faith", "honey", "summer", "autumn", "sunny", "rich", "frank", "june", "april", "august", "onni",
  "toivo", "armas", "lempi", "sulo", "into", "ilta", "aamu", "tuuli", "lumi", "valo", "usko", "rauha", "meri",
]);

/** cue tiers: OPEN accepts any name-shaped word, CAP accepts capitalised words, LEX needs the lexicon */
const OPEN_CUES: ReadonlySet<string> = new Set([
  "nimeni on", "nimellä", "nimllä", "nimelä", "my name is", "name is", "jag heter", "heter", "täällä puhuu", "puhuu",
  "terveisin", "ystävällisin terveisin", "hälsningar", "vänliga hälsningar", "regards", "kind regards", "best regards",
  "t", "hei tässä", "moi tässä", "mvh", "terv", "hälsning", "yhteyshenkilö", "contact person", "kontaktperson", "tyttärelleni",
  "soittaa tyttärelleni",
]);
const CAP_CUES: ReadonlySet<string> = new Set([
  "asiakas", "customer", "kund", "puolisoni", "äitini", "isäni", "tyttäreni", "poikani", "mieheni", "vaimoni", "esimies",
  "esimieheni", "esihenkilö", "esihenkilöni", "my daughter", "my son", "my partner", "my father", "my mother", "my mum",
  "my dad", "my husband", "my wife", "my supervisor", "my manager", "min fru", "min man", "min chef", "min pappa", "min mamma",
  "min dotter", "min son", "min sambo", "tyttärelleni", "name", "nimi", "puoliso", "omainen", "huoltaja", "isä", "äiti",
  "dr", "dr.", "lääkäri", "hoitaja", "opettaja", "kuraattori", "parent", "guardian", "teacher", "nurse", "doctor",
]);
const LEX_CUES: ReadonlySet<string> = new Set([
  "asiakaspalvelu", "customer service", "kundtjänst", "päivää", "god dag", "best", "dag",
]);
const WEAK_CUES: ReadonlySet<string> = new Set([
  "kiitos", "hei", "moi", "moikka", "terve", "hello", "hi", "hey", "thanks", "thank you", "tack", "hej", "this is", "det är",
  "olen", "tässä", "i am", "i'm", "dear", "hyvä",
]);
/** a name directly before these words */
const AFTER_NAME_CUES: ReadonlySet<string> = new Set(["tässä", "täällä", "puhelimessa", "speaking", "här", "aallokolta", "from"]);

// ------------------------------------------------------------------------------------------------ regexes
const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const EMAIL_RX = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const URL_RX = /(?:https?:\/\/|www\.)[^\s<>"'()]+/giu;
const URL_PERSONAL_RX = /[?&](?:token|id|email|e|user|uid|session|key|code|sig|auth|ref|t)=|%40|@|verify|login|reset|secure|signin|confirm|-tuki|-lasku|paketti|lasku\?|pay\?|\/pay|password/i;
const IBAN_RX = new RegExp(`${B}[A-Za-z]{2}\\d{2}(?: ?[A-Za-z0-9]{4}){2,7}(?: ?[A-Za-z0-9]{1,3})?${E}`, "gu");
const HETU_RX = new RegExp(`${B}\\d{6}[-+A-FU-Ya-fu-y]\\d{3}[0-9A-Ya-y]${E}`, "gu");
const IP_RX = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d]|\.\d)/g;
const PROP_RX = /(?<![\d-])\d{1,3}-\d{1,3}-\d{1,4}-\d{1,4}(?![\d-])/g;
const PLATE_RX = new RegExp(`(?<![\\p{L}\\p{N}_-])[A-Za-zÅÄÖåäö]{2,3}-\\d{1,3}(?![\\p{L}\\p{N}_-])`, "gu");
const STREET = "[\\p{L}-]{2,}(?:katu|tie|kuja|polku|väylä|rinne|mäki|kaari|ranta|puisto|aukio|tori|raitti|piha|tanhua|linja|ahde|kaarre|puistikko|strand|gatan|vägen|gränd|stigen|backen|street|road|lane|avenue)";
const ADDRESS_RX = new RegExp(`${B}${STREET}\\s[1-9]\\d{0,3}(?:\\s?[a-hA-H](?![\\p{L}])(?:\\s?\\d{1,3})?)?(?:,?\\s\\d{5}(?:\\s[\\p{L}-]+(?:\\s(?:tl|TL))?)?)?(?![\\p{N}])(?!\\.\\d)`, "giu");
const DATE_NUM_RX = /(?<![\d.,])(\d{1,2})\.\s?(\d{1,2})\.((?:19|20)\d{2})?(?![\d])/g;
const DATE_ISO_RX = /(?<![\d-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d])/g;
const DATE_SLASH_RX = /(?<![\d/])(\d{1,2})\/(\d{1,2})\/((?:19|20)?\d{2})(?![\d/])/g;
const MONTHS_FI = "tammikuuta|helmikuuta|maaliskuuta|huhtikuuta|toukokuuta|kesäkuuta|heinäkuuta|elokuuta|syyskuuta|lokakuuta|marraskuuta|joulukuuta";
const MONTHS_SV = "januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december";
const MONTHS_EN = "january|february|march|april|may|june|july|august|september|october|november|december";
const DATE_WORD_RX = new RegExp(
  `${B}(?:\\d{1,2}(?:\\.|st|nd|rd|th)?\\s(?:of\\s)?(?:${MONTHS_FI}|${MONTHS_SV}|${MONTHS_EN})(?:\\s(?:19|20)\\d{2})?|(?:${MONTHS_EN})\\s\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s(?:19|20)\\d{2})?)${E}`, "giu");
const AGE_SUFFIX_RX = /(?<![\p{N}.,])(\d{1,3})(?=\s?-?\s?(?:vuotias|vuotiaa|years? old|yrs? old|-year-old|year-old|åring|årig)|-v(?![\p{L}])|\s?v(?=[),]))/giu;
const AGE_CUE_RX = new RegExp("(?<![\\p{L}])(?:ä\\p{L}{3,6}|isäni|mieheni|vaimoni|hän|mum|mom|mother|father|dad|husband|wife|han|hon|mamma|pappa|olen|i'm|i am|im|jag är)"
  + "(?:,?\\s+(?:tota|öö|ööh|niinku|elikkä|siis|um|erm|uh|like|alltså|liksom|typ|joo))*,?\\s+(?:(?:on|is|är)\\s+)?(?:(?:tota|öö|ööh|niinku|elikkä|siis|um|erm|uh|like|alltså|liksom|typ|joo),?\\s+)?(\\d{1,3})"
  + "(?=\\s*(?:[,.!?]|and\\b|och\\b|ja\\b|i\\b|not\\b|enkä|en\\b|hoidan|vuot|år(?![\\p{L}])|years?\\b|-vuot|$))", "giu");
const HEALTH_RX = /(?<![\p{L}])(?:sairau\p{L}*|sairas\p{L}*|sairaala\p{L}*|masennu\p{L}*|masentu\p{L}*|dementi\p{L}*|muistisair\p{L}*|kuulolait\p{L}*|aivoinfarkt\p{L}*|infarkt\p{L}*|syöpä\p{L}*|syövä\p{L}*|diabet\p{L}*|sokerimittar\p{L}*|sydänleikkau\p{L}*|leikkauks\p{L}*|näkövamm\p{L}*|kuuro\p{L}*|sokea\p{L}*|pyörätuol\p{L}*|mielenterve\p{L}*|psykiatr\p{L}*|uupumu\p{L}*|burnout|sick leave|depress\p{L}*|dementia|cancer\p{L}*|stroke|hearing aid|diabetic|glucose monitor|heart surgery|heart attack|in hospital|hospitali[sz]ed|wheelchair|chemotherapy|sjukskriv\p{L}*|sjukhus\p{L}*|hörapparat\p{L}*|hjärtoperation\p{L}*|hjärtinfarkt\p{L}*|minnessjukdom\p{L}*|demens\p{L}*|glukosmätare\p{L}*|rullstol\p{L}*|adhd|lukihäiriö\p{L}*|migreeni\p{L}*|epilepsi\p{L}*|astma\p{L}*|uniapnea\p{L}*|reuma\p{L}*|asthma|epilepsy|migraine|dyslexia)/giu;
const HEALTH_SUBJECT_RX = /(?<![\p{L}'])(?:olen|olin|minulla|minä|äitini|isäni|mieheni|vaimoni|puolisoni|poikani|tyttäreni|hän|i|i've|i'm|my|jag|min|mitt|han|hon)(?![\p{L}'])/giu;
const HEALTH_START_CUE_RX = /(?:koska|because|eftersom|since|kertoi:|told us:|berättade:|hidas,?|slow,?|långsam,?|sillä)\s+$/iu;
const ORG_SUFFIX_RX = new RegExp(`${B}((?:[\\p{L}][\\p{L}&'-]*\\s){1,3})(Oy Ab|Oy|OY|Oyj|Ab|AB|Ky|KY|Tmi|TMI|Ltd|Inc|GmbH|ry|oy ab|oyj|oy|ab|ky|tmi)${E}`, "gu");
const ORG_WORD_RX = /(?<![\p{L}])((?:[\p{Lu}][\p{L}-]+\s){1,3})(Bank|Bankin|Banken|Pankki|Pankin|Hospital|Sairaala|Telecom|Mobile|Net|Energia|Sähkö|Insurance|Vakuutus|Försäkring|School|College|Campus|Transit|Clinic|Klinikka|Lukio|Koulu|Opisto|Centre|Center|University|Yliopisto)(?![\p{L}])/gu;
const HOSTNAME_RX = /(?<![\p{L}\p{N}-])[A-Z]{2,4}-[A-Z0-9]{2,10}(?:-[A-Z0-9]{2,10}){0,2}(?![\p{L}\p{N}-])/gu;
const PLACE_PHRASE_RX = /(?<![\p{L}])[\p{Lu}][\p{L}-]+n (?:bussipysäkki|pysäkki|leikkipuisto|kierrätyspiste|puisto|uimaranta|urheilukenttä|kenttä|parkkipaikka|parkkihalli|aukio|tori|risteys|alikulku|silta|ranta)\p{L}*/gu;
const INITIALS_RX = /(?<=\/\s?)(?:[A-ZÅÄÖ]{3,5}|[A-ZÅÄÖ]\.\s?[\p{Lu}][\p{L}-]+)(?![\p{L}])/gu;
const UNIT_AFTER_RX = /^\s?(?:€|e(?![\p{L}])|eur|euro|euroa|kr(?![\p{L}])|sek|snt|sent|%|gb|mb|kb|mbit|mbps|kk(?![\p{L}])|min(?![\p{L}])|tuntia|minuuttia|sekuntia|päivää|päivän|days|dagar|kpl|st(?![\p{L}])|kwh|w(?![\p{L}])|v(?![\p{L}])|vuotta|år|years|-vuot|€\/)/iu;
const TIME_BEFORE_RX = /(?:klo|kello|kl\.?|at|kl)\s*$/i;

const SECRET_VALUE_RX = /\d|[#!$%&*?+=@]|[\p{Ll}][\p{Lu}]/u;
const USER_VALUE_RX = /[\d._@-]/;
const VALUE_SKIP: ReadonlySet<string> = new Set([
  "on", "is", "är", "oli", "was", "var", "olisi", "would", "be", "varmaan", "probably", "kai", "nog", "kanske", "luultavasti",
  "siis", "so", "tota", "öö", "ööh", "niinku", "elikkä", "joo", "um", "erm", "uh", "like", "alltså", "liksom", "typ", ":", ",", "=",
  "there", "siellä", "där", "edelleen", "still", "fortfarande", "nyt", "now", "nu", "it's", "its", "it", "mun", "minun", "my", "mitt",
]);

// ------------------------------------------------------------------------------------------------ detector
class RulesSpanDetector implements SpanDetector {
  readonly id = SPAN_DETECTOR_ID;
  readonly version = SPAN_DETECTOR_VERSION;

  detect(text: string, context?: { language?: string; column?: string; previousText?: string }): SpanDetection[] {
    if (!text || text.length < 2) return [];
    const cands: Cand[] = [];
    const toks = tokenize(text);
    const lower = text.toLowerCase();
    const sameLen = lower.length === text.length;
    const low = sameLen ? lower : text; // offsets must match; fall back to case-sensitive tests
    const hasDigit = HAS_DIGIT_RX.test(text);

    if (text.includes("@")) this.emails(text, low, cands);
    if (text.includes("://") || low.includes("www.")) this.urls(text, cands);
    if (hasDigit) this.structured(text, low, cands);
    this.numberRuns(text, low, toks, cands, context?.previousText);
    this.spelledEmails(text, toks, cands);
    this.cueValues(text, low, toks, cands);
    if (hasDigit) this.ages(text, cands);
    this.health(text, low, cands);
    this.orgs(text, low, cands);
    this.places(text, low, toks, cands);
    this.persons(text, toks, cands);
    return resolve(cands, text);
  }

  // ---------------------------------------------------------------- typed e-mails and URLs
  private emails(text: string, low: string, out: Cand[]): void {
    EMAIL_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMAIL_RX.exec(text)) !== null) {
      let s = m.index, e = s + m[0].length;
      while (e > s && /[.\-_]/.test(text[e - 1]!)) e--;
      while (s < e && /[.\-_]/.test(text[s]!)) s++;
      const cue = cueBefore(low.slice(Math.max(0, s - 40), s), USER_ONLY);
      if (cue === "USER") out.push({ start: s, end: e, label: "USERNAME", score: 0.9, ruleId: "span.username.cue_email", prio: 112 });
      else out.push({ start: s, end: e, label: "EMAIL", score: 0.97, ruleId: "span.email.typed", prio: 110 });
    }
  }

  private urls(text: string, out: Cand[]): void {
    URL_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RX.exec(text)) !== null) {
      let e = m.index + m[0].length;
      while (e > m.index && /[.,;:!?]/.test(text[e - 1]!)) e--;
      const u = text.slice(m.index, e);
      if (URL_PERSONAL_RX.test(u)) out.push({ start: m.index, end: e, label: "URL", score: 0.9, ruleId: "span.url.personal", prio: 120 });
    }
  }

  // ---------------------------------------------------------------- typed identifiers with validators
  private structured(text: string, low: string, out: Cand[]): void {
    let m: RegExpExecArray | null;
    IBAN_RX.lastIndex = 0;
    while ((m = IBAN_RX.exec(text)) !== null) {
      const raw = m[0];
      const cc = raw.slice(0, 2).toUpperCase();
      if (!/^[A-Z]{2}$/.test(cc)) continue;
      // longest prefix (whole groups) that validates
      let end = m.index + raw.length, valid = false;
      let cur = raw;
      while (cur.replace(/\s/g, "").length >= 15) {
        if (isIban(cur)) { valid = true; end = m.index + cur.length; break; }
        const sp = cur.lastIndexOf(" ");
        if (sp < 0) break;
        cur = cur.slice(0, sp);
      }
      const compact = raw.replace(/\s/g, "");
      if (valid) out.push({ start: m.index, end, label: "IBAN", score: 0.99, ruleId: "span.iban.mod97", prio: 105 });
      else if (cc === "FI" && compact.length >= 18) {
        const e2 = m.index + charsForCompact(raw, 18);
        out.push({ start: m.index, end: e2, label: "IBAN", score: 0.8, ruleId: "span.iban.shape", prio: 104, review: true });
      }
    }
    HETU_RX.lastIndex = 0;
    while ((m = HETU_RX.exec(text)) !== null) {
      const ok = isHetu(m[0]);
      out.push({ start: m.index, end: m.index + m[0].length, label: "NATIONAL_ID", score: ok ? 0.99 : 0.9, ruleId: ok ? "span.national_id.checksum" : "span.national_id.shape", prio: 106 });
    }
    if (text.includes(".")) {
      IP_RX.lastIndex = 0;
      while ((m = IP_RX.exec(text)) !== null) {
        const ip = m[0];
        if (!isIpv4(ip) || genericIp(ip)) continue;
        out.push({ start: m.index, end: m.index + ip.length, label: "IP_ADDRESS", score: 0.9, ruleId: "span.ip.v4", prio: 100 });
      }
    }
    this.dates(text, low, out);
    if (text.includes("-")) {
      PROP_RX.lastIndex = 0;
      while ((m = PROP_RX.exec(text)) !== null) {
        out.push({ start: m.index, end: m.index + m[0].length, label: "PROPERTY_ID", score: 0.85, ruleId: "span.property_id.shape", prio: 100 });
      }
      PLATE_RX.lastIndex = 0;
      while ((m = PLATE_RX.exec(text)) !== null) {
        const v = m[0];
        const upper = v === v.toUpperCase();
        const win = low.slice(Math.max(0, m.index - 45), m.index);
        const cue = /rekkar|rekist|plate|registr|reg\.? ?n|auto|bil(?![\p{L}])|car(?![\p{L}])/u.test(win) || fuzzyCue(lastWord(win)) === "PLATE";
        if (!cue && (!upper || /^(PIN|PUK|SIM|IMEI|ID|NO|NR|AT|TV|GB|MB)-/.test(v))) continue;
        out.push({ start: m.index, end: m.index + v.length, label: "LICENSE_PLATE", score: cue ? 0.9 : 0.6, ruleId: cue ? "span.plate.cue" : "span.plate.shape", prio: 95 });
      }
    }
    HOSTNAME_RX.lastIndex = 0;
    while ((m = HOSTNAME_RX.exec(text)) !== null) {
      const v = m[0];
      if (!/\d/.test(v) || /^[A-Z]{2,3}-\d{1,3}$/.test(v)) continue; // plates are handled above
      out.push({ start: m.index, end: m.index + v.length, label: "DEVICE_ID", score: 0.75, ruleId: "span.device_id.hostname", prio: 96 });
    }
    ADDRESS_RX.lastIndex = 0;
    while ((m = ADDRESS_RX.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, label: "ADDRESS", score: 0.85, ruleId: "span.address.street_number", prio: 103 });
    }
  }

  private dates(text: string, low: string, out: Cand[]): void {
    let m: RegExpExecArray | null;
    DATE_NUM_RX.lastIndex = 0;
    while ((m = DATE_NUM_RX.exec(text)) !== null) {
      const d = Number(m[1]), mo = Number(m[2]);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
      let end = m.index + m[0].length;
      if (!m[3]) {
        // "3.9." form: needs the trailing dot (already matched); avoid times "klo 14.30."
        if (TIME_BEFORE_RX.test(low.slice(Math.max(0, m.index - 6), m.index))) continue;
      }
      if (/^\s?(?:€|e(?![\p{L}])|eur|euro)/iu.test(text.slice(end, end + 6)) || /[€$£]\s?$/.test(text.slice(Math.max(0, m.index - 2), m.index))) continue;
      out.push({ start: m.index, end, label: "DATE", score: 0.8, ruleId: "span.date.numeric", prio: 85 });
    }
    DATE_WORD_RX.lastIndex = 0;
    while ((m = DATE_WORD_RX.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length, label: "DATE", score: 0.75, ruleId: "span.date.month_name", prio: 85 });
    DATE_ISO_RX.lastIndex = 0;
    while ((m = DATE_ISO_RX.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length, label: "DATE", score: 0.8, ruleId: "span.date.iso", prio: 85 });
  }

  // ---------------------------------------------------------------- digit runs (typed groups and spoken digits)
  private numberRuns(text: string, low: string, toks: Tok[], out: Cand[], previousText?: string): void {
    const n = toks.length;
    let i = 0;
    while (i < n) {
      const t = toks[i]!;
      const startKind = runStart(toks, i, text);
      if (!startKind) { i++; continue; }
      // build the run
      let digits = "";
      const letters: { at: number; ch: string }[] = [];
      let prefix = "";
      let spoken = 0, sep = false, lastGood = i - 1, j = i, decimal = false;
      if (startKind === "fi") {
        prefix = "FI";
        if (t.low === "f") j = i + 2; else if (t.low === "fi") j = i + 1; else { digits += t.raw.slice(2); j = i + 1; }
        lastGood = j - 1;
      } else if (startKind === "plus") { prefix = "+"; j = i + 1; lastGood = i; }
      else if (startKind === "sep") { sep = true; j = i + 1; lastGood = i; prefix = "-"; }
      else if (startKind === "hetuTail") {
        // "a9535": century letter + 3 digits + check
        letters.push({ at: 0, ch: t.raw[0]!.toUpperCase() });
        digits += t.raw.slice(1).replace(/\D/g, "");
        const last = t.raw[t.raw.length - 1]!;
        if (/\p{L}/u.test(last)) letters.push({ at: digits.length, ch: last.toUpperCase() });
        j = i + 1; lastGood = i; prefix = "-";
      }
      for (; j < n; j++) {
        const u = toks[j]!;
        if (j > i && !spaceGap(text, toks[j - 1]!.e, u.s)) {
          // allow "," / "-" punctuation tokens glued to the previous token
          if (!(u.k === K_PUNCT && (u.raw === "," || u.raw === "-") && u.s === toks[j - 1]!.e)) break;
        }
        if (u.k === K_NUM) { digits += u.raw.replace(/\D/g, ""); lastGood = j; continue; }
        const dw = DIGIT_WORDS.get(u.low);
        if (dw !== undefined) { digits += dw; spoken++; lastGood = j; continue; }
        if (u.k === K_PUNCT && (u.raw === "," || u.raw === "-")) {
          const nx2 = toks[j + 1];
          if (u.raw === "," && u.s === toks[j - 1]!.e && nx2 && nx2.k === K_NUM && nx2.s === u.e) { decimal = true; break; } // 19,90
          if (u.raw === "-") sep = sep || digits.length === 6;
          continue;
        }
        if (SEP_WORDS.has(u.low)) { if (digits.length === 6) sep = true; continue; }
        if (FILLERS.has(u.low)) continue;
        if (u.k === K_ALNUM && prefix === "-" && digits.length === 0 && /^\d{3}[\p{L}]$/u.test(u.raw)) {
          digits += u.raw.slice(0, 3); letters.push({ at: 3, ch: u.raw.slice(-1).toUpperCase() }); lastGood = j; j++; break;
        }
        if (u.k === K_ALNUM && /^\d+[\p{L}]$/u.test(u.raw) && (digits.length + u.raw.length - 1 === 10 || digits.length + u.raw.length - 1 === 9)) {
          digits += u.raw.slice(0, -1); letters.push({ at: digits.length, ch: u.raw.slice(-1).toUpperCase() }); lastGood = j; break;
        }
        const letter = u.low.length === 1 && /\p{L}/u.test(u.low) ? u.low.toUpperCase() : LETTER_WORDS.get(u.low);
        if (letter && (digits.length === 6 || digits.length === 9) && !letters.some((l) => l.at === digits.length)) {
          // a century sign at 6 digits must be a valid century letter; a check char ends the run
          if (digits.length === 6 && !/[A-FU-Y]/.test(letter)) break;
          letters.push({ at: digits.length, ch: letter }); lastGood = j;
          if (digits.length === 9) { j++; break; }
          continue;
        }
        break;
      }
      if (decimal || lastGood < i || digits.length === 0) { i = Math.max(i + 1, j); continue; }
      const s = toks[i]!.s, e = toks[lastGood]!.e;
      const run: Run = { s, e, digits, letters, prefix, spoken, sep, whole: isWhole(text, s, e) };
      const res = this.classifyRun(run, text, low, previousText);
      if (res) out.push(res);
      i = Math.max(lastGood + 1, i + 1);
    }
  }

  private classifyRun(r: Run, text: string, low: string, previousText?: string): Cand | null {
    const nd = r.digits.length;
    const win = low.slice(Math.max(0, r.s - 70), r.s);
    const after = text.slice(r.e, r.e + 12);
    const mk = (label: SpanLabel, score: number, rule: string, prio = 88, review = false): Cand =>
      ({ start: r.s, end: r.e, label, score, ruleId: rule, prio, review });
    const spokenOnly = r.spoken > 0 && r.spoken === nd;

    // single spoken digit words never form a value
    if (r.spoken > 0 && nd < 2 && !r.whole) return null;
    if (spokenOnly && nd === 2 && !r.whole) {
      // "kaksi kolme päivää" is not an id; only accept with a strong cue
      const c = cueBefore(win.slice(-30));
      if (c !== "NID" && c !== "PHONE") return null;
    }
    // IBAN spoken or typed in groups
    if (r.prefix === "FI" && nd >= 14) return mk("IBAN", isIban("FI" + r.digits) ? 0.97 : 0.8, "span.iban.run", 104);
    if (r.prefix === "FI") return nd >= 4 ? mk("IBAN", 0.6, "span.iban.partial", 80, true) : null;

    const century = r.letters.find((l) => l.at === 6);
    const check = r.letters.find((l) => l.at === 9);
    // HETU structure: 6 digits, sign, 3 digits, check char
    if ((nd === 9 && check && (century || r.sep)) || (nd === 10 && (century || r.sep))) {
      const nine = r.digits.slice(0, 9);
      const chk = check ? check.ch : r.digits[9]!;
      const ok = isDdmmyy(r.digits.slice(0, 6)) && hetuCheckChar(nine) === chk;
      return mk("NATIONAL_ID", ok ? 0.97 : 0.85, ok ? "span.national_id.run_checksum" : "span.national_id.run_shape", 102);
    }
    if (UNIT_AFTER_RX.test(after) && !(nd >= 13 && luhnOk(r.digits))) return null;
    if (nd <= 4 && TIME_BEFORE_RX.test(win.slice(-8))) return null;
    if (PUBLIC_NUMBERS.has(r.digits)) return null;

    if (r.prefix === "+" && r.digits.startsWith("358") && nd >= 10 && nd <= 13) return mk("PHONE", 0.95, "span.phone.intl", 92);
    let cue = cueBefore(win);
    if (r.whole && previousText && (cue === null)) cue = cueBefore(previousText.slice(-90).toLowerCase());
    const plus = r.prefix === "+";

    switch (cue) {
      case "NID": if (nd >= 2 && nd <= 11) return mk("NATIONAL_ID", 0.85, "span.national_id.cue", 96); break;
      case "SECRET": if (nd >= 4 && nd <= 8 && !r.digits.startsWith("0")) return mk("SECRET", 0.85, "span.secret.cue_digits", 96); break;
      case "CARD4": if (nd === 4) return mk("PAYMENT_CARD", 0.85, "span.payment_card.last4", 96); break;
      case "CARD": if (nd === 4) return mk("PAYMENT_CARD", 0.75, "span.payment_card.last4", 94); if (nd >= 13 && nd <= 19) return mk("PAYMENT_CARD", luhnOk(r.digits) ? 0.97 : 0.85, "span.payment_card.cue", 98); break;
      case "DEVICE": case "SERIAL": if (nd >= 8) return mk("DEVICE_ID", 0.9, "span.device_id.cue", 96); break;
      case "ACCT": if (nd >= 5 && nd <= 14 && !(r.digits.startsWith("0") && nd === 10)) return mk("ACCOUNT_NUMBER", 0.85, "span.account_number.cue", 94); break;
      case "PROP": break;
      case "DATEB": if (nd === 6 && isDdmmyy(r.digits) && r.sep) return mk("NATIONAL_ID", 0.7, "span.national_id.partial"); break;
      case "PHONE":
        if (plus || r.digits.startsWith("0") || (nd >= 4 && nd <= 7)) if (nd >= 3 && nd <= 13) return mk("PHONE", 0.85, "span.phone.cue", 92);
        break;
      default: break;
    }
    if (nd >= 13 && nd <= 19 && /kort|card/.test(win.slice(-50)) && !plus && !r.digits.startsWith("0")) return mk("PAYMENT_CARD", luhnOk(r.digits) ? 0.95 : 0.8, "span.payment_card.cue_near", 97);
    // shape-based
    if (nd >= 13 && nd <= 19 && "23456".includes(r.digits[0]!) && luhnOk(r.digits) && !plus && nd !== 15) return mk("PAYMENT_CARD", 0.95, "span.payment_card.luhn", 98);
    if (nd === 15 && (r.digits.startsWith("35") || r.digits.startsWith("86") || r.digits.startsWith("01")) ) return mk("DEVICE_ID", luhnOk(r.digits) ? 0.9 : 0.75, "span.device_id.imei", 96);
    if (nd >= 19 && nd <= 20 && r.digits.startsWith("89")) return mk("DEVICE_ID", 0.85, "span.device_id.iccid", 96);
    if (nd >= 13 && nd <= 19 && "23456".includes(r.digits[0]!) && luhnOk(r.digits)) return mk("PAYMENT_CARD", 0.85, "span.payment_card.luhn", 97);
    if (plus && r.digits.startsWith("358") && nd >= 10 && nd <= 13) return mk("PHONE", 0.95, "span.phone.intl", 92);
    if (plus && nd >= 9 && nd <= 14) return mk("PHONE", 0.85, "span.phone.intl", 92);
    if (r.digits.startsWith("00358") && nd >= 12) return mk("PHONE", 0.9, "span.phone.intl", 92);
    if (r.digits.startsWith("0") && nd >= 9 && nd <= 11 && /^0[1-9]/.test(r.digits)) return mk("PHONE", 0.85, "span.phone.national", 92);
    if (nd === 8 && r.digits.startsWith("4")) return mk("ACCOUNT_NUMBER", 0.6, "span.account_number.shape8", 84, true);
    if (nd === 10 && r.digits.startsWith("2")) return mk("ACCOUNT_NUMBER", 0.55, "span.account_number.shape10", 84, true);
    if (nd === 6 && r.sep && isDdmmyy(r.digits)) return mk("NATIONAL_ID", 0.6, "span.national_id.partial", 90, true);
    // fragments: a turn that is only a number continues an identifier split across turns
    if (r.whole) {
      if (r.prefix === "-" && nd >= 3 && nd <= 4) return mk("NATIONAL_ID", 0.75, "span.national_id.fragment_tail", 90);
      if (nd === 6 && isDdmmyy(r.digits)) return mk("NATIONAL_ID", 0.6, "span.national_id.fragment_head", 88, true);
      if (nd === 2 || (nd === 4 && r.sep)) return mk("NATIONAL_ID", 0.4, "span.national_id.fragment", 80, true);
      if (nd === 4 || nd === 7 || (nd === 3 && r.digits.startsWith("0"))) return mk("PHONE", 0.5, "span.phone.fragment", 80, true);
      if (nd >= 5 && nd <= 12) return mk("ACCOUNT_NUMBER", 0.35, "span.number.fragment", 70, true);
    }
    if (r.prefix === "-" && r.sep && nd === 3 && r.letters.length) return mk("NATIONAL_ID", 0.6, "span.national_id.fragment_tail", 88, true);
    return null;
  }

  // ---------------------------------------------------------------- spelled-out e-mails
  private spelledEmails(text: string, toks: Tok[], out: Cand[]): void {
    const n = toks.length;
    for (let i = 1; i < n - 2; i++) {
      const at = toks[i]!;
      if (!EMAIL_AT.has(at.low)) continue;
      // domain: label (dot label)+
      let j = i + 1;
      if (!isLabelTok(toks[j]) || !spaceGap(text, at.e, toks[j]!.s)) continue;
      let dots = 0, end = toks[j]!.e;
      while (j + 2 < n + 1 && toks[j + 1] && EMAIL_DOT.has(toks[j + 1]!.low) && isLabelTok(toks[j + 2]) && spaceGap(text, toks[j]!.e, toks[j + 1]!.s)) {
        dots++; j += 2; end = toks[j]!.e;
      }
      if (dots === 0) continue;
      // local part backwards
      let k = i - 1;
      if (!isLabelTok(toks[k]) || !spaceGap(text, toks[k]!.e, at.s) || FUNCTION_WORDS.has(toks[k]!.low) && toks[k]!.low !== "on") {
        if (!(toks[k] && isLabelTok(toks[k]) && !FUNCTION_WORDS.has(toks[k]!.low))) continue;
      }
      let start = toks[k]!.s;
      while (k - 2 >= 0 && EMAIL_JOIN.has(toks[k - 1]!.low) && isLabelTok(toks[k - 2]) && !FUNCTION_WORDS.has(toks[k - 2]!.low)
        && spaceGap(text, toks[k - 1]!.e, toks[k]!.s) && spaceGap(text, toks[k - 2]!.e, toks[k - 1]!.s)) {
        k -= 2; start = toks[k]!.s;
      }
      out.push({ start, end, label: "EMAIL", score: 0.9, ruleId: "span.email.spelled", prio: 108 });
      i = j;
    }
  }

  // ---------------------------------------------------------------- values after cue words (secrets, usernames, serials, property ids)
  private cueValues(text: string, low: string, toks: Tok[], out: Cand[]): void {
    const n = toks.length;
    for (let i = 0; i < n - 1; i++) {
      const t = toks[i]!;
      if (t.k !== K_WORD && t.k !== K_ALNUM) continue;
      if (t.low.length < 3) continue;
      const cat = valueCueCat(t.low);
      if (!cat) continue;
      let j = i + 1, hops = 0;
      while (j < n && hops < 6 && (isValueSkip(toks[j]!.low) || toks[j]!.low === "-" || toks[j]!.low === "koodi" || toks[j]!.low === "code" || toks[j]!.low === "koden" || toks[j]!.low === "wifi" || toks[j]!.low === "wifin")) { j++; hops++; }
      if (j >= n) continue;
      const v = toks[j]!;
      if (v.k === K_PUNCT) continue;
      // value = maximal non-space chunk, minus trailing sentence punctuation
      let e = v.s;
      while (e < text.length && !/\s/.test(text[e]!)) e++;
      while (e > v.s && /[.,;:?)"'\]]/.test(text[e - 1]!)) e--;
      const val = text.slice(v.s, e);
      if (val.length < 3 || val.length > 60) continue;
      if (cat === "SECRET") {
        if (!SECRET_VALUE_RX.test(val) && !(val.length >= 8 && /^[\p{L}]+$/u.test(val) && vowelShare(val) < 0.25)) continue;
        if (/^\d+$/.test(val) && (val.length < 4 || val.length > 12)) continue;
        out.push({ start: v.s, end: e, label: "SECRET", score: 0.9, ruleId: "span.secret.cue", prio: 115 });
      } else if (cat === "USER") {
        if (!USER_VALUE_RX.test(val)) continue;
        out.push({ start: v.s, end: e, label: "USERNAME", score: 0.85, ruleId: "span.username.cue", prio: 112 });
      } else if (cat === "SERIAL") {
        if ((val.match(/\d/g)?.length ?? 0) < 5) continue;
        out.push({ start: v.s, end: e, label: "DEVICE_ID", score: 0.85, ruleId: "span.device_id.serial", prio: 97 });
      }
    }
  }

  // ---------------------------------------------------------------- age
  private ages(text: string, out: Cand[]): void {
    let m: RegExpExecArray | null;
    AGE_SUFFIX_RX.lastIndex = 0;
    while ((m = AGE_SUFFIX_RX.exec(text)) !== null) {
      const a = Number(m[1]);
      if (a < 1 || a > 120) continue;
      out.push({ start: m.index, end: m.index + m[1]!.length, label: "AGE", score: 0.9, ruleId: "span.age.suffix", prio: 99 });
    }
    AGE_CUE_RX.lastIndex = 0;
    while ((m = AGE_CUE_RX.exec(text)) !== null) {
      const a = Number(m[1]);
      if (a < 2 || a > 120) continue;
      const s = m.index + m[0].length - m[1]!.length;
      out.push({ start: s, end: s + m[1]!.length, label: "AGE", score: 0.75, ruleId: "span.age.cue", prio: 99 });
    }
  }

  // ---------------------------------------------------------------- health remarks (clause-level)
  private health(text: string, low: string, out: Cand[]): void {
    HEALTH_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = -1;
    while ((m = HEALTH_RX.exec(text)) !== null) {
      if (m.index < lastEnd) continue;
      const kwS = m.index, kwE = m.index + m[0].length;
      // clause start: after the last clause boundary before the keyword
      let cs = kwS;
      while (cs > 0 && !/[.!?;:\n,(]/.test(text[cs - 1]!)) cs--;
      // a start cue such as "koska" / "because" inside the clause moves the start
      const pre = low.slice(cs, kwS);
      const cueM = /(?:koska|because|eftersom|since|sillä|kertoi|told us|berättade|hidas|slow|långsam)[,:]?\s+/giu;
      let cm: RegExpExecArray | null, cueEnd = -1;
      while ((cm = cueM.exec(pre)) !== null) cueEnd = cm.index + cm[0].length;
      if (cueEnd >= 0) cs = cs + cueEnd;
      while (cs < kwS && /\s/.test(text[cs]!)) cs++;
      // prefer the first subject word of the clause
      HEALTH_SUBJECT_RX.lastIndex = 0;
      const seg = low.slice(cs, kwS);
      let sub: RegExpExecArray | null, subAt = -1;
      while ((sub = HEALTH_SUBJECT_RX.exec(seg)) !== null) subAt = sub.index;
      if (subAt >= 0) cs = cs + subAt;
      // clause end
      let ce = kwE;
      while (ce < text.length && !/[.!?;\n]/.test(text[ce]!)) ce++;
      if (ce - cs > 110) {
        const comma = text.indexOf(",", kwE);
        ce = comma > 0 && comma < ce ? comma : Math.min(ce, kwE + 60);
      }
      while (ce > kwE && /\s/.test(text[ce - 1]!)) ce--;
      if (/aurajoki regional hospital/i.test(text.slice(cs, ce)) && !/(?:in|på|i) hospital|sairaalassa|sjukhus/i.test(text.slice(cs, ce))) continue;
      out.push({ start: cs, end: ce, label: "HEALTH", score: 0.75, ruleId: "span.health.keyword_clause", prio: 76, kwS, kwE });
      lastEnd = ce;
      HEALTH_RX.lastIndex = Math.max(HEALTH_RX.lastIndex, ce);
    }
  }

  // ---------------------------------------------------------------- organisations
  private orgs(text: string, low: string, out: Cand[]): void {
    let m: RegExpExecArray | null;
    ORG_SUFFIX_RX.lastIndex = 0;
    while ((m = ORG_SUFFIX_RX.exec(text)) !== null) {
      // drop leading cue / function words ("on", "työpaikkani", "öö") from the name part
      const wordRx = /\S+/g;
      let wm: RegExpExecArray | null, s = -1;
      while ((wm = wordRx.exec(m[1]!)) !== null) {
        const w = wm[0];
        if (FUNCTION_WORDS.has(w.toLowerCase()) || FILLERS.has(w.toLowerCase()) || ORG_LEAD_STOP.test(w)) continue;
        s = m.index + wm.index; break;
      }
      if (s < 0) continue;
      // the remaining words must not restart after a skipped word
      const e = m.index + m[0].length;
      if (/aallok/i.test(m[0])) continue; // the company itself is not an affiliation
      out.push({ start: s, end: e, label: "ORG", score: 0.85, ruleId: "span.org.legal_suffix", prio: 84 });
    }
    for (const org of KNOWN_ORGS) {
      let p = low.indexOf(org);
      while (p >= 0) {
        const e = p + org.length;
        if (!isLetter(low, p - 1) && !isLetterOrDigit(low, e) || /^(in|en)\b/.test(low.slice(e))) {
          let e2 = e;
          while (e2 < low.length && /\p{L}/u.test(low[e2]!)) e2++; // inflection: "bankin", "pohjoislinjalta"
          if (!BANK_ACCOUNT_AFTER_RX.test(low.slice(e2, e2 + 24))) out.push({ start: p, end: e2, label: "ORG", score: 0.85, ruleId: "span.org.lexicon", prio: 83 });
        }
        p = low.indexOf(org, e);
      }
    }
    ORG_WORD_RX.lastIndex = 0;
    while ((m = ORG_WORD_RX.exec(text)) !== null) {
      if (/aallok/i.test(m[0])) continue;
      const first = m[1]!.trim().split(/\s+/)[0]!.toLowerCase();
      if (FUNCTION_WORDS.has(first)) continue;
      if (BANK_ACCOUNT_AFTER_RX.test(low.slice(m.index + m[0].length, m.index + m[0].length + 24))) continue;
      out.push({ start: m.index, end: m.index + m[0].length, label: "ORG", score: 0.7, ruleId: "span.org.keyword", prio: 81 });
    }
  }

  // ---------------------------------------------------------------- places
  private places(text: string, low: string, toks: Tok[], out: Cand[]): void {
    for (let ti = 0; ti < toks.length; ti++) {
      const t = toks[ti]!;
      if (t.k !== K_WORD || t.low.length < 3) continue;
      const canon = PLACE_FORMS.get(t.low);
      if (!canon) continue;
      if (FIRST_NAME_SET.has(t.low) && !NAME_STOP_SET.has(t.low)) continue;
      if (cueKind(toks, ti) !== null) continue; // "Hei Kaarina", "Asiakas Salo"
      const pv = toks[ti - 1];
      const nt = toks[ti + 1];
      if (FIRST_NAME_SET.has(t.low) && nt && nt.k === K_WORD && SURNAME_SET.has(nt.low) && !PLACE_FORMS.has(nt.low) && spaceGap(text, t.e, nt.s)) continue; // "Kaarina Manninen"
      if (pv && pv.k === K_WORD && isCap(pv.raw) && isCap(t.raw) && FIRST_NAME_SET.has(pv.low)) continue; // a surname such as Nousiainen
      // "Turku" is mostly inside addresses (handled there) or the company context; plain mentions still count
      let s = t.s, e = t.e;
      const before = low.slice(Math.max(0, s - 20), s);
      const pm = /(mökillä|my cottage in|stugan i|stugan på|cottage in)\s+$/.exec(before);
      if (pm) s = s - pm[0].length;
      const am = /^\s+(keskustassa|asemalla|station|centrum|keskusta)/.exec(low.slice(e, e + 16));
      if (am) e = e + am[0].length;
      out.push({ start: s, end: e, label: "LOCATION", score: 0.7, ruleId: "span.location.lexicon", prio: 70 });
    }
    PLACE_PHRASE_RX.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = PLACE_PHRASE_RX.exec(text)) !== null) out.push({ start: pm.index, end: pm.index + pm[0].length, label: "LOCATION", score: 0.65, ruleId: "span.location.place_phrase", prio: 71 });
    for (const mw of MULTIWORD_PLACES) {
      let p = low.indexOf(mw);
      while (p >= 0) {
        const e = p + mw.length;
        if (!isLetter(low, p - 1) && !isLetter(low, e)) out.push({ start: p, end: e, label: "LOCATION", score: 0.7, ruleId: "span.location.lexicon", prio: 71 });
        p = low.indexOf(mw, e);
      }
    }
  }

  // ---------------------------------------------------------------- persons
  private persons(text: string, toks: Tok[], out: Cand[]): void {
    let m: RegExpExecArray | null;
    INITIALS_RX.lastIndex = 0;
    while ((m = INITIALS_RX.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, label: "PERSON", score: 0.8, ruleId: "span.person.agent_initials", prio: 75 });
    }
    const n = toks.length;
    // ASR transcripts are all lower case: there a lower-case lexicon name counts; in cased text it needs a cue
    const allLower = text === text.toLowerCase();
    for (let i = 0; i < n; i++) {
      const t = toks[i]!;
      if (t.k !== K_WORD || t.low.length < 2) continue;
      if (FUNCTION_WORDS.has(t.low) || FILLERS.has(t.low)) continue;
      const cue = cueKind(toks, i);
      if (!cue && NAME_STOP_SET.has(t.low)) continue; // ordinary word or place that is also a name
      const cap = isCap(t.raw);
      const inFirst = FIRST_NAME_SET.has(t.low);
      const inSur = SURNAME_SET.has(t.low);
      let accept = false, score = 0.6, rule = "span.person.lexicon", prio = 62;
      if (!cue && AMBIGUOUS_NAMES.has(t.low)) continue;
      if (cue && (inFirst || (inSur && cue !== "weak") || AMBIGUOUS_NAMES.has(t.low))) { accept = true; score = cue === "weak" ? 0.85 : 0.9; rule = "span.person.cue"; prio = 74; }
      else if ((cue === "open" || cue === "cap") && cap && !PLACE_FORMS.has(t.low) && looksLikeNameWord(t.low)) { accept = true; score = 0.8; rule = "span.person.cue_capitalised"; prio = 72; }
      else if (cue === "open" && t.low.length >= 3 && !PLACE_FORMS.has(t.low) && looksLikeNameWord(t.low)) { accept = true; score = 0.6; rule = "span.person.cue_unknown"; prio = 66; }
      else if (inFirst && (cap || (t.low.length >= 3 && allLower))) { accept = true; score = cap ? 0.7 : 0.55; }
      else if (inFirst && afterNameCue(toks, i, text)) { accept = true; score = 0.75; }
      else if (inSur && cap && i > 0 && !isSentenceStart(toks, i)) { accept = true; score = 0.45; rule = "span.person.surname"; prio = 58; }
      if (!accept) continue;
      let e = t.e, j = i + 1;
      // extend with up to two surname tokens
      for (let hop = 0; hop < 2 && j < n; hop++) {
        const u = toks[j]!;
        if (u.k !== K_WORD || !spaceGap(text, toks[j - 1]!.e, u.s) || FUNCTION_WORDS.has(u.low) || AFTER_NAME_CUES.has(u.low)) break;
        const uCap = isCap(u.raw);
        if (SURNAME_SET.has(u.low) || (uCap && cap && !NAME_STOP_SET.has(u.low) && !PLACE_FORMS.has(u.low) && /^[\p{Lu}][\p{Ll}'-]+$/u.test(u.raw))
          || (FIRST_NAME_SET.has(u.low) && hop === 0 && cap === uCap)) {
          e = u.e; j++;
        } else break;
      }
      out.push({ start: t.s, end: e, label: "PERSON", score, ruleId: rule, prio });
      i = j - 1;
    }
  }
}

// ------------------------------------------------------------------------------------------------ helpers
interface Run { s: number; e: number; digits: string; letters: { at: number; ch: string }[]; prefix: string; spoken: number; sep: boolean; whole: boolean }

const USER_ONLY: ReadonlySet<CueCat> = new Set(["USER"]);
/** public service numbers are not personal (emergency, health advice line, operator service lines) */
const PUBLIC_NUMBERS: ReadonlySet<string> = new Set(["112", "116117", "116111", "116123", "0800", "118", "0295"]);
/** "Saaristo Bankin tilille FI..": the bank of a refund account is not an affiliation */
const BANK_ACCOUNT_AFTER_RX = /^[\s,]*(?:(?:tota|öö|ööh|niinku|elikkä|siis|joo|um|erm)[\s,]+)*(?:ti{1,2}l{1,2}i|kont|account)/u;
function isValueSkip(w: string): boolean {
  if (VALUE_SKIP.has(w)) return true;
  return w.length >= 6 && (withinEdits(w, "probably", 2) || withinEdits(w, "varmaan", 1));
}
const ORG_LEAD_STOP = /^(?:työnantajani|työpaikkani|employer|operaattori|operator|från|from|at|i|vid|hos|nykyinen|entinen|vanha)$/i;

function charsForCompact(raw: string, compactLen: number): number {
  let c = 0;
  for (let i = 0; i < raw.length; i++) { if (!/\s/.test(raw[i]!)) c++; if (c === compactLen) return i + 1; }
  return raw.length;
}

function genericIp(ip: string): boolean {
  const p = ip.split(".").map(Number);
  const [a, b, , d] = p as [number, number, number, number];
  if (a === 0 || a === 127 || a === 255 || a >= 224) return true;
  if (ip === "8.8.8.8" || ip === "8.8.4.4" || ip === "1.1.1.1") return true;
  const priv = a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  if (priv && (d === 1 || d === 254 || d === 0 || d === 255)) return true;
  return false;
}

function vowelShare(w: string): number {
  let v = 0;
  for (const ch of w.toLowerCase()) if ("aeiouyäöå".includes(ch)) v++;
  return v / Math.max(1, w.length);
}

function lastWord(win: string): string {
  const m = /([\p{L}-]+)[^\p{L}]*$/u.exec(win);
  return m ? m[1]! : "";
}

function isLetter(s: string, i: number): boolean { return i >= 0 && i < s.length && /\p{L}/u.test(s[i]!); }
function isLetterOrDigit(s: string, i: number): boolean { return i >= 0 && i < s.length && /[\p{L}\p{N}]/u.test(s[i]!); }
function isCap(raw: string): boolean { const c = raw.charAt(0); return c !== c.toLowerCase() && c === c.toUpperCase(); }
function looksLikeNameWord(w: string): boolean { return /^[\p{L}][\p{L}'-]+$/u.test(w) && !/(?:ssa|ssä|lla|llä|sta|stä|mme|tte|isi|ään)$/u.test(w); }

function isLabelTok(t: Tok | undefined): boolean {
  return !!t && (t.k === K_WORD || t.k === K_ALNUM || t.k === K_NUM) && !EMAIL_DOT.has(t.low) && !EMAIL_AT.has(t.low);
}

function isWhole(text: string, s: number, e: number): boolean {
  for (let i = 0; i < s; i++) if (!/[\s"'(]/.test(text[i]!)) return false;
  for (let i = e; i < text.length; i++) if (!/[\s.?!,"')]/.test(text[i]!)) return false;
  return true;
}

function isSentenceStart(toks: Tok[], i: number): boolean {
  if (i === 0) return true;
  const p = toks[i - 1]!;
  return p.k === K_PUNCT && /[.!?:]/.test(p.raw);
}

/** Can a run of digits start at token i? */
function runStart(toks: Tok[], i: number, text: string): "num" | "word" | "fi" | "plus" | "sep" | "hetuTail" | null {
  const t = toks[i]!;
  const nx = toks[i + 1];
  const nextIsDigit = !!nx && spaceOrGlued(text, t.e, nx.s) && (nx.k === K_NUM || DIGIT_WORDS.has(nx.low));
  if (t.k === K_NUM) return "num";
  if (t.k === K_ALNUM && /^fi\d{2}$/i.test(t.raw)) return "fi";
  if (t.low === "fi" && nextIsDigit) return "fi";
  if (t.low === "f" && nx && nx.low === "i" && toks[i + 2] && (toks[i + 2]!.k === K_NUM || DIGIT_WORDS.has(toks[i + 2]!.low))) return "fi";
  if (t.raw === "+" && nx && nx.k === K_NUM && nx.s === t.e) return "plus";
  if ((t.raw === "-" || SEP_WORDS.has(t.low)) && (i === 0 || toks[i - 1]!.k === K_PUNCT)) {
    if (nextIsDigit) return "sep";
    if (nx && nx.s === t.e && nx.k === K_ALNUM && /^\d{3}[0-9a-y]$/i.test(nx.raw)) return "sep";
  }
  if (t.k === K_ALNUM && /^[a-fu-y]\d{3}[0-9a-y]$/i.test(t.raw)) return "hetuTail";
  const dw = DIGIT_WORDS.get(t.low);
  if (dw !== undefined && nextIsDigit && !(WEAK_DIGIT_WORDS.has(t.low) && !DIGIT_WORDS.has(nx!.low))) return "word";
  return null;
}
function spaceOrGlued(text: string, a: number, b: number): boolean {
  if (spaceGap(text, a, b)) return true;
  // "kaksi, kolme" -> comma token sits between; handled by caller loop, here allow ", " gap
  const g = text.slice(a, b);
  return /^,? {0,2}$/.test(g);
}

function valueCueCat(w: string): "SECRET" | "USER" | "SERIAL" | null {
  if (/^(salasan|password|passw|lösenord|pin-ko|pinkoodi|puk|wifi-avain|verkkoavain)/.test(w) || w === "pin") return "SECRET";
  if (/^(käyttäjätun|username|användarnamn|tunnukseni|käyttäjälle|användaren)/.test(w) || w === "tunnus") return "USER";
  if (/^(sarjanum|serial|serienummer)/.test(w)) return "SERIAL";
  if (w.length >= 5) {
    const f = fuzzyCue(w);
    if (f === "SECRET") return "SECRET";
    if (f === "USER") return "USER";
  }
  return null;
}

/** Look at the 1-3 words before token i (skipping punctuation) for a name cue. */
function cueKind(toks: Tok[], i: number): "open" | "cap" | "lex" | "weak" | null {
  const ws: string[] = [];
  let k = i - 1, punct = "";
  while (k >= 0 && ws.length < 3) {
    const t = toks[k]!;
    if (t.k === K_PUNCT) {
      if (t.raw === "-" && toks[k - 1]?.raw === "-" && ws.length === 0) return "open"; // "-- Name" signature
      if (/[.!?]/.test(t.raw) && ws.length > 0) break;
      if (ws.length === 0) punct += t.raw;
      k--; continue;
    }
    if (FILLERS.has(t.low) && t.low !== "no" && t.low !== "eli") { k--; continue; }
    ws.unshift(t.low);
    k--;
  }
  if (ws.length === 0) return null;
  const last1 = ws[ws.length - 1]!;
  const last2 = ws.length >= 2 ? `${ws[ws.length - 2]} ${last1}` : "";
  const last3 = ws.length >= 3 ? `${ws[ws.length - 3]} ${last2}` : "";
  if (last1 === "t" && punct !== ".") return null;
  if (OPEN_CUES.has(last3) || OPEN_CUES.has(last2) || OPEN_CUES.has(last1)) return "open";
  if (CAP_CUES.has(last3) || CAP_CUES.has(last2) || CAP_CUES.has(last1)) return "cap";
  if (LEX_CUES.has(last3) || LEX_CUES.has(last2) || LEX_CUES.has(last1)) return "lex";
  if (WEAK_CUES.has(last2) || WEAK_CUES.has(last1)) return "weak";
  return null;
}

function afterNameCue(toks: Tok[], i: number, text: string): boolean {
  const nx = toks[i + 1];
  return !!nx && spaceGap(text, toks[i]!.e, nx.s) && AFTER_NAME_CUES.has(nx.low);
}

export function createRulesSpanDetector(): SpanDetector { return new RulesSpanDetector(); }
