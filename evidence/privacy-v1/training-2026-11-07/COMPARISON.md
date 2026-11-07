# Mask training comparison — 7 November 2026

**Recommended demo checkpoint: DeBERTa-v3-base, learning rate 2e-5, epoch 1.** It ties MiniLM on this small dev set, produces cleaner outputs on the supplied training demonstrations, and avoids custom-a’s fresh surname leak. Its CPU latency is usable for a reviewed demo. **None of the candidates reliably removes unrelated medical sections.** Do not present this as automatic privacy protection. The live demo was not replaced.

All three candidates trained and produced loadable bundles. Each candidate’s checkpoint was selected on dev, before inspecting the gallery/fresh diagnostics. Demo recommendation among those selected candidates also considers the explicitly rehearsed examples; it is not a held-out superiority claim.

| Selected candidate | Required-removal misses /46 | Direct spans removed /30 | Facts retained /182 | Requested DROP spans removed /9 | Unnecessary changed characters: benign / KEEP | Changed task-swap groups /7 |
|---|---:|---:|---:|---:|---:|---:|
| Rules only | 39 | 7 | 182 | 0 | 0 / 0 | 0 |
| custom-a, C=0.3 | 16 | 28 | 181 | 2 | 55 / 28 | 1 |
| MiniLM, 5e-5, epoch 1 | 15 | 30 | 182 | 0 | 0 / 0 | 0 |
| DeBERTa, 2e-5, epoch 1 | 15 | 30 | 182 | 0 | 0 / 0 | 0 |

These are full-pipeline draft metrics on 50 model-reviewed, 56–67-word dev records. “Miss” means an annotated non-KEEP span was not fully covered by an edit; it does not measure inference attacks. All outputs require review; no independent final-test or human-audited privacy guarantee exists.

Goal-agnostic baselines replace the model’s task with “Summarise the information.” Custom-a then has **17 misses, 181 retained facts and 1 DROP**, versus 16/181/2 with context. MiniLM and DeBERTa remain **15/182/0**. All goal-agnostic baselines change zero of seven task-swap groups. This is weak evidence of contextual editing, despite improved identifier removal.

| Candidate | Fresh misses /16 | Fresh facts /18 | Gallery exact targets /6 | Adapter fixtures matching all specified target cells /16 |
|---|---:|---:|---:|---:|
| Rules only | 8 | 18 | 1 | 7 |
| custom-a | 6 | 18 | 2 | 9 |
| MiniLM | 4 | 18 | 1 | 8 |
| DeBERTa | 4 | 18 | 2 | 9 |

Fresh checks use **three new 112–120-word sources under two tasks each**, never training or checkpoint-selection inputs. Every candidate leaves all four requested fresh section drops unchanged and changes zero of three fresh task-swap groups. All 16 adapter fixtures ran without an adapter exception. Gallery and adapter fixtures are **training-derived demonstrations**, not unseen evaluation; an exact-target mismatch can reflect formatting as well as substantive errors.

Actual output inspection found:

- Custom-a and DeBERTa exactly reproduce the main support-ticket and budget gallery targets. In the support example, `C-1042,Emma Wilson,...` becomes `[ACCOUNT_ID],[PERSON_1],[EMAIL],...`.
- MiniLM leaves `Wilson` in one support row and incorrectly aliases `Portal` in the prescription example. DeBERTa avoids those errors. Custom-a leaves `Reed` in the fresh budget example; both encoders remove all 12 fresh direct-identifier targets.
- All three retain the unrelated medical histories in the gallery. All leave the short `S-811`–`S-814` IDs in the second pasted CSV. The existing candidate rules reject account-like values shorter than six characters, accept only ISO-shaped DATE candidates, and mark many partial health spans as unconfirmed contextual boundaries. Those rules were preserved. Custom-a’s gallery gold-span action diagnostic is 58/58, yet its full pipeline removes only 38/47 required spans: classifier accuracy alone hides these failures.

Full before/after text, target comparisons, adapter cells, per-epoch scores and logs are in [measurements](measurements), including each `*-inspect/gallery-targets.json`, `fresh.outputs.json` and `adapters.json`.

| Bundle | Uncompressed size | CPU median / maximum pipeline latency |
|---|---:|---:|
| custom-a | 14.7 MB | 10 / 16 ms |
| MiniLM | 134.5 MB | 139 / 367 ms |
| DeBERTa | 746.6 MB | 664 / 2,399 ms |

