import asyncio,json,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
async def main():
 result={'reviewed_head':'93ad641','viewports':[],'errors':[],'scope':'Local Chromium, external requests blocked, keyboard/layout smoke checks; not a full accessibility audit'}
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  page=await b.new_page();page.on('pageerror',lambda e:result['errors'].append(str(e)))
  await page.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).netloc in {'127.0.0.1:8794','127.0.0.1:8795'} else r.abort())
  for w,h in [(1366,768),(1280,720),(390,844),(640,480)]:
   await page.set_viewport_size({'width':w,'height':h})
   await page.goto('http://127.0.0.1:8794/?map=schematic',wait_until='networkidle')
   await page.get_by_text('files verified',exact=False).wait_for()
   assert await page.locator('.shortlist .value strong').all_text_contents()==['5,491','4,565','4,183']
   if w==1280:await page.screenshot(path='/tmp/routesafe-93-desktop.png')
   if w==390:await page.screenshot(path='/tmp/routesafe-93-mobile.png',full_page=True)
   for tab in ['Where people go','When people travel','Is it safe?',"What's shared"]:
    button=page.get_by_role('button',name=tab,exact=True)
    await button.focus();await page.keyboard.press('Enter')
    assert await page.locator('main h1').count()==1
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(w,tab)
   await page.get_by_role('button',name='Where people go',exact=True).click()
   await page.get_by_role('radio',name=re.compile('^Night')).focus();await page.keyboard.press('Space')
   assert 'No clear busiest route' in await page.locator('.kpis').inner_text()
   await page.get_by_role('radio',name=re.compile('^Morning')).click()
   preset=page.get_by_role('button',name='Busiest morning routes?',exact=True)
   await preset.focus();await page.keyboard.press('Enter')
   assert '5,491' in await page.locator('.answer').inner_text()
   await page.goto('http://127.0.0.1:8795/operator.html',wait_until='networkidle')
   assert await page.locator('.kpis-op strong').all_text_contents()==['48','4','17','11','37']
   await page.get_by_role('radio',name=re.compile('^A consultancy')).focus();await page.keyboard.press('Space')
   await page.get_by_text('UNSUPPORTED_SHARING_SCENARIO',exact=True).wait_for()
   await page.get_by_role('radio',name='Anyone: open demand statistics',exact=True).click()
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),('operator',w)
   result['viewports'].append({'width':w,'height':h,'tabs_no_overflow':True,'keyboard_tabs_band_preset_refusal':True,'operator_values':True})
  assert not result['errors'];result['passed']=True
  Path('evidence/e6/ui-93ad641-layout.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));await b.close()
asyncio.run(main())
