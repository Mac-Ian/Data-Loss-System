"""
monitoring/views.py
DLMS – Riba & Company Limited

Endpoints:
  GET  /api/monitoring/events/          → ThreatEventListView
  GET  /api/monitoring/events/stats/    → MonitoringStatsView
  GET  /api/monitoring/logs/            → AccessLogListView
  GET  /api/monitoring/rules/           → MonitoringRuleListView
  POST /api/monitoring/rules/           → MonitoringRuleListView
  PATCH /api/monitoring/rules/{id}/     → MonitoringRuleDetailView
  GET  /api/monitoring/profiles/        → BehaviorProfileListView
  GET  /api/monitoring/live/            → LiveEventStreamView (SSE)
"""

import json
import logging
import time
from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters import rest_framework as filters

from accounts.models import AccessLog
from accounts.permissions import IsAdmin, IsAdminOrOperations
from .models import MonitoringRule, ThreatEvent, UserBehaviorProfile
from .serializers import (
    AccessLogSerializer,
    BehaviorProfileSerializer,
    MonitoringRuleSerializer,
    ThreatEventSerializer,
)

logger = logging.getLogger("dlms.monitoring")


# ── Filters
class AccessLogFilter(filters.FilterSet):
    action       = filters.ChoiceFilter(choices=AccessLog.ACTION_CHOICES)
    is_anomalous = filters.BooleanFilter()
    date_from    = filters.DateTimeFilter(field_name="timestamp", lookup_expr="gte")
    date_to      = filters.DateTimeFilter(field_name="timestamp", lookup_expr="lte")
    user_email   = filters.CharFilter(field_name="user__email", lookup_expr="icontains")

    class Meta:
        model  = AccessLog
        fields = ["action", "is_anomalous", "date_from", "date_to", "user_email"]


class ThreatEventFilter(filters.FilterSet):
    detector          = filters.ChoiceFilter(choices=ThreatEvent.DETECTOR_CHOICES)
    escalated         = filters.BooleanFilter(field_name="escalated_to_alert")
    min_risk          = filters.NumberFilter(field_name="risk_score", lookup_expr="gte")
    date_from         = filters.DateTimeFilter(field_name="detected_at", lookup_expr="gte")
    date_to           = filters.DateTimeFilter(field_name="detected_at", lookup_expr="lte")

    class Meta:
        model  = ThreatEvent
        fields = ["detector", "escalated", "min_risk", "date_from", "date_to"]


# ── Views

class ThreatEventListView(generics.ListAPIView):
    """GET /api/monitoring/events/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = ThreatEventSerializer
    filterset_class    = ThreatEventFilter
    ordering_fields    = ["detected_at", "risk_score"]
    ordering           = ["-detected_at"]
    queryset           = ThreatEvent.objects.select_related(
        "user", "user__role", "related_asset", "monitoring_rule"
    )


class AccessLogListView(generics.ListAPIView):
    """GET /api/monitoring/logs/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = AccessLogSerializer
    filterset_class    = AccessLogFilter
    search_fields      = ["user__email", "user__first_name", "ip_address"]
    ordering_fields    = ["timestamp", "risk_score"]
    ordering           = ["-timestamp"]
    queryset           = AccessLog.objects.select_related(
        "user", "user__role", "data_asset"
    )


class MonitoringRuleListView(generics.ListCreateAPIView):
    """GET/POST /api/monitoring/rules/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = MonitoringRuleSerializer
    queryset           = MonitoringRule.objects.all()


class MonitoringRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/monitoring/rules/{id}/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = MonitoringRuleSerializer
    queryset           = MonitoringRule.objects.all()
    http_method_names  = ["get", "patch", "delete"]


class BehaviorProfileListView(generics.ListAPIView):
    """GET /api/monitoring/profiles/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = BehaviorProfileSerializer
    queryset           = UserBehaviorProfile.objects.select_related("user", "user__role")


