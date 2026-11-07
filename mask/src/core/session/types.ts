/**
 * In-memory table representation used inside the pipeline worker (and in tests).
 * Column-major: data[columnIndex][rowIndex]. null = empty cell. Row index is the stable row identity.
 */
export interface TableData {
  name: string;
  fileName: string;
  columns: string[];
  data: (string | null)[][];
  rowCount: number;
  byteSize: number;
  sha256: string;
  parseWarnings: string[];
}

export function columnIndex(t: TableData, column: string): number {
  const i = t.columns.indexOf(column);
  if (i < 0) throw new Error(`column ${column} not in table ${t.name}`);
  return i;
}

export function getColumn(t: TableData, column: string): (string | null)[] {
  const col = t.data[columnIndex(t, column)];
  if (!col) throw new Error(`column data missing for ${t.name}.${column}`);
  return col;
}
