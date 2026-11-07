/**
 * Field detector: what every column contains, with evidence ids and written reasons. A port of petpilot/scan.py
 * (rules, no AI, no network) plus the full-column sweep of petpilot/inventory.py and a bounded span scan of
 * free-text columns.
 *
 * Signals, strongest first:
 *   1. value validators with checksums (HETU, IBAN, Luhn cards) and strict formats (email, phone, plate, IP, MAC...)
 *   2. cross-column checks (a column that is an unsalted hash of another, a birth date already inside a HETU)
 *   3. column-name keywords in English, Finnish and Swedish
 *   4. category values that reveal an age group or a special category (e.g. a disability discount)
 *   5. table context (a reference table of bus stops) and column statistics
 * Absence of evidence is never treated as evidence of safety: fallbacks, reference-table downgrades and unlinked
 * hashes are flagged needsReview. Evidence carries rule ids and rates only, never cell values.
 */
import type { Confidence, DatasetManifest, DetectionSet, Evidence, FieldDetection, PrivacyRole, Relationship, Subtype } from "@/contracts";
import { columnKey } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { nowIso, sha256Hex } from "@/core/util/hash";
import { md5, sha1 } from "@noble/hashes/legacy";
import { bytesToHex } from "@noble/hashes/utils";
import type { FieldDetector, SpanDetector } from "./types";
import * as V from "./validators";

export const FIELD_DETECTOR_ID = "mask.rules.fields";
export const FIELD_DETECTOR_VERSION = "1.0.0";

/** rows read per column for the value rules (petpilot: first 5000 rows, first 2000 non-empty values tested) */
export const SAMPLE_ROWS = 5000;
export const TEST_VALUES = 2000;
/** rows scanned by the span detector in a free-text column (evenly spaced, deterministic) */
export const SPAN_SCAN_ROWS = 3000;
const MATCH = 0.6;

type Role = Exclude<PrivacyRole, "unknown">;
const ROLE_ABBR: Record<Role, string> = {
  direct_identifier: "di", quasi_identifier: "qi", sensitive_attribute: "sa", technical_identifier: "ti", free_text: "ft",
  record_key: "rk", non_sensitive: "ns",
};

interface ColumnResult {
  table: string;
  column: string;
  role: Role;
  subtype: Subtype;
  reason: string;
  confidence: number;
  art9: boolean;
  links: { type: string; column: string; rate: number }[];
  ruleIds: string[];
  rates: Record<string, number>;
  fallback: boolean;
  review: boolean;
  reviewReasons: string[];
  alternatives: { role: PrivacyRole; subtype: Subtype; score: number }[];
}

// ------------------------------------------------------------------ column-name keywords
export function normName(col: string): string {
  return col.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9åäö]+/g, "_").replace(/^_+|_+$/g, "");
}

