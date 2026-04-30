/**
 * src/pages/LoginPage.jsx
 * DLMS – Riba & Company Limited
 *
 * Enterprise security login — Riba navy/gold palette.
 * Features: animated background grid, live clock, role hint cards,
 * password visibility toggle, loading state, error banner.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ── Brand tokens
const C = {
  navy:      "#0D2137",
  navyLight: "#163352",
  navyMid:   "#1E4470",
  gold:      "#C8960C",
  goldLight: "#E8B420",
  teal:      "#1A6B8A",
  red:       "#C0392B",
  white:     "#F5F7FA",
  muted:     "rgba(255,255,255,0.45)",
  border:    "rgba(255,255,255,0.12)",
};

// ── Demo credentials helper cards
const DEMO_ROLES = [
  { role: "ADMIN",      email: "admin@riba.ug",      pass: "Admin@2024!",    color: C.gold,  icon: "⚡" },
  { role: "FINANCE",    email: "finance@riba.ug",     pass: "Finance@2024!",  color: "#2ECC71", icon: "💼" },
  { role: "OPERATIONS", email: "operations@riba.ug",  pass: "Ops@2024!",      color: C.teal,  icon: "🚛" },
  { role: "DRIVER",     email: "driver01@riba.ug",    pass: "Driver@2024!",   color: "#9B59B6", icon: "🔑" },
];

function ClockBadge() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: C.muted }}>
      {time.toLocaleTimeString("en-GB")} UTC+3
    </span>
  );
}

export default function LoginPage() {
  const { login, loading, error, clearError, isAuthenticated } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const emailRef  = useRef(null);

  const [form,       setForm]       = useState({ email: "", password: "" });
  const [showPass,   setShowPass]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors,setFieldErrors]= useState({});

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      const dest = location.state?.from?.pathname || "/";
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  useEffect(() => { emailRef.current?.focus(); }, []);
  useEffect(() => { if (error) clearError(); }, [form.email, form.password]); // eslint-disable-line

  function validate() {
    const errs = {};
    if (!form.email)    errs.email    = "Email address is required.";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email address.";
    if (!form.password) errs.password = "Password is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await login(form.email.trim().toLowerCase(), form.password);
    setSubmitting(false);
  }

  function fillDemo(email, pass) {
    setForm({ email, password: pass });
    setFieldErrors({});
    clearError();
  }

  const inputStyle = (hasErr) => ({
    width: "100%",
    padding: "13px 16px",
    borderRadius: 8,
    border: `1.5px solid ${hasErr ? C.red : C.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: 14,
    fontFamily: "'Segoe UI', Arial, sans-serif",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  });

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: C.navy,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── Animated background grid */}
      <style>{`
        @keyframes gridMove {
          from { background-position: 0 0; }
          to   { background-position: 40px 40px; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%,100% { opacity: 0.6; }
          50%      { opacity: 1; }
        }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #163352 inset !important;
          -webkit-text-fill-color: #fff !important;
        }
        .dlms-input:focus {
          border-color: #C8960C !important;
          background: rgba(255,255,255,0.09) !important;
        }
        .demo-card:hover {
          background: rgba(255,255,255,0.1) !important;
          border-color: rgba(255,255,255,0.25) !important;
          cursor: pointer;
          transform: translateY(-1px);
        }
        .demo-card { transition: all 0.15s ease; }
        .submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #E8B420, #C8960C) !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(200,150,12,0.4) !important;
        }
        .submit-btn { transition: all 0.18s ease; }
      `}</style>

      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        animation: "gridMove 8s linear infinite",
        pointerEvents: "none",
      }}/>

      {/* ── Glowing accent orb */}
      <div style={{
        position: "absolute",
        top: -120, right: -120,
        width: 500, height: 500,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(200,150,12,0.12) 0%, transparent 70%)`,
        pointerEvents: "none",
      }}/>
      <div style={{
        position: "absolute",
        bottom: -100, left: -100,
        width: 400, height: 400,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(26,107,138,0.14) 0%, transparent 70%)`,
        pointerEvents: "none",
      }}/>

      {/* ── LEFT panel — branding */}
      <div style={{
        flex: 1,
        display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "60px 64px",
        borderRight: `1px solid ${C.border}`,
        animation: "fadeUp 0.6s ease both",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(200,150,12,0.35)",
          }}>
            <span style={{ color: C.navy, fontWeight: 900, fontSize: 24 }}>R</span>
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: "0.02em" }}>
              RIBA & CO.
            </div>
            <div style={{ color: C.gold, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em" }}>
              TRANSPORT & LOGISTICS
            </div>
          </div>
        </div>

        <h1 style={{
          color: "#fff", fontSize: 36, fontWeight: 800,
          margin: "0 0 12px", lineHeight: 1.2,
        }}>
          Data Loss<br/>
          <span style={{ color: C.gold }}>Management</span><br/>
          System
        </h1>
        <p style={{ color: C.muted, fontSize: 15, margin: "0 0 48px", maxWidth: 360, lineHeight: 1.7 }}>
          Enterprise-grade security monitoring, threat detection, and audit compliance
          for Riba & Company Limited.
        </p>

        {/* Feature chips */}
        {[
          { icon: "🛡", label: "Real-Time Threat Detection" },
          { icon: "🗂", label: "L1/L2/L3 Data Classification" },
          { icon: "📋", label: "ISO 27001 Audit Trails" },
          { icon: "👥", label: "Role-Based Access Control" },
        ].map(f => (
          <div key={f.label} style={{
            display: "flex", alignItems: "center", gap: 12,
            marginBottom: 14,
          }}>
            <span style={{
              fontSize: 18, width: 36, height: 36, borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${C.border}`,
            }}>{f.icon}</span>
            <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>{f.label}</span>
          </div>
        ))}

        {/* System status */}
        <div style={{
          marginTop: 40,
          padding: "12px 16px",
          borderRadius: 8,
          background: "rgba(46,204,113,0.08)",
          border: "1px solid rgba(46,204,113,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#2ECC71",
              boxShadow: "0 0 0 3px rgba(46,204,113,0.2)",
              display: "inline-block",
              animation: "shimmer 2s ease-in-out infinite",
            }}/>
            <span style={{ color: "#2ECC71", fontSize: 12, fontWeight: 600 }}>All Systems Operational</span>
          </div>
          <ClockBadge />
        </div>
      </div>

      {/* ── RIGHT panel — login form */}
      <div style={{
        width: 480,
        display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "60px 48px",
        animation: "fadeUp 0.6s ease 0.15s both",
      }}>

        <h2 style={{
          color: "#fff", fontWeight: 800, fontSize: 24,
          margin: "0 0 6px",
        }}>Sign in to DLMS</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 32px" }}>
          Authorised personnel only. All access is monitored and logged.
        </p>

        {/* Global error */}
        {error && (
          <div style={{
            background: "rgba(192,57,43,0.15)",
            border: "1px solid rgba(192,57,43,0.4)",
            borderRadius: 8, padding: "12px 16px",
            color: "#E74C3C", fontSize: 13, marginBottom: 20,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: "0.04em" }}>
              EMAIL ADDRESS
            </label>
            <input
              ref={emailRef}
              type="email"
              className="dlms-input"
              style={inputStyle(fieldErrors.email)}
              placeholder="your.name@riba.ug"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              autoComplete="username"
            />
            {fieldErrors.email && (
              <p style={{ color: "#E74C3C", fontSize: 11, margin: "4px 0 0" }}>{fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: "0.04em" }}>
              PASSWORD
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                className="dlms-input"
                style={{ ...inputStyle(fieldErrors.password), paddingRight: 48 }}
                placeholder="••••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: "absolute", right: 14, top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: C.muted, fontSize: 16, padding: 4,
                }}
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
            {fieldErrors.password && (
              <p style={{ color: "#E74C3C", fontSize: 11, margin: "4px 0 0" }}>{fieldErrors.password}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || loading}
            className="submit-btn"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 8,
              border: "none",
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
              color: C.navy,
              fontWeight: 800, fontSize: 15,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              letterSpacing: "0.02em",
              boxShadow: "0 4px 14px rgba(200,150,12,0.3)",
            }}
          >
            {submitting ? "Authenticating…" : "Sign In Securely"}
          </button>
        </form>

        {/* Demo credentials */}
        <div style={{ marginTop: 32 }}>
          <p style={{ color: C.muted, fontSize: 11, textAlign: "center", margin: "0 0 12px", letterSpacing: "0.04em" }}>
            DEMO ACCOUNTS — click to fill
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DEMO_ROLES.map(d => (
              <div
                key={d.role}
                className="demo-card"
                onClick={() => fillDemo(d.email, d.pass)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>{d.icon}</span>
                <div>
                  <div style={{ color: d.color, fontSize: 11, fontWeight: 700 }}>{d.role}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{d.email.split("@")[0]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security notice */}
        <div style={{
          marginTop: 28,
          padding: "10px 14px",
          borderRadius: 6,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.border}`,
        }}>
          <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.6, textAlign: "center" }}>
            🔒 This system is protected by multi-factor authentication and end-to-end encryption.
            Unauthorised access attempts are logged and reported.
          </p>
        </div>

        <p style={{ color: C.muted, fontSize: 11, textAlign: "center", margin: "20px 0 0" }}>
          DLMS v1.0 · Riba & Company Limited · Final Year Project
        </p>
      </div>
    </div>
  );
}
