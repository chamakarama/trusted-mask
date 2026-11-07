# Annotator prompt (promptVersion `annotator-1`)

Use this prompt verbatim with one task file at a time (or a small batch of task files, one answer per task).
Paste the full task JSON after the prompt. Output **only** the JSON object, nothing else.

---

You are labelling data-protection decisions for Mask, a tool that chooses how to transform each column (or each kind
of personal-data span inside a text column) before a dataset is shared for a stated purpose. The data is synthetic.

You receive one task JSON. It contains:

- `scenario`: who receives the data, why, their trust level, the threat model, the utility tasks the recipient must be
  able to compute, and `suggestedTargets` — **hints, not binding requirements**.
- `goal`: the structured goal Mask derived for this scenario (recipient, task, output form, linkage, resolution, text need,
  exclusions).
- `unit`: the decision unit — one column (`field`), a group of linked identifier columns transformed together
  (`field_group`), or all spans of one label inside a text column (`span_class`).
- `columns`: the catalog description and known traps of the unit's columns, and statistics (no raw values).
- `siblings` and `relationships`: the rest of the table and how it joins.
- `candidates`: every recipe Mask can run here, each with `key`, `valid` and `invalidReasons`. Invalid candidates break a
  hard rule and must not be chosen.
- `baseline`: what a fixed rule-based policy would choose. It is a **suggestion only, do not copy it blindly**. Agree
  only if it is right for this scenario.

Decide which valid candidate best serves the recipient's purpose with the least unnecessary disclosure:

1. Can the unit identify someone on its own, in combination, or is it the sensitive fact itself?
2. What does the recipient actually need from it for the listed utility tasks, and at what resolution?
3. Does the analysis need to link records (same person across rows or tables)? Then a consistent keyed token keeps joins.
4. Never keep more than the purpose needs; never remove what the purpose needs when a safer transformation keeps it.
5. Consider the threat model: what an attacker with the stated background knowledge could link.

Return exactly:

```json
{
  "taskId": "<copy taskId>",
  "chosen": { "key": "<one candidate key with valid=true>" },
  "acceptable": [ { "key": "<another valid key you would also sign off>" } ],
  "rationale": "<at most 60 words>",
  "unresolved": [ "<question whose answer would change the choice>" ],
  "annotator": { "model": "<your model name and version>", "promptVersion": "annotator-1" }
}
```

Rules:

- Copy keys exactly from `candidates[].key`; only keys with `valid: true`.
- `acceptable` lists other valid choices you would also approve for this recipient; it may be empty. Do not repeat `chosen`.
- No probabilities, confidence percentages or scores.
- If no valid candidate is acceptable, choose the least bad valid one and explain in `unresolved`.
- Do not invent facts about the data beyond the task file.

---

Save the answer as `ml/labels/annotations/<dataset>/<scenario>/<same file name as the task>.json`.
