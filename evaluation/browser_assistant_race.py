"""Local regression for an older model response overwriting a newer preset action."""
import argparse,asyncio,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
async def main(url, output, revision):
 target=urlparse(url)
 if target.scheme!="http" or target.hostname not in {"localhost","127.0.0.1"}:raise ValueError("local HTTP only")
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  page=await b.new_page();started=asyncio.Event();finished=asyncio.Event()
  async def route(req):
   u=urlparse(req.request.url)
   if u.port==8787:
    headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'}
    if req.request.method=='OPTIONS':return await req.fulfill(status=204,headers=headers)
    if u.path=='/health':return await req.fulfill(status=200,headers=headers,json={'ok':True})
    started.set();await asyncio.sleep(1.5)
    await req.fulfill(status=200,headers=headers,json={'kind':'intent','intent':{'view':'od','hour_band':'18-24','origin_area':None,'action':'rank_corridors','limit':3}});finished.set();return
   if u.netloc!=target.netloc:return await req.abort()
   await req.continue_()
  await page.route('**/*',route)
  await page.goto(url.rstrip('/')+'/?map=schematic',wait_until='networkidle')
  await page.get_by_text('AI on',exact=True).wait_for()
  await page.get_by_role('textbox',name='Question',exact=True).fill('Evening routes?')
  await page.get_by_role('button',name='Ask',exact=True).click();await started.wait()
  await page.get_by_role('button',name="Show one passenger's trips",exact=True).click()
  first=await page.locator('.answer').inner_text();assert "Can't show one person's trips" in first
  await finished.wait();await asyncio.sleep(.2)
  last=await page.locator('.answer').inner_text()
  result={'review_target':revision,'scope':'local Chromium and delayed mock intent only; no real model call','case':'older pending model response overwrites newer preset refusal','refusal_visible_before_response':True,'refusal_retained_after_response':"Can't show one person's trips" in last,'page_url_after_response':page.url,'finding':'older callback is not cancelled by newer preset action'}
  output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));await b.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True);a=p.parse_args()
 asyncio.run(main(a.url,a.output,a.revision))
