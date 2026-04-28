/**
 * src/App.jsx
 * DLMS – Riba & Company Limited
 *
 * Root router — wraps everything in AuthProvider so useAuth()
 * works on every page.  ProtectedRoute guards private pages.
 *
 * Route map:
 *   /login                  → LoginPage          (public)
 *   /                       → Dashboard          (any authenticated)
 *   /users                  → UsersPage          (ADMIN only)
 *   /alerts                 → AlertsPage         (ADMIN, OPERATIONS)
 *   /assets                 → DataAssetsPage     (all authenticated)
 *   /classification         → ClassificationPage (ADMIN, OPERATIONS)
 *   /audit                  → AuditPage          (ADMIN)
 *   /reports                → ReportsPage        (ADMIN, FINANCE)
 *   /monitoring             → MonitoringPage     (ADMIN, OPERATIONS)
 *   /settings               → SettingsPage       (ADMIN)
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Pages — import lazily in a real build; direct imports here for simplicity
import LoginPage   from "./pages/LoginPage";
import Dashboard   from "./pages/Dashboard";

// Placeholder stubs for pages built in later phases
const Placeholder = ({ title }) => (
  <div style={{
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "#F5F7FA", fontFamily: "Arial, sans-serif",
    gap: 12,
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: "linear-gradient(135deg, #C8960C, #E8B420)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: "#0D2137", fontWeight: 900, fontSize: 26 }}>R</span>
    </div>
    <h2 style={{ margin: 0, color: "#0D2137", fontSize: 20 }}>{title}</h2>
    <p style={{ margin: 0, color: "#6B7C93", fontSize: 13 }}>
      This page will be built in an upcoming phase.
    </p>
    <a href="/" style={{ color: "#1A6B8A", fontSize: 13, marginTop: 8 }}>← Back to Dashboard</a>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public ─────────────────────────────── */}
          <Route path="/login" element={<LoginPage />} />

          {/* ── Any authenticated user ──────────────── */}
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }/>

          <Route path="/assets" element={
            <ProtectedRoute>
              <Placeholder title="Data Assets — Phase 3" />
            </ProtectedRoute>
          }/>

          <Route path="/monitoring" element={
            <ProtectedRoute allowedRoles={["ADMIN","OPERATIONS"]}>
              <Placeholder title="Live Monitoring — Phase 4" />
            </ProtectedRoute>
          }/>

          {/* ── Admin + Operations ──────────────────── */}
          <Route path="/alerts" element={
            <ProtectedRoute allowedRoles={["ADMIN","OPERATIONS"]}>
              <Placeholder title="Threat Alerts — Phase 5" />
            </ProtectedRoute>
          }/>

          <Route path="/classification" element={
            <ProtectedRoute allowedRoles={["ADMIN","OPERATIONS"]}>
              <Placeholder title="Classification Engine — Phase 3" />
            </ProtectedRoute>
          }/>

          {/* ── Admin + Finance ─────────────────────── */}
          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={["ADMIN","FINANCE"]}>
              <Placeholder title="Reports — Phase 6" />
            </ProtectedRoute>
          }/>

          {/* ── Admin only ──────────────────────────── */}
          <Route path="/audit" element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Placeholder title="Audit Trail — Phase 6" />
            </ProtectedRoute>
          }/>

          <Route path="/users" element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Placeholder title="Users & RBAC — Phase 7" />
            </ProtectedRoute>
          }/>

          <Route path="/settings" element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Placeholder title="Settings — Phase 8" />
            </ProtectedRoute>
          }/>

          {/* ── Fallback ────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
