# Mask challenge materials

The supplied `TRUSTED_SinceAI2026_FINAL/` folder is unchanged. It includes the original archive, synthetic datasets, toolkit, challenge PDF, detailed brief, and partner presentation. Large members use Git LFS: run `git lfs pull` and `git lfs fsck` before experiments. A file starting with `version https://git-lfs.github.com/spec/v1` is a pointer, not data.

## Owning sources

- [Detailed brief](TRUSTED_SinceAI2026_FINAL/TrustED_PETs_Transformer_Challenge_Brief_FINAL_REVIEW%20%281%29.docx): detect risks, justify transformations, demonstrate protected output and retained analytical utility. AI is optional.
- [Package guide](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/START_HERE.md): datasets, labels and evaluation paths.
- [Taxonomy](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/metadata/taxonomy.md): field roles, subtypes and span labels.
- [Sharing scenarios](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/metadata/scenarios.json): purpose, recipient, threat assumptions and utility tasks.
- [PET playbook](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/docs/PET_PLAYBOOK.md): techniques and their limitations.
- [Evaluation](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/docs/EVALUATION.md): detection, attacks, text leakage and utility. The toolkit scorecard is a self-assessment aid, not the official judging rubric.
- [Customer-service dataset](TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/customer_service/README.md): proposed first mixed structured/text demonstration, public training span labels and organiser-held evaluation labels.

## Training and export boundaries

The field catalog and span annotations label content, not the optimal protection method. Create method-selection targets through reviewed decisions or evaluated candidate plans and record their provenance.

The same synthetic people recur across domains. Separate people, conversations, source groups and derived variants across train/validation/test as appropriate. Field classification also needs held-out schemas/domains; millions of rows do not create millions of independent field labels.

The inherited detector was developed with the field catalog visible, and the supplied unlabelled HR file was inspected previously. Neither is a new blind benchmark for that detector. Unlabelled inputs support qualitative inspection; numerical accuracy needs independent labels or organiser scoring.

Attacker files, truth tables and private row mappings are offline evaluation inputs, not production features or export content. Preserve the customer-service organiser-held evaluation split; missing hidden annotations are not negative labels.

Data/documentation: CC BY 4.0. Toolkit: MIT. Retain upstream notices. All supplied records are synthetic; availability does not establish production readiness.
