"""
accounts/permissions.py
DLMS – Riba & Company Limited

Custom DRF permission classes that map to the RBAC role hierarchy:

    Admin       – full system access
    Finance     – read financial/audit data; export reports
    Operations  – manage data assets, view alerts and logs
    Driver      – view own records only
    Guest       – read-only, non-sensitive data only

Usage in any view:
    from accounts.permissions import IsAdmin, IsAdminOrOperations

    class MyView(APIView):
        permission_classes = [IsAuthenticated, IsAdmin]
"""

from rest_framework.permissions import BasePermission, IsAuthenticated   # noqa: F401


def _role(request, *names):
    """Return True if the authenticated user has any of the given role names."""
    if not request.user or not request.user.is_authenticated:
        return False
    user_role = getattr(request.user.role, "name", None)
    return user_role in names


# ─────────────────────────────────────────────
#  Single-role gates
# ─────────────────────────────────────────────

class IsAdmin(BasePermission):
    """Only ADMIN role users (or Django superusers)."""
    message = "Admin access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN")


class IsFinance(BasePermission):
    """Finance role — plus Admin by default."""
    message = "Finance or Admin access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN", "FINANCE")


class IsOperations(BasePermission):
    """Operations role — plus Admin by default."""
    message = "Operations or Admin access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN", "OPERATIONS")


class IsDriver(BasePermission):
    """Driver role — plus Admin by default."""
    message = "Driver or Admin access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN", "DRIVER")


# ─────────────────────────────────────────────
#  Combined gates (most common combinations)
# ─────────────────────────────────────────────

class IsAdminOrFinance(BasePermission):
    message = "Admin or Finance access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN", "FINANCE")


class IsAdminOrOperations(BasePermission):
    message = "Admin or Operations access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(request, "ADMIN", "OPERATIONS")


class IsAdminOrFinanceOrOperations(BasePermission):
    message = "Admin, Finance, or Operations access required."

    def has_permission(self, request, view):
        return request.user.is_superuser or _role(
            request, "ADMIN", "FINANCE", "OPERATIONS"
        )


class IsAnyAuthenticatedRole(BasePermission):
    """Any user with a valid JWT and an active account."""
    message = "Authentication required."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "status", "ACTIVE") == "ACTIVE"
        )


# ─────────────────────────────────────────────
#  Object-level: owner only
# ─────────────────────────────────────────────

class IsOwnerOrAdmin(BasePermission):
    """
    Object-level permission: allow access if the request user IS the
    object's owner, OR if the user is an Admin / superuser.

    The view must call  self.check_object_permissions(request, obj)
    and the object must have either a `.user`, `.owner`, or `.pk` field.
    """
    message = "You do not have permission to access this resource."

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or _role(request, "ADMIN"):
            return True
        # Check common owner patterns
        if hasattr(obj, "user") and obj.user == request.user:
            return True
        if hasattr(obj, "owner") and obj.owner == request.user:
            return True
        if hasattr(obj, "pk") and obj.pk == request.user.pk:
            return True
        return False


# ─────────────────────────────────────────────
#  Safe-methods gate (read-only for lower roles)
# ─────────────────────────────────────────────

class IsAdminOrReadOnly(BasePermission):
    """
    Admin can do anything.  Everyone else may only use safe HTTP methods
    (GET, HEAD, OPTIONS).
    """
    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
    message = "Write access requires Admin role."

    def has_permission(self, request, view):
        if request.user.is_superuser or _role(request, "ADMIN"):
            return True
        return (
            request.user.is_authenticated
            and request.method in self.SAFE_METHODS
        )
