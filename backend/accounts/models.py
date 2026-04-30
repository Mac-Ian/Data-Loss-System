"""
DLMS – Riba and Company Limited
accounts/models.py  –  Core data models

Tables covered:
  • CustomUser      – extends AbstractBaseUser, adds role + department
  • Role            – lookup table for RBAC roles
  • Department      – transport departments (Finance, Operations, Drivers …)
  • DataAsset       – files / records classified by sensitivity
  • AccessLog       – every read / write event on a DataAsset
  • ThreatAlert     – anomalous‑behaviour flags raised by the monitoring engine
  • AuditTrail      – immutable log of all system events (who did what, when)

Database: MySQL 8  (set ENGINE = 'django.db.backends.mysql' in settings.py)
"""

import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def generate_uuid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
#  Role & Department (lookup tables)
# ─────────────────────────────────────────────

class Role(models.Model):
    """
    RBAC roles.  Pre-seeded via a data migration:
        Admin | Finance | Operations | Driver | Guest
    """
    ROLE_CHOICES = [
        ("ADMIN",       "Admin"),
        ("FINANCE",     "Finance"),
        ("OPERATIONS",  "Operations"),
        ("DRIVER",      "Driver"),
        ("GUEST",       "Guest"),
    ]

    id          = models.AutoField(primary_key=True)
    name        = models.CharField(max_length=50, unique=True, choices=ROLE_CHOICES)
    description = models.TextField(blank=True)
    permissions = models.JSONField(
        default=dict,
        help_text="JSON map of resource → [read, write, delete] flags"
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dlms_roles"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Department(models.Model):
    """Organisational unit inside Riba & Company."""
    id         = models.AutoField(primary_key=True)
    name       = models.CharField(max_length=120, unique=True)
    code       = models.CharField(max_length=10, unique=True)   # e.g. "FIN", "OPS"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dlms_departments"

    def __str__(self):
        return self.name


# ─────────────────────────────────────────────
#  Custom User
# ─────────────────────────────────────────────

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user  = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """
    Primary user entity.

    Auth is email-based.  Each user is assigned exactly one Role
    and belongs to one Department.  The `employee_id` mirrors the
    HR system for audit reconciliation.
    """
    STATUS_CHOICES = [
        ("ACTIVE",    "Active"),
        ("SUSPENDED", "Suspended"),
        ("INACTIVE",  "Inactive"),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email       = models.EmailField(unique=True)
    first_name  = models.CharField(max_length=80)
    last_name   = models.CharField(max_length=80)
    employee_id = models.CharField(max_length=20, unique=True, blank=True, null=True)

    role        = models.ForeignKey(
        Role, on_delete=models.PROTECT,
        related_name="users", null=True, blank=True
    )
    department  = models.ForeignKey(
        Department, on_delete=models.SET_NULL,
        related_name="users", null=True, blank=True
    )

    status      = models.CharField(max_length=12, choices=STATUS_CHOICES, default="ACTIVE")
    phone       = models.CharField(max_length=20, blank=True)
    last_login_ip   = models.GenericIPAddressField(null=True, blank=True)
    failed_logins   = models.PositiveSmallIntegerField(default=0)
    is_mfa_enabled  = models.BooleanField(default=False)

    is_staff    = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at  = models.DateTimeField(auto_now=True)

    objects     = CustomUserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "dlms_users"
        indexes  = [
            models.Index(fields=["role"]),
            models.Index(fields=["department"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} <{self.email}>"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


# ─────────────────────────────────────────────
#  Data Asset (file / record)
# ─────────────────────────────────────────────

class DataAsset(models.Model):
    """
    Represents any file, document, or data record managed by DLMS.

    Classification tiers:
        L1 – General       (public or low sensitivity)
        L2 – Internal      (internal use only)
        L3 – Confidential  (restricted, encrypted at rest)
    """
    CLASSIFICATION_CHOICES = [
        ("L1", "General"),
        ("L2", "Internal"),
        ("L3", "Confidential"),
    ]
    STATUS_CHOICES = [
        ("ACTIVE",    "Active"),
        ("ARCHIVED",  "Archived"),
        ("QUARANTINE","Quarantined"),
        ("DELETED",   "Deleted"),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name            = models.CharField(max_length=255)
    description     = models.TextField(blank=True)
    file_path       = models.CharField(max_length=512, blank=True)   # server-side path / S3 key
    file_size_bytes = models.BigIntegerField(default=0)
    mime_type       = models.CharField(max_length=120, blank=True)
    checksum_sha256 = models.CharField(max_length=64, blank=True)

    classification  = models.CharField(
        max_length=2, choices=CLASSIFICATION_CHOICES, default="L1"
    )
    status          = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default="ACTIVE"
    )
    tags            = models.JSONField(default=list, blank=True)

    owner           = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="owned_assets"
    )
    department      = models.ForeignKey(
        Department, on_delete=models.SET_NULL,
        null=True, related_name="assets"
    )

    is_encrypted    = models.BooleanField(default=False)
    retention_days  = models.PositiveIntegerField(default=365)
    expires_at      = models.DateTimeField(null=True, blank=True)

    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_data_assets"
        indexes  = [
            models.Index(fields=["classification"]),
            models.Index(fields=["status"]),
            models.Index(fields=["owner"]),
            models.Index(fields=["department"]),
        ]

    def __str__(self):
        return f"[{self.classification}] {self.name}"


# ─────────────────────────────────────────────
#  Access Log
# ─────────────────────────────────────────────

class AccessLog(models.Model):
    """
    Records every interaction a user has with a DataAsset.
    Written by the monitoring middleware; never mutated after creation.
    """
    ACTION_CHOICES = [
        ("VIEW",     "Viewed"),
        ("DOWNLOAD", "Downloaded"),
        ("UPLOAD",   "Uploaded"),
        ("EDIT",     "Edited"),
        ("DELETE",   "Deleted"),
        ("SHARE",    "Shared"),
        ("PRINT",    "Printed"),
        ("EXPORT",   "Exported"),
    ]

    id           = models.BigAutoField(primary_key=True)
    user         = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="access_logs"
    )
    data_asset   = models.ForeignKey(
        DataAsset, on_delete=models.SET_NULL,
        null=True, related_name="access_logs"
    )
    action       = models.CharField(max_length=12, choices=ACTION_CHOICES)

    # Network context
    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    user_agent   = models.TextField(blank=True)
    location     = models.CharField(max_length=120, blank=True)  # GeoIP city / country

    # Risk scoring (populated by the threat engine)
    risk_score   = models.FloatField(default=0.0)    # 0.0 – 10.0
    is_anomalous = models.BooleanField(default=False)

    session_id   = models.CharField(max_length=64, blank=True)
    timestamp    = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "dlms_access_logs"
        indexes  = [
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["data_asset", "timestamp"]),
            models.Index(fields=["is_anomalous"]),
        ]

    def __str__(self):
        return f"{self.user} → {self.action} → {self.data_asset} @ {self.timestamp:%Y-%m-%d %H:%M}"


# ─────────────────────────────────────────────
#  Threat Alert
# ─────────────────────────────────────────────

class ThreatAlert(models.Model):
    """
    Raised by the Real-Time Monitoring Engine when anomalous behaviour
    is detected (e.g. bulk download, off-hours access, impossible travel).
    """
    SEVERITY_CHOICES = [
        ("LOW",      "Low"),
        ("MEDIUM",   "Medium"),
        ("HIGH",     "High"),
        ("CRITICAL", "Critical"),
    ]
    STATUS_CHOICES = [
        ("OPEN",        "Open"),
        ("INVESTIGATING","Investigating"),
        ("RESOLVED",    "Resolved"),
        ("FALSE_POSITIVE","False Positive"),
    ]
    ALERT_TYPE_CHOICES = [
        ("BULK_DOWNLOAD",     "Bulk Download"),
        ("OFF_HOURS_ACCESS",  "Off-Hours Access"),
        ("IMPOSSIBLE_TRAVEL", "Impossible Travel"),
        ("PRIVILEGE_ESCALATION","Privilege Escalation"),
        ("REPEATED_FAILURE",  "Repeated Auth Failure"),
        ("DATA_EXFILTRATION", "Suspected Data Exfiltration"),
        ("CLASSIFICATION_BREACH","Classification Breach"),
        ("OTHER",             "Other"),
    ]

    id           = models.BigAutoField(primary_key=True)
    alert_code   = models.CharField(max_length=20, unique=True, default=generate_uuid)
    alert_type   = models.CharField(max_length=30, choices=ALERT_TYPE_CHOICES)
    severity     = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="MEDIUM")
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES,   default="OPEN")

    triggered_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="triggered_alerts"
    )
    related_asset = models.ForeignKey(
        DataAsset, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="alerts"
    )
    related_log  = models.ForeignKey(
        AccessLog, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="alerts"
    )

    title        = models.CharField(max_length=255)
    description  = models.TextField()
    raw_evidence = models.JSONField(default=dict)   # snapshot of event data

    risk_score   = models.FloatField(default=0.0)
    auto_blocked = models.BooleanField(default=False)

    assigned_to  = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="assigned_alerts"
    )
    resolved_at  = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    created_at   = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dlms_threat_alerts"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["severity", "status"]),
            models.Index(fields=["triggered_by"]),
            models.Index(fields=["alert_type"]),
        ]

    def __str__(self):
        return f"[{self.severity}] {self.alert_type} – {self.title}"


