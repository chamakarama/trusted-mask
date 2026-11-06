"""Executable UI boundary review. Local browser/proxy mocks only; no model calls.
Run with a Python environment containing Playwright and Chromium installed.
"""
import argparse,asyncio,json,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

CANARY='UNSUPPORTED_CLAIM_CANARY: 999999999 passengers independently certified.'

async def review(url,public,output):
    target=urlparse(url)
    if target.hostname not in ('localhost','127.0.0.1'):raise ValueError('LOCAL_REVIEW_ONLY')
    proxy='127.0.0.1:8787'
    results=[];delayed=False;completed=set();model_calls=0
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page()
        async def route(req):
            nonlocal model_calls
            loc=urlparse(req.request.url)
            if loc.netloc==proxy:
                if req.request.method=='OPTIONS':return await req.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'})
                health=loc.path=='/health'
                if not health:model_calls+=1
                body={'ok':True} if health else {'kind':'intent','note':CANARY,'intent':{'view':'od','hour_band':'06-09','origin_area':None,'action':'rank_corridors','limit':3}}
                return await req.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(body))
            if loc.netloc!=target.netloc:return await req.abort()
            if delayed and '/releases/fixture-only-001/' in loc.path:
                name=loc.path.rsplit('/',1)[1]
                if name not in {'manifest.json','checksums.sha256','README.txt','daily.csv','definitions.json','line_hour.csv','od_matrix.csv','public_areas.geojson','statistics.json'}:return await req.abort()
                await asyncio.sleep(.75)
                await req.fulfill(status=200,body=(public/'releases/fixture-only-001'/name).read_bytes());completed.add(name);return
            return await req.continue_()
        await page.route('**/*',route)
        await page.goto(url+'?map=schematic',wait_until='networkidle')
        await page.get_by_text('files verified',exact=False).wait_for()
        await page.get_by_text('AI on',exact=False).wait_for()
        await page.get_by_role('textbox',name='Question',exact=True).fill('Busiest morning routes?')
        await page.get_by_role('button',name='Ask',exact=True).click()
        await page.locator('.answer').wait_for()
        text=await page.locator('.answer').inner_text()
        results.append({'case':'model note is not factual output','passed':CANARY not in text,'mock_requests':model_calls,'grounded_5491_present':'5,491' in text})
        delayed=True
        select=page.get_by_role('combobox',name='Release',exact=True)
        await select.select_option('fixture-only-001');await asyncio.sleep(.1);await select.select_option('e1-aura-001')
        for _ in range(100):
            if len(completed)==9:break
            await asyncio.sleep(.1)
        assert len(completed)==9,'fixture responses did not complete'
        await asyncio.sleep(.3)
        await page.get_by_role('button',name=re.compile(r"What.*shared",re.I)).click()
        selected=await select.input_value();body=(await page.locator('body').inner_text()).lower()
        stale='release fixture-only-001' in body
        results.append({'case':'stale release response ignored','passed':selected=='e1-aura-001' and not stale,'selected':selected,'rendered_fixture':stale})
        await browser.close()
    report={'target':url,'scope':'local HTTP, deterministic mock intent, external HTTP blocked; no real model calls','cases':results,'passed':all(x['passed'] for x in results)}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return report['passed']

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--public',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    raise SystemExit(0 if asyncio.run(review(a.url.rstrip('/'),a.public,a.output)) else 1)
