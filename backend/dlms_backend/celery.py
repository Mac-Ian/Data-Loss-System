"""
backend/dlms_backend/celery.py
DLMS – Riba & Company Limited

Celery application entry point.

Usage:
    celery -A dlms_backend worker -l info
    celery -A dlms_backend beat   -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
"""

import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dlms_backend.settings")

app = Celery("dlms_backend")

# Pull Celery config from Django settings (CELERY_* keys)
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all INSTALLED_APPS
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
