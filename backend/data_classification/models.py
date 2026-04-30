"""
data_classification/models.py
DLMS – Riba & Company Limited

Models:
  • ClassificationRule  – admin-defined keyword/regex rules that drive auto-classification
  • ClassificationScan  – audit record of every auto-scan run against an asset
"""

import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField   # works with MySQL via JSON fallback
from accounts.models import CustomUser, DataAsset


class ClassificationRule(models.Model):
    """
    A single rule used by the classification engine.

    Rules are evaluated in priority order (lower number = checked first).
    The first rule whose keyword OR pattern matches the asset content
    determines the classification level.

    Example rules seeded by seed_data:
      Priority 1  CONFIDENTIAL  keywords: ['salary', 'payroll', 'bank account', 'national id']
      Priority 2  INTERNAL      keywords: ['internal', 'staff only', 'not for distribution']
      Priority 3  GENERAL       (catch-all — no keywords required)
    """

    LEVEL_CHOICES = [
        ("L1", "General"),
        ("L2", "Internal"),
        ("L3", "Confidential"),
    ]

    id           = models.AutoField(primary_key=True)
    name         = models.CharField(max_length=120, unique=True)
    description  = models.TextField(blank=True)
    level        = models.CharField(max_length=2, choices=LEVEL_CHOICES)
    priority     = models.PositiveSmallIntegerField(
        default=10,
        help_text="Lower = evaluated first. Rules with same priority are OR-ed."
    )

    # Matching criteria (at least one must be non-empty for the rule to fire)
    keywords     = models.JSONField(
        default=list,
        help_text="Case-insensitive substrings to search in filename + content."
    )
    regex_pattern = models.CharField(
        max_length=512, blank=True,
        help_text="Python-compatible regex. Matched against full text content."
    )
    file_extensions = models.JSONField(
        default=list,
        help_text="e.g. ['xlsx','pdf'] — match by file extension alone."
    )
    mime_types   = models.JSONField(
        default=list,
        help_text="e.g. ['application/pdf'] — match by MIME type."
    )

    # Behaviour
    is_active    = models.BooleanField(default=True)
    auto_encrypt = models.BooleanField(
        default=False,
        help_text="If true, assets matched by this rule are flagged for encryption."
    )
    notify_admin = models.BooleanField(
        default=False,
        help_text="If true, a ThreatAlert is raised when this rule fires."
    )

    created_by   = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, related_name="classification_rules"
    )
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_classification_rules"
        ordering = ["priority", "name"]

    def __str__(self):
        return f"[{self.level}] {self.name} (priority {self.priority})"


class ClassificationScan(models.Model):
    """
    Records every time the engine scans a DataAsset — automatic or manual.
    Stores the rule that fired (if any) and the before/after classification.
    """

    TRIGGER_CHOICES = [
        ("UPLOAD",    "On Upload"),
        ("MANUAL",    "Manual Override"),
        ("SCHEDULED", "Scheduled Scan"),
        ("POLICY",    "Policy Change"),
    ]

    id             = models.BigAutoField(primary_key=True)
    asset          = models.ForeignKey(
        DataAsset, on_delete=models.CASCADE, related_name="scans"
    )
    triggered_by   = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, related_name="scans"
    )
    trigger        = models.CharField(max_length=12, choices=TRIGGER_CHOICES, default="UPLOAD")
    rule_fired     = models.ForeignKey(
        ClassificationRule, on_delete=models.SET_NULL, null=True, blank=True
    )

    level_before   = models.CharField(max_length=2, blank=True)
    level_after    = models.CharField(max_length=2)
    confidence     = models.FloatField(
        default=1.0,
        help_text="0.0–1.0 confidence that the classification is correct."
    )
    matched_terms  = models.JSONField(
        default=list,
        help_text="Keywords / patterns that caused this classification."
    )
    scan_notes     = models.TextField(blank=True)
    scanned_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dlms_classification_scans"
        ordering = ["-scanned_at"]

    def __str__(self):
        return f"Scan({self.asset.name}) {self.level_before}→{self.level_after}"
