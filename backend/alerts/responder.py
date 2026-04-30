"""
alerts/responder.py
DLMS – Riba & Company Limited

The Automated Response Engine.

Called immediately after any ThreatAlert is created (by detector.py
or manually). Evaluates all active AlertPolicies and fires the
configured action for each matching policy.

Public API
----------
run_response(alert)         → list[AlertNotification]
    Evaluate all policies against one alert and execute actions.

notify_by_email(alert, recipients, policy=None)  → AlertNotification
    Send an email notification for an alert.

suspend_user(alert)         → bool
    Suspend the user who triggered the alert.

quarantine_asset(alert)     → bool
    Set the related DataAsset status to QUARANTINE.

escalate_open_alerts()      → int
    Called by Celery beat — escalates alerts open too long.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger("dlms.responder")

# Severity ladder for comparison
SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

# Email template
EMAIL_TEMPLATE = """
DLMS SECURITY ALERT — Riba & Company Limited
{'=' * 60}

Alert ID    : {alert_code}
Type        : {alert_type}
Severity    : {severity}
Risk Score  : {risk_score:.1f} / 10.0
Status      : {status}
Detected At : {created_at}

Triggered By: {triggered_by}
Description : {description}

{'─' * 60}
Evidence Summary:
{evidence}

{'─' * 60}
Action Required:
Please log in to the DLMS dashboard and review this alert.
Dashboard URL: http://localhost:3000/alerts

This is an automated message from the DLMS monitoring engine.
Riba & Company Limited — Data Loss Management System v1.0
"""


def _lazy():
    from accounts.models import CustomUser, ThreatAlert, AuditTrail
    from .models import AlertPolicy, AlertNotification
    return CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification


def _format_evidence(raw_evidence: dict) -> str:
    """Format raw evidence dict as readable text for email body."""
    if not raw_evidence:
        return "  No additional evidence captured."
    lines = []
    for k, v in raw_evidence.items():
        key = k.replace("_", " ").title()
        lines.append(f"  {key}: {v}")
    return "\n".join(lines)


def _policy_matches(policy, alert) -> bool:
    """Return True if an AlertPolicy should fire for this ThreatAlert."""
    # Check alert type filter
    if policy.alert_types and alert.alert_type not in policy.alert_types:
        return False

    # Check minimum severity
    alert_rank  = SEVERITY_RANK.get(alert.severity, 0)
    policy_rank = SEVERITY_RANK.get(policy.min_severity, 0)
    if alert_rank < policy_rank:
        return False

    # Check minimum risk score
    if alert.risk_score < policy.min_risk_score:
        return False

    return True


# ─────────────────────────────────────────────
#  Email notification
# ─────────────────────────────────────────────

def notify_by_email(alert, recipients: list, policy=None) -> list:
    """
    Send an HTML-aware security alert email to each recipient.
    Returns list of AlertNotification objects created.
    """
    CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification = _lazy()

    notifications = []

    subject = f"[DLMS {alert.severity}] {alert.alert_type} — {alert.title}"
    body_text = EMAIL_TEMPLATE.format(
        alert_code  = alert.alert_code,
        alert_type  = alert.get_alert_type_display(),
        severity    = alert.severity,
        risk_score  = alert.risk_score,
        status      = alert.status,
        created_at  = alert.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        triggered_by = str(alert.triggered_by) if alert.triggered_by else "Unknown",
        description = alert.description,
        evidence    = _format_evidence(alert.raw_evidence),
        **{"=" * 60: ""},   # handled via format string above
    )

    # Simple HTML version
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #DEE4EC;border-radius:8px;">
      <div style="background:#0D2137;padding:16px 20px;border-radius:6px 6px 0 0;border-bottom:3px solid #C8960C;">
        <span style="color:#C8960C;font-weight:800;font-size:18px;">RIBA &amp; CO. DLMS</span>
        <span style="color:rgba(255,255,255,0.6);margin-left:12px;font-size:13px;">Security Alert</span>
      </div>
      <div style="padding:20px 0;">
        <div style="background:{'#FDE8E8' if alert.severity=='CRITICAL' else '#FEF9E7'};
             border-left:4px solid {'#C0392B' if alert.severity in ('CRITICAL','HIGH') else '#C8960C'};
             padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:16px;">
          <strong style="color:{'#C0392B' if alert.severity in ('CRITICAL','HIGH') else '#7D5A00'};">
            {alert.severity} — {alert.get_alert_type_display()}
          </strong><br/>
          <span style="font-size:13px;">{alert.title}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          {''.join(f'<tr><td style="padding:6px 0;color:#6B7C93;width:140px;">{k}</td><td style="padding:6px 0;font-weight:600;">{v}</td></tr>'
            for k, v in [
              ("Alert Code",    alert.alert_code),
              ("Risk Score",    f"{alert.risk_score:.1f} / 10.0"),
              ("Triggered By",  str(alert.triggered_by) if alert.triggered_by else "Unknown"),
              ("Detected At",   alert.created_at.strftime("%Y-%m-%d %H:%M:%S")),
            ])}
        </table>
        <div style="margin-top:16px;padding:12px 16px;background:#F8F9FB;border-radius:6px;font-size:13px;color:#5D6D7E;">
          {alert.description}
        </div>
        <div style="margin-top:20px;text-align:center;">
          <a href="http://localhost:3000/alerts" style="background:#0D2137;color:#C8960C;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">
            View in DLMS Dashboard →
          </a>
        </div>
      </div>
      <div style="border-top:1px solid #DEE4EC;padding-top:12px;font-size:11px;color:#6B7C93;text-align:center;">
        Riba &amp; Company Limited · DLMS v1.0 · Automated Security Alert
      </div>
    </div>
    """

    for recipient in recipients:
        notif = AlertNotification(
            alert    = alert,
            policy   = policy,
            channel  = "EMAIL",
            recipient= recipient,
            subject  = subject,
            body     = body_text,
            status   = "PENDING",
        )
        try:
            msg = EmailMultiAlternatives(
                subject      = subject,
                body         = body_text,
                from_email   = getattr(settings, "DEFAULT_FROM_EMAIL", "dlms@riba.ug"),
                to           = [recipient],
            )
            msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)
            notif.status = "SENT"
            logger.info("EMAIL_SENT | alert=%s | to=%s", alert.alert_code, recipient)
        except Exception as exc:
            notif.status    = "FAILED"
            notif.error_msg = str(exc)[:500]
            logger.error("EMAIL_FAILED | alert=%s | to=%s | err=%s", alert.alert_code, recipient, exc)
        finally:
            notif.save()
            notifications.append(notif)

    return notifications


