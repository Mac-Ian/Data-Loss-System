"""
alerts/tasks.py
DLMS – Riba & Company Limited

Celery tasks for the alerts module.
"""

import logging
from celery import shared_task

logger = logging.getLogger("dlms.alerts")


@shared_task
def escalate_alerts_task():
    """
    Runs every 15 minutes via Celery beat.
    Escalates alerts that have been OPEN too long per policy thresholds.
    """
    from .responder import escalate_open_alerts
    count = escalate_open_alerts()
    logger.info("escalate_alerts_task | escalated=%d", count)
    return {"escalated": count}


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_alert_notification_task(self, alert_id: int, recipient_emails: list):
    """
    Async email notification for a single alert.
    Called by run_response() when notification volume is high.
    """
    try:
        from accounts.models import ThreatAlert
        from .responder import notify_by_email
        alert = ThreatAlert.objects.get(pk=alert_id)
        notifs = notify_by_email(alert, recipient_emails)
        logger.info("send_alert_notification_task | alert=%s | sent=%d",
                    alert.alert_code, len(notifs))
        return {"sent": len(notifs)}
    except Exception as exc:
        logger.error("send_alert_notification_task failed: %s", exc)
        raise self.retry(exc=exc)
