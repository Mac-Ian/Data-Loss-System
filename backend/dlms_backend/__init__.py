# backend/dlms_backend/__init__.py
# Make Celery auto-discover tasks on Django startup
from .celery import app as celery_app  # noqa: F401

__all__ = ("celery_app",)
