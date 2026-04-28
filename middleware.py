"""
accounts/middleware.py
DLMS – Riba & Company Limited

Two middleware components:

1. AccessLoggingMiddleware
   Intercepts every authenticated API request and writes an AccessLog row.
   Runs AFTER the view so we can capture the HTTP response status.

2. RateLimitMiddleware
   Blocks IPs that exceed MAX_REQUESTS per WINDOW_SECONDS.
   Uses Django's cache backend (configure Redis in settings.py for production).
   On breach: increments the user's failed_logins counter and raises 429.
"""

import json
import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger("dlms.access")

# ── Tunable constants (override in settings.py if needed)
RATE_LIMIT_MAX_REQUESTS = getattr(settings, "RATE_LIMIT_MAX_REQUESTS", 200)
RATE_LIMIT_WINDOW_SECS  = getattr(settings, "RATE_LIMIT_WINDOW_SECS",  60)

# Paths that are exempt from access logging (keep the log clean)
LOG_EXEMPT_PATHS = {
    "/api/auth/refresh/",
    "/admin/jsi18n/",
    "/static/",
    "/media/",
    "/favicon.ico",
}

# HTTP methods we consider "write" operations for risk scoring
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _get_client_ip(request):
    """Extract real client IP — respects X-Forwarded-For behind a proxy."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


def _risk_score(request, response) -> float:
    """
    Very lightweight heuristic risk scorer (0.0 – 10.0).
    The full ML-based scorer lives in monitoring/detector.py (Phase 4).

    Rules:
        +2.0  write method on a sensitive endpoint
        +1.5  response 4xx (access denied / not found)
        +3.0  response 5xx (server error during data op)
        +1.0  request outside business hours (before 07:00 or after 20:00 UTC)
        +1.0  user-agent missing (possible scripted access)
    """
    score = 0.0
    path  = request.path

    if request.method in WRITE_METHODS and any(
        kw in path for kw in ("assets", "users", "classify", "alerts")
    ):
        score += 2.0

    status = response.status_code
    if 400 <= status < 500:
        score += 1.5
    elif status >= 500:
        score += 3.0

    hour = time.gmtime().tm_hour
    if hour < 7 or hour >= 20:
        score += 1.0

    if not request.META.get("HTTP_USER_AGENT"):
        score += 1.0

    return min(score, 10.0)


class AccessLoggingMiddleware(MiddlewareMixin):
    """
    Writes one AccessLog row per authenticated API request.

    Import path to add to MIDDLEWARE (after AuthenticationMiddleware):
        "accounts.middleware.AccessLoggingMiddleware"
    """

    # API path prefix — only log requests under /api/
    API_PREFIX = "/api/"

    def process_response(self, request, response):
        # Only log API requests from authenticated users
        if not request.path.startswith(self.API_PREFIX):
            return response
        if not hasattr(request, "user") or not request.user.is_authenticated:
            return response
        if any(request.path.startswith(p) for p in LOG_EXEMPT_PATHS):
            return response

        try:
            self._write_log(request, response)
        except Exception as exc:            # never crash a request over logging
            logger.error("AccessLoggingMiddleware error: %s", exc, exc_info=True)

        return response

    def _write_log(self, request, response):
        # Lazy import to avoid circular dependency at module load time
        from .models import AccessLog

        # Map HTTP method → action choice
        method_map = {
            "GET":    "VIEW",
            "POST":   "UPLOAD",
            "PUT":    "EDIT",
            "PATCH":  "EDIT",
            "DELETE": "DELETE",
        }
        action = method_map.get(request.method, "VIEW")

        # Try to resolve the data asset from query params or body
        data_asset = None
        try:
            asset_id = (
                request.resolver_match.kwargs.get("pk")
                or request.GET.get("asset_id")
            )
            if asset_id:
                from .models import DataAsset  # noqa — imported lazily
                data_asset = DataAsset.objects.filter(pk=asset_id).first()
        except Exception:
            pass

        score     = _risk_score(request, response)
        client_ip = _get_client_ip(request)

        log = AccessLog(
            user         = request.user,
            data_asset   = data_asset,
            action       = action,
            ip_address   = client_ip,
            user_agent   = request.META.get("HTTP_USER_AGENT", "")[:500],
            risk_score   = score,
            is_anomalous = score >= 5.0,
            session_id   = request.session.session_key or "",
        )
        log.save()

        # Kick off async anomaly alert if score is high (Phase 4 hook)
        if score >= 7.0:
            try:
                from monitoring.tasks import evaluate_anomaly  # noqa
                evaluate_anomaly.delay(log.pk)
            except ImportError:
                pass   # monitoring app not yet installed

        logger.info(
            "ACCESS | user=%s | method=%s | path=%s | status=%s | score=%.1f",
            request.user.email, request.method, request.path,
            response.status_code, score,
        )


class RateLimitMiddleware(MiddlewareMixin):
    """
    Simple sliding-window rate limiter per IP address.

    Exempt paths (login endpoint, static) skip the check entirely.
    Authenticated users get a higher allowance than anonymous callers.

    Import path (place BEFORE AccessLoggingMiddleware in MIDDLEWARE):
        "accounts.middleware.RateLimitMiddleware"
    """

    EXEMPT_PATHS = {"/api/auth/login/", "/api/auth/refresh/", "/static/", "/media/"}

    def process_request(self, request):
        if any(request.path.startswith(p) for p in self.EXEMPT_PATHS):
            return None

        client_ip = _get_client_ip(request)
        cache_key = f"rl:{client_ip}"

        # Authenticated users get 3× the allowance
        max_req   = RATE_LIMIT_MAX_REQUESTS
        if hasattr(request, "user") and request.user.is_authenticated:
            max_req *= 3

        hits = cache.get(cache_key, 0)

        if hits >= max_req:
            logger.warning("RATE_LIMIT | ip=%s | hits=%d", client_ip, hits)

            # Increment failed_logins counter if we can identify the user
            if hasattr(request, "user") and request.user.is_authenticated:
                try:
                    request.user.failed_logins += 1
                    request.user.save(update_fields=["failed_logins"])
                except Exception:
                    pass

            return JsonResponse(
                {
                    "error": "Too many requests. Please slow down.",
                    "retry_after": RATE_LIMIT_WINDOW_SECS,
                },
                status=429,
            )

        # Increment counter; set TTL only on first hit
        if hits == 0:
            cache.set(cache_key, 1, RATE_LIMIT_WINDOW_SECS)
        else:
            cache.incr(cache_key)

        return None
