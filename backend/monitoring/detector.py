"""
monitoring/detector.py
DLMS – Riba & Company Limited

The Threat Detection Engine — five detection algorithms.

Public API
----------
detect_bulk_download(user, window_minutes, threshold)   → ThreatEvent | None
detect_off_hours_access(access_log)                     → ThreatEvent | None
detect_impossible_travel(user, new_ip, new_location)    → ThreatEvent | None
detect_repeated_auth_failure(user, window_minutes)       → ThreatEvent | None
detect_large_upload(access_log)                         → ThreatEvent | None
score_risk(access_log)                                  → float (0.0–10.0)
run_all_detectors(access_log)                           → list[ThreatEvent]

Each detector:
  1. Queries recent AccessLog / auth data
  2. Compares against MonitoringRule thresholds (or built-in defaults)
  3. If threshold breached → creates ThreatEvent + escalates to ThreatAlert
  4. Returns the ThreatEvent (or None if no breach)
"""

import logging
import math
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("dlms.detector")

# ── Business hours (UTC+3, Kampala)
BUSINESS_HOUR_START = 7   # 07:00
BUSINESS_HOUR_END   = 20  # 20:00
WEEKEND_DAYS        = {5, 6}  # Saturday=5, Sunday=6

# ── Default thresholds (used if no MonitoringRule row exists in DB)
DEFAULTS = {
    "BULK_DOWNLOAD":      {"count": 10,  "window_minutes": 5,  "severity": "HIGH"},
    "OFF_HOURS_ACCESS":   {"count": 1,   "window_minutes": 1,  "severity": "MEDIUM"},
    "IMPOSSIBLE_TRAVEL":  {"count": 1,   "window_minutes": 60, "severity": "HIGH"},
    "REPEATED_AUTH_FAIL": {"count": 5,   "window_minutes": 10, "severity": "HIGH"},
    "LARGE_UPLOAD":       {"count": 1,   "window_minutes": 1,  "severity": "MEDIUM",
                           "value_mb": 50},
}


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _lazy():
    """Lazy model imports to avoid circular dependencies."""
    from accounts.models import AccessLog, ThreatAlert, AuditTrail, CustomUser
    from .models import MonitoringRule, ThreatEvent, UserBehaviorProfile
    return AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, UserBehaviorProfile


def _get_rule(rule_type: str):
    """Fetch MonitoringRule from DB; return None to use defaults."""
    try:
        from .models import MonitoringRule
        return MonitoringRule.objects.filter(rule_type=rule_type, is_active=True).first()
    except Exception:
        return None


