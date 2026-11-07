/** Factories the worker uses. Rules-based detection (no network, deterministic). */
import type { Profiler, FieldDetector, SpanDetector } from "./types";
import { RulesProfiler } from "./profiler";
import { RulesFieldDetector } from "./fields";
import { createRulesSpanDetector } from "./spans";
export * from "./types";

export function createProfiler(): Profiler { return new RulesProfiler(); }
export function createFieldDetector(): FieldDetector { return new RulesFieldDetector(); }
export function createSpanDetector(): SpanDetector { return createRulesSpanDetector(); }
