import type { Candidate, Decision, DecisionUnit, FieldDetection, GoalSpec, Proposal, TimeResolution } from "@/contracts";
import { enumerateCandidates, keyOf, primaryDetection } from "./candidates";
import { assembleProposal } from "./assemble";
import { detectionFor, type SelectionContext, type Selector } from "./types";

export const POLICY_VERSION = "1.0.0";

/**
 * Deterministic policy baseline. Ranks valid candidates by explicit rules over role, subtype and goal.
 * Every choice carries the rule that produced it. This is the fallback when no learned model is loaded,
 * and the "fixed policy" baseline the learned selector is compared against.
 */
export class PolicySelector implements Selector {
  readonly id = "policy" as const;
  readonly version = POLICY_VERSION;

  async propose(ctx: SelectionContext): Promise<Proposal> {
    const decisions = ctx.units.map((u) => decide(u, ctx));
    return assembleProposal(ctx, { id: "policy", version: POLICY_VERSION }, decisions);
  }
}

interface Ranked { order: string[]; reason: string; detail: string[]; review?: string[] }

function decide(unit: DecisionUnit, ctx: SelectionContext): Decision {
  const candidates = enumerateCandidates(unit, ctx);
  const det = primaryDetection(detectionFor(ctx, unit));
  const ranked = unit.kind === "span_class" ? rankSpan(unit, ctx.goal, det) : rankField(unit, ctx, det);
  const valid = candidates.filter((c) => c.valid);
  const byKey = new Map(valid.map((c) => [keyOf(c), c]));
  // candidates in preference order: ranked keys first (that are valid), then remaining valid ones
  const ordered: Candidate[] = [];
  for (const k of ranked.order) { const c = byKey.get(k); if (c && !ordered.includes(c)) ordered.push(c); }
  for (const c of valid) if (!ordered.includes(c)) ordered.push(c);
  ordered.forEach((c, i) => { c.policyRank = i + 1; });
  const chosen = ordered[0];
  const reviewReasons = [...(ranked.review ?? [])];
  if (det?.needsReview) reviewReasons.push(...det.reviewReasons.map((r) => `detection: ${r}`));
  if (det && (det.confidence === "low" || det.confidence === "unknown")) reviewReasons.push(`detection confidence is ${det.confidence}`);
  if (!chosen) {
    return {
      unitId: unit.id, candidates, selected: null, abstained: true,
      abstainReason: "No supported recipe is valid for this column under the current goal.",
      reason: "Mask cannot propose a transformation here.",
      detail: candidates.map((c) => `${c.label}: ${c.invalidReasons.join("; ")}`),
      source: "selector", reviewState: "flagged", needsReview: true,
      reviewReasons: ["no valid candidate", ...reviewReasons],
    };
  }
  return {
    unitId: unit.id, candidates, selected: { recipeId: chosen.recipeId, params: chosen.params }, abstained: false,
    reason: ranked.reason, detail: [...ranked.detail, `policy rule order: ${ranked.order.join(" > ")}`],
    source: "selector", reviewState: reviewReasons.length ? "flagged" : "proposed",
    needsReview: reviewReasons.length > 0, reviewReasons,
  };
}

const TIME_KEY = (r: TimeResolution): string => `generalize_datetime@resolution=${r}`;

function wanted(goal: GoalSpec, unit: DecisionUnit): boolean {
  const names = unit.refs.flatMap((r) => [r.column.toLowerCase(), `${r.table}.${r.column}`.toLowerCase()]);
  const mentioned = [...goal.requiredFields, ...goal.groupings].map((s) => s.toLowerCase());
  return names.some((n) => mentioned.includes(n)) || goal.measures.some((m) => names.some((n) => m.toLowerCase().includes(n.split(".").pop() ?? n)));
}

