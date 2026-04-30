"""
monitoring/tasks.py
DLMS – Riba & Company Limited

Celery tasks for the monitoring engine.

Tasks:
  evaluate_anomaly(log_pk)          – triggered by middleware for high-risk events
  periodic_threat_scan()            – runs every 60 seconds via Celery beat
  update_behavior_profiles()        – runs nightly, rebuilds user baselines
  reclassify_assets_scheduled()     – runs daily, re-scans all active assets
  cleanup_old_events()              – runs weekly, prunes old ThreatEvents

Celery Beat Schedule (add to settings.py):
  from celery.schedules import crontab

  CELERY_BEAT_SCHEDULE = {
      "periodic-threat-scan": {
          "task": "monitoring.tasks.periodic_threat_scan",
          "schedule": 60.0,  # every 60 seconds
      },
      "update-behavior-profiles": {
          "task": "monitoring.tasks.update_behavior_profiles",
          "schedule": crontab(hour=2, minute=0),  # nightly at 02:00
      },
      "reclassify-assets": {
          "task": "monitoring.tasks.reclassify_assets_scheduled",
          "schedule": crontab(hour=3, minute=0),  # daily at 03:00
      },
      "cleanup-old-events": {
          "task": "monitoring.tasks.cleanup_old_events",
          "schedule": crontab(day_of_week=0, hour=4, minute=0),  # weekly Sunday
      },
  }
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("dlms.tasks")


# ─────────────────────────────────────────────
#  Triggered by middleware (high-risk event)
# ─────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def evaluate_anomaly(self, log_pk: int):
    """
    Called by AccessLoggingMiddleware when risk_score >= 7.0.
    Runs the full detector suite against a single AccessLog entry.
    """
    try:
        from accounts.models import AccessLog
        from .detector import run_all_detectors

        log = AccessLog.objects.select_related(
            "user", "user__role", "data_asset"
        ).get(pk=log_pk)

        events = run_all_detectors(log)
        logger.info(
            "evaluate_anomaly | log=%d | events_created=%d",
            log_pk, len(events)
        )
        return {"log_pk": log_pk, "events_created": len(events)}

    except Exception as exc:
        logger.error("evaluate_anomaly failed for log %d: %s", log_pk, exc)
        raise self.retry(exc=exc)


# ─────────────────────────────────────────────
#  Periodic scan — every 60 seconds
# ─────────────────────────────────────────────

@shared_task
def periodic_threat_scan():
    """
    Scans all AccessLog entries from the last 2 minutes that have
    not yet been evaluated. Deduplicates by checking ThreatEvent timestamps.

    Designed to catch any events the middleware hook may have missed
    (e.g. during a Celery restart or high-load period).
    """
    from accounts.models import AccessLog
    from .detector import run_all_detectors
    from .models import ThreatEvent

    since   = timezone.now() - timedelta(minutes=2)
    logs    = AccessLog.objects.filter(
        timestamp__gte = since,
        is_anomalous   = True,
    ).select_related("user", "user__role", "data_asset").order_by("timestamp")

    total_events = 0
    for log in logs:
        # Skip if already processed (a ThreatEvent exists for this exact timestamp+user)
        already = ThreatEvent.objects.filter(
            user       = log.user,
            detected_at__gte = log.timestamp - timedelta(seconds=30),
            detected_at__lte = log.timestamp + timedelta(seconds=30),
        ).exists()
        if already:
            continue

        try:
            events = run_all_detectors(log)
            total_events += len(events)
        except Exception as exc:
            logger.error("periodic_threat_scan error for log %d: %s", log.pk, exc)

    logger.info("periodic_threat_scan | logs_checked=%d | events_created=%d", logs.count(), total_events)
    return {"events_created": total_events}


# ─────────────────────────────────────────────
#  Nightly: update user behaviour profiles
# ─────────────────────────────────────────────

@shared_task
def update_behavior_profiles():
    """
    Rebuilds UserBehaviorProfile for every active user.
    Looks at the last 7 days of AccessLog data.

    Computes:
      - avg_daily_accesses
      - avg_download_count
      - typical_login_hours  (hours seen >= 3 times)
      - typical_ips          (IPs seen >= 2 times)
      - risk_baseline        (average risk_score)
    """
    from accounts.models import AccessLog, CustomUser
    from .models import UserBehaviorProfile
    from django.db.models import Avg, Count

    since   = timezone.now() - timedelta(days=7)
    users   = CustomUser.objects.filter(is_active=True, status="ACTIVE")
    updated = 0

    for user in users:
        logs = AccessLog.objects.filter(user=user, timestamp__gte=since)

        if not logs.exists():
            continue

        # Daily average
        days_span = 7
        avg_daily = logs.count() / days_span

        # Download average
        dl_count = logs.filter(action="DOWNLOAD").count()
        avg_dl   = dl_count / days_span

        # Typical hours
        hour_counts = {}
        for log in logs.values("timestamp"):
            h = log["timestamp"].hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
        typical_hours = [h for h, c in hour_counts.items() if c >= 3]

        # Known IPs
        ip_counts = {}
        for log in logs.values("ip_address"):
            ip = log["ip_address"]
            if ip:
                ip_counts[ip] = ip_counts.get(ip, 0) + 1
        typical_ips = [ip for ip, c in ip_counts.items() if c >= 2]

        # Risk baseline
        avg_risk = logs.aggregate(avg=Avg("risk_score"))["avg"] or 0.0

        # Last known IP
        last_log = logs.order_by("-timestamp").first()

        profile, _ = UserBehaviorProfile.objects.get_or_create(user=user)
        profile.avg_daily_accesses  = round(avg_daily, 2)
        profile.avg_download_count  = round(avg_dl, 2)
        profile.typical_login_hours = typical_hours
        profile.typical_ips         = typical_ips
        profile.risk_baseline       = round(avg_risk, 2)
        if last_log:
            profile.last_known_ip = last_log.ip_address
        profile.save()
        updated += 1

    logger.info("update_behavior_profiles | users_updated=%d", updated)
    return {"users_updated": updated}


# ─────────────────────────────────────────────
#  Daily: reclassify all assets
# ─────────────────────────────────────────────

@shared_task
def reclassify_assets_scheduled():
    """
    Re-runs the classification engine against every active DataAsset.
    Catches assets whose classification may have drifted after rule updates.
    """
    from data_classification.classifier import reclassify_all

    scans = reclassify_all(triggered_by=None)
    logger.info("reclassify_assets_scheduled | assets_scanned=%d", len(scans))
    return {"assets_scanned": len(scans)}


# ─────────────────────────────────────────────
#  Weekly: prune old ThreatEvents
# ─────────────────────────────────────────────

@shared_task
def cleanup_old_events():
    """
    Deletes ThreatEvents older than 90 days that were never escalated
    to a ThreatAlert. Keeps the DB lean.
    """
    from .models import ThreatEvent

    cutoff  = timezone.now() - timedelta(days=90)
    deleted, _ = ThreatEvent.objects.filter(
        detected_at__lt      = cutoff,
        escalated_to_alert   = False,
    ).delete()

    logger.info("cleanup_old_events | deleted=%d ThreatEvents", deleted)
    return {"deleted": deleted}
