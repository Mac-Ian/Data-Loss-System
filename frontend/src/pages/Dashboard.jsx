import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";

// ─── Riba color palette (derived from transport/logistics brand conventions)
// Primary navy: #0D2137  Secondary gold: #C8960C  Accent: #1A6B8A
const RIBA = {
  navy:       "#0D2137",
  navyLight:  "#163352",
  navyMid:    "#1E4470",
  gold:       "#C8960C",
  goldLight:  "#E8B420",
  teal:       "#1A6B8A",
  tealLight:  "#2590B5",
  red:        "#C0392B",
  orange:     "#D35400",
  green:      "#1E8449",
  white:      "#F5F7FA",
  surface:    "#FFFFFF",
  border:     "#DEE4EC",
  textMuted:  "#6B7C93",
  textDark:   "#0D2137",
};

// ─── Mock data
const threatTrendData = [
  { day: "Mon", alerts: 4,  blocked: 1 },
  { day: "Tue", alerts: 7,  blocked: 3 },
  { day: "Wed", alerts: 3,  blocked: 1 },
  { day: "Thu", alerts: 9,  blocked: 5 },
  { day: "Fri", alerts: 12, blocked: 7 },
  { day: "Sat", alerts: 2,  blocked: 0 },
  { day: "Sun", alerts: 5,  blocked: 2 },
];

const accessVolumeData = [
  { hour: "00",  accesses: 12 },
  { hour: "04",  accesses: 5  },
  { hour: "08",  accesses: 88 },
  { hour: "10",  accesses: 142},
  { hour: "12",  accesses: 97 },
  { hour: "14",  accesses: 165},
  { hour: "16",  accesses: 130},
  { hour: "18",  accesses: 60 },
  { hour: "20",  accesses: 28 },
  { hour: "22",  accesses: 18 },
];

const classificationData = [
  { name: "Confidential", value: 23, color: RIBA.red },
  { name: "Internal",     value: 156, color: RIBA.gold },
  { name: "General",      value: 312, color: RIBA.green },
];

const recentAlerts = [
  { id: 1, type: "Bulk Download",       user: "K. Mutumba",  time: "2 min ago",  severity: "HIGH",     status: "OPEN" },
  { id: 2, type: "Off-Hours Access",    user: "P. Nakato",   time: "14 min ago", severity: "MEDIUM",   status: "INVESTIGATING" },
  { id: 3, type: "Repeated Auth Fail",  user: "J. Okello",   time: "31 min ago", severity: "HIGH",     status: "OPEN" },
  { id: 4, type: "Classification Breach",user: "M. Atim",   time: "1 hr ago",   severity: "CRITICAL", status: "OPEN" },
  { id: 5, type: "Impossible Travel",   user: "D. Ssali",    time: "2 hr ago",   severity: "MEDIUM",   status: "RESOLVED" },
];

const auditRows = [
  { ts: "08:42:17", actor: "admin@riba.ug",     event: "USER_CREATE",   target: "New driver account",       ip: "197.157.8.44"  },
  { ts: "09:15:03", actor: "finance@riba.ug",   event: "DATA_READ",     target: "Q3_Payroll_Confidential",  ip: "197.157.8.12"  },
  { ts: "09:51:29", actor: "ops@riba.ug",       event: "DATA_CLASSIFY", target: "Fleet_Routes.xlsx",         ip: "197.157.8.19"  },
  { ts: "10:22:44", actor: "driver04@riba.ug",  event: "AUTH_LOGIN",    target: "Mobile App",               ip: "41.74.12.9"    },
  { ts: "11:04:01", actor: "admin@riba.ug",     event: "ALERT_RESOLVED",target: "ALT-20240512-003",         ip: "197.157.8.44"  },
  { ts: "11:38:55", actor: "finance@riba.ug",   event: "SYS_EXPORT",    target: "Monthly Risk Report",      ip: "197.157.8.12"  },
];

