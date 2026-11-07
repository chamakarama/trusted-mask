/** Finnish personal identity code (HETU): validation and the demographics it encodes. */

const HETU = /^(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-Y])$/;
const CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY";
const CENTURY: Record<string, number> = { "+": 1800, "-": 1900, U: 1900, V: 1900, W: 1900, X: 1900, Y: 1900, A: 2000, B: 2000, C: 2000, D: 2000, E: 2000, F: 2000 };

export interface HetuInfo { birth: { y: number; m: number; d: number }; sex: "M" | "F" }

export function parseHetu(raw: string): HetuInfo | null {
  const g = HETU.exec(raw.trim().toUpperCase());
  if (!g) return null;
  const d = +g[1]!, m = +g[2]!, yy = +g[3]!, sign = g[4]!, ind = +g[5]!, chk = g[6]!;
  const base = CENTURY[sign];
  if (base === undefined) return null;
  if (CHECK[Number(`${g[1]}${g[2]}${g[3]}${g[5]}`) % 31] !== chk) return null;
  const y = base + yy;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (m < 1 || m > 12 || d < 1 || d > dim || ind < 2) return null;
  return { birth: { y, m, d }, sex: ind % 2 === 1 ? "M" : "F" };
}

export function ageAt(birth: { y: number; m: number; d: number }, ref: { y: number; m: number; d: number }): number {
  let age = ref.y - birth.y;
  if (ref.m < birth.m || (ref.m === birth.m && ref.d < birth.d)) age -= 1;
  return age;
}

export function ageBand(age: number, width: number, topCode = 90): string {
  if (age >= topCode) return `${topCode}+`;
  if (age < 0) return "";
  const lo = Math.floor(age / width) * width;
  return `${lo}-${lo + width - 1}`;
}
