/**
 * src/components/ProtectedRoute.jsx
 * DLMS – Riba & Company Limited
 *
 * Usage:
 *
 *   // Any authenticated user
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 *
 *   // Admin only
 *   <ProtectedRoute allowedRoles={["ADMIN"]}><UsersPage /></ProtectedRoute>
 *
 *   // Admin or Finance
 *   <ProtectedRoute allowedRoles={["ADMIN","FINANCE"]}><ReportsPage /></ProtectedRoute>
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Full-screen spinner shown while AuthContext resolves the session
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0D2137",
      gap: 16,
    }}>
      {/* Animated logo mark */}
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "linear-gradient(135deg, #C8960C, #E8B420)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "pulse 1.4s ease-in-out infinite",
      }}>
        <span style={{ color: "#0D2137", fontWeight: 900, fontSize: 26 }}>R</span>
      </div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, letterSpacing: "0.08em" }}>
        Verifying session…
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.1); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

// Shown when a user is logged in but doesn't have the required role
function AccessDenied({ requiredRoles }) {
  const { logout } = useAuth();
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#F5F7FA", gap: 16,
    }}>
      <span style={{ fontSize: 48 }}>🔒</span>
      <h2 style={{ margin: 0, color: "#0D2137", fontFamily: "Arial", fontSize: 22 }}>
        Access Denied
      </h2>
      <p style={{ margin: 0, color: "#6B7C93", fontFamily: "Arial", fontSize: 14, textAlign: "center", maxWidth: 340 }}>
        You don't have permission to view this page.
        {requiredRoles?.length
          ? ` Required role: ${requiredRoles.join(" or ")}.`
          : ""}
      </p>
      <button
        onClick={logout}
        style={{
          marginTop: 12,
          padding: "10px 28px",
          background: "#0D2137", color: "#C8960C",
          border: "none", borderRadius: 8,
          fontFamily: "Arial", fontWeight: 700, fontSize: 13,
          cursor: "pointer",
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!isAuthenticated) {
    // Redirect to login, saving the attempted URL for post-login redirect
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <AccessDenied requiredRoles={allowedRoles} />;
  }

  return children;
}
