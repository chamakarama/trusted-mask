# Three fresh example sources — actual published large epoch 1 CPU outputs

These synthetic diagnostics were authored after freezing the split. They are not training rows, human-audited final tests, or checkpoint-selection evidence. Outputs came from the freshly downloaded GitHub bundle through the real application loader.

## fresh-delivery (134 words)

**Intended task:** Draft a factual delivery complaint asking the seller to investigate the missing desk. The medical notes are unrelated to this request.

**Input**

```text
My name is Nora Lindholm, and I am asking for help with a delivery problem. I ordered a replacement desk on 3 November, paid 184 euros, and was promised arrival by Friday. The carrier marked it delivered on Thursday, but neither I nor my neighbour, Tomas Ek, received a parcel. Tomas checked the shared entrance twice. The seller asked me to wait until Monday before requesting a refund.

Separately, I have had a dry cough for four days. I have no fever, and I become short of breath only when climbing the stairs. The cough began before I cleaned the dusty spare room, so I am uncertain whether the dust made it worse.

Nora is available after 16:00. Please use nora.lindholm@example.invalid or call +358 40 123 4567. I want the dates and uncertainty preserved.
```

**Actual protected output**

```text
My name is [PERSON_1], and I am asking for help with a delivery problem. I ordered a replacement desk on 3 November, paid 184 euros, and was promised arrival by Friday. The carrier marked it delivered on Thursday, but neither I nor my neighbour, [PERSON_2], received a parcel. [PERSON_2] checked the shared entrance twice. The seller asked me to wait until Monday before requesting a refund.

The cough began before I cleaned the dusty spare room, so I am uncertain whether the dust made it worse.

[PERSON_1] is available after 16:00. Please use [EMAIL] or call [PHONE]. I want the dates and uncertainty preserved.
```

Only part of the irrelevant cough paragraph disappears: the dust/uncertainty sentence remains. This is an incomplete section removal.

## fresh-clinician (134 words)

**Intended task:** Prepare a symptom timeline for a clinician. Preserve the absence of fever, the exertion limit and the uncertainty about the dust. Leave out the delivery dispute.

**Input**

```text
My name is Nora Lindholm, and I am asking for help with a delivery problem. I ordered a replacement desk on 3 November, paid 184 euros, and was promised arrival by Friday. The carrier marked it delivered on Thursday, but neither I nor my neighbour, Tomas Ek, received a parcel. Tomas checked the shared entrance twice. The seller asked me to wait until Monday before requesting a refund.

Separately, I have had a dry cough for four days. I have no fever, and I become short of breath only when climbing the stairs. The cough began before I cleaned the dusty spare room, so I am uncertain whether the dust made it worse.

Nora is available after 16:00. Please use nora.lindholm@example.invalid or call +358 40 123 4567. I want the dates and uncertainty preserved.
```

**Actual protected output**

```text
My name is [PERSON_1], and I am asking for help with a delivery problem. I ordered a replacement desk on 3 November, paid 184 euros, and was promised arrival by Friday. The carrier marked it delivered on Thursday, but neither I nor my neighbour, [PERSON_2], received a parcel. [PERSON_2] checked the shared entrance twice. The seller asked me to wait until Monday before requesting a refund.

Separately, I have had a dry cough for four days. I have no fever, and I become short of breath only when climbing the stairs. The cough began before I cleaned the dusty spare room, so I am uncertain whether the dust made it worse.

[PERSON_1] is available after 16:00. Please use [EMAIL] or call [PHONE]. I want the dates and uncertainty preserved.
```

The useful symptom facts remain, but the irrelevant delivery dispute also remains. Both fresh section-removal targets therefore fail whole-section scoring.

## fresh-distinct-people (140 words)

**Intended task:** Summarise the warehouse-count plan, preserving the unresolved assignment and the approval condition.

**Input**

```text
My colleague, Alex Marin, will prepare the warehouse count on Tuesday, while Alex Koskinen will review the totals on Wednesday. Alex Marin said the first delivery contains 24 sealed boxes, but two labels are unreadable, so those boxes must remain unchecked until the supplier confirms their contents. Alex Koskinen agreed that an unreadable label does not prove a box is missing.

The shared note then says that Alex will telephone the supplier. I cannot tell which colleague wrote that line, and I do not want the summary to invent an assignment. Both colleagues will attend the review, and Alex Marin will bring the original packing list. The team should approve the count only after the two labels are resolved. Please contact the coordinator at warehouse.team@example.invalid if a clarification is needed. Keep the distinction between unchecked boxes and missing boxes clear.
```

**Actual protected output**

```text
My colleague, [PERSON_1], will prepare the warehouse count on Tuesday, while [PERSON_2] will review the totals on Wednesday. [PERSON_1] said the first delivery contains 24 sealed boxes, but two labels are unreadable, so those boxes must remain unchecked until the supplier confirms their contents. [PERSON_2] agreed that an unreadable label does not prove a box is missing.

The shared note then says that [PERSON_3] will telephone the supplier. I cannot tell which colleague wrote that line, and I do not want the summary to invent an assignment. Both colleagues will attend the review, and [PERSON_1] will bring the original packing list. The team should approve the count only after the two labels are resolved. Please contact the coordinator at [EMAIL] if a clarification is needed. Keep the distinction between unchecked boxes and missing boxes clear.
```

Repeated full names stay consistent. The ambiguous short name Alex gets its own alias, preserving the unresolved assignment.

## fresh-benign (119 words)

**Intended task:** Rewrite these planning notes clearly without changing or omitting any facts.

**Input**

```text
Our reading club is planning three public sessions for next month. The first session will discuss a short story, the second will compare two poems, and the third will be an open discussion about choosing books. Each session has room for twenty participants, but the room has only sixteen chairs, so four additional chairs must be borrowed before registration opens. We have already reserved the room for the first two sessions. The third reservation is still pending, and it should not be described as confirmed. The organiser wants a clear summary of these practical points without invented dates, names, prices or promises. Please preserve the difference between capacity, available seating and confirmed reservations, and keep the pending decision visible.
```

**Actual protected output**

```text
Our reading club is planning three public sessions for next month. The first session will discuss a short story, the second will compare two poems, and the third will be an open discussion about choosing books. Each session has room for twenty participants, but the room has only sixteen chairs, so four additional chairs must be borrowed before registration opens. We have already reserved the room for the first two sessions. The third reservation is still pending, and it should not be described as confirmed. The organiser wants a clear summary of these practical points without invented dates, names, prices or promises. Please preserve the difference between capacity, available seating and confirmed reservations, and keep the pending decision visible.
```

## Local restoration check

The following is a locally authored mock reply, not an external AI response. Known person aliases restore locally; an unknown alias and generic contact placeholders remain protected.

```text
[PERSON_1] [PERSON_2] [PERSON_999] [EMAIL]
```

Actual local restoration:

```text
Nora Lindholm Tomas Ek [PERSON_999] [EMAIL]
```
