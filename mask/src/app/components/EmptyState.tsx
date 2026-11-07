import { useRef, useState } from "react";
import { useAppState, useController } from "../store/store";
import { IconUpload } from "../lib/icons";

/** Drop zone + file picker + sample data. Accepts several related CSV files at once. */
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
    <div className="empty">
      <div
        className={`dropzone ${over ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        <IconUpload size={20} />
        <p className="dz-title">{busy ? "Reading files…" : "Drop CSV files here"}</p>
        <p className="muted small">Several related tables at once are fine, for example customers, conversations and messages. Files stay in this browser tab.</p>
        <div className="dz-actions">
          <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>Choose files</button>
          <button className="btn" onClick={() => void c.loadSample()} disabled={busy}>Try sample data</button>
        </div>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
        {rejected.length > 0 && <p className="dz-error small" role="alert">Skipped {rejected.join(", ")}: only CSV files are supported.</p>}
        <p className="muted xsmall dz-sample-note">Sample data: a small synthetic customer-service dataset (customers, conversations, turns).</p>
      </div>
    </div>
  );
}
