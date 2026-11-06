"""Check synthetic before/after chart values and fixture isolation in a local browser."""
import argparse,asyncio,json
from urllib.parse import urlparse
from pathlib import Path
from playwright.async_api import async_playwright
async def main(url,summary,output,revision):
 target=urlparse(url)
 if target.scheme!="http" or target.hostname not in {"localhost","127.0.0.1"}:raise ValueError("local HTTP only")
 uc=json.loads(summary.read_text())['utility_comparison']
 async with async_playwright() as p:
  options={'headless':True}
  if Path('/usr/bin/chromium').exists():options['executable_path']='/usr/bin/chromium'
  b=await p.chromium.launch(**options)
  page=await b.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).netloc==target.netloc else r.abort())
  await page.goto(url+'/?map=schematic',wait_until='networkidle')
  await page.get_by_role('button',name='Is it safe?',exact=True).click()
  await page.locator('.ba').wait_for()
  rows=page.locator('.ba-row');assert await rows.count()==10
  for i,r in enumerate(uc['morning_top10']):
   assert await rows.nth(i).locator('.ba-bars').get_attribute('aria-label')==f"exact {r['exact']:,}, protected {r['protected']:,}"
  chart=page.get_by_role('img',name='Taps per day, exact versus protected')
  targets=chart.locator('rect');assert await targets.count()==28
  for i,d in enumerate(uc['daily']):
   await targets.nth(i).hover()
   t=await page.get_by_role('tooltip').inner_text()
   assert f"exact {d['exact']:,} · protected {d['protected']:,}" in t,(i,t)
  for i,k in enumerate(['od','line_hour','daily']):
   actual=await page.locator('.ba-src tbody tr').nth(i).locator('td.num').all_text_contents()
   assert actual==[f"{int(100*uc['error_sources'][k][s]+.5)}%" for s in ['cap','noise','total']]
  await page.mouse.move(0,0)
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.get_by_role('combobox',name='Release',exact=True).select_option('fixture-only-001')
  await page.get_by_text('files verified',exact=False).wait_for()
  await page.wait_for_function('!document.querySelector(".ba")')
  assert not errors,errors
  result={'reviewed_ui':revision,'daily_tooltips_verified':28,'route_pairs_verified':10,'stage_metric_cells_verified':9,'mobile_390_no_overflow':True,'fixture_no_actual_comparison':True,'page_errors':errors,'scope':'local production build; external requests blocked; no noise draws or model calls','passed':True}
  output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));await b.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--summary',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True);a=p.parse_args()
 asyncio.run(main(a.url.rstrip('/'),a.summary,a.output,a.revision))