type NameRule = [RegExp, Role, Subtype, boolean, string];
const NAME_RULES: NameRule[] = ([
  // direct identifiers
  [/hetu|ssn|personal_?id|henkilotunnus|henkilötunnus|national_id|personnummer|sotu/, "direct_identifier", "NATIONAL_ID", false, "name says national ID"],
  [/(^|_)e_?mail|sahkoposti|sähköposti|(^|_)upn$|_upn$/, "direct_identifier", "EMAIL", false, "name says e-mail / login e-mail"],
  [/phone|mobile|puhelin|gsm|telefon|(^|_)tel($|_)/, "direct_identifier", "PHONE", false, "name says phone"],
  [/iban|bank_?account|tilinumero|kontonummer/, "direct_identifier", "IBAN", false, "name says bank account"],
  [/card_?pan|(^|_)pan$|card_?number|card_?masked|kortti_?nro/, "direct_identifier", "PAYMENT_CARD", false, "name says payment card"],
  [/plate|rekisteri_?nro|rekisterinumero|reg_?no/, "direct_identifier", "LICENSE_PLATE", false, "name says licence plate"],
  [/property_?id|kiinteisto/, "direct_identifier", "PROPERTY_ID", false, "name says property identifier"],
  [/(street_?)?address|osoite|adress|home_addr/, "direct_identifier", "STREET_ADDRESS", false, "name says street address"],
  [/customer_?number|asiakasnumero|client_?no/, "direct_identifier", "CUSTOMER_ID", false, "name says customer number"],
  [/contract_?(number|no)|sopimusnumero|invoice_?no/, "direct_identifier", "ACCOUNT_ID", false, "name says contract/invoice number"],
  [/learner_?id|oppijanumero/, "direct_identifier", "STUDENT_ID", false, "name says national learner number"],
  [/(^|_)(full_?)?name$|first_?names?|last_?name|surname|given_?name|display_?name|(^|_)nimi$|sukunimi|etunimi|holder_?name|guardian\d?_?name|physician_?name|author_?name|teacher_?name|agent_?name|handler_?name|reporter_?name|applicant_?name|case_?officer|sender_?display|from_name|patient_?name/,
    "direct_identifier", "PERSON_NAME", false, "name says person name"],
  // technical identifiers
  [/(^|_)ip($|_)|ip_?addr|src_?ip|dst_?ip|client_?ip|device_?ip|assigned_?ip/, "technical_identifier", "IP_ADDRESS", false, "name says IP address"],
  [/(^|_)mac($|_)/, "technical_identifier", "MAC_ADDRESS", false, "name says MAC address"],
  [/hostname|device_?name|(^|_)host$/, "technical_identifier", "HOSTNAME", false, "name says device host name"],
  [/user_?agent/, "technical_identifier", "USER_AGENT", false, "name says user agent"],
  [/imei|iccid|device_?id|serial/, "technical_identifier", "DEVICE_ID", false, "name says device identifier"],
  [/metering_?point|meter_?id|gsrn|kayttopaikka/, "technical_identifier", "METER_ID", false, "name says metering point"],
  [/(^|_)user(name)?$|login|user_?account|username|tunnus$/, "technical_identifier", "USERNAME", false, "name says user account"],
  [/reference_?(number|no)|viitenumero|account_?id/, "technical_identifier", "ACCOUNT_ID", false, "name says account / reference"],
  // quasi-identifiers
  [/birth|dob|syntym|fodelse|födelse/, "quasi_identifier", "BIRTH_DATE", false, "name says birth date"],
  [/(^|_)age($|_)|age_?band|(^|_)ika($|_)|ikä/, "quasi_identifier", "AGE", false, "name says age"],
  [/(^|_)sex$|gender|sukupuoli|kon$|kön/, "quasi_identifier", "SEX", false, "name says sex/gender"],
  [/postcode|zip|postal|postinumero|postnummer|(^|_)pc\d?$/, "quasi_identifier", "POSTCODE", false, "name says postcode"],
  [/municipality|kunta|kommun|(^|_)city$|(^|_)town$/, "quasi_identifier", "MUNICIPALITY", false, "name says municipality"],
  [/(^|_)lat($|_|itude)|(^|_)lon($|_|gitude)|(^|_)lng$/, "quasi_identifier", "GPS_COORDINATE", false, "name says coordinate"],
  [/language|kieli|språk|sprak|(^|_)lang$/, "quasi_identifier", "LANGUAGE", false, "name says language (proxy for ethnicity/region)"],
  [/nationality|citizenship|kansalaisuus/, "quasi_identifier", "NATIONALITY", false, "name says nationality"],
  [/occupation|job_?title|ammatti|tehtava|tehtävä|titel|profession/, "quasi_identifier", "OCCUPATION", false, "name says occupation"],
  [/employer|department|osasto|school_?(code|name)|workplace|tyopaikka|työpaikka|office|unit$|yksikko/, "quasi_identifier", "ORG_NAME", false, "name says employer/department/school"],
  [/station|(^|_)stop(_id)?$|car_?park|location|place|(^|_)site$|geo_?(city|country)|merchant_?(city|country)/, "quasi_identifier", "LOCATION_NAME", false, "name says a place where a person was"],
  [/(^|_)(line|route|linja|reitti)$/, "quasi_identifier", "CATEGORY", false, "name says the line/route used: narrows down where a person travelled"],
  // sensitive attributes (incl. GDPR Art. 9)
  [/icd|diagnos|(^|_)dx($|_)|disease|sairaus|diagnoosi/, "sensitive_attribute", "DIAGNOSIS_CODE", true, "name says diagnosis (Art. 9 health)"],
  [/triage|disposition|readmit|admission|los_?min|length_?of_?stay|abnormal|symptom|medication|allerg|disab|medical|health|terveys|sick|sairaus|illness|special_?support|accessibility|excused|pain|hoito/,
    "sensitive_attribute", "HEALTH_DATA", true, "name says health information (Art. 9)"],
  [/systolic|diastolic|heart_?rate|pulse|resp_?rate|spo2|(^|_)temp_?c$|blood_?pressure|(^|_)bmi($|_)|glucose/, "sensitive_attribute", "MEASUREMENT", true, "name says clinical measurement (Art. 9 health)"],
  [/religion|uskonto|union|(^|_)ay_|ammattiliitto|ethnic|migrant|second_?language|s2|sexual|political|belief|criminal|rikos/, "sensitive_attribute", "SOCIAL_DATA", true, "name says a special category (Art. 9)"],
  [/income|salary|wage|palkka|(^|_)pay(_|$)|late_?payment|payment_?(plan|default)|debt|velka|kyc|(^|_)pep|credit|cost_?estimate|balance|bonus/, "sensitive_attribute", "FINANCIAL_DATA", false, "name says personal financial data"],
  [/grade|points|arvosana|unexcused|late_?arrival/, "sensitive_attribute", "EDUCATION_DATA", false, "name says assessment results"],
  // free text
  [/note|text|description|message|comment|reason|subject|complaint|body|kuvaus|viesti|muistiinpano|selite|lisatieto|command_?line|file_?path|attachment|resolution|title|vapaa/, "free_text", "FREE_TEXT", false, "name says free text"],
  // non-sensitive helpers
  [/(^|_)(count|visits|n|total|sum|device_?count)$|_count$/, "non_sensitive", "AGGREGATE", false, "name says an aggregate count"],
  // additions beyond petpilot: operational measures that are not about a person's traits
  [/(^|_)(duration|handle_?time(_s)?|talk_?time|wait_?time|aht)$|_(s|sec|secs|seconds|ms|min|mins|minutes)$/, "non_sensitive", "DURATION", false, "name says a duration"],
  [/(^|_)(n|num|number_of)_[a-z]+$|(^|_)(seq|sequence|position|rank|order_?no|idx|index)$/, "non_sensitive", "MEASUREMENT", false, "name says a count or a sequence number"],
  [/(^|_)(csat|nps|rating|score|stars)$/, "non_sensitive", "MEASUREMENT", false, "name says a survey score"],
  [/(^|_)(bytes|bytes_(in|out|sent|received)|size|size_kb|kb|mb|gb|distance|distance_m|rssi|dbm|capacity|temperature|speed|latency|http_status|status_code|oktas|cloud_oktas|wind)(_|$)/, "non_sensitive", "MEASUREMENT", false, "name says a technical measurement"],
] as NameRule[]);

const ENTITY_SUBTYPE: [RegExp, Subtype][] = [
  [/student|learner|oppilas|opiskelija/, "STUDENT_ID"],
  [/customer|asiakas|client/, "CUSTOMER_ID"],
  [/employee|staff|physician|doctor|agent|author|teacher|nurse|handler|tyontekija|henkilo/, "EMPLOYEE_ID"],
  [/patient|potilas/, "PATIENT_ID"],
  [/card/, "CARD_ID"],
  [/account|user|reporter/, "ACCOUNT_ID"],
  [/device|bike|vehicle|ambulance/, "DEVICE_ID"],
];
const PERSONAL_ENTITIES = /student|learner|customer|asiakas|client|employee|staff|physician|doctor|agent|author|teacher|patient|potilas|card|account|user|reporter|holder|person|member|upn|mac|plate|meter|metering|hetu|visit|conversation|applicant/;
const ART9_VALUE_RX = /disab|invalid|handicap|wheelchair|blind|deaf|medical|health|illness|sick|pregnan|religio|church|union|ethnic|migrant|refugee|asylum|prison|criminal|hiv|mental|psych|therap|rehab|welfare|unemploy|reduced|hearing|visual|kuulo|näkö|vammai|pyörätuoli|sairau/;
const AGE_VALUE_RX = /(?:^|_|\b)(?:child|children|kid|youth|junior|student|senior|pensioner|elder|elderly|adult|lapsi|nuori|opiskelija|eläke|elake)(?:_|\b|$)/;
const SEX_VOCAB = new Set(["m", "f", "n", "x", "male", "female", "mies", "nainen", "man", "kvinna", "muu", "other", "u"]);
const LANG_VOCAB = new Set(["fi", "sv", "en", "ru", "et", "ar", "so", "fa", "de", "fr", "es", "uk", "fin", "swe", "eng", "suomi", "ruotsi", "englanti", "finnish", "swedish", "english", "other", "muu"]);

