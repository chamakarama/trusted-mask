"""Run the real assistant proxy against a local fake provider; no paid/API call."""
import http.server,threading,json,os,subprocess,time,urllib.request,urllib.error
from pathlib import Path
calls=[]
class Stub(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,data):
  b=json.dumps(data).encode();self.send_response(200);self.send_header('content-type','application/json');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  calls.append(('GET',self.path));self.send({'id':'claude-opus-5-5','type':'model','display_name':'local test','created_at':'2026-01-01T00:00:00Z'})
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['content-length'])));calls.append(('POST',self.path))
  assert 'PRIVATE_CANARY' not in json.dumps(body)
  out={'kind':'rank_corridors','hour_band':'06-09','origin_area':None,'limit':3,'note':'UNTRUSTED_NOTE_999999'}
  self.send({'id':'msg_local','type':'message','role':'assistant','model':'claude-opus-5-5','content':[{'type':'text','text':json.dumps(out)}],'stop_reason':'end_turn','stop_sequence':None,'usage':{'input_tokens':1,'output_tokens':1}})
stub=http.server.ThreadingHTTPServer(('127.0.0.1',8789),Stub);threading.Thread(target=stub.serve_forever,daemon=True).start()
env={k:v for k,v in os.environ.items() if not k.startswith('ANTHROPIC_')}
env.update(ANTHROPIC_API_KEY='local-test-placeholder-not-a-secret',ANTHROPIC_BASE_URL='http://127.0.0.1:8789',ASSISTANT_PORT='8790')
proc=subprocess.Popen(['node','web/server/assistant.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def request(path,body=None,origin='http://127.0.0.1:5173'):
 req=urllib.request.Request('http://127.0.0.1:8790'+path,data=None if body is None else json.dumps(body).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
try:
 for _ in range(100):
  try:
   code,health=request('/health')
   if health.get('ok'):break
  except OSError:pass
  time.sleep(.05)
 else:raise RuntimeError('proxy did not start against local stub')
 code,denied=request('/intent',{'question':'Busiest morning routes?'},'http://untrusted.invalid');assert code==403
 assert not [c for c in calls if c[0]=='POST']
 code,answer=request('/intent',{'question':'Busiest morning routes?'})
 assert code==200,(code,answer)
 assert answer=={'kind':'intent','intent':{'view':'od','hour_band':'06-09','origin_area':None,'action':'rank_corridors','limit':3}},answer
 code,throttled=request('/intent',{'question':'Busiest morning routes?'});assert code==429
 assert len([c for c in calls if c[0]=='POST'])==1
 report={'scope':'actual Node assistant proxy plus actual Anthropic SDK configured to loopback stub, placeholder key only, no real provider/model call','proxy_source_sha256':__import__('hashlib').sha256(Path('web/server/assistant.mjs').read_bytes()).hexdigest(),'untrusted_origin_refused':True,'model_note_removed':True,'typed_intent_exact':True,'immediate_repeat_throttled':True,'provider_stub_calls':calls,'passed':True}
 Path('evidence/e6/assistant-proxy-local.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:
 proc.terminate();proc.wait(timeout=5);stub.shutdown();stub.server_close()
