"""
alerts/management/commands/seed_alerts.py
DLMS – Riba & Company Limited

Run with:  python manage.py seed_alerts
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from alerts.models import AlertPolicy

POLICIES = [
    {
        "name": "Notify Admin — Any High Alert",
        "description": "Email all admins whenever a HIGH or CRITICAL alert is raised.",
        "is_active": True,
        "alert_types": [],
        "min_severity": "HIGH",
        "min_risk_score": 6.0,
        "action": "NOTIFY_ADMIN",
        "notify_roles": [],
        "escalate_after_minutes": 60,
    },
    {
        "name": "Notify Operations — Bulk Download",
        "description": "Email Operations team on any bulk download alert.",
        "is_active": True,
        "alert_types": ["BULK_DOWNLOAD"],
        "min_severity": "MEDIUM",
        "min_risk_score": 5.0,
        "action": "NOTIFY_ROLES",
        "notify_roles": ["ADMIN", "OPERATIONS"],
        "escalate_after_minutes": 30,
    },
    {
        "name": "Auto-Suspend — Impossible Travel",
        "description": "Suspend any user flagged for impossible travel immediately.",
        "is_active": True,
        "alert_types": ["IMPOSSIBLE_TRAVEL"],
        "min_severity": "HIGH",
        "min_risk_score": 7.0,
        "action": "SUSPEND_USER",
        "notify_roles": [],
        "escalate_after_minutes": 15,
    },
    {
        "name": "Quarantine Asset — Classification Breach",
        "description": "Quarantine the related asset when a classification breach is detected.",
        "is_active": True,
        "alert_types": ["CLASSIFICATION_BREACH"],
        "min_severity": "HIGH",
        "min_risk_score": 6.5,
        "action": "QUARANTINE_ASSET",
        "notify_roles": [],
        "escalate_after_minutes": 60,
    },
    {
        "name": "Auto-Suspend — Data Exfiltration",
        "description": "Auto-suspend user and notify admin on suspected data exfiltration.",
        "is_active": True,
        "alert_types": ["DATA_EXFILTRATION"],
        "min_severity": "CRITICAL",
        "min_risk_score": 8.0,
        "action": "SUSPEND_USER",
        "notify_roles": [],
        "escalate_after_minutes": 10,
    },
    {
        "name": "Log Only — Low Severity Events",
        "description": "Log all low-severity alerts without any automated action.",
        "is_active": True,
        "alert_types": [],
        "min_severity": "LOW",
        "min_risk_score": 0.0,
        "action": "LOG_ONLY",
        "notify_roles": [],
        "escalate_after_minutes": 240,
    },
]


class Command(BaseCommand):
    help = "Seeds default alert response policies for the DLMS."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Seeding Alert Policies ===\n"))
        for p in POLICIES:
            obj, created = AlertPolicy.objects.update_or_create(
                name=p["name"],
                defaults={k: v for k, v in p.items() if k != "name"},
            )
            tag = "Created" if created else "Updated"
            self.stdout.write(f"  [{obj.action}] {tag}: {obj.name}")
        self.stdout.write(self.style.SUCCESS(f"\n✅  {len(POLICIES)} alert policies seeded.\n"))