def _escalate_to_alert(event, alert_type: str, title: str, description: str,
                       severity: str, risk_score: float, auto_block: bool = False):
    """
    Convert a raw ThreatEvent into a full ThreatAlert.
    Optionally suspends the user if auto_block is True.
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, *_ = _lazy()
    try:
        alert = ThreatAlert.objects.create(
            alert_type    = alert_type,
            severity      = severity,
            triggered_by  = event.user,
            related_asset = event.related_asset,
            title         = title,
            description   = description,
            raw_evidence  = event.evidence,
            risk_score    = risk_score,
            auto_blocked  = auto_block,
        )

        event.escalated_to_alert = True
        event.alert_id           = alert.pk
        event.save(update_fields=["escalated_to_alert", "alert_id"])

        # Auto-block: suspend user
        if auto_block and event.user:
            event.user.status = "SUSPENDED"
            event.user.save(update_fields=["status"])
            logger.warning(
                "AUTO_BLOCK | user=%s | reason=%s | alert=%s",
                event.user.email, alert_type, alert.pk
            )

        # Audit trail
        AuditTrail.objects.create(
            event_type  = "ALERT_RAISED",
            actor       = None,   # system-generated
            description = f"[AUTO] {title}",
            metadata    = {"alert_id": alert.pk, "risk_score": risk_score},
        )

        logger.info(
            "ALERT_RAISED | type=%s | severity=%s | user=%s | score=%.1f",
            alert_type, severity, getattr(event.user, "email", "?"), risk_score
        )
        return alert
    except Exception as exc:
        logger.error("_escalate_to_alert failed: %s", exc, exc_info=True)
        return None


# ─────────────────────────────────────────────
#  1. Bulk Download Detector
# ─────────────────────────────────────────────

def detect_bulk_download(user, window_minutes: int = None, threshold: int = None):
    """
    Fires when a user downloads more than `threshold` files
    within `window_minutes`.

    Risk scoring:
        base 6.0 + 0.3 per download over threshold, capped at 10.0
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, _ = _lazy()

    rule = _get_rule("BULK_DOWNLOAD")
    win  = window_minutes or (rule.threshold_window_minutes if rule else DEFAULTS["BULK_DOWNLOAD"]["window_minutes"])
    thr  = threshold       or (rule.threshold_count         if rule else DEFAULTS["BULK_DOWNLOAD"]["count"])
    sev  = rule.severity if rule else DEFAULTS["BULK_DOWNLOAD"]["severity"]
    auto = rule.auto_block if rule else False

    since = timezone.now() - timedelta(minutes=win)
    count = AccessLog.objects.filter(
        user      = user,
        action    = "DOWNLOAD",
        timestamp__gte = since,
    ).count()

    if count < thr:
        return None

    excess     = count - thr
    risk_score = min(6.0 + excess * 0.3, 10.0)

    event = ThreatEvent.objects.create(
        detector    = "BULK_DOWNLOAD",
        user        = user,
        risk_score  = risk_score,
        evidence    = {
            "download_count": count,
            "threshold":      thr,
            "window_minutes": win,
            "period_start":   since.isoformat(),
        },
    )

    _escalate_to_alert(
        event,
        alert_type  = "BULK_DOWNLOAD",
        title       = f"Bulk download detected: {count} files in {win} min",
        description = (
            f"{user.full_name} downloaded {count} files in {win} minutes "
            f"(threshold: {thr}). This may indicate data exfiltration."
        ),
        severity   = sev,
        risk_score = risk_score,
        auto_block = auto,
    )

    logger.warning(
        "BULK_DOWNLOAD | user=%s | count=%d | window=%dmin | score=%.1f",
        user.email, count, win, risk_score
    )
    return event


# ─────────────────────────────────────────────
#  2. Off-Hours Access Detector
# ─────────────────────────────────────────────

