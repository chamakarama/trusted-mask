// Small inline icons (stroke = currentColor). Decorative unless a title is given.
type P = { title?: string; className?: string };
const base = (title?: string) => (title ? { role: "img", "aria-label": title } : { "aria-hidden": true });

export const IconWarn = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}>
    <path d="M10.3 3.9 2.4 17.6a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);
export const IconCheck = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="m5 12.5 4.2 4L19 7" /></svg>
);
export const IconLock = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const IconDownload = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
);
export const IconArrow = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
export const IconInfo = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
);
export const IconShield = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconChart = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="M4 20h16" /><path d="M7 16v-5" /><path d="M12 16V6" /><path d="M17 16v-8" /></svg>
);
export const IconSpark = ({ title, className = "icon" }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base(title)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>
);

/** RouteSafe mark: two stops joined by a protected route. */
export const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 17c3-7 9-3 12-10" /><circle cx="6" cy="17" r="2.2" fill="#fff" /><circle cx="18" cy="7" r="2.2" fill="#fff" />
  </svg>
);

/** Status chip for uncertainty: icon + label, never colour alone. */
export const Uncertain = ({ label = "uncertain · interval n/a" }: { label?: string }) => (
  <span className="badge badge-warn" title="Noise intervals are not yet available for this release; the value is a protected estimate, not a count."><IconWarn />{label}</span>
);
