import { useEffect, useState } from "react";

/** Astra's reviewed synthetic-benchmark summary (exact-data checks). Shown only because the data is synthetic.
 *  undefined = loading, null = not in this build. Never an input to any number on the planner. */
export function useEvidence(): any | null | undefined {
  const [ev, setEv] = useState<any | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/evidence/evidence-summary.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((e) => { if (live) setEv(e); })
      .catch(() => { if (live) setEv(null); });
    return () => { live = false; };
  }, []);
  return ev;
}

/** Plain-words reading of epsilon: the release can change anyone's odds about one card by at most e^eps. */
export function oddsBound(eps: number, prior = 0.5): { factor: number; posterior: number } {
  const factor = Math.exp(eps);
  const odds = (prior / (1 - prior)) * factor;
  return { factor, posterior: odds / (1 + odds) };
}
