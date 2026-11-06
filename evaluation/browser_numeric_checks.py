"""Compare browser shortlist values to independent CSV aggregation; local review only."""
import argparse, asyncio, csv, hashlib, json, re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

BANDS = [('00-06','Night'),('06-09','Morning'),('09-15','Midday'),('15-18','Afternoon'),('18-24','Evening')]

async def review(url, release, output, revision):
    host=urlparse(url)
    if host.scheme!='http' or host.hostname not in {'localhost','127.0.0.1'}:raise ValueError('local HTTP only')
    rows=list(csv.DictReader((release/'od_matrix.csv').open()))
    geo=json.loads((release/'public_areas.geojson').read_text())
    towns={f['properties']['area_id']:f['properties']['municipality'] for f in geo['features']}
    count=0; errors=[]
    async with async_playwright() as p:
        options={'headless':True}
        if Path('/usr/bin/chromium').exists():options['executable_path']='/usr/bin/chromium'
        browser=await p.chromium.launch(**options)
        page=await browser.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def route(req):
            if urlparse(req.request.url).netloc!=host.netloc:return await req.abort()
            return await req.continue_()
        await page.route('**/*',route)
        await page.goto(url+'?map=schematic',wait_until='networkidle')
        await page.get_by_text('files verified',exact=False).wait_for()
        for level,places in [('Areas',sorted(towns)),('Towns',sorted(set(towns.values())))]:
            await page.get_by_role('radio',name=level,exact=True).click()
            for band,label in BANDS:
                await page.get_by_role('radio',name=re.compile('^'+label)).click()
                totals=defaultdict(int)
                for r in rows:
                    if r['hour_band']!=band:continue
                    a,b=r['origin_area'],r['destination_area']
                    if level=='Towns':a,b=towns[a],towns[b]
                    totals[a,b]+=int(r['noisy_value'])
                for origin in ['',*places]:
                    await page.get_by_role('combobox',name='Starting from',exact=True).select_option(origin)
                    expected=sorted([(max(0,v),a,b) for (a,b),v in totals.items() if a!=b and (not origin or a==origin)],key=lambda x:(-x[0],x[1],x[2]))[:3]
                    # locator evaluation waits until React's visible values match this selection.
                    await page.wait_for_function('(wanted) => JSON.stringify([...document.querySelectorAll(".shortlist .value strong")].map(e=>Number(e.textContent.replace(/,/g,""))))===JSON.stringify(wanted)',arg=[r[0] for r in expected])
                    actual=await page.locator('.shortlist .route').all_text_contents()
                    for text,(_,a,b) in zip(actual,expected):
                        for ident in [a,b]:
                            label=re.sub(r'-(\d{3})$',r' area \1',ident)
                            assert label in text,(level,band,origin,expected,actual)
                    assert len(actual)==len(expected)
                    count+=1
        await browser.close()
    assert not errors,errors
    report={'scope':'independent signed CSV sums, clamp once; local Chromium; external HTTP blocked',
            'release_id':release.name,'reviewed_ui_commit':revision,
            'manifest_sha256':hashlib.sha256((release/'manifest.json').read_bytes()).hexdigest(),'cases':count,'levels':2,'bands':5,'all_origins_and_unfiltered':True,
            'checked':'top-three labels, ordering and values; not a utility or uncertainty-coverage test','page_errors':errors,'passed':True}
    output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--release',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True);a=p.parse_args()
    asyncio.run(review(a.url.rstrip('/'),a.release,a.output,a.revision))
