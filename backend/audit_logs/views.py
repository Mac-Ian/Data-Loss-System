"""
audit_logs/views.py
DLMS – Riba & Company Limited

Endpoints:
  GET  /api/audit/                  → AuditTrailListView
  GET  /api/audit/summary/          → AuditSummaryView
  GET  /api/audit/export/           → AuditExportView  (?fmt=csv|pdf)
  GET  /api/audit/security-report/  → SecurityReportView (?fmt=pdf)
"""

import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters import rest_framework as filters

from accounts.models import AuditTrail
from accounts.permissions import IsAdmin, IsAdminOrFinance
from .report_generator import (
    generate_alert_summary_pdf,
    generate_csv_report,
    generate_pdf_report,
)
from .serializers import AuditTrailSerializer

logger = logging.getLogger("dlms.audit")


# ── Filter
class AuditFilter(filters.FilterSet):
    event_type  = filters.ChoiceFilter(choices=AuditTrail.EVENT_TYPES)
    date_from   = filters.DateTimeFilter(field_name="timestamp", lookup_expr="gte")
    date_to     = filters.DateTimeFilter(field_name="timestamp", lookup_expr="lte")
    actor_email = filters.CharFilter(field_name="actor__email",    lookup_expr="icontains")
    ip_address  = filters.CharFilter(field_name="ip_address",      lookup_expr="icontains")
    has_asset   = filters.BooleanFilter(field_name="data_asset",   lookup_expr="isnull", exclude=True)
    has_alert   = filters.BooleanFilter(field_name="alert",        lookup_expr="isnull", exclude=True)

    class Meta:
        model  = AuditTrail
        fields = ["event_type", "date_from", "date_to", "actor_email", "ip_address"]


# ─────────────────────────────────────────────
#  List
# ─────────────────────────────────────────────

class AuditTrailListView(generics.ListAPIView):
    """
    GET /api/audit/
    Returns paginated, filterable audit trail.
    Admin-only.
    """
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = AuditTrailSerializer
    filterset_class    = AuditFilter
    search_fields      = ["description", "actor__email", "event_type", "ip_address"]
    ordering_fields    = ["timestamp", "event_type"]
    ordering           = ["-timestamp"]
    queryset           = AuditTrail.objects.select_related(
        "actor", "actor__role",
        "target_user", "data_asset", "alert",
    )


# ─────────────────────────────────────────────
#  Summary stats
# ─────────────────────────────────────────────

class AuditSummaryView(APIView):
    """
    GET /api/audit/summary/
    Returns aggregated statistics for the Reports dashboard.
    """
    permission_classes = [IsAuthenticated, IsAdminOrFinance]

    def get(self, request):
        now   = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week  = now - timedelta(days=7)
        month = now - timedelta(days=30)

        all_logs = AuditTrail.objects.all()

        # Category grouping
        CATEGORIES = {
            "AUTH":  ["AUTH_LOGIN","AUTH_LOGOUT","AUTH_FAIL","AUTH_PASSWORD","AUTH_MFA"],
            "USER":  ["USER_CREATE","USER_UPDATE","USER_SUSPEND","USER_DELETE","ROLE_ASSIGN"],
            "DATA":  ["DATA_CREATE","DATA_READ","DATA_UPDATE","DATA_DELETE","DATA_CLASSIFY"],
            "ALERT": ["ALERT_RAISED","ALERT_RESOLVED","ALERT_ESCALATED"],
            "SYSTEM":["SYS_CONFIG","SYS_EXPORT","SYS_BACKUP"],
        }

        by_category = []
        for cat, events in CATEGORIES.items():
            count = all_logs.filter(event_type__in=events, timestamp__gte=month).count()
            by_category.append({"category": cat, "count": count})

        # By event type (top 10 this month)
        by_event_type = list(
            all_logs.filter(timestamp__gte=month)
            .values("event_type")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        # Top actors (last 30 days)
        top_actors = list(
            all_logs.filter(timestamp__gte=month, actor__isnull=False)
            .values("actor__email", "actor__first_name", "actor__last_name")
            .annotate(count=Count("id"))
            .order_by("-count")[:8]
        )

        # Hourly trend (last 24h)
        hourly_trend = []
        for h in range(24):
            hour_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23-h)
            hour_end   = hour_start + timedelta(hours=1)
            auth_events = all_logs.filter(
                timestamp__gte=hour_start, timestamp__lt=hour_end,
                event_type__in=["AUTH_LOGIN","AUTH_LOGOUT","AUTH_FAIL"]
            ).count()
            data_events = all_logs.filter(
                timestamp__gte=hour_start, timestamp__lt=hour_end,
                event_type__in=["DATA_CREATE","DATA_READ","DATA_UPDATE","DATA_DELETE"]
            ).count()
            hourly_trend.append({
                "hour":        hour_start.strftime("%H:00"),
                "auth_events": auth_events,
                "data_events": data_events,
            })

        # Daily trend (last 14 days)
        daily_trend = []
        for d in range(14):
            day_start = today - timedelta(days=13-d)
            day_end   = day_start + timedelta(days=1)
            total     = all_logs.filter(timestamp__gte=day_start, timestamp__lt=day_end).count()
            fails     = all_logs.filter(
                timestamp__gte=day_start, timestamp__lt=day_end,
                event_type="AUTH_FAIL"
            ).count()
            daily_trend.append({
                "date":   day_start.strftime("%d %b"),
                "total":  total,
                "failed": fails,
            })

        # Alert stats for security report
        from accounts.models import ThreatAlert
        alerts_qs = ThreatAlert.objects.all()

        return Response({
            "total_events":    all_logs.count(),
            "events_today":    all_logs.filter(timestamp__gte=today).count(),
            "events_week":     all_logs.filter(timestamp__gte=week).count(),
            "events_month":    all_logs.filter(timestamp__gte=month).count(),
            "unique_actors":   all_logs.filter(timestamp__gte=month, actor__isnull=False)
                                       .values("actor").distinct().count(),
            "failed_logins":   all_logs.filter(event_type="AUTH_FAIL",
                                               timestamp__gte=month).count(),
            "data_events":     all_logs.filter(
                event_type__in=["DATA_CREATE","DATA_READ","DATA_UPDATE","DATA_DELETE"],
                timestamp__gte=month
            ).count(),
            # Alert stats for the combined security report
            "total_open":      alerts_qs.filter(status="OPEN").count(),
            "total_critical":  alerts_qs.filter(severity="CRITICAL",
                                                status__in=["OPEN","INVESTIGATING"]).count(),
            "auto_blocked":    alerts_qs.filter(auto_blocked=True).count(),
            "avg_resolve_time":self._avg_resolve(alerts_qs),
            "by_type":         list(
                alerts_qs.values("alert_type")
                .annotate(count=Count("id")).order_by("-count")[:8]
            ),
            # Charts
            "by_category":    by_category,
            "by_event_type":  by_event_type,
            "top_actors":     top_actors,
            "hourly_trend":   hourly_trend,
            "daily_trend":    daily_trend,
        })

    def _avg_resolve(self, qs):
        from accounts.models import ThreatAlert
        resolved = qs.filter(status="RESOLVED", resolved_at__isnull=False)
        if not resolved.exists():
            return None
        total = sum((a.resolved_at - a.created_at).total_seconds()
                    for a in resolved)
        return round(total / resolved.count() / 60, 1)