class MonitoringStatsView(APIView):
    """
    GET /api/monitoring/events/stats/
    Returns summary statistics for the monitoring dashboard widgets.
    """
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def get(self, request):
        now    = timezone.now()
        today  = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week   = now - timedelta(days=7)

        # Access log stats
        logs_today     = AccessLog.objects.filter(timestamp__gte=today)
        anomalous_today= logs_today.filter(is_anomalous=True).count()
        avg_risk_today = logs_today.aggregate(avg=Avg("risk_score"))["avg"] or 0.0

        # Threat events
        events_today   = ThreatEvent.objects.filter(detected_at__gte=today)
        events_week    = ThreatEvent.objects.filter(detected_at__gte=week)

        # By detector (this week)
        by_detector = list(
            events_week.values("detector")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Hourly access volume (last 24h)
        hourly = []
        for h in range(24):
            hour_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23-h)
            hour_end   = hour_start + timedelta(hours=1)
            cnt        = AccessLog.objects.filter(
                timestamp__gte=hour_start, timestamp__lt=hour_end
            ).count()
            anom       = AccessLog.objects.filter(
                timestamp__gte=hour_start, timestamp__lt=hour_end, is_anomalous=True
            ).count()
            hourly.append({
                "hour":      hour_start.strftime("%H:00"),
                "accesses":  cnt,
                "anomalous": anom,
            })

        # Top risky users (last 24h)
        from django.db.models import Max
        top_users = list(
            AccessLog.objects.filter(timestamp__gte=today, is_anomalous=True)
            .values("user__email", "user__first_name", "user__last_name")
            .annotate(events=Count("id"), max_risk=Max("risk_score"))
            .order_by("-events")[:5]
        )

        # 7-day daily trend
        daily_trend = []
        for d in range(7):
            day_start = today - timedelta(days=6-d)
            day_end   = day_start + timedelta(days=1)
            day_events = ThreatEvent.objects.filter(
                detected_at__gte=day_start, detected_at__lt=day_end
            )
            daily_trend.append({
                "day":     day_start.strftime("%a"),
                "date":    day_start.strftime("%Y-%m-%d"),
                "events":  day_events.count(),
                "blocked": day_events.filter(
                    id__in=day_events.values("id")
                ).count(),  # placeholder — Phase 5 will add auto_blocked filter
            })

        return Response({
            "summary": {
                "accesses_today":   logs_today.count(),
                "anomalous_today":  anomalous_today,
                "avg_risk_today":   round(avg_risk_today, 2),
                "events_today":     events_today.count(),
                "events_week":      events_week.count(),
                "open_alerts":      0,  # populated by Phase 5
            },
            "by_detector":  by_detector,
            "hourly_volume": hourly,
            "top_risky_users": top_users,
            "daily_trend":  daily_trend,
        })


class LiveEventStreamView(APIView):
    """
    GET /api/monitoring/live/
    Server-Sent Events (SSE) stream — pushes new AccessLog entries
    to the React frontend every 3 seconds.

    The React LiveMonitoringPage connects with:
        const es = new EventSource('/api/monitoring/live/', { withCredentials: true });
        es.onmessage = e => handleEvent(JSON.parse(e.data));
    """
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def get(self, request):
        def event_stream():
            last_id  = AccessLog.objects.order_by("-id").values_list("id", flat=True).first() or 0
            attempts = 0

            while attempts < 200:   # ~10 min max per connection
                new_logs = AccessLog.objects.filter(
                    id__gt=last_id
                ).select_related("user", "data_asset").order_by("id")[:20]

                for log in new_logs:
                    payload = {
                        "event_id":    log.pk,
                        "type":        "access",
                        "user":        getattr(log.user, "email", "Unknown"),
                        "action":      log.action,
                        "asset":       getattr(log.data_asset, "name", "—"),
                        "risk_score":  log.risk_score,
                        "is_anomalous":log.is_anomalous,
                        "ip":          log.ip_address or "—",
                        "ts":          log.timestamp.isoformat(),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    last_id = log.pk

                time.sleep(3)
                attempts += 1

            yield "data: {\"type\": \"close\"}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"]               = "no-cache"
        response["X-Accel-Buffering"]           = "no"
        response["Access-Control-Allow-Origin"] = "http://localhost:3000"
        return response
