# Mask: contracts and ownership

Single source of truth for types: `src/contracts/*.ts` (zod schemas + inferred types). The lead owns this folder.
Change a contract only by asking the lead; never fork a type locally.

## Pipeline

Import → profile (`core/detect`) → detect fields and spans (`core/detect`) → interpret goal (`core/goal`)
→ build decision units and candidates (`core/selector`) → rank (`core/selector/policy` or `core/selector/learned`)
→ execute complete plan (`core/execute`) → evaluate (`core/evaluate`) → review (`app`) → confirm/export (`core/export`).

The pipeline worker (`src/worker`) owns session state; the app (`src/app`) talks to it only through
`contracts/worker.ts` messages. Raw cell values never enter the manifest, detections, proposal, evaluation or report.

## Module ownership

| Path | Owner | Implements |
|---|---|---|
| `src/contracts/**`, `src/core/registry/**`, `src/core/selector/{types,units,candidates,assemble,policy}.ts`, `src/worker/**`, `src/core/pipeline/**` | lead | contracts, registry, policy selector, orchestration |
| `src/core/detect/**` | detection agent | `Profiler`, `FieldDetector`, `SpanDetector` (`core/detect/types.ts`) |
| `src/core/execute/**`, `src/core/evaluate/**`, `src/core/export/**` | execution agent | `PlanExecutor`, `JointEvaluator`, `ExportService` |
| `src/core/goal/**` | goal agent | `GoalInterpreter`, `GoalEmbedder` |
| `src/core/selector/features.ts`, `src/core/selector/learned.ts`, `ml/**`, `scripts/labels/**` | ML agent | feature spec, `LearnedSelector`, label pipeline, training |
| `src/app/**`, `src/styles/**`, `index.html` | UX agent | the whole interface |

Tests live next to the code (`*.test.ts`). Run `npm test` and `npm run typecheck` before handing off.
Fixtures: `fixtures/customer_service_small` (synthetic, development only, with gold spans in `gold/`).

## Rules that apply everywhere

- Deterministic: same input, goal and plan give the same output. Never sample for export.
- Explanations come from executed decisions, never from post-hoc guesses.
- Detection confidence, model preference and measured risk are three different numbers; never merge them into one score.
- Unsupported is a state, not a silent fallback. If a check or recipe cannot run, say so in the output.
- Fixture metrics are development measurements, never benchmark results.