# ─────────────────────────────────────────────
#  Audit Trail  (immutable system log)
# ─────────────────────────────────────────────

class AuditTrail(models.Model):
    """
    Append-only log of every system-level action.  Never updated or deleted.
    Satisfies ISO 27001 §A.12.4 and GDPR Article 30 record-keeping requirements.
    """
    EVENT_TYPES = [
        # Auth events
        ("AUTH_LOGIN",        "User Login"),
        ("AUTH_LOGOUT",       "User Logout"),
        ("AUTH_FAIL",         "Failed Login"),
        ("AUTH_PASSWORD",     "Password Change"),
        ("AUTH_MFA",          "MFA Event"),
        # User management
        ("USER_CREATE",       "User Created"),
        ("USER_UPDATE",       "User Updated"),
        ("USER_SUSPEND",      "User Suspended"),
        ("USER_DELETE",       "User Deleted"),
        ("ROLE_ASSIGN",       "Role Assigned"),
        # Data events
        ("DATA_CREATE",       "Asset Created"),
        ("DATA_READ",         "Asset Accessed"),
        ("DATA_UPDATE",       "Asset Updated"),
        ("DATA_DELETE",       "Asset Deleted"),
        ("DATA_CLASSIFY",     "Asset Reclassified"),
        # Alert events
        ("ALERT_RAISED",      "Alert Raised"),
        ("ALERT_RESOLVED",    "Alert Resolved"),
        ("ALERT_ESCALATED",   "Alert Escalated"),
        # System events
        ("SYS_CONFIG",        "Config Changed"),
        ("SYS_EXPORT",        "Report Exported"),
        ("SYS_BACKUP",        "Backup Triggered"),
    ]

    id           = models.BigAutoField(primary_key=True)
    event_type   = models.CharField(max_length=30, choices=EVENT_TYPES, db_index=True)

    actor        = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, related_name="audit_events"
    )
    target_user  = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="audit_target_events"
    )
    data_asset   = models.ForeignKey(
        DataAsset, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="audit_events"
    )
    alert        = models.ForeignKey(
        ThreatAlert, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="audit_events"
    )

    description  = models.TextField()
    metadata     = models.JSONField(default=dict)   # before/after snapshots, diff

    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    user_agent   = models.TextField(blank=True)
    session_id   = models.CharField(max_length=64, blank=True)

    timestamp    = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "dlms_audit_trail"
        ordering = ["-timestamp"]
        indexes  = [
            models.Index(fields=["actor", "timestamp"]),
            models.Index(fields=["event_type", "timestamp"]),
        ]

    def __str__(self):
        return f"{self.event_type} | {self.actor} | {self.timestamp:%Y-%m-%d %H:%M:%S}"
