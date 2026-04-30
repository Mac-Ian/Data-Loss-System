"""
accounts/serializers.py
DLMS – Riba & Company Limited

Serializers for:
  • User registration & profile
  • Login (returns JWT pair)
  • Password change
  • Role & Department (read-only lookups)
  • Token refresh / blacklist wrappers
"""

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import CustomUser, Role, Department


# ─────────────────────────────────────────────
#  Lookup serializers
# ─────────────────────────────────────────────

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Role
        fields = ["id", "name", "description", "permissions"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = ["id", "name", "code"]


# ─────────────────────────────────────────────
#  User profile (read)
# ─────────────────────────────────────────────

class UserProfileSerializer(serializers.ModelSerializer):
    role       = RoleSerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)
    full_name  = serializers.CharField(read_only=True)

    class Meta:
        model  = CustomUser
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "employee_id", "role", "department", "status",
            "phone", "is_mfa_enabled", "last_login_ip",
            "date_joined", "updated_at",
        ]
        read_only_fields = [
            "id", "email", "last_login_ip", "date_joined", "updated_at"
        ]


# ─────────────────────────────────────────────
#  User registration (Admin only)
# ─────────────────────────────────────────────

class UserCreateSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(
        write_only=True, required=True,
        style={"input_type": "password"},
        validators=[validate_password],
    )
    password2 = serializers.CharField(
        write_only=True, required=True,
        style={"input_type": "password"},
        label="Confirm password",
    )
    role_id       = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), source="role", write_only=True
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), source="department",
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model  = CustomUser
        fields = [
            "email", "first_name", "last_name", "employee_id",
            "role_id", "department_id", "phone",
            "password", "password2",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user     = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user


# ─────────────────────────────────────────────
#  User update (Admin — role / status / dept)
# ─────────────────────────────────────────────

class UserUpdateSerializer(serializers.ModelSerializer):
    role_id       = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), source="role", write_only=True, required=False
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), source="department",
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model  = CustomUser
        fields = [
            "first_name", "last_name", "employee_id",
            "role_id", "department_id", "phone", "status",
        ]


# ─────────────────────────────────────────────
#  Login
# ─────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        email    = attrs.get("email", "").lower().strip()
        password = attrs.get("password")

        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=password,
        )

        if not user:
            raise serializers.ValidationError(
                {"detail": "Invalid email or password."}, code="authorization"
            )
        if not user.is_active:
            raise serializers.ValidationError(
                {"detail": "This account has been deactivated."}, code="authorization"
            )
        if user.status == "SUSPENDED":
            raise serializers.ValidationError(
                {"detail": "Account suspended. Contact your administrator."}, code="authorization"
            )

        attrs["user"] = user
        return attrs


class LoginResponseSerializer(serializers.Serializer):
    """Shape of the successful login response."""
    access        = serializers.CharField()
    refresh       = serializers.CharField()
    user          = UserProfileSerializer()
    token_type    = serializers.CharField(default="Bearer")


# ─────────────────────────────────────────────
#  Password change
# ─────────────────────────────────────────────

class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password     = serializers.CharField(
        write_only=True, style={"input_type": "password"},
        validators=[validate_password],
    )
    new_password2    = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password": "Passwords do not match."})
        return attrs

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.failed_logins = 0
        user.save()
        return user


# ─────────────────────────────────────────────
#  Minimal user card (for logs / alerts)
# ─────────────────────────────────────────────

class UserMiniSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)

    class Meta:
        model  = CustomUser
        fields = ["id", "email", "full_name", "role_name", "status"]
