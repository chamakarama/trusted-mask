/** Test helpers: a fake manifest with statistics only (no values). Not used in production code. */
import type { ColumnManifest, DatasetManifest, InferredType } from "@/contracts";

type Col = [name: string, type: InferredType, meanLength?: number];

export function fakeManifest(tables: Record<string, Col[]>, relationships: DatasetManifest["relationships"] = []): DatasetManifest {
  return {
    version: 1, inputHash: "test", createdAt: "2026-01-01T00:00:00Z", relationships,
    tables: Object.entries(tables).map(([name, cols]) => ({
      name, fileName: `${name}.csv`, rowCount: 100, byteSize: 1000, sha256: "x", parseWarnings: [],
      columns: cols.map(([c, type, meanLength], index): ColumnManifest => ({
        name: c, index, inferredType: type,
        stats: { count: 100, nonEmpty: 100, distinct: 50, uniqueRatio: 0.5, meanLength: meanLength ?? 8, maxLength: (meanLength ?? 8) * 3, spaceShare: (meanLength ?? 0) > 40 ? 0.9 : 0, numericShare: type === "integer" || type === "number" ? 1 : 0 },
      })),
    })),
  };
}

export const CS_MANIFEST = fakeManifest({
  conversations: [["conversation_id", "string"], ["customer_id", "string"], ["agent_id", "string"], ["channel", "string"], ["language", "string"], ["started_ts", "datetime"], ["intent", "string"], ["sentiment", "string"], ["csat", "integer"], ["resolved", "boolean"], ["handle_time_s", "integer"]],
  turns: [["turn_id", "string"], ["conversation_id", "string"], ["seq", "integer"], ["speaker", "string"], ["ts", "datetime"], ["text", "string", 90]],
  customers: [["customer_id", "string"], ["full_name", "string"], ["postcode", "string"], ["preferred_language", "string"]],
}, [{ id: "r1", kind: "foreign_key", from: { table: "turns", column: "conversation_id" }, to: { table: "conversations", column: "conversation_id" }, matchRate: 1, evidence: "test" }]);

export const STATS_MANIFEST = fakeManifest({
  visits: [["visit_id", "string"], ["municipality", "string"], ["age_band", "string"], ["week", "string"], ["visits", "integer"]],
});
