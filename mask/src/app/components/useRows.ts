import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RowFilter, RowSort, RowView, ViewMode } from "@/contracts";
import type { Backend } from "../backend/types";
import { isSuperseded } from "../backend/types";

export const PAGE = 100;

interface Cache {
  key: string;
  total: number | null;
  columns: string[] | null;
  pages: Map<number, RowView[]>;
  wanted: Set<number>;
  inflight: boolean;
  error: string | null;
}
const newCache = (key: string): Cache => ({ key, total: null, columns: null, pages: new Map(), wanted: new Set([0]), inflight: false, error: null });

export interface RowsQueryKey { table: string; view: ViewMode; sort: RowSort | null; filter: RowFilter | undefined; version: string }

/**
 * Paged row loading. One request in flight at a time (the client supersedes same-kind requests).
 * While a new query loads, the previous rows stay visible so the grid never jumps to empty.
 */
export function useRows(backend: Backend, q: RowsQueryKey) {
  const key = JSON.stringify(q);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const cur = useRef<Cache>(newCache(key));
  const prev = useRef<Cache | null>(null);
  const qRef = useRef(q);
  qRef.current = q;

  const pump = useCallback(async (c: Cache) => {
    if (c.inflight || cur.current !== c) return;
    const next = [...c.wanted].sort((a, b) => a - b).find((p) => !c.pages.has(p) && (c.total === null || p * PAGE < c.total));
    if (next === undefined) return;
    c.inflight = true;
    const { table, view, sort, filter } = qRef.current;
    try {
      const r = await backend.rows({ table, view, offset: next * PAGE, limit: PAGE, sort: sort ?? undefined, filter });
      if (cur.current !== c) return;
      c.pages.set(next, r.rows); c.total = r.total; c.columns = r.columns; c.error = null;
      if (prev.current) prev.current = null;
      bump();
    } catch (e) {
      if (cur.current !== c) return;
      if (isSuperseded(e)) { c.inflight = false; void pump(c); return; }
      c.error = e instanceof Error ? e.message : String(e);
      c.wanted.delete(next);
      bump();
    } finally {
      c.inflight = false;
    }
    void pump(c);
  }, [backend]);

  if (cur.current.key !== key) {
    if (cur.current.pages.size) prev.current = cur.current;
    cur.current = newCache(key);
  }

  useEffect(() => { void pump(cur.current); }, [key, pump]);

  const want = useCallback((from: number, to: number) => {
    const c = cur.current;
    let added = false;
    for (let p = Math.floor(from / PAGE); p <= Math.floor(Math.max(from, to) / PAGE); p++) if (!c.wanted.has(p)) { c.wanted.add(p); added = true; }
    if (added) void pump(c);
  }, [pump]);

  const c = cur.current;
  const shown = c.pages.size || !prev.current ? c : prev.current;
  const rowAt = (i: number): RowView | undefined => shown.pages.get(Math.floor(i / PAGE))?.[i % PAGE];
  return { total: shown.total, columns: shown.columns, rowAt, want, loading: shown !== c || c.inflight, error: c.error, showingPrevious: shown !== c };
}