function rankField(unit: DecisionUnit, ctx: SelectionContext, det: FieldDetection | undefined): Ranked {
  const goal = ctx.goal;
  const trust = goal.recipient.trustLevel;
  const external = trust !== "internal";
  const needed = wanted(goal, unit);
  const linking = goal.linkage !== "none";
  const isGroup = unit.kind === "field_group";
  const who = goal.recipient.description || trust;
  if (!det) return { order: ["suppress", "keep"], reason: "No detection for this column; removed to be safe.", detail: [], review: ["no detection"] };

  switch (det.role) {
    case "record_key":
      if (isGroup || linking) return { order: ["tokenize_keyed@format=token,scope=dataset", "keep", "suppress"], reason: external ? `Row key that joins tables; tokenised so ${who} can still join without seeing the original key.` : "Row key kept so rows stay joinable internally.", detail: ["record keys have no meaning outside the table but link tables when shared"] };
      return { order: ["keep", "tokenize_keyed@format=token,scope=dataset", "suppress"], reason: "Row key with no meaning outside this table; kept so rows stay addressable.", detail: [] };
    case "direct_identifier": {
      const idLike = ["CUSTOMER_ID", "ACCOUNT_ID", "EMPLOYEE_ID", "STUDENT_ID", "PATIENT_ID"].includes(det.subtype);
      if (det.subtype === "NATIONAL_ID" && (goal.groupings.some((g) => /age|sex|gender|birth/i.test(g)) || goal.measures.some((m) => /age|sex|gender|demograph/i.test(m))))
        return { order: ["derive_hetu@ageBandYears=10,referenceDate=2025-12-31", "derive_hetu@ageBandYears=5,referenceDate=2025-12-31", "suppress"], reason: "The identity code is replaced by the age band and sex it encodes, which the analysis needs.", detail: ["HETU encodes birth date and sex; the code itself identifies directly"] };
      if ((idLike && (linking || isGroup || needed)) && trust !== "public")
        return { order: ["tokenize_keyed@format=token,scope=dataset", "suppress"], reason: `${det.subtype === "EMPLOYEE_ID" ? "Employee" : "Customer"} identifier tokenised: the same person keeps the same token so ${linking ? "repeat contacts and joins" : "joins"} still work, but the real number is not disclosed.`, detail: ["keyed HMAC token; mapping stays with the key holder"] };
      if (!external && idLike) return { order: ["keep", "tokenize_keyed@format=token,scope=dataset", "suppress"], reason: "Internal use: the identifier stays available to the team that already holds it.", detail: [] };
      if (linking && trust !== "public" && !idLike && det.subtype !== "PAYMENT_CARD" && det.subtype !== "IBAN")
        return { order: ["suppress", "tokenize_keyed@format=token,scope=dataset"], reason: `Removed: ${det.subtype.toLowerCase().replace("_", " ")} identifies the person directly and the analysis does not need it.`, detail: ["a keyed token is the alternative if this field must stay linkable"] };
      return { order: ["suppress", "tokenize_keyed@format=token,scope=dataset"], reason: `Removed: ${det.subtype.toLowerCase().replace("_", " ")} identifies the person directly and the analysis does not need it.`, detail: [] };
    }
    case "technical_identifier": {
      if (trust === "public") return { order: ["suppress"], reason: "Public release: device and account identifiers are personal data and are removed.", detail: [] };
      if (isGroup || linking || needed) return { order: ["tokenize_keyed@format=token,scope=dataset", "suppress", "keep"], reason: `Tokenised consistently across tables so ${who} can still join and count per entity without the real identifier.`, detail: [] };
      if (!external) return { order: ["keep", "tokenize_keyed@format=token,scope=dataset", "suppress"], reason: "Internal use: kept as is.", detail: [] };
      return { order: ["suppress", "tokenize_keyed@format=token,scope=dataset"], reason: "Removed: not needed for the analysis and it links records to a person or device.", detail: [] };
    }
    case "quasi_identifier": {
      switch (det.subtype) {
        case "TIMESTAMP": case "DATE": {
          const res = goal.resolution.time ?? (trust === "public" ? "week" : trust === "internal" ? "hour" : goal.task.kind === "quality_audit" ? "week" : "hour");
          const order = res === "exact" ? ["keep", TIME_KEY("hour")] : [TIME_KEY(res), TIME_KEY("day"), TIME_KEY("week"), "suppress"];
          return { order, reason: res === "exact" ? "Exact time kept because the analysis needs it." : `Time rounded to the ${res}: enough for ${goal.measures[0] ?? "the analysis"}, and exact times no longer link to call logs or receipts.`, detail: [`goal time resolution: ${goal.resolution.time ?? "not stated, default for " + trust}`] };
        }
        case "BIRTH_DATE":
          return { order: [TIME_KEY("year"), TIME_KEY("month"), "suppress"], reason: "Birth date reduced to the year: age structure survives, exact date no longer singles people out.", detail: [] };
        case "AGE":
          return { order: ["generalize_numeric_bin@topCode=90,width=10", "generalize_numeric_bin@topCode=90,width=5", "suppress", "keep"], reason: "Age in 10-year bands with 90+ top-coded.", detail: [] };
        case "POSTCODE":
          if (goal.resolution.location === "exact" || goal.resolution.location === "postcode") return { order: ["keep", "generalize_postcode@digits=3", "suppress"], reason: "Full postcode kept because the analysis works at postcode level.", detail: [], review: ["full postcode combined with other fields can single people out"] };
          if (trust === "public") return { order: ["generalize_postcode@digits=2", "generalize_postcode@digits=3", "suppress"], reason: "Public release: postcode truncated to 2 digits.", detail: [] };
          return { order: ["generalize_postcode@digits=3", "generalize_postcode@digits=2", "suppress", "keep"], reason: "Postcode truncated to 3 digits: regional patterns stay, the street area does not.", detail: [] };
        case "MUNICIPALITY": case "LOCATION_NAME":
          if (needed) return { order: ["generalize_category_rare@minGroup=5", "keep", "suppress"], reason: "Place kept for grouping; rare places merged into 'other'.", detail: [] };
          return { order: [trust === "public" ? "suppress" : "generalize_category_rare@minGroup=10", "generalize_category_rare@minGroup=5", "keep", "suppress"], reason: trust === "public" ? "Public release: place removed." : "Place kept with small areas merged, since it is not central to the analysis.", detail: [] };
        case "GPS_COORDINATE":
          return { order: ["suppress"], reason: "Coordinates removed: no reliable location generalisation is available yet.", detail: [], review: ["location generalisation unavailable"] };
        case "LANGUAGE": case "SEX": case "NATIONALITY": case "OCCUPATION": case "ORG_NAME":
          if (needed) return { order: ["keep", "generalize_category_rare@minGroup=5", "suppress"], reason: `Kept: the analysis groups by ${det.subtype.toLowerCase()}.`, detail: [] };
          if (trust === "public") return { order: ["generalize_category_rare@minGroup=10", "suppress", "keep"], reason: "Public release: rare values merged so small groups cannot be singled out.", detail: [] };
          return { order: ["generalize_category_rare@minGroup=5", "keep", "suppress"], reason: "Kept with rare values merged: cheap protection, little lost.", detail: [] };
        default:
          return { order: ["generalize_category_rare@minGroup=5", "keep", "suppress"], reason: "Quasi-identifier kept with rare values merged.", detail: [] };
      }
    }
    case "sensitive_attribute": {
      if (det.art9 && (external || goal.exclusions.includes("special_category")) && !needed) return { order: ["suppress"], reason: "Special-category data (health) removed: the recipient has no need for it.", detail: ["GDPR Art. 9"] };
      if (needed) return { order: ["keep", "generalize_category_rare@minGroup=5", "suppress"], reason: "Sensitive attribute kept because the analysis is about it; the link to the person is broken elsewhere.", detail: [], review: det.art9 ? ["special-category data kept on request"] : [] };
      if (trust === "public") return { order: ["suppress", "generalize_category_rare@minGroup=10"], reason: "Public release: sensitive attribute removed.", detail: [] };
      return { order: ["suppress", "generalize_category_rare@minGroup=5", "keep"], reason: "Sensitive attribute removed: not needed for the stated purpose.", detail: ["data minimisation"] };
    }
    case "free_text": {
      if (goal.textNeed === "none" || goal.outputForm === "aggregate") return { order: ["suppress", "redact_text"], reason: "Text not needed for this purpose; removed.", detail: [] };
      return { order: ["redact_text", "suppress"], reason: `Text kept with personal-data spans transformed, so ${goal.task.kind === "model_training" ? "the training signal" : "the meaning"} survives.`, detail: [] };
    }
    case "non_sensitive":
      if (trust === "public" && det.subtype === "CATEGORY") return { order: ["generalize_category_rare@minGroup=10", "keep"], reason: "Kept; rare categories merged for public release.", detail: [] };
      return { order: ["keep", "generalize_category_rare@minGroup=5", "suppress"], reason: "Not sensitive; kept as is.", detail: [] };
    case "unknown":
    default: {
      const { column } = statsOf(ctx, unit);
      const identifying = column.stats.uniqueRatio > 0.5 && column.stats.nonEmpty > 20;
      return identifying
        ? { order: ["suppress", "tokenize_keyed@format=token,scope=dataset", "keep"], reason: "Unrecognised column with mostly unique values: removed until reviewed.", detail: [], review: ["unrecognised column"] }
        : { order: ["keep", "generalize_category_rare@minGroup=5", "suppress"], reason: "Unrecognised column with repeating values: kept, but please review.", detail: [], review: ["unrecognised column"] };
    }
  }
}

