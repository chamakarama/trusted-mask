"""Trace section gates with fixed weights, or prepare aligned supervision.

No fitting, threshold tuning, network calls or automatic deployment. Outputs
may contain full synthetic input/output examples; use an explicit local path.
"""
import argparse
import json
from collections import Counter
from pathlib import Path
from .data import validate_records, digest
from .annotation.tools import read
from .sections import SECTION_MODE, SECTION_MODES, section_targets
from .engine import Protector
from .bundle import load_model


def audit_record(model, record, mode):
    result = Protector(model, section_mode=mode).protect_text(record["text"], record["task"])
    drops = [d for d in record.get("decisions", record.get("spans", [])) if d["action"] == "DROP"]
    intervals = [(e.start,e.end) for e in result.edits if e.action == "DROP"]
    failures = []
    for d in drops:
        a,b = d["start"],d["end"]
        removed = all(c.isspace() or any(x<=i<y for x,y in intervals)
                      for i,c in enumerate(record["text"][a:b],a))
        if not removed:
            traces = [t for t in result.section_diagnostics if t["start"]<b and a<t["end"]]
            failures.append({"start":a,"end":b,"reason":"not_proposed" if not traces else "proposed_but_not_fully_removed",
                             "candidate_reasons":[t["reason"] for t in traces]})
    facts = record.get("required_facts", [])
    quotes = [record["text"][f["start"]:f["end"]] if isinstance(f,dict) else f for f in facts]
    decisions = record.get("decisions",record.get("spans",[]))
    edited = {i for e in result.edits for i in range(e.start,e.end)}
    keep_chars = {i for d in decisions if d["action"]=="KEEP" for i in range(d["start"],d["end"])}
    annotated_chars = {i for d in decisions for i in range(d["start"],d["end"])}
    benign_chars = set(range(len(record["text"]))) - annotated_chars
    return {"id":record["id"],"split":record["split"],"mode":mode,
            "keep_characters_changed":len(edited & keep_chars),
            "unannotated_characters_changed":len(edited & benign_chars),
            "required_drops":len(drops),"missed_drops":len(failures),"drop_failures":failures,
            "required_facts":len(quotes),"retained_facts":sum(q in (result.protected_text or "") for q in quotes),
            "result":result.as_dict()}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--data",type=Path,required=True)
    p.add_argument("--model",type=Path)
    p.add_argument("--device",choices=("cpu","cuda","mps"),default="cpu")
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--section-mode",choices=SECTION_MODES,default=SECTION_MODE)
    args=p.parse_args()
    if args.output.exists():p.error("Use a fresh output path")
    records=validate_records(read(args.data))
    targets=[{"id":r["id"],"family_id":r["family_id"],"split":r["split"],"text":r["text"],"task":r["task"],
              "sections":section_targets(r,args.section_mode)} for r in records]
    report={"dataset_sha256":digest(args.data),"section_mode":args.section_mode,"records":len(records),
            "target_counts":dict(Counter(str(t["target"]) for r in targets for t in r["sections"])),
            "targets":targets,"limitations":["Experimental inference mode; no demonstrated quality gain without model comparisons.",
            "Unlabelled sections are not negative labels. Keep splits/families intact for any later training.",
            "Existing category-conditioned heads are probed; no new dedicated relevance head has been trained."]}
    if args.model:
        model=load_model(args.model,device=args.device)
        report["model_manifest_sha256"]=digest(args.model/"manifest.json")
        report["comparisons"]=[audit_record(model,r,mode) for r in records for mode in ("legacy",args.section_mode)]
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open("x") as f:json.dump(report,f,indent=2,ensure_ascii=False)
    print(json.dumps({"output":str(args.output),"records":len(records),"target_counts":report["target_counts"],"model_run":bool(args.model)}))


if __name__ == "__main__":main()
