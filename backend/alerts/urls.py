"""
alerts/urls.py
DLMS – Riba & Company Limited
"""

from django.urls import path
from .views import (
    AlertAssignView,
    AlertCommentView,
    AlertDetailView,
    AlertEscalateView,
    AlertFalsePositiveView,
    AlertListView,
    AlertResolveView,
    AlertStatsView,
    PolicyDetailView,
    PolicyListCreateView,
)

urlpatterns = [
    # Alert CRUD + stats
    path("alerts/",                           AlertListView.as_view(),          name="alert-list"),
    path("alerts/stats/",                     AlertStatsView.as_view(),         name="alert-stats"),
    path("alerts/<int:pk>/",                  AlertDetailView.as_view(),        name="alert-detail"),

    # Alert actions
    path("alerts/<int:pk>/resolve/",          AlertResolveView.as_view(),       name="alert-resolve"),
    path("alerts/<int:pk>/escalate/",         AlertEscalateView.as_view(),      name="alert-escalate"),
    path("alerts/<int:pk>/assign/",           AlertAssignView.as_view(),        name="alert-assign"),
    path("alerts/<int:pk>/comment/",          AlertCommentView.as_view(),       name="alert-comment"),
    path("alerts/<int:pk>/false-positive/",   AlertFalsePositiveView.as_view(), name="alert-false-positive"),

    # Policies (Admin)
    path("alerts/policies/",                  PolicyListCreateView.as_view(),   name="policy-list"),
    path("alerts/policies/<int:pk>/",         PolicyDetailView.as_view(),       name="policy-detail"),
]