# ─────────────────────────────────────────────
#  User suspension
# ─────────────────────────────────────────────

def suspend_user(alert) -> bool:
    """
    Suspend the user who triggered the alert.
    Writes an AuditTrail entry. Returns True on success.
    """
    CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification = _lazy()

    user = alert.triggered_by
    if not user:
        return False
    if user.status == "SUSPENDED":
        return False   # already suspended

    try:
        user.status = "SUSPENDED"
        user.save(update_fields=["status"])

        alert.auto_blocked = True
        alert.save(update_fields=["auto_blocked"])

        AuditTrail.objects.create(
            event_type  = "USER_SUSPEND",
            actor       = None,   # system action
            target_user = user,
            description = (
                f"[AUTO-RESPONSE] User {user.email} suspended due to alert "
                f"'{alert.alert_code}' ({alert.severity} {alert.alert_type})."
            ),
            metadata    = {"alert_code": alert.alert_code, "policy": "AUTO"},
        )

        logger.warning(
            "USER_SUSPENDED | user=%s | alert=%s | severity=%s",
            user.email, alert.alert_code, alert.severity
        )
        return True
    except Exception as exc:
        logger.error("suspend_user failed: %s", exc)
        return False


# ─────────────────────────────────────────────
#  Asset quarantine
# ─────────────────────────────────────────────

def quarantine_asset(alert) -> bool:
    """
    Set alert.related_asset status to QUARANTINE.
    Writes an AuditTrail entry. Returns True on success.
    """
    CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification = _lazy()

    asset = alert.related_asset
    if not asset:
        return False

    try:
        asset.status = "QUARANTINE"
        asset.save(update_fields=["status", "updated_at"])

        AuditTrail.objects.create(
            event_type  = "DATA_UPDATE",
            actor       = None,
            data_asset  = asset,
            description = (
                f"[AUTO-RESPONSE] Asset '{asset.name}' quarantined due to alert "
                f"'{alert.alert_code}'."
            ),
            metadata    = {"alert_code": alert.alert_code},
        )

        logger.warning(
            "ASSET_QUARANTINED | asset=%s | alert=%s",
            asset.name, alert.alert_code
        )
        return True
    except Exception as exc:
        logger.error("quarantine_asset failed: %s", exc)
        return False


