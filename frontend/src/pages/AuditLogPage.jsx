/**
 * src/pages/AuditLogPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 6
 *
 * Features:
 *   • Filterable, searchable audit trail table
 *   • Date-range picker
 *   • Event category tabs (AUTH / USER / DATA / ALERT / SYSTEM)
 *   • Terminal-style log view toggle
 *   • CSV and PDF export buttons
 *   • Event detail expandable row
 */

import { useCallback, useEffect, useState } from "react";
import api from "../services/api";

const C = {
  navy:"#0D2137", navyL:"#163352", gold:"#C8960C", goldL:"#E8B420",
  teal:"#1A6B8A", red:"#C0392B", orange:"#D35400", green:"#1E8449",
  white:"#F5F7FA", surface:"#FFFFFF", border:"#DEE4EC", muted:"#6B7C93",
};

const CATEGORIES = ["ALL","AUTH","USER","DATA","ALERT","SYSTEM"];

const EVENT_COLORS = {
  AUTH_LOGIN:"#1E8449", AUTH_LOGOUT:"#5D6D7E", AUTH_FAIL:"#C0392B",
  AUTH_PASSWORD:"#C8960C", USER_CREATE:"#1A6B8A", USER_SUSPEND:"#D35400",
  USER_DELETE:"#C0392B", ROLE_ASSIGN:"#8E44AD", DATA_CREATE:"#1A6B8A",
  DATA_READ:"#5D6D7E", DATA_UPDATE:"#C8960C", DATA_DELETE:"#C0392B",
  DATA_CLASSIFY:"#2E86C1", ALERT_RAISED:"#C0392B", ALERT_RESOLVED:"#1E8449",
  ALERT_ESCALATED:"#D35400", SYS_EXPORT:"#8E44AD", SYS_CONFIG:"#1A6B8A",
};

const CATEGORY_MAP = {
  AUTH:  ["AUTH_LOGIN","AUTH_LOGOUT","AUTH_FAIL","AUTH_PASSWORD","AUTH_MFA"],
  USER:  ["USER_CREATE","USER_UPDATE","USER_SUSPEND","USER_DELETE","ROLE_ASSIGN"],
  DATA:  ["DATA_CREATE","DATA_READ","DATA_UPDATE","DATA_DELETE","DATA_CLASSIFY"],
  ALERT: ["ALERT_RAISED","ALERT_RESOLVED","ALERT_ESCALATED"],
  SYSTEM:["SYS_CONFIG","SYS_EXPORT","SYS_BACKUP"],
};

const fmtTs = (iso) => iso
  ? new Date(iso).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",
      hour:"2-digit",minute:"2-digit",second:"2-digit"})
  : "—";

function EventBadge({ eventType }) {
  const color = EVENT_COLORS[eventType] || C.muted;
  const short = eventType.replace(/_/g," ");
  return (
    <span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,
      background:`${color}18`,color,border:`1px solid ${color}40`,
      fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap" }}>
      {short}
    </span>
  );
}

