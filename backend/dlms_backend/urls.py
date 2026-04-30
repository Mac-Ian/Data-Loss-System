"""
dlms_backend/urls.py  —  Root URL configuration  (Phase 6 — complete)
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/",   include("accounts.urls")),
    path("api/",   include("data_classification.urls")),
    path("api/",   include("monitoring.urls")),
    path("api/",   include("alerts.urls")),
    path("api/",   include("audit_logs.urls")),
]
