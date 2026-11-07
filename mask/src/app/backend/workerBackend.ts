import type { GoalSpec, ImportFile, WorkerRequest, WorkerResponse } from "@/contracts";
import { PipelineClient } from "@/worker/client";
import { createGoalInterpreter } from "@/core/goal";
import type { GoalContext } from "@/core/goal/types";
import type { Backend, RowsQuery } from "./types";
import type { Progress } from "../store/state";

/** Real pipeline: the worker owns the data; the goal interpreter runs on the main thread (schema only). */
export class WorkerBackend implements Backend {
  readonly kind = "worker" as const;
  private client: PipelineClient;
  private interpreter = createGoalInterpreter();

  constructor(client?: PipelineClient) {
    this.client = client ?? new PipelineClient();
  }

  /** Typed request: the client's own return type is widened, so narrow it to the expected response kind. */
  private req<K extends WorkerRequest["kind"], R extends WorkerResponse["kind"]>(
    kind: K, _expect: R, body: Omit<Extract<WorkerRequest, { kind: K }>, "requestId" | "kind">, transfer: Transferable[] = [],
  ): Promise<Extract<WorkerResponse, { kind: R }>> {
    return this.client.request(kind, body, transfer) as unknown as Promise<Extract<WorkerResponse, { kind: R }>>;
  }

  onProgress(cb: (p: Progress) => void) {
    this.client.onProgress = (p) => cb({ stage: p.stage, done: p.done, total: p.total, message: p.message });
  }

  async importFiles(files: ImportFile[]) {
    const r = await this.req("import", "imported", { files }, files.map((f) => f.data));
    return { manifest: r.manifest, errors: r.errors };
  }
  async profile() { return (await this.req("profile", "profiled", {})).detections; }
  interpret(text: string, ctx: GoalContext): Promise<GoalSpec> { return this.interpreter.interpret(text, ctx); }
  async propose(goal: GoalSpec, selectorId: "policy" | "learned", overrides: Parameters<Backend["propose"]>[2]) {
    return (await this.req("propose", "proposed", { goal, selectorId, overrides })).proposal;
  }
  async execute(planHash: string) {
    const r = await this.req("execute", "executed", { planHash });
    return { planHash: r.planHash, outputHash: r.outputHash, tables: r.tables, durationMs: r.durationMs };
  }
  async evaluate(planHash: string) { return (await this.req("evaluate", "evaluated", { planHash })).evaluation; }
  async rows(q: RowsQuery) {
    const r = await this.req("rows", "rows", q);
    return { total: r.total, columns: r.columns, rows: r.rows, offset: r.offset };
  }
  async cell(table: string, row: number, column: string) {
    const r = await this.req("cell", "cell", { table, row, column });
    return { original: r.original, protected: r.protected, change: r.change };
  }
  async exportPlan(planHash: string) {
    const r = await this.req("export", "exported", { planHash });
    return { receipt: r.receipt, files: r.files };
  }
  async loadModel(artifactUrl: string) {
    const r = await this.req("loadModel", "modelLoaded", { artifactUrl });
    return { modelId: r.modelId, registryVersion: r.registryVersion };
  }
  dispose() { this.client.terminate(); }
}
