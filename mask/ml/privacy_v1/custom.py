"""Sparse logistic models with a data-only JSON/NPZ export (no pickle loading)."""
import json
from pathlib import Path
import numpy as np
from .contracts import ACTIONS, RELEVANCE, Prediction, Span
from .features import action_features, bio_labels, decode_bio, token_features, tokens


class LinearHead:
    def fit(self, features, labels, c=1.0, max_iter=500):
        from sklearn.feature_extraction import DictVectorizer
        from sklearn.linear_model import LogisticRegression
        vectorizer = DictVectorizer(dtype=np.float64)
        matrix = vectorizer.fit_transform(features)
        classifier = LogisticRegression(C=c, max_iter=max_iter, random_state=17)
        classifier.fit(matrix, labels)
        self.vocabulary = vectorizer.vocabulary_
        self.classes = list(classifier.classes_)
        self.weights = classifier.coef_
        self.bias = classifier.intercept_
        return self

    def predict(self, features):
        logits = self.bias.copy()
        for key, value in features.items():
            index = self.vocabulary.get(key)
            if index is not None:
                logits += self.weights[:, index] * value
        if len(self.classes) == 2:
            logits = np.array([0., logits[0]])
        logits -= logits.max()
        probs = np.exp(logits)
        return dict(zip(self.classes, (probs / probs.sum()).tolist(), strict=True))

    def save(self, path):
        path = Path(path)
        path.with_suffix(".json").write_text(json.dumps({"vocabulary": self.vocabulary, "classes": self.classes}))
        np.savez_compressed(path.with_suffix(".npz"), weights=self.weights, bias=self.bias)

    @classmethod
    def load(cls, path):
        path = Path(path)
        head = cls()
        metadata = json.loads(path.with_suffix(".json").read_text())
        head.vocabulary, head.classes = metadata["vocabulary"], metadata["classes"]
        with np.load(path.with_suffix(".npz"), allow_pickle=False) as arrays:
            head.weights, head.bias = arrays["weights"], arrays["bias"]
        if (not np.isfinite(head.weights).all() or not np.isfinite(head.bias).all()
                or head.weights.shape[1] != len(head.vocabulary)):
            raise ValueError("Invalid linear artifact")
        return head


class CustomModel:
    model_id = "custom-a-pilot"

    @classmethod
    def train(cls, records, c=1.0, max_iter=500):
        if not records or any(r["split"] != "train" for r in records):
            raise ValueError("Training accepts only nonempty train records")
        model = cls()
        tag_features, tag_labels, features, action_labels, rel_labels = [], [], [], [], []
        seen_detection = set()
        for record in records:
            text = record["text"]
            spans = [Span(s["start"], s["end"], s["label"]) for s in record["spans"]]
            # Task swaps must not double-weight the same detection example.
            if text not in seen_detection:
                detection = [Span(s["start"], s["end"], s["label"])
                             for s in record.get("detection_spans", record["spans"])]
                sequence, labels = bio_labels(text, detection)
                tag_features.extend(token_features(sequence, i) for i in range(len(sequence)))
                tag_labels.extend(labels)
                seen_detection.add(text)
            for span, label in zip(spans, record["spans"], strict=True):
                features.append(action_features(text, span, record["task"], record.get("context", "")))
                action_labels.append(label["action"])
                rel_labels.append(label["relevance"])
        model.detector = LinearHead().fit(tag_features, tag_labels, c, max_iter)
        model.action = LinearHead().fit(features, action_labels, c, max_iter)
        model.relevance = LinearHead().fit(features, rel_labels, c, max_iter)
        return model

    def detect(self, text):
        sequence = tokens(text)
        labels = [max(p, key=p.get) for p in (self.detector.predict(token_features(sequence, i))
                                             for i in range(len(sequence)))]
        return decode_bio(sequence, labels, "custom-tagger")

    def predict(self, text, span, task, context=""):
        features = action_features(text, span, task, context)
        actions, relevance = self.action.predict(features), self.relevance.predict(features)
        return Prediction({k: actions.get(k, 0.) for k in ACTIONS},
                          {k: relevance.get(k, 0.) for k in RELEVANCE})

    def save(self, directory):
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=False)
        for name in ("detector", "action", "relevance"):
            getattr(self, name).save(directory / name)

    @classmethod
    def load(cls, directory):
        model = cls()
        for name in ("detector", "action", "relevance"):
            setattr(model, name, LinearHead.load(Path(directory) / name))
        return model
