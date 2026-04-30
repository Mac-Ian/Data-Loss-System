"""
data_classification/management/commands/seed_rules.py
DLMS – Riba & Company Limited

Run with:  python manage.py seed_rules

Seeds the default classification rules appropriate for a
transport & logistics company.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from data_classification.models import ClassificationRule


RULES = [
    # ── CONFIDENTIAL (L3) ─────────────────────────────────────────────
    {
        "name": "Financial Records",
        "description": "Payroll, salaries, bank details, and tax records.",
        "level": "L3", "priority": 1,
        "keywords": [
            "salary", "payroll", "bank account", "account number",
            "tax pin", "tin", "paye", "nssf", "pension",
            "profit margin", "net income", "balance sheet",
        ],
        "regex_pattern": r"\b\d{4}[\s\-]?\d{6}[\s\-]?\d{1}\b",  # Uganda bank account pattern
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": True,
        "notify_admin": True,
    },
    {
        "name": "Personal Identification",
        "description": "National IDs, passports, and biometric data.",
        "level": "L3", "priority": 2,
        "keywords": [
            "national id", "nid", "passport", "birth certificate",
            "drivers license", "driving permit", "date of birth", "dob",
            "biometric", "fingerprint",
        ],
        "regex_pattern": r"\bCM\d{14}\b",  # Uganda NIN pattern
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": True,
        "notify_admin": True,
    },
    {
        "name": "Legal & Compliance",
        "description": "Legal notices, court orders, compliance reports.",
        "level": "L3", "priority": 3,
        "keywords": [
            "confidential", "strictly confidential", "legal notice",
            "court order", "subpoena", "litigation", "settlement",
            "board minutes", "shareholder", "acquisition", "merger",
        ],
        "regex_pattern": "",
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": False,
        "notify_admin": True,
    },
    # ── INTERNAL (L2) ─────────────────────────────────────────────────
    {
        "name": "HR & Personnel",
        "description": "Staff records, appraisals, and HR communications.",
        "level": "L2", "priority": 10,
        "keywords": [
            "internal", "staff only", "personnel", "employee record",
            "appraisal", "performance review", "disciplinary", "leave",
            "termination", "resignation", "contract",
        ],
        "regex_pattern": "",
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": False,
        "notify_admin": False,
    },
    {
        "name": "Operations & Logistics",
        "description": "Fleet schedules, route plans, client manifests.",
        "level": "L2", "priority": 11,
        "keywords": [
            "route plan", "fleet schedule", "manifest", "cargo",
            "client list", "vendor", "supplier", "tender", "bid",
            "fuel consumption", "maintenance log", "trip report",
            "waybill", "lading", "consignment",
        ],
        "regex_pattern": "",
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": False,
        "notify_admin": False,
    },
    {
        "name": "Financial Planning",
        "description": "Budgets, forecasts, and quarterly reports.",
        "level": "L2", "priority": 12,
        "keywords": [
            "budget", "forecast", "quarterly", "revenue", "expenditure",
            "cash flow", "invoice", "purchase order", "not for distribution",
        ],
        "regex_pattern": "",
        "file_extensions": ["xlsx", "xls"],
        "mime_types": [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ],
        "auto_encrypt": False,
        "notify_admin": False,
    },
    # ── GENERAL (L1) — catch-all ──────────────────────────────────────
    {
        "name": "General Documents",
        "description": "Catch-all for public or low-sensitivity content.",
        "level": "L1", "priority": 99,
        "keywords": [],
        "regex_pattern": "",
        "file_extensions": [],
        "mime_types": [],
        "auto_encrypt": False,
        "notify_admin": False,
    },
]


class Command(BaseCommand):
    help = "Seeds default data classification rules for Riba & Company DLMS."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Seeding Classification Rules ===\n"))

        for r in RULES:
            obj, created = ClassificationRule.objects.update_or_create(
                name=r["name"],
                defaults={
                    "description":      r["description"],
                    "level":            r["level"],
                    "priority":         r["priority"],
                    "keywords":         r["keywords"],
                    "regex_pattern":    r["regex_pattern"],
                    "file_extensions":  r["file_extensions"],
                    "mime_types":       r["mime_types"],
                    "auto_encrypt":     r["auto_encrypt"],
                    "notify_admin":     r["notify_admin"],
                    "is_active":        True,
                },
            )
            tag = "Created" if created else "Updated"
            self.stdout.write(
                f"  [{obj.level}] {tag}: {obj.name} (priority {obj.priority})"
            )

        self.stdout.write(self.style.SUCCESS(
            f"\n✅  {len(RULES)} classification rules seeded.\n"
        ))
