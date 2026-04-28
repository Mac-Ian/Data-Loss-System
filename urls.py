"""
accounts/urls.py
DLMS – Riba & Company Limited
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    DepartmentListView,
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    RoleListView,
    UserActivateView,
    UserDetailView,
    UserListCreateView,
    UserSuspendView,
    UserUpdateView,
)

urlpatterns = [
    # ── Auth ──────────────────────────────────
    path("auth/login/",    LoginView.as_view(),         name="auth-login"),
    path("auth/logout/",   LogoutView.as_view(),        name="auth-logout"),
    path("auth/refresh/",  TokenRefreshView.as_view(),  name="auth-refresh"),
    path("auth/me/",       MeView.as_view(),            name="auth-me"),
    path("auth/password/", PasswordChangeView.as_view(),name="auth-password"),

    # ── Users ─────────────────────────────────
    path("users/",                   UserListCreateView.as_view(), name="user-list-create"),
    path("users/<uuid:pk>/",         UserDetailView.as_view(),     name="user-detail"),
    path("users/<uuid:pk>/update/",  UserUpdateView.as_view(),     name="user-update"),
    path("users/<uuid:pk>/suspend/", UserSuspendView.as_view(),    name="user-suspend"),
    path("users/<uuid:pk>/activate/",UserActivateView.as_view(),   name="user-activate"),

    # ── Lookups ───────────────────────────────
    path("roles/",       RoleListView.as_view(),       name="role-list"),
    path("departments/", DepartmentListView.as_view(), name="department-list"),
]