# ─────────────────────────────────────────────
#  Master response runner
# ─────────────────────────────────────────────

def run_response(alert) -> list:
    """
    Evaluate all active AlertPolicies against the given ThreatAlert
    and execute the configured action for each matching policy.

    Returns list of AlertNotification objects created.
    """
    CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification = _lazy()

    policies = AlertPolicy.objects.filter(is_active=True)
    all_notifications = []

    for policy in policies:
        if not _policy_matches(policy, alert):
            continue

        logger.info(
            "POLICY_FIRED | policy=%s | action=%s | alert=%s",
            policy.name, policy.action, alert.alert_code
        )

        # ── NOTIFY_ADMIN
        if policy.action == "NOTIFY_ADMIN":
            admins = list(
                CustomUser.objects.filter(
                    role__name="ADMIN", status="ACTIVE", is_active=True
                ).values_list("email", flat=True)
            )
            if admins:
                notifs = notify_by_email(alert, admins, policy)
                all_notifications.extend(notifs)

        # ── NOTIFY_ROLES
        elif policy.action == "NOTIFY_ROLES" and policy.notify_roles:
            recipients = list(
                CustomUser.objects.filter(
                    role__name__in=policy.notify_roles,
                    status="ACTIVE", is_active=True
                ).values_list("email", flat=True)
            )
            if recipients:
                notifs = notify_by_email(alert, recipients, policy)
                all_notifications.extend(notifs)

        # ── SUSPEND_USER
        elif policy.action == "SUSPEND_USER":
            suspend_user(alert)

        # ── QUARANTINE_ASSET
        elif policy.action == "QUARANTINE_ASSET":
            quarantine_asset(alert)

        # ── LOG_ONLY
        elif policy.action == "LOG_ONLY":
            logger.info("LOG_ONLY policy fired for alert %s", alert.alert_code)

    # Write audit trail
    try:
        AuditTrail.objects.create(
            event_type  = "ALERT_RAISED",
            actor       = None,
            description = (
                f"Automated response executed for alert '{alert.alert_code}': "
                f"{len(all_notifications)} notification(s) sent, "
                f"{len([p for p in policies if _policy_matches(p, alert)])} policies matched."
            ),
            metadata    = {
                "alert_code":       alert.alert_code,
                "policies_matched": [
                    p.name for p in policies if _policy_matches(p, alert)
                ],
            },
        )
    except Exception as exc:
        logger.error("AuditTrail write failed in run_response: %s", exc)

    return all_notifications


# ─────────────────────────────────────────────
#  Celery task: escalate stale open alerts
# ─────────────────────────────────────────────

def escalate_open_alerts() -> int:
    """
    Find alerts that have been OPEN or INVESTIGATING for longer than
    their policy's escalate_after_minutes and bump their severity.

    Called by a Celery periodic task (every 15 minutes).
    Returns count of alerts escalated.
    """
    CustomUser, ThreatAlert, AuditTrail, AlertPolicy, AlertNotification = _lazy()

    escalated = 0
    policies  = AlertPolicy.objects.filter(is_active=True)

    for policy in policies:
        cutoff_age = timezone.now() - __import__("datetime").timedelta(
            minutes=policy.escalate_after_minutes
        )
        stale = ThreatAlert.objects.filter(
            status__in  = ["OPEN", "INVESTIGATING"],
            created_at__lte = cutoff_age,
        )
        if policy.alert_types:
            stale = stale.filter(alert_type__in=policy.alert_types)

        NEXT_SEV = {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "CRITICAL"}

        for alert in stale:
            new_sev = NEXT_SEV.get(alert.severity)
            if not new_sev:
                continue

            alert.severity = new_sev
            alert.save(update_fields=["severity", "updated_at"])

            AuditTrail.objects.create(
                event_type  = "ALERT_ESCALATED",
                actor       = None,
                description = (
                    f"Alert '{alert.alert_code}' escalated to {new_sev} "
                    f"(open > {policy.escalate_after_minutes} min)."
                ),
                metadata    = {"alert_code": alert.alert_code, "new_severity": new_sev},
            )
            escalated += 1

    logger.info("escalate_open_alerts | escalated=%d", escalated)
    return escalated
