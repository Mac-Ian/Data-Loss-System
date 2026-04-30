/**
 * src/pages/AlertsPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 5
 *
 * Features:
 *   • Filterable alerts table (severity, status, type, risk score)
 *   • Stat summary bar (open / critical / today / auto-blocked)
 *   • Alert detail drawer (evidence, timeline, comments, notifications)
 *   • One-click Resolve, Escalate, Assign, False Positive actions
 *   • Add comment inline
 *   • Alert policies panel (Admin)
 *   • Auto-refresh every 30s
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

// ── Brand tokens
const C = {
  navy:"#0D2137", navyL:"#163352", gold:"#C8960C", goldL:"#E8B420",
  teal:"#1A6B8A", red:"#C0392B", orange:"#D35400", green:"#1E8449",
  white:"#F5F7FA", surface:"#FFFFFF", border:"#DEE4EC", muted:"#6B7C93",
};

// ── Config maps
const SEV = {
  CRITICAL: { bg:"#FDE8E8", text:"#7B0000", border:"#F5AEAE", dot:"#C0392B", rank:4 },
  HIGH:     { bg:"#FEF0E6", text:"#7A2800", border:"#FBCAA3", dot:"#D35400", rank:3 },
  MEDIUM:   { bg:"#FEF9E7", text:"#7D5A00", border:"#F9E49B", dot:"#C8960C", rank:2 },
  LOW:      { bg:"#EBF5EB", text:"#145214", border:"#A9D6A9", dot:"#1E8449", rank:1 },
};
const STATUS_CFG = {
  OPEN:           { bg:"#FEE2E2", text:"#991B1B", icon:"🔴" },
  INVESTIGATING:  { bg:"#FEF3C7", text:"#92400E", icon:"🟡" },
  RESOLVED:       { bg:"#D1FAE5", text:"#065F46", icon:"🟢" },
  FALSE_POSITIVE: { bg:"#E0E7FF", text:"#3730A3", icon:"🔵" },
};
const TYPE_ICONS = {
  BULK_DOWNLOAD:"📥", OFF_HOURS_ACCESS:"🌙", IMPOSSIBLE_TRAVEL:"✈️",
  REPEATED_FAILURE:"🔑", DATA_EXFILTRATION:"💾", CLASSIFICATION_BREACH:"🏷",
  PRIVILEGE_ESCALATION:"⚡", OTHER:"⚠️",
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const fmtAge  = (mins) => mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins/60)}h ago` : `${Math.floor(mins/1440)}d ago`;

// ── Reusable badge components
function SevBadge({ sev }) {
  const s = SEV[sev] || SEV.LOW;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px",
      borderRadius:5, fontSize:11, fontWeight:700,
      background:s.bg, color:s.text, border:`1px solid ${s.border}` }}>
      <span style={{ width:6,height:6,borderRadius:"50%",background:s.dot,display:"inline-block" }}/>
      {sev}
    </span>
  );
}
function StatusBadge({ st }) {
  const s = STATUS_CFG[st] || STATUS_CFG.OPEN;
  return (
    <span style={{ padding:"2px 9px", borderRadius:4, fontSize:11, fontWeight:600,
      background:s.bg, color:s.text }}>
      {s.icon} {st.replace("_"," ")}
    </span>
  );
}
function RiskBar({ score }) {
  const color = score>=8?C.red : score>=6?C.orange : score>=4?C.gold : C.green;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:56,height:5,borderRadius:3,background:C.border,overflow:"hidden" }}>
        <div style={{ width:`${(score/10)*100}%`,height:"100%",background:color,borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:11,fontWeight:700,color,fontFamily:"'DM Mono',monospace" }}>{score.toFixed(1)}</span>
    </div>
  );
}

// ── Modal
function Modal({ open, onClose, title, width=500, children }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:1100,background:"rgba(13,33,55,0.65)",backdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:C.surface,borderRadius:12,width,maxWidth:"100%",maxHeight:"85vh",
        overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.3)" }}>
        <div style={{ padding:"16px 22px",background:C.navy,display:"flex",
          justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ color:"#fff",fontWeight:700,fontSize:14 }}>{title}</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.12)",border:"none",
            borderRadius:5,color:"#fff",cursor:"pointer",width:26,height:26,fontSize:15 }}>✕</button>
        </div>
        <div style={{ overflowY:"auto",flex:1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Alert detail drawer
function AlertDrawer({ alert, open, onClose, onAction, role, users }) {
  const [comment, setComment]   = useState("");
  const [submitting, setSub]    = useState(false);
  const [actionMsg, setMsg]     = useState("");
  const [assignId, setAssignId] = useState("");

  useEffect(() => { setComment(""); setMsg(""); setAssignId(""); }, [alert]);

  if (!open || !alert) return null;
  const sc = SEV[alert.severity]||SEV.LOW;

  const doAction = async (endpoint, body={}, label="") => {
    setSub(true); setMsg("");
    try {
      await api.post(`/alerts/${alert.id}/${endpoint}/`, body);
      setMsg(`✅ ${label} successful.`);
      onAction();
    } catch (e) {
      setMsg(`❌ ${e.response?.data?.detail || "Action failed."}`);
    } finally { setSub(false); }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    await doAction("comment", { body: comment }, "Comment added");
    setComment("");
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:900,display:"flex",justifyContent:"flex-end" }}>
      <div onClick={onClose} style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.4)" }}/>
      <div style={{ position:"relative",width:520,height:"100%",background:C.surface,
        boxShadow:"-8px 0 40px rgba(0,0,0,0.18)",display:"flex",flexDirection:"column",
        zIndex:1,overflowY:"auto" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px",background:C.navy,borderBottom:`3px solid ${sc.dot}`,flexShrink:0 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
                <span style={{ fontSize:20 }}>{TYPE_ICONS[alert.alert_type]||"⚠️"}</span>
                <span style={{ color:C.gold,fontSize:10,fontWeight:700,letterSpacing:"0.06em",
                  fontFamily:"'DM Mono',monospace" }}>{alert.alert_code}</span>
              </div>
              <div style={{ color:"#fff",fontWeight:800,fontSize:15,lineHeight:1.3,wordBreak:"break-word" }}>
                {alert.title}
              </div>
              <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
                <SevBadge sev={alert.severity}/>
                <StatusBadge st={alert.status}/>
                {alert.auto_blocked && (
                  <span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,
                    background:"rgba(192,57,43,0.3)",color:"#FF8A80" }}>🔒 AUTO-BLOCKED</span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.1)",border:"none",
              borderRadius:6,color:"#fff",cursor:"pointer",width:28,height:28,
              fontSize:15,flexShrink:0,marginLeft:12 }}>✕</button>
          </div>
        </div>

        <div style={{ padding:"20px 24px",flex:1,display:"flex",flexDirection:"column",gap:18 }}>

          {/* Risk + meta */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {[
              ["Risk Score",   <RiskBar score={alert.risk_score||0}/>],
              ["Alert Type",   alert.alert_type_label || alert.alert_type],
              ["Triggered By", alert.triggered_by?.email||"—"],
              ["Asset",        alert.asset_name ? `[${alert.asset_level}] ${alert.asset_name}` : "—"],
              ["Detected",     fmtDate(alert.created_at)],
              ["Age",          fmtAge(alert.age_minutes||0)],
              ["Assigned To",  alert.assigned_to?.full_name||"Unassigned"],
              ["Resolved At",  fmtDate(alert.resolved_at)],
            ].map(([label,value]) => (
              <div key={label} style={{ background:"#F8F9FB",padding:"10px 12px",
                borderRadius:8,border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10,color:C.muted,fontWeight:600,letterSpacing:"0.04em",marginBottom:3 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize:12,fontWeight:600,color:C.navy }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:6 }}>DESCRIPTION</div>
            <div style={{ fontSize:13,color:C.navy,lineHeight:1.6,padding:"10px 14px",
              background:"#F8F9FB",borderRadius:8,border:`1px solid ${C.border}` }}>
              {alert.description}
            </div>
          </div>

          {/* Evidence */}
          {alert.raw_evidence && Object.keys(alert.raw_evidence).length > 0 && (
            <div>
              <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:6 }}>RAW EVIDENCE</div>
              <div style={{ background:C.navy,borderRadius:8,padding:"12px 14px",
                fontFamily:"'DM Mono',monospace",fontSize:11,color:"#A8C7E8",lineHeight:1.8 }}>
                {Object.entries(alert.raw_evidence).map(([k,v]) => (
                  <div key={k}>
                    <span style={{ color:"#5A8FAF" }}>{k.replace(/_/g," ")}: </span>
                    <span style={{ color:"#C0D8EC" }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {alert.comments?.length > 0 && (
            <div>
              <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:8 }}>
                ANALYST COMMENTS ({alert.comments.length})
              </div>
              {alert.comments.map(c => (
                <div key={c.id} style={{ padding:"10px 12px",borderRadius:8,
                  background:"#F0F7FF",border:`1px solid #BFDBFE`,marginBottom:6 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ fontSize:11,fontWeight:700,color:C.teal }}>{c.author_name}</span>
                    <span style={{ fontSize:10,color:C.muted }}>{fmtDate(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize:12,color:C.navy }}>{c.body}</div>
                </div>
              ))}
            </div>
          )}

          {/* Notifications sent */}
          {alert.notifications?.length > 0 && (
            <div>
              <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:8 }}>
                NOTIFICATIONS SENT ({alert.notifications.length})
              </div>
              {alert.notifications.map(n => (
                <div key={n.id} style={{ display:"flex",alignItems:"center",gap:8,
                  padding:"6px 10px",borderRadius:6,background:"#F8F9FB",
                  border:`1px solid ${C.border}`,marginBottom:4 }}>
                  <span style={{ fontSize:12 }}>{n.channel==="EMAIL"?"📧":"📱"}</span>
                  <span style={{ fontSize:12,flex:1,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{n.recipient}</span>
                  <span style={{ fontSize:10,fontWeight:600,
                    color:n.status==="SENT"?C.green:C.red }}>{n.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Actions */}
          {actionMsg && (
            <div style={{ padding:"10px 14px",borderRadius:8,
              background: actionMsg.startsWith("✅")?"#D1FAE5":"#FEE2E2",
              color: actionMsg.startsWith("✅")?"#065F46":"#991B1B",
              fontSize:13 }}>
              {actionMsg}
            </div>
          )}

          {alert.status !== "RESOLVED" && alert.status !== "FALSE_POSITIVE" && (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <div style={{ fontSize:11,color:C.muted,fontWeight:600 }}>ACTIONS</div>

              {/* Resolution notes */}
              <textarea
                id="resolution-notes"
                placeholder="Resolution notes (optional)…"
                rows={2}
                style={{ width:"100%",padding:"10px 12px",borderRadius:8,
                  border:`1px solid ${C.border}`,fontSize:13,resize:"vertical",
                  fontFamily:"inherit",boxSizing:"border-box" }}
              />

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                <button disabled={submitting} onClick={() => doAction("resolve",
                  { resolution_notes: document.getElementById("resolution-notes")?.value||"" },
                  "Alert resolved")}
                  style={{ padding:"10px",borderRadius:8,border:"none",
                    background:C.green,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12 }}>
                  ✅ Resolve
                </button>
                {alert.severity !== "CRITICAL" && (
                  <button disabled={submitting} onClick={() => doAction("escalate",{},"Escalated")}
                    style={{ padding:"10px",borderRadius:8,border:"none",
                      background:C.orange,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12 }}>
                    ⬆️ Escalate
                  </button>
                )}
                {role==="ADMIN" && (
                  <button disabled={submitting} onClick={() => doAction("false-positive",{},"Marked false positive")}
                    style={{ padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,
                      background:C.white,color:C.navy,fontWeight:700,cursor:"pointer",fontSize:12 }}>
                    ❌ False Positive
                  </button>
                )}
                {role==="ADMIN" && (
                  <div style={{ display:"flex",gap:6 }}>
                    <select value={assignId} onChange={e=>setAssignId(e.target.value)}
                      style={{ flex:1,padding:"9px 10px",borderRadius:8,
                        border:`1px solid ${C.border}`,fontSize:12,color:C.navy,background:C.white }}>
                      <option value="">Assign to…</option>
                      {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                    <button disabled={!assignId||submitting}
                      onClick={()=>doAction("assign",{user_id:assignId},"Assigned")}
                      style={{ padding:"9px 14px",borderRadius:8,border:"none",
                        background:C.teal,color:"#fff",fontWeight:700,cursor:assignId?"pointer":"not-allowed",fontSize:12 }}>
                      Assign
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add comment */}
          <div>
            <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:6 }}>ADD COMMENT</div>
            <div style={{ display:"flex",gap:8 }}>
              <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={2}
                placeholder="Add an analyst note…"
                style={{ flex:1,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,
                  fontSize:13,resize:"none",fontFamily:"inherit" }}/>
              <button disabled={!comment.trim()||submitting} onClick={postComment}
                style={{ padding:"0 16px",borderRadius:8,border:"none",
                  background:C.navy,color:"#fff",fontWeight:700,
                  cursor:comment.trim()?"pointer":"not-allowed",fontSize:12 }}>
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page
export default function AlertsPage() {
  const { role }                        = useAuth();
  const [alerts, setAlerts]             = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [drawer, setDrawer]             = useState(null);
  const [drawerFull, setDrawerFull]     = useState(null);
  const [users, setUsers]               = useState([]);
  const [policies, setPolicies]         = useState([]);
  const [showPolicies, setShowPolicies] = useState(false);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);

  // Filters
  const [fSev,    setFSev]    = useState("ALL");
  const [fStatus, setFStatus] = useState("ALL");
  const [fType,   setFType]   = useState("ALL");
  const [search,  setSearch]  = useState("");

  const PAGE_SIZE = 25;

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE, ordering: "-created_at" });
      if (fSev    !== "ALL") params.append("severity", fSev);
      if (fStatus !== "ALL") params.append("status",   fStatus);
      if (fType   !== "ALL") params.append("alert_type", fType);
      if (search)             params.append("search",   search);
      const [aRes, sRes] = await Promise.all([
        api.get(`/alerts/?${params}`),
        api.get("/alerts/stats/"),
      ]);
      setAlerts(aRes.data.results || aRes.data);
      setTotal(aRes.data.count || (aRes.data.results||aRes.data).length);
      setStats(sRes.data);
    } catch { /* graceful */ }
    finally { setLoading(false); }
  }, [page, fSev, fStatus, fType, search]);

  const fetchDrawer = async (alert) => {
    setDrawer(alert);
    try {
      const res = await api.get(`/alerts/${alert.id}/`);
      setDrawerFull(res.data);
    } catch { setDrawerFull(alert); }
  };

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    api.get("/users/?page_size=100").then(r => setUsers(r.data.results||r.data)).catch(()=>{});
    if (role==="ADMIN") {
      api.get("/alerts/policies/").then(r => setPolicies(r.data.results||r.data)).catch(()=>{});
    }
    const t = setInterval(fetchAlerts, 30000);
    return () => clearInterval(t);
  }, [role, fetchAlerts]);

  const onAction = () => {
    fetchAlerts();
    if (drawer) fetchDrawer(drawer);
  };

  // ── Filter quick buttons
  const filterBtn = (label, active, onClick, color=C.navy) => (
    <button onClick={onClick} style={{
      padding:"7px 13px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:active?700:400,
      background:active?color:"transparent",color:active?"#fff":C.muted,
      border:`1px solid ${active?color:C.border}`,transition:"all 0.15s",
    }}>{label}</button>
  );

  const tbH = { padding:"9px 14px",fontSize:10,fontWeight:700,color:C.muted,
    letterSpacing:"0.04em",borderBottom:`2px solid ${C.border}`,background:"#F8F9FB",textAlign:"left" };
  const tbD = { padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13,verticalAlign:"middle" };

  const ALERT_TYPES = [
    "ALL","BULK_DOWNLOAD","OFF_HOURS_ACCESS","IMPOSSIBLE_TRAVEL",
    "REPEATED_FAILURE","DATA_EXFILTRATION","CLASSIFICATION_BREACH","PRIVILEGE_ESCALATION",
  ];

  return (
    <div style={{ minHeight:"100vh",background:C.white,fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .alert-row:hover { background:#F8FBFF !important; cursor:pointer; }
        .alert-row { transition:background 0.12s; }
      `}</style>

      {/* ── Page Header */}
      <div style={{ background:C.navy,padding:"20px 28px",borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ color:C.gold,fontSize:10,fontWeight:600,letterSpacing:"0.08em",
              fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
              PHASE 5 — AUTOMATED RESPONSE & ALERTING
            </div>
            <h1 style={{ color:"#fff",margin:0,fontSize:20,fontWeight:800 }}>Threat Alerts</h1>
            <p style={{ color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontSize:12 }}>
              {stats?.total_open??0} open · {stats?.total_critical??0} critical · auto-response active
            </p>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            {role==="ADMIN" && (
              <button onClick={()=>setShowPolicies(true)} style={{
                padding:"10px 18px",borderRadius:8,border:`1px solid rgba(255,255,255,0.2)`,
                background:"transparent",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontSize:12,fontWeight:600,
              }}>🛡 Response Policies</button>
            )}
            <div style={{
              padding:"10px 16px",borderRadius:8,background:"rgba(192,57,43,0.15)",
              border:"1px solid rgba(192,57,43,0.35)",display:"flex",alignItems:"center",gap:8,
            }}>
              <span style={{ width:7,height:7,borderRadius:"50%",background:C.red,
                boxShadow:"0 0 0 3px rgba(192,57,43,0.25)",display:"inline-block",
                animation:"pulse 2s ease-in-out infinite" }}/>
              <span style={{ color:C.red,fontSize:11,fontWeight:700 }}>
                {stats?.total_open??0} OPEN ALERTS
              </span>
            </div>
          </div>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

        {/* Stats bar */}
        <div style={{ display:"flex",gap:12,marginTop:16 }}>
          {[
            { label:"OPEN",         value:stats?.total_open??0,      color:"#FF8A80" },
            { label:"CRITICAL",     value:stats?.total_critical??0,  color:C.red     },
            { label:"TODAY",        value:stats?.total_today??0,     color:C.goldL   },
            { label:"THIS WEEK",    value:stats?.total_week??0,      color:"#80CBC4" },
            { label:"AUTO-BLOCKED", value:stats?.auto_blocked??0,    color:"#FF8A80" },
            { label:"AVG RESOLVE",  value:stats?.avg_resolve_time ? `${stats.avg_resolve_time}m` : "—", color:"#A5D6A7" },
          ].map(s => (
            <div key={s.label} style={{ padding:"8px 16px",borderRadius:8,
              background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ color:"rgba(255,255,255,0.45)",fontSize:9,fontWeight:600,letterSpacing:"0.06em" }}>{s.label}</div>
              <div style={{ color:s.color,fontSize:20,fontWeight:800,lineHeight:1.2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters */}
      <div style={{ padding:"14px 28px",background:C.surface,borderBottom:`1px solid ${C.border}`,
        display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
        <input placeholder="🔍 Search alerts…" value={search}
          onChange={e=>{setSearch(e.target.value);setPage(1);}}
          style={{ flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,
            border:`1px solid ${C.border}`,fontSize:12,outline:"none",fontFamily:"inherit" }}/>

        {/* Severity filter */}
        <div style={{ display:"flex",gap:4 }}>
          {filterBtn("All",fSev==="ALL",()=>{setFSev("ALL");setPage(1);})}
          {Object.entries(SEV).map(([s,cfg]) =>
            filterBtn(s, fSev===s, ()=>{setFSev(s);setPage(1);}, cfg.dot)
          )}
        </div>

        {/* Status filter */}
        <select value={fStatus} onChange={e=>{setFStatus(e.target.value);setPage(1);}}
          style={{ padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:12,color:C.navy,background:C.white }}>
          <option value="ALL">All Statuses</option>
          {["OPEN","INVESTIGATING","RESOLVED","FALSE_POSITIVE"].map(s=>
            <option key={s} value={s}>{s.replace("_"," ")}</option>
          )}
        </select>

        {/* Type filter */}
        <select value={fType} onChange={e=>{setFType(e.target.value);setPage(1);}}
          style={{ padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:12,color:C.navy,background:C.white }}>
          {ALERT_TYPES.map(t=><option key={t} value={t}>{t==="ALL"?"All Types":t.replace(/_/g," ")}</option>)}
        </select>
      </div>

      {/* ── Table */}
      <div style={{ padding:"0 28px 28px" }}>
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`,
          marginTop:18,background:C.surface }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["TYPE","TITLE","SEVERITY","STATUS","RISK","TRIGGERED BY","AGE","ASSIGNED"].map(h=>(
                  <th key={h} style={tbH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding:40,textAlign:"center",color:C.muted }}>Loading alerts…</td></tr>
              ) : alerts.length===0 ? (
                <tr><td colSpan={8} style={{ padding:40,textAlign:"center",color:C.muted }}>No alerts match your filters.</td></tr>
              ) : alerts.map(a => (
                <tr key={a.id} className="alert-row"
                  style={{ background: a.severity==="CRITICAL" ? "#FFF8F8" : "transparent" }}
                  onClick={()=>fetchDrawer(a)}>
                  <td style={tbD}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:18 }}>{TYPE_ICONS[a.alert_type]||"⚠️"}</span>
                      <span style={{ fontSize:11,color:C.muted,maxWidth:110,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                        {a.alert_type_label||a.alert_type}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...tbD,maxWidth:240 }}>
                    <div style={{ fontWeight:600,color:C.navy,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.title}</div>
                    <div style={{ fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace" }}>{a.alert_code}</div>
                  </td>
                  <td style={tbD}><SevBadge sev={a.severity}/></td>
                  <td style={tbD}><StatusBadge st={a.status}/></td>
                  <td style={tbD}><RiskBar score={a.risk_score||0}/></td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted }}>{a.triggered_by?.email||"—"}</td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted,whiteSpace:"nowrap" }}>
                    {fmtAge(a.age_minutes||0)}
                  </td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted }}>
                    {a.assigned_to_name||<span style={{ color:"#C0CDD8" }}>Unassigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display:"flex",justifyContent:"center",gap:8,marginTop:14 }}>
            <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
              style={{ padding:"7px 14px",borderRadius:6,border:`1px solid ${C.border}`,
                background:C.white,cursor:page>1?"pointer":"not-allowed",fontSize:12 }}>← Prev</button>
            <span style={{ padding:"7px 14px",fontSize:12,color:C.muted }}>
              Page {page} of {Math.ceil(total/PAGE_SIZE)}
            </span>
            <button disabled={page>=Math.ceil(total/PAGE_SIZE)} onClick={()=>setPage(p=>p+1)}
              style={{ padding:"7px 14px",borderRadius:6,border:`1px solid ${C.border}`,
                background:C.white,cursor:"pointer",fontSize:12 }}>Next →</button>
          </div>
        )}
      </div>

      {/* ── Alert Detail Drawer */}
      <AlertDrawer
        alert={drawerFull||drawer}
        open={!!drawer}
        onClose={()=>{ setDrawer(null); setDrawerFull(null); }}
        onAction={onAction}
        role={role}
        users={users}
      />

      {/* ── Policies Modal */}
      <Modal open={showPolicies} onClose={()=>setShowPolicies(false)}
        title="🛡  Alert Response Policies" width={620}>
        <div style={{ padding:20,display:"flex",flexDirection:"column",gap:12 }}>
          {policies.length===0 ? (
            <div style={{ textAlign:"center",color:C.muted,padding:24 }}>No policies configured.</div>
          ) : policies.map(p => (
            <div key={p.id} style={{ padding:"14px 16px",borderRadius:10,
              border:`1px solid ${C.border}`,background: p.is_active?"#FAFBFD":"#F5F5F5",
              opacity:p.is_active?1:0.6 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:700,color:C.navy,fontSize:13 }}>{p.name}</div>
                  <div style={{ fontSize:12,color:C.muted,marginTop:2 }}>{p.description}</div>
                </div>
                <div style={{ display:"flex",gap:6,flexShrink:0,marginLeft:12 }}>
                  <span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,
                    background:"#EEF2FF",color:"#3730A3" }}>{p.action_label||p.action}</span>
                  <span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,
                    background: p.is_active?"#D1FAE5":"#F3F4F6",
                    color: p.is_active?"#065F46":"#6B7280" }}>
                    {p.is_active?"ACTIVE":"INACTIVE"}
                  </span>
                </div>
              </div>
              <div style={{ display:"flex",gap:16,marginTop:8,fontSize:11,color:C.muted }}>
                <span>Min severity: <strong>{p.min_severity}</strong></span>
                <span>Min risk: <strong>{p.min_risk_score}</strong></span>
                <span>Escalate after: <strong>{p.escalate_after_minutes}m</strong></span>
              </div>
              {p.alert_types?.length > 0 && (
                <div style={{ marginTop:6,display:"flex",gap:4,flexWrap:"wrap" }}>
                  {p.alert_types.map(t=>(
                    <span key={t} style={{ padding:"1px 6px",borderRadius:4,fontSize:10,
                      background:"rgba(26,107,138,0.1)",color:C.teal }}>{t.replace(/_/g," ")}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
