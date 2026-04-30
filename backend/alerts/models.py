"""
alerts/models.py
DLMS – Riba & Company Limited

Models:
  • AlertPolicy        – rules that define automated responses to ThreatAlerts
  • AlertNotification  – record of every email/SMS notification sent
  • AlertComment       – analyst notes on an alert investigation
"""

from django.db import models
from accounts.models import CustomUser, ThreatAlert


class AlertPolicy(models.Model):
    """
    Defines what automated action to take when a ThreatAlert
    of a given type and severity is raised.

    Evaluated by responder.py immediately after a ThreatAlert is created.
    """

    TRIGGER_SEVERITY = [
        ("LOW",      "Any severity ≥ Low"),
        ("MEDIUM",   "Any severity ≥ Medium"),
        ("HIGH",     "Any severity ≥ High"),
        ("CRITICAL", "Critical only"),
    ]

    ACTION_CHOICES = [
        ("NOTIFY_ADMIN",    "Notify Admin via Email"),
        ("NOTIFY_ROLES",    "Notify Specific Roles"),
        ("SUSPEND_USER",    "Suspend Triggering User"),
        ("QUARANTINE_ASSET","Quarantine Related Asset"),
        ("LOG_ONLY",        "Log Only (no action)"),
    ]

    id               = models.AutoField(primary_key=True)
    name             = models.CharField(max_length=120, unique=True)
    description      = models.TextField(blank=True)
    is_active        = models.BooleanField(default=True)

    # Trigger conditions
    alert_types      = models.JSONField(
        default=list,
        help_text="List of alert_type strings this policy applies to. Empty = all types."
    )
    min_severity     = models.CharField(
        max_length=10, choices=TRIGGER_SEVERITY, default="HIGH"
    )
    min_risk_score   = models.FloatField(
        default=7.0,
        help_text="Policy only fires if alert.risk_score >= this value."
    )

    # Actions
    action           = models.CharField(max_length=20, choices=ACTION_CHOICES)
    notify_roles     = models.JSONField(
        default=list,
        help_text="Role names to email when action=NOTIFY_ROLES."
    )
    escalate_after_minutes = models.PositiveIntegerField(
        default=60,
        help_text="If alert is still OPEN after N minutes, escalate severity."
    )

    created_by       = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="alert_policies"
    )
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_alert_policies"
        ordering = ["name"]
        verbose_name_plural = "Alert Policies"

    def __str__(self):
        return f"{self.name} [{self.action}]"


class AlertNotification(models.Model):
    """
    Record of every notification sent in response to a ThreatAlert.
    Used for audit and deduplication (avoid spamming the same alert).
    """

    CHANNEL_CHOICES = [
        ("EMAIL", "Email"),
        ("SMS",   "SMS"),
        ("SYSTEM","In-System Notification"),
    ]

    STATUS_CHOICES = [
        ("SENT",    "Sent"),
        ("FAILED",  "Failed"),
        ("PENDING", "Pending"),
    ]

    id           = models.BigAutoField(primary_key=True)
    alert        = models.ForeignKey(
        ThreatAlert, on_delete=models.CASCADE, related_name="notifications"
    )
    policy       = models.ForeignKey(
        AlertPolicy, on_delete=models.SET_NULL, null=True, related_name="notifications"
    )
    channel      = models.CharField(max_length=10, choices=CHANNEL_CHOICES, default="EMAIL")
    recipient    = models.CharField(max_length=255)   # email address or phone
    subject      = models.CharField(max_length=255, blank=True)
    body         = models.TextField(blank=True)
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default="PENDING")
    error_msg    = models.TextField(blank=True)
    sent_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dlms_alert_notifications"
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.channel} → {self.recipient} [{self.status}]"


class AlertComment(models.Model):
    """
    Analyst notes attached to an alert during investigation.
    Append-only — no updates allowed.
    """

    id         = models.BigAutoField(primary_key=True)
    alert      = models.ForeignKey(
        ThreatAlert, on_delete=models.CASCADE, related_name="comments"
    )
    author     = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True
    )
    body       = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dlms_alert_comments"
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on Alert#{self.alert_id} by {self.author}"