// ------------------------------------------------------------------ profiling (sample)
interface Profile {
  name: string;
  norm: string;
  nonnull: number;
  nunique: number;
  uniqRatio: number;
  values: string[];       // first TEST_VALUES non-empty values from the first SAMPLE_ROWS rows (trimmed)
  meanLen: number;
  spaceShare: number;
  numShare: number;
  rates: Record<string, number>;
}

function rate(vals: string[], fn: (v: string) => boolean): number {
  if (!vals.length) return 0;
  let n = 0;
  for (const v of vals) if (fn(v)) n++;
  return n / vals.length;
}

function buildProfile(name: string, col: readonly (string | null)[], stats: { nonEmpty: number; distinct: number; uniqueRatio: number }): Profile {
  const values: string[] = [];
  const lim = Math.min(col.length, SAMPLE_ROWS);
  for (let i = 0; i < lim && values.length < TEST_VALUES; i++) {
    const v = col[i];
    if (v === null || v === undefined) continue;
    const t = v.trim();
    if (t !== "") values.push(t);
  }
  const nums = values.map((v) => V.parseNumber(v));
  const numOk = nums.filter((x): x is number => x !== null);
  const numShare = values.length ? numOk.length / values.length : 0;
  const rates: Record<string, number> = {
    hetu: rate(values, V.isHetu),
    iban: rate(values, V.isIban),
    card: rate(values, V.isPaymentCard),
    email: rate(values, V.isEmail),
    phone: rate(values, V.isPhone),
    plate: rate(values, V.isPlate),
    mac: rate(values, V.isMac),
    ip: rate(values, (v) => V.ipKind(v) === "ip"),
    net: rate(values, (v) => V.ipKind(v) === "net"),
    hash: rate(values, (v) => V.hashKind(v) !== null),
    url: rate(values, V.isUrl),
    domain: rate(values, V.isDomain),
    ua: rate(values, V.isUserAgent),
    hostname: rate(values, V.isHostname),
    ts: rate(values, V.isTimestamp),
    date: rate(values, V.isDate),
    period: rate(values, V.isPeriod),
    postcode: rate(values, V.isPostcode),
    address: rate(values, V.isStreetAddress),
    person: rate(values, V.isPersonName),
    org: rate(values, V.isOrgName),
    lat: numShare > 0.9 && numOk.length ? numOk.filter(V.isLatFi).length / numOk.length : 0,
    lon: numShare > 0.9 && numOk.length ? numOk.filter(V.isLonFi).length / numOk.length : 0,
    decimals: rate(values, (v) => /[.,]\d{4,}$/.test(v)),
  };
  let len = 0, sp = 0;
  for (const v of values) { len += v.length; if (v.includes(" ")) sp++; }
  return {
    name, norm: normName(name), nonnull: stats.nonEmpty, nunique: stats.distinct, uniqRatio: stats.uniqueRatio, values,
    meanLen: values.length ? len / values.length : 0, spaceShare: values.length ? sp / values.length : 0, numShare, rates,
  };
}

