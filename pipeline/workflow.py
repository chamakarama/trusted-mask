"""Private local workflow, with real processing and revision-bound completion gates.

Run: python -m pipeline.workflow [--city-input private/city-v1]
Serves only dist-operator; planner is a separate dist-only server.
"""
from __future__ import annotations
import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
from urllib.parse import urlparse
import uuid
import tempfile
import zipfile

import numpy as np
from petpilot.inventory import build_inventory
from pipeline import artifact, city
from pipeline.bundle import bundle
from pipeline.inventory import HANDLING
from pipeline.mobility import load, validate, prepare, STOP_COLS, CAPS, EPS, COLUMNS, VALUES
from pipeline.public import sync_release
from pipeline.snapshot import snapshot, fingerprint

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT/'TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026'


class Workflow:
    def __init__(self, runtime, city_input=None, planner_url='http://127.0.0.1:8791/'):
        self.runtime = Path(runtime)
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.planner_url = planner_url
        self.datasets = {'aura': {'name': 'Aura Transit benchmark', 'data_class': 'supplied_synthetic', 'path': PACKAGE/'data/mobility'}}
        if city_input:
            self.datasets['city'] = {'name': 'Turku synthetic city', 'data_class': 'team_synthetic', 'path': Path(city_input).resolve()}
        self.lock = threading.Lock()
        self.state_file = self.runtime/'workflow.json'
        self.state = json.loads(self.state_file.read_text()) if self.state_file.exists() else {'revision': 0, 'completed': 0}

    def public_state(self):
        return {**self.state, 'datasets': [{'id': k, **{a:b for a,b in v.items() if a!='path'}, 'available': (v['path']/'taps.csv').exists()} for k,v in self.datasets.items()], 'policy': {'id': city.POLICY, 'caps': CAPS, 'epsilon': EPS}, 'planner_url': self.planner_url}

    def save(self):
        temp = self.state_file.with_suffix('.pending')
        temp.write_text(json.dumps(self.state, indent=2)+'\n')
        os.replace(temp, self.state_file)

    def fingerprint(self, ident):
        return fingerprint(self.datasets[ident]['path'], self.input_names(ident))

    def input_names(self, ident):
        names = {p.name for p in self.datasets[ident]['path'].glob('*.csv')}
        names.update(city.INPUTS if ident=='city' else ('taps.csv','stops.csv'))
        return sorted(names)

    def invalidate(self):
        self.state = {k:v for k,v in self.state.items() if k in ('revision','run_id','dataset_id','dataset_name','data_class')}
        self.state.update(completed=0, revision=self.state['revision']+1)
        self.save()

    def snapshot_path(self):
        return self.runtime/'inputs'/self.state['fingerprint']

    def evaluation_identity(self):
        return {'input_fingerprint':self.state['fingerprint'], 'manifest_sha256':self.state['candidate']['manifest_sha256'], 'evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

    def require(self, step):
        if self.state.get('completed', 0) < step:
            raise ValueError('STEP_INCOMPLETE: complete the previous step first')
        if self.state.get('dataset_id') not in self.datasets:
            raise ValueError('DATASET_UNAVAILABLE: restart with the registered dataset')
        if self.state.get('fingerprint'):
            try:
                stable = self.fingerprint(self.state['dataset_id']) == self.state['fingerprint'] == fingerprint(self.snapshot_path(), self.state['input_names'])
            except (ValueError, OSError): stable = False
            if not stable:
                self.invalidate()
                raise ValueError('INPUT_CHANGED: validate the dataset again; existing budget remains spent')

    def action(self, action, body):
        allowed = {'select': {'dataset_id'}, 'validate': set(), 'review': {'acknowledged'}, 'purpose': {'purpose'}, 'publish': set(), 'accept': {'acknowledged'}, 'share': set()}
        if action not in allowed or set(body) != allowed[action] | {'revision'}:
            raise ValueError('INVALID_REQUEST: unknown action or fields')
        if type(body['revision']) is not int or body['revision'] != self.state['revision']:
            raise ValueError('STALE_REVISION: refresh before changing this run')
        if action == 'select':
            ident = body['dataset_id']
            if ident not in self.datasets: raise ValueError('UNKNOWN_DATASET')
            self.state = {'revision': self.state['revision']+1, 'run_id': uuid.uuid4().hex, 'dataset_id': ident, 'dataset_name': self.datasets[ident]['name'], 'data_class': self.datasets[ident]['data_class'], 'completed': 0}
            self.save()
            return self.public_state()
        ident = self.state.get('dataset_id')
        if ident not in self.datasets: raise ValueError('SELECT_DATASET_FIRST')
        folder = self.datasets[ident]['path']
        if action == 'validate':
            self.invalidate()  # A failed rescan must never retain previous approval.
            names = self.input_names(ident)
            folder, digest = snapshot(folder, names, self.runtime/'inputs')
            taps, stops = load(folder)
            validate(taps, stops)
            if ident == 'aura':
                expected = {f['path']: f['sha256'] for f in json.loads((PACKAGE/'MANIFEST.json').read_text())['files']}
                for name in ('taps.csv','stops.csv'):
                    if hashlib.sha256((folder/name).read_bytes()).hexdigest() != expected['data/mobility/'+name]:
                        raise ValueError('MANIFEST_MISMATCH: benchmark inputs changed')
            else:
                city.prepare_city(folder)
            inventory = build_inventory(folder, 'mobility')
            for field in inventory['fields']:
                field['handling'] = HANDLING.get(field['column'], 'omit') if field['table']=='taps' else 'public_reference_lookup' if field['table']=='stops' and field['column'] in STOP_COLS else 'omit'
            self.state = {k:v for k,v in self.state.items() if k in ('revision','run_id','dataset_id','dataset_name','data_class')}
            if self.fingerprint(ident) != digest or fingerprint(folder,names) != digest: raise ValueError('INPUT_CHANGED: retry validation')
            self.state.update(completed=1, fingerprint=digest, input_names=names, inventory=inventory, validation={'taps': len(taps), 'stops': len(stops), 'areas': int(stops.area.nunique()), 'period': '6 Oct – 2 Nov 2025', 'status': 'validated'})
        elif action == 'review':
            self.require(1)
            if body['acknowledged'] is not True: raise ValueError('REVIEW_REQUIRED')
            self.state.update(completed=2, fields_acknowledged=True)
            for key in ('purpose','candidate','evaluation','acceptance','package'):
                self.state.pop(key, None)
        elif action == 'purpose':
            self.require(2)
            if body['purpose'] != 'aggregate_transport_planning': raise ValueError('UNSUPPORTED_SHARING_SCENARIO: only aggregate transport planning is supported')
            self.state.update(completed=3, purpose=body['purpose'])
            for key in ('candidate','evaluation','acceptance','package'): self.state.pop(key, None)
        elif action == 'publish':
            self.require(3)
            for key in ('candidate','evaluation','acceptance','package'): self.state.pop(key, None)
            self.state.update(completed=3,revision=self.state['revision']+1)
            self.save()
            folder = self.snapshot_path()
            if ident == 'aura':
                source = ROOT/'releases/e1-aura-001'
                receipt = {'release_id':'e1-aura-001', 'manifest_sha256': artifact.verify(source), 'reused': True}
                mode = 'Verified existing benchmark publication; no new noise drawn.'
            else:
                source = self.runtime/'candidate/city-turku-v1'
                receipt_file = self.runtime/'city-receipt.json'
                if receipt_file.exists():
                    prior = json.loads(receipt_file.read_text())
                    if prior['fingerprint'] != self.state['fingerprint']: raise ValueError('RELEASE_CONFLICT: existing publication belongs to different inputs')
                    receipt = prior['receipt']
                    if artifact.verify(source) != receipt['manifest_sha256']: raise ValueError('ARTIFACT_INVALID: candidate receipt')
                    receipt = {**receipt, 'reused': True}
                else:
                    receipt = city.publish(folder, source, self.runtime/'city-ledger.sqlite', 'city-turku-v1')
                    pending = receipt_file.with_suffix('.pending')
                    pending.write_text(json.dumps({'fingerprint':self.state['fingerprint'], 'receipt':receipt}))
                    os.replace(pending, receipt_file)
                mode = 'Existing committed city publication reused.' if receipt['reused'] else 'Protected with OpenDP; budget reserved and committed once.'
            self.state.update(completed=4, candidate={**receipt, 'mode': mode})
            self.save()  # Preserve receipt even if evaluation fails; never redraw on retry.
            domains, raw, bounded, _ = prepare(*load(folder))
            stats = json.loads((source/'statistics.json').read_text())
            metrics = {}
            for f in raw:
                if [tuple(r[c] for c in COLUMNS[f]) for r in stats[f]] != domains[f]: raise ValueError('DOMAIN_MISMATCH: evaluation')
                shown = np.array([r[VALUES[f]] for r in stats[f]])
                signed = np.array([r['noisy_value'] for r in stats[f]])
                denom = float(raw[f].sum())
                metrics[f] = {'wape': float(np.abs(shown-raw[f]).sum()/denom) if denom else None, 'cap_loss':float(1-bounded[f].sum()/denom) if denom else None, 'noise_mae': float(np.abs(signed-bounded[f]).mean())}
            cells = domains['od']
            candidates = [i for i,(a,b,band) in enumerate(cells) if a!=b and band=='06-09']
            best = sorted(candidates,key=lambda i:(-int(raw['od'][i]),cells[i]))[:3]
            selected = sorted(candidates,key=lambda i:(-stats['od'][i]['trips'],cells[i]))[:3]
            denom = sum(int(raw['od'][i]) for i in best)
            self.require(4)
            if artifact.verify(source) != self.state['candidate']['manifest_sha256']: raise ValueError('ARTIFACT_CHANGED')
            self.state['evaluation'] = {'identity':self.evaluation_identity(), 'metrics':metrics, 'morning_overlap':len(set(best)&set(selected)) if denom else None, 'draws':1, 'accuracy_target':0.2, 'accuracy_pass':metrics['od']['wape'] is not None and metrics['od']['wape']<=0.2, 'note':'Synthetic evaluation of this one artifact. Not destination truth, repeated-draw confirmation, or real-city validation.'}
        elif action == 'accept':
            self.require(4)
            if 'evaluation' not in self.state: raise ValueError('EVALUATION_INCOMPLETE')
            if self.state['evaluation'].get('identity') != self.evaluation_identity(): raise ValueError('EVALUATION_STALE')
            if body['acknowledged'] is not True: raise ValueError('LIMITATION_ACKNOWLEDGEMENT_REQUIRED')
            if artifact.verify(self.source()) != self.state['candidate']['manifest_sha256']: raise ValueError('ARTIFACT_CHANGED')
            self.state.update(completed=5, acceptance={'scope':'Exploratory aggregate planning only; sparse/uncertain estimates must not drive decisions.', 'local_demo_acknowledgement':True, 'release_hash':self.state['candidate']['manifest_sha256']})
        elif action == 'share':
            self.require(5)
            source = self.source()
            if self.state.get('evaluation',{}).get('identity') != self.evaluation_identity(): raise ValueError('EVALUATION_STALE')
            if artifact.verify(source) != self.state['acceptance']['release_hash']: raise ValueError('ARTIFACT_CHANGED')
            path = self.runtime/'packages'/f"{self.state['candidate']['release_id']}.zip"
            if path.exists(): self.verify_package(path, source)
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                with tempfile.TemporaryDirectory(prefix='.package-',dir=path.parent) as staging:
                    temporary = Path(staging)/path.name
                    bundle(source, temporary)
                    self.verify_package(temporary, source)
                    os.replace(temporary, path)
            # Public static directories receive only verified nine-member artifacts and schemas.
            for destination in (ROOT/'web/public', ROOT/'web/dist'):
                if destination.exists(): sync_release(source, destination)
            self.state.update(completed=6, package={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'url':'/api/package', 'planner_url':self.planner_url+'?release='+self.state['candidate']['release_id']})
        self.state['revision'] += 1
        self.save()
        return self.public_state()

    def source(self):
        return ROOT/'releases/e1-aura-001' if self.state['dataset_id']=='aura' else self.runtime/'candidate/city-turku-v1'

    @staticmethod
    def verify_package(path, source):
        try:
            members = sorted(artifact.PAYLOADS | {'manifest.json','checksums.sha256'})
            with zipfile.ZipFile(path) as archive:
                if archive.namelist() != members: raise ValueError('PACKAGE_INVALID')
                for name in members:
                    if archive.read(name) != (source/name).read_bytes(): raise ValueError('PACKAGE_INVALID')
        except (OSError, zipfile.BadZipFile, KeyError) as exc: raise ValueError('PACKAGE_INVALID') from exc

    def package_bytes(self):
        self.require(6)
        if artifact.verify(self.source()) != self.state['acceptance']['release_hash']: raise ValueError('ARTIFACT_CHANGED')
        data = (self.runtime/'packages'/f"{self.state['candidate']['release_id']}.zip").read_bytes()
        if hashlib.sha256(data).hexdigest() != self.state['package']['sha256']: raise ValueError('PACKAGE_CHANGED')
        return data


def handler_for(workflow, port):
    token = secrets.token_urlsafe(32)
    host = f'127.0.0.1:{port}'
    origin = 'http://'+host
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT/'web/dist-operator'), **kwargs)
        def end_headers(self):
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('X-Frame-Options','DENY')
            super().end_headers()
        def valid_host(self): return self.headers.get('Host') == host
        def respond(self, status, obj):
            data = json.dumps(obj).encode()
            self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        def do_GET(self):
            if not self.valid_host(): return self.respond(403, {'error':'HOST_REFUSED'})
            path = urlparse(self.path).path
            if path == '/api/state': return self.respond(200, {**workflow.public_state(), 'csrf':token, 'busy':workflow.lock.locked()})
            if path == '/api/package':
                if not workflow.lock.acquire(blocking=False): return self.respond(409, {'error':'JOB_RUNNING'})
                try:
                    data = workflow.package_bytes()
                    ident = workflow.state['candidate']['release_id']
                except (ValueError,OSError): return self.respond(409, {'error':'PACKAGE_NOT_READY_OR_CHANGED'})
                finally: workflow.lock.release()
                self.send_response(200); self.send_header('Content-Type','application/zip'); self.send_header('Content-Disposition',f'attachment; filename="{ident}.zip"'); self.send_header('Content-Length',str(len(data))); self.end_headers(); return self.wfile.write(data)
            if path.startswith('/api/'): return self.respond(404, {'error':'NOT_FOUND'})
            if path == '/': self.path = '/operator.html'
            return super().do_GET()
        def do_POST(self):
            if not self.valid_host() or self.headers.get('Origin') != origin or not secrets.compare_digest(self.headers.get('X-Workflow-Token',''),token): return self.respond(403, {'error':'ORIGIN_OR_TOKEN_REFUSED'})
            if self.headers.get('Content-Type') != 'application/json': return self.respond(415, {'error':'JSON_REQUIRED'})
            if not workflow.lock.acquire(blocking=False): return self.respond(409, {'error':'JOB_RUNNING'})
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size <= 8192: raise ValueError('INVALID_REQUEST_SIZE')
                body = json.loads(self.rfile.read(size))
                if not isinstance(body,dict): raise ValueError('INVALID_REQUEST')
                path = urlparse(self.path).path
                if not path.startswith('/api/action/'): return self.respond(404, {'error':'NOT_FOUND'})
                result = workflow.action(path.removeprefix('/api/action/'),body)
                self.respond(200,{**result,'csrf':token})
            except ValueError as exc:
                self.respond(409,{'error':str(exc)[:300], 'state':workflow.public_state()})
            except Exception:
                self.respond(500,{'error':'PROCESSING_FAILED: inspect local input/setup; no successful step recorded and any reserved budget remains spent.'})
            finally: workflow.lock.release()
        def log_message(self, format, *args): pass
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--city-input',type=Path)
    parser.add_argument('--runtime',type=Path,default=ROOT/'private/workflow')
    parser.add_argument('--port',type=int,default=8792)
    parser.add_argument('--planner-url',default='http://127.0.0.1:8791/')
    args = parser.parse_args()
    workflow = Workflow(args.runtime,args.city_input,args.planner_url)
    server = ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(workflow,args.port))
    print(f'Private workbench: http://127.0.0.1:{args.port}/operator.html',flush=True)
    server.serve_forever()


if __name__=='__main__': main()
