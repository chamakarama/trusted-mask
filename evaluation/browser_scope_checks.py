"""Regression checks for global preset scope and mixed-strength shortlist wording."""
import argparse,asyncio,csv,json,re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

async def review(url,release,output,revision):
 target=urlparse(url)
 if target.scheme!='http' or target.hostname not in {'localhost','127.0.0.1'}:raise ValueError('local HTTP only')
 values=defaultdict(list)
 for r in csv.DictReader((release/'od_matrix.csv').open()):
  if r['origin_area']!=r['destination_area']:values[r['hour_band'],r['origin_area']].append(int(r['trips']))
 mixed=[(band,origin,sorted(v,reverse=True)[:3]) for (band,origin),v in values.items() if max(v)>571 and min(sorted(v,reverse=True)[:3])<=571]
 labels={'06-09':'Morning','09-15':'Midday','15-18':'Afternoon','18-24':'Evening'}
 failures=[];cases=0
 async with async_playwright() as p:
  options={'headless':True}
  if Path('/usr/bin/chromium').exists():options['executable_path']='/usr/bin/chromium'
  b=await p.chromium.launch(**options);page=await b.new_page()
  await page.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).netloc==target.netloc else r.abort())
  await page.goto(url+'/?map=schematic',wait_until='networkidle')
  select=page.get_by_role('combobox',name='Starting from',exact=True)
  for origin in ['Turku-207','Turku-203']:
   await select.select_option(origin)
   await page.get_by_role('button',name='Busiest morning routes?',exact=True).click()
   await page.locator('.answer').wait_for()
   actual=await select.input_value()
   counts=await page.locator('.shortlist .value strong').all_text_contents()
   if actual or counts!=['5,491','4,565','4,183']:failures.append({'case':'global preset clears origin','initial_origin':origin,'remaining_origin':actual,'shortlist':counts})
   cases+=1
  for band,origin,top in mixed:
   await page.get_by_role('radio',name=re.compile('^'+labels[band])).click()
   await select.select_option(origin)
   await page.wait_for_function('(n)=>Number(document.querySelector(".shortlist .value strong").textContent.replace(/,/g,""))===n',arg=top[0])
   kpi=await page.locator('.kpis .kpi').first.inner_text()
   if 'below' in kpi.lower():failures.append({'case':'top above571 must not say below','band':band,'origin':origin,'top':top,'text':kpi})
   cases+=1
  await b.close()
 report={'reviewed_ui':revision,'cases':cases,'mixed_strength_cases':len(mixed),'scope':'local actual artifact; fixed 571 bound; no external requests, model calls or noise draws','failures':failures,'passed':not failures}
 output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return not failures
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--release',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True);a=p.parse_args()
 raise SystemExit(0 if asyncio.run(review(a.url.rstrip('/'),a.release,a.output,a.revision)) else 1)
