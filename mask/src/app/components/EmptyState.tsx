import { useRef, useState } from "react";
import { useAppState, useController } from "../store/store";

/** The empty data panel: the whole panel is the drop target, with a short centred hint. */
export function EmptyState() {
  const c = useController();
  const s = useAppState();
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const busy = s.phase === "importing";

  const take = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const csv = files.filter((f) => /\.(csv|tsv|txt)$/i.test(f.name) || f.type === "text/csv");
    setRejected(files.filter((f) => !csv.includes(f)).map((f) => f.name));
    if (csv.length) void c.importFiles(csv);
  };

  return (
    <div
      className={`dropzone ${over ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <p className="dz-title">{busy ? "Reading files…" : "Drop CSV files here"}</p>
      <p className="dz-actions small">
        <button className="btn-link" onClick={() => input.current?.click()} disabled={busy}>Choose files</button>
        <span className="muted"> · </span>
        <button className="btn-link" onClick={() => void c.loadSample()} disabled={busy}>Try sample data</button>
      </p>
      <p className="muted xsmall">Several related tables at once are fine. Files stay in this browser tab.</p>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      {rejected.length > 0 && <p className="dz-error small" role="alert">Skipped {rejected.join(", ")}: only CSV files are supported.</p>}
    </div>
  );
}
