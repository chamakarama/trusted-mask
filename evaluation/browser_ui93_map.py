import asyncio,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--enable-unsafe-swiftshader'])
  page=await b.new_page();errors=[];console=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
  async def route(r):
   if 'tiles.openfreemap.org/styles/' in r.request.url:return await r.fulfill(json={'version':8,'sources':{},'glyphs':'http://127.0.0.1:8794/missing/{fontstack}/{range}.pbf','layers':[{'id':'background','type':'background','paint':{'background-color':'#eee'}}]})
   if urlparse(r.request.url).netloc=='127.0.0.1:8794':return await r.continue_()
   return await r.abort()
  await page.route('**/*',route)
  await page.goto('http://127.0.0.1:8794/',wait_until='networkidle');await page.wait_for_timeout(2000)
  assert await page.locator('.maplibregl-canvas').count()==1
  assert await page.get_by_role('button',name='Simple diagram',exact=True).count()==1
  bad=[x for x in console if any(t in x for t in ['layers.','paint.','Expected','expression'])]
  assert not errors and not bad,(errors,bad)
  await page.screenshot(path='/tmp/routesafe-93-street-layer.png')
  result={'reviewed_head':'93ad641','scope':'Local mocked blank MapLibre style, no external tiles or real model calls; validates layer expressions, not external basemap service or glyph availability','map_canvas_present':True,'layer_validation_errors':bad,'page_errors':errors,'passed':True}
  Path('evidence/e6/ui-93ad641-map-layer.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));await b.close()
asyncio.run(main())
