# Commit IDs in evidence files

This repository's history was rewritten before publication to remove the organiser's challenge dataset and two 1.5 GB DeBERTa-large weight archives from every commit. Commit contents are otherwise unchanged, but every commit after the dataset was added received a new ID.

Evidence files, model manifests and download URLs keep the original IDs. Those IDs match the team's development repository, where the recorded download URLs still resolve. To find the same commit here, use this table:

| Cited ID | ID in this repository | Commit |
|---|---|---|
| `0b3854dfb65e` | `6e4853eb0088` | Report base and large dev selection, published CPU parity, and cloud cleanup |
| `77ea2fec6cd9` | `e2987d4dcef7` | Give email addresses stable numbered aliases restored in the reply |
| `2ff08b1b4f87` | `f509f3ac7f9f` | Add published-bundle CPU parity and synthetic end-to-end diagnostics |
| `2bde86c040cc` | `fdf5a7bec1c3` | Publish dev-selected large epoch one while preserving epoch two |
| `cce29181bfcc` | `f9192ec7d9c0` | Publish required large section-head weights immediately; evaluation pending |
| `f122d941e313` | `6997ebb5470b` | Use non-reentrant checkpointing for large DeBERTa shared position tensors |
| `0484de13dd6a` | `2fe7fa3c552f` | Align section fragment supervision and approved-clause preservation |
| `064353e8b6b6` | `beb3e3f18c97` | Publish base section-head weights immediately; evaluation pending |
| `7f2a1b3db3e7` | `ef15c927b9da` | Preserve remaining local demo edits and historical preview outputs |
| `9c12aa58d1ac` | `de3b817b5e9a` | Publish three reviewed training weight bundles through Git LFS |
| `e5bf79d7e1ef` | `6aa377575521` | Add the Mask logo: half mask on a faint face |
| `fc94f9f1f300` | `b00593e6ee78` | Consolidate reviewed training data and add 22 demo examples |
| `739f5a703b2c` | `e31c7921e964` | Add bounded canonical-data training campaign and DeBERTa adapter |
| `6067629ad69e` | `7e273c0a2bcb` | Handle SentencePiece whitespace checks and record cloud artifact workflow |

The browser build pins `0b3854d` as its source identity (`mask/browser/runtime-source.json`); `scripts/source_snapshot.py` reads the identical Python files from the rewritten commit.
