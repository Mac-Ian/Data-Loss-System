/**
 * src/App.jsx  —  COMPLETE routing (All 8 Phases)
 * DLMS – Riba & Company Limited
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider }     from "./context/AuthContext";
import ProtectedRoute       from "./components/ProtectedRoute";
import LoginPage            from "./pages/LoginPage";
import Dashboard            from "./pages/Dashboard";
import DataAssetsPage       from "./pages/DataAssetsPage";
import LiveMonitoringPage   from "./pages/LiveMonitoringPage";
import AlertsPage           from "./pages/AlertsPage";
import AuditLogPage         from "./pages/AuditLogPage";
import ReportsPage          from "./pages/ReportsPage";
import UsersPage            from "./pages/UsersPage";
import SettingsPage         from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/assets"     element={<ProtectedRoute><DataAssetsPage /></ProtectedRoute>} />
          <Route path="/monitoring" element={<ProtectedRoute allowedRoles={["ADMIN","OPERATIONS"]}><LiveMonitoringPage /></ProtectedRoute>} />
          <Route path="/alerts"     element={<ProtectedRoute allowedRoles={["ADMIN","OPERATIONS"]}><AlertsPage /></ProtectedRoute>} />
          <Route path="/reports"    element={<ProtectedRoute allowedRoles={["ADMIN","FINANCE"]}><ReportsPage /></ProtectedRoute>} />
          <Route path="/audit"      element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditLogPage /></ProtectedRoute>} />
          <Route path="/users"      element={<ProtectedRoute allowedRoles={["ADMIN"]}><UsersPage /></ProtectedRoute>} />
          <Route path="/settings"   element={<ProtectedRoute allowedRoles={["ADMIN"]}><SettingsPage /></ProtectedRoute>} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
