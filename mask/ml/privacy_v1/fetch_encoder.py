"""Explicit download step; inference never downloads models or code."""
import argparse
import json
from pathlib import Path


def main():
    from huggingface_hub import HfApi, snapshot_download
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    config = json.loads((Path(__file__).parent / "configs" / "encoder_b.json").read_text())
    model_id, revision = config["model_id"], config["revision"]
    resolved = HfApi().model_info(model_id, revision=revision).sha
    if len(revision) != 40 or resolved != revision:
        raise ValueError("Expected immutable checkpoint revision")
    snapshot_download(model_id, revision=revision, local_dir=args.output,
                      allow_patterns=["config.json", "vocab.txt", "tokenizer*.json", "special_tokens_map.json",
                                      "model.safetensors", "pytorch_model.bin", "README.md", "LICENSE*"])
    (args.output / "source.json").write_text(json.dumps({"repository": model_id, "revision": revision}, indent=2))
    print(json.dumps({"repository": model_id, "revision": revision, "directory": str(args.output)}))


if __name__ == "__main__":
    main()
