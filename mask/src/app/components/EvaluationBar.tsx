import { useState } from "react";
import type { MetricResult, ThreatCoverage } from "@/contracts";
import { useAppState, useController } from "../store/store";
import { BASIS_LABEL, METRIC_KIND_LABEL, METRIC_STATUS_LABEL, TEST_STATUS_LABEL, fmtMetricValue, fmtThreshold } from "../lib/labels";
import { groupMetrics, metricContext, type MetricGroup } from "../lib/metrics";
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
const valueText = (m: MetricResult) => (m.status === "evaluated" ? fmtMetricValue(m) : METRIC_STATUS_LABEL[m.status].toLowerCase());
const covTone = (c: ThreatCoverage) => (c.status === "evaluated" ? "pass" : c.status === "failed" ? "failed" : c.status === "unsupported" ? "unsupported" : "muted");

function GroupDetail({ g }: { g: MetricGroup }) {
  const s = useAppState();
  const m0 = g.items[0]!;
  return (
    <div className="metric-detail small" id={`metric-detail-${g.id}`}>
      <p><strong>{g.name}</strong> · {METRIC_KIND_LABEL[g.kind]} · {BASIS_LABEL[m0.basis]}{m0.threshold ? ` · target ${fmtThreshold(m0)}${m0.threshold.hard ? ", required" : ""}` : ""}</p>
      <p className="muted">{m0.definition}</p>
      <table className="scope-table">
        <tbody>
          {g.items.map((m, i) => (
            <tr key={`${m.scope}-${i}`} className={`tone-${tone(m)}`}>
              <td className="st"><StatusIcon status={m.status} passed={m.passed} /></td>
              <td className="mono sc">{m.scope}{g.items.length > 1 && m.name !== g.name ? <span className="muted"> · {m.name}</span> : null}</td>
              <td className="num val">{valueText(m)}</td>
              <td className="muted dt">{[m.detail, metricContext(m, s.manifest)].filter(Boolean).join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.items.some((m) => m.unitIds?.length) && <p className="muted xsmall">Rows are filtered to the fields this check concerns (Protected view). Click the check again to clear.</p>}
    </div>
  );
}

/** Measured risk, utility and integrity checks (one chip per check), then threat coverage. Never one score. */
export function EvaluationBar() {
  const s = useAppState();
  const c = useController();
  const [showThreats, setShowThreats] = useState(false);
  const e = s.evaluation!;
  const groups = groupMetrics(e.metrics);
  const focused = groups.find((g) => g.id === s.metricFocus);
  const stale = s.phase === "updating" || e.planHash !== s.proposal?.planHash;
  const b = e.benchmark;
  const bc = (st: Status) => b?.tests.filter((t) => t.status === st).length ?? 0;
  const cov = e.coverage ?? [];
  const uncovered = cov.filter((x) => x.status !== "evaluated");
  const cc = (st: Status) => cov.filter((x) => x.status === st).length;
  let lastKind: string | null = null;

  return (
    <section className={`evalbar ${stale ? "is-stale" : ""}`} aria-label="Checks">
      {e.hardFailures.length > 0 && (
        <div className="hard-fail-line" role="alert">
          <IconAlert size={14} />
          <span><strong>Export blocked.</strong> {e.hardFailures.slice(0, 3).join(" · ")}{e.hardFailures.length > 3 ? ` · and ${e.hardFailures.length - 3} more` : ""}</span>
        </div>
      )}
      <div className="metric-row" role="group" aria-label="Checks">
        {groups.map((g) => {
          const kindKey = g.hardFail ? "blocking" : g.kind;
          const label = kindKey !== lastKind ? (g.hardFail ? "Blocking" : METRIC_KIND_LABEL[g.kind]) : null;
          lastKind = kindKey;
          const m = g.worst;
          return (
            <span key={g.id} className="metric-slot">
              {label && <span className="evalgroup-label">{label}</span>}
              <button
                className={`metric tone-${tone(m)}`}
                aria-pressed={s.metricFocus === g.id}
                aria-expanded={s.metricFocus === g.id}
                aria-controls={`metric-detail-${g.id}`}
                onClick={() => c.store.dispatch({ type: "focusMetric", metricId: g.id })}
                title={`${g.name}\n${m.definition}\n${METRIC_STATUS_LABEL[g.status]}, ${BASIS_LABEL[m.basis]}${m.threshold ? `, target ${fmtThreshold(m)}${m.threshold.hard ? " (required)" : ""}` : ""}${g.scopeNoun ? `\nShowing the worst of ${g.scopeNoun}; click for each one` : ""}`}
              >
                <StatusIcon status={m.status} passed={m.passed} />
                <span className="metric-name">{g.short}</span>
                <span className="metric-value num">{valueText(m)}</span>
                {m.threshold && m.status === "evaluated" && m.passed === false && <span className="metric-thr num">target {fmtThreshold(m)}</span>}
                {g.scopeNoun && <span className="metric-count" aria-label={`worst of ${g.scopeNoun}`}>{g.scopeShort}</span>}
              </button>
            </span>
          );
        })}
        <div className="coverage-line small">
          <span className="evalgroup-label">Coverage</span>
          <span className="cov-sum" title={uncovered.map((x) => `${x.description}: ${TEST_STATUS_LABEL[x.status].toLowerCase()}${x.statusReason ? ` (${x.statusReason})` : ""}`).join("\n") || undefined}>
            <span className="num">{cc("evaluated")}</span>/<span className="num">{cov.length}</span> threats evaluated
            {cc("unsupported") > 0 && <> · <span className="cov-unsup"><span className="num">{cc("unsupported")}</span> unsupported</span></>}
            {cc("failed") > 0 && <> · <span className="cov-failed"><span className="num">{cc("failed")}</span> failed to run</span></>}
            {cc("not_applicable") > 0 && <> · <span className="num">{cc("not_applicable")}</span> n/a</>}
            </span>
          {cov.length > 0 && (
            <button className="btn-link" aria-expanded={showThreats} aria-controls="threat-list" onClick={() => setShowThreats((x) => !x)}>
              {showThreats ? "Hide" : "Reasons"}
            </button>
          )}
          <span className="bench">
            {b ? (
              <button className="btn-link" onClick={() => c.store.dispatch({ type: "toggleDev", open: true, tab: "benchmark" })}>
                Benchmark: {bc("evaluated")} evaluated, {bc("unsupported")} unsupported, {bc("failed")} failed
              </button>
            ) : (
              <span className="muted" title="Benchmark not available for this upload: no ground truth or attacker data.">· no benchmark for this upload</span>
            )}
          </span>
        </div>
      </div>
      {focused && <GroupDetail g={focused} />}
      {showThreats && !b && <p className="muted small">Benchmark not available for this upload: no ground truth or attacker data.</p>}
      {showThreats && (
        <ul className="threats" id="threat-list">
          {[...uncovered, ...cov.filter((x) => x.status === "evaluated")].map((t) => (
            <li key={t.threatId} className={`threat tone-${covTone(t)}`}>
              <StatusIcon status={t.status} />
              <span><strong>{t.description}</strong>: {TEST_STATUS_LABEL[t.status].toLowerCase()}{t.statusReason ? ` (${t.statusReason})` : ""}
                <span className="muted"> · attacker knows: {t.attackerKnowledge}{t.evaluatedBy.length ? ` · by ${t.evaluatedBy.join(", ")}` : ""}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