// ------------------------------------------------------------------ classification of one column
type VRes = [Role, Subtype, string, number, string];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function byValues(p: Profile): VRes | null {
  const r = p.rates as Record<string, number>;
  const g = (k: string) => r[k] ?? 0;
  if (g("hetu") >= MATCH) return ["direct_identifier", "NATIONAL_ID", `${pct(g("hetu"))} of values are valid Finnish ID codes (checksum verified)`, 0.99, "val.hetu"];
  if (g("iban") >= MATCH) return ["direct_identifier", "IBAN", `${pct(g("iban"))} of values are IBANs with a valid mod-97 check`, 0.99, "val.iban"];
  if (g("card") >= MATCH && g("phone") < 0.3) return ["direct_identifier", "PAYMENT_CARD", `${pct(g("card"))} of values are payment card numbers (Luhn-valid or masked)`, 0.95, "val.payment_card"];
  if (g("email") >= MATCH) return ["direct_identifier", "EMAIL", `${pct(g("email"))} of values are e-mail addresses`, 0.97, "val.email"];
  if (g("mac") >= MATCH) return ["technical_identifier", "MAC_ADDRESS", `${pct(g("mac"))} of values are MAC addresses`, 0.97, "val.mac"];
  if (g("net") >= MATCH) return ["non_sensitive", "IP_ADDRESS", "values are network ranges (CIDR), not a person's device", 0.7, "val.ip_network"];
  if (g("ip") >= MATCH) return ["technical_identifier", "IP_ADDRESS", `${pct(g("ip"))} of values are IP addresses`, 0.95, "val.ip"];
  if (g("plate") >= MATCH) return ["direct_identifier", "LICENSE_PLATE", `${pct(g("plate"))} of values look like Finnish licence plates`, 0.9, "val.plate"];
  if ((g("phone") >= MATCH && p.numShare < 0.95) || g("phone") >= 0.8) return ["direct_identifier", "PHONE", `${pct(g("phone"))} of values are phone numbers`, 0.9, "val.phone"];
  if (g("ua") >= MATCH) return ["technical_identifier", "USER_AGENT", `${pct(g("ua"))} of values are browser user-agent strings`, 0.9, "val.user_agent"];
  if (g("url") >= MATCH) return ["free_text", "URL", "full URLs: paths and query strings can carry e-mails, tokens and names", 0.85, "val.url"];
  if (g("hash") >= MATCH) return ["technical_identifier", "OTHER", `${pct(g("hash"))} of values look like hash digests`, 0.6, "val.hash"];
  if (g("ts") >= MATCH) return ["quasi_identifier", "TIMESTAMP", `${pct(g("ts"))} of values are timestamps (exact times link to sightings, posts, receipts)`, 0.9, "val.timestamp"];
  if (g("address") >= MATCH) return ["direct_identifier", "STREET_ADDRESS", `${pct(g("address"))} of values are street addresses`, 0.85, "val.street_address"];
  if (g("person") >= MATCH && p.uniqRatio > 0.05 && p.nunique > 20) return ["direct_identifier", "PERSON_NAME", `${pct(g("person"))} of values are shaped like person names`, 0.8, "val.person_name"];
  if (g("date") >= MATCH) return ["quasi_identifier", "DATE", `${pct(g("date"))} of values are calendar dates`, 0.8, "val.date"];
  if (g("domain") >= MATCH) return ["quasi_identifier", "URL", `${pct(g("domain"))} of values are domain names (browsing behaviour)`, 0.75, "val.domain"];
  if (g("hostname") >= MATCH && p.uniqRatio > 0.01) return ["technical_identifier", "HOSTNAME", `${pct(g("hostname"))} of values look like device host names`, 0.7, "val.hostname"];
  if (g("lat") >= 0.95 && g("decimals") > 0.5) return ["quasi_identifier", "GPS_COORDINATE", "values are latitudes inside Finland with fine precision", 0.85, "val.latitude"];
  if (g("lon") >= 0.95 && g("decimals") > 0.5 && g("lat") < 0.5) return ["quasi_identifier", "GPS_COORDINATE", "values are longitudes inside Finland with fine precision", 0.85, "val.longitude"];
  if (g("org") >= MATCH) return ["quasi_identifier", "ORG_NAME", `${pct(g("org"))} of values are organisation names (employer/bank reveals affiliation)`, 0.7, "val.org_name"];
  if (p.meanLen >= 30 && p.spaceShare >= 0.7 && p.uniqRatio >= 0.2) return ["free_text", "FREE_TEXT", `long free text (avg ${Math.round(p.meanLen)} chars) can contain anything`, 0.85, "val.free_text"];
  return null;
}

type NRes = [Role, Subtype, string, boolean, string];
/** "<thing>_name" columns that name things, not people */
const NON_PERSON_NAME_RX = /(school|course|test|rule|process|merchant|subject|station|stop|street|product|file|host|device|company|org|organi[sz]ation|bank|location|place|unit|department|campaign|event|item|plan|package|app|service|network|ssid|domain|brand|shop|store|vendor|sensor|exam|team|group|project|task|type|category|model)_?name$/;

function byName(p: Profile): NRes | null {
  for (const [rx, role, st, a9, why] of NAME_RULES) {
    if (st === "PERSON_NAME" && NON_PERSON_NAME_RX.test(p.norm)) continue;
    if (rx.test(p.norm)) return [role, st, why, a9, `name.${ROLE_ABBR[role]}.${st.toLowerCase()}`];
  }
  return null;
}

