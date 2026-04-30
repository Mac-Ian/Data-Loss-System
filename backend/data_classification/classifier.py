"""
data_classification/classifier.py
DLMS – Riba & Company Limited

The Classification Engine.

Public API
----------
classify_asset(asset, triggered_by=None, trigger="UPLOAD") -> ClassificationScan
    Runs all active ClassificationRules against a DataAsset and persists
    a ClassificationScan record.  Returns the scan object.

classify_text(text, filename="", mime_type="") -> dict
    Stateless helper — returns classification result without DB writes.
    Useful for real-time preview before an asset is saved.

reclassify_all(triggered_by=None) -> list[ClassificationScan]
    Batch re-scans every active DataAsset. Called by a Celery beat task.

Design
------
Rule evaluation order: ascending priority number.
Level precedence:  L3 (Confidential) > L2 (Internal) > L1 (General).
The engine picks the highest-severity match across all matching rules.
"""

import hashlib
import logging
import re
from pathlib import Path

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("dlms.classifier")

# Lazy imports to avoid Django setup order issues
def _get_models():
    from accounts.models import DataAsset
    from .models import ClassificationRule, ClassificationScan
    return DataAsset, ClassificationRule, ClassificationScan


# ── Level ordering (higher index = more sensitive)
LEVEL_ORDER = {"L1": 1, "L2": 2, "L3": 3}
LEVEL_LABELS = {"L1": "General", "L2": "Internal", "L3": "Confidential"}


# ─────────────────────────────────────────────
#  Built-in keyword dictionary (fallback if DB has no rules)
# ─────────────────────────────────────────────

BUILTIN_RULES = [
    {
        "level": "L3",
        "priority": 1,
        "keywords": [
            "salary", "payroll", "bank account", "account number",
            "national id", "nid", "passport", "tax pin", "tin number",
            "confidential", "top secret", "restricted", "do not distribute",
            "credit card", "cvv", "pin number", "social security",
            "medical record", "patient data", "hiv", "diagnosis",
            "board minutes", "acquisition", "merger", "legal notice",
        ],
        "regex": r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b",  # card-like numbers
    },
    {
        "level": "L2",
        "priority": 2,
        "keywords": [
            "internal", "staff only", "not for distribution", "internal use",
            "private", "sensitive", "personnel", "hr ", "human resources",
            "budget", "forecast", "quarterly", "revenue", "profit",
            "client list", "vendor", "contract", "tender", "bid",
            "route plan", "fleet schedule", "manifest",
        ],
        "regex": r"",
    },
]


# ─────────────────────────────────────────────
#  Core engine
# ─────────────────────────────────────────────

def _extract_text_from_asset(asset) -> str:
    """
    Attempt to extract searchable text from the asset.

    Strategy:
      1. Use asset.description + asset.name (always available)
      2. If file_path points to a real file, read a sample (first 64 KB)
         for text files; skip binary files silently.

    In production you would plug in Apache Tika or pdfminer here.
    """
    text_parts = [asset.name, asset.description]

    if asset.file_path:
        try:
            p = Path(asset.file_path)
            if p.exists() and p.stat().st_size < 10 * 1024 * 1024:  # <10 MB
                raw = p.read_bytes()[:65536]
                # Try UTF-8 first, fall back to latin-1
                try:
                    text_parts.append(raw.decode("utf-8"))
                except UnicodeDecodeError:
                    try:
                        text_parts.append(raw.decode("latin-1"))
                    except Exception:
                        pass
        except Exception as exc:
            logger.debug("Could not read file %s: %s", asset.file_path, exc)

    return " ".join(text_parts).lower()


def _match_rule_db(rule, text: str, filename: str, mime_type: str):
    """
    Test a single DB-backed ClassificationRule against content.

    Returns (matched: bool, matched_terms: list[str], confidence: float)
    """
    matched_terms = []

    # Extension check
    if rule.file_extensions:
        ext = Path(filename).suffix.lstrip(".").lower()
        if ext in [e.lower() for e in rule.file_extensions]:
            matched_terms.append(f"extension:.{ext}")

    # MIME check
    if rule.mime_types and mime_type:
        if mime_type.lower() in [m.lower() for m in rule.mime_types]:
            matched_terms.append(f"mime:{mime_type}")

    # Keyword check
    for kw in rule.keywords:
        if kw.lower() in text:
            matched_terms.append(f"keyword:{kw}")

    # Regex check
    if rule.regex_pattern:
        try:
            if re.search(rule.regex_pattern, text, re.IGNORECASE):
                matched_terms.append(f"regex:{rule.regex_pattern[:40]}")
        except re.error as exc:
            logger.warning("Invalid regex in rule %s: %s", rule.name, exc)

    if not matched_terms:
        return False, [], 0.0

    # Confidence: more matched terms = higher confidence, capped at 0.99
    confidence = min(0.5 + (len(matched_terms) * 0.15), 0.99)
    return True, matched_terms, confidence


def _match_builtin(text: str) -> dict | None:
    """Check built-in rules when no DB rules exist."""
    for rule in BUILTIN_RULES:
        found = []
        for kw in rule["keywords"]:
            if kw in text:
                found.append(f"keyword:{kw}")
        if rule.get("regex"):
            try:
                if re.search(rule["regex"], text, re.IGNORECASE):
                    found.append("regex:pattern")
            except re.error:
                pass
        if found:
            return {"level": rule["level"], "matched_terms": found, "confidence": 0.75}
    return None


