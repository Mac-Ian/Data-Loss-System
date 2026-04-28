"""
dlms_backend/urls.py  –  Root URL configuration
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/",   include("accounts.urls")),
    # Phase 3+: path("api/", include("data_classification.urls")),
    # Phase 4+: path("api/", include("monitoring.urls")),
    # Phase 5+: path("api/", include("alerts.urls")),
    # Phase 6+: path("api/", include("audit_logs.urls")),
]
