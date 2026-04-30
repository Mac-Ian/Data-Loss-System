"""
alerts/views.py
DLMS – Riba & Company Limited

Endpoints:
  GET   /api/alerts/                    → AlertListView
  GET   /api/alerts/stats/              → AlertStatsView
  GET   /api/alerts/{id}/               → AlertDetailView
  POST  /api/alerts/{id}/resolve/       → AlertResolveView
  POST  /api/alerts/{id}/escalate/      → AlertEscalateView
  POST  /api/alerts/{id}/assign/        → AlertAssignView
  POST  /api/alerts/{id}/comment/       → AlertCommentView
  POST  /api/alerts/{id}/false-positive/→ AlertFalsePositiveView

  Policies (Admin)
  GET   /api/alerts/policies/           → PolicyListView
  POST  /api/alerts/policies/           → PolicyListView
  PATCH /api/alerts/policies/{id}/      → PolicyDetailView
"""

import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters import rest_framework as filters

from accounts.models import AuditTrail, CustomUser, ThreatAlert
from accounts.permissions import IsAdmin, IsAdminOrOperations
from .models import AlertComment, AlertPolicy
from .responder import notify_by_email, run_response
from .serializers import (
    AlertCommentSerializer,
    AlertPolicySerializer,
    AssignAlertSerializer,
    CommentSerializer,
    EscalateAlertSerializer,
    ResolveAlertSerializer,
    ThreatAlertDetailSerializer,
    ThreatAlertListSerializer,
)

logger = logging.getLogger("dlms.alerts")

SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
NEXT_SEVERITY = {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "CRITICAL"}


def _audit(event, actor, description, alert=None, request=None):
    try:
        AuditTrail.objects.create(
            event_type  = event,
            actor       = actor,
            alert       = alert,
            description = description,
            ip_address  = (
                request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
                or request.META.get("REMOTE_ADDR")
            ) if request else None,
        )
    except Exception as exc:
        logger.error("Audit write failed: %s", exc)


# ── Filters
class AlertFilter(filters.FilterSet):
    severity   = filters.ChoiceFilter(choices=ThreatAlert.SEVERITY_CHOICES)
    status     = filters.ChoiceFilter(choices=ThreatAlert.STATUS_CHOICES)
    alert_type = filters.ChoiceFilter(choices=ThreatAlert.ALERT_TYPE_CHOICES)
    date_from  = filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    date_to    = filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")
    assigned   = filters.BooleanFilter(field_name="assigned_to", lookup_expr="isnull",
                                       exclude=True)
    min_risk   = filters.NumberFilter(field_name="risk_score", lookup_expr="gte")

    class Meta:
        model  = ThreatAlert
        fields = ["severity", "status", "alert_type", "date_from",
                  "date_to", "assigned", "min_risk"]


# ─────────────────────────────────────────────
#  List & Detail
# ─────────────────────────────────────────────

class AlertListView(generics.ListAPIView):
    """GET /api/alerts/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = ThreatAlertListSerializer
    filterset_class    = AlertFilter
    search_fields      = ["title", "alert_code", "description"]
    ordering_fields    = ["created_at", "severity", "risk_score", "status"]
    ordering           = ["-created_at"]
    queryset           = ThreatAlert.objects.select_related(
        "triggered_by", "triggered_by__role",
        "related_asset", "assigned_to",
    )


class AlertDetailView(generics.RetrieveAPIView):
    """GET /api/alerts/{id}/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = ThreatAlertDetailSerializer
    queryset           = ThreatAlert.objects.select_related(
        "triggered_by", "triggered_by__role",
        "related_asset", "assigned_to",
    ).prefetch_related("comments", "notifications")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        _audit("ALERT_RAISED", request.user,
               f"Viewed alert: {instance.alert_code}", alert=instance, request=request)
        return super().retrieve(request, *args, **kwargs)


# ─────────────────────────────────────────────
#  Alert Actions
# ─────────────────────────────────────────────

