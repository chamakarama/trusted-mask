import type { Candidate, Decision, DecisionUnit, Proposal, SelectorInfo, TokenScope } from "@/contracts";
import { columnKey } from "@/contracts";
import { hashOf, newId, nowIso } from "@/core/util/hash";
import { validateParams, REGISTRY_VERSION } from "@/core/registry";
import type { SelectionContext } from "./types";
import { keyOf } from "./candidates";

/**
 * Turn per-unit decisions into a Proposal: applies user overrides (re-validated against the candidate set),
 * derives token scopes from tokenize decisions, computes the plan hash.
 */
export function assembleProposal(ctx: SelectionContext, selector: Omit<SelectorInfo, "registryVersion">, decisions: Decision[]): Proposal {
  const byUnit = new Map(decisions.map((d) => [d.unitId, d]));
  const warnings: string[] = [];
  for (const o of ctx.overrides) {
    const d = byUnit.get(o.unitId);
    if (!d) { warnings.push(`override for unknown unit ${o.unitId} ignored`); continue; }
    if (o.recipeId === null) {
      d.selected = null; d.abstained = true; d.abstainReason = "removed by user"; d.source = "user"; d.reviewState = "edited";
      continue;
    }
    const problems = validateParams(o.recipeId, o.params);
    const cand = d.candidates.find((c) => c.recipeId === o.recipeId);
    if (!cand) { warnings.push(`override ${o.recipeId} is not a candidate for ${o.unitId}`); continue; }
    if (problems.length) { warnings.push(`override for ${o.unitId}: ${problems.join("; ")}`); continue; }
    if (!cand.valid) { warnings.push(`override for ${o.unitId} chooses an invalid recipe: ${cand.invalidReasons.join("; ")}`); }
    d.selected = { recipeId: o.recipeId, params: o.params };
    d.abstained = false; d.abstainReason = undefined;
    d.source = "user"; d.reviewState = "edited";
    d.reason = `Edited by you: ${cand.label}.`;
    d.needsReview = !cand.valid;
    d.reviewReasons = cand.valid ? [] : cand.invalidReasons;
  }
  const tokenScopes = deriveTokenScopes(ctx.units, decisions);
  const plan = decisions.map((d) => ({ u: d.unitId, r: d.selected?.recipeId ?? null, p: d.selected?.params ?? {} }));
  return {
    version: 1,
    proposalId: newId("prop"),
    inputHash: ctx.manifest.inputHash,
    goalId: ctx.goal.goalId,
    selector: { ...selector, registryVersion: REGISTRY_VERSION },
    units: ctx.units,
    decisions,
    tokenScopes,
    planHash: hashOf({ inputHash: ctx.manifest.inputHash, goalId: ctx.goal.goalId, plan, registry: REGISTRY_VERSION }),
    createdAt: nowIso(),
    warnings,
  };
}

function deriveTokenScopes(units: DecisionUnit[], decisions: Decision[]): TokenScope[] {
  const scopes: TokenScope[] = [];
  const dataset: TokenScope = { id: "dataset", columns: [], keyId: "session-key-1" };
  for (const d of decisions) {
    if (d.selected?.recipeId !== "tokenize_keyed") continue;
    const unit = units.find((u) => u.id === d.unitId);
    if (!unit) continue;
    if (d.selected.params.scope === "table") {
      for (const ref of unit.refs) scopes.push({ id: `table:${ref.table}`, columns: [ref], keyId: "session-key-1" });
    } else dataset.columns.push(...unit.refs);
  }
  if (dataset.columns.length) scopes.unshift(dataset);
  return scopes;
}

export function selectCandidate(candidates: Candidate[], key: string): Candidate | undefined {
  return candidates.find((c) => keyOf(c) === key);
}

export function unitLabel(unit: DecisionUnit): string {
  if (unit.kind === "span_class") return `${columnKey(unit.refs[0]!)} · ${unit.spanLabel}`;
  return unit.refs.map(columnKey).join(" + ");
}
