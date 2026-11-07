/// <reference lib="webworker" />
/**
 * Pipeline worker: a thin message adapter over PipelineSession (core/pipeline/session.ts).
 * Every request is answered with a response carrying the same requestId. Long steps report progress.
 */
import type { WorkerRequest, WorkerResponse } from "@/contracts";
import { PipelineSession } from "@/core/pipeline/session";
import { createGoalEmbedder } from "@/core/goal";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const post = (r: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(r, transfer);
const session = new PipelineSession();

const progress = (requestId: string, stage: string) => (done: number, total: number, message?: string) => post({ kind: "progress", requestId, stage, done, total, message });

async function handle(req: WorkerRequest): Promise<void> {
  const { requestId } = req;
  switch (req.kind) {
    case "import": {
      const { manifest, errors } = session.import(req.files, progress(requestId, "parsing"));
      post({ kind: "imported", requestId, manifest, errors });
      return;
    }
    case "profile": {
      post({ kind: "profiled", requestId, detections: session.profile(progress(requestId, "detecting")) });
      return;
    }
    case "propose": {
      post({ kind: "proposed", requestId, proposal: await session.propose(req.goal, req.selectorId, req.overrides) });
      return;
    }
    case "execute": {
      post({ kind: "executed", requestId, ...session.execute(req.planHash, progress(requestId, "executing")) });
      return;
    }
    case "evaluate": {
      post({ kind: "evaluated", requestId, evaluation: session.evaluate(req.planHash, req.devLabels, progress(requestId, "evaluating")) });
      return;
    }
    case "rows": {
      post({ kind: "rows", requestId, ...session.rows(req) });
      return;
    }
    case "cell": {
      post({ kind: "cell", requestId, ...session.cell(req.table, req.row, req.column) });
      return;
    }
    case "export": {
      const { receipt, files } = await session.export(req.planHash);
      const payload = files.map((f) => ({ name: f.name, data: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer, mime: f.mime }));
      post({ kind: "exported", requestId, receipt, files: payload }, payload.map((f) => f.data));
      return;
    }
    case "embed": {
      const embedder = await createGoalEmbedder();
      if (!embedder) throw new Error("no embedding model available");
      post({ kind: "embedded", requestId, model: embedder.model, vector: await embedder.embed(req.text) });
      return;
    }
    case "loadModel": {
      const res = await fetch(req.artifactUrl);
      if (!res.ok) throw new Error(`model fetch failed: ${res.status}`);
      const model = session.loadModel(await res.json());
      post({ kind: "modelLoaded", requestId, modelId: model.modelId, registryVersion: model.registryVersion });
      return;
    }
    case "cancel": {
      post({ kind: "cancelled", requestId: req.target });
      return;
    }
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  handle(req).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    post({ kind: "error", requestId: req.requestId, message, recoverable: true });
  });
};