// ─── Severity badge
const SeverityBadge = ({ severity }) => {
  const map = {
    CRITICAL: { bg: "#FDE8E8", text: "#7B0000", border: "#F5AEAE" },
    HIGH:     { bg: "#FEF0E6", text: "#7A2800", border: "#FBCAA3" },
    MEDIUM:   { bg: "#FEF9E7", text: "#7D5A00", border: "#F9E49B" },
    LOW:      { bg: "#EBF5EB", text: "#145214", border: "#A9D6A9" },
  };
  const s = map[severity] || map.LOW;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.03em",
      padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`
    }}>
      {severity}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    OPEN:          { bg: "#FEE2E2", text: "#991B1B" },
    INVESTIGATING: { bg: "#FEF3C7", text: "#92400E" },
    RESOLVED:      { bg: "#D1FAE5", text: "#065F46" },
    FALSE_POSITIVE:{ bg: "#E0E7FF", text: "#3730A3" },
  };
  const s = map[status] || {};
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.text
    }}>
      {status.replace("_", " ")}
    </span>
  );
};

// ─── Stat card
const StatCard = ({ label, value, sub, color, icon }) => (
  <div style={{
    background: RIBA.surface,
    border: `1px solid ${RIBA.border}`,
    borderRadius: 10,
    padding: "20px 22px",
    borderTop: `3px solid ${color}`,
    display: "flex", flexDirection: "column", gap: 6,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ fontSize: 12, color: RIBA.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 22 }}>{icon}</span>
    </div>
    <span style={{ fontSize: 30, fontWeight: 700, color: RIBA.textDark, lineHeight: 1 }}>{value}</span>
    {sub && <span style={{ fontSize: 12, color: RIBA.textMuted }}>{sub}</span>}
  </div>
);

// ─── Sidebar nav item
const NavItem = ({ icon, label, active, onClick, badge }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 18px",
      borderRadius: 8,
      cursor: "pointer",
      background: active ? "rgba(200,150,12,0.15)" : "transparent",
      borderLeft: active ? `3px solid ${RIBA.gold}` : "3px solid transparent",
      color: active ? RIBA.goldLight : "rgba(255,255,255,0.72)",
      fontWeight: active ? 600 : 400,
      fontSize: 13.5,
      transition: "all 0.15s ease",
      marginBottom: 2,
    }}
  >
    <span style={{ fontSize: 17, minWidth: 20, textAlign: "center" }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        background: RIBA.red, color: "#fff",
        borderRadius: 10, fontSize: 10, fontWeight: 700,
        padding: "1px 6px", minWidth: 18, textAlign: "center"
      }}>{badge}</span>
    )}
  </div>
);

// ─── Riba Logo Mark (shark fin + transport motif)
const RibaLogoMark = ({ size = 42 }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" rx="10" fill="#FFFFFF"/>
    {/* shark fin */}
    <path d="M40 6 C44 6,58 15,63 32 L50 32 C48 23,44 14,40 6Z" fill="#1A8BA8"/>
    <path d="M40 6 C36 6,28 16,27 32 L50 32 C48 23,44 14,40 6Z" fill="#1B3A6B"/>
    {/* road */}
    <rect x="12" y="50" width="56" height="3" rx="1.5" fill="#1A8BA8"/>
    <rect x="8"  y="54" width="64" height="2" rx="1"   fill="#1B3A6B" opacity="0.45"/>
    {/* car */}
    <rect x="14" y="40" width="20" height="10" rx="2.5" fill="#1B3A6B"/>
    <rect x="17" y="35" width="13" height="7"  rx="2"   fill="#1A8BA8"/>
    <circle cx="18" cy="51" r="3.5" fill="#163260"/>
    <circle cx="30" cy="51" r="3.5" fill="#163260"/>
    {/* truck */}
    <rect x="42" y="38" width="24" height="12" rx="2" fill="#1B3A6B"/>
    <rect x="42" y="34" width="9"  height="7"  rx="2" fill="#1A8BA8"/>
    <circle cx="47" cy="51" r="3.5" fill="#163260"/>
    <circle cx="61" cy="51" r="3.5" fill="#163260"/>
    {/* swoosh */}
    <path d="M10 57 Q40 63 70 57" stroke="#1A8BA8" strokeWidth="2"
      fill="none" strokeLinecap="round" opacity="0.55"/>
  </svg>
);

// ─── MAIN DASHBOARD
export default function DLMSDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, role } = useAuth();
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Map route paths to nav item IDs
  const routeToId = {
    "/": "dashboard",
    "/assets": "data",
    "/monitoring": "monitoring",
    "/alerts": "alerts",
    "/reports": "reports",
    "/audit": "audit",
    "/users": "users",
    "/settings": "settings",
  };

  // Sync activePage with current route
  useEffect(() => {
    const id = routeToId[location.pathname];
    if (id) setActivePage(id);
  }, [location.pathname]);

  // Handle nav clicks - navigate to actual routes
  const handleNavClick = (itemId) => {
    setActivePage(itemId);
    const routeMap = {
      dashboard: "/",
      monitoring: "/monitoring",
      alerts: "/alerts",
      data: "/assets",
      classification: "/assets", // Classification is part of assets page
      users: "/users",
      audit: "/audit",
      reports: "/reports",
      settings: "/settings",
    };
    navigate(routeMap[itemId] || "/");
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const navItems = [
    { id: "dashboard",       icon: "⬛", label: "Dashboard",             badge: null, path: "/" },
    { id: "monitoring",      icon: "📡", label: "Live Monitoring",        badge: "4", path: "/monitoring" },
    { id: "alerts",          icon: "🔔", label: "Threat Alerts",          badge: "3", path: "/alerts" },
    { id: "data",            icon: "🗂", label: "Data Assets",            badge: null, path: "/assets" },
    { id: "classification",  icon: "🏷", label: "Classification Engine",  badge: null, path: "/assets" },
    { id: "users",           icon: "👥", label: "Users & RBAC",           badge: null, path: "/users" },
    { id: "audit",           icon: "📋", label: "Audit Logs",             badge: null, path: "/audit" },
    { id: "reports",         icon: "📊", label: "Reports",                badge: null, path: "/reports" },
    { id: "settings",        icon: "⚙️", label: "Settings",               badge: null, path: "/settings" },
  ];

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      background: RIBA.white, color: RIBA.textDark,
    }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: sidebarOpen ? 240 : 64,
        minHeight: "100vh",
        background: RIBA.navy,
        display: "flex", flexDirection: "column",
        transition: "width 0.2s ease",
        overflow: "hidden",
        boxShadow: "2px 0 12px rgba(0,0,0,0.18)",
        flexShrink: 0,
      }}>
        {/* Logo area */}
        <div style={{
          padding: "14px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", gap: 10,
          minHeight: 72,
        }}>
          <RibaLogoMark size={42} />
          {sidebarOpen && (
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, lineHeight: 1.15 }}>
                RIBA &amp; CO.
              </div>
              <div style={{ color: "#2AABCC", fontWeight: 500, fontSize: 10, letterSpacing: "0.07em" }}>
                DLMS v1.0
              </div>
            </div>
          )}
        </div>

        {/* System status chip */}
        {sidebarOpen && (
          <div style={{ padding: "10px 18px" }}>
            <div style={{
              background: "rgba(30,132,73,0.18)",
              border: "1px solid rgba(30,132,73,0.4)",
              borderRadius: 6,
              padding: "5px 10px",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#2ECC71",
                boxShadow: "0 0 0 2px rgba(46,204,113,0.35)",
                display: "inline-block",
              }}/>
              <span style={{ fontSize: 11, color: "#2ECC71", fontWeight: 500 }}>All Systems Operational</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
          {navItems.map(item => (
            <NavItem
              key={item.id}
              {...item}
              active={activePage === item.id}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </nav>

        {/* User chip */}
        <div style={{
          padding: "14px 18px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: RIBA.teal,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>
                {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || "SA"}
              </span>
            </div>
            {sidebarOpen && (
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {user?.first_name || user?.email?.split('@')[0] || "System Admin"}
                </div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>{user?.email || "admin@riba.ug"}</div>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              style={{
                background: "rgba(192,52,43,0.15)",
                border: "1px solid rgba(192,52,43,0.3)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#FF6B6B",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>🚪</span> Logout
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── HEADER ── */}
        <header style={{
          background: RIBA.surface,
          borderBottom: `1px solid ${RIBA.border}`,
          padding: "0 28px",
          height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 6, borderRadius: 6,
                color: RIBA.textMuted, fontSize: 18,
              }}
            >☰</button>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: RIBA.navy }}>
                Security Dashboard
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: RIBA.textMuted }}>
                Data Loss Management System — Riba &amp; Company Limited
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Live clock */}
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 13, color: RIBA.teal, fontWeight: 600,
              background: "rgba(26,107,138,0.07)",
              padding: "4px 10px", borderRadius: 6,
            }}>
              🕐 {currentTime.toLocaleTimeString("en-GB")}
            </div>

            {/* Alert bell */}
            <div style={{ position: "relative", cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: RIBA.red, color: "#fff",
                borderRadius: "50%", width: 16, height: 16,
                fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>3</span>
            </div>

            {/* RBAC role chip */}
            <div style={{
              background: RIBA.navy, color: RIBA.gold,
              padding: "4px 12px", borderRadius: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
            }}>
              {role || "USER"}
            </div>
          </div>
        </header>

        {/* ── CONTENT ── */}
        <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto", background: RIBA.white }}>

          {/* Breadcrumb */}
          <p style={{ margin: "0 0 18px", fontSize: 12, color: RIBA.textMuted }}>
            Home › Security Dashboard
          </p>

          {/* ── STAT CARDS ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 16, marginBottom: 24,
          }}>
            <StatCard label="Active Threats"       value="7"     sub="3 critical, 4 high"     color={RIBA.red}    icon="🚨" />
            <StatCard label="Data Assets"          value="491"   sub="23 confidential"         color={RIBA.teal}   icon="🗂" />
            <StatCard label="Events Today"         value="1,247" sub="↑ 18% vs yesterday"      color={RIBA.gold}   icon="📡" />
            <StatCard label="Active Users"         value="38"    sub="4 suspicious sessions"   color={RIBA.navy}   icon="👥" />
            <StatCard label="Auto-Blocked"         value="12"    sub="Last 24 hours"           color={RIBA.orange} icon="🛡" />
            <StatCard label="Risk Score (Avg)"     value="3.4"   sub="Scale 0–10 / Low risk"   color={RIBA.green}  icon="📈" />
          </div>

          {/* ── CHARTS ROW ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 320px",
            gap: 18, marginBottom: 24,
          }}>

            {/* Threat trend */}
            <div style={{
              background: RIBA.surface, border: `1px solid ${RIBA.border}`,
              borderRadius: 10, padding: "18px 20px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: RIBA.navy, marginBottom: 14 }}>
                Weekly Threat Trend
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={threatTrendData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false}/>
                  <XAxis dataKey="day"     tick={{ fontSize: 11, fill: RIBA.textMuted }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: RIBA.textMuted }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${RIBA.border}` }}/>
                  <Legend wrapperStyle={{ fontSize: 11 }}/>
                  <Bar dataKey="alerts"  name="Alerts"  fill={RIBA.gold}  radius={[4,4,0,0]}/>
                  <Bar dataKey="blocked" name="Blocked" fill={RIBA.red}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Access volume */}
            <div style={{
              background: RIBA.surface, border: `1px solid ${RIBA.border}`,
              borderRadius: 10, padding: "18px 20px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: RIBA.navy, marginBottom: 14 }}>
                Access Volume (24h)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={accessVolumeData}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={RIBA.teal} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={RIBA.teal} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false}/>
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: RIBA.textMuted }} axisLine={false} tickLine={false} tickFormatter={h => `${h}:00`}/>
                  <YAxis tick={{ fontSize: 11, fill: RIBA.textMuted }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                  <Area type="monotone" dataKey="accesses" name="Accesses"
                        stroke={RIBA.teal} strokeWidth={2}
                        fill="url(#volGrad)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Classification donut */}
            <div style={{
              background: RIBA.surface, border: `1px solid ${RIBA.border}`,
              borderRadius: 10, padding: "18px 20px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: RIBA.navy, marginBottom: 14 }}>
                Data Classification
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={classificationData} innerRadius={40} outerRadius={65}
                       paddingAngle={3} dataKey="value">
                    {classificationData.map((e, i) => (
                      <Cell key={i} fill={e.color}/>
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                </PieChart>
              </ResponsiveContainer>
              {classificationData.map(e => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: e.color, flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, color: RIBA.textMuted, flex: 1 }}>{e.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: RIBA.navy }}>{e.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── ALERTS + AUDIT ROW ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

            {/* Recent Alerts */}
            <div style={{
              background: RIBA.surface, border: `1px solid ${RIBA.border}`,
              borderRadius: 10, padding: "18px 20px",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 14,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: RIBA.navy }}>
                  🚨 Recent Threat Alerts
                </span>
                <span style={{
                  fontSize: 11, color: RIBA.teal, fontWeight: 600, cursor: "pointer",
                  borderBottom: `1px dashed ${RIBA.teal}`,
                }}>View All</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8F9FB" }}>
                    {["Type","User","Time","Severity","Status"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "6px 8px",
                        color: RIBA.textMuted, fontWeight: 600,
                        fontSize: 11, letterSpacing: "0.03em",
                        borderBottom: `1px solid ${RIBA.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentAlerts.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${RIBA.border}` }}>
                      <td style={{ padding: "8px 8px", color: RIBA.navy, fontWeight: 500 }}>{a.type}</td>
                      <td style={{ padding: "8px 8px", color: RIBA.textMuted }}>{a.user}</td>
                      <td style={{ padding: "8px 8px", color: RIBA.textMuted, whiteSpace: "nowrap" }}>{a.time}</td>
                      <td style={{ padding: "8px 8px" }}><SeverityBadge severity={a.severity}/></td>
                      <td style={{ padding: "8px 8px" }}><StatusBadge status={a.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Audit Trail */}
            <div style={{
              background: RIBA.surface, border: `1px solid ${RIBA.border}`,
              borderRadius: 10, padding: "18px 20px",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 14,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: RIBA.navy }}>
                  📋 Audit Trail (Today)
                </span>
                <span style={{
                  fontSize: 11, color: RIBA.teal, fontWeight: 600, cursor: "pointer",
                  borderBottom: `1px dashed ${RIBA.teal}`,
                }}>Export CSV</span>
              </div>
              <div style={{
                background: "#0D2137",
                borderRadius: 8, padding: "12px 14px",
                fontFamily: "'Courier New', monospace", fontSize: 11,
                color: "#A8C7E8",
                lineHeight: 1.8,
              }}>
                {auditRows.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: "#5A8FAF", minWidth: 56 }}>{r.ts}</span>
                    <span style={{
                      color: r.event.startsWith("AUTH") ? "#E8B420" :
                             r.event.startsWith("DATA") ? "#56D4B0" :
                             r.event.startsWith("ALERT") ? "#FF7F7F" : "#8DB4CC",
                      minWidth: 110,
                    }}>{r.event}</span>
                    <span style={{ color: "#C0D8EC", flex: 1 }} title={r.target}>
                      {r.target.length > 22 ? r.target.slice(0,22)+"…" : r.target}
                    </span>
                    <span style={{ color: "#6B8FA8" }}>{r.ip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 28, paddingTop: 14,
            borderTop: `1px solid ${RIBA.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 11, color: RIBA.textMuted,
          }}>
            <span>Riba &amp; Company Limited — DLMS v1.0 · Final Year Project</span>
            <span>Database: MySQL 8 · Backend: Django 4.2 · Frontend: React 18</span>
          </div>
        </main>
      </div>
    </div>
  );
}
