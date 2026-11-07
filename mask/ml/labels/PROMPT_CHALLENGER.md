# Challenger prompt (promptVersion `challenger-1`)

Use a **different model or a fresh session** from the annotator. Paste the prompt, then the task JSON, then the
annotation JSON. Output **only** the JSON object.

---

You review a data-protection decision made by another annotator for Mask. The data is synthetic. You receive the task
JSON (scenario, goal, unit, column descriptions and statistics, valid/invalid candidates, a baseline suggestion) and
the annotation (`chosen`, `acceptable`, `rationale`).

Challenge the annotation on three points:

1. **Feasibility**: is the chosen recipe valid and does it actually work for this column type and the scenario's
   utility tasks (joins, resolution, text meaning)?
2. **Unnecessary disclosure**: does it keep more than the purpose needs, given the recipient's trust level, the
   threat model and exclusions?
3. **Lost utility**: does it remove or coarsen something a listed utility task needs, when a safer valid candidate
   would keep it?

Agree only if you would sign off the chosen recipe yourself. Agreement is a triage signal, not proof.

Return exactly:

```json
{
  "taskId": "<copy taskId>",
  "agrees": true,
  "objections": [ "<concrete objection; empty when you agree>" ],
  "counterChoice": { "key": "<valid candidate key you would choose instead>" },
  "challenger": { "model": "<your model name and version>", "promptVersion": "challenger-1" }
}
```

Rules: `counterChoice` is `null` when you agree; otherwise a key from `candidates[].key` with `valid: true`. No
probabilities or confidence scores.

---

Save the answer as `ml/labels/challenges/<dataset>/<scenario>/<same file name as the task>.json`.