def detect_off_hours_access(access_log):
    """
    Fires when an access event falls outside business hours
    (07:00–20:00 Kampala time, Mon–Fri) AND the accessed asset
    is classified L2 or L3.

    Weekends always trigger regardless of asset classification.
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, _ = _lazy()

    if not access_log.user:
        return None

    # Only flag sensitive data access
    classification = getattr(access_log.data_asset, "classification", "L1") if access_log.data_asset else "L1"
    ts   = access_log.timestamp
    hour = ts.hour
    dow  = ts.weekday()   # 0=Mon … 6=Sun

    off_hours = (hour < BUSINESS_HOUR_START or hour >= BUSINESS_HOUR_END)
    weekend   = dow in WEEKEND_DAYS

    if not (off_hours or weekend) and classification == "L1":
        return None
    if not (off_hours or weekend):
        return None   # business hours + non-sensitive = skip

    rule = _get_rule("OFF_HOURS_ACCESS")
    sev  = rule.severity if rule else DEFAULTS["OFF_HOURS_ACCESS"]["severity"]
    # Bump severity if Confidential data
    if classification == "L3":
        sev = "HIGH"

    risk_score = 4.0
    if weekend:
        risk_score += 1.5
    if classification == "L3":
        risk_score += 2.0
    if hour >= 22 or hour < 5:
        risk_score += 1.0
    risk_score = min(risk_score, 10.0)

    event = ThreatEvent.objects.create(
        detector      = "OFF_HOURS",
        user          = access_log.user,
        related_asset = access_log.data_asset,
        risk_score    = risk_score,
        ip_address    = access_log.ip_address,
        evidence      = {
            "access_time":     ts.isoformat(),
            "hour":            hour,
            "weekday":         dow,
            "is_weekend":      weekend,
            "classification":  classification,
            "asset_name":      getattr(access_log.data_asset, "name", "Unknown"),
            "action":          access_log.action,
        },
    )

    _escalate_to_alert(
        event,
        alert_type  = "OFF_HOURS_ACCESS",
        title       = f"Off-hours {'weekend ' if weekend else ''}access: {access_log.user.full_name}",
        description = (
            f"{access_log.user.full_name} accessed "
            f"{'[' + classification + '] ' if access_log.data_asset else ''}"
            f"data at {ts.strftime('%H:%M')} "
            f"({'weekend' if weekend else 'outside business hours'})."
        ),
        severity   = sev,
        risk_score = risk_score,
    )

    logger.warning(
        "OFF_HOURS | user=%s | hour=%d | weekend=%s | asset_level=%s | score=%.1f",
        access_log.user.email, hour, weekend, classification, risk_score
    )
    return event


# ─────────────────────────────────────────────
#  3. Impossible Travel Detector
# ─────────────────────────────────────────────

def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance between two coordinates in kilometres."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Approximate coordinates for common Ugandan cities + neighbours
CITY_COORDS = {
    "kampala":  (0.3476,  32.5825),
    "entebbe":  (0.0512,  32.4637),
    "jinja":    (0.4244,  33.2042),
    "gulu":     (2.7746,  32.2991),
    "mbarara":  (-0.6072, 30.6545),
    "nairobi":  (-1.2921, 36.8219),
    "dar es salaam": (-6.7924, 39.2083),
    "kigali":   (-1.9441, 30.0619),
    "bujumbura":(-3.3822, 29.3644),
}

MAX_SPEED_KMH = 900   # roughly commercial aircraft — anything faster = impossible


def detect_impossible_travel(user, new_ip: str, new_location: str = ""):
    """
    Fires when the geographic distance between the last known login IP
    and the current IP implies travel that exceeds commercial air speed.

    Falls back gracefully if GeoIP is not available — checks only
    against known IP list in UserBehaviorProfile.
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, UserBehaviorProfile = _lazy()

    try:
        profile = UserBehaviorProfile.objects.get(user=user)
    except UserBehaviorProfile.DoesNotExist:
        return None

    last_ip = profile.last_known_ip
    if not last_ip or last_ip == new_ip:
        # Update profile
        profile.last_known_ip       = new_ip
        profile.last_known_location = new_location
        profile.save(update_fields=["last_known_ip", "last_known_location", "updated_at"])
        return None

    # Try coordinate-based check
    last_loc = profile.last_known_location.lower()
    new_loc  = new_location.lower()

    distance_km  = None
    elapsed_mins = None
    is_impossible = False

    if last_loc and new_loc and last_loc != new_loc:
        last_coords = CITY_COORDS.get(last_loc)
        new_coords  = CITY_COORDS.get(new_loc)

        if last_coords and new_coords:
            distance_km = _haversine_km(*last_coords, *new_coords)

            # Find time of last login
            last_log = AccessLog.objects.filter(
                user=user, ip_address=last_ip
            ).order_by("-timestamp").first()

            if last_log:
                elapsed_mins = (timezone.now() - last_log.timestamp).total_seconds() / 60
                if elapsed_mins > 0:
                    speed_kmh = (distance_km / elapsed_mins) * 60
                    if speed_kmh > MAX_SPEED_KMH:
                        is_impossible = True

    # Fallback: new IP not in known-IPs list
    if not is_impossible:
        known_ips = profile.typical_ips or []
        if known_ips and new_ip not in known_ips:
            is_impossible = True   # unknown IP — flag as suspicious (lower severity)

    if not is_impossible:
        # Update profile with new IP
        profile.last_known_ip       = new_ip
        profile.last_known_location = new_location
        profile.save(update_fields=["last_known_ip", "last_known_location", "updated_at"])
        return None

    rule       = _get_rule("IMPOSSIBLE_TRAVEL")
    sev        = rule.severity if rule else DEFAULTS["IMPOSSIBLE_TRAVEL"]["severity"]
    risk_score = 7.5 if distance_km and distance_km > 500 else 5.5

    event = ThreatEvent.objects.create(
        detector   = "IMPOSSIBLE_TRAVEL",
        user       = user,
        risk_score = risk_score,
        ip_address = new_ip,
        evidence   = {
            "last_ip":         last_ip,
            "new_ip":          new_ip,
            "last_location":   profile.last_known_location,
            "new_location":    new_location,
            "distance_km":     distance_km,
            "elapsed_minutes": elapsed_mins,
        },
    )

    _escalate_to_alert(
        event,
        alert_type  = "IMPOSSIBLE_TRAVEL",
        title       = f"Impossible travel: {user.full_name}",
        description = (
            f"{user.full_name} logged in from {new_location or new_ip} "
            f"after last access from {profile.last_known_location or last_ip}. "
            + (f"Distance: {distance_km:.0f} km in {elapsed_mins:.0f} min." if distance_km else "Unknown IP address.")
        ),
        severity   = sev,
        risk_score = risk_score,
        auto_block = (rule.auto_block if rule else False),
    )

    # Update profile
    profile.last_known_ip       = new_ip
    profile.last_known_location = new_location
    profile.save(update_fields=["last_known_ip", "last_known_location", "updated_at"])

    logger.warning(
        "IMPOSSIBLE_TRAVEL | user=%s | %s→%s | dist=%.0fkm | score=%.1f",
        user.email, last_ip, new_ip, distance_km or 0, risk_score
    )
    return event


