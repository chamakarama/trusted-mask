"""Deterministic synthetic development data. No external/private messages; no test gold."""
import argparse
import json
from pathlib import Path
from .data import digest, load_records

FIRST_NAMES = ("Alina", "Darius", "Emilia", "Farid", "Grace", "Hugo", "Imani", "Jonas")
SURNAMES = ("Birch", "Cedar", "Dale", "Elm", "Flint", "Grove", "Hill", "Iris", "Jade", "Knoll",
            "Lake", "Moss", "North", "Oak", "Pine", "Quartz", "Reed", "Stone", "Thorn", "Vale",
            "West", "Yarrow", "Zinnia", "Brook")


def build():
    records = []
    for family in range(8):
        split = "dev" if family in (3, 7) else "train"
        for variant in range(24):
            person = f"{FIRST_NAMES[family]} {SURNAMES[variant]}"
            email = f"subject{family}-{variant}@example.invalid"
            health = ("I have asthma and take 5 mg daily", "I have diabetes but do not take insulin",
                      "My blood pressure was 120/80 yesterday")[variant % 3]
            financial = f"My monthly rent is {700 + variant * 10} euros"
            age = str(28 + variant)
            parts = [
                ["My name is ", (person, "PERSON"), "; ", (health, "HEALTH"), "; email: ", (email, "EMAIL"), "."],
                ["Note for review. ", (person, "PERSON"), " wrote: ", (health, "HEALTH"), "; ", (financial, "FINANCIAL"), "."],
                ["Name: ", (person, "PERSON"), "; age ", (age, "AGE"), "; ", (health, "HEALTH"), "; username: ", (f"member_{family}_{variant}", "USERNAME"), "."],
                ["Regarding ", (person, "PERSON"), ": ", (health, "HEALTH"), "; contact ", (email, "EMAIL"), "; ", (financial, "FINANCIAL"), "."],
                ["Record owner: ", (person, "PERSON"), "; ", (financial, "FINANCIAL"), "; ", (health, "HEALTH"), "; password: ", (f"SYNTHETIC-{family}-{variant}-only", "SECRET"), "."],
                ["Patient: ", (person, "PERSON"), "; age ", (age, "AGE"), "; ", (health, "HEALTH"), "; phone ", (f"+1 202 555 {100 + variant:04d}", "PHONE"), "."],
                ["Customer note: ", (health, "HEALTH"), "; ", (financial, "FINANCIAL"), "; account id: ", (f"DEMO-{family}-{variant}", "ACCOUNT_ID"), "; ", (person, "PERSON"), "."],
                ["Sender ", (person, "PERSON"), " supplied ", (email, "EMAIL"), "; ", (financial, "FINANCIAL"), "; ", (health, "HEALTH"), "."],
            ][family]
            text, spans = "", []
            for part in parts:
                if isinstance(part, str):
                    text += part
                else:
                    value, label = part
                    spans.append({"start": len(text), "end": len(text) + len(value), "label": label})
                    text += value
            for topic, task in (("HEALTH", "Explain the health information and medication amounts."),
                                ("FINANCIAL", "Help plan a budget using the rent and other financial information.")):
                targets = []
                for span in spans:
                    label = span["label"]
                    relevant = label == topic or label == "AGE" and topic == "HEALTH"
                    targets.append({**span, "action": "ALIAS" if label == "PERSON" else "KEEP" if relevant else "PLACEHOLDER",
                                    "relevance": "essential" if relevant else "unnecessary"})
                records.append({"id": f"pilot-{family}-{variant}-{topic.lower()}", "family_id": f"template-{family}",
                    "persona_id": f"synthetic-person-{family}-{variant}", "split": split, "text": text, "task": task,
                    "context": "", "spans": targets, "language": "en", "input_kind": "message",
                    "provenance": {"source": "make_pilot.py/v1", "synthetic": True,
                                   "annotation": "programmatic_planted_values", "human_audited": False},
                    "required_facts": [text[s["start"]:s["end"]] for s in targets if s["action"] == "KEEP"]})
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = build()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    load_records(args.output)
    manifest = {"schema_version": 1, "purpose": "engineering_pilot_only", "records": len(records),
                "sha256": digest(args.output), "splits": {s: sum(r["split"] == s for r in records) for s in ("train", "dev")},
                "independent_release_evidence": False, "limitations": ["eight templates only", "no human audit",
                "messages only; spreadsheet datasets still required", "no validation or final-test set",
                "ROLE, GENERALISE and DROP lack training examples; unavailable until labelled"]}
    args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
