import { useState } from "react";
import type { MetricResult, ThreatCoverage } from "@/contracts";
import { useAppState, useController } from "../store/store";
import { BASIS_LABEL, METRIC_KIND_LABEL, METRIC_STATUS_LABEL, TEST_STATUS_LABEL, fmtMetricValue, fmtThreshold } from "../lib/labels";
import { IconAlert, IconCheck, IconCircle, IconCross, IconMinus, IconDot } from "../lib/icons";

type Status = MetricResult["status"];

/** Four states, four icons. An unsupported or failed check never reads as zero risk. */
export function StatusIcon({ status, passed }: { status: Status; passed?: boolean | null }) {
  if (status === "unsupported") return <IconCircle size={14} label="Not supported" />;
  if (status === "not_applicable") return <IconMinus size={14} label="Not applicable" />;
  if (status === "failed") return <IconAlert size={14} label="Check failed to run" />;
  if (passed === true) return <IconCheck size={14} label="Passed" />;
  if (passed === false) return <IconCross size={14} label="Did not pass" />;
  return <IconDot size={14} label="Evaluated" />;
}
function tone(m: MetricResult): string {
  if (m.status === "unsupported") return "unsupported";
  if (m.status === "failed") return "failed";
  if (m.status === "not_applicable") return "muted";
  if (m.passed === false) return m.threshold?.hard ? "hard-fail" : "fail";
  if (m.passed === true) return "pass";
  return "plain";
}
const covTone = (c: ThreatCoverage) => (c.status === "evaluated" ? "pass" : c.status === "failed" ? "failed" : c.status === "unsupported" ? "unsupported" : "muted");

function Coverage({ coverage, compact }: { coverage: ThreatCoverage[]; compact: boolean }) {
  if (!coverage.length) return <p className="coverage-empty muted small">No threats were listed for this sharing setting.</p>;
  const uncovered = coverage.filter((c) => c.status !== "evaluated");
  const covered = coverage.filter((c) => c.status === "evaluated");
  const count = (st: Status) => coverage.filter((c) => c.status === st).length;
  return (
    <div className="coverage" role="group" aria-label="Threat coverage">
      <p className="coverage-head small">
        <span className="evalgroup-label">Coverage</span>
        <span className="num">{count("evaluated")}</span> of <span className="num">{coverage.length}</span> threats evaluated
        {count("unsupported") > 0 && <> · <span className="num">{count("unsupported")}</span> not supported</>}
        {count("failed") > 0 && <> · <span className="num">{count("failed")}</span> failed to run</>}
        {count("not_applicable") > 0 && <> · <span className="num">{count("not_applicable")}</span> not applicable</>}
      </p>
      {uncovered.length > 0 && !compact && (
        <ul className="threats">
          {uncovered.map((c) => (
            <li key={c.threatId} className={`threat tone-${covTone(c)}`} title={`${c.description}: ${TEST_STATUS_LABEL[c.status]}${c.statusReason ? ` (${c.statusReason})` : ""}\nAttacker knows: ${c.attackerKnowledge}`}>
              <StatusIcon status={c.status} />
              <span className="threat-text"><strong>{c.description}</strong>: {TEST_STATUS_LABEL[c.status].toLowerCase()}{c.statusReason ? ` (${c.statusReason})` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {covered.length > 0 && !compact && (
        <details className="threats-covered small">
          <summary>Evaluated threats ({covered.length})</summary>
          <ul className="threats">
            {covered.map((c) => (
              <li key={c.threatId} className="threat tone-pass">
                <StatusIcon status="evaluated" />
                <span>{c.description} <span className="muted">· attacker knows: {c.attackerKnowledge} · by {c.evaluatedBy.join(", ") || "—"}{c.statusReason ? ` · ${c.statusReason}` : ""}</span></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Measured risk, utility and integrity checks as separate labelled items, then threat coverage. Never one score. */
export function EvaluationBar() {
  const s = useAppState();
  const c = useController();
  const e = s.evaluation!;
  const focused = e.metrics.find((m) => m.id === s.metricFocus);
  const groups = (["risk", "utility", "integrity"] as const).map((k) => ({ k, items: e.metrics.filter((m) => m.kind === k) })).filter((g) => g.items.length);
  const stale = s.phase === "updating" || e.planHash !== s.proposal?.planHash;
  const b = e.benchmark;
  const bc = (st: Status) => b?.tests.filter((t) => t.status === st).length ?? 0;
  const [compact, setCompact] = useState(false);

  return (
    <section className={`evalbar ${stale ? "is-stale" : ""}`} aria-label="Checks">
      {e.hardFailures.length > 0 && (
        <div className="hard-fail-line" role="alert">
          <IconAlert size={14} />
          <span><strong>Export blocked.</strong> {e.hardFailures.join(" · ")}</span>
        </div>
      )}
      <button className="btn-link xsmall evalbar-toggle" aria-expanded={!compact} onClick={() => setCompact((x) => !x)}>
        {compact ? "Show threat details" : "Hide threat details"}
      </button>
      <div className="evalbar-groups">
        {groups.map((g) => (
          <div key={g.k} className="evalgroup" role="group" aria-label={METRIC_KIND_LABEL[g.k]}>
            <span className="evalgroup-label">{METRIC_KIND_LABEL[g.k]}</span>
            {g.items.map((m) => (
              <button
                key={m.id}
                className={`metric tone-${tone(m)}`}
                aria-pressed={s.metricFocus === m.id}
                onClick={() => c.store.dispatch({ type: "focusMetric", metricId: m.id })}
                title={`${m.definition}\n${METRIC_STATUS_LABEL[m.status]}, ${BASIS_LABEL[m.basis]}`}
              >
                <StatusIcon status={m.status} passed={m.passed} />
                <span className="metric-name">{m.name}</span>
                <span className="metric-value num">{m.status === "evaluated" ? fmtMetricValue(m) : METRIC_STATUS_LABEL[m.status].toLowerCase()}</span>
                {m.threshold && m.status === "evaluated" && <span className="metric-thr num">{fmtThreshold(m)}{m.threshold.hard ? " required" : ""}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      {focused && (
        <div className="metric-detail small">
          <p><strong>{focused.name}</strong> · {METRIC_STATUS_LABEL[focused.status]} · {BASIS_LABEL[focused.basis]} · scope <code>{focused.scope}</code></p>
          <p className="muted">{focused.definition}{focused.detail ? ` ${focused.detail}` : ""}</p>
          {focused.unitIds?.length ? <p className="muted">Rows are filtered to the {focused.unitIds.length} {focused.unitIds.length === 1 ? "field" : "fields"} this check concerns (Protected view).</p> : null}
        </div>
      )}
      <Coverage coverage={e.coverage ?? []} compact={compact} />
      {!compact && <p className="benchmark-line small">
        {b ? (
          <>
            <span className="evalgroup-label">Benchmark</span>
            <span className="num">{bc("evaluated")}</span> tests evaluated, <span className="num">{bc("unsupported")}</span> unsupported, <span className="num">{bc("failed")}</span> failed
            {bc("not_applicable") > 0 && <>, <span className="num">{bc("not_applicable")}</span> not applicable</>}
            {" · "}
            <button className="btn-link" onClick={() => c.store.dispatch({ type: "toggleDev", open: true, tab: "benchmark" })}>Details (private)</button>
          </>
        ) : (
          <span className="muted">Benchmark not available for this upload: no ground truth or attacker data.</span>
        )}
      </p>}
    </section>
  );
}