function statsOf(ctx: SelectionContext, unit: DecisionUnit) {
  const ref = unit.refs[0]!;
  const t = ctx.manifest.tables.find((x) => x.name === ref.table)!;
  return { table: t, column: t.columns.find((c) => c.name === ref.column)! };
}

function rankSpan(unit: DecisionUnit, goal: GoalSpec, _det: FieldDetection | undefined): Ranked {
  const label = unit.spanLabel!;
  const trust = goal.recipient.trustLevel;
  const fluent = goal.textNeed === "fluent" || goal.task.kind === "model_training";
  const typed = "redact_typed", sur = "redact_surrogate@consistency=conversation";
  switch (label) {
    case "NATIONAL_ID": case "PAYMENT_CARD": case "IBAN": case "SECRET": case "DEVICE_ID": case "IP_ADDRESS": case "URL": case "USERNAME": case "LICENSE_PLATE": case "PROPERTY_ID":
      return { order: [typed, "suppress"], reason: `${pretty(label)} replaced by a typed placeholder: never kept, and a surrogate could be mistaken for a real one.`, detail: [] };
    case "ACCOUNT_NUMBER": case "EMAIL": case "PHONE": case "ADDRESS":
      return fluent ? { order: [sur, typed, "suppress"], reason: `${pretty(label)} replaced by a realistic surrogate so the text stays natural for training.`, detail: [] }
                    : { order: [typed, sur, "suppress"], reason: `${pretty(label)} replaced by a typed placeholder: readers see one was given, not the value.`, detail: [] };
    case "PERSON":
      return fluent ? { order: [sur, typed, "suppress"], reason: "Names replaced by consistent fake names: the conversation still reads naturally.", detail: [] }
                    : { order: [typed, sur, "suppress"], reason: "Names replaced by [PERSON].", detail: [] };
    case "HEALTH":
      if (trust === "internal" && goal.exclusions.length === 0 && goal.textNeed === "fluent") return { order: [typed, "keep", "suppress"], reason: "Health remarks replaced by [HEALTH] even internally: minimisation for model training.", detail: [] };
      return { order: [typed, "suppress"], reason: "Health remarks removed: special-category data the recipient must not receive.", detail: [] };
    case "DATE": case "AGE": case "LOCATION": case "ORG":
      if (trust === "internal" && goal.task.kind !== "model_training") return { order: ["keep", typed, sur], reason: `${pretty(label)} kept for internal use.`, detail: [] };
      if (fluent) return { order: [sur, typed, "keep"], reason: `${pretty(label)} replaced by a surrogate of the same kind.`, detail: [] };
      if (trust === "contractual" && goal.task.kind === "quality_audit") return { order: [typed, sur, "suppress"], reason: `${pretty(label)} replaced by a placeholder for the auditors.`, detail: [] };
      return { order: [typed, sur, "suppress"], reason: `${pretty(label)} replaced by a typed placeholder.`, detail: [] };
    default:
      return { order: [typed, "suppress"], reason: `${pretty(label)} replaced by a typed placeholder.`, detail: [] };
  }
}

const pretty = (l: string): string => l.charAt(0) + l.slice(1).toLowerCase().replace("_", " ");
