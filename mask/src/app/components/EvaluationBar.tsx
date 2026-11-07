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

/** Counts for the one-line summary. Hard failures are counted separately and shown as their own red line. */
export function checkSummary(groups: MetricGroup[]) {
  const ok = groups.filter((g) => g.status === "evaluated" && !g.fail).length;
  const review = groups.filter((g) => g.fail && !g.hardFail).length;
  const blocking = groups.filter((g) => g.hardFail).length;
  const unmeasurable = groups.filter((g) => g.status === "unsupported" || g.status === "failed").length;
  const na = groups.filter((g) => g.status === "not_applicable").length;
  return { ok, review, blocking, unmeasurable, na };
}

/** Expanded checks: grouped list (one row per check), per-scope detail, then threat coverage and benchmark. */
export function ChecksPanel() {
  const s = useAppState();
  const c = useController();
  const e = s.evaluation!;
  const groups = groupMetrics(e.metrics);
  const cov = e.coverage ?? [];
  const b = e.benchmark;
  const bc = (st: Status) => b?.tests.filter((t) => t.status === st).length ?? 0;
  const kinds = (["risk", "utility", "integrity"] as const).map((k) => ({ k, items: groups.filter((g) => g.kind === k) })).filter((x) => x.items.length);
  return (
    <div className="checks-panel" id="checks-panel">
      {kinds.map(({ k, items }) => (
        <div key={k} className="checks-group" role="group" aria-label={METRIC_KIND_LABEL[k]}>
          <h4>{METRIC_KIND_LABEL[k]}</h4>
          <ul className="check-list">
            {items.map((g) => {
              const m = g.worst;
              const open = s.metricFocus === g.id;
              return (
                <li key={g.id} className={`check tone-${tone(m)}`}>
                  <button
                    className="check-row"
                    aria-expanded={open}
                    aria-controls={`metric-detail-${g.id}`}
                    onClick={() => c.store.dispatch({ type: "focusMetric", metricId: g.id })}
                    title={`${g.name}\n${m.definition}`}
                  >
                    <StatusIcon status={m.status} passed={m.passed} />
                    <span className="check-name">{g.name}</span>
                    <span className="check-val num">{valueText(m)}</span>
                    <span className="check-meta muted">
                      {m.threshold && m.status === "evaluated" ? `target ${fmtThreshold(m)}${m.threshold.hard ? ", required" : ""}` : ""}
                      {g.scopeNoun ? `${m.threshold && m.status === "evaluated" ? " · " : ""}worst of ${g.scopeNoun}` : ""}
                    </span>
                  </button>
                  {open && <GroupDetail g={g} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="checks-group" role="group" aria-label="Coverage">
        <h4>Coverage <span className="muted">· {cov.filter((x) => x.status === "evaluated").length} of {cov.length} threats evaluated</span></h4>
        <ul className="threats" id="threat-list">
          {[...cov.filter((x) => x.status !== "evaluated"), ...cov.filter((x) => x.status === "evaluated")].map((t) => (
            <li key={t.threatId} className={`threat tone-${covTone(t)}`}>
              <StatusIcon status={t.status} />
              <span><strong>{t.description}</strong>: {TEST_STATUS_LABEL[t.status].toLowerCase()}{t.statusReason ? ` (${t.statusReason})` : ""}
                <span className="muted"> · attacker knows: {t.attackerKnowledge}{t.evaluatedBy.length ? ` · by ${t.evaluatedBy.join(", ")}` : ""}</span></span>
            </li>
          ))}
        </ul>
        <p className="small bench-line">
          {b ? (
            <button className="btn-link" onClick={() => c.store.dispatch({ type: "toggleDev", open: true, tab: "benchmark" })}>
              Benchmark: {bc("evaluated")} tests evaluated, {bc("unsupported")} unsupported, {bc("failed")} failed
            </button>
          ) : <span className="muted">Benchmark not available for this upload: no ground truth or attacker data.</span>}
        </p>
      </div>
    </div>
  );
}
