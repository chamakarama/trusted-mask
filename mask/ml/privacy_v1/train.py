"""Reproducible pilot training. Validation and final-test rows cannot enter training."""
import argparse
import json
import os
import platform
import tempfile
import time
from pathlib import Path
from .bundle import write_manifest
from .data import digest, load_records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--track", choices=("custom-a", "encoder-b"), required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--base", type=Path)
    parser.add_argument("--device", choices=("cpu", "mps", "cuda"), default="cpu")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--max-steps", type=int)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; use a new versioned directory")
    if args.epochs < 1 or args.max_steps is not None and args.max_steps < 1:
        parser.error("Training bounds must be positive")
    records = load_records(args.data)
    train = [record for record in records if record["split"] == "train"]
    if not train:
        parser.error("No training examples")
    start = time.perf_counter()
    if args.track == "custom-a":
        from .custom import CustomModel
        model = CustomModel.train(train)
        details = {"algorithm": "sparse_logistic_regression", "C": 1.0, "max_iter": 500, "seed": 17}
    else:
        if args.base is None:
            parser.error("Encoder requires --base pointing to a pinned local checkpoint")
        from .encoder import EncoderModel
        model = EncoderModel.from_pretrained(args.base, device=args.device)
        details = model.train_records(train, epochs=args.epochs, max_steps=args.max_steps)
        details.update({"learning_rate": 3e-5, "seed": 17, "source": model.source})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent, prefix=".training-") as temp:
        destination = Path(temp) / "bundle"
        model.save(destination)
        write_manifest(destination, {"track": args.track, "dataset_sha256": digest(args.data),
            "train_records": len(train), "train_families": len({r["family_id"] for r in train}),
            "training": details, "elapsed_seconds": time.perf_counter() - start,
            "machine": platform.platform(), "device": args.device,
            "calibrated": False, "purpose": "engineering_pilot_only"})
        os.rename(destination, args.output)
    print(json.dumps({"output": str(args.output), "track": args.track,
                      "elapsed_seconds": time.perf_counter() - start, "release_validated": False}))


if __name__ == "__main__":
    main()
