"""
monitoring/serializers.py
DLMS – Riba & Company Limited
"""

from rest_framework import serializers
from accounts.serializers import UserMiniSerializer
from accounts.models import AccessLog
from .models import MonitoringRule, ThreatEvent, UserBehaviorProfile


class MonitoringRuleSerializer(serializers.ModelSerializer):
    rule_type_label = serializers.CharField(source="get_rule_type_display", read_only=True)
    severity_label  = serializers.CharField(source="get_severity_display",  read_only=True)

    class Meta:
        model  = MonitoringRule
        fields = [
            "id", "name", "rule_type", "rule_type_label", "description",
            "severity", "severity_label", "is_active",
            "threshold_count", "threshold_window_minutes", "threshold_value",
            "auto_block", "notify_roles", "created_at", "updated_at",
        ]


class ThreatEventSerializer(serializers.ModelSerializer):
    user         = UserMiniSerializer(read_only=True)
    asset_name   = serializers.CharField(source="related_asset.name", read_only=True)
    rule_name    = serializers.CharField(source="monitoring_rule.name", read_only=True)
    detector_label = serializers.CharField(source="get_detector_display", read_only=True)

    class Meta:
        model  = ThreatEvent
        fields = [
            "id", "detector", "detector_label", "user", "asset_name",
            "rule_name", "risk_score", "evidence", "ip_address",
            "escalated_to_alert", "alert_id", "detected_at",
        ]


class AccessLogSerializer(serializers.ModelSerializer):
    user_email  = serializers.CharField(source="user.email",     read_only=True)
    user_name   = serializers.CharField(source="user.full_name", read_only=True)
    asset_name  = serializers.CharField(source="data_asset.name", read_only=True)
    asset_level = serializers.CharField(source="data_asset.classification", read_only=True)
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model  = AccessLog
        fields = [
            "id", "user_email", "user_name", "asset_name", "asset_level",
            "action", "action_label", "ip_address", "user_agent",
            "risk_score", "is_anomalous", "session_id", "timestamp",
        ]


class BehaviorProfileSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)

    class Meta:
        model  = UserBehaviorProfile
        fields = [
            "user", "avg_daily_accesses", "avg_download_count",
            "typical_login_hours", "typical_ips", "typical_locations",
            "last_known_ip", "last_known_location", "risk_baseline", "updated_at",
        ]


class LiveEventSerializer(serializers.Serializer):
    """Lightweight payload pushed over WebSocket / SSE for the live feed."""
    event_id    = serializers.IntegerField()
    type        = serializers.CharField()
    user        = serializers.CharField()
    action      = serializers.CharField()
    asset       = serializers.CharField()
    risk_score  = serializers.FloatField()
    is_anomalous= serializers.BooleanField()
    ip          = serializers.CharField()
    ts          = serializers.DateTimeField()
