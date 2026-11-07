/**
 * Value-level validators, ported from petpilot/validators.py.
 * Each answers "does this single value look like (and check out as) a given kind of identifier?".
 * Pure functions; regexes compiled once at module load.
 */

// ---------------------------------------------------------------- Finnish personal identity code (HETU)
export const HETU_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY";
const HETU_RX = /^(\d{2})(\d{2})(\d{2})([-+A-FU-Y]?)(\d{3})([0-9A-Y])$/;
const CENTURY: Record<string, number> = {
  "+": 1800, "-": 1900, U: 1900, V: 1900, W: 1900, X: 1900, Y: 1900, A: 2000, B: 2000, C: 2000, D: 2000, E: 2000, F: 2000,
};

function hetuMatch(v: string): RegExpExecArray | null {
  return HETU_RX.exec(v.trim().toUpperCase().replace(/ /g, ""));
}

/** HETU check character for the 9 digits ddmmyynnn. */
export function hetuCheckChar(nineDigits: string): string {
  return HETU_CHECK[Number(nineDigits) % 31] ?? "";
}

/** Full HETU, with or without the century sign, with a valid check character. */
export function isHetu(v: string): boolean {
  const m = hetuMatch(v);
  if (!m) return false;
  const [, dd, mm, yy, , nnn, chk] = m as unknown as string[];
  const d = Number(dd), mo = Number(mm);
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return false;
  return hetuCheckChar(`${dd}${mm}${yy}${nnn}`) === chk;
}

export function hetuBirthdate(v: string): string | null {
  const m = hetuMatch(v);
  if (!m) return null;
  const [, dd, mm, yy, sign, ,] = m as unknown as string[];
  const y = Number(yy);
  const century = CENTURY[sign ?? ""] ?? (y > 25 ? 1900 : 2000);
  return validYmd(century + y, Number(mm), Number(dd));
}

/** ddmmyy is a plausible date (used for partial HETU fragments). */
export function isDdmmyy(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false;
  const d = Number(s.slice(0, 2)), m = Number(s.slice(2, 4));
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
}

// ---------------------------------------------------------------- banking
export function isIban(v: string): boolean {
  const s = v.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  return ibanMod97(s) === 1;
}

function ibanMod97(s: string): number {
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (let i = 0; i < re.length; i++) {
    const c = re.charCodeAt(i);
    if (c >= 48 && c <= 57) rem = (rem * 10 + (c - 48)) % 97;
    else rem = (rem * 100 + (c - 55)) % 97; // A=10 .. Z=35
  }
  return rem;
}

export function luhnOk(digits: string): boolean {
  let total = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    total += d; alt = !alt;
  }
  return total % 10 === 0;
}

export function isPaymentCard(v: string): boolean {
  const s = v.replace(/[\s-]/g, "");
  if (/^\d{13,19}$/.test(s)) {
    // major-industry digit 2-6 (Mastercard 2/5, Amex 3, Visa 4, Discover/UnionPay 6)
    return "23456".includes(s[0] ?? "") && luhnOk(s);
  }
  // masked forms: 411111******1111, **** **** **** 1234, XXXX-1234
  return /^[\d*Xx•]{8,19}$/.test(s) && /[*Xx•]/.test(s) && s.replace(/\D/g, "").length >= 4;
}

// ---------------------------------------------------------------- contact
const EMAIL_RX = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/u;
export function isEmail(v: string): boolean { return EMAIL_RX.test(v.trim()); }

export function isPhone(v: string): boolean {
  const s = v.trim().replace(/[\s()./-]/g, "");
  return /^(\+358|00358|0)\d{6,11}$/.test(s) || /^\+\d{8,14}$/.test(s);
}

// ---------------------------------------------------------------- vehicles, network, devices
export function isPlate(v: string): boolean { return /^[A-ZÅÄÖ]{2,3}-\d{1,3}$/.test(v.trim().toUpperCase()); }
export function isMac(v: string): boolean { return /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/.test(v.trim()); }

export function isIpv4(s: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) { const n = Number(m[i]); if (n > 255 || (m[i]!.length > 1 && m[i]![0] === "0")) return false; }
  return true;
}
function isIpv6(s: string): boolean {
  if (!/^[0-9A-Fa-f:]+$/.test(s) || !s.includes(":")) return false;
  const dbl = s.split("::");
  if (dbl.length > 2) return false;
  const groups = s.split(":").filter((g) => g !== "");
  if (groups.some((g) => g.length > 4)) return false;
  return dbl.length === 2 ? groups.length < 8 : groups.length === 8;
}

/** 'ip' for an address, 'net' for a CIDR range, null otherwise. */
export function ipKind(v: string): "ip" | "net" | null {
  const s = v.trim();
  if (isIpv4(s) || isIpv6(s)) return "ip";
  const slash = s.indexOf("/");
  if (slash > 0) {
    const a = s.slice(0, slash), p = s.slice(slash + 1);
    if (/^\d{1,3}$/.test(p) && (isIpv4(a) || isIpv6(a))) return "net";
  }
  return null;
}

export function hashKind(v: string): string | null {
  const s = v.trim();
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  return ({ 32: "md5", 40: "sha1", 64: "sha256" } as Record<number, string>)[s.length] ?? null;
}

export function isUrl(v: string): boolean { return /^(https?|ftp):\/\/\S+$/i.test(v.trim()); }

