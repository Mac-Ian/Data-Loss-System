/**
 * src/context/AuthContext.jsx
 * DLMS – Riba & Company Limited
 *
 * Provides:
 *   • login(email, password)   → calls POST /api/auth/login/
 *   • logout()                 → calls POST /api/auth/logout/, clears tokens
 *   • user                     → current user profile object
 *   • role                     → shortcut to user.role.name
 *   • isAuthenticated          → boolean
 *   • loading                  → true while checking stored token on mount
 */

import { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import api from "../services/api";

// ── Shape of auth state
const initialState = {
  user:            null,
  isAuthenticated: false,
  loading:         true,   // true on mount so we can check localStorage
  error:           null,
};

// ── Reducer
function authReducer(state, action) {
  switch (action.type) {
    case "AUTH_LOADING":
      return { ...state, loading: true, error: null };
    case "AUTH_SUCCESS":
      return { user: action.payload, isAuthenticated: true, loading: false, error: null };
    case "AUTH_FAILURE":
      return { user: null, isAuthenticated: false, loading: false, error: action.payload };
    case "AUTH_LOGOUT":
      return { user: null, isAuthenticated: false, loading: false, error: null };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

// ── Context
export const AuthContext = createContext(null);

// ── Provider
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On mount: restore session if access token exists
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        dispatch({ type: "AUTH_FAILURE", payload: null });
        return;
      }
      try {
        const res = await api.get("/auth/me/");
        dispatch({ type: "AUTH_SUCCESS", payload: res.data });
      } catch {
        // Token may be expired — the interceptor in api.js will try a refresh.
        // If it fails, remove stale tokens.
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        dispatch({ type: "AUTH_FAILURE", payload: null });
      }
    };
    restoreSession();
  }, []);

  const login = useCallback(async (email, password) => {
    dispatch({ type: "AUTH_LOADING" });
    try {
      const res = await api.post("/auth/login/", { email, password });
      const { access, refresh, user } = res.data;
      localStorage.setItem("access_token",  access);
      localStorage.setItem("refresh_token", refresh);
      dispatch({ type: "AUTH_SUCCESS", payload: user });
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        "Login failed. Please check your credentials.";
      dispatch({ type: "AUTH_FAILURE", payload: message });
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) await api.post("/auth/logout/", { refresh });
    } catch {
      // Swallow — we clear local state regardless
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      dispatch({ type: "AUTH_LOGOUT" });
    }
  }, []);

  const clearError = useCallback(() => dispatch({ type: "CLEAR_ERROR" }), []);

  const value = {
    ...state,
    role: state.user?.role?.name ?? null,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
