"""
accounts/views.py
DLMS – Riba & Company Limited

API endpoints:

  Auth
    POST  /api/auth/login/         → LoginView
    POST  /api/auth/logout/        → LogoutView
    POST  /api/auth/refresh/       → TokenRefreshView (simplejwt)
    GET   /api/auth/me/            → MeView
    POST  /api/auth/password/      → PasswordChangeView

  Users (Admin only)
    GET   /api/users/              → UserListView
    POST  /api/users/              → UserCreateView (same URL, different method)
    GET   /api/users/{id}/         → UserDetailView
    PATCH /api/users/{id}/         → UserUpdateView
    POST  /api/users/{id}/suspend/ → UserSuspendView
    POST  /api/users/{id}/activate/→ UserActivateView

  Lookups
    GET   /api/roles/              → RoleListView
    GET   /api/departments/        → DepartmentListView
"""

import logging

from django.contrib.auth import login as auth_login, logout as auth_logout
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView  # re-exported

from .models import AuditTrail, CustomUser, Department, Role
from .permissions import IsAdmin, IsAdminOrFinanceOrOperations
from .serializers import (
    DepartmentSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    RoleSerializer,
    UserCreateSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
)

logger = logging.getLogger("dlms.auth")


def _write_audit(event_type, actor, description, request=None, **kwargs):
    """Helper to write an AuditTrail entry without boilerplate."""
    try:
        AuditTrail.objects.create(
            event_type  = event_type,
            actor       = actor,
            description = description,
            ip_address  = _get_ip(request) if request else None,
            user_agent  = (request.META.get("HTTP_USER_AGENT", "")[:500]
                           if request else ""),
            **kwargs,
        )
    except Exception as exc:
        logger.error("AuditTrail write failed: %s", exc)


def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


# ─────────────────────────────────────────────
#  AUTH VIEWS
# ─────────────────────────────────────────────

