/** Zod validation of a BenchmarkReport plus adapter invariants (non-evaluated tests carry a reason, ids unique). */
import { BenchmarkReportSchema, type BenchmarkReport } from "@/contracts";

export function validateReport(raw: unknown): { ok: boolean; report?: BenchmarkReport; errors: string[] } {
  const p = BenchmarkReportSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of p.data.tests) {
    if (ids.has(t.id)) errors.push(`duplicate test id ${t.id}`);
    ids.add(t.id);
    if (t.status !== "evaluated" && !t.statusReason) errors.push(`${t.id}: status ${t.status} without statusReason`);
  }
  if (!p.data.tests.some((t) => t.kind === "representation")) errors.push("no representation test");
  return { ok: errors.length === 0, report: p.data, errors };
}
