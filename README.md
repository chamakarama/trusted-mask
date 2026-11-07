# Mask

**Describe the analysis. Review how your data will be protected. Export the approved result.**

Mask is a planned purpose-aware data protection tool for the TrustED PETs Transformer challenge. It will identify data types and relationships, recommend protection recipes, evaluate the combined output, and show the exact changes before export.

The central ML task is **choosing how to transform information**. A goal-conditioned model will rank valid recipes with softmax. Detection, method preference and measured disclosure risk are separate outputs.

## Status

A working vertical slice exists in [`mask/`](mask/README.md): import → goal → deterministic proposal → transformed preview → confirmed export, in the browser. A learned selector and a benchmark adapter are in progress; see the Mask README for what is measured and what is not. The previous transport application has been removed from the active checkout. Its results do not establish Mask's performance.

- [Architecture and implementation plan](planning/MASK_PLAN.md)
- [Claude implementation handoff and team workstreams](planning/CLAUDE_BUILD_BRIEF.md)
- [Challenge materials and evaluation sources](MATERIALS.md)
- [Retained detector baseline](petpilot/README.md)

## Planned workflow

1. Write the intended analysis and specify the recipient/output setting.
2. Import CSV tables, including supported text columns, and inspect the data.
3. Review proposed recipes with labelled colour highlights and explanations.
4. Inspect uncertainty and measured privacy/utility effects; revise if needed.
5. Confirm the exact plan and export transformed files with a sanitised report.

The private developer panel will expose candidate scores, evidence, parameters and evaluation results. Raw previews, original redacted content, token mappings and evaluation truth are excluded from the shareable report.

## Available components

The original synthetic challenge package is preserved under `TRUSTED_SinceAI2026_FINAL/`. Its mobility dataset is part of the supplied benchmark, not an active transport product.

`petpilot/` is the existing generic rules-based column scanner, not the planned learned selector or a span-redaction engine. Install its requirements if needed and run its regression checks:

```sh
python -m pip install -r petpilot/requirements.txt
python -m unittest discover -s petpilot/tests -t .
```

## Recovery and attribution

The previous application is recoverable from Git at commit `23eedc29d6f2a3cd945cac2a4307e91e6427af77`. This reset does not rewrite history. Local runtime files and a copy of the retired application were moved to `/private/tmp/mask-retired-bfz9ordp`; this temporary directory is not durable storage.

Challenge data/documentation retain their upstream CC BY 4.0 attribution; supplied toolkit code retains its MIT license. See the package notices and [materials guide](MATERIALS.md).
