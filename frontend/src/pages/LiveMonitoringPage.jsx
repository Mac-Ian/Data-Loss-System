/**
 * src/pages/LiveMonitoringPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 4
 *
 * Features:
 *   • Live SSE event feed (real-time access log stream)
 *   • Hourly access volume area chart
 *   • 7-day threat trend bar chart
 *   • Detector breakdown ring chart
 *   • Top risky users table
 *   • Threat events list with risk score bars
 *   • Monitoring rules panel (Admin)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

// ── Brand tokens
const C = {
  navy:    "#0D2137", navyL: "#163352",
  gold:    "#C8960C", goldL: "#E8B420",
  teal:    "#1A6B8A", tealL: "#2590B5",
  red:     "#C0392B", orange: "#D35400",
  green:   "#1E8449", white: "#F5F7FA",
  surface: "#FFFFFF", border: "#DEE4EC",
  muted:   "#6B7C93", dark:   "#0D2137",
};

const DETECTOR_COLORS = {
  BULK_DOWNLOAD:     "#C0392B",
  OFF_HOURS:         "#C8960C",
  IMPOSSIBLE_TRAVEL: "#8E44AD",
  REPEATED_FAIL:     "#D35400",
  LARGE_UPLOAD:      "#1A6B8A",
  EXFILTRATION:      "#922B21",
  RISK_SCORE:        "#2E86C1",
};

const DETECTOR_LABELS = {
  BULK_DOWNLOAD:     "Bulk Download",
  OFF_HOURS:         "Off-Hours Access",
  IMPOSSIBLE_TRAVEL: "Impossible Travel",
  REPEATED_FAIL:     "Auth Failures",
  LARGE_UPLOAD:      "Large Upload",
  EXFILTRATION:      "Exfiltration",
  RISK_SCORE:        "Risk Score",
};

// ── Helpers
const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

function RiskBar({ score }) {
  const pct   = (score / 10) * 100;
  const color = score >= 7 ? C.red : score >= 4 ? C.orange : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, fontFamily: "'DM Mono', monospace" }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function LiveEventRow({ ev, isNew }) {
  const anom = ev.is_anomalous || ev.risk_score >= 5;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "70px 160px 80px 140px 1fr 80px",
      gap: 8, padding: "7px 14px",
      borderBottom: `1px solid ${C.border}`,
      background: isNew ? "rgba(200,150,12,0.06)" : "transparent",
      transition: "background 1.5s ease",
      fontSize: 12,
      alignItems: "center",
    }}>
      <span style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{fmt(ev.ts)}</span>
      <span style={{ color: C.navy, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.user}</span>
      <span style={{
        padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, textAlign: "center",
        background: ev.action === "DOWNLOAD" ? "#FDE8E8" : ev.action === "VIEW" ? "#EBF5EB" : "#EEF2FF",
        color: ev.action === "DOWNLOAD" ? C.red : ev.action === "VIEW" ? C.green : C.teal,
      }}>{ev.action}</span>
      <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.asset || "—"}</span>
      <span style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{ev.ip}</span>
      <RiskBar score={ev.risk_score || 0} />
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "16px 18px",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, action, children, height }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#FAFBFD",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{title}</span>
        {action}
      </div>
      <div style={{ flex: 1, overflow: "hidden", ...(height ? { height } : {}) }}>
        {children}
      </div>
    </div>
  );
}

export default function LiveMonitoringPage() {
  const { role }                         = useAuth();
  const [stats, setStats]                = useState(null);
  const [events, setEvents]              = useState([]);
  const [liveLog, setLiveLog]            = useState([]);
  const [newIds, setNewIds]              = useState(new Set());
  const [connected, setConnected]        = useState(false);
  const [paused, setPaused]              = useState(false);
  const [loading, setLoading]            = useState(true);
  const [rules, setRules]                = useState([]);
  const [activeTab, setActiveTab]        = useState("feed");
  const feedRef                          = useRef(null);
  const esRef                            = useRef(null);
  const pausedRef                        = useRef(false);

  pausedRef.current = paused;

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        api.get("/monitoring/events/stats/"),
        api.get("/monitoring/events/?page_size=50"),
      ]);
      setStats(statsRes.data);
      setEvents(eventsRes.data.results || eventsRes.data);
    } catch (e) {
      console.error("Stats fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await api.get("/monitoring/rules/");
      setRules(res.data.results || res.data);
    } catch { /* */ }
  }, []);

  // SSE live feed
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const connect = () => {
      // Use fetch-based SSE since EventSource can't send auth headers
      // In production, use a ticket/cookie approach. For dev, we poll every 4s.
      const interval = setInterval(async () => {
        if (pausedRef.current) return;
        try {
          const res = await api.get("/monitoring/logs/?page_size=5&ordering=-timestamp");
          const newLogs = res.data.results || res.data;
          setConnected(true);

          setLiveLog(prev => {
            const existingIds = new Set(prev.map(e => e.event_id));
            const fresh = newLogs
              .filter(l => !existingIds.has(l.id))
              .map(l => ({
                event_id:    l.id,
                type:        "access",
                user:        l.user_email,
                action:      l.action,
                asset:       l.asset_name || "—",
                risk_score:  l.risk_score,
                is_anomalous:l.is_anomalous,
                ip:          l.ip_address || "—",
                ts:          l.timestamp,
              }));

            if (fresh.length > 0) {
              const freshIds = new Set(fresh.map(e => e.event_id));
              setNewIds(freshIds);
              setTimeout(() => setNewIds(new Set()), 2000);
              return [...fresh, ...prev].slice(0, 100);
            }
            return prev;
          });
        } catch {
          setConnected(false);
        }
      }, 4000);

      esRef.current = { close: () => clearInterval(interval) };
    };

    connect();
    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    fetchStats();
    fetchRules();
    const t = setInterval(fetchStats, 30000);
    return () => clearInterval(t);
  }, [fetchStats, fetchRules]);

  // Auto-scroll live feed
  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [liveLog, paused]);

  const summary   = stats?.summary || {};
  const hourly    = stats?.hourly_volume || [];
  const trend     = stats?.daily_trend || [];
  const byDetect  = stats?.by_detector || [];
  const topUsers  = stats?.top_risky_users || [];

  const pieData = byDetect.map(d => ({
    name:  DETECTOR_LABELS[d.detector] || d.detector,
    value: d.count,
    color: DETECTOR_COLORS[d.detector] || C.teal,
  }));

  const tabStyle = (t) => ({
    padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12,
    fontWeight: activeTab === t ? 700 : 400,
    background: activeTab === t ? C.navy : "transparent",
    color: activeTab === t ? "#fff" : C.muted,
    border: "none", transition: "all 0.15s",
  });

  const sevColor = { LOW: C.green, MEDIUM: C.gold, HIGH: C.orange, CRITICAL: C.red };

  return (
    <div style={{ minHeight: "100vh", background: C.white, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #F0F2F5; }
        ::-webkit-scrollbar-thumb { background: #C5CDD8; border-radius: 3px; }
      `}</style>

      {/* ── Page Header */}
      <div style={{ background: C.navy, padding: "20px 28px", borderBottom: `3px solid ${C.gold}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              PHASE 4 — REAL-TIME MONITORING & THREAT DETECTION
            </div>
            <h1 style={{ color: "#fff", margin: 0, fontSize: 20, fontWeight: 800 }}>Live Monitoring</h1>
            <p style={{ color: "rgba(255,255,255,0.5)", margin: "4px 0 0", fontSize: 12 }}>
              5 active detectors · Celery beat scan every 60s · SSE event feed
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Connection status */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8,
              background: connected ? "rgba(46,204,113,0.15)" : "rgba(192,57,43,0.15)",
              border: `1px solid ${connected ? "rgba(46,204,113,0.3)" : "rgba(192,57,43,0.3)"}`,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: connected ? "#2ECC71" : C.red,
                boxShadow: connected ? "0 0 0 3px rgba(46,204,113,0.25)" : "none",
                display: "inline-block",
                animation: connected ? "pulse 2s ease-in-out infinite" : "none",
              }} />
              <span style={{ color: connected ? "#2ECC71" : C.red, fontSize: 11, fontWeight: 600 }}>
                {connected ? "LIVE" : "DISCONNECTED"}
              </span>
            </div>
            <button
              onClick={() => setPaused(p => !p)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: paused ? C.gold : "rgba(255,255,255,0.1)",
                color: paused ? C.navy : "#fff", fontWeight: 700, fontSize: 12,
              }}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <StatCard label="Events Today"    value={summary.events_today ?? "—"}    sub="Threat detections"     color={C.red}    icon="🚨" />
          <StatCard label="Accesses Today"  value={summary.accesses_today ?? "—"}  sub={`${summary.anomalous_today ?? 0} anomalous`} color={C.teal}   icon="📡" />
          <StatCard label="Avg Risk Score"  value={summary.avg_risk_today ?? "—"}  sub="Scale 0 – 10"          color={C.orange}  icon="⚡" />
          <StatCard label="Events (7 days)" value={summary.events_week ?? "—"}     sub="All detectors"         color={C.gold}   icon="📅" />
          <StatCard label="Active Rules"    value={rules.filter(r => r.is_active).length || "—"} sub="Monitoring policies" color={C.navy}   icon="🛡" />
        </div>

        {/* ── Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 280px", gap: 16 }}>

          {/* Hourly access volume */}
          <SectionCard title="📊 Hourly Access Volume (24h)">
            <div style={{ padding: "12px 4px 8px" }}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourly} margin={{ left: -20 }}>
                  <defs>
                    <linearGradient id="accessGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.teal} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={C.teal} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.red} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={C.red} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="accesses"  name="Accesses"  stroke={C.teal}   strokeWidth={2} fill="url(#accessGrad)" dot={false} />
                  <Area type="monotone" dataKey="anomalous" name="Anomalous" stroke={C.red}    strokeWidth={1.5} fill="url(#anomGrad)" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* 7-day threat trend */}
          <SectionCard title="📈 7-Day Threat Trend">
            <div style={{ padding: "12px 4px 8px" }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trend} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="events"  name="Events"  fill={C.gold} radius={[3,3,0,0]} />
                  <Bar dataKey="blocked" name="Blocked" fill={C.red}  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Detector breakdown */}
          <SectionCard title="🔍 By Detector">
            <div style={{ padding: "8px 0" }}>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={pieData} innerRadius={32} outerRadius={52} paddingAngle={2} dataKey="value">
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ padding: "0 14px" }}>
                    {pieData.slice(0, 5).map(d => (
                      <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: C.muted }}>{d.name}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", color: C.muted, fontSize: 12, padding: 20 }}>No events this week</div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Main panel with tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

          {/* Left: tabbed panel */}
          <SectionCard
            title=""
            action={null}
          >
            {/* Tab bar */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4, background: "#FAFBFD" }}>
              <button style={tabStyle("feed")}    onClick={() => setActiveTab("feed")}>🔴 Live Feed</button>
              <button style={tabStyle("events")}  onClick={() => setActiveTab("events")}>⚡ Threat Events</button>
              {role === "ADMIN" && <button style={tabStyle("rules")} onClick={() => setActiveTab("rules")}>🛡 Rules</button>}
            </div>

            {/* Live Feed tab */}
            {activeTab === "feed" && (
              <div>
                {/* Column headers */}
                <div style={{
                  display: "grid", gridTemplateColumns: "70px 160px 80px 140px 1fr 80px",
                  gap: 8, padding: "8px 14px",
                  background: "#F8F9FB", borderBottom: `1px solid ${C.border}`,
                }}>
                  {["TIME","USER","ACTION","ASSET","IP","RISK"].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.04em" }}>{h}</span>
                  ))}
                </div>
                <div ref={feedRef} style={{ height: 380, overflowY: "auto" }}>
                  {liveLog.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
                      {connected ? "Waiting for events…" : "Connecting to live feed…"}
                    </div>
                  ) : (
                    liveLog.map(ev => (
                      <LiveEventRow key={ev.event_id} ev={ev} isNew={newIds.has(ev.event_id)} />
                    ))
                  )}
                </div>
                <div style={{ padding: "8px 14px", background: "#F8F9FB", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{liveLog.length} events buffered · refreshes every 4s</span>
                  <span style={{ fontSize: 11, color: paused ? C.orange : C.green, fontWeight: 600 }}>{paused ? "⏸ PAUSED" : "▶ STREAMING"}</span>
                </div>
              </div>
            )}

            {/* Threat Events tab */}
            {activeTab === "events" && (
              <div style={{ height: 430, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading events…</div>
                ) : events.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: C.muted }}>No threat events recorded.</div>
                ) : events.map(ev => (
                  <div key={ev.id} style={{
                    padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", gap: 12, alignItems: "flex-start",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: `${DETECTOR_COLORS[ev.detector] || C.teal}20`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>
                      {ev.detector === "BULK_DOWNLOAD" ? "📥" :
                       ev.detector === "OFF_HOURS"     ? "🌙" :
                       ev.detector === "REPEATED_FAIL" ? "🔑" :
                       ev.detector === "IMPOSSIBLE_TRAVEL" ? "✈️" : "⚠️"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
                          {DETECTOR_LABELS[ev.detector] || ev.detector}
                        </span>
                        <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", marginLeft: 8 }}>
                          {fmtDate(ev.detected_at)} {fmt(ev.detected_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {ev.user?.email || "Unknown"} · {ev.ip_address || "—"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <RiskBar score={ev.risk_score || 0} />
                      </div>
                    </div>
                    <div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: ev.escalated_to_alert ? "#D1FAE5" : "#FEF3C7",
                        color: ev.escalated_to_alert ? "#065F46" : "#92400E",
                      }}>
                        {ev.escalated_to_alert ? "ESCALATED" : "RAW"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rules tab (Admin) */}
            {activeTab === "rules" && (
              <div style={{ height: 430, overflowY: "auto" }}>
                {rules.map(r => (
                  <div key={r.id} style={{
                    padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", gap: 12, opacity: r.is_active ? 1 : 0.5,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: r.is_active ? "#2ECC71" : C.muted,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.description}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        Threshold: {r.threshold_count} events in {r.threshold_window_minutes} min
                        {r.auto_block && " · 🔒 Auto-block"}
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                      background: `${sevColor[r.severity]}20`, color: sevColor[r.severity],
                    }}>{r.severity}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Right: Top risky users */}
          <SectionCard title="🎯 Top Risky Users (Today)">
            <div style={{ padding: "8px 0" }}>
              {topUsers.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>No anomalous users today.</div>
              ) : topUsers.map((u, i) => (
                <div key={i} style={{
                  padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? C.red : i === 1 ? C.orange : C.gold,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: 13,
                  }}>
                    {(u.user__first_name?.[0] || "?")}{(u.user__last_name?.[0] || "")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.user__first_name} {u.user__last_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{u.user__email}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: i === 0 ? C.red : C.orange }}>{u.events}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>events</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}`, background: "#FAFBFD" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 10 }}>DETECTOR STATUS</div>
              {[
                { label: "Bulk Download",     status: "ACTIVE", color: C.green },
                { label: "Off-Hours Access",  status: "ACTIVE", color: C.green },
                { label: "Impossible Travel", status: "ACTIVE", color: C.green },
                { label: "Auth Failures",     status: "ACTIVE", color: C.green },
                { label: "Large Upload",      status: "ACTIVE", color: C.green },
              ].map(d => (
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{d.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: d.color }}>● {d.status}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
