"""CLI. Input via local files; no raw text in shell arguments or logs."""
import argparse
import json
import sys
from pathlib import Path
from .bundle import load_model
from .sections import SECTION_MODES
from .engine import MAX_CONTEXT_CHARS, MAX_TEXT_CHARS, Protector
from .tables import UnsupportedFile, protect_table, publish_bytes, read_bounded


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--task-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--table", action="store_true")
    parser.add_argument("--section-mode", choices=("legacy", *SECTION_MODES), default="legacy")
    args = parser.parse_args()
    try:
        # Byte and character limits are both enforced, preserving original line endings.
        task = read_bounded(args.task_file, MAX_CONTEXT_CHARS * 4 + 3).decode("utf-8-sig")
        if len(task) > MAX_CONTEXT_CHARS:
            raise UnsupportedFile("task_size_limit")
        engine = Protector(load_model(args.model) if args.model else None, section_mode=args.section_mode)
        if args.table:
            result = protect_table(engine, args.input, args.output, task)
            print(json.dumps(result, ensure_ascii=False))
        else:
            source = read_bounded(args.input, MAX_TEXT_CHARS * 4 + 3).decode("utf-8-sig")
            result = engine.protect_text(source, task)
            content = (json.dumps(result.as_dict(), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            publish_bytes(args.output, content)
            print(json.dumps({"status": result.status, "complete": result.coverage.get("complete", False)}))
            return 2 if result.status == "unsupported" else 0
    except UnsupportedFile as error:
        print(json.dumps({"status": "unsupported", "error": str(error)}), file=sys.stderr)
        return 2
    except FileExistsError:
        print(json.dumps({"status": "unsupported", "error": "output_already_exists"}), file=sys.stderr)
        return 2
    except (OSError, UnicodeError, ValueError, RuntimeError, KeyError, TypeError) as error:
        # Neither model exceptions nor filesystem errors may echo private source values/paths.
        print(json.dumps({"status": "unsupported", "error": "processing_failed", "error_type": type(error).__name__}), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
