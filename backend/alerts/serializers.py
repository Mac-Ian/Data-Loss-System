"""
alerts/serializers.py
DLMS – Riba & Company Limited
"""

from rest_framework import serializers
from accounts.models import ThreatAlert
from accounts.serializers import UserMiniSerializer
from .models import AlertComment, AlertNotification, AlertPolicy


class AlertCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model  = AlertComment
        fields = ["id", "body", "author_name", "created_at"]
        read_only_fields = ["id", "author_name", "created_at"]


class AlertNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AlertNotification
        fields = ["id", "channel", "recipient", "subject", "status", "error_msg", "sent_at"]


class AlertPolicySerializer(serializers.ModelSerializer):
    action_label      = serializers.CharField(source="get_action_display",       read_only=True)
    min_severity_label= serializers.CharField(source="get_min_severity_display", read_only=True)
    created_by_name   = serializers.CharField(source="created_by.full_name",     read_only=True)

    class Meta:
        model  = AlertPolicy
        fields = [
            "id", "name", "description", "is_active",
            "alert_types", "min_severity", "min_severity_label",
            "min_risk_score", "action", "action_label", "notify_roles",
            "escalate_after_minutes", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class ThreatAlertListSerializer(serializers.ModelSerializer):
    triggered_by    = UserMiniSerializer(read_only=True)
    assigned_to_name= serializers.CharField(source="assigned_to.full_name", read_only=True)
    asset_name      = serializers.CharField(source="related_asset.name",    read_only=True)
    asset_level     = serializers.CharField(source="related_asset.classification", read_only=True)
    alert_type_label= serializers.CharField(source="get_alert_type_display", read_only=True)
    severity_label  = serializers.CharField(source="get_severity_display",   read_only=True)
    status_label    = serializers.CharField(source="get_status_display",     read_only=True)
    age_minutes     = serializers.SerializerMethodField()

    class Meta:
        model  = ThreatAlert
        fields = [
            "id", "alert_code", "alert_type", "alert_type_label",
            "severity", "severity_label", "status", "status_label",
            "title", "risk_score", "auto_blocked",
            "triggered_by", "assigned_to_name", "asset_name", "asset_level",
            "created_at", "updated_at", "resolved_at", "age_minutes",
        ]

    def get_age_minutes(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        return int(delta.total_seconds() / 60)


class ThreatAlertDetailSerializer(ThreatAlertListSerializer):
    comments      = AlertCommentSerializer(many=True, read_only=True)
    notifications = AlertNotificationSerializer(many=True, read_only=True)
    assigned_to   = UserMiniSerializer(read_only=True)

    class Meta(ThreatAlertListSerializer.Meta):
        fields = ThreatAlertListSerializer.Meta.fields + [
            "description", "raw_evidence", "resolution_notes",
            "comments", "notifications", "assigned_to",
        ]


class ResolveAlertSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(required=False, allow_blank=True)


class EscalateAlertSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class AssignAlertSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()


class CommentSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1)