function personNameConfirmed(p: Profile): boolean {
  const bare = ["name", "nimi", "namn", "name_fi", "name_sv"].includes(p.norm);
  const person = p.rates.person ?? 0;
  if (bare) return person >= 0.3 && p.nunique > 20;
  const single = p.values.length ? rate(p.values, (v) => /^[A-ZÅÄÖÉÜ][a-zåäöéüš'-]+$/.test(v)) : 0;
  return person >= 0.3 || single >= 0.6;
}

function entitySubtype(name: string, dflt: Subtype = "RECORD_ID"): Subtype {
  for (const [rx, st] of ENTITY_SUBTYPE) if (rx.test(name)) return st;
  return dflt;
}

function categorySemantics(p: Profile): [Role, Subtype, boolean, string, string] | null {
  if (p.nonnull === 0 || p.nunique > 60 || p.numShare > 0.5) return null;
  const vocab = [...new Set(p.values.map((v) => v.toLowerCase()))];
  const art9 = vocab.filter((v) => ART9_VALUE_RX.test(v));
  const age = vocab.filter((v) => AGE_VALUE_RX.test(v));
  if (art9.length) return ["quasi_identifier", "CATEGORY", true, "val.category_art9_hint",
    `${art9.length} of ${vocab.length} category values name a special-category trait (e.g. disability/health) or a proxy for one; review before any use`];
  if (age.length) return ["quasi_identifier", "CATEGORY", false, "val.category_age_proxy", `${age.length} of ${vocab.length} category values encode an age group (child/student/senior...)`];
  return null;
}

function smallVocab(p: Profile, vocab: Set<string>, share = 0.9): boolean {
  if (!p.values.length) return false;
  return rate(p.values, (v) => vocab.has(v.toLowerCase())) >= share;
}

interface Ctx { table: string; firstCol: string; reference: boolean; birthlike: Map<string, boolean> }

function res(ctx: Ctx, p: Profile, role: Role, st: Subtype, why: string, conf: number, rules: string[], extra: Partial<ColumnResult> = {}): ColumnResult {
  return {
    table: ctx.table, column: p.name, role, subtype: st, reason: why, confidence: conf, art9: false, links: [], ruleIds: [...rules],
    rates: p.rates, fallback: false, review: false, reviewReasons: [], alternatives: [], ...extra,
  };
}

function classify(p: Profile, ctx: Ctx): ColumnResult {
  const name = p.norm;
  const isFirst = ctx.firstCol === p.name;
  const vres = byValues(p);
  const nres = byName(p);
  const out = classifyInner(p, ctx, name, isFirst, vres, nres);
  // alternatives: the other readings the rules produced, for the reviewer
  const alts: ColumnResult["alternatives"] = [];
  if (vres && (vres[0] !== out.role || vres[1] !== out.subtype)) alts.push({ role: vres[0], subtype: vres[1], score: vres[3] });
  if (nres && (nres[0] !== out.role || nres[1] !== out.subtype) && !alts.some((a) => a.role === nres[0] && a.subtype === nres[1])) alts.push({ role: nres[0], subtype: nres[1], score: 0.75 });
  out.alternatives = alts;
  return out;
}

function classifyInner(p: Profile, ctx: Ctx, name: string, isFirst: boolean, vres: VRes | null, nres: NRes | null): ColumnResult {
  // 1) record key: first column, unique, named like an id
  if (isFirst && p.uniqRatio > 0.98 && /(^|_)(id|nro|no|key|ref)$|_id$/.test(name)) {
    const st = /customer|card|student/.test(name) ? entitySubtype(name) : "RECORD_ID";
    return res(ctx, p, "record_key", st, "first column, unique per row: a row key", 0.9, ["ctx.record_key"]);
  }
  // 2) strong value evidence wins for identifiers (works even with obfuscated headers)
  if (vres && (vres[0] === "direct_identifier" || vres[0] === "technical_identifier") && vres[3] >= 0.9) {
    const [role, st0, why, conf, rid] = vres;
    let st = st0;
    const rules = [rid];
    if (nres && nres[1] === "USERNAME" && st === "EMAIL") { st = "USERNAME"; rules.push(nres[4]); }
    return res(ctx, p, role, st, why, conf, rules);
  }
  // 3) other id-like columns: foreign keys to people/records
  if (/(_id|_ref|_key|_no|_nro)$|^id_/.test(name) && !(nres && nres[0] === "direct_identifier")) {
    if (/campaign/.test(name)) return res(ctx, p, "non_sensitive", "CATEGORY", "campaign label, not about a person", 0.6, ["ctx.id_column.campaign"]);
    if (/correlation|session|smtp|message/.test(name)) return res(ctx, p, "technical_identifier", "RECORD_ID", "event/session id links events together", 0.6, ["ctx.id_column.session"]);
    if (/stop|station|sensor|car_?park|zone/.test(name)) return res(ctx, p, "quasi_identifier", "LOCATION_NAME", "place id: where a person was", 0.7, ["ctx.id_column.place"]);
    if (/vehicle|bike|ambulance/.test(name)) return res(ctx, p, "non_sensitive", "DEVICE_ID", "shared vehicle id, not a person's device", 0.5, ["ctx.id_column.shared_vehicle"]);
    if (/business|y_?tunnus|org/.test(name)) return res(ctx, p, "technical_identifier", "ORG_NAME", "business id (sole traders are people)", 0.5, ["ctx.id_column.business"]);
    const st = entitySubtype(name);
    const why = ["CARD_ID", "ACCOUNT_ID", "CUSTOMER_ID", "STUDENT_ID", "PATIENT_ID", "EMPLOYEE_ID"].includes(st)
      ? "persistent id that links all records of one card/account: joins reveal a history"
      : "id that points to another record: joins reveal who did what";
    return res(ctx, p, "technical_identifier", st, why, 0.75, ["ctx.id_column.entity"]);
  }
  // 4) column-name semantics when values are not decisive
  if (nres) {
    let [role, st, why] = nres;
    const [, , , a9, rid] = nres;
    const rules = [rid];
    let review = false;
    const reasons: string[] = [];
    if (st === "PERSON_NAME" && !personNameConfirmed(p)) {
      return res(ctx, p, "non_sensitive", "CATEGORY", "name-like column whose values are not confirmed as person names (few distinct values or wrong shape); review", 0.4,
        [...rules, "val.person_name.unconfirmed"], { fallback: true });
    }
    if (role === "free_text" && vres && (vres[1] === "TIMESTAMP" || vres[1] === "DATE")) {
      // "note_date": the name mentions text but the values are dates
      role = vres[0]; st = vres[1]; why = vres[2]; rules.push(vres[4]);
    } else if (vres && vres[0] === "free_text" && role !== "free_text" && role !== "sensitive_attribute") {
      role = vres[0]; st = vres[1]; why = vres[2]; rules.push(vres[4]);
    } else if (vres && vres[0] === role) {
      rules.push(vres[4]);
    } else if (role === "sensitive_attribute" || role === "quasi_identifier") {
      review = true; reasons.push("only the column name supports this reading");
    }
    if (role === "quasi_identifier" && ["MUNICIPALITY", "POSTCODE", "LOCATION_NAME", "GPS_COORDINATE"].includes(st) && ctx.reference) {
      role = "non_sensitive"; why += "; but this is a reference table about places, not people"; review = true; rules.push("ctx.reference_table");
      reasons.push("reference table: no column points at a person");
    }
    if (st === "AGE" && (p.rates.date ?? 0) >= MATCH) st = "BIRTH_DATE";
    return res(ctx, p, role, st, why, 0.75, rules, { art9: a9, review, reviewReasons: reasons });
  }
  // 5) category values that reveal a special category or an age group
  const cat = categorySemantics(p);
  if (cat) {
    const [role, st, a9, rid, why] = cat;
    return res(ctx, p, role, st, why, 0.7, [rid], { art9: a9, review: true, reviewReasons: ["category values hint at a special category or age group"] });
  }
  // 6) remaining value evidence (QIs, text, coordinates, dates)
  if (vres) {
    const [role, st0, why0, conf, rid] = vres;
    let st = st0, why = why0;
    const rules = [rid];
    if (st === "DATE" && ctx.birthlike.get(p.name)) { st = "BIRTH_DATE"; why += "; spread like birth dates"; rules.push("val.date.birthlike_spread"); }
    return res(ctx, p, role, st, why, conf, rules);
  }
  // 7) small vocabularies
  if (smallVocab(p, SEX_VOCAB) && p.nunique <= 4) return res(ctx, p, "quasi_identifier", "SEX", "values are a sex/gender code", 0.7, ["vocab.sex"]);
  if (smallVocab(p, LANG_VOCAB) && p.nunique <= 12) return res(ctx, p, "quasi_identifier", "LANGUAGE", "values are language codes", 0.7, ["vocab.language"]);
  if ((p.rates.postcode ?? 0) >= MATCH && p.nunique > 5 && rate(p.values, (v) => /^\d{5}$/.test(v)) >= 0.5) return res(ctx, p, "quasi_identifier", "POSTCODE", "values are 5-digit postcodes", 0.7, ["val.postcode"]);
  if ((p.rates.period ?? 0) >= MATCH) return res(ctx, p, "non_sensitive", "DATE", "values are periods (month/term/year)", 0.5, ["val.period"]);
  // 7b) (addition beyond petpilot) boolean flags and low-cardinality labels with no special-category or age vocabulary:
  //     best guess non_sensitive, low confidence, so they are still reviewed
  if (p.values.length && rate(p.values, (v) => /^(true|false|yes|no|kyllä|ei|ja|nej|0|1|t|f|y|n)$/i.test(v)) >= 0.98 && p.nunique <= 3) {
    return res(ctx, p, "non_sensitive", "CATEGORY", "boolean flag with no recognised sensitive meaning; review", 0.55, ["vocab.boolean_flag"], { review: true, reviewReasons: ["flag meaning not recognised"] });
  }
  if (p.numShare < 0.5 && p.nunique > 0 && p.nunique <= 30 && p.nonnull >= 3 * p.nunique && p.meanLen <= 40) {
    return res(ctx, p, "non_sensitive", "CATEGORY", `low-cardinality label (${p.nunique} values) with no special-category or age vocabulary; review`, 0.55,
      ["vocab.low_cardinality_category"], { review: true, reviewReasons: ["category meaning not recognised"] });
  }
  // 8) fallback by shape: nothing positive found. Reported as role "unknown", never as safe.
  if (p.numShare > 0.95) {
    return res(ctx, p, "non_sensitive", "MEASUREMENT", "numbers with no recognised meaning; review (could still be salary, a health score...)", 0.4, ["fallback.numeric"], { fallback: true });
  }
  return res(ctx, p, "non_sensitive", "CATEGORY", "values with no recognised meaning; review (short codes can still encode sensitive traits)", 0.4, ["fallback.category"], { fallback: true });
}

// ------------------------------------------------------------------ table level
function birthlike(p: Profile): boolean {
  if ((p.rates.date ?? 0) < MATCH) return false;
  const years: number[] = [];
  for (const v of p.values) { const d = V.parseDate(v); if (d) years.push(Number(d.slice(0, 4))); }
  if (years.length < 10) return false;
  const mn = Math.min(...years), mx = Math.max(...years);
  return mn < 1975 && mx < 2012 && mx - mn > 30;
}

function personSignal(cols: string[], profiles: Map<string, Profile>): boolean {
  const all = [...profiles.values()];
  for (const c of cols) {
    const p = profiles.get(c)!;
    const v = byValues(p);
    let n = byName(p);
    if ((v && v[0] === "direct_identifier") || (v && v[0] === "technical_identifier" && v[1] !== "OTHER")) return true;
    if (n && n[1] === "PERSON_NAME" && !personNameConfirmed(p)) n = null;
    if (n && ["direct_identifier", "technical_identifier", "sensitive_attribute", "free_text"].includes(n[0])) return true;
    if (n && ["BIRTH_DATE", "AGE", "SEX", "LANGUAGE"].includes(n[1])) return true;
    if (c !== cols[0] && /_id$/.test(p.norm) && PERSONAL_ENTITIES.test(p.norm)) return true;
    if ((p.rates.ts ?? 0) >= MATCH && c !== cols[0] && all.some((q) => /_id$/.test(q.norm) && PERSONAL_ENTITIES.test(q.norm))) return true;
    if (categorySemantics(p)) return true;
  }
  return false;
}

const HASHERS: [string, (s: string) => string][] = [
  ["sha256", (s) => sha256Hex(s)],
  ["sha1", (s) => bytesToHex(sha1(new TextEncoder().encode(s)))],
  ["md5", (s) => bytesToHex(md5(new TextEncoder().encode(s)))],
];

function hetuVariants(v: string): string[] {
  const m = /^(\d{6})([-+A-FU-Y]?)(\d{3}[0-9A-Y])$/.exec(v.trim().toUpperCase().replace(/ /g, ""));
  if (!m) return [];
  const out = new Set([v.trim(), v.trim().toUpperCase()]);
  const signs = new Set([m[2] || "-", "-", "A"]);
  for (const s of signs) out.add(`${m[1]}${s}${m[3]}`);
  out.add(`${m[1]}${m[3]}`);
  return [...out].sort();
}

function crossColumn(t: TableData, profiles: Map<string, Profile>, results: ColumnResult[]): void {
  const byCol = new Map(results.map((r) => [r.column, r]));
  const colData = (c: string) => t.data[t.columns.indexOf(c)] ?? [];
  // (a) a hash column that is just hash(another column)
  for (const r of results) {
    const p = profiles.get(r.column)!;
    if ((p.rates.hash ?? 0) < MATCH) continue;
    const target = colData(r.column);
    const rows: number[] = [];
    for (let i = 0; i < target.length && rows.length < 300; i++) if (target[i] && target[i]!.trim()) rows.push(i);
    let best: { rate: number; other: string } | null = null;
    for (const other of t.columns) {
      if (other === r.column || (profiles.get(other)!.rates.hash ?? 0) >= MATCH) continue;
      const od = colData(other);
      let hits = 0;
      for (const i of rows) {
        const v = od[i];
        if (v === null || v === undefined || v.trim() === "") continue;
        const tv = target[i]!.trim().toLowerCase();
        const cands = new Set(hetuVariants(v).length ? hetuVariants(v) : [v.trim()]);
        for (const c of [...cands]) cands.add(c.toLowerCase());
        let hit = false;
        for (const c of cands) { for (const [, h] of HASHERS) if (h(c) === tv) { hit = true; break; } if (hit) break; }
        if (hit) hits++;
      }
      const rr = hits / Math.max(rows.length, 1);
      if (!best || rr > best.rate) best = { rate: rr, other };
    }
    if (best && best.rate >= 0.2) {
      const orow = byCol.get(best.other)!;
      r.role = orow.role === "direct_identifier" || orow.role === "technical_identifier" ? orow.role : "technical_identifier";
      r.subtype = orow.subtype;
      r.reason = `reversible: ${pct(best.rate)} of the first ${rows.length} values are an unsalted hash of '${best.other}' (an attacker hashes candidate values and matches them)`;
      r.confidence = 0.95; r.fallback = false;
      r.ruleIds.push("xcol.hash_of");
      r.links.push({ type: "hash_of", column: best.other, rate: Number(best.rate.toFixed(3)) });
    } else {
      r.role = "technical_identifier"; r.subtype = "OTHER";
      r.reason = "hash-like digests; no link to another column found in the sample (that does not make them safe); review";
      r.review = true; r.reviewReasons.push("hash-like values with no link found in the sample");
      r.ruleIds.push("xcol.hash_unlinked");
    }
  }
  // (b) a date column that equals the birth date inside a HETU column
  const hetuCols = results.filter((r) => r.subtype === "NATIONAL_ID" && r.role === "direct_identifier").map((r) => r.column);
  for (const h of hetuCols) {
    const hd = colData(h);
    for (const r of results) {
      if (r.column === h || (profiles.get(r.column)!.rates.date ?? 0) < MATCH) continue;
      const dd = colData(r.column);
      let both = 0, eq = 0;
      for (let i = 0; i < hd.length && both < 2000; i++) {
        const a = hd[i] ? V.hetuBirthdate(hd[i]!) : null;
        const b = dd[i] ? V.parseDate(dd[i]!) : null;
        if (!a || !b) continue;
        both++; if (a === b) eq++;
      }
      if (both >= 20 && eq / both > 0.8) {
        r.role = "quasi_identifier"; r.subtype = "BIRTH_DATE";
        r.reason = `same as the birth date encoded in '${h}' (${pct(eq / both)} match)`;
        r.ruleIds.push("xcol.encoded_in_hetu");
        r.links.push({ type: "encoded_in", column: h, rate: Number((eq / both).toFixed(3)) });
      }
    }
  }
}

export function scanTable(t: TableData, stats: Map<string, { nonEmpty: number; distinct: number; uniqueRatio: number }>): ColumnResult[] {
  const profiles = new Map<string, Profile>();
  t.columns.forEach((c, i) => profiles.set(c, buildProfile(c, t.data[i] ?? [], stats.get(c) ?? { nonEmpty: 0, distinct: 0, uniqueRatio: 0 })));
  const ctx: Ctx = {
    table: t.name, firstCol: t.columns[0] ?? "", reference: !personSignal(t.columns, profiles),
    birthlike: new Map([...profiles].map(([c, p]) => [c, birthlike(p)])),
  };
  const results = t.columns.map((c) => classify(profiles.get(c)!, ctx));
  if (ctx.reference) {
    for (const r of results) {
      if (r.role === "record_key") continue;
      r.role = "non_sensitive";
      r.reason += " (reference table: no column points at a person; review)";
      r.review = true;
      if (!r.reviewReasons.includes("reference table: no column points at a person")) r.reviewReasons.push("reference table: no column points at a person");
      if (!r.ruleIds.includes("ctx.reference_table")) r.ruleIds.push("ctx.reference_table");
    }
  }
  crossColumn(t, profiles, results);
  return results;
}

// ------------------------------------------------------------------ full-column sweep (petpilot/inventory.py)
const SWEEP_PATTERNS: [string, RegExp][] = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["national_id", /\b\d{6}[-+A-FU-Y]?\d{3}[0-9A-Y]\b/],
  ["iban", /\b[A-Z]{2}\d{2}(?: ?[0-9A-Z]{4}){3,7}\b/],
  ["phone", /(?:\+358|\b0)\d{1,2}[ -]?\d{3}[ -]?\d{3,4}\b/],
  ["plate", /\b[A-ZÅÄÖ]{2,3}-\d{1,3}\b/],
];

export function sweepColumn(col: readonly (string | null)[]): { rows: number; found: Record<string, number> } {
  const found: Record<string, number> = {};
  for (const [k] of SWEEP_PATTERNS) found[k] = 0;
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    if (!v || v.length <= 5) continue;
    for (const [k, rx] of SWEEP_PATTERNS) if (rx.test(v)) found[k]!++;
  }
  for (const k of Object.keys(found)) if (!found[k]) delete found[k];
  return { rows: col.length, found };
}

