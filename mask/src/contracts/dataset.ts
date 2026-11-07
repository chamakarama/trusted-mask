/**
 * DatasetManifest: what was imported, typed, with stable internal row identity and relationships.
 * Row identity is (table, row index in the imported file). It never changes with sorting or filtering.
 * The manifest holds statistics only: no raw cell values.
 */
import { z } from "zod";

export const ColumnRefSchema = z.object({ table: z.string().min(1), column: z.string().min(1) });
export type ColumnRef = z.infer<typeof ColumnRefSchema>;
export const columnKey = (r: ColumnRef): string => `${r.table}.${r.column}`;

export const RowRefSchema = z.object({ table: z.string(), row: z.number().int().nonnegative() });
export type RowRef = z.infer<typeof RowRefSchema>;

export const INFERRED_TYPES = ["string", "integer", "number", "boolean", "date", "datetime", "empty"] as const;
export const InferredTypeSchema = z.enum(INFERRED_TYPES);
export type InferredType = z.infer<typeof InferredTypeSchema>;

export const ColumnStatsSchema = z.object({
  count: z.number().int(),
  nonEmpty: z.number().int(),
  distinct: z.number().int(),
  /** distinct / nonEmpty (0 when nonEmpty is 0) */
  uniqueRatio: z.number(),
  meanLength: z.number(),
  maxLength: z.number(),
  /** share of non-empty values containing whitespace */
  spaceShare: z.number(),
  /** share of non-empty values parseable as a number */
  numericShare: z.number(),
  numeric: z.object({ min: z.number(), max: z.number(), mean: z.number() }).optional(),
  /** share of rows in the smallest category group, for low-cardinality columns */
  minCategoryShare: z.number().optional(),
  /** number of categories with fewer than 5 rows */
  rareCategoryCount: z.number().int().optional(),
  /** value ranges observed, for dates/timestamps (ISO strings) */
  temporal: z.object({ min: z.string(), max: z.string(), hasTime: z.boolean() }).optional(),
});
export type ColumnStats = z.infer<typeof ColumnStatsSchema>;

export const ColumnManifestSchema = z.object({
  name: z.string(),
  index: z.number().int(),
  inferredType: InferredTypeSchema,
  stats: ColumnStatsSchema,
});
export type ColumnManifest = z.infer<typeof ColumnManifestSchema>;

export const TableManifestSchema = z.object({
  name: z.string(),
  fileName: z.string(),
  rowCount: z.number().int(),
  byteSize: z.number().int(),
  sha256: z.string(),
  columns: z.array(ColumnManifestSchema),
  parseWarnings: z.array(z.string()),
});
export type TableManifest = z.infer<typeof TableManifestSchema>;

export const RELATIONSHIP_KINDS = ["foreign_key", "shared_identifier", "derived"] as const;
export const RelationshipSchema = z.object({
  id: z.string(),
  kind: z.enum(RELATIONSHIP_KINDS),
  from: ColumnRefSchema,
  to: ColumnRefSchema,
  /** share of non-empty `from` values found in `to` */
  matchRate: z.number(),
  evidence: z.string(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const DatasetManifestSchema = z.object({
  version: z.literal(1),
  /** sha256 over table hashes in file-name order */
  inputHash: z.string(),
  createdAt: z.string(),
  tables: z.array(TableManifestSchema),
  relationships: z.array(RelationshipSchema),
});
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;
