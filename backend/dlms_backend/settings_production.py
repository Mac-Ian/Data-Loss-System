"""
dlms_backend/settings_production.py
DLMS – Riba & Company Limited

Production settings override.

Usage:
    export DJANGO_SETTINGS_MODULE=dlms_backend.settings_production
    python manage.py runserver   # or gunicorn

This file imports all base settings then overrides security-critical ones.
"""

from .settings import *   # noqa: F401, F403
import os

# ── Core ──────────────────────────────────────────────────────
DEBUG       = False
SECRET_KEY  = os.environ["DJANGO_SECRET_KEY"]   # must be set — no default
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "").split(",")

# ── HTTPS Security Headers ────────────────────────────────────
SECURE_SSL_REDIRECT            = True
SECURE_HSTS_SECONDS            = 31536000       # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD            = True
SECURE_PROXY_SSL_HEADER        = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE          = True
CSRF_COOKIE_SECURE             = True
X_FRAME_OPTIONS                = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF    = True
SECURE_BROWSER_XSS_FILTER      = True
REFERRER_POLICY                = "strict-origin-when-cross-origin"

# ── Database ──────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE":   "django.db.backends.mysql",
        "NAME":     os.environ["DB_NAME"],
        "USER":     os.environ["DB_USER"],
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST":     os.environ.get("DB_HOST", "127.0.0.1"),
        "PORT":     os.environ.get("DB_PORT", "3306"),
        "OPTIONS": {
            "charset":      "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            "connect_timeout": 10,
        },
        "CONN_MAX_AGE": 600,   # keep DB connections alive 10 min
    }
}

# ── Cache (Redis) ─────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND":  "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0"),
    }
}

# ── Email ─────────────────────────────────────────────────────
EMAIL_BACKEND      = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST         = os.environ.get("EMAIL_HOST",     "smtp.gmail.com")
EMAIL_PORT         = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_USE_TLS      = True
EMAIL_HOST_USER    = os.environ.get("EMAIL_HOST_USER",    "")
EMAIL_HOST_PASSWORD= os.environ.get("EMAIL_HOST_PASSWORD","")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "dlms@riba.ug")

# ── CORS (production: only allow your actual frontend domain) ─
CORS_ALLOWED_ORIGINS = [
    os.environ.get("FRONTEND_URL", "http://localhost:3000"),
]
CORS_ALLOW_CREDENTIALS = True

# ── Logging ───────────────────────────────────────────────────
LOGGING = {
    "version":            1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style":  "{",
        },
    },
    "handlers": {
        "console": {
            "class":     "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class":     "logging.handlers.RotatingFileHandler",
            "filename":  "/app/logs/dlms.log",
            "maxBytes":  10 * 1024 * 1024,   # 10 MB
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "loggers": {
        "dlms":       {"handlers":["console","file"],"level":"INFO","propagate":False},
        "django":     {"handlers":["console"],        "level":"WARNING"},
        "celery":     {"handlers":["console"],        "level":"INFO"},
    },
}

# ── JWT (shorter expiry in production) ───────────────────────
from datetime import timedelta
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":    timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME":   timedelta(days=1),
    "ROTATE_REFRESH_TOKENS":    True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ── Celery Beat Schedule ──────────────────────────────────────
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "periodic-threat-scan": {
        "task":     "monitoring.tasks.periodic_threat_scan",
        "schedule": 60.0,
    },
    "update-behavior-profiles": {
        "task":     "monitoring.tasks.update_behavior_profiles",
        "schedule": crontab(hour=2, minute=0),
    },
    "reclassify-assets": {
        "task":     "monitoring.tasks.reclassify_assets_scheduled",
        "schedule": crontab(hour=3, minute=0),
    },
    "cleanup-old-events": {
        "task":     "monitoring.tasks.cleanup_old_events",
        "schedule": crontab(day_of_week=0, hour=4, minute=0),
    },
    "escalate-open-alerts": {
        "task":     "alerts.tasks.escalate_alerts_task",
        "schedule": crontab(minute="*/15"),   # every 15 minutes
    },
}
