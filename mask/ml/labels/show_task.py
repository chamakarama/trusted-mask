"""Print a task file (or a task + its annotation) without the goal embedding vector, for annotation agents.
Usage: python3 -I ml/labels/show_task.py <task.json> [<annotation.json>]
"""
import json, sys
for path in sys.argv[1:]:
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, dict) and isinstance(d.get("goal"), dict):
        d["goal"].pop("embedding", None)
    print(f"=== {path}")
    print(json.dumps(d, indent=1, ensure_ascii=False))