# ─────────────────────────────────────────────
#  Exports
# ─────────────────────────────────────────────

class AuditExportView(APIView):
    """
    GET /api/audit/export/?fmt=csv|pdf&date_from=...&date_to=...
    Downloads audit trail as CSV or PDF.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        fmt        = request.query_params.get("fmt", "csv").lower()
        date_from  = request.query_params.get("date_from", "")
        date_to    = request.query_params.get("date_to",   "")
        event_type = request.query_params.get("event_type","")

        qs = AuditTrail.objects.select_related(
            "actor", "actor__role", "target_user", "data_asset", "alert"
        ).order_by("-timestamp")

        if date_from:
            qs = qs.filter(timestamp__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__lte=date_to)
        if event_type and event_type != "ALL":
            qs = qs.filter(event_type=event_type)

        # Audit the export itself
        AuditTrail.objects.create(
            event_type  = "SYS_EXPORT",
            actor       = request.user,
            description = f"Audit log exported as {fmt.upper()} (rows: {qs.count()}) by {request.user.email}",
            ip_address  = (
                request.META.get("HTTP_X_FORWARDED_FOR","").split(",")[0].strip()
                or request.META.get("REMOTE_ADDR")
            ),
        )

        filename = f"dlms_audit_{timezone.now().strftime('%Y%m%d_%H%M')}"

        if fmt == "csv":
            data = generate_csv_report(qs)
            response = HttpResponse(data, content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
            return response

        elif fmt == "pdf":
            data = generate_pdf_report(
                queryset     = qs,
                title        = "Audit Trail Report",
                date_from    = date_from,
                date_to      = date_to,
                requested_by = request.user.email,
            )
            if not data:
                return Response({"detail": "PDF generation failed. Is ReportLab installed?"},
                                status=500)
            response = HttpResponse(data, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}.pdf"'
            return response

        return Response({"detail": "Unsupported format. Use ?fmt=csv or ?fmt=pdf"},
                        status=400)


class SecurityReportView(APIView):
    """
    GET /api/audit/security-report/?fmt=pdf&date_from=...&date_to=...
    Management-level security summary. Admin + Finance.
    """
    permission_classes = [IsAuthenticated, IsAdminOrFinance]

    def get(self, request):
        fmt       = request.query_params.get("fmt", "pdf").lower()
        date_from = request.query_params.get("date_from", "")
        date_to   = request.query_params.get("date_to",   "")

        # Reuse the summary view logic
        summary_view = AuditSummaryView()
        summary_view.request = request
        stats = summary_view.get(request).data

        AuditTrail.objects.create(
            event_type  = "SYS_EXPORT",
            actor       = request.user,
            description = f"Security summary report exported by {request.user.email}",
        )

        if fmt == "pdf":
            data = generate_alert_summary_pdf(
                stats        = stats,
                date_from    = date_from,
                date_to      = date_to,
                requested_by = request.user.email,
            )
            if not data:
                return Response({"detail": "PDF generation failed."},status=500)
            filename = f"dlms_security_report_{timezone.now().strftime('%Y%m%d')}.pdf"
            response = HttpResponse(data, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        return Response(stats)   # JSON fallback
