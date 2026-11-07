import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const enc = new TextEncoder();

export function sha256Hex(data: string | Uint8Array | ArrayBuffer): string {
  const bytes = typeof data === "string" ? enc.encode(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return bytesToHex(sha256(bytes));
}

/** JSON with sorted object keys so equal structures hash equally. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function hashOf(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export const nowIso = (): string => new Date().toISOString();
