# Original idea (planning history)

> Written before the build. Its illustrative numbers, broader features (LLM detective, slider, trust report) and proposed demo are **not** implementation results. See the root README and `evidence/README.md` for what was actually built and measured.

# TrustED Challenge: Our Idea

## The challenge in one line

**Make sensitive data safe to share, and prove with numbers that it's both safe and still useful.**

Hospitals, cities and transport companies hold data that could power AI and better services, but they can't share it because it's personal.

- **Remove too little** and people get re-identified anyway. Deleting names isn't enough: ZIP code + birth date + gender alone singles out about 87% of Americans.
- **Remove too much** and the data becomes useless.

The brief says "think beyond simple anonymisation". Just blacking out names won't win.

## What the judges want (straight from the brief)

- The system **understands different kinds of sensitive information**
- It **chooses the right transformation** for each kind
- It **shows what analytical value remains** afterwards
- **Risk analysis**: how easy is it to re-identify people?
- **Transparent, measurable trade-offs** between privacy and usefulness
- **Concrete, testable proof** of why the transformed data can be trusted

## The idea: a privacy autopilot that proves its own work

```
raw data → DETECT → ASK PURPOSE → TRANSFORM → ATTACK → MEASURE USEFULNESS → REPORT
```

1. **Detect.** Scan every column/field and sort it into: direct identifier, quasi-identifier, sensitive value or safe.
2. **Ask the purpose.** The user says what the data is for, e.g. *"predict flu hospitalisations by age and region"*.
3. **Transform.** Pick a treatment for each field. Protect everything the purpose doesn't need more heavily, and keep what it does need as precise as possible. Explain every choice.
4. **Attack.** Try to re-identify people in our own output: match records against a fake "public" dataset, and let an LLM detective guess who people are. This gives a risk score before vs after.
5. **Measure usefulness.** Run the purpose analysis (e.g. train the prediction model) on the original and the transformed data, and compare the results.
6. **Report.** A privacy-vs-usefulness slider/chart and a trust report: what was found, what was done and why, risk score, usefulness kept, allowed uses.

### The toolbox

| Kind of info | Example | Typical treatment |
|---|---|---|
| Direct identifiers | name, hetu, phone | Remove, or swap for a consistent fake |
| Quasi-identifiers (harmless alone, identifying together) | age, postcode, gender, dates | Make vaguer: 34 → 30–39, 00100 → Helsinki |
| Sensitive values | diagnosis, income | Keep the patterns, add statistical noise (differential privacy) |
| Whole dataset | — | Synthetic data: fake rows with the same patterns |

## Demo flow (~3 min)

1. Upload a raw dataset. The system tags every column.
2. Type the purpose.
3. Run the attacker on the **raw** data: it re-identifies most people.
4. Run the autopilot. Run the attacker again: it mostly fails, and the prediction model barely changes.
5. Drag the slider to show the privacy-vs-usefulness trade-off.
6. Download the trust report.

The pitch line would sound like: *"Before, our attacker identified 80% of patients. After, 3%. The model lost 1% accuracy."* (Example numbers. We'd measure the real ones.)

## What makes it stand out

- **Purpose-aware:** "useful" is defined by what the data will actually be used for, not guessed.
- **Proves itself:** it attacks its own output instead of just claiming the data is safe.
- **Explains itself:** every choice comes with a reason a human can read.

## Which data does it run on? (depends on the material)

The pipeline stays the same. Only the input changes.

**A table** (likely, since TrustED's pilots use hospital data): run it as described above.

**Call recordings** (the call idea):

- **Detect:**
  - details said out loud (name, hetu, card number)
  - indirect clues ("I'm the only dentist in Inkoo")
  - sensitive topics (health, debt)
  - **the voice itself**: a voice works like a fingerprint, so voice recognition can identify a caller even with every name bleeped
- **Transform:**
  - names → consistent fake names
  - addresses → city only
  - numbers → fakes in the same format
  - voice, from weakest to strongest: pitch shift → voice conversion (new voice, same emotion) → full computer-voice re-synthesis (safest, but the emotion is lost)
- **Attack:** voice matching before and after, plus an LLM detective on what's left.
- **Measure usefulness:** does analysis of the anonymised calls (why they called, sentiment, was the problem solved) still agree with the originals?
- **Data:** generate fake calls (an LLM writes scripts with planted personal details, text-to-speech voices them). We know exactly what should be caught, so the measurements are honest.
- **Risks:**
  - we might be required to use the official material
  - audio pipelines are fiddly
  - spotting personal details is harder in Finnish than in English

**Decision:** wait for the material, then pick table or calls.

## Background: TrustED

An EU research project (Horizon Europe, led by Gradiant in Spain, with Fraunhofer, InfoCert, a hospital in Coimbra, and Sestek, a call-centre speech-analytics company) about trustworthy data sharing. It uses differential privacy, encryption, zero-knowledge proofs and federated learning. Its pilots: a hospital training AI to predict flu/COVID/RSV without moving patient data, and a digital ID wallet.

## Questions for when the material drops

- What type of data is it: a table, text or audio?
- Do we have to use the provided data, or can we bring our own?
- What are the judging criteria?
- Are there tools or credits we can use (e.g. ElevenLabs, LUMI)?