// ------------------------------------------------------------------ detector
function certainty(r: ColumnResult): Confidence {
  if (r.fallback) return "unknown";
  if (r.confidence >= 0.9) return "high";
  if (r.confidence >= 0.7) return "medium";
  return "low";
}

function isTextColumn(role: PrivacyRole, stats: { meanLength: number; spaceShare: number }, inferred: string): boolean {
  return role === "free_text" || (inferred === "string" && stats.meanLength >= 40 && stats.spaceShare >= 0.5);
}

export class RulesFieldDetector implements FieldDetector {
  readonly id = FIELD_DETECTOR_ID;
  readonly version = FIELD_DETECTOR_VERSION;

  detectFields(tables: TableData[], manifest: DatasetManifest, spans: SpanDetector, onProgress?: (done: number, total: number, message?: string) => void): DetectionSet {
    const fields: FieldDetection[] = [];
    const total = tables.reduce((n, t) => n + t.columns.length, 0);
    let done = 0;
    const relsByCol = new Map<string, Relationship[]>();
    for (const r of manifest.relationships) for (const k of [columnKey(r.from), columnKey(r.to)]) relsByCol.set(k, [...(relsByCol.get(k) ?? []), r]);

    for (const t of tables) {
      const tm = manifest.tables.find((x) => x.name === t.name);
      const stats = new Map((tm?.columns ?? []).map((c) => [c.name, c.stats]));
      const results = scanTable(t, stats);
      for (const r of results) {
        const ci = t.columns.indexOf(r.column);
        const col = t.data[ci] ?? [];
        const cm = tm?.columns.find((c) => c.name === r.column);
        const evidence: Evidence[] = r.ruleIds.map((rid, k) => ({ ruleId: rid, description: k === 0 ? r.reason : ruleDescription(rid), matchRate: matchRateFor(rid, r) }));
        const reviewReasons = [...r.reviewReasons];
        let role: PrivacyRole = r.fallback ? "unknown" : r.role;
        let subtype = r.subtype;
        let conf: Confidence = certainty(r);
        let score = r.confidence;
        if (r.fallback) reviewReasons.push("no rule matched: role unknown, not evidence of safety");
        if (r.art9) reviewReasons.push("special category (GDPR Art. 9) hint");
        if (conf === "low") reviewReasons.push("low rule confidence");
        // full-column sweep over every row of non-direct-identifier columns
        if (role !== "direct_identifier") {
          const sw = sweepColumn(col);
          const kinds = Object.keys(sw.found);
          if (kinds.length) {
            evidence.push({
              ruleId: "sweep.identifier_shaped_values",
              description: `full-column sweep of ${sw.rows} rows found ${kinds.map((k) => `${sw.found[k]} ${k}-shaped value(s)`).join(", ")}`,
              matchRate: Number((Math.max(...kinds.map((k) => sw.found[k]!)) / Math.max(1, sw.rows)).toFixed(4)),
            });
            reviewReasons.push(`identifier-shaped values found in a full-column sweep (${kinds.join(", ")})`);
            if (sw.found.email && (role === "unknown" || role === "non_sensitive" || role === "record_key")) {
              role = "direct_identifier"; subtype = "EMAIL"; conf = "low"; score = Math.min(score, 0.5);
              evidence.push({ ruleId: "sweep.direct_identifier", description: "treated as a direct identifier (one address can name a person)" });
            }
          } else {
            evidence.push({ ruleId: "sweep.clean", description: `full-column sweep of ${sw.rows} rows found no e-mail, ID-code, IBAN, phone or plate shapes`, matchRate: 0 });
          }
        }
        // span scan for free-text columns
        let spanSummary: FieldDetection["spanSummary"];
        if (cm && isTextColumn(role, cm.stats, cm.inferredType)) {
          spanSummary = scanSpans(col, spans, r.column);
          evidence.push({
            ruleId: "span.scan",
            description: `span detector ${spans.id}@${spans.version} scanned ${spanSummary.rowsScanned} non-empty rows (evenly spaced over ${col.length} rows); ${spanSummary.rowsWithSpans} contained PII spans`,
            matchRate: spanSummary.rowsScanned ? Number((spanSummary.rowsWithSpans / spanSummary.rowsScanned).toFixed(4)) : 0,
          });
          if (role !== "free_text" && spanSummary.rowsWithSpans > 0 && (role === "unknown" || role === "non_sensitive")) {
            reviewReasons.push("long text values contain PII spans");
          }
          if (spanSummary.rowsWithSpans > 0 && role === "free_text") reviewReasons.push("free text contains PII spans: redact before sharing");
        }
        const needsReview = r.fallback || r.review || r.art9 || conf === "low" || conf === "unknown" || reviewReasons.length > 0;
        const rels = relsByCol.get(columnKey({ table: t.name, column: r.column })) ?? [];
        fields.push({
          id: `det:${t.name}.${r.column}`, kind: "field", ref: { table: t.name, column: r.column }, role, subtype, art9: r.art9, confidence: conf,
          score: Number(score.toFixed(3)), evidence, needsReview, reviewReasons: [...new Set(reviewReasons)], relationships: rels.map((x) => x.id).sort(),
          alternatives: r.alternatives.filter((a) => a.role !== role || a.subtype !== subtype),
          ...(spanSummary ? { spanSummary } : {}),
          detector: { id: this.id, version: this.version },
        });
        onProgress?.(++done, total, `${t.name}.${r.column}`);
      }
    }
    return { version: 1, inputHash: manifest.inputHash, fields, createdAt: nowIso() };
  }
}

