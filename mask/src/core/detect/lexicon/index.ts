/**
 * Lexicon sets for the span and field detectors.
 * NOTE: names, municipalities and the name stoplist are generated from the TRAINING split of the synthetic
 * TrustED PETs package. Measurements on that split (and fixtures drawn from it) are therefore optimistic.
 */
import { FIRST_NAMES } from "./firstNames";
import { SURNAMES } from "./surnames";
import { NAME_STOPWORDS } from "./nameStopwords";
import { PLACE_NAMES } from "./municipalities";
import { COUNTRY_FORMS, DISTRICTS, KNOWN_ORGS } from "./places";

export const FIRST_NAME_SET: ReadonlySet<string> = new Set(FIRST_NAMES);
export const SURNAME_SET: ReadonlySet<string> = new Set(SURNAMES);
export const NAME_STOP_SET: ReadonlySet<string> = new Set(NAME_STOPWORDS);
export { KNOWN_ORGS };

/** Finnish locative / directional endings applied to place names. */
const FI_CASES = ["", "n", "ssa", "ssä", "sta", "stä", "lla", "llä", "lta", "ltä", "lle", "an", "än", "on", "ön", "un", "yn", "hin", "seen", "aan", "ään", "oon", "iin"];

function gradate(stem: string): string[] {
  const out = [stem];
  if (/ku$/.test(stem)) out.push(stem.slice(0, -2) + "u");      // turku -> turu(ssa)
  if (/to$/.test(stem)) out.push(stem.slice(0, -2) + "do");     // lieto -> liedo(ssa)
  if (/kki$/.test(stem)) out.push(stem.slice(0, -3) + "ki");
  if (/ppi$/.test(stem)) out.push(stem.slice(0, -3) + "pi");
  if (/nen$/.test(stem)) out.push(stem.slice(0, -3) + "ise", stem.slice(0, -3) + "isi"); // parainen -> paraise(n), paraisi(lla)
  if (/i$/.test(stem)) out.push(stem.slice(0, -1) + "e");         // naantali -> naantale? harmless
  return out;
}

const placeForms = new Map<string, string>();
for (const p of PLACE_NAMES) {
  if (p.includes(" ")) { placeForms.set(p, p); continue; }
  for (const stem of gradate(p)) for (const c of FI_CASES) placeForms.set(stem + c, p);
}
for (const c of COUNTRY_FORMS) placeForms.set(c, c);
for (const d of DISTRICTS) placeForms.set(d, d);
/** lower-case surface form -> canonical place */
export const PLACE_FORMS: ReadonlyMap<string, string> = placeForms;
/** multi-word place forms (matched on lower-cased text) */
export const MULTIWORD_PLACES: readonly string[] = [...placeForms.keys()].filter((k) => k.includes(" ")).sort((a, b) => b.length - a.length);
