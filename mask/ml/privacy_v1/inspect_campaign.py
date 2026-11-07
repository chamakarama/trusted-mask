"""Inspect rehearsed demonstrations, adapter fixtures, and fresh long diagnostics."""
import argparse
import csv
import json
from pathlib import Path
from .bundle import load_model
from .data import digest
from .engine import Protector, RulesModel
from .experiment import DATA, ROOT, GoalAgnostic, canonical, diagnostics, write
from .tables import protect_table


def cells(path):
    if path.suffix == '.csv':
        from openpyxl.utils.cell import get_column_letter
        with path.open(newline='') as f:
            return {f'{get_column_letter(j)}{i}': value for i, row in enumerate(csv.reader(f), 1)
                    for j, value in enumerate(row, 1)}
    from openpyxl import load_workbook
    from openpyxl.utils.cell import get_column_letter
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        return {f'{get_column_letter(j)}{i}': cell.value if cell.value is not None else ''
                for i, row in enumerate(wb.worksheets[0], 1) for j, cell in enumerate(row, 1)}
    finally:
        wb.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path)
    parser.add_argument('--device', choices=('cpu', 'cuda'), default='cpu')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    model = load_model(args.model, args.device) if args.model else RulesModel()
    engine = Protector(model)
    train, _ = canonical()
    by_id = {r['id']: r for r in train}
    gallery = json.loads((ROOT / 'demo/web-examples.json').read_text())['examples']
    records = [by_id[e['training_record_id']] for e in gallery]
    diagnostics(model, records, args.output / 'gallery.json')
    write(args.output / 'gallery-targets.json', [{'id': e['id'], 'expected': e['expected_protected_text'],
          'actual': engine.protect_text(e['text'], e['intended_use']).protected_text,
          'used_in_training': True} for e in gallery])
    fresh = json.loads((ROOT / 'evidence/privacy-v1/training-2026-11-07/fresh-long-messages.json').read_text())
    assert all(100 <= len(r['text'].split()) <= 150 for r in fresh)
    diagnostics(model, fresh, args.output / 'fresh.json')
    diagnostics(GoalAgnostic(model), fresh, args.output / 'fresh-goal-agnostic.json')
    fixtures = DATA / 'adapter-fixtures'
    results = []
    for fixture in json.loads((fixtures / 'manifest.json').read_text())['fixtures']:
        source = fixtures / fixture['file']
        assert digest(source) == fixture['sha256']
        target = args.output / ('protected-' + source.name)
        row = {'file': source.name, 'training_derived': True, 'before': cells(source)}
        try:
            row['report'] = protect_table(engine, source, target, fixture['intended_use'])
            row['after'] = cells(target)
            expected = fixture.get('expected_cells', {}) | fixture.get('unchanged_cells', {})
            if fixture.get('expected_file'):
                expected = cells(fixtures / fixture['expected_file'])
            row['expected'] = expected
            row['mismatches'] = {cell: {'expected': value, 'actual': row['after'].get(cell)}
                                 for cell, value in expected.items() if row['after'].get(cell) != value}
        except Exception as error:
            row['error'] = f'{type(error).__name__}: {error}'
        results.append(row)
        print(json.dumps({'fixture': source.name, 'mismatches': len(row.get('mismatches', {})),
                          'error': row.get('error')}), flush=True)
    write(args.output / 'adapters.json', results)


if __name__ == '__main__':
    main()
