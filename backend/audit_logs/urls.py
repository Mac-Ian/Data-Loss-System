"""
audit_logs/urls.py
DLMS – Riba & Company Limited
"""

from django.urls import path
from .views import (
    AuditExportView,
    AuditSummaryView,
    AuditTrailListView,
    SecurityReportView,
)

urlpatterns = [
    path("audit/",               AuditTrailListView.as_view(), name="audit-list"),
    path("audit/summary/",       AuditSummaryView.as_view(),   name="audit-summary"),
    path("audit/export/",        AuditExportView.as_view(),    name="audit-export"),
    path("audit/security-report/",SecurityReportView.as_view(),name="security-report"),
]
