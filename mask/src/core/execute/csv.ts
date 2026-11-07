/** RFC 4180 CSV serialisation shared by the executor (table hashes) and the export (files). */

const NEEDS_QUOTE = /[",\r\n]/;

export function csvField(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (NEEDS_QUOTE.test(v) || v.charCodeAt(0) === 32 || v.charCodeAt(v.length - 1) === 32) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Serialise column-major data. Lines end with CRLF (RFC 4180), including the last one. */
export function toCsv(columns: string[], data: (string | null)[][], rowCount: number): string {
  const lines: string[] = new Array(rowCount + 1);
  lines[0] = columns.map(csvField).join(",");
  const nc = data.length;
  const row: string[] = new Array(nc);
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < nc; c++) row[c] = csvField(data[c]![r]);
    lines[r + 1] = row.join(",");
  }
  return lines.join("\r\n") + "\r\n";
}