# ─────────────────────────────────────────────
#  4. Repeated Auth Failure Detector
# ─────────────────────────────────────────────

def detect_repeated_auth_failure(user, window_minutes: int = None):
    """
    Fires when a user has too many failed_logins within the window.
    Uses the `failed_logins` counter on CustomUser (incremented by LoginView).
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, _ = _lazy()

    rule = _get_rule("REPEATED_AUTH_FAIL")
    win  = window_minutes or (rule.threshold_window_minutes if rule else DEFAULTS["REPEATED_AUTH_FAIL"]["window_minutes"])
    thr  = rule.threshold_count if rule else DEFAULTS["REPEATED_AUTH_FAIL"]["count"]
    sev  = rule.severity if rule else DEFAULTS["REPEATED_AUTH_FAIL"]["severity"]
    auto = rule.auto_block if rule else False

    # Count AUTH_FAIL audit events in window
    since = timezone.now() - timedelta(minutes=win)
    count = AuditTrail.objects.filter(
        actor      = user,
        event_type = "AUTH_FAIL",
        timestamp__gte = since,
    ).count()

    # Also check the raw counter on the user model
    raw_count = user.failed_logins

    effective = max(count, raw_count)
    if effective < thr:
        return None

    risk_score = min(5.0 + effective * 0.4, 10.0)

    event = ThreatEvent.objects.create(
        detector   = "REPEATED_FAIL",
        user       = user,
        risk_score = risk_score,
        evidence   = {
            "failed_count":   effective,
            "threshold":      thr,
            "window_minutes": win,
            "raw_counter":    raw_count,
            "audit_count":    count,
        },
    )

    _escalate_to_alert(
        event,
        alert_type  = "REPEATED_FAILURE",
        title       = f"Repeated login failures: {user.full_name} ({effective} attempts)",
        description = (
            f"{user.full_name} has failed to authenticate {effective} times "
            f"within {win} minutes. Possible brute-force attack."
        ),
        severity   = sev,
        risk_score = risk_score,
        auto_block = auto,
    )

    logger.warning(
        "REPEATED_FAIL | user=%s | count=%d | score=%.1f",
        user.email, effective, risk_score
    )
    return event


# ─────────────────────────────────────────────
#  5. Large Upload Detector
# ─────────────────────────────────────────────

def detect_large_upload(access_log):
    """
    Fires when an UPLOAD action involves a file larger than the threshold.
    Threshold default: 50 MB.
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, _ = _lazy()

    if access_log.action != "UPLOAD":
        return None

    asset = access_log.data_asset
    if not asset:
        return None

    rule         = _get_rule("LARGE_UPLOAD")
    threshold_mb = (rule.threshold_value if rule else DEFAULTS["LARGE_UPLOAD"]["value_mb"])
    sev          = rule.severity if rule else DEFAULTS["LARGE_UPLOAD"]["severity"]

    size_mb = asset.file_size_bytes / (1024 * 1024) if asset.file_size_bytes else 0
    if size_mb < threshold_mb:
        return None

    risk_score = min(3.0 + (size_mb / threshold_mb) * 1.5, 8.0)

    event = ThreatEvent.objects.create(
        detector      = "LARGE_UPLOAD",
        user          = access_log.user,
        related_asset = asset,
        risk_score    = risk_score,
        ip_address    = access_log.ip_address,
        evidence      = {
            "file_name":    asset.name,
            "size_mb":      round(size_mb, 2),
            "threshold_mb": threshold_mb,
            "classification": asset.classification,
        },
    )

    _escalate_to_alert(
        event,
        alert_type  = "DATA_EXFILTRATION",
        title       = f"Large file upload: {asset.name} ({size_mb:.1f} MB)",
        description = (
            f"{getattr(access_log.user,'full_name','Unknown')} uploaded "
            f"'{asset.name}' ({size_mb:.1f} MB), exceeding the {threshold_mb} MB threshold."
        ),
        severity   = sev,
        risk_score = risk_score,
    )

    return event


