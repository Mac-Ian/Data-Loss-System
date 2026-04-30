"""
data_classification/views.py
DLMS – Riba & Company Limited

Endpoints:

  Assets
    GET   /api/assets/                    → DataAssetListView
    POST  /api/assets/                    → DataAssetCreateView
    GET   /api/assets/{id}/               → DataAssetDetailView
    DELETE /api/assets/{id}/              → DataAssetDeleteView
    POST  /api/assets/{id}/classify/      → ManualReclassifyView
    POST  /api/assets/classify-preview/   → ClassifyPreviewView

  Classification Rules (Admin)
    GET   /api/classification/rules/      → RuleListView
    POST  /api/classification/rules/      → RuleCreateView
    PATCH /api/classification/rules/{id}/ → RuleUpdateView
    DELETE /api/classification/rules/{id}/→ RuleDeleteView

  Scan History
    GET   /api/assets/{id}/scans/         → AssetScanHistoryView
"""

import logging

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters import rest_framework as filters

from accounts.models import AuditTrail, DataAsset
from accounts.permissions import IsAdmin, IsAdminOrOperations, IsAnyAuthenticatedRole
from .classifier import classify_asset, classify_text
from .models import ClassificationRule, ClassificationScan
from .serializers import (
    ClassificationRuleSerializer,
    ClassificationScanSerializer,
    ClassifyPreviewSerializer,
    DataAssetCreateSerializer,
    DataAssetDetailSerializer,
    DataAssetListSerializer,
    ReclassifySerializer,
)

logger = logging.getLogger("dlms.classification")


def _audit(event, actor, description, asset=None, request=None):
    try:
        AuditTrail.objects.create(
            event_type  = event,
            actor       = actor,
            data_asset  = asset,
            description = description,
            ip_address  = (
                (request.META.get("HTTP_X_FORWARDED_FOR") or
                 request.META.get("REMOTE_ADDR"))
                if request else None
            ),
        )
    except Exception as exc:
        logger.error("Audit write failed: %s", exc)


# ─────────────────────────────────────────────
#  Filters
# ─────────────────────────────────────────────

class DataAssetFilter(filters.FilterSet):
    classification = filters.ChoiceFilter(choices=[("L1","General"),("L2","Internal"),("L3","Confidential")])
    status         = filters.ChoiceFilter(choices=[("ACTIVE","Active"),("ARCHIVED","Archived"),("QUARANTINE","Quarantined")])
    department     = filters.NumberFilter(field_name="department__id")
    owner          = filters.UUIDFilter(field_name="owner__id")
    is_encrypted   = filters.BooleanFilter()

    class Meta:
        model  = DataAsset
        fields = ["classification", "status", "department", "owner", "is_encrypted"]


# ─────────────────────────────────────────────
#  Asset views
# ─────────────────────────────────────────────

