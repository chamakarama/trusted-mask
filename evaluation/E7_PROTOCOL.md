# E7: optional synthetic membership diagnostic, predeclared protocol

Purpose: quantify one specific attack on the *mechanism*, without mistaking a low attack score for a proof of privacy. The canonical release and ledger are untouched. This is an additional diagnostic, not a replacement for the privacy argument or a new release policy search.

Threat model: attacker knows all other cards' bounded contributions exactly and a target card's complete bounded contribution vector. Compare two fixed neighbouring datasets: background alone versus background plus this one card. Subtract known background from the released signed vector. Components where the target contributes zero cancel from the likelihood ratio. This fixed-pair experiment does not model arbitrary population correlations, identity linkage, alternative histories, or all attackers.

Target selection: first three cards by SHA-256 of `routesafe-e7-v1:` plus their identifier among cards present in supplied taps. Selection does not use attack outcomes. Use production `prepare` on each card with the full public stop domain; transformation and contribution ranking are card-local. Report contribution totals, number of affected coordinates and effective epsilon, never card identifiers or individual routes.

Attack: exact Neyman–Pearson log likelihood ratio for independent discrete Laplace coordinates, `sum((abs(y)-abs(y-v))/scale)`, where `v` is the target bounded contribution and `y` is the noisy vector minus known background. This uses all released families and the same fixed scales/caps as E1.

Simulation: seed 20261106, NumPy PCG64. Integer discrete Laplace noise is sampled exactly as the difference of two independent geometric(p)-1 variables with `p=1-exp(-1/scale)`. This simulates the documented noise distribution; it is not a new OpenDP publication, a draw from the private publisher, or the already committed artifact. Do not claim this experiment attacked the single artifact repeatedly. Under this fixed-pair model the likelihood-ratio attack is optimal for each threshold.

For each target: 4,000 absent-target calibration samples; choose the empirical 99th-percentile threshold using the higher order statistic, predict membership only for scores strictly greater than it. Evaluate once on 10,000 absent and 10,000 present fresh samples. Report ROC AUC (ties receive half credit), actual FPR, TPR, Wilson 95% binomial intervals and the calibrated threshold. Do not adjust the threshold after test outcomes. Report all three targets, no selection of best-looking results. No target-average score is the privacy guarantee.

Sanity checks: exact contribution sums within caps; likelihood ratio never exceeds effective epsilon (within floating-point tolerance); AUC code checked on separated and tied toy scores. Compare results descriptively with the pure-DP fixed-pair limit TPR <= exp(epsilon) FPR; finite sample estimates need not satisfy that inequality exactly. No empirical result proves the implementation correct, changes epsilon, or establishes zero risk.

Timebox: 20 minutes. If blocked or invalid, retain the current UI's “not experimentally tested” statement and report the failure. Astra implements and executes; Opus reviews protocol/results before any UI claim or main integration.
