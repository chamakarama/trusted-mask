/**
 * Typed client for the pipeline worker. One in-flight request per kind: a newer request of the same kind
 * supersedes the older one, whose response is discarded (stale protection).
 */
import type { WorkerRequest, WorkerResponse } from "@/contracts";

type ResponseFor<K extends WorkerResponse["kind"]> = Extract<WorkerResponse, { kind: K }>;
type RequestOf<K extends WorkerRequest["kind"]> = Omit<Extract<WorkerRequest, { kind: K }>, "requestId" | "kind">;

interface ResponseKindMap {
  import: "imported"; profile: "profiled"; propose: "proposed"; execute: "executed"; evaluate: "evaluated";
  rows: "rows"; cell: "cell"; export: "exported"; embed: "embedded"; loadModel: "modelLoaded"; cancel: "cancelled";
}

export interface ProgressEvent { requestId: string; stage: string; done: number; total: number; message?: string }

export class PipelineClient {
  private worker: Worker;
  private pending = new Map<string, { kind: WorkerRequest["kind"]; resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();
  private latest = new Map<WorkerRequest["kind"], string>();
  private seq = 0;
  onProgress: (p: ProgressEvent) => void = () => {};

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL("./pipeline.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.receive(ev.data);
    this.worker.onerror = (ev) => { for (const p of this.pending.values()) p.reject(new Error(ev.message)); this.pending.clear(); };
  }

  private receive(res: WorkerResponse) {
    if (res.kind === "progress") { this.onProgress(res); return; }
    const p = this.pending.get(res.requestId);
    if (!p) return; // stale or unknown: discard
    this.pending.delete(res.requestId);
    if (res.kind === "error") { p.reject(new Error(res.message)); return; }
    if (res.kind === "cancelled") { p.reject(new Error("cancelled")); return; }
    p.resolve(res);
  }

  /** Sends a request; a newer request of the same kind makes this one stale (its promise rejects with "superseded"). */
  request<K extends WorkerRequest["kind"]>(kind: K, body: RequestOf<K>, transfer: Transferable[] = []): Promise<ResponseFor<ResponseKindMap[K]>> {
    const requestId = `${kind}-${++this.seq}`;
    const prev = this.latest.get(kind);
    if (prev && this.pending.has(prev)) { this.pending.get(prev)!.reject(new Error("superseded")); this.pending.delete(prev); }
    this.latest.set(kind, requestId);
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { kind, resolve: resolve as (r: WorkerResponse) => void, reject });
      this.worker.postMessage({ kind, requestId, ...body } as WorkerRequest, transfer);
    });
  }

  isLatest(kind: WorkerRequest["kind"], requestId: string): boolean { return this.latest.get(kind) === requestId; }

  terminate() { this.worker.terminate(); }
}
