"""Builds the detector lexicons from the TRAINING split of the synthetic TrustED package (see generated headers).
HOLDOUT=1 leaves the fixture conversations out (used once to check that fixture scores do not depend on them)."""
import csv,collections,re,json,pickle
import pathlib
HERE=pathlib.Path(__file__).resolve().parent
MASK=HERE.parents[3]
P=str(MASK.parent/"TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026")+"/"
D=P+"data/"
OUT=str(HERE)+"/"
csv.field_size_limit(10**9)
import os
HOLD=set()
if os.environ.get("HOLDOUT"):
  HOLD=set(r["conversation_id"] for r in csv.DictReader(open(MASK/"fixtures/customer_service_small/conversations.csv")))
NAME=re.compile(r"^(?=[^\W\d_])(?:[^\W\d_]|['-])+$")
ORGW=re.compile(r"\b(oy|oyj|ab|ky|tmi|ry|ltd|bank|pankki|oy ab|yhtiö|kunta|kaupunki)\b",re.I)
full=[("customer_service/customers.csv","full_name"),("customer_service/conversations.csv","agent_name"),
 ("health/ed_visits.csv","patient_name"),("health/ed_visits.csv","attending_physician_name"),("health/clinical_notes.csv","author_name"),
 ("mobility/cards.csv","holder_name"),("energy/customers.csv","customer_name"),("finance/customers.csv","full_name"),("finance/transfers.csv","from_name"),
 ("cyber/identity.csv","display_name"),("cyber/incident_tickets.csv","reporter_name"),("education/students.csv","guardian1_name"),("education/students.csv","guardian2_name"),
 ("education/course_grades.csv","teacher_name"),("education/counsellor_notes.csv","author_name"),("public_admin/service_requests.csv","reporter_name"),
 ("public_admin/service_requests.csv","handler_name"),("public_admin/building_permits.csv","applicant_name"),("public_admin/building_permits.csv","case_officer")]
first=collections.Counter(); last=collections.Counter()
def train_ok(f,r):
  return not (f.startswith("customer_service/conversations") and (r.get("split")!="train" or r.get("conversation_id") in HOLD))
cs_train_customers=set(r["customer_id"] for r in csv.DictReader(open(D+"customer_service/conversations.csv")) if r["split"]=="train" and r["conversation_id"] not in HOLD)
for f,c in full:
  for r in csv.DictReader(open(D+f)):
    if not train_ok(f,r): continue
    if f=="customer_service/customers.csv" and r["customer_id"] not in cs_train_customers: continue
    v=(r.get(c) or "").strip()
    if not v or ORGW.search(v): continue
    parts=v.split()
    if len(parts)<2 or not all(NAME.match(p) for p in parts): continue
    for p in parts[:-1]: first[p.lower()]+=1
    last[parts[-1].lower()]+=1
for r in csv.DictReader(open(D+"education/students.csv")):
  for p in r["first_names"].split():
    if NAME.match(p): first[p.lower()]+=1
  if NAME.match(r["last_name"]): last[r["last_name"].lower()]+=1
for r in csv.DictReader(open(D+"cyber/identity.csv")):
  if NAME.match(r["given_name"]): first[r["given_name"].lower()]+=1
  if NAME.match(r["surname"]): last[r["surname"].lower()]+=1
# places
places=collections.Counter()
for f,c in [("customer_service/customers.csv","city"),("education/students.csv","municipality"),("energy/customers.csv","municipality"),
            ("finance/customers.csv","city"),("health/ed_visits.csv","municipality"),("mobility/stops.csv","municipality"),
            ("public_admin/building_permits.csv","municipality"),("public_admin/service_requests.csv","municipality"),
            ("cyber/signin_logs.csv","geo_city"),("finance/card_transactions.csv","merchant_city")]:
  for r in csv.DictReader(open(D+f)):
    v=(r.get(c) or "").strip()
    if v and len(v)>2 and not re.search(r"\d",v) and v.lower() not in ("internal","non-resident","unknown"): places[v.lower()]+=1
# stopwords: lexicon tokens that are mostly not PERSON in the train texts
texts={}
HOLD_TURNS=set()
for r in csv.DictReader(open(D+"customer_service/turns.csv")):
  texts[r["turn_id"]]=r["text"]
  if r["conversation_id"] in HOLD: HOLD_TURNS.add(r["turn_id"])
for r in csv.DictReader(open(D+"customer_service/conversations.csv")):
  if r["split"]=="train": texts[r["conversation_id"]]=r["agent_note"]
gold={}
for fn in ["customer_service__turns__text.jsonl","customer_service__conversations__agent_note.jsonl"]:
  for line in open(P+"metadata/pii_spans/"+fn):
    o=json.loads(line); gold[o["record_id"]]=o["spans"]
lex=set(first)|set(last)
occ=collections.Counter(); inp=collections.Counter()
TOK=re.compile(r"[^\W\d_]+(?:-[^\W\d_]+)*")
for rid,sp in gold.items():
  t=texts.get(rid)
  if t is None or rid in HOLD or rid in HOLD_TURNS: continue
  per=[(s["start"],s["end"]) for s in sp if s["label"]=="PERSON"]
  for m in TOK.finditer(t):
    w=m.group().lower()
    if w in lex:
      occ[w]+=1
      if any(a<=m.start()<b for a,b in per): inp[w]+=1
stop=sorted(w for w in occ if occ[w]>=3 and inp[w]/occ[w]<0.5)
manual="onneksi toivon toivo lunta lumi onni aura salo kallio laine ilta tuuli päivi usko armas aamu valo sulo rauha into lahja satu kaino aino oiva tähti meri voitto jalo veli viljo kai aleksi hilla ruusu tuomi sade aava aallokko".split()
# 'satu','aino','kai','meri','tuomi' remain names unless corpus says otherwise; keep only true common words
manual_common={"onneksi","toivon","lunta","lumi","aura","salo","ilta","tuuli","usko","aamu","valo","rauha","into","lahja","tähti","sade","aava","aallokko","kallio","laine","meri","voitto","jalo","hilla","ruusu","niin","power","storm","rose","ring","will","may","mark","bill"}
stop=sorted(set(stop)|manual_common)
first_l=sorted(w for w in first if len(w)>=2)
last_l=sorted(w for w in last if len(w)>=3)
place_l=sorted(places)
hdr=("/**\n * GENERATED from the TRAINING split of the synthetic TrustED PETs package (CC BY 4.0, Since AI ry):\n"
     " * name columns of the train-split datasets (and, for the stoplist, the public train span labels).\n"
     " * Because the lexicon comes from training-split synthetic data, measurements on the train split (and on\n"
     " * fixtures drawn from it) are OPTIMISTIC. Regenerate with `python3 -I src/core/detect/lexicon/build_lexicon.py`; do not hand-edit.\n */\n")
def w(fn,name,arr):
  open(OUT+fn,"w").write(hdr+f"export const {name}: readonly string[] = {json.dumps(arr,ensure_ascii=False)};\n")
import os; os.makedirs(OUT,exist_ok=True)
w("firstNames.ts","FIRST_NAMES",first_l)
w("surnames.ts","SURNAMES",last_l)
w("nameStopwords.ts","NAME_STOPWORDS",stop)
w("municipalities.ts","PLACE_NAMES",place_l)
print(len(first_l),len(last_l),len(stop),len(place_l)); print(stop[:200]); print(place_l)
