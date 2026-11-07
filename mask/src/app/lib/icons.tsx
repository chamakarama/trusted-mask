/** Inline SVG icons. 16px grid, 1.5px stroke, currentColor. Decorative unless a label is given. */
import type { HighlightKind } from "@/contracts";

type P = { size?: number; label?: string; className?: string };
function Svg({ size = 16, label, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: P) => <Svg {...p}><path d="M3.5 8.5l3 3 6-7" /></Svg>;
export const IconHash = (p: P) => <Svg {...p}><path d="M6 2.5l-1 11M11 2.5l-1 11M3 6h10.5M2.5 10H13" /></Svg>;
export const IconBlur = (p: P) => <Svg {...p}><path d="M2.5 5h11M4 8h8M5.5 11h5" /></Svg>;
export const IconBlock = (p: P) => <Svg {...p}><rect x="2.5" y="5" width="11" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.85" /></Svg>;
export const IconMinus = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M5.5 8h5" /></Svg>;
export const IconDerive = (p: P) => <Svg {...p}><path d="M3 4h4.5a2 2 0 012 2v6M9.5 12l-2-2M9.5 12l2-2M12.5 4H10" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M8 2.5l6 10.5H2L8 2.5z" /><path d="M8 7v2.5M8 11.3v.2" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M8 10.5V3M5 5.5L8 2.5l3 3M3 10.5v2a1 1 0 001 1h8a1 1 0 001-1v-2" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M8 2.5V10M5 7l3 3 3-3M3 10.5v2a1 1 0 001 1h8a1 1 0 001-1v-2" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M4 1.5h5l3 3V14a.5.5 0 01-.5.5h-7.5A.5.5 0 013.5 14V2a.5.5 0 01.5-.5z" /><path d="M9 1.5v3h3" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="M8 13V3.5M4 7l4-4 4 4" /></Svg>;
export const IconUndo = (p: P) => <Svg {...p}><path d="M5.5 3.5L2.5 6.5l3 3" /><path d="M2.5 6.5H10a3.5 3.5 0 010 7H7" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="7" cy="7" r="4.25" /><path d="M10.2 10.2l3.3 3.3" /></Svg>;
export const IconSort = ({ dir, ...p }: P & { dir: "asc" | "desc" | null }) => (
  <Svg {...p}>
    {dir === "asc" ? <path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7" /> : dir === "desc" ? <path d="M8 3.5v9M4.5 9L8 12.5 11.5 9" /> : <path d="M5.5 6L8 3.5 10.5 6M5.5 10L8 12.5 10.5 10" opacity="0.6" />}
  </Svg>
);
export const IconCode = (p: P) => <Svg {...p}><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" /></Svg>;
export const IconChevron = ({ open, ...p }: P & { open?: boolean }) => (
  <Svg {...p}><path d={open ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} /></Svg>
);
/** Vertical chevron: down when closed (˅), up when open. */
export const IconChevronV = ({ up, ...p }: P & { up?: boolean }) => (
  <Svg {...p}><path d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} /></Svg>
);
export const IconInfo = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 7.2v3.6M8 5.2v.2" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></Svg>;
export const IconDot = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" /></Svg>;
export const IconCross = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M6 6l4 4M10 6l-4 4" /></Svg>;
export const IconCircle = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" strokeDasharray="2 2" /></Svg>;

export function HighlightIcon({ kind, size = 14 }: { kind: HighlightKind; size?: number }) {
  switch (kind) {
    case "keep": return <IconCheck size={size} />;
    case "tokenize": return <IconHash size={size} />;
    case "generalize": return <IconBlur size={size} />;
    case "redact": return <IconBlock size={size} />;
    case "suppress": return <IconMinus size={size} />;
    case "derive": return <IconDerive size={size} />;
    case "review": return <IconAlert size={size} />;
  }
}
