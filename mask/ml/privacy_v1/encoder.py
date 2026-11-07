"""Track B: one shared local encoder, BIO tagging and task-conditioned heads."""
import json
import random
from pathlib import Path
import torch
from torch import nn
from transformers import AutoConfig, AutoModel, AutoTokenizer
from safetensors.torch import load_file, save_file
from .contracts import ACTIONS, LABELS, RELEVANCE, Prediction, Span
from .features import decode_bio

TAGS = ("O",) + tuple(f"{prefix}-{label}" for label in LABELS for prefix in ("B", "I"))
LIMIT = 512


class Network(nn.Module):
    def __init__(self, backbone):
        super().__init__()
        self.backbone = backbone
        width = backbone.config.hidden_size
        self.tag = nn.Linear(width, len(TAGS))
        self.action = nn.Linear(width, len(ACTIONS))
        self.relevance = nn.Linear(width, len(RELEVANCE))

    def forward(self, batch, mode):
        hidden = self.backbone(**batch).last_hidden_state
        return self.tag(hidden) if mode == "tag" else (self.action(hidden[:, 0]), self.relevance(hidden[:, 0]))


class EncoderModel:
    model_id = "encoder-b-pilot"

    def __init__(self, net, tokenizer, source, device="cpu"):
        self.net, self.tokenizer, self.source = net.to(device), tokenizer, source
        self.device = device
        self.model_id = "deberta-v3-base" if source.get("repository") == "microsoft/deberta-v3-base" else "encoder-b-pilot"
        if not tokenizer.is_fast:
            raise ValueError("Fast tokenizer required for lossless offsets")
        marker_ids = tokenizer.convert_tokens_to_ids(["[unused0]", "[unused1]"])
        if len(set(marker_ids)) != 2 or tokenizer.unk_token_id in marker_ids:
            raise ValueError("Span markers must be distinct known tokens")
        if max(tokenizer.get_vocab().values()) >= net.backbone.get_input_embeddings().num_embeddings:
            raise ValueError("Tokenizer exceeds backbone embedding size")
        self.net.eval()

    @classmethod
    def from_pretrained(cls, directory, device="cpu"):
        torch.manual_seed(17)
        directory = Path(directory)
        source = json.loads((directory / "source.json").read_text())
        tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        if not tokenizer.is_fast:
            raise ValueError("Fast tokenizer required for lossless offsets")
        tokenizer.add_special_tokens({"additional_special_tokens": ["[unused0]", "[unused1]"]})
        backbone = AutoModel.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        if len(tokenizer) > backbone.get_input_embeddings().num_embeddings:
            backbone.resize_token_embeddings(len(tokenizer), mean_resizing=False)
        return cls(Network(backbone), tokenizer, source, device)

    @staticmethod
    def _offset(text, a, b):
        # SentencePiece may include the preceding space in a token's source range.
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b - 1].isspace():
            b -= 1
        return a, b

    def _action_input(self, text, span, task, context):
        # No silent truncation. Oversized action context is an explicit review/unsupported case.
        source = text[:span.start] + " [unused0] " + text[span.start:span.end] + " [unused1] " + text[span.end:]
        batch = self.tokenizer(task + "\n" + context + "\nType: " + span.label, source, return_tensors="pt")
        if batch["input_ids"].shape[1] > LIMIT:
            raise ValueError("Action context exceeds encoder window; windowing not yet validated")
        return {k: v.to(self.device) for k, v in batch.items()}

    @torch.inference_mode()
    def detect(self, text):
        encoded = self.tokenizer(text, max_length=LIMIT, stride=64, truncation=True,
                                 return_overflowing_tokens=True, return_offsets_mapping=True,
                                 padding=True, return_tensors="pt")
        offsets = encoded.pop("offset_mapping").tolist()
        encoded.pop("overflow_to_sample_mapping")
        batch = {k: v.to(self.device) for k, v in encoded.items()}
        logits = self.net(batch, "tag").cpu()
        # Merge overlapping windows at token offsets before BIO decoding.
        values = {}
        for window, mapping in zip(logits, offsets, strict=True):
            for logit, (a, b) in zip(window, mapping, strict=True):
                a, b = self._offset(text, a, b)
                if a == b:
                    continue
                values.setdefault((a, b), []).append(logit)
        sequence, labels = [], []
        for (a, b), predictions in sorted(values.items()):
            sequence.append((text[a:b], a, b))
            labels.append(TAGS[int(torch.stack(predictions).mean(0).argmax())])
        return decode_bio(sequence, labels, "encoder-tagger")

    @torch.inference_mode()
    def predict(self, text, span, task, context=""):
        action, relevance = self.net(self._action_input(text, span, task, context), "action")
        return Prediction(dict(zip(ACTIONS, action.softmax(-1)[0].cpu().tolist(), strict=True)),
                          dict(zip(RELEVANCE, relevance.softmax(-1)[0].cpu().tolist(), strict=True)))

    def train_records(self, records, epochs=1, max_steps=None, learning_rate=3e-5, on_epoch=None):
        from .policy import allowed_actions
        if not records or any(r["split"] != "train" for r in records):
            raise ValueError("Training accepts only nonempty train records")
        if epochs < 1 or learning_rate <= 0 or (max_steps is not None and max_steps < 1):
            raise ValueError("Training bounds must be positive")
        jobs, seen = [], set()
        for record in records:
            if record["text"] not in seen:
                jobs.append(("tag", record, None))
                seen.add(record["text"])
            for entry in record["spans"]:
                jobs.append(("action", record, entry))
        optimizer = torch.optim.AdamW(self.net.parameters(), lr=learning_rate, weight_decay=0.01)
        randomizer = random.Random(17)
        steps, losses = 0, []
        self.net.train()
        for epoch in range(epochs):
            randomizer.shuffle(jobs)
            for mode, record, entry in jobs:
                if max_steps is not None and steps >= max_steps:
                    break
                optimizer.zero_grad(set_to_none=True)
                if mode == "tag":
                    encoded = self.tokenizer(record["text"], return_offsets_mapping=True, return_tensors="pt")
                    if encoded["input_ids"].shape[1] > LIMIT:
                        raise ValueError("Training record exceeds window; window it before annotation")
                    offsets = encoded.pop("offset_mapping")[0].tolist()
                    targets = []
                    for a, b in offsets:
                        a, b = self._offset(record["text"], a, b)
                        if a == b:
                            targets.append(-100)
                            continue
                        overlaps = [s for s in record.get("detection_spans", record["spans"])
                                    if s["start"] < b and a < s["end"]]
                        if len(overlaps) > 1:
                            raise ValueError("Annotation overlaps a tokenizer boundary")
                        label = "O" if not overlaps else ("B-" if a <= overlaps[0]["start"] else "I-") + overlaps[0]["label"]
                        targets.append(TAGS.index(label))
                    logits = self.net({k: v.to(self.device) for k, v in encoded.items()}, "tag")
                    loss = nn.functional.cross_entropy(logits.view(-1, len(TAGS)), torch.tensor(targets, device=self.device))
                else:
                    span = Span(entry["start"], entry["end"], entry["label"])
                    batch = self._action_input(record["text"], span, record["task"], record.get("context", ""))
                    action, relevance = self.net(batch, "action")
                    allowed = allowed_actions(span, record["text"][span.start:span.end])
                    mask = torch.tensor([a not in allowed for a in ACTIONS], device=self.device)
                    action = action.masked_fill(mask, -1e4)
                    loss = nn.functional.cross_entropy(action, torch.tensor([ACTIONS.index(entry["action"])], device=self.device))
                    loss += nn.functional.cross_entropy(relevance, torch.tensor([RELEVANCE.index(entry["relevance"])], device=self.device))
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite training loss")
                loss.backward()
                nn.utils.clip_grad_norm_(self.net.parameters(), 1.0)
                optimizer.step()
                steps += 1
                losses.append(float(loss.detach().cpu()))
                if steps % 50 == 0:
                    print(json.dumps({"epoch": epoch, "steps": steps, "recent_loss": sum(losses[-50:]) / 50}), flush=True)
            self.net.eval()
            if on_epoch is not None:
                on_epoch(self, epoch + 1, {"steps": steps, "learning_rate": learning_rate,
                    "mean_training_loss": sum(losses) / max(1, len(losses)),
                    "bounded_smoke_run": max_steps is not None}, optimizer)
            if max_steps is not None and steps >= max_steps:
                break
            self.net.train()
        self.net.eval()
        return {"steps": steps, "epochs_requested": epochs, "mean_training_loss": sum(losses) / max(1, len(losses)),
                "bounded_smoke_run": max_steps is not None}

    def save(self, directory):
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=False)
        self.net.backbone.config.save_pretrained(directory)
        self.tokenizer.save_pretrained(directory)
        save_file({k: v.detach().cpu().contiguous() for k, v in self.net.state_dict().items()}, directory / "model.safetensors")
        (directory / "source.json").write_text(json.dumps(self.source, indent=2))

    @classmethod
    def load(cls, directory, device="cpu"):
        directory = Path(directory)
        config = AutoConfig.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        net = Network(AutoModel.from_config(config, trust_remote_code=False))
        net.load_state_dict(load_file(directory / "model.safetensors"), strict=True)
        tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        return cls(net, tokenizer, json.loads((directory / "source.json").read_text()), device)
