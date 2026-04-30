"""
accounts/management/commands/seed_data.py
DLMS – Riba & Company Limited

Run with:  python manage.py seed_data

Creates:
  • 5 roles (Admin, Finance, Operations, Driver, Guest)
  • 4 departments (Finance, Operations, Fleet, Management)
  • 1 superuser admin account  (admin@riba.ug / Admin@2024!)
  • 4 demo users, one per non-admin role
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import CustomUser, Department, Role


ROLES = [
    {
        "name": "ADMIN",
        "description": "Full system access — manages users, policies, and all data.",
        "permissions": {
            "users":   ["read", "write", "delete"],
            "assets":  ["read", "write", "delete"],
            "alerts":  ["read", "write", "delete"],
            "audit":   ["read", "export"],
            "reports": ["read", "export"],
            "settings":["read", "write"],
        },
    },
    {
        "name": "FINANCE",
        "description": "Access to financial data assets and audit reports.",
        "permissions": {
            "users":   ["read"],
            "assets":  ["read"],
            "alerts":  ["read"],
            "audit":   ["read", "export"],
            "reports": ["read", "export"],
        },
    },
    {
        "name": "OPERATIONS",
        "description": "Manages logistics data assets and monitors alerts.",
        "permissions": {
            "users":   ["read"],
            "assets":  ["read", "write"],
            "alerts":  ["read", "write"],
            "audit":   ["read"],
            "reports": ["read"],
        },
    },
    {
        "name": "DRIVER",
        "description": "Access to own trip records and assigned documents only.",
        "permissions": {
            "assets":  ["read"],
        },
    },
    {
        "name": "GUEST",
        "description": "Read-only access to general (L1) assets.",
        "permissions": {
            "assets":  ["read"],
        },
    },
]

DEPARTMENTS = [
    {"name": "Finance & Accounts",      "code": "FIN"},
    {"name": "Operations & Logistics",  "code": "OPS"},
    {"name": "Fleet Management",        "code": "FLT"},
    {"name": "Senior Management",       "code": "MGT"},
]

DEMO_USERS = [
    {
        "email":       "finance@riba.ug",
        "first_name":  "Patricia",
        "last_name":   "Nakato",
        "employee_id": "RCL-FIN-001",
        "role_name":   "FINANCE",
        "dept_code":   "FIN",
        "password":    "Finance@2024!",
    },
    {
        "email":       "operations@riba.ug",
        "first_name":  "Samuel",
        "last_name":   "Okello",
        "employee_id": "RCL-OPS-001",
        "role_name":   "OPERATIONS",
        "dept_code":   "OPS",
        "password":    "Ops@2024!",
    },
    {
        "email":       "driver01@riba.ug",
        "first_name":  "David",
        "last_name":   "Ssali",
        "employee_id": "RCL-DRV-001",
        "role_name":   "DRIVER",
        "dept_code":   "FLT",
        "password":    "Driver@2024!",
    },
    {
        "email":       "guest@riba.ug",
        "first_name":  "Guest",
        "last_name":   "User",
        "employee_id": "RCL-GST-001",
        "role_name":   "GUEST",
        "dept_code":   None,
        "password":    "Guest@2024!",
    },
]


class Command(BaseCommand):
    help = "Seeds the DLMS database with roles, departments, and demo users."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== DLMS Seed Data ===\n"))

        # ── Roles
        role_map = {}
        for r in ROLES:
            obj, created = Role.objects.update_or_create(
                name=r["name"],
                defaults={"description": r["description"], "permissions": r["permissions"]},
            )
            role_map[r["name"]] = obj
            status = "Created" if created else "Updated"
            self.stdout.write(f"  Role {status}: {obj.name}")

        # ── Departments
        dept_map = {}
        for d in DEPARTMENTS:
            obj, created = Department.objects.update_or_create(
                code=d["code"], defaults={"name": d["name"]}
            )
            dept_map[d["code"]] = obj
            status = "Created" if created else "Updated"
            self.stdout.write(f"  Department {status}: {obj.name}")

        # ── Admin superuser
        if not CustomUser.objects.filter(email="admin@riba.ug").exists():
            admin = CustomUser.objects.create_superuser(
                email      = "admin@riba.ug",
                password   = "Admin@2024!",
                first_name = "System",
                last_name  = "Admin",
            )
            admin.employee_id = "RCL-ADM-001"
            admin.role        = role_map["ADMIN"]
            admin.department  = dept_map["MGT"]
            admin.save()
            self.stdout.write(self.style.SUCCESS("  Superuser created: admin@riba.ug / Admin@2024!"))
        else:
            self.stdout.write("  Superuser already exists: admin@riba.ug")

        # ── Demo users
        for u in DEMO_USERS:
            if not CustomUser.objects.filter(email=u["email"]).exists():
                user = CustomUser.objects.create_user(
                    email       = u["email"],
                    password    = u["password"],
                    first_name  = u["first_name"],
                    last_name   = u["last_name"],
                    employee_id = u["employee_id"],
                    role        = role_map[u["role_name"]],
                    department  = dept_map.get(u["dept_code"]) if u["dept_code"] else None,
                )
                self.stdout.write(self.style.SUCCESS(
                    f"  Demo user created: {user.email} / {u['password']}"
                ))
            else:
                self.stdout.write(f"  Demo user exists: {u['email']}")

        self.stdout.write(self.style.SUCCESS("\n✅  Seed complete!\n"))
        self.stdout.write("  Login credentials:")
        self.stdout.write("    admin@riba.ug       /  Admin@2024!    (ADMIN)")
        self.stdout.write("    finance@riba.ug     /  Finance@2024!  (FINANCE)")
        self.stdout.write("    operations@riba.ug  /  Ops@2024!      (OPERATIONS)")
        self.stdout.write("    driver01@riba.ug    /  Driver@2024!   (DRIVER)")
        self.stdout.write("    guest@riba.ug       /  Guest@2024!    (GUEST)\n")
