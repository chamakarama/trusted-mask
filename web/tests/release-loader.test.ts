import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {loadRelease} from '../src/data/release';
afterEach(()=>vi.unstubAllGlobals());
it('loads and verifies the committed city bundle against a server with limited connections',async()=>{
 let active=0,peak=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  active++;peak=Math.max(peak,active);
  try {
   if(active>3)throw new TypeError('Connection dropped');
   await new Promise(resolve=>setTimeout(resolve,5));
   return new Response(readFileSync(join(__dirname,'../public',url.replace(/^\//,''))));
  } finally {active--;}
 }));
 const release=await loadRelease('city-turku-v1');
 expect(release.validation.ok).toBe(true);
 expect(release.areas).toHaveLength(25);
 expect(peak).toBeLessThanOrEqual(3);
});
it('rejects an invalid release ID before any network request',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(loadRelease('../private')).rejects.toThrow('Invalid release ID');
 expect(fetcher).not.toHaveBeenCalled();
});
