/** Spawning the Python benchmark runner: one subprocess per plan (the toolkit caches by id() of frames). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MASK_DIR } from "../../labels/common";
import { PKG } from "./data";

export const PYTHON = process.env.MASK_PYTHON ?? "python3";
export const RUN_BENCH = path.join(MASK_DIR, "bench", "run_bench.py");

export function runBench(runDir: string, scenarioId: string, extra: string[] = [], quiet = false): { status: number | null; reportPath: string; stdout: string; stderr: string } {
  const args = ["-I", RUN_BENCH, "--run", runDir, "--scenario", scenarioId, "--pkg", PKG, ...extra];
  const r = spawnSync(PYTHON, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!quiet) { if (r.stdout) process.stdout.write(r.stdout); if (r.stderr) process.stderr.write(r.stderr); }
  return { status: r.status, reportPath: path.join(runDir, "report.json"), stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** True when python3 with pandas, numpy, scipy and scikit-learn and the supplied package are available. */
export function pythonAvailable(): boolean {
  if (!fs.existsSync(path.join(PKG, "toolkit", "pets_eval"))) return false;
  const r = spawnSync(PYTHON, ["-I", "-c", "import pandas, numpy, scipy, sklearn"], { encoding: "utf8" });
  return r.status === 0;
}