export function isDomain(v: string): boolean {
  const s = v.trim().toLowerCase().replace(/\.$/, "");
  return !/[ @/]/.test(s) && /^([a-z0-9-]+\.)+[a-z]{2,24}$/.test(s);
}

export function isUserAgent(v: string): boolean {
  const s = v.trim();
  return s.startsWith("Mozilla/") || /^[\w.-]+\/[\d.]+ \(/.test(s);
}

/** Corporate device names such as LT-AINVIR-0423 or WS-FIN-112. */
export function isHostname(v: string): boolean {
  return /^[A-Z]{2,4}-[A-Z0-9]{2,10}(-[A-Z0-9]{2,10}){0,2}$/.test(v.trim().toUpperCase()) && /\d/.test(v);
}

// ---------------------------------------------------------------- time
const TS_RXS = [
  /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  /^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}[:.]\d{2}(:\d{2})?$/,
];
const DATE_RXS: [RegExp, "ymd" | "dmy"][] = [
  [/^(\d{4})-(\d{2})-(\d{2})$/, "ymd"],
  [/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, "dmy"],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, "dmy"],
  [/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, "dmy"],
  [/^(\d{4})(\d{2})(\d{2})$/, "ymd"],
];
const PERIOD_RXS = [/^\d{4}-\d{2}$/, /^\d{4}-W\d{1,2}$/, /^\d{4}-\d{2}\/\d$/, /^\d{4}[/-]\d{4}$/, /^(19|20)\d{2}$/, /^\d{4}-?(Q|H)[1-4]$/, /^(K|S)\d{4}$|^\d{4}(K|S)$/];

export function isTimestamp(v: string): boolean { const s = v.trim(); return TS_RXS.some((r) => r.test(s)); }

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  if (d > dim) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO date (yyyy-mm-dd) or null. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  for (const [rx, order] of DATE_RXS) {
    const m = rx.exec(s);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
    if (order === "ymd") return validYmd(a, b, c);
    let y = c;
    if (m[3]!.length <= 2) y += y > 25 ? 1900 : 2000;
    return validYmd(y, b, a);
  }
  return null;
}
export function isDate(v: string): boolean { return parseDate(v) !== null; }
export function isPeriod(v: string): boolean { const s = v.trim(); return PERIOD_RXS.some((r) => r.test(s)); }

/** ISO-ish sortable string for a timestamp or date value, or null. */
export function parseTemporal(v: string): { iso: string; hasTime: boolean } | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const d = validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (!d) return null;
    return { iso: `${d}T${m[4]!.padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`, hasTime: true };
  }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2})[:.](\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const d = validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
    if (!d) return null;
    return { iso: `${d}T${m[4]!.padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`, hasTime: true };
  }
  const d = parseDate(s);
  return d ? { iso: d, hasTime: false } : null;
}

// ---------------------------------------------------------------- places
export function isPostcode(v: string): boolean { return /^(\d{5}|\d{3}\*\*|\d{3})$/.test(v.trim()); }

const STREET_SUFFIX = /(katu|tie|kuja|polku|väylä|vayla|rinne|mäki|maki|kaari|ranta|puisto|aukio|tori|raitti|piha|tanhua|linja|ahde|gatan|vägen|gränd|stigen|backen|street|road|lane|avenue)/;
const ADDR_RX = /^[A-ZÅÄÖ][\wåäöÅÄÖé.'-]*(\s[\wåäöÅÄÖé.'-]+){0,3}\s\d{1,4}(\s?[A-Za-z]{1,2}(\s?\d{1,3})?)?(,?\s*\d{5}(\s+[\wåäöÅÄÖ\s-]+)?)?$/u;
export function isStreetAddress(v: string): boolean {
  const s = v.trim();
  return ADDR_RX.test(s) && (STREET_SUFFIX.test(s.toLowerCase()) || /,\s*\d{5}/.test(s));
}

const NAME_PART = "[A-ZÅÄÖÉÜ][a-zåäöéüš'-]+";
const NAME_RX = new RegExp(`^${NAME_PART}(?:[ -]${NAME_PART}){1,3}$`, "u");
const UPPER_NAME_RX = new RegExp(`^[A-ZÅÄÖÉÜ'-]{2,}(?: (?:${NAME_PART}|[A-ZÅÄÖÉÜ'-]{2,})){1,3}$`, "u");
const INITIAL_NAME_RX = new RegExp(`^[A-ZÅÄÖ]\\. ?${NAME_PART}$`, "u");
const ORG_SUFFIX_RX = /\b(Oy|Oyj|Ab|Abp|Ltd|ry|Inc|GmbH|AS|AB|Ky|Tmi|plc|LLC|Bank|Pankki)\.?$/i;

export function isOrgName(v: string): boolean { return ORG_SUFFIX_RX.test(v.trim()); }
export function isPersonName(v: string): boolean {
  const s = v.trim();
  if (/\d/.test(s) || isOrgName(s)) return false;
  return NAME_RX.test(s) || UPPER_NAME_RX.test(s) || INITIAL_NAME_RX.test(s);
}

export const isLatFi = (x: number): boolean => x >= 59.0 && x <= 70.5;
export const isLonFi = (x: number): boolean => x >= 19.0 && x <= 31.6;

/** Parse a number the way pandas.to_numeric would after replacing ',' with '.' and dropping whitespace. */
export function parseNumber(v: string): number | null {
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (s === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
