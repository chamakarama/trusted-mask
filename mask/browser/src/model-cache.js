export const CACHE_NAME = 'mask-models-v1';
export async function checkedAsset(url, asset, onProgress = () => {}) {
  let cache, response, cached = false;
  try { cache = await caches.open(CACHE_NAME); response = await cache.match(url); cached = !!response; } catch { /* private browsing / quota */ }
  if (!response) response = await fetch(url, {credentials:'omit', cache:'no-cache', referrerPolicy:'no-referrer'});
  if (!response.ok || !response.body) throw new Error('The model could not be downloaded. Check your connection and retry.');
  const bytes = new Uint8Array(asset.bytes);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) throw new Error('Model download size mismatch.');
      bytes.set(value,offset); offset += value.length;
      onProgress({loaded:offset,total:bytes.length,cached});
    }
  } finally { reader.releaseLock(); }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if (offset !== bytes.length || hash !== asset.sha256) {
    await cache?.delete(url);
    throw new Error('Model integrity check failed. Retry to download a fresh copy.');
  }
  if (!cached && cache) {
    try { await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}})); }
    catch { onProgress({loaded:offset,total:bytes.length,cached:false,cacheUnavailable:true}); }
  }
  return bytes;
}
