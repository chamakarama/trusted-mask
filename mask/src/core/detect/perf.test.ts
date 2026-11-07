/** Throughput checks (development machine timings; printed, with generous ceilings). */
import { describe, expect, it } from "vitest";
import type { TableData } from "@/core/session/types";
import { createFieldDetector, createProfiler, createSpanDetector } from "./index";
import { loadFixtureTables } from "./testing";

describe("detection throughput", () => {
  const turns = loadFixtureTables().find((t) => t.name === "turns")!;
  const texts = turns.data[turns.columns.indexOf("text")]!.filter((v): v is string => !!v);

  it("span detector: ~140k chat/ASR turns", () => {
    const det = createSpanDetector();
    const reps = Math.ceil(140_000 / texts.length);
    const t0 = performance.now();
    let spans = 0;
    for (let r = 0; r < reps; r++) for (const t of texts) spans += det.detect(t).length;
    const ms = performance.now() - t0;
    console.log(`span detector: ${reps * texts.length} turns in ${ms.toFixed(0)} ms (${spans} spans)`);
    expect(ms).toBeLessThan(15_000);
  });

  it("profiler + field detector: 160k-row table", () => {
    const n = 160_000;
    const col = (f: (i: number) => string | null) => Array.from({ length: n }, (_, i) => f(i));
    const t: TableData = {
      name: "big", fileName: "big.csv", columns: ["row_id", "customer_id", "ts", "amount", "channel", "note"], rowCount: n, byteSize: 0, sha256: "x", parseWarnings: [],
      data: [
        col((i) => `R${i}`), col((i) => `C${i % 9000}`), col((i) => `2025-0${1 + (i % 9)}-1${i % 10} 12:${String(i % 60).padStart(2, "0")}:00`),
        col((i) => String((i * 7) % 1000 / 10)), col((i) => ["chat", "phone", "email"][i % 3]!), col((i) => texts[i % texts.length] ?? null),
      ],
    };
    const t0 = performance.now();
    const { manifest } = createProfiler().profile([t]);
    const t1 = performance.now();
    const dets = createFieldDetector().detectFields([t], manifest, createSpanDetector());
    const t2 = performance.now();
    console.log(`profile ${n} rows x 6 cols: ${(t1 - t0).toFixed(0)} ms; detect fields: ${(t2 - t1).toFixed(0)} ms`);
    expect(dets.fields.length).toBe(6);
    expect(t2 - t0).toBeLessThan(10_000);
  });
});
