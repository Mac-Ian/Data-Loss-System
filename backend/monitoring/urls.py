"""
monitoring/urls.py
DLMS – Riba & Company Limited
"""

from django.urls import path
from .views import (
    AccessLogListView,
    BehaviorProfileListView,
    LiveEventStreamView,
    MonitoringRuleDetailView,
    MonitoringRuleListView,
    MonitoringStatsView,
    ThreatEventListView,
)

urlpatterns = [
    path("monitoring/events/",         ThreatEventListView.as_view(),    name="threat-events"),
    path("monitoring/events/stats/",   MonitoringStatsView.as_view(),    name="monitoring-stats"),
    path("monitoring/logs/",           AccessLogListView.as_view(),      name="access-logs"),
    path("monitoring/rules/",          MonitoringRuleListView.as_view(), name="monitoring-rules"),
    path("monitoring/rules/<int:pk>/", MonitoringRuleDetailView.as_view(),name="monitoring-rule-detail"),
    path("monitoring/profiles/",       BehaviorProfileListView.as_view(),name="behavior-profiles"),
    path("monitoring/live/",           LiveEventStreamView.as_view(),    name="monitoring-live"),
]
