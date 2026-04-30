"""
data_classification/urls.py
DLMS – Riba & Company Limited
"""

from django.urls import path
from .views import (
    AssetScanHistoryView,
    ClassifyPreviewView,
    DataAssetCreateView,
    DataAssetDeleteView,
    DataAssetDetailView,
    DataAssetListView,
    ManualReclassifyView,
    RuleDetailView,
    RuleListCreateView,
)

urlpatterns = [
    # Assets
    path("assets/",                           DataAssetListView.as_view(),    name="asset-list"),
    path("assets/create/",                    DataAssetCreateView.as_view(),  name="asset-create"),
    path("assets/classify-preview/",          ClassifyPreviewView.as_view(),  name="classify-preview"),
    path("assets/<uuid:pk>/",                 DataAssetDetailView.as_view(),  name="asset-detail"),
    path("assets/<uuid:pk>/delete/",          DataAssetDeleteView.as_view(),  name="asset-delete"),
    path("assets/<uuid:pk>/classify/",        ManualReclassifyView.as_view(), name="asset-classify"),
    path("assets/<uuid:pk>/scans/",           AssetScanHistoryView.as_view(), name="asset-scans"),

    # Classification rules
    path("classification/rules/",             RuleListCreateView.as_view(),   name="rule-list-create"),
    path("classification/rules/<int:pk>/",    RuleDetailView.as_view(),       name="rule-detail"),
]
