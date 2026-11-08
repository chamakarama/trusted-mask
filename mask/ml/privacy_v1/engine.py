"""Local inference boundary: proposals -> coherent policy plan -> exact edits."""
from collections import defaultdict
from .contracts import (ACTIONS, ALIASED, DIRECT, KEPT_FOR_REVIEW, RELEVANCE, RULE_ONLY_LABELS, Edit, Prediction, Result,
                        PIPELINE_VERSION)
from .policy import Aliases, POLICY_VERSION, allowed_actions, replacement
from .candidates import build_candidates
from .editing import apply_edits, drop_bounds

MAX_TEXT_CHARS = 32_000
MAX_CONTEXT_CHARS = 16_000


class RulesModel:
    model_id = "rules-only-pilot"

    def detect(self, text):
        return []

    def predict(self, text, span, task, context=""):
        action = "ALIAS" if span.label in ALIASED else "PLACEHOLDER"
        return Prediction({x: float(x == action) for x in ACTIONS},
                          {x: float(x == "uncertain") for x in RELEVANCE})


class Protector:
    def __init__(self, model=None):
        self.model = model or RulesModel()

    def runtime_versions(self):
        return {"pipeline": PIPELINE_VERSION, "policy": POLICY_VERSION,
                "model_training_policy": getattr(self.model, "training_policy_version", "unknown"),
                "model_bundle_sha256": getattr(self.model, "bundle_sha256", None)}

    def _decision(self, text, span, task, context):
        if span.label in RULE_ONLY_LABELS:  # no model has learned these types: never edit automatically
            return "KEEP", None, KEPT_FOR_REVIEW, {"essential": 0.0, "unnecessary": 0.0, "uncertain": 1.0}
        prediction = self.model.predict(text, span, task, context)
        prediction.validate()
        allowed = allowed_actions(span, text[span.start:span.end])
        action = max(allowed, key=lambda a: prediction.actions[a])
        mass = sum(prediction.actions[a] for a in allowed)
        score = prediction.actions[action] / mass if mass else 0.0
        relevance = prediction.relevance
        if relevance["essential"] >= 0.5:
            return "KEEP", score, "essential_fact", relevance
        if not task.strip() or relevance["uncertain"] >= 0.5 or score < 0.7:
            return "KEEP", score, "uncertain_treatment", relevance
        if action != "KEEP" and relevance["unnecessary"] < 0.85:
            return "KEEP", score, "uncertain_treatment", relevance
        return action, score, "model_proposal_with_policy_mask", relevance

    def _segment(self, text, task, context, aliases, header=""):
        tokenizer = getattr(self.model, "tokenizer", None)
        if tokenizer is not None:
            limit = self.model.net.backbone.config.max_position_embeddings
            context_tokens = tokenizer(task + "\n" + context, add_special_tokens=True)["input_ids"]
            if len(context_tokens) + 8 >= limit:
                raise ValueError("Intended use/history exceeds model context capacity")
        entities, sections, pending = build_candidates(text, self.model.detect(text), header)
        edits, retained = [], []
        review = ["experimental_model_not_release_validated"]
        if pending:
            review.append("unconfirmed_detection_requires_review")
        if not task.strip():
            review.append("missing_task")
        groups = defaultdict(list)
        for section in sections:
            groups[(section.start, section.end)].append(section)
        dropped, essential_sections = [], []
        for (start, end), group in groups.items():
            decisions = [(s, *self._decision(text, s, task, context)) for s in group]
            if any(reason == "essential_fact" for _, _, _, reason, _ in decisions):
                essential_sections.append((start, end))
            veto_reason = None
            # All interpretations must support removal; required/uncertain facts veto it.
            removable = all(action == "DROP" and rel["unnecessary"] >= 0.85
                            for _, action, _, _, rel in decisions)
            if removable and any(p["start"] < end and start < p["end"] for p in pending):
                removable = False
                veto_reason = "section_contains_unconfirmed_detection"
                review.append(veto_reason)
            if removable:
                nested = [s for s in entities if s.label not in DIRECT and start <= s.start and s.end <= end]
                if any(self._decision(text, s, task, context)[0] == "KEEP" for s in nested):
                    removable = False
                    veto_reason = "section_contains_retained_fact"
                    review.append(veto_reason)
            if removable:
                try:
                    a, b = drop_bounds(text, start, end)
                except ValueError:
                    review.append("unsupported_section_boundary")
                else:
                    if any(s.start < a < s.end or s.start < b < s.end for s in entities):
                        review.append("section_entity_boundary_conflict")
                    else:
                        edits.append(Edit(a, b, group[0].label, "DROP", "", "unnecessary_section",
                                          min(d[2] for d in decisions)))
                        dropped.append((a, b))
                        continue
            for section, _, _, reason, _ in decisions:
                if veto_reason:
                    reason = veto_reason
                if any(action == "PLACEHOLDER" for _, action, _, _, _ in decisions):
                    reason = "section_requires_explicit_drop"
                    review.append(reason)
                retained.append({"start": start, "end": end, "label": section.label, "reason": reason})
                if reason == "uncertain_treatment":
                    review.append(reason)
        for span in entities:
            if any(a <= span.start and span.end <= b for a, b in dropped):
                continue
            value = text[span.start:span.end]
            if span.label in DIRECT:
                action = "ALIAS" if span.label in ALIASED else "PLACEHOLDER"
                score, reason = None, "direct_identifier_policy"
            else:
                if any(a <= span.start and span.end <= b for a, b in essential_sections):
                    action, score, reason = "KEEP", None, "essential_parent_context"
                else:
                    action, score, reason, _ = self._decision(text, span, task, context)
                if action == "DROP":
                    action = "PLACEHOLDER"
                if reason in ("uncertain_treatment", KEPT_FOR_REVIEW):
                    review.append(reason)
                if action == "KEEP":
                    retained.append({"start": span.start, "end": span.end, "label": span.label, "reason": reason})
                    continue
            edits.append(Edit(span.start, span.end, span.label, action,
                              replacement(span, value, action, aliases), reason, score))
        edits.sort(key=lambda e: (e.start, e.end))
        coherent = []
        for edit in edits:
            if coherent and coherent[-1].action == edit.action == "DROP" and edit.start <= coherent[-1].end:
                coherent[-1].end = max(coherent[-1].end, edit.end)
            else:
                coherent.append(edit)
        for edit in coherent:
            if edit.action == "DROP" and (edit.end == len(text) or text[edit.end:edit.end+1] in ".!?"):
                left = edit.start
                while left > 0 and text[left-1] in " \t":
                    left -= 1
                if left > 0 and text[left-1] == ";":
                    edit.start = left - 1
        protected = apply_edits(text, coherent)
        return Result("needs_review", protected, self.model.model_id, coherent, retained,
                      sorted(set(review)), {"scanned_characters": len(text), "total_characters": len(text),
                                            "complete": True, "offset_unit": "unicode_code_point"},
                      pending_reviews=pending, runtime_versions=self.runtime_versions())

    def protect_text(self, text: str, task: str, history=None, policy="consumer-v1", *, language="en"):
        history = [] if history is None else history
        if (not isinstance(text, str) or not isinstance(task, str) or not isinstance(history, list)
                or any(not isinstance(x, str) for x in history)):
            raise TypeError("Text/task must be strings and history a list of strings")
        reason = None
        if policy != "consumer-v1":
            reason = "unsupported_policy"
        elif language != "en":
            reason = "unsupported_language"
        elif len(text) > MAX_TEXT_CHARS or len(task) + sum(map(len, history)) > MAX_CONTEXT_CHARS:
            reason = "input_limit_exceeded"
        elif any(any((ord(c) < 32 and c not in "\r\n\t") or 0xD800 <= ord(c) <= 0xDFFF for c in x)
                 for x in [text, task, *history]):
            reason = "unsupported_binary_content"
        if reason:
            return Result("unsupported", None, self.model.model_id, review_reasons=[reason],
                          coverage={"complete": False}, runtime_versions=self.runtime_versions())
        aliases = Aliases("\n".join([text, task, *history]))
        try:
            protected_history = [self._segment(h, task, "", aliases) for h in history]
            result = self._segment(text, task, "\n".join(history), aliases)
            protected_task = result if task == text else self._segment(task, task, "", aliases)
        except (ValueError, RuntimeError) as error:
            return Result("unsupported", None, self.model.model_id,
                          review_reasons=["inference_failed:" + type(error).__name__], coverage={"complete": False},
                          runtime_versions=self.runtime_versions())
        result.protected_history = [x.protected_text for x in protected_history]
        result.protected_task = protected_task.protected_text
        result.coverage["history_messages_scanned"] = len(history)
        result.coverage["task_scanned"] = True
        if history:
            result.review_reasons.append("cross_turn_inference_not_validated")
        if task == text:
            result.review_reasons.append("message_used_as_intended_use")
        parts = [*protected_history, protected_task]
        result.context_reports = [{"component": "history" if i < len(history) else "task",
            "index": i if i < len(history) else None, "edits": [vars(e).copy() for e in part.edits],
            "retained_sensitive": part.retained_sensitive, "pending_reviews": part.pending_reviews,
            "coverage": part.coverage} for i, part in enumerate(parts)]
        result.review_reasons = sorted(set(result.review_reasons + [r for part in parts for r in part.review_reasons]))
        return result
