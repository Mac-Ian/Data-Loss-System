/**
 * src/pages/ReportsPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 6
 *
 * Features:
 *   • Summary KPI cards
 *   • 14-day daily event trend (area chart)
 *   • Event category breakdown (bar chart)
 *   • Top actors table
 *   • Hourly event heatmap
 *   • One-click PDF security report export
 *   • One-click CSV audit export
 */

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import api from "../services/api";

const C = {
  navy:"#0D2137", navyL:"#163352", gold:"#C8960C", goldL:"#E8B420",
  teal:"#1A6B8A", tealL:"#2590B5", red:"#C0392B", orange:"#D35400",
  green:"#1E8449", white:"#F5F7FA", surface:"#FFFFFF",
  border:"#DEE4EC", muted:"#6B7C93",
};

const CATEGORY_COLORS = {
  AUTH:   "#1A6B8A",
  USER:   "#8E44AD",
  DATA:   "#C8960C",
  ALERT:  "#C0392B",
  SYSTEM: "#1E8449",
};

function KpiCard({ label, value, sub, color, icon, trend }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,
      padding:"18px 20px",borderTop:`3px solid ${color}` }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
        <span style={{ fontSize:11,color:C.muted,fontWeight:600,
          textTransform:"uppercase",letterSpacing:"0.05em" }}>{label}</span>
        <span style={{ fontSize:22 }}>{icon}</span>
      </div>
      <div style={{ fontSize:30,fontWeight:800,color:C.navy,lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11,color:C.muted,marginTop:5 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ marginTop:6,display:"flex",alignItems:"center",gap:4 }}>
          <span style={{ fontSize:11,fontWeight:600,color:trend>=0?C.green:C.red }}>
            {trend>=0?"↑":"↓"} {Math.abs(trend)}%
          </span>
          <span style={{ fontSize:10,color:C.muted }}>vs last period</span>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, action, children }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,
      borderRadius:10,overflow:"hidden" }}>
      <div style={{ padding:"14px 18px",borderBottom:`1px solid ${C.border}`,
        display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFD" }}>
        <span style={{ fontSize:13,fontWeight:700,color:C.navy }}>{title}</span>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState("");
  const [dateFrom,  setDateFrom]  = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-30);
    return d.toISOString().slice(0,10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/audit/summary/");
      setStats(res.data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleExport = async (type, fmt) => {
    setExporting(`${type}-${fmt}`);
    try {
      const endpoint = type === "security"
        ? `/audit/security-report/?fmt=${fmt}&date_from=${dateFrom}&date_to=${dateTo}`
        : `/audit/export/?fmt=${fmt}&date_from=${dateFrom}&date_to=${dateTo}`;

      const res  = await api.get(endpoint, { responseType: "blob" });
      const url  = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href     = url;
      link.download = `dlms_${type}_report_${new Date().toISOString().slice(0,10)}.${fmt}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(`Export failed. Ensure ReportLab is installed for PDF exports.`);
    } finally { setExporting(""); }
  };

  if (loading) return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:C.white,flexDirection:"column",gap:12 }}>
      <div style={{ width:44,height:44,borderRadius:10,
        background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
        display:"flex",alignItems:"center",justifyContent:"center" }}>
        <span style={{ color:C.navy,fontWeight:900,fontSize:20 }}>R</span>
      </div>
      <span style={{ color:C.muted,fontSize:13 }}>Building reports…</span>
    </div>
  );

  const daily      = stats?.daily_trend     || [];
  const byCategory = stats?.by_category     || [];
  const topActors  = stats?.top_actors      || [];
  const hourly     = stats?.hourly_trend    || [];
  const byType     = stats?.by_event_type   || [];

  // Build heatmap: 24 hours × intensity
  const maxHourly = Math.max(...hourly.map(h => (h.auth_events||0) + (h.data_events||0)), 1);

  return (
    <div style={{ minHeight:"100vh",background:C.white,fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .export-btn:hover { opacity:0.88; transform:translateY(-1px); }
        .export-btn { transition:all 0.15s; }
      `}</style>

      {/* Header */}
      <div style={{ background:C.navy,padding:"20px 28px",borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12 }}>
          <div>
            <div style={{ color:C.gold,fontSize:10,fontWeight:600,
              letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
              PHASE 6 — REPORTING DASHBOARD
            </div>
            <h1 style={{ color:"#fff",margin:0,fontSize:20,fontWeight:800 }}>Reports</h1>
            <p style={{ color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontSize:12 }}>
              {stats?.total_events?.toLocaleString()||0} total events · 30-day rolling view
            </p>
          </div>

          {/* Date range + exports */}
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{ padding:"7px 10px",borderRadius:8,border:`1px solid rgba(255,255,255,0.2)`,
                  background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:12 }}/>
              <span style={{ color:"rgba(255,255,255,0.4)" }}>→</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{ padding:"7px 10px",borderRadius:8,border:`1px solid rgba(255,255,255,0.2)`,
                  background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:12 }}/>
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button className="export-btn"
                onClick={()=>handleExport("audit","csv")}
                disabled={!!exporting}
                style={{ padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",
                  background:C.teal,color:"#fff",fontWeight:700,fontSize:11 }}>
                {exporting==="audit-csv"?"Exporting…":"⬇ Audit CSV"}
              </button>
              <button className="export-btn"
                onClick={()=>handleExport("audit","pdf")}
                disabled={!!exporting}
                style={{ padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",
                  background:C.teal,color:"#fff",fontWeight:700,fontSize:11 }}>
                {exporting==="audit-pdf"?"Generating…":"⬇ Audit PDF"}
              </button>
              <button className="export-btn"
                onClick={()=>handleExport("security","pdf")}
                disabled={!!exporting}
                style={{ padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
                  color:C.navy,fontWeight:800,fontSize:12,
                  boxShadow:"0 4px 14px rgba(200,150,12,0.35)" }}>
                {exporting==="security-pdf"?"Generating…":"📄 Security Report PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:"24px 28px",display:"flex",flexDirection:"column",gap:22 }}>

        {/* KPI Cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14 }}>
          <KpiCard label="Total Events"    value={stats?.total_events?.toLocaleString()||0}  sub="All time"         color={C.navy}   icon="📋" />
          <KpiCard label="Events (Month)"  value={stats?.events_month?.toLocaleString()||0}  sub="Last 30 days"     color={C.teal}   icon="📅" />
          <KpiCard label="Unique Actors"   value={stats?.unique_actors||0}                   sub="Last 30 days"     color={C.gold}   icon="👥" />
          <KpiCard label="Failed Logins"   value={stats?.failed_logins||0}                   sub="Last 30 days"     color={C.red}    icon="🔑" />
          <KpiCard label="Data Events"     value={stats?.data_events||0}                     sub="Create/Read/Write" color={C.orange} icon="🗂" />
          <KpiCard label="Open Alerts"     value={stats?.total_open||0}                      sub={`${stats?.total_critical||0} critical`} color={C.red} icon="🚨" />
        </div>

        {/* Charts row 1 */}
        <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:18 }}>

          {/* 14-day trend */}
          <SectionCard title="📈 14-Day Event Trend">
            <div style={{ padding:"16px 8px 8px" }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={daily} margin={{ left:-20 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.teal}  stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={C.teal}  stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.red}   stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={C.red}   stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false}/>
                  <XAxis dataKey="date" tick={{ fontSize:10,fill:C.muted }}
                    axisLine={false} tickLine={false} interval={1}/>
                  <YAxis tick={{ fontSize:10,fill:C.muted }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ fontSize:11,borderRadius:8,border:`1px solid ${C.border}` }}/>
                  <Legend wrapperStyle={{ fontSize:11 }}/>
                  <Area type="monotone" dataKey="total"  name="Total Events"
                    stroke={C.teal} strokeWidth={2} fill="url(#totalGrad)" dot={false}/>
                  <Area type="monotone" dataKey="failed" name="Failed Logins"
                    stroke={C.red}  strokeWidth={1.5} fill="url(#failGrad)" dot={false} strokeDasharray="4 2"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Category breakdown */}
          <SectionCard title="📊 Events by Category (30d)">
            <div style={{ padding:"12px 0" }}>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={byCategory.map(d=>({
                      name:d.category, value:d.count,
                      color:CATEGORY_COLORS[d.category]||C.muted
                    }))}
                    innerRadius={40} outerRadius={62} paddingAngle={3} dataKey="value">
                    {byCategory.map((d,i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[d.category]||C.muted}/>
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize:11,borderRadius:8 }}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ padding:"0 16px" }}>
                {byCategory.map(d => (
                  <div key={d.category} style={{ display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:6 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                      <span style={{ width:9,height:9,borderRadius:2,flexShrink:0,display:"inline-block",
                        background:CATEGORY_COLORS[d.category]||C.muted }}/>
                      <span style={{ fontSize:12,color:C.muted }}>{d.category}</span>
                    </div>
                    <span style={{ fontSize:12,fontWeight:700,color:C.navy }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Charts row 2 */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18 }}>

          {/* Top event types bar chart */}
          <SectionCard title="🏷 Top Event Types (30d)">
            <div style={{ padding:"12px 4px 8px" }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byType.map(d=>({
                    name:d.event_type.replace(/_/g," "),
                    count:d.count
                  }))} layout="vertical" margin={{ left:10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize:10,fill:C.muted }} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize:9,fill:C.muted }}
                    axisLine={false} tickLine={false} width={110}/>
                  <Tooltip contentStyle={{ fontSize:11,borderRadius:8 }}/>
                  <Bar dataKey="count" name="Events" fill={C.teal} radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Hourly heatmap */}
          <SectionCard title="⏰ Hourly Activity Heatmap (24h)">
            <div style={{ padding:"16px 18px" }}>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(24,1fr)",gap:3,marginBottom:8 }}>
                {hourly.map((h,i) => {
                  const total   = (h.auth_events||0) + (h.data_events||0);
                  const intensity = total / maxHourly;
                  const bg = intensity > 0.7 ? C.red :
                             intensity > 0.4 ? C.orange :
                             intensity > 0.1 ? C.gold :
                             intensity > 0   ? "#D4E6F1" : "#F0F3F5";
                  return (
                    <div key={i} title={`${h.hour}: ${total} events`}
                      style={{ height:32,borderRadius:4,background:bg,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        transition:"transform 0.1s",cursor:"default" }}>
                    </div>
                  );
                })}
              </div>
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                {["00","04","08","12","16","20","23"].map(h => (
                  <span key={h} style={{ fontSize:9,color:C.muted,fontFamily:"'DM Mono',monospace" }}>
                    {h}:00
                  </span>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:12,justifyContent:"center" }}>
                {[["None","#F0F3F5"],["Low","#D4E6F1"],["Med",C.gold],["High",C.orange],["Peak",C.red]].map(([l,c])=>(
                  <div key={l} style={{ display:"flex",alignItems:"center",gap:4 }}>
                    <span style={{ width:12,height:12,borderRadius:3,background:c,display:"inline-block" }}/>
                    <span style={{ fontSize:10,color:C.muted }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Top actors table */}
        <SectionCard title="👤 Most Active Users (30 days)"
          action={
            <span style={{ fontSize:11,color:C.muted }}>
              {topActors.length} users shown
            </span>
          }>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#F8F9FB" }}>
                  {["#","USER","NAME","EVENTS","SHARE"].map(h => (
                    <th key={h} style={{ padding:"10px 16px",fontSize:10,fontWeight:700,
                      color:C.muted,letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`,
                      textAlign:"left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topActors.map((a,i) => {
                  const pct = stats?.events_month
                    ? Math.round((a.count/stats.events_month)*100)
                    : 0;
                  return (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:"10px 16px",fontSize:13,fontWeight:800,
                        color:i===0?C.gold:i===1?"#B0B0B0":i===2?"#CD7F32":C.muted }}>
                        #{i+1}
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        <div style={{ fontSize:12,fontWeight:600,color:C.navy }}>
                          {a.actor__email}
                        </div>
                      </td>
                      <td style={{ padding:"10px 16px",fontSize:12,color:C.muted }}>
                        {a.actor__first_name} {a.actor__last_name}
                      </td>
                      <td style={{ padding:"10px 16px",fontSize:14,fontWeight:800,color:C.navy }}>
                        {a.count.toLocaleString()}
                      </td>
                      <td style={{ padding:"10px 16px",minWidth:140 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <div style={{ flex:1,height:6,borderRadius:3,
                            background:C.border,overflow:"hidden" }}>
                            <div style={{ width:`${pct}%`,height:"100%",
                              background:i===0?C.gold:C.teal,borderRadius:3 }}/>
                          </div>
                          <span style={{ fontSize:11,fontWeight:700,color:C.muted,minWidth:30 }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Report cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16 }}>
          {[
            {
              title: "Audit Trail Report",
              desc:  "Full chronological log of all system events. Filterable by date, actor, and event type.",
              icon:  "📋",
              color: C.teal,
              exports: [
                { label:"⬇ CSV", fmt:"csv", type:"audit" },
                { label:"⬇ PDF", fmt:"pdf", type:"audit" },
              ],
            },
            {
              title: "Security Summary Report",
              desc:  "Management-level KPI report — threat counts, top risks, resolution times. Board-ready PDF.",
              icon:  "🛡",
              color: C.navy,
              exports: [
                { label:"📄 PDF", fmt:"pdf", type:"security" },
              ],
            },
          ].map(r => (
            <div key={r.title} style={{ background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:10,padding:"20px",borderLeft:`4px solid ${r.color}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
                <span style={{ fontSize:24 }}>{r.icon}</span>
                <span style={{ fontSize:14,fontWeight:700,color:C.navy }}>{r.title}</span>
              </div>
              <p style={{ fontSize:12,color:C.muted,lineHeight:1.6,margin:"0 0 14px" }}>
                {r.desc}
              </p>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {r.exports.map(ex => (
                  <button key={ex.fmt} className="export-btn"
                    onClick={()=>handleExport(ex.type,ex.fmt)}
                    disabled={!!exporting}
                    style={{ padding:"9px 18px",borderRadius:8,border:"none",cursor:"pointer",
                      background:r.color,color:"#fff",fontWeight:700,fontSize:12 }}>
                    {exporting===`${ex.type}-${ex.fmt}`?"Generating…":ex.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ paddingTop:16,borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted }}>
          <span>Riba & Company Limited — DLMS v1.0 — All reports are audit-logged</span>
          <span>Reports are generated in real-time from the MySQL database</span>
        </div>
      </div>
    </div>
  );
}
