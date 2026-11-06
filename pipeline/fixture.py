"""Complete two-area fictional contract fixture. Invented values, no DP claim."""
from pathlib import Path
from itertools import product
import subprocess
from pipeline.mobility import BANDS,DATES
from pipeline.artifact import build,write,verify

def main():
    areas=['example-centre','example-west']
    domains={'od':list(product(areas,areas,BANDS)),'line_hour':list(product(['example-1'],range(24))),'daily':[(d,) for d in DATES]}
    values={f:[100+i for i in range(len(d))] for f,d in domains.items()}
    geo={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'area_id':a,'name':a,'municipality':'Fictional municipality','source':'Invented contract fixture point'},'geometry':{'type':'Point','coordinates':[22.2+i*.03,60.45]}} for i,a in enumerate(areas)]}
    p=Path('fixtures/protected-v1');code=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    write(p,build('fixture-only-001',code,domains,values,geo,fixture=True));print(verify(p))
if __name__=='__main__': main()
