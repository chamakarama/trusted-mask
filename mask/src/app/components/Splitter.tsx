import { useRef } from "react";

/** Vertical splitter between the panes. Drag, or focus and use the arrow keys. */
export function Splitter({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, v: value };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add("is-resizing");
      }}
      onPointerMove={(e) => { if (start.current) onChange(clamp(start.current.v + e.clientX - start.current.x)); }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove("is-resizing");
      }}
      onDoubleClick={() => onChange(384)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft") { onChange(clamp(value - step)); e.preventDefault(); }
        else if (e.key === "ArrowRight") { onChange(clamp(value + step)); e.preventDefault(); }
        else if (e.key === "Home") { onChange(min); e.preventDefault(); }
        else if (e.key === "End") { onChange(max); e.preventDefault(); }
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
