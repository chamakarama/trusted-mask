"""Package reference policy verbatim; mechanically make model calls awaitable.

No duplicate JavaScript regex/policy implementation. A source digest and parity
tests bind this build to the exact Python implementation in this checkout.
"""
import ast
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[3]
from source_snapshot import snapshot
SOURCE = snapshot() / 'mask/ml/privacy_v1'
DEST = ROOT / 'mask/browser/public/policy'
FILES = ('contracts', 'engine', 'policy', 'candidates', 'editing', 'rules', 'features', 'identifiers', 'validators', 'sections', 'section_pipeline')


class AsyncEngine(ast.NodeTransformer):
    methods = {'_decision', '_segment', 'protect_text', 'protect_segment'}

    def visit_FunctionDef(self, node):
        node = self.generic_visit(node)
        if node.name in self.methods:
            return ast.AsyncFunctionDef(**{k: getattr(node, k) for k in node._fields})
        return node

    def visit_Call(self, node):
        node = self.generic_visit(node)
        if isinstance(node.func, ast.Attribute):
            owner = ast.unparse(node.func.value)
            if (owner in {'self', 'protector'} and node.func.attr in self.methods) or (owner in {'self.model', 'model'} and node.func.attr in {'detect', 'predict', 'predict_sections'}):
                return ast.Await(node)
        if isinstance(node.func, ast.Name) and node.func.id == 'protect_segment':
            return ast.Await(node)
        return node

    def visit_GeneratorExp(self, node):
        node = self.generic_visit(node)
        # any()/all() consume sync iterables; await the decisions into a list.
        if any(isinstance(x, ast.Await) for x in ast.walk(node)):
            return ast.ListComp(elt=node.elt, generators=node.generators)
        return node


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    hashes = {}
    with zipfile.ZipFile(DEST / 'policy.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('privacy_core/__init__.py', '')
        for name in FILES:
            source = (SOURCE / f'{name}.py').read_text()
            hashes[name] = hashlib.sha256(source.encode()).hexdigest()
            if name in {'engine', 'section_pipeline'}:
                source = ast.unparse(ast.fix_missing_locations(AsyncEngine().visit(ast.parse(source))))
                compile(source, 'engine.py', 'exec')
            archive.writestr(f'privacy_core/{name}.py', source)
        archive.write(ROOT / 'mask/browser/src/browser_model.py', 'browser_model.py')
    (DEST / 'sources.json').write_text(json.dumps(hashes, indent=2) + '\n')
    print('Packaged reference policy with awaitable inference calls')


if __name__ == '__main__':
    main()
