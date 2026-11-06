# RouteSafe plans and supplied materials

Start with [ROUTESAFE_BUILD_PLAN.md](ROUTESAFE_BUILD_PLAN.md), then [the interface contract](planning/INTERFACES.md) and [the coordination guide and agent launch prompts](planning/COORDINATION.md). These are planning documents. The integrated scanner, private publisher and public planner are now implemented; use [ROUTESAFE_DEVELOPMENT.md](ROUTESAFE_DEVELOPMENT.md) for startup and [the evidence guide](evidence/README.md) for executed results and limitations. The root README retains earlier ideation below its current status, and the build plan records the accepted scope from [the combined proposal](COMBINED_IDEA.md).

The complete supplied `TRUSTED_SinceAI2026_FINAL/` folder is included, with its original ZIP, extracted dataset/toolkit, challenge PDF, detailed brief, and partner video/transcript. Source files are preserved byte for byte. Large files are stored with Git LFS; small source and documentation files remain ordinary Git files.

## Obtain the full dataset

Install Git LFS using the [official installation instructions](https://git-lfs.com/), then:

```sh
git lfs install
git clone https://github.com/Chintufp/Since-AI-hackathon---WAWS.git
cd Since-AI-hackathon---WAWS
git lfs pull
git lfs fsck
```

For an existing clone, run `git lfs install` and `git lfs pull` there. A tiny text file starting with `version https://git-lfs.github.com/spec/v1` is a pointer, not the actual CSV, ZIP or video. GitHub's source ZIP download may not contain materialised LFS content; use the commands above.

The extracted package's `MANIFEST.json` contains checksums for verifying its members. Both builders should verify materialisation before running experiments. Do not edit the supplied package to make tests pass; put adapters and generated outputs outside it.

## Data and publishing boundaries

The supplied records are synthetic challenge materials. Evaluation truth, attacker data and baseline rowmaps are included as part of that original package, **not as RouteSafe product output**. They must not become hidden inputs to the production pipeline or be copied into the public planner app. New evaluation rowmaps and any real private inputs must remain outside published product releases.

The public build contains only explicitly allowlisted application assets, protected release files, public geometry, contract schema and the curated synthetic-only `evidence/evidence-summary.json`. That evidence summary includes exact synthetic reference results and must not be generated for public release from real private data. Do not deploy this entire repository as a static folder. Follow the original package's notices and licenses: code is supplied under MIT terms and data/documentation under CC BY 4.0, with upstream attribution retained.

OS metadata, local credentials, dependency caches and future private runtime outputs are excluded from Git. No RouteSafe implementation, experiment result or performance claim is implied by the presence of the supplied benchmark results.