class DataAssetListView(generics.ListAPIView):
    """
    GET /api/assets/
    Returns paginated list of data assets. Supports filtering, search, ordering.
    """
    permission_classes = [IsAuthenticated, IsAnyAuthenticatedRole]
    serializer_class   = DataAssetListSerializer
    filterset_class    = DataAssetFilter
    search_fields      = ["name", "description", "tags"]
    ordering_fields    = ["created_at", "name", "classification", "file_size_bytes"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        qs = DataAsset.objects.select_related("owner", "department").exclude(status="DELETED")
        user = self.request.user
        role = getattr(user.role, "name", None)

        # Drivers only see their own assets
        if role == "DRIVER":
            qs = qs.filter(owner=user)
        # Finance only sees L2 + L3 (non-general)
        elif role == "FINANCE":
            qs = qs.filter(classification__in=["L2", "L3"])

        return qs


class DataAssetCreateView(generics.CreateAPIView):
    """
    POST /api/assets/
    Upload a file or register a data asset. Auto-classifies on creation.
    """
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = DataAssetCreateSerializer
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        asset = serializer.save()

        # Auto-classify immediately
        try:
            classify_asset(asset, triggered_by=self.request.user, trigger="UPLOAD")
        except Exception as exc:
            logger.error("Auto-classify failed for asset %s: %s", asset.pk, exc)

        _audit(
            "DATA_CREATE", self.request.user,
            f"Asset registered: '{asset.name}' [{asset.classification}]",
            asset=asset, request=self.request,
        )
        logger.info("ASSET_CREATE | user=%s | asset=%s | classification=%s",
                    self.request.user.email, asset.name, asset.classification)


class DataAssetDetailView(generics.RetrieveAPIView):
    """GET /api/assets/{id}/"""
    permission_classes = [IsAuthenticated, IsAnyAuthenticatedRole]
    serializer_class   = DataAssetDetailSerializer
    queryset           = DataAsset.objects.select_related("owner", "department")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        _audit("DATA_READ", request.user, f"Viewed asset: {instance.name}",
               asset=instance, request=request)
        return super().retrieve(request, *args, **kwargs)


class DataAssetDeleteView(generics.DestroyAPIView):
    """DELETE /api/assets/{id}/ — soft delete (sets status=DELETED)"""
    permission_classes = [IsAuthenticated, IsAdmin]
    queryset           = DataAsset.objects.all()

    def perform_destroy(self, instance):
        instance.status = "DELETED"
        instance.save(update_fields=["status", "updated_at"])
        _audit("DATA_DELETE", self.request.user,
               f"Asset soft-deleted: '{instance.name}'",
               asset=instance, request=self.request)


class ManualReclassifyView(APIView):
    """
    POST /api/assets/{pk}/classify/
    Admin manually sets or overrides classification.
    Body: { "classification": "L3", "notes": "..." }
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            asset = DataAsset.objects.get(pk=pk)
        except DataAsset.DoesNotExist:
            return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ReclassifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        level_before = asset.classification
        level_after  = serializer.validated_data["classification"]
        notes        = serializer.validated_data.get("notes", "")

        asset.classification = level_after
        asset.save(update_fields=["classification", "updated_at"])

        # Write scan record
        scan = ClassificationScan.objects.create(
            asset        = asset,
            triggered_by = request.user,
            trigger      = "MANUAL",
            level_before = level_before,
            level_after  = level_after,
            confidence   = 1.0,
            matched_terms= ["manual override"],
            scan_notes   = notes,
        )

        _audit("DATA_CLASSIFY", request.user,
               f"Manual reclassify: '{asset.name}' {level_before}→{level_after}. {notes}",
               asset=asset, request=request)

        return Response({
            "detail": f"Asset reclassified from {level_before} to {level_after}.",
            "scan":   ClassificationScanSerializer(scan).data,
        })


class ClassifyPreviewView(APIView):
    """
    POST /api/assets/classify-preview/
    Stateless — returns classification result without saving.
    Body: { "text": "...", "filename": "...", "mime_type": "..." }
    """
    permission_classes = [IsAuthenticated, IsAdminOrOperations]

    def post(self, request):
        serializer = ClassifyPreviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        result = classify_text(
            text      = serializer.validated_data.get("text", ""),
            filename  = serializer.validated_data.get("filename", ""),
            mime_type = serializer.validated_data.get("mime_type", ""),
        )
        return Response(result)


# ─────────────────────────────────────────────
#  Classification Rules (Admin)
# ─────────────────────────────────────────────

class RuleListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/classification/rules/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = ClassificationRuleSerializer
    queryset           = ClassificationRule.objects.select_related("created_by")
    ordering           = ["priority", "name"]

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        _audit("SYS_CONFIG", self.request.user,
               f"Classification rule created: '{rule.name}' → {rule.level}",
               request=self.request)


class RuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/classification/rules/{id}/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class   = ClassificationRuleSerializer
    queryset           = ClassificationRule.objects.all()
    http_method_names  = ["get", "patch", "delete"]

    def perform_update(self, serializer):
        rule = serializer.save()
        _audit("SYS_CONFIG", self.request.user,
               f"Classification rule updated: '{rule.name}'", request=self.request)

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        _audit("SYS_CONFIG", self.request.user,
               f"Classification rule deleted: '{name}'", request=self.request)


# ─────────────────────────────────────────────
#  Scan History
# ─────────────────────────────────────────────

class AssetScanHistoryView(generics.ListAPIView):
    """GET /api/assets/{pk}/scans/"""
    permission_classes = [IsAuthenticated, IsAdminOrOperations]
    serializer_class   = ClassificationScanSerializer

    def get_queryset(self):
        return ClassificationScan.objects.filter(
            asset__pk=self.kwargs["pk"]
        ).select_related("rule_fired", "triggered_by").order_by("-scanned_at")
