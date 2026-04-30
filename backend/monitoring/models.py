"""
monitoring/models.py
DLMS – Riba & Company Limited

Models:
  • MonitoringRule   – configurable thresholds for each detection algorithm
  • ThreatEvent      – raw detection hit before it becomes a full ThreatAlert
  • UserBehaviorProfile – rolling 7-day baseline per user (for anomaly scoring)
"""

import uuid
from django.db import models
from django.utils import timezone
from accounts.models import CustomUser, DataAsset


class MonitoringRule(models.Model):
    """
    Admin-configurable thresholds for the detection engine.
    Pre-seeded via seed_monitoring management command.
    """

    RULE_TYPES = [
        ("BULK_DOWNLOAD",      "Bulk Download"),
        ("OFF_HOURS_ACCESS",   "Off-Hours Access"),
        ("IMPOSSIBLE_TRAVEL",  "Impossible Travel"),
        ("REPEATED_AUTH_FAIL", "Repeated Auth Failure"),
        ("DATA_EXFILTRATION",  "Data Exfiltration"),
        ("PRIVILEGE_ESCALATION","Privilege Escalation"),
        ("LARGE_UPLOAD",       "Large File Upload"),
        ("SENSITIVE_PRINT",    "Sensitive Data Print/Export"),
    ]

    SEVERITY_CHOICES = [
        ("LOW",      "Low"),
        ("MEDIUM",   "Medium"),
        ("HIGH",     "High"),
        ("CRITICAL", "Critical"),
    ]

    id               = models.AutoField(primary_key=True)
    name             = models.CharField(max_length=120, unique=True)
    rule_type        = models.CharField(max_length=30, choices=RULE_TYPES)
    description      = models.TextField(blank=True)
    severity         = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="MEDIUM")
    is_active        = models.BooleanField(default=True)

    # Thresholds (interpretation depends on rule_type)
    threshold_count  = models.PositiveIntegerField(
        default=10,
        help_text="Number of events before rule fires (e.g. 10 downloads in window)."
    )
    threshold_window_minutes = models.PositiveIntegerField(
        default=5,
        help_text="Sliding window in minutes over which threshold_count is measured."
    )
    threshold_value  = models.FloatField(
        default=0.0,
        help_text="Generic numeric threshold (e.g. MB for large upload, km for travel)."
    )

    # Response
    auto_block       = models.BooleanField(
        default=False,
        help_text="If true, the triggering user is suspended automatically."
    )
    notify_roles     = models.JSONField(
        default=list,
        help_text="List of role names to notify via email on trigger."
    )

    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_monitoring_rules"
        ordering = ["severity", "name"]

    def __str__(self):
        return f"[{self.severity}] {self.name}"


class ThreatEvent(models.Model):
    """
    A single raw detection hit produced by the monitoring engine.
    Multiple ThreatEvents for the same user/pattern may be
    consolidated into one ThreatAlert by the responder.
    """

    DETECTOR_CHOICES = [
        ("BULK_DOWNLOAD",      "Bulk Download Detector"),
        ("OFF_HOURS",          "Off-Hours Access Detector"),
        ("IMPOSSIBLE_TRAVEL",  "Impossible Travel Detector"),
        ("REPEATED_FAIL",      "Repeated Auth Failure Detector"),
        ("EXFILTRATION",       "Exfiltration Detector"),
        ("LARGE_UPLOAD",       "Large Upload Detector"),
        ("RISK_SCORE",         "Risk Score Threshold"),
    ]

    id              = models.BigAutoField(primary_key=True)
    detector        = models.CharField(max_length=25, choices=DETECTOR_CHOICES)
    user            = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="threat_events"
    )
    related_asset   = models.ForeignKey(
        DataAsset, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="threat_events"
    )
    monitoring_rule = models.ForeignKey(
        MonitoringRule, on_delete=models.SET_NULL,
        null=True, blank=True
    )

    risk_score      = models.FloatField(default=0.0)
    evidence        = models.JSONField(default=dict)   # snapshot of triggering data
    ip_address      = models.GenericIPAddressField(null=True, blank=True)

    # Lifecycle
    escalated_to_alert = models.BooleanField(default=False)
    alert_id           = models.BigIntegerField(null=True, blank=True)  # FK avoided to prevent circular

    detected_at     = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "dlms_threat_events"
        ordering = ["-detected_at"]
        indexes  = [
            models.Index(fields=["user", "detector", "detected_at"]),
            models.Index(fields=["escalated_to_alert"]),
        ]

    def __str__(self):
        return f"{self.detector} | {self.user} | score={self.risk_score}"


class UserBehaviorProfile(models.Model):
    """
    Rolling 7-day behavioral baseline per user.
    Updated nightly by a Celery beat task.
    Used for anomaly scoring (deviation from normal).
    """

    user                     = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="behavior_profile"
    )
    avg_daily_accesses       = models.FloatField(default=0.0)
    avg_download_count       = models.FloatField(default=0.0)
    typical_login_hours      = models.JSONField(
        default=list,
        help_text="List of typical login hours (0-23) based on last 7 days."
    )
    typical_ips              = models.JSONField(
        default=list,
        help_text="List of known IP addresses used in last 30 days."
    )
    typical_locations        = models.JSONField(
        default=list,
        help_text="City/country strings from GeoIP for known locations."
    )
    last_known_ip            = models.GenericIPAddressField(null=True, blank=True)
    last_known_location      = models.CharField(max_length=120, blank=True)
    risk_baseline            = models.FloatField(
        default=0.0,
        help_text="Average risk score over the last 7 days."
    )
    updated_at               = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_user_behavior_profiles"

    def __str__(self):
        return f"Profile({self.user.email})"