class AlertResolveView(APIView):
    """POST /api/alerts/{pk}/resolve/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def post(self, request, pk):
        try:
            alert = ThreatAlert.objects.get(pk=pk)
        except ThreatAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if alert.status == "RESOLVED":
            return Response({"detail": "Alert is already resolved."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ResolveAlertSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        alert.status           = "RESOLVED"
        alert.resolved_at      = timezone.now()
        alert.assigned_to      = request.user
        alert.resolution_notes = serializer.validated_data.get("resolution_notes", "")
        alert.save(update_fields=["status", "resolved_at", "assigned_to",
                                  "resolution_notes", "updated_at"])

        _audit("ALERT_RESOLVED", request.user,
               f"Alert resolved: {alert.alert_code}. Notes: {alert.resolution_notes[:100]}",
               alert=alert, request=request)

        logger.info("ALERT_RESOLVED | alert=%s | by=%s", alert.alert_code, request.user.email)
        return Response({
            "detail":      f"Alert {alert.alert_code} resolved.",
            "resolved_at": alert.resolved_at,
            "resolved_by": request.user.full_name,
        })


class AlertEscalateView(APIView):
    """POST /api/alerts/{pk}/escalate/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def post(self, request, pk):
        try:
            alert = ThreatAlert.objects.get(pk=pk)
        except ThreatAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if alert.severity == "CRITICAL":
            return Response({"detail": "Alert is already at CRITICAL severity."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = EscalateAlertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_severity   = alert.severity
        alert.severity = NEXT_SEVERITY.get(alert.severity, "CRITICAL")
        alert.status   = "INVESTIGATING"
        alert.save(update_fields=["severity", "status", "updated_at"])

        reason = serializer.validated_data.get("reason", "Manual escalation")
        _audit("ALERT_ESCALATED", request.user,
               f"Alert {alert.alert_code} escalated {old_severity}→{alert.severity}. {reason}",
               alert=alert, request=request)

        # Re-run response for new severity
        run_response(alert)

        logger.info("ALERT_ESCALATED | alert=%s | %s→%s | by=%s",
                    alert.alert_code, old_severity, alert.severity, request.user.email)
        return Response({
            "detail":       f"Alert escalated to {alert.severity}.",
            "old_severity": old_severity,
            "new_severity": alert.severity,
        })


class AlertAssignView(APIView):
    """POST /api/alerts/{pk}/assign/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def post(self, request, pk):
        try:
            alert = ThreatAlert.objects.get(pk=pk)
        except ThreatAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AssignAlertSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignee = CustomUser.objects.get(pk=serializer.validated_data["user_id"])
        except CustomUser.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        alert.assigned_to = assignee
        alert.status      = "INVESTIGATING"
        alert.save(update_fields=["assigned_to", "status", "updated_at"])

        _audit("ALERT_RAISED", request.user,
               f"Alert {alert.alert_code} assigned to {assignee.full_name}",
               alert=alert, request=request)

        return Response({
            "detail":      f"Alert assigned to {assignee.full_name}.",
            "assigned_to": assignee.full_name,
        })


class AlertFalsePositiveView(APIView):
    """POST /api/alerts/{pk}/false-positive/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            alert = ThreatAlert.objects.get(pk=pk)
        except ThreatAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        alert.status      = "FALSE_POSITIVE"
        alert.resolved_at = timezone.now()
        alert.save(update_fields=["status", "resolved_at", "updated_at"])

        # If user was auto-blocked, un-suspend them
        if alert.auto_blocked and alert.triggered_by:
            alert.triggered_by.status = "ACTIVE"
            alert.triggered_by.save(update_fields=["status"])

        _audit("ALERT_RESOLVED", request.user,
               f"Alert {alert.alert_code} marked as false positive.",
               alert=alert, request=request)

        return Response({"detail": f"Alert {alert.alert_code} marked as false positive."})


class AlertCommentView(APIView):
    """POST /api/alerts/{pk}/comment/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def post(self, request, pk):
        try:
            alert = ThreatAlert.objects.get(pk=pk)
        except ThreatAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CommentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        comment = AlertComment.objects.create(
            alert  = alert,
            author = request.user,
            body   = serializer.validated_data["body"],
        )
        return Response(AlertCommentSerializer(comment).data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
#  Stats
# ─────────────────────────────────────────────

class AlertStatsView(APIView):
    """GET /api/alerts/stats/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def get(self, request):
        now   = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week  = now - timedelta(days=7)

        all_alerts = ThreatAlert.objects.all()

        by_severity = list(
            all_alerts.filter(status__in=["OPEN","INVESTIGATING"])
            .values("severity").annotate(count=Count("id")).order_by("severity")
        )
        by_type = list(
            all_alerts.filter(created_at__gte=week)
            .values("alert_type").annotate(count=Count("id")).order_by("-count")[:8]
        )
        by_status = list(
            all_alerts.values("status").annotate(count=Count("id"))
        )

        return Response({
            "total_open":       all_alerts.filter(status="OPEN").count(),
            "total_critical":   all_alerts.filter(severity="CRITICAL", status__in=["OPEN","INVESTIGATING"]).count(),
            "total_today":      all_alerts.filter(created_at__gte=today).count(),
            "total_week":       all_alerts.filter(created_at__gte=week).count(),
            "auto_blocked":     all_alerts.filter(auto_blocked=True).count(),
            "avg_resolve_time": self._avg_resolve_minutes(all_alerts),
            "by_severity":      by_severity,
            "by_type":          by_type,
            "by_status":        by_status,
        })

    def _avg_resolve_minutes(self, qs):
        resolved = qs.filter(status="RESOLVED", resolved_at__isnull=False)
        if not resolved.exists():
            return None
        total = sum(
            (a.resolved_at - a.created_at).total_seconds()
            for a in resolved
        )
        return round(total / resolved.count() / 60, 1)


# ─────────────────────────────────────────────
#  Policies
# ─────────────────────────────────────────────

class PolicyListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/alerts/policies/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = AlertPolicySerializer
    queryset           = AlertPolicy.objects.select_related("created_by")

    def perform_create(self, serializer):
        policy = serializer.save(created_by=self.request.user)
        _audit("SYS_CONFIG", self.request.user,
               f"Alert policy created: '{policy.name}'", request=self.request)


class PolicyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/alerts/policies/{id}/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = AlertPolicySerializer
    queryset           = AlertPolicy.objects.all()
    http_method_names  = ["get", "patch", "delete"]

    def perform_update(self, serializer):
        policy = serializer.save()
        _audit("SYS_CONFIG", self.request.user,
               f"Alert policy updated: '{policy.name}'", request=self.request)

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        _audit("SYS_CONFIG", self.request.user,
               f"Alert policy deleted: '{name}'", request=self.request)
