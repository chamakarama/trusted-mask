"""Shared, versioned contracts. Offsets are Python Unicode code points, [start,end)."""
from dataclasses import asdict, dataclass, field
from typing import Protocol
import math

VERSION = "privacy-v1-pilot.1"
PIPELINE_VERSION = "privacy-edit-pipeline.2"
RECEIVING_AI_INSTRUCTION = ("Privacy note: Labels such as [PERSON_1] represent redacted references. "
                          "You may use these labels verbatim in your reply. "
                          "Do not guess or invent the hidden values.")
LABELS = ("PERSON", "EMAIL", "PHONE", "ADDRESS", "USERNAME", "ACCOUNT_ID",
          "NATIONAL_ID", "PAYMENT_CARD", "IBAN", "SECRET", "DATE", "AGE",
          "LOCATION", "ORG", "HEALTH", "FINANCIAL", "EMPLOYMENT", "FAMILY")
ACTIONS = ("KEEP", "DROP", "ALIAS", "ROLE", "GENERALISE", "PLACEHOLDER")
RELEVANCE = ("essential", "unnecessary", "uncertain")
# Types found only by validated rules, never by the trained models. Kept out of LABELS so the
# model label order (checked against every bundle manifest) does not change. They are not direct
# identifiers: whether an IP or VAT number matters depends on the request, which no trained model has
# learned for these types yet, so they are kept by default and listed for the user's review.
RULE_ONLY_LABELS = ("IP_ADDRESS", "VAT_ID")
ALL_LABELS = LABELS + RULE_ONLY_LABELS
DIRECT = frozenset(LABELS[:10])
KEPT_FOR_REVIEW = "detected_kept_for_review"


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    label: str
    source: str = "annotation"

    def validate(self, text: str):
        if self.label not in ALL_LABELS or not (0 <= self.start < self.end <= len(text)):
            raise ValueError("Invalid span label or bounds")


@dataclass
class Prediction:
    actions: dict[str, float]
    relevance: dict[str, float]

    def validate(self):
        for values, keys in ((self.actions, ACTIONS), (self.relevance, RELEVANCE)):
            if set(values) != set(keys) or any(not math.isfinite(v) or v < 0 for v in values.values()):
                raise ValueError("Invalid prediction distribution")
            if abs(sum(values.values()) - 1) > 1e-4:
                raise ValueError("Prediction probabilities must sum to one")


class Model(Protocol):
    model_id: str
    def detect(self, text: str) -> list[Span]: ...
    def predict(self, text: str, span: Span, task: str, context: str = "") -> Prediction: ...


@dataclass
class Edit:
    start: int
    end: int
    label: str
    action: str
    replacement: str
    reason: str
    score: float | None


@dataclass
class Result:
    status: str
    protected_text: str | None
    model_version: str
    edits: list[Edit] = field(default_factory=list)
    retained_sensitive: list[dict] = field(default_factory=list)
    review_reasons: list[str] = field(default_factory=list)
    coverage: dict = field(default_factory=dict)
    protected_task: str | None = None
    protected_history: list[str] = field(default_factory=list)
    pending_reviews: list[dict] = field(default_factory=list)
    context_reports: list[dict] = field(default_factory=list)
    runtime_versions: dict = field(default_factory=dict)
    section_diagnostics: list[dict] = field(default_factory=list)
    receiving_ai_instruction: str = RECEIVING_AI_INSTRUCTION

    def as_dict(self):
        # Deliberately excludes original text, original values, and alias maps.
        return asdict(self)
