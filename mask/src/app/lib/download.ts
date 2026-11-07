/** Save files produced by the worker. Object URLs are revoked after the click has been handled. */
export function downloadFiles(files: { name: string; data: ArrayBuffer; mime: string }[]): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.data], { type: f.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
