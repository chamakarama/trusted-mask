# RouteSafe plans and supplied materials

Start with [ROUTESAFE_BUILD_PLAN.md](ROUTESAFE_BUILD_PLAN.md), then [the interface contract](planning/INTERFACES.md) and [the coordination guide and agent launch prompts](planning/COORDINATION.md). These are planning documents; implementation has not begun. The existing README is preserved as the teammate's earlier ideation.

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

Only the allowlisted protected release and public geometry belong in the planner's deployed assets. Do not deploy this entire repository as a static folder. Follow the original package's notices and licenses: code is supplied under MIT terms and data/documentation under CC BY 4.0, with upstream attribution retained.

OS metadata, local credentials, dependency caches and future private runtime outputs are excluded from Git. No RouteSafe implementation, experiment result or performance claim is implied by the presence of the supplied benchmark results.
