/**
 * DEVELOPMENT FIXTURE DATA. Synthetic, hand-written. Nothing here is measured.
 * Customer-service shape: customers / conversations / turns.
 * Text spans are marked inline as {LABEL|value} and parsed into offsets at load time.
 */
import type { SpanDetection, SpanLabel } from "@/contracts";

export interface FixtureTable { name: string; columns: string[]; rows: (string | null)[][] }

export const customers: FixtureTable = {
  name: "customers",
  columns: ["customer_id", "full_name", "hetu", "postcode", "city", "email", "phone", "customer_since"],
  rows: [
    ["C000044", "Ksenia Sokolova", "020782-918P", "20300", "Turku", "ksenia.sokolova@kotiposti.example", "+358503403608", "2013-09-19"],
    ["C000123", "Mika Leppäharju", "210667-961N", "23600", "Uusikaupunki", "mika.l@nordmail.example", "+358503920945", "2005-02-08"],
    ["C000148", "Esa Oravalehto", "311064-9219", "23500", "Uusikaupunki", "esa.oravalehto@webmail.example", "+358416555544", "2005-05-04"],
    ["C000201", "Carmen López", "110168-9846", "24130", "Salo", "carmen_lopez@nordmail.example", "+358463564643", "2008-03-09"],
    ["C000215", "Aino Virtanen", "150391-124H", "20100", "Turku", "aino.virtanen@kotiposti.example", "+358401234567", "2019-11-02"],
    ["C000233", "Jari Mäkelä", "040455-031S", "21200", "Raisio", null, "+358442220198", "1999-06-21"],
    ["C000250", "Liisa Korhonen", "270886-662C", "20540", "Turku", "liisa.k@webmail.example", "+358505551203", "2016-01-15"],
    ["C000267", "Omar Haddad", "091299-905T", "20810", "Turku", "omar.haddad@nordmail.example", "+358465550111", "2021-08-30"],
    ["C000281", "Tuula Heinonen", "180549-2304", "24100", "Salo", null, "+358405550987", "2001-04-11"],
    ["C000294", "Pekka Laine", "230272-117U", "23500", "Uusikaupunki", "pekka.laine@kotiposti.example", "+358505550345", "2010-10-05"],
    ["C000302", "Sofia Nieminen", "120704A0626", "20300", "Turku", "sofia.n@webmail.example", "+358445550777", "2023-02-17"],
    ["C000318", "Ville Koskinen", "300978-3313", "21420", "Lieto", "ville.koskinen@nordmail.example", "+358405550612", "2012-07-29"],
  ],
};

export const conversations: FixtureTable = {
  name: "conversations",
  columns: ["conversation_id", "customer_id", "agent_name", "channel", "started_ts", "intent", "handle_time_s", "csat"],
  rows: [
    ["CNV-000052", "C000044", "Kaisa Niemikallio", "phone", "2025-09-27 15:47:10", "billing_dispute", "1085", null],
    ["CNV-000151", "C000123", "Inka Kaukopää", "phone", "2025-12-01 12:32:48", "router_support", "1687", "5"],
    ["CNV-000188", "C000148", "Joonas Salminen", "chat", "2025-04-14 16:05:35", "fraud_scam_report", "1300", null],
    ["CNV-000247", "C000201", "Tiina Hietakorpi", "phone", "2025-01-20 12:03:03", "broadband_outage", "844", "2"],
    ["CNV-000260", "C000215", "Kaisa Niemikallio", "chat", "2025-03-03 09:14:51", "billing_dispute", "622", "4"],
    ["CNV-000271", "C000233", "Joonas Salminen", "phone", "2025-03-05 10:40:02", "contract_change", "940", "3"],
    ["CNV-000289", "C000250", "Inka Kaukopää", "email", "2025-05-19 08:01:44", "billing_dispute", "1510", "4"],
    ["CNV-000301", "C000267", "Tiina Hietakorpi", "chat", "2025-06-02 17:22:10", "router_support", "455", "5"],
    ["CNV-000315", "C000281", "Kaisa Niemikallio", "phone", "2025-07-11 13:09:37", "broadband_outage", "1203", "1"],
    ["CNV-000322", "C000294", "Joonas Salminen", "phone", "2025-08-25 11:45:00", "contract_change", "731", "4"],
    ["CNV-000337", "C000302", "Inka Kaukopää", "chat", "2025-10-14 14:30:12", "fraud_scam_report", "1890", "3"],
    ["CNV-000349", "C000318", "Tiina Hietakorpi", "phone", "2025-11-03 16:58:41", "router_support", "1012", null],
  ],
};

