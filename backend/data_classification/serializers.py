"""
data_classification/serializers.py
DLMS – Riba & Company Limited
"""

from rest_framework import serializers
from accounts.models import DataAsset
from accounts.serializers import UserMiniSerializer, DepartmentSerializer
from .models import ClassificationRule, ClassificationScan


class ClassificationRuleSerializer(serializers.ModelSerializer):
    level_label    = serializers.CharField(source="get_level_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model  = ClassificationRule
        fields = [
            "id", "name", "description", "level", "level_label",
            "priority", "keywords", "regex_pattern", "file_extensions",
            "mime_types", "is_active", "auto_encrypt", "notify_admin",
            "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class DataAssetListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the asset table."""
    classification_label = serializers.CharField(source="get_classification_display", read_only=True)
    owner_name           = serializers.CharField(source="owner.full_name",  read_only=True)
    department_name      = serializers.CharField(source="department.name",  read_only=True)
    file_size_kb         = serializers.SerializerMethodField()

    class Meta:
        model  = DataAsset
        fields = [
            "id", "name", "description", "classification", "classification_label",
            "status", "mime_type", "file_size_kb", "tags", "is_encrypted",
            "owner", "owner_name", "department", "department_name",
            "retention_days", "expires_at", "created_at", "updated_at",
        ]

    def get_file_size_kb(self, obj):
        if obj.file_size_bytes:
            return round(obj.file_size_bytes / 1024, 1)
        return 0


class DataAssetDetailSerializer(DataAssetListSerializer):
    """Full serializer including scan history."""
    owner      = UserMiniSerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)
    scans      = serializers.SerializerMethodField()

    class Meta(DataAssetListSerializer.Meta):
        fields = DataAssetListSerializer.Meta.fields + ["file_path", "checksum_sha256", "scans"]

    def get_scans(self, obj):
        qs = obj.scans.select_related("rule_fired", "triggered_by").order_by("-scanned_at")[:10]
        return ClassificationScanSerializer(qs, many=True).data


class DataAssetCreateSerializer(serializers.ModelSerializer):
    """Used for asset upload / registration."""
    file = serializers.FileField(write_only=True, required=False)

    class Meta:
        model  = DataAsset
        fields = [
            "name", "description", "tags", "department",
            "retention_days", "expires_at", "file",
        ]

    def create(self, validated_data):
        import hashlib, os
        from django.conf import settings

        file_obj = validated_data.pop("file", None)
        request  = self.context.get("request")

        asset = DataAsset(**validated_data)
        asset.owner = request.user if request else None

        if file_obj:
            asset.mime_type       = getattr(file_obj, "content_type", "")
            asset.file_size_bytes = file_obj.size

            # Save file to media/assets/
            upload_dir = os.path.join(settings.MEDIA_ROOT, "assets")
            os.makedirs(upload_dir, exist_ok=True)
            safe_name = file_obj.name.replace(" ", "_")
            dest_path = os.path.join(upload_dir, safe_name)

            sha = hashlib.sha256()
            with open(dest_path, "wb") as fh:
                for chunk in file_obj.chunks():
                    sha.update(chunk)
                    fh.write(chunk)

            asset.file_path       = dest_path
            asset.checksum_sha256 = sha.hexdigest()
            asset.name            = asset.name or file_obj.name

        asset.save()
        return asset


class ClassificationScanSerializer(serializers.ModelSerializer):
    level_before_label = serializers.SerializerMethodField()
    level_after_label  = serializers.SerializerMethodField()
    rule_name          = serializers.CharField(source="rule_fired.name", read_only=True)
    triggered_by_name  = serializers.CharField(source="triggered_by.full_name", read_only=True)

    class Meta:
        model  = ClassificationScan
        fields = [
            "id", "trigger", "rule_name",
            "level_before", "level_before_label",
            "level_after",  "level_after_label",
            "confidence", "matched_terms", "scan_notes",
            "triggered_by_name", "scanned_at",
        ]

    def get_level_before_label(self, obj):
        return {"L1": "General", "L2": "Internal", "L3": "Confidential"}.get(obj.level_before, "—")

    def get_level_after_label(self, obj):
        return {"L1": "General", "L2": "Internal", "L3": "Confidential"}.get(obj.level_after, "—")


class ClassifyPreviewSerializer(serializers.Serializer):
    """Body of POST /api/assets/classify-preview/ — stateless text scan."""
    text      = serializers.CharField(required=False, allow_blank=True)
    filename  = serializers.CharField(required=False, allow_blank=True)
    mime_type = serializers.CharField(required=False, allow_blank=True)


class ReclassifySerializer(serializers.Serializer):
    """Body of POST /api/assets/{id}/classify/ — manual override."""
    classification = serializers.ChoiceField(choices=["L1", "L2", "L3"])
    notes          = serializers.CharField(required=False, allow_blank=True)