function CategoryTab({ label, active, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"8px 16px",borderRadius:"6px 6px 0 0",cursor:"pointer",
      border:`1px solid ${active?C.border:C.border}`,borderBottom: active?"1px solid #fff":"none",
      background:active?C.surface:"#F0F2F5",
      color:active?C.navy:C.muted,fontWeight:active?700:400,fontSize:12,
      marginBottom:-1,position:"relative",zIndex:active?1:0,transition:"all 0.15s",
    }}>
      {label} {count!==undefined && (
        <span style={{ marginLeft:5,padding:"1px 6px",borderRadius:10,fontSize:10,
          background:active?C.navy:"#DEE4EC",color:active?"#fff":C.muted,fontWeight:700 }}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function AuditLogPage() {
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState("");
  const [category,   setCategory]   = useState("ALL");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [eventType,  setEventType]  = useState("ALL");
  const [viewMode,   setViewMode]   = useState("table"); // "table" | "terminal"
  const [expanded,   setExpanded]   = useState(null);
  const [exporting,  setExporting]  = useState("");

  const PAGE_SIZE = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE, ordering: "-timestamp" });
      if (search)    params.append("search",     search);
      if (dateFrom)  params.append("date_from",  dateFrom);
      if (dateTo)    params.append("date_to",    dateTo);
      if (eventType !== "ALL") params.append("event_type", eventType);
      if (category !== "ALL" && CATEGORY_MAP[category]) {
        CATEGORY_MAP[category].forEach(e => params.append("event_type", e));
      }
      const res = await api.get(`/audit/?${params}`);
      setLogs(res.data.results || res.data);
      setTotal(res.data.count  || (res.data.results||res.data).length);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [page, search, dateFrom, dateTo, eventType, category]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleExport = async (fmt) => {
    setExporting(fmt);
    try {
      const params = new URLSearchParams({ fmt });
      if (dateFrom)  params.append("date_from",  dateFrom);
      if (dateTo)    params.append("date_to",    dateTo);
      if (eventType !== "ALL") params.append("event_type", eventType);

      const res = await api.get(`/audit/export/?${params}`, { responseType: "blob" });
      const url  = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href     = url;
      link.download = `dlms_audit_${new Date().toISOString().slice(0,10)}.${fmt}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed. Check that ReportLab is installed for PDF.");
    } finally { setExporting(""); }
  };

  const tbH = { padding:"9px 14px",fontSize:10,fontWeight:700,color:C.muted,
    letterSpacing:"0.04em",borderBottom:`2px solid ${C.border}`,
    background:"#F8F9FB",textAlign:"left",whiteSpace:"nowrap" };
  const tbD = { padding:"10px 14px",borderBottom:`1px solid ${C.border}`,
    fontSize:12,verticalAlign:"top" };

  // Group category counts
  const categoryCounts = {};
  CATEGORIES.slice(1).forEach(cat => {
    categoryCounts[cat] = logs.filter(l =>
      CATEGORY_MAP[cat]?.includes(l.event_type)
    ).length;
  });

  return (
    <div style={{ minHeight:"100vh",background:C.white,fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .log-row:hover { background:#F8FBFF !important; }
        .log-row { transition:background 0.12s; cursor:pointer; }
        .exp-btn:hover { background:#F0F0F0; }
      `}</style>

      {/* Header */}
      <div style={{ background:C.navy,padding:"20px 28px",borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ color:C.gold,fontSize:10,fontWeight:600,
              letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
              PHASE 6 — AUDITING, LOGGING & REPORTING
            </div>
            <h1 style={{ color:"#fff",margin:0,fontSize:20,fontWeight:800 }}>Audit Trail</h1>
            <p style={{ color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontSize:12 }}>
              {total.toLocaleString()} events · Append-only · ISO 27001 compliant
            </p>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            {/* View toggle */}
            <div style={{ display:"flex",borderRadius:8,overflow:"hidden",
              border:`1px solid rgba(255,255,255,0.2)` }}>
              {["table","terminal"].map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding:"8px 14px",border:"none",cursor:"pointer",fontSize:11,
                  background:viewMode===m?"rgba(200,150,12,0.3)":"transparent",
                  color:viewMode===m?C.goldL:"rgba(255,255,255,0.6)",fontWeight:viewMode===m?700:400,
                }}>
                  {m==="table"?"⊞ Table":"▶_ Terminal"}
                </button>
              ))}
            </div>
            {/* Export buttons */}
            <button onClick={()=>handleExport("csv")} disabled={!!exporting} style={{
              padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",
              background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
              color:C.navy,fontWeight:700,fontSize:12,
            }}>
              {exporting==="csv"?"Exporting…":"⬇ CSV"}
            </button>
            <button onClick={()=>handleExport("pdf")} disabled={!!exporting} style={{
              padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",
              background:C.teal,color:"#fff",fontWeight:700,fontSize:12,
            }}>
              {exporting==="pdf"?"Generating…":"⬇ PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding:"14px 28px",background:C.surface,borderBottom:`1px solid ${C.border}`,
        display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
        <input placeholder="🔍 Search events, users, IPs…" value={search}
          onChange={e=>{setSearch(e.target.value);setPage(1);}}
          style={{ flex:1,minWidth:220,padding:"8px 12px",borderRadius:8,
            border:`1px solid ${C.border}`,fontSize:12,outline:"none",fontFamily:"inherit" }}/>

        <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}}
          style={{ padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:12,color:C.navy }}/>
        <span style={{ color:C.muted,fontSize:12 }}>→</span>
        <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}}
          style={{ padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:12,color:C.navy }}/>

        <select value={eventType} onChange={e=>{setEventType(e.target.value);setPage(1);}}
          style={{ padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:12,color:C.navy,background:C.white }}>
          <option value="ALL">All Event Types</option>
          {Object.entries(AuditTrail_EVENTS||{}).map(([k,v])=>(
            <option key={k} value={k}>{v||k}</option>
          ))}
        </select>

        <button onClick={()=>{setSearch("");setDateFrom("");setDateTo("");setEventType("ALL");setPage(1);}}
          style={{ padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,
            background:C.white,cursor:"pointer",fontSize:12,color:C.muted }}>
          ✕ Clear
        </button>
      </div>

      {/* Category tabs */}
      <div style={{ padding:"0 28px",background:"#F0F2F5",
        display:"flex",gap:0,borderBottom:`1px solid ${C.border}` }}>
        {CATEGORIES.map(cat => (
          <CategoryTab key={cat} label={cat}
            active={category===cat}
            count={cat!=="ALL"?categoryCounts[cat]:undefined}
            onClick={()=>{setCategory(cat);setPage(1);}}/>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding:"20px 28px" }}>
        {viewMode==="terminal" ? (
          /* Terminal view */
          <div style={{ background:C.navy,borderRadius:12,overflow:"hidden",
            boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ padding:"10px 16px",background:"#0A1929",borderBottom:"1px solid rgba(255,255,255,0.05)",
              display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ width:10,height:10,borderRadius:"50%",background:"#FF5F57",display:"inline-block" }}/>
              <span style={{ width:10,height:10,borderRadius:"50%",background:"#FFBD2E",display:"inline-block" }}/>
              <span style={{ width:10,height:10,borderRadius:"50%",background:"#27C93F",display:"inline-block" }}/>
              <span style={{ color:"rgba(255,255,255,0.4)",fontSize:11,marginLeft:8,fontFamily:"'DM Mono',monospace" }}>
                dlms@riba:~/audit-trail$ tail -n {logs.length}
              </span>
            </div>
            <div style={{ padding:"14px 18px",maxHeight:600,overflowY:"auto",
              fontFamily:"'DM Mono','Courier New',monospace",fontSize:12,lineHeight:1.9 }}>
              {loading ? (
                <span style={{ color:"#5A8FAF" }}>Loading audit records…</span>
              ) : logs.map(log => (
                <div key={log.id} style={{ display:"flex",gap:12 }}>
                  <span style={{ color:"#5A8FAF",minWidth:160,flexShrink:0 }}>
                    {new Date(log.timestamp).toLocaleString("en-GB",{
                      day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"
                    })}
                  </span>
                  <span style={{ color:EVENT_COLORS[log.event_type]||"#A8C7E8",
                    minWidth:140,flexShrink:0 }}>
                    {log.event_type}
                  </span>
                  <span style={{ color:"#80ADCC",minWidth:180,flexShrink:0,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {log.actor_email||"system"}
                  </span>
                  <span style={{ color:"#C0D8EC",flex:1,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {log.description}
                  </span>
                  <span style={{ color:"#6B8FA8",minWidth:110,flexShrink:0,textAlign:"right" }}>
                    {log.ip_address||"—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Table view */
          <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`,
            background:C.surface }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["TIMESTAMP","EVENT","ACTOR","ROLE","DESCRIPTION","ASSET","IP ADDRESS"].map(h=>(
                    <th key={h} style={tbH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding:40,textAlign:"center",color:C.muted }}>
                    Loading audit records…
                  </td></tr>
                ) : logs.length===0 ? (
                  <tr><td colSpan={7} style={{ padding:40,textAlign:"center",color:C.muted }}>
                    No audit events match your filters.
                  </td></tr>
                ) : logs.map(log => (
                  <>
                    <tr key={log.id} className="log-row"
                      onClick={()=>setExpanded(expanded===log.id?null:log.id)}>
                      <td style={{ ...tbD,fontFamily:"'DM Mono',monospace",fontSize:11,
                        color:C.muted,whiteSpace:"nowrap" }}>
                        {fmtTs(log.timestamp)}
                      </td>
                      <td style={tbD}><EventBadge eventType={log.event_type}/></td>
                      <td style={{ ...tbD,maxWidth:160 }}>
                        <div style={{ fontWeight:600,color:C.navy,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {log.actor_name||"System"}
                        </div>
                        <div style={{ fontSize:11,color:C.muted }}>{log.actor_email||"—"}</div>
                      </td>
                      <td style={{ ...tbD,fontSize:11,color:C.muted }}>{log.actor_role||"—"}</td>
                      <td style={{ ...tbD,maxWidth:280 }}>
                        <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          color:C.navy }}>
                          {log.description}
                        </div>
                      </td>
                      <td style={{ ...tbD,fontSize:11,color:C.muted,maxWidth:140 }}>
                        {log.asset_name ? (
                          <span>
                            <span style={{ padding:"1px 5px",borderRadius:3,fontSize:10,
                              fontWeight:700,background:"#F0F0F0",
                              color:log.asset_level==="L3"?C.red:log.asset_level==="L2"?C.gold:C.green,
                              marginRight:4 }}>[{log.asset_level}]</span>
                            {log.asset_name.slice(0,20)}{log.asset_name.length>20?"…":""}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ ...tbD,fontFamily:"'DM Mono',monospace",fontSize:11,color:C.muted }}>
                        {log.ip_address||"—"}
                      </td>
                    </tr>
                    {/* Expanded metadata row */}
                    {expanded===log.id && (
                      <tr key={`${log.id}-exp`}>
                        <td colSpan={7} style={{ padding:"0",borderBottom:`1px solid ${C.border}` }}>
                          <div style={{ padding:"14px 20px",background:"#F8FAFF",
                            borderLeft:`3px solid ${EVENT_COLORS[log.event_type]||C.teal}` }}>
                            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",
                              gap:12,marginBottom:12 }}>
                              {[
                                ["Event ID",    `#${log.id}`],
                                ["Session",     log.session_id||"—"],
                                ["Target User", log.target_user_name||"—"],
                                ["Alert Code",  log.alert_code||"—"],
                              ].map(([l,v])=>(
                                <div key={l}>
                                  <div style={{ fontSize:10,color:C.muted,fontWeight:600,marginBottom:2 }}>{l}</div>
                                  <div style={{ fontSize:12,fontWeight:600,color:C.navy,
                                    fontFamily:"'DM Mono',monospace" }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:4 }}>FULL DESCRIPTION</div>
                            <div style={{ fontSize:12,color:C.navy,lineHeight:1.6 }}>{log.description}</div>
                            {log.metadata && Object.keys(log.metadata).length>0 && (
                              <div style={{ marginTop:10 }}>
                                <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:4 }}>METADATA</div>
                                <div style={{ background:C.navy,borderRadius:6,padding:"8px 12px",
                                  fontFamily:"'DM Mono',monospace",fontSize:11,color:"#A8C7E8" }}>
                                  {JSON.stringify(log.metadata, null, 2).slice(0,300)}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14 }}>
            <span style={{ fontSize:12,color:C.muted }}>
              Showing {Math.min((page-1)*PAGE_SIZE+1, total)}–{Math.min(page*PAGE_SIZE, total)} of {total.toLocaleString()} events
            </span>
            <div style={{ display:"flex",gap:8 }}>
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
          </div>
        )}
      </div>
    </div>
  );
}

// Audit event types reference (kept client-side to avoid extra API call)
const AuditTrail_EVENTS = {
  AUTH_LOGIN:"User Login", AUTH_LOGOUT:"User Logout", AUTH_FAIL:"Failed Login",
  AUTH_PASSWORD:"Password Change", AUTH_MFA:"MFA Event",
  USER_CREATE:"User Created", USER_UPDATE:"User Updated",
  USER_SUSPEND:"User Suspended", USER_DELETE:"User Deleted", ROLE_ASSIGN:"Role Assigned",
  DATA_CREATE:"Asset Created", DATA_READ:"Asset Accessed",
  DATA_UPDATE:"Asset Updated", DATA_DELETE:"Asset Deleted", DATA_CLASSIFY:"Asset Classified",
  ALERT_RAISED:"Alert Raised", ALERT_RESOLVED:"Alert Resolved", ALERT_ESCALATED:"Alert Escalated",
  SYS_CONFIG:"Config Changed", SYS_EXPORT:"Report Exported", SYS_BACKUP:"Backup Triggered",
};
