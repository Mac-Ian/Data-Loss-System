"""
monitoring/management/commands/seed_monitoring.py
DLMS – Riba & Company Limited

Run with:  python manage.py seed_monitoring
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from monitoring.models import MonitoringRule

RULES = [
    {
        "name": "Bulk Download — Standard",
        "rule_type": "BULK_DOWNLOAD",
        "description": "Fires when a user downloads 10+ files within 5 minutes.",
        "severity": "HIGH",
        "threshold_count": 10,
        "threshold_window_minutes": 5,
        "threshold_value": 0,
        "auto_block": False,
        "notify_roles": ["ADMIN", "OPERATIONS"],
    },
    {
        "name": "Bulk Download — Critical",
        "rule_type": "BULK_DOWNLOAD",
        "description": "Auto-blocks user downloading 25+ files in 5 min.",
        "severity": "CRITICAL",
        "threshold_count": 25,
        "threshold_window_minutes": 5,
        "threshold_value": 0,
        "auto_block": True,
        "notify_roles": ["ADMIN"],
    },
    {
        "name": "Off-Hours Access — Confidential",
        "rule_type": "OFF_HOURS_ACCESS",
        "description": "Fires when L3 data is accessed outside business hours.",
        "severity": "HIGH",
        "threshold_count": 1,
        "threshold_window_minutes": 1,
        "threshold_value": 0,
        "auto_block": False,
        "notify_roles": ["ADMIN"],
    },
    {
        "name": "Impossible Travel — Any",
        "rule_type": "IMPOSSIBLE_TRAVEL",
        "description": "Fires when login IP implies physically impossible travel speed.",
        "severity": "HIGH",
        "threshold_count": 1,
        "threshold_window_minutes": 60,
        "threshold_value": 900,  # km/h
        "auto_block": True,
        "notify_roles": ["ADMIN"],
    },
    {
        "name": "Repeated Auth Failure — Lockout",
        "rule_type": "REPEATED_AUTH_FAIL",
        "description": "Fires after 5 failed logins in 10 minutes.",
        "severity": "HIGH",
        "threshold_count": 5,
        "threshold_window_minutes": 10,
        "threshold_value": 0,
        "auto_block": False,
        "notify_roles": ["ADMIN"],
    },
    {
        "name": "Large File Upload — 50 MB",
        "rule_type": "LARGE_UPLOAD",
        "description": "Flags uploads exceeding 50 MB as potential exfiltration.",
        "severity": "MEDIUM",
        "threshold_count": 1,
        "threshold_window_minutes": 1,
        "threshold_value": 50.0,  # MB
        "auto_block": False,
        "notify_roles": ["ADMIN", "OPERATIONS"],
    },
    {
        "name": "Privilege Escalation Attempt",
        "rule_type": "PRIVILEGE_ESCALATION",
        "description": "Fires when a Driver or Guest accesses Admin endpoints.",
        "severity": "CRITICAL",
        "threshold_count": 1,
        "threshold_window_minutes": 1,
        "threshold_value": 0,
        "auto_block": True,
        "notify_roles": ["ADMIN"],
    },
]


class Command(BaseCommand):
    help = "Seeds default monitoring rules for the DLMS threat detection engine."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Seeding Monitoring Rules ===\n"))

        for r in RULES:
            obj, created = MonitoringRule.objects.update_or_create(
                name=r["name"],
                defaults={k: v for k, v in r.items() if k != "name"},
            )
            tag = "Created" if created else "Updated"
            self.stdout.write(
                f"  [{obj.severity}] {tag}: {obj.name}"
            )

        self.stdout.write(self.style.SUCCESS(
            f"\n✅  {len(RULES)} monitoring rules seeded.\n"
        ))