CPU timings are one warmed sweep over 12 gallery/fresh cases on the four-vCPU Google VM, with four Torch threads; they are not desktop performance guarantees. All selected models pass offline CPU inference and CPU export/reload parity on those 12 cases, with identical predictions. GPU-to-CPU checks on five dev cases also pass: maximum probability differences are 0, 1.37e-6 and 2.38e-7 respectively. See [final CPU verification](measurements/final-cpu-verification.json).

DeBERTa is pinned to `8ccc9b6f36199bec6961081d44eb72fb3f7353f3`; MiniLM remains pinned to `44acabbec0ef496f6dbc93adadea57f376b7c0ec`. DeBERTa’s marker IDs are 128001/128002, tokenizer size 128003, and embedding/config size 128100: existing reserve rows suffice. Fast offsets were checked across train/dev; maximum detection/action lengths were 294/332 tokens. One standalone whitespace token is explicitly ignored, as in training and inference. Both tokenizers preserve IDs and offsets across export/reload on 569 texts, including Unicode probes. The pinned Transformers version emits a broad Mistral-regex warning for the local large-vocabulary tokenizer; its model type is verified as `deberta-v2`, its SentencePiece tokenizer is preserved, and no Mistral regex patch is applied. Fast SentencePiece byte-fallback limitations remain documented. See [tokenizer audit](measurements/tokenizer-audit.json) and [compatibility checks](measurements/deberta-compatibility.json).

Only the canonical 516 training records were fitted; the 50 dev records were evaluation-only. No authored copies, shards or pilot records were added. The bounded grid was custom C=0.3/1/3 at 500 iterations, and each encoder at learning rates 2e-5/5e-5 with checkpoints at epochs 1/2. Smoke tests preceded full runs. Selection was lexicographic: unsupported outputs, removal misses, lost facts, unnecessary edits, missed DROP spans. DeBERTa’s 5e-5 runs were rejected with 39 misses at both epochs. Optimizer states and all epoch bundles were saved during training; only selected inference bundles are published, alongside all comparison reports.

Train SHA-256: `df1c63afaea9fefd4193459e7ae4cdbeb05db2897d59f44b92d2d7bfcdaac1d9`  
Dev SHA-256: `f9ad0954b8904e8d8725095cfe2f409bef3992c8895bc11855ee163a1a0e857b`

The branch is based on `fc94f9f`. Custom-a/MiniLM used training commit `739f5a7`; DeBERTa used `6067629` after the whitespace audit correction. Later changes distinguish reporting roles and add verification/publication tooling without changing trained weights. The initial 47 cloud checks passed; the final local suite has 48 passing checks. No candidate failed to produce a usable bundle; successful training does not resolve the quality limits above.

The three weight archives are also available directly from this repository through **Git LFS**, with identical SHA-256 hashes. Follow the [repository download instructions](../../../mask/ml/privacy_v1/bundled_weights/training-2026-11-07/README.md) to fetch, verify and extract them without Google Cloud access.

Alternatively, **retrieve the private artifacts** using an account with access to HUGO infrastructure:

```sh
mkdir -p out/mask-trained-2026-11-07
gcloud storage cp 'gs://hugo-mask-training-20261107-artem/run-20261107-1845/*' out/mask-trained-2026-11-07/
cd out/mask-trained-2026-11-07
shasum -a 256 -c SHA256SUMS
tar xzf custom-a.tar.gz
tar xzf encoder-b.tar.gz
tar xzf deberta-v3-base.tar.gz
```

Use this branch’s loader for the new DeBERTa track. From the repository root, after installing the pinned dependencies:

```sh
HF_HUB_OFFLINE=1 python -c 'from mask.ml.privacy_v1.bundle import load_model; from mask.ml.privacy_v1.engine import Protector; m=load_model("out/mask-trained-2026-11-07/deberta-v3-base", device="cpu"); print(Protector(m).protect_text("My name is Nadia Vale; email: nadia.vale@example.invalid.", "Summarise the message.").as_dict())'
```

[Artifact hashes](SHA256SUMS), [dataset manifest](dataset.json), and [reproduction instructions](README.md) accompany the report. The private bucket retains the weights independently of the temporary VM; lifecycle and independent storage verification are recorded in the accompanying JSON files.

The temporary `since-ai-artem-training` VM was stopped and deleted after storage verification. Independent instance and disk listings return empty. The artifact bucket is retained. See [lifecycle proof](lifecycle.json) and [independent storage verification](storage-verification.json). Full campaign execution ran from 20:45:34 to 21:24:44 Helsinki time (39 minutes 10 seconds), followed by CPU verification, packaging, publication and cleanup.