function scanSpans(col: readonly (string | null)[], spans: SpanDetector, column: string): NonNullable<FieldDetection["spanSummary"]> {
  const idx: number[] = [];
  for (let i = 0; i < col.length; i++) { const v = col[i]; if (v && v.trim()) idx.push(i); }
  const step = idx.length > SPAN_SCAN_ROWS ? idx.length / SPAN_SCAN_ROWS : 1;
  const byLabel: Record<string, number> = {};
  let scanned = 0, withSpans = 0;
  for (let k = 0; k < idx.length && scanned < SPAN_SCAN_ROWS; k++) {
    const i = idx[Math.floor(k * step)];
    if (i === undefined) break;
    const s = spans.detect(col[i]!, { column });
    scanned++;
    if (s.length) withSpans++;
    for (const d of s) byLabel[d.label] = (byLabel[d.label] ?? 0) + 1;
  }
  return { rowsScanned: scanned, rowsWithSpans: withSpans, byLabel, detectorId: spans.id, detectorVersion: spans.version };
}

const RATE_KEY: Record<string, string> = {
  "val.hetu": "hetu", "val.iban": "iban", "val.payment_card": "card", "val.email": "email", "val.mac": "mac", "val.ip_network": "net",
  "val.ip": "ip", "val.plate": "plate", "val.phone": "phone", "val.user_agent": "ua", "val.url": "url", "val.hash": "hash",
  "val.timestamp": "ts", "val.street_address": "address", "val.person_name": "person", "val.date": "date", "val.domain": "domain",
  "val.hostname": "hostname", "val.latitude": "lat", "val.longitude": "lon", "val.org_name": "org", "val.postcode": "postcode", "val.period": "period",
};
function matchRateFor(rid: string, r: ColumnResult): number | undefined {
  const k = RATE_KEY[rid];
  if (k) return Number((r.rates[k] ?? 0).toFixed(4));
  const link = r.links.find((l) => (rid === "xcol.hash_of" && l.type === "hash_of") || (rid === "xcol.encoded_in_hetu" && l.type === "encoded_in"));
  return link?.rate;
}
function ruleDescription(rid: string): string {
  if (rid.startsWith("name.")) return "column name keyword (en/fi/sv)";
  if (rid.startsWith("val.")) return "value validator agrees";
  if (rid === "ctx.reference_table") return "reference table: no column points at a person";
  if (rid === "xcol.hash_of") return "values are unsalted hashes of another column";
  if (rid === "xcol.encoded_in_hetu") return "values equal the birth date encoded in a national ID column";
  if (rid === "xcol.hash_unlinked") return "hash-like values with no link found";
  return rid;
}
