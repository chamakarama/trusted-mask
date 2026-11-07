"""Make two portable demo files. Raw output stays outside the public build."""
import argparse
import json
from pathlib import Path
from pipeline.transfer import protected_document, raw_document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for name, doc in [('01-RAW.json', raw_document(args.input)),
                      ('02-PROTECTED.json', protected_document(args.release))]:
        target = args.output / name
        target.write_text(json.dumps(doc, separators=(',', ':'), ensure_ascii=False) + '\n')
        print(f'{name}: {target.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
