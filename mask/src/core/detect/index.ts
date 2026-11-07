/** Factories the worker uses. The detection agent replaces the bodies; keep the names and signatures. */
import type { Profiler, FieldDetector, SpanDetector } from "./types";
export * from "./types";

const notImplemented = (what: string) => () => { throw new Error(`${what} is not implemented yet`); };

export function createProfiler(): Profiler { return { profile: notImplemented("Profiler.profile") }; }
export function createFieldDetector(): FieldDetector { return { id: "stub", version: "0", detectFields: notImplemented("FieldDetector.detectFields") }; }
export function createSpanDetector(): SpanDetector { return { id: "stub", version: "0", detect: notImplemented("SpanDetector.detect") }; }