# ─────────────────────────────────────────────
#  Risk Scorer
# ─────────────────────────────────────────────

def score_risk(access_log) -> float:
    """
    Composite risk score for a single AccessLog entry (0.0 – 10.0).

    Factors (additive, capped at 10.0):
      +2.0  write/delete action on sensitive asset (L3)
      +1.5  write/delete action on internal asset (L2)
      +1.5  access outside business hours
      +1.0  weekend access
      +1.0  unknown/missing user-agent (scripted access)
      +1.0  first time seeing this IP for this user
      +0.5  large number of accesses today (>50)
      +2.0  L3 asset accessed by non-privileged role
    """
    AccessLog, ThreatAlert, AuditTrail, CustomUser, MonitoringRule, ThreatEvent, UserBehaviorProfile = _lazy()

    score = 0.0
    user  = access_log.user
    asset = access_log.data_asset

    # Asset sensitivity
    classification = getattr(asset, "classification", "L1") if asset else "L1"
    if access_log.action in ("DELETE", "EDIT", "DOWNLOAD", "EXPORT", "PRINT"):
        if classification == "L3":
            score += 2.0
        elif classification == "L2":
            score += 1.5

    # Time-based
    ts   = access_log.timestamp
    hour = ts.hour
    dow  = ts.weekday()
    if hour < BUSINESS_HOUR_START or hour >= BUSINESS_HOUR_END:
        score += 1.5
    if dow in WEEKEND_DAYS:
        score += 1.0

    # User-agent
    if not access_log.user_agent:
        score += 1.0

    # New IP
    if user and access_log.ip_address:
        try:
            profile = UserBehaviorProfile.objects.get(user=user)
            if access_log.ip_address not in (profile.typical_ips or []):
                score += 1.0
        except UserBehaviorProfile.DoesNotExist:
            pass

    # Volume: many accesses today
    if user:
        today_start = ts.replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = AccessLog.objects.filter(
            user=user, timestamp__gte=today_start
        ).count()
        if today_count > 50:
            score += 0.5

    # Role vs. asset sensitivity
    if classification == "L3" and user:
        role_name = getattr(user.role, "name", "")
        if role_name not in ("ADMIN", "FINANCE"):
            score += 2.0

    return round(min(score, 10.0), 2)


# ─────────────────────────────────────────────
#  Master runner
# ─────────────────────────────────────────────

@transaction.atomic
def run_all_detectors(access_log) -> list:
    """
    Run every applicable detector against one AccessLog entry.
    Called by AccessLoggingMiddleware when risk_score >= 7.0
    and also from the Celery periodic task.

    Returns list of ThreatEvent objects created (may be empty).
    """
    if not access_log or not access_log.user:
        return []

    events = []
    user   = access_log.user

    try:
        # 1. Bulk download
        if access_log.action == "DOWNLOAD":
            ev = detect_bulk_download(user)
            if ev:
                events.append(ev)

        # 2. Off-hours
        ev = detect_off_hours_access(access_log)
        if ev:
            events.append(ev)

        # 3. Impossible travel
        ev = detect_impossible_travel(
            user,
            new_ip       = access_log.ip_address or "",
            new_location = getattr(access_log, "location", ""),
        )
        if ev:
            events.append(ev)

        # 4. Repeated auth failure
        ev = detect_repeated_auth_failure(user)
        if ev:
            events.append(ev)

        # 5. Large upload
        ev = detect_large_upload(access_log)
        if ev:
            events.append(ev)

    except Exception as exc:
        logger.error("run_all_detectors error for log %s: %s", access_log.pk, exc, exc_info=True)

    return events
