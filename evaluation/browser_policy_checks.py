"""Verify policy-chart geometry against saved search results in a local browser."""
import argparse,asyncio,json,math
from urllib.parse import urlparse
from pathlib import Path
from playwright.async_api import async_playwright
async def main(url,source_file,output,revision):
 target=urlparse(url)
 if target.scheme!="http" or target.hostname not in {"localhost","127.0.0.1"}:raise ValueError("local HTTP only")
 source=json.loads(source_file.read_text())
 runs=sorted(source['runs'],key=lambda r:(r['policy']['geography']!='area',r['policy']['caps']['od'],r['policy']['epsilon']))
 top=math.ceil(max(r['median_wape']['od'] for r in runs)*10)/10
 async with async_playwright() as p:
  options={'headless':True}
  if Path('/usr/bin/chromium').exists():options['executable_path']='/usr/bin/chromium'
  b=await p.chromium.launch(**options);page=await b.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).netloc==target.netloc else r.abort())
  await page.goto(url+'/?map=schematic',wait_until='networkidle')
  await page.get_by_role('button',name='Is it safe?',exact=True).click()
  await page.locator('.tradeoff').wait_for()
  bars=await page.locator('.tradeoff svg path').evaluate_all('(els)=>els.map(e=>({height:e.getBBox().height, text:e.parentElement.querySelector("text").textContent, outline:e.getAttribute("stroke")}))')
  assert len(bars)==len(runs)==8
  for bar,run in zip(bars,runs):
   v=run['median_wape']['od'];assert math.isclose(bar['height']/(210-18-40)*top,v,abs_tol=1e-7),(bar,run['policy'])
   assert bar['text']==f'{int(v*100+.5)}%'
  body=await page.locator('.tradeoff').inner_text()
  assert 'same policy' in body and 'not directly comparable' in body
  assert 'at least 2 of 3' in body and 'No candidate met every error target' in body
  assert sum(b['outline']=='var(--ink)' for b in bars)==1
  await page.set_viewport_size({'width':390,'height':844});assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.get_by_role('combobox',name='Release',exact=True).select_option('fixture-only-001')
  await page.wait_for_function('!document.querySelector(".tradeoff")')
  assert not errors,errors
  r={'reviewed_commit':revision,'candidate_bars_verified':8,'heights_and_percent_labels_match_saved_search':True,'exact_artifact_not_confused_with_search_subset':True,'decision_target_caption_not_exact_top3':True,'fixture_has_no_actual_results':True,'mobile390_no_overflow':True,'page_errors':errors,'noise_draws':0,'passed':True}
  output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));await b.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True);a=p.parse_args()
 asyncio.run(main(a.url.rstrip('/'),a.source,a.output,a.revision))
