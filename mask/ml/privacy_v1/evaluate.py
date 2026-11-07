"""Development diagnostics only; no test selection, no detector-as-ground-truth."""
import argparse
import json
import time
from pathlib import Path
from .bundle import load_model, verify
from .contracts import DIRECT, Span
from .data import digest, load_records
from .engine import Protector, RulesModel
from .policy import allowed_actions
from .candidates import build_candidates


def covered(a, b, intervals):
    cursor = a
    for start, end in sorted(intervals):
        if start > cursor:
            break
        if end > cursor:
            cursor = end
        if cursor >= b:
            return True
    return False


def evaluate(model, records):
    protector = Protector(model)
    counts = {k: 0 for k in ("records", "gold_spans", "gold_detection_spans", "detected_gold_exact", "gold_action_correct",
              "gold_relevance_correct", "required_removal", "required_removed", "direct_required",
              "direct_removed", "required_facts", "facts_retained", "ready", "unsupported",
              "predicted_spans", "benign_characters", "benign_characters_changed")}
    durations = []
    for record in records:
        text = record["text"]
        counts["records"] += 1
        entities, sections, _ = build_candidates(text, model.detect(text))
        found = {(s.start, s.end, s.label) for s in entities + sections}
        counts["predicted_spans"] += len(found)
        for target in record.get("detection_spans", record["spans"]):
            counts["gold_detection_spans"] += 1
            counts["detected_gold_exact"] += (target["start"], target["end"], target["label"]) in found
        start = time.perf_counter()
        result = protector.protect_text(text, record["task"])
        durations.append(time.perf_counter() - start)
        counts["ready"] += result.status == "ready"
        counts["unsupported"] += result.status == "unsupported"
        sensitive_characters = {i for s in record["spans"] for i in range(s["start"], s["end"])}
        benign = set(range(len(text))) - sensitive_characters
        changed = {i for edit in result.edits for i in range(edit.start, edit.end)}
        counts["benign_characters"] += len(benign)
        counts["benign_characters_changed"] += len(benign & changed)
        for target in record["spans"]:
            span = Span(target["start"], target["end"], target["label"])
            counts["gold_spans"] += 1
            pred = model.predict(text, span, record["task"], record.get("context", ""))
            allowed = allowed_actions(span, text[span.start:span.end])
            counts["gold_action_correct"] += max(allowed, key=lambda a: pred.actions[a]) == target["action"]
            counts["gold_relevance_correct"] += max(pred.relevance, key=pred.relevance.get) == target["relevance"]
            if target["action"] != "KEEP":
                counts["required_removal"] += 1
                removed = result.protected_text is not None and covered(span.start, span.end,
                    [(e.start, e.end) for e in result.edits if e.action != "KEEP"])
                counts["required_removed"] += bool(removed)
                if span.label in DIRECT:
                    counts["direct_required"] += 1
                    counts["direct_removed"] += bool(removed)
        facts = [text[f["start"]:f["end"]] if isinstance(f, dict) else f for f in record["required_facts"]]
        counts["required_facts"] += len(facts)
        counts["facts_retained"] += sum(fact in (result.protected_text or "") for fact in facts)
    ratio = lambda n, d: counts[n] / counts[d] if counts[d] else None
    return {"counts": counts, "gold_span_action_accuracy_diagnostic": ratio("gold_action_correct", "gold_spans"),
        "exact_detector_recall": ratio("detected_gold_exact", "gold_detection_spans"),
        "exact_detector_precision": ratio("detected_gold_exact", "predicted_spans"),
        "draft_benign_character_change_rate": ratio("benign_characters_changed", "benign_characters"),
        "gold_span_relevance_accuracy_diagnostic": ratio("gold_relevance_correct", "gold_spans"),
        "draft_required_removal_coverage": ratio("required_removed", "required_removal"),
        "draft_direct_removal_coverage": ratio("direct_removed", "direct_required"),
        "draft_exact_fact_retention": ratio("facts_retained", "required_facts"),
        "automatic_coverage": ratio("ready", "records"),
        "latency_seconds": {"median": sorted(durations)[len(durations)//2],
                            "p95": sorted(durations)[min(len(durations)-1, int(len(durations)*0.95))]},
        "runtime_versions": protector.runtime_versions(),
        "release_pass": False, "independent_evidence": False,
        "limitations": ["programmatic pilot labels are not independently audited",
                        "draft metrics include review outputs and are not successful automatic exports",
                        "gold-span classification is diagnostic, not end-to-end privacy",
                        "span coverage does not measure inference attacks or downstream utility"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path)
    parser.add_argument("--baseline", choices=("none", "rules", "goal-agnostic"), default="none")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--split", choices=("train", "dev"), default="dev")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    args = parser.parse_args()
    records = [r for r in load_records(args.data) if r["split"] == args.split]
    if not records:
        parser.error("Empty evaluation split")
    if args.baseline != "rules" and args.model is None:
        parser.error("--model is required except for the rules baseline")
    model = RulesModel() if args.baseline == "rules" else load_model(args.model, args.device)
    if args.baseline == "goal-agnostic":
        base = model
        class GoalAgnostic:
            model_id = base.model_id + "-goal-agnostic"
            def __getattr__(self, name):
                return getattr(base, name)
            def detect(self, text):
                return base.detect(text)
            def predict(self, text, span, task, context=""):
                return base.predict(text, span, "Summarise the information.", context)
        model = GoalAgnostic()
    report = evaluate(model, records)
    report.update({"model": verify(args.model) if args.model else {"track": "rules"}, "baseline": args.baseline,
                   "dataset_sha256": digest(args.data), "split": args.split,
                   "families": len({r["family_id"] for r in records}),
                   "bundle_bytes": sum(p.stat().st_size for p in args.model.rglob("*") if p.is_file()) if args.model else None})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ("model", "limitations")}))


if __name__ == "__main__":
    main()
