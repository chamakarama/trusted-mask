"""Integrity-checked local model bundles; inference has no network path."""
import json
from pathlib import Path
from .data import digest
from .contracts import ACTIONS, LABELS, RELEVANCE, VERSION
from .policy import POLICY_VERSION, COMPATIBLE_TRAINING_POLICIES


def write_manifest(directory, metadata):
    directory = Path(directory)
    files = {str(p.relative_to(directory)): digest(p) for p in sorted(directory.rglob("*"))
             if p.is_file() and p != directory / "manifest.json"}
    manifest = {**metadata, "bundle_schema": 1, "release_validated": False,
                "contract_version": VERSION, "policy_version": POLICY_VERSION,
                "label_order": list(LABELS), "action_order": list(ACTIONS), "relevance_order": list(RELEVANCE),
                "files": files}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def verify(directory):
    directory = Path(directory).resolve()
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("bundle_schema") != 1 or manifest.get("release_validated") is not False:
        raise ValueError("Unsupported bundle schema/release state")
    if not manifest.get("files"):
        raise ValueError("Empty model bundle")
    if (manifest.get("contract_version") != VERSION or manifest.get("policy_version") not in COMPATIBLE_TRAINING_POLICIES
            or manifest.get("label_order") != list(LABELS) or manifest.get("action_order") != list(ACTIONS)
            or manifest.get("relevance_order") != list(RELEVANCE)):
        raise ValueError("Model/policy contract mismatch")
    actual = {str(p.relative_to(directory)) for p in directory.rglob("*") if p.is_file() and p != directory / "manifest.json"}
    if actual != set(manifest["files"]):
        raise ValueError("Unexpected or missing bundle files")
    for relative, expected in manifest["files"].items():
        path = directory / relative
        if path.is_symlink() or not path.resolve().is_relative_to(directory) or digest(path) != expected:
            raise ValueError("Model artifact integrity check failed")
    return manifest


def load_model(directory, device="cpu"):
    metadata = verify(directory)
    if metadata["track"] == "custom-a":
        from .custom import CustomModel
        model = CustomModel.load(directory)
    elif metadata["track"] in ("encoder-b", "deberta-v3-base", "deberta-v3-large"):
        from .encoder import EncoderModel
        model = EncoderModel.load(directory, device=device)
    else:
        raise ValueError("Unknown model track")
    model.training_policy_version = metadata["policy_version"]
    model.bundle_sha256 = digest(Path(directory) / "manifest.json")
    return model
