"""
audit_logs/serializers.py
DLMS – Riba & Company Limited
"""

from rest_framework import serializers
from accounts.models import AuditTrail
from accounts.serializers import UserMiniSerializer


class AuditTrailSerializer(serializers.ModelSerializer):
    actor_email      = serializers.CharField(source="actor.email",          read_only=True)
    actor_name       = serializers.CharField(source="actor.full_name",      read_only=True)
    actor_role       = serializers.CharField(source="actor.role.name",      read_only=True)
    target_user_name = serializers.CharField(source="target_user.full_name",read_only=True)
    asset_name       = serializers.CharField(source="data_asset.name",      read_only=True)
    asset_level      = serializers.CharField(source="data_asset.classification", read_only=True)
    alert_code       = serializers.CharField(source="alert.alert_code",     read_only=True)
    event_label      = serializers.CharField(source="get_event_type_display", read_only=True)

    # Group event types into readable categories for the frontend
    event_category   = serializers.SerializerMethodField()

    class Meta:
        model  = AuditTrail
        fields = [
            "id", "event_type", "event_label", "event_category",
            "actor", "actor_email", "actor_name", "actor_role",
            "target_user_name", "asset_name", "asset_level", "alert_code",
            "description", "metadata", "ip_address", "user_agent",
            "session_id", "timestamp",
        ]

    def get_event_category(self, obj):
        categories = {
            "AUTH":  ["AUTH_LOGIN","AUTH_LOGOUT","AUTH_FAIL","AUTH_PASSWORD","AUTH_MFA"],
            "USER":  ["USER_CREATE","USER_UPDATE","USER_SUSPEND","USER_DELETE","ROLE_ASSIGN"],
            "DATA":  ["DATA_CREATE","DATA_READ","DATA_UPDATE","DATA_DELETE","DATA_CLASSIFY"],
            "ALERT": ["ALERT_RAISED","ALERT_RESOLVED","ALERT_ESCALATED"],
            "SYSTEM":["SYS_CONFIG","SYS_EXPORT","SYS_BACKUP"],
        }
        for cat, events in categories.items():
            if obj.event_type in events:
                return cat
        return "OTHER"


class AuditSummarySerializer(serializers.Serializer):
    """Shape returned by GET /api/audit/summary/"""
    total_events      = serializers.IntegerField()
    events_today      = serializers.IntegerField()
    unique_actors     = serializers.IntegerField()
    failed_logins     = serializers.IntegerField()
    by_category       = serializers.ListField()
    by_event_type     = serializers.ListField()
    top_actors        = serializers.ListField()
    hourly_trend      = serializers.ListField()
    daily_trend       = serializers.ListField()