class LoginView(APIView):
    """
    POST /api/auth/login/
    Body: { "email": "...", "password": "..." }
    Returns: { access, refresh, user, token_type }
    """
    permission_classes = [AllowAny]
    serializer_class   = LoginSerializer

    def post(self, request):
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            # Log failed attempt
            email = request.data.get("email", "unknown")
            logger.warning("Failed login attempt for email=%s ip=%s", email, _get_ip(request))

            # Try to increment failed_logins on the real user
            try:
                user = CustomUser.objects.get(email__iexact=email)
                user.failed_logins += 1
                user.save(update_fields=["failed_logins"])
                _write_audit("AUTH_FAIL", user, f"Failed login attempt from {_get_ip(request)}", request)
            except CustomUser.DoesNotExist:
                pass

            return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)

        user = serializer.validated_data["user"]

        # Reset failed login counter on success
        user.failed_logins   = 0
        user.last_login_ip   = _get_ip(request)
        user.save(update_fields=["failed_logins", "last_login_ip"])

        # Generate JWT pair
        refresh = RefreshToken.for_user(user)
        access  = refresh.access_token

        _write_audit("AUTH_LOGIN", user, f"Successful login from {_get_ip(request)}", request)
        logger.info("LOGIN | user=%s | ip=%s", user.email, _get_ip(request))

        return Response({
            "access":     str(access),
            "refresh":    str(refresh),
            "token_type": "Bearer",
            "user":       UserProfileSerializer(user, context={"request": request}).data,
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Body: { "refresh": "<refresh_token>" }
    Blacklists the refresh token so it can't be reused.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data.get("refresh"))
            token.blacklist()
            _write_audit("AUTH_LOGOUT", request.user, "User logged out", request)
            logger.info("LOGOUT | user=%s", request.user.email)
            return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.warning("Logout error for user=%s: %s", request.user.email, exc)
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/auth/me/
    Returns the authenticated user's full profile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={"request": request})
        return Response(serializer.data)


class PasswordChangeView(APIView):
    """
    POST /api/auth/password/
    Body: { current_password, new_password, new_password2 }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        _write_audit("AUTH_PASSWORD", request.user, "Password changed successfully", request)
        logger.info("PASSWORD_CHANGE | user=%s", request.user.email)
        return Response({"detail": "Password updated successfully."})


# ─────────────────────────────────────────────
#  USER MANAGEMENT (Admin only)
# ─────────────────────────────────────────────

class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/users/   → list all users (paginated, filterable)
    POST /api/users/   → create a new user
    """
    permission_classes   = [IsAuthenticated, IsAdmin]
    queryset             = CustomUser.objects.select_related("role", "department").order_by("-date_joined")
    filter_fields        = ["role__name", "department", "status"]
    search_fields        = ["email", "first_name", "last_name", "employee_id"]
    ordering_fields      = ["date_joined", "last_name", "email"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserProfileSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        _write_audit(
            "USER_CREATE", self.request.user,
            f"Created user account: {user.email} with role {getattr(user.role, 'name', 'N/A')}",
            self.request, target_user=user,
        )
        logger.info("USER_CREATE | admin=%s | new_user=%s", self.request.user.email, user.email)


class UserDetailView(generics.RetrieveAPIView):
    """GET /api/users/{id}/"""
    permission_classes = [IsAuthenticated, IsAdminOrFinanceOrOperations]
    queryset           = CustomUser.objects.select_related("role", "department")
    serializer_class   = UserProfileSerializer


class UserUpdateView(generics.UpdateAPIView):
    """PATCH /api/users/{id}/"""
    permission_classes = [IsAuthenticated, IsAdmin]
    queryset           = CustomUser.objects.all()
    serializer_class   = UserUpdateSerializer
    http_method_names  = ["patch"]

    def perform_update(self, serializer):
        old_role   = serializer.instance.role
        user       = serializer.save()
        new_role   = user.role
        role_changed = old_role != new_role

        event = "ROLE_ASSIGN" if role_changed else "USER_UPDATE"
        desc  = (
            f"Role changed: {getattr(old_role,'name','None')} → {getattr(new_role,'name','None')}"
            if role_changed else f"User profile updated: {user.email}"
        )
        _write_audit(event, self.request.user, desc, self.request, target_user=user)


class UserSuspendView(APIView):
    """POST /api/users/{pk}/suspend/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            user = CustomUser.objects.get(pk=pk)
        except CustomUser.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user == request.user:
            return Response({"detail": "You cannot suspend your own account."}, status=status.HTTP_400_BAD_REQUEST)

        user.status = "SUSPENDED"
        user.save(update_fields=["status"])
        _write_audit("USER_SUSPEND", request.user, f"Suspended user: {user.email}", request, target_user=user)
        return Response({"detail": f"{user.full_name} has been suspended."})


class UserActivateView(APIView):
    """POST /api/users/{pk}/activate/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            user = CustomUser.objects.get(pk=pk)
        except CustomUser.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user.status        = "ACTIVE"
        user.failed_logins = 0
        user.save(update_fields=["status", "failed_logins"])
        _write_audit("USER_UPDATE", request.user, f"Activated user: {user.email}", request, target_user=user)
        return Response({"detail": f"{user.full_name} has been activated."})


# ─────────────────────────────────────────────
#  LOOKUP VIEWS
# ─────────────────────────────────────────────

class RoleListView(generics.ListAPIView):
    """GET /api/roles/"""
    permission_classes = [IsAuthenticated]
    queryset           = Role.objects.all()
    serializer_class   = RoleSerializer
    pagination_class   = None   # return full list (small dataset)


class DepartmentListView(generics.ListAPIView):
    """GET /api/departments/"""
    permission_classes = [IsAuthenticated]
    queryset           = Department.objects.all()
    serializer_class   = DepartmentSerializer
    pagination_class   = None
