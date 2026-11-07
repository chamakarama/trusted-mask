"""Reconstruct the checked-in pilot weights after Git LFS pull (no downloads)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def restore(source, destination, expected):
    source, destination = Path(source), Path(destination)
    spec = json.loads((source / "parts.json").read_text())
    if spec.get("schema") != 1 or spec.get("sha256") != expected or not spec.get("parts"):
        raise ValueError("Weight chunks do not match the original model manifest")
    if destination.exists():
        if digest(destination) != expected:
            raise ValueError("Existing weights differ; refusing to overwrite them")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".restore-", dir=destination.parent)
    temporary = Path(temporary)
    try:
        with os.fdopen(handle, "wb") as output:
            for part in spec["parts"]:
                name = part["file"]
                if Path(name).name != name:
                    raise ValueError("Invalid chunk filename")
                path = source / name
                if path.is_symlink() or path.stat().st_size != part["size"] or digest(path) != part["sha256"]:
                    raise ValueError(f"Missing or corrupt chunk {name}; run git lfs pull first")
                with path.open("rb") as chunk:
                    for block in iter(lambda: chunk.read(1024 * 1024), b""):
                        output.write(block)
        if temporary.stat().st_size != spec["size"] or digest(temporary) != expected:
            raise ValueError("Restored weights failed original checksum verification")
        # Exclusive publication also prevents replacing a file created during restoration.
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    root = Path(__file__).resolve().parent
    bundle = root / "artifacts" / "encoder-b-pilot"
    expected = json.loads((bundle / "manifest.json").read_text())["files"]["model.safetensors"]
    restore(root / "bundled_weights" / "encoder-b-pilot", bundle / "model.safetensors", expected)
    from .bundle import verify
    for name in ("custom-a-pilot", "encoder-b-pilot"):
        verify(root / "artifacts" / name)
    print("Both original pilot bundles verified; weights are unchanged.")


if __name__ == "__main__":
    main()