const rawTurns: [string, string, string, string, string, string][] = [
  ["T0000622", "CNV-000052", "1", "agent", "2025-09-27 15:47:10", "hello you're through to aallokko this is {PERSON|kaisa}"],
  ["T0000623", "CNV-000052", "2", "customer", "2025-09-27 15:47:30", "i got an invoice and there are extra services on it that i never ordered"],
  ["T0000624", "CNV-000052", "3", "agent", "2025-09-27 15:47:58", "could i have your personal identity code please"],
  ["T0000625", "CNV-000052", "4", "customer", "2025-09-27 15:48:14", "it's {NATIONAL_ID|020782-918P}, the account is under {PERSON|Ksenia Sokolova}"],
  ["T0000626", "CNV-000052", "5", "agent", "2025-09-27 15:48:40", "thanks, i can see a premium-rate charge from august, i'll credit that now"],
  ["T0000627", "CNV-000052", "6", "customer", "2025-09-27 15:49:02", "great, can you send the confirmation to {EMAIL|ksenia.sokolova@kotiposti.example}"],
  ["T0000640", "CNV-000151", "1", "agent", "2025-12-01 12:32:48", "aallokko tuki, {PERSON|Inka} puhelimessa"],
  ["T0000641", "CNV-000151", "2", "customer", "2025-12-01 12:33:10", "reititin ei toimi taas, valo vilkkuu punaisena"],
  ["T0000642", "CNV-000151", "3", "agent", "2025-12-01 12:33:41", "kokeillaan uudelleenkäynnistystä, onko osoite edelleen {ADDRESS|Nummikaari 11 D 3}"],
  ["T0000643", "CNV-000151", "4", "customer", "2025-12-01 12:34:05", "joo on, ja numero on {PHONE|050 392 0945} jos tarvitsette"],
  ["T0000660", "CNV-000188", "1", "customer", "2025-04-14 16:05:35", "I think someone is using my account, I got a text from an unknown number {PHONE|+358 40 999 1234}"],
  ["T0000661", "CNV-000188", "2", "agent", "2025-04-14 16:06:02", "I'm sorry to hear that. Can you confirm your full name?"],
  ["T0000662", "CNV-000188", "3", "customer", "2025-04-14 16:06:20", "{PERSON|Esa Oravalehto}, identity code {NATIONAL_ID|311064-9219}"],
  ["T0000663", "CNV-000188", "4", "agent", "2025-04-14 16:07:15", "Thank you. I've blocked the number and flagged the account for the fraud team."],
  ["T0000680", "CNV-000247", "1", "customer", "2025-01-20 12:03:03", "broadband has been down since morning in {LOCATION|Salo}"],
  ["T0000681", "CNV-000247", "2", "agent", "2025-01-20 12:03:40", "there is an outage in your area, estimated fix by 4 pm"],
  ["T0000682", "CNV-000247", "3", "customer", "2025-01-20 12:04:12", "this is the third time this month, I want compensation"],
  ["T0000700", "CNV-000260", "1", "customer", "2025-03-03 09:14:51", "my bill doubled, I'm {PERSON|Aino Virtanen}, phone {PHONE|040 123 4567}"],
  ["T0000701", "CNV-000260", "2", "agent", "2025-03-03 09:15:30", "I see a roaming charge from your trip, I can split it into instalments"],
  ["T0000720", "CNV-000271", "1", "customer", "2025-03-05 10:40:02", "I want to move my contract to my daughter {PERSON|Sanna Mäkelä}"],
  ["T0000721", "CNV-000271", "2", "agent", "2025-03-05 10:40:44", "she will need to sign the transfer, I'll email the form to {EMAIL|sanna.makela@mail.example}"],
  ["T0000740", "CNV-000289", "1", "customer", "2025-05-19 08:01:44", "Please explain the late fee, I paid on time from {ORG|Nordea}"],
  ["T0000760", "CNV-000301", "1", "customer", "2025-06-02 17:22:10", "router keeps dropping wifi in the evenings"],
  ["T0000761", "CNV-000301", "2", "agent", "2025-06-02 17:22:55", "let's change the channel, I'll push a firmware update to it now"],
];

const MARK = /\{([A-Z_]+)\|([^}]*)\}/g;
export function parseMarked(text: string): { text: string; spans: SpanDetection[] } {
  let out = "";
  let last = 0;
  const spans: SpanDetection[] = [];
  for (const m of text.matchAll(MARK)) {
    out += text.slice(last, m.index);
    const start = out.length;
    out += m[2]!;
    spans.push({ start, end: out.length, label: m[1] as SpanLabel, score: 0.9, ruleId: "fixture" });
    last = (m.index ?? 0) + m[0].length;
  }
  out += text.slice(last);
  return { text: out, spans };
}

const parsedTurns = rawTurns.map((r) => ({ cells: r.slice(0, 5) as string[], ...parseMarked(r[5]) }));

export const turns: FixtureTable = {
  name: "turns",
  columns: ["turn_id", "conversation_id", "seq", "speaker", "ts", "text"],
  rows: parsedTurns.map((t) => [...t.cells, t.text]),
};

/** spans for turns.text, by row */
export const turnSpans: SpanDetection[][] = parsedTurns.map((t) => t.spans);

export const FIXTURE_TABLES: FixtureTable[] = [customers, conversations, turns];
