/** Independently validate the small public geometry contract, never arbitrary GeoJSON. */
export function geometryCentre(shape: any, polygon: boolean): [number, number] {
  const point = (p: any): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x: any) => typeof x === 'number' && Number.isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  if (!shape || Object.keys(shape).sort().join() !== 'coordinates,type') throw Error('geometry fields');
  if (!polygon) {
    if (shape.type !== 'Point' || !point(shape.coordinates)) throw Error('finite public point required');
    return shape.coordinates;
  }
  const rings = shape.coordinates;
  if (shape.type !== 'Polygon' || !Array.isArray(rings) || rings.length !== 1) throw Error('single rectangular ring required');
  const ring = rings[0];
  if (!Array.isArray(ring) || ring.length !== 5 || !ring.every(point) || JSON.stringify(ring[0]) !== JSON.stringify(ring[4])) throw Error('closed rectangular ring required');
  const xs = [...new Set<number>(ring.map((p: number[]) => p[0]))].sort((a,b)=>a-b);
  const ys = [...new Set<number>(ring.map((p: number[]) => p[1]))].sort((a,b)=>a-b);
  if (xs.length !== 2 || ys.length !== 2 || new Set(ring.slice(0,4).map((p:any)=>JSON.stringify(p))).size !== 4) throw Error('nondegenerate rectangle required');
  for(let i=0;i<4;i++) if ((ring[i][0] !== ring[i+1][0]) === (ring[i][1] !== ring[i+1][1])) throw Error('crossing or diagonal rectangle');
  return [(xs[0]+xs[1])/2, (ys[0]+ys[1])/2];
}