# ─────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────

def classify_text(text: str, filename: str = "", mime_type: str = "") -> dict:
    """
    Stateless classification — no DB writes.

    Returns:
        {
          "level":         "L1" | "L2" | "L3",
          "label":         "General" | "Internal" | "Confidential",
          "confidence":    float,
          "matched_terms": list[str],
          "rule_name":     str | None,
        }
    """
    DataAsset, ClassificationRule, ClassificationScan = _get_models()

    text_lower = text.lower()
    best_level = "L1"
    best_confidence = 1.0
    best_terms = []
    best_rule_name = None

    rules = ClassificationRule.objects.filter(is_active=True).order_by("priority")

    if rules.exists():
        for rule in rules:
            matched, terms, conf = _match_rule_db(rule, text_lower, filename, mime_type)
            if matched:
                if LEVEL_ORDER.get(rule.level, 0) > LEVEL_ORDER.get(best_level, 0):
                    best_level      = rule.level
                    best_confidence = conf
                    best_terms      = terms
                    best_rule_name  = rule.name
                elif rule.level == best_level:
                    best_terms      = list(set(best_terms + terms))
                    best_confidence = max(best_confidence, conf)
                    best_rule_name  = best_rule_name or rule.name
    else:
        # Fall back to built-in rules
        result = _match_builtin(text_lower)
        if result:
            best_level      = result["level"]
            best_confidence = result["confidence"]
            best_terms      = result["matched_terms"]

    return {
        "level":         best_level,
        "label":         LEVEL_LABELS[best_level],
        "confidence":    best_confidence,
        "matched_terms": best_terms,
        "rule_name":     best_rule_name,
    }


@transaction.atomic
def classify_asset(asset, triggered_by=None, trigger: str = "UPLOAD"):
    """
    Full classification pipeline for a DataAsset.

    1. Extracts text from the asset.
    2. Runs classify_text().
    3. Updates asset.classification (and flags auto_encrypt if needed).
    4. Persists a ClassificationScan record.
    5. Writes AuditTrail entry.
    6. Raises a ThreatAlert if the matched rule requests it.

    Returns the ClassificationScan instance.
    """
    DataAsset, ClassificationRule, ClassificationScan = _get_models()

    text = _extract_text_from_asset(asset)
    result = classify_text(text, filename=asset.name, mime_type=asset.mime_type)

    level_before = asset.classification
    level_after  = result["level"]

    # Resolve matched rule object
    rule_obj = None
    if result["rule_name"]:
        rule_obj = ClassificationRule.objects.filter(name=result["rule_name"]).first()

    # Update asset
    asset.classification = level_after
    if rule_obj and rule_obj.auto_encrypt and level_after == "L3":
        asset.is_encrypted = True
    asset.save(update_fields=["classification", "is_encrypted", "updated_at"])

    # Persist scan record
    scan = ClassificationScan.objects.create(
        asset         = asset,
        triggered_by  = triggered_by,
        trigger       = trigger,
        rule_fired    = rule_obj,
        level_before  = level_before,
        level_after   = level_after,
        confidence    = result["confidence"],
        matched_terms = result["matched_terms"],
    )

    # Audit trail
    try:
        from accounts.models import AuditTrail
        AuditTrail.objects.create(
            event_type  = "DATA_CLASSIFY",
            actor       = triggered_by,
            data_asset  = asset,
            description = (
                f"Asset '{asset.name}' classified as {LEVEL_LABELS[level_after]}"
                f" (was {LEVEL_LABELS.get(level_before,'Unknown')}). "
                f"Confidence: {result['confidence']:.0%}."
            ),
            metadata    = result,
        )
    except Exception as exc:
        logger.error("AuditTrail write failed during classification: %s", exc)

    # Alert if rule demands it
    if rule_obj and rule_obj.notify_admin and level_after == "L3":
        try:
            from accounts.models import ThreatAlert
            ThreatAlert.objects.create(
                alert_type    = "CLASSIFICATION_BREACH",
                severity      = "HIGH",
                triggered_by  = triggered_by,
                related_asset = asset,
                title         = f"Confidential data detected: {asset.name}",
                description   = (
                    f"Asset '{asset.name}' was automatically classified as CONFIDENTIAL. "
                    f"Matched terms: {', '.join(result['matched_terms'][:5])}."
                ),
                raw_evidence  = result,
                risk_score    = 7.5,
            )
        except Exception as exc:
            logger.error("ThreatAlert creation failed: %s", exc)

    logger.info(
        "CLASSIFY | asset=%s | %s→%s | confidence=%.0f%% | terms=%s",
        asset.name, level_before, level_after,
        result["confidence"] * 100, result["matched_terms"][:3],
    )

    return scan


def reclassify_all(triggered_by=None) -> list:
    """
    Batch re-classify every active DataAsset.
    Called by a Celery periodic task (Phase 4).
    Returns list of ClassificationScan objects created.
    """
    DataAsset, _, _ = _get_models()
    assets = DataAsset.objects.filter(status="ACTIVE")
    scans  = []
    for asset in assets:
        try:
            scan = classify_asset(asset, triggered_by=triggered_by, trigger="SCHEDULED")
            scans.append(scan)
        except Exception as exc:
            logger.error("reclassify_all failed for asset %s: %s", asset.pk, exc)
    logger.info("reclassify_all complete: %d assets scanned", len(scans))
    return scans
