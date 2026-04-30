/**
 * src/pages/SettingsPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 8
 *
 * Features:
 *   • Change password form
 *   • Profile info display
 *   • System information panel
 *   • Active sessions info
 *   • Theme / preferences (placeholder for future)
 */

import { useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const C = {
  navy:"#0D2137", navyL:"#163352", gold:"#C8960C", goldL:"#E8B420",
  teal:"#1A6B8A", red:"#C0392B", green:"#1E8449",
  white:"#F5F7FA", surface:"#FFFFFF", border:"#DEE4EC", muted:"#6B7C93",
};

const ROLE_CFG = {
  ADMIN:      { color:"#C8960C", bg:"rgba(200,150,12,0.12)", icon:"⚡" },
  FINANCE:    { color:"#1E8449", bg:"rgba(30,132,73,0.12)",  icon:"💼" },
  OPERATIONS: { color:"#1A6B8A", bg:"rgba(26,107,138,0.12)", icon:"🚛" },
  DRIVER:     { color:"#7D3C98", bg:"rgba(125,60,152,0.12)", icon:"🔑" },
  GUEST:      { color:"#6B7C93", bg:"rgba(107,124,147,0.1)", icon:"👤" },
};

function SectionCard({ title, icon, children }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,
      borderRadius:10,overflow:"hidden" }}>
      <div style={{ padding:"14px 20px",borderBottom:`1px solid ${C.border}`,
        background:"#FAFBFD",display:"flex",alignItems:"center",gap:8 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontSize:13,fontWeight:700,color:C.navy }}>{title}</span>
      </div>
      <div style={{ padding:"20px" }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"10px 0",borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:12,color:C.muted,fontWeight:600 }}>{label}</span>
      <span style={{ fontSize:13,color:C.navy,fontWeight:600,
        fontFamily:mono?"'DM Mono',monospace":"inherit" }}>{value}</span>
    </div>
  );
}

function Avatar({ name, size=56 }) {
  const initials = name?.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()||"?";
  const colors   = [C.teal, C.gold, "#7D3C98", C.green, "#D35400"];
  const color    = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div style={{ width:size,height:size,borderRadius:"50%",background:color,
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#fff",fontWeight:900,fontSize:size*0.38,flexShrink:0 }}>
      {initials}
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const roleCfg = ROLE_CFG[user?.role?.name] || ROLE_CFG.GUEST;

  // Password change state
  const [pwForm, setPwForm]       = useState({ current:"", new:"", confirm:"" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg]         = useState(null);   // { type:"success"|"error", text }
  const [showPw, setShowPw]       = useState(false);

  const handlePwChange = async () => {
    if (!pwForm.current || !pwForm.new || !pwForm.confirm) {
      setPwMsg({ type:"error", text:"All fields are required." }); return;
    }
    if (pwForm.new !== pwForm.confirm) {
      setPwMsg({ type:"error", text:"New passwords do not match." }); return;
    }
    if (pwForm.new.length < 8) {
      setPwMsg({ type:"error", text:"Password must be at least 8 characters." }); return;
    }
    setPwLoading(true); setPwMsg(null);
    try {
      await api.post("/auth/password/", {
        current_password: pwForm.current,
        new_password:     pwForm.new,
        new_password2:    pwForm.confirm,
      });
      setPwMsg({ type:"success", text:"Password changed successfully." });
      setPwForm({ current:"", new:"", confirm:"" });
    } catch (e) {
      const data = e.response?.data;
      setPwMsg({ type:"error",
        text: data?.current_password?.[0] || data?.new_password?.[0] ||
              data?.detail || "Password change failed." });
    } finally { setPwLoading(false); }
  };

  const inp = (placeholder, field, isNew=false) => (
    <div style={{ position:"relative" }}>
      <input
        type={showPw?"text":"password"}
        placeholder={placeholder}
        value={pwForm[field]}
        onChange={e=>setPwForm(f=>({...f,[field]:e.target.value}))}
        style={{ width:"100%",padding:"10px 40px 10px 14px",borderRadius:8,
          border:`1px solid ${C.border}`,fontSize:13,fontFamily:"inherit",
          outline:"none",boxSizing:"border-box",color:C.navy }}
      />
      {isNew && (
        <button type="button" onClick={()=>setShowPw(v=>!v)}
          style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:14 }}>
          {showPw?"🙈":"👁"}
        </button>
      )}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:C.white,fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ background:C.navy,padding:"20px 28px",borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ color:C.gold,fontSize:10,fontWeight:600,
          letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
          PHASE 8 — SETTINGS & CONFIGURATION
        </div>
        <h1 style={{ color:"#fff",margin:0,fontSize:20,fontWeight:800 }}>Account Settings</h1>
        <p style={{ color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontSize:12 }}>
          Manage your profile, security preferences, and session
        </p>
      </div>

      <div style={{ padding:"24px 28px",display:"grid",
        gridTemplateColumns:"300px 1fr",gap:20,maxWidth:1100 }}>

        {/* ── Left column: profile card ── */}
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

          {/* Profile card */}
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:10,overflow:"hidden" }}>
            <div style={{ background:C.navy,padding:"24px 20px",
              display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
              <Avatar name={user?.full_name} size={64}/>
              <div style={{ textAlign:"center" }}>
                <div style={{ color:"#fff",fontWeight:800,fontSize:16 }}>{user?.full_name}</div>
                <div style={{ color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:2 }}>{user?.email}</div>
                <div style={{ marginTop:10 }}>
                  <span style={{ display:"inline-flex",alignItems:"center",gap:5,
                    padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:700,
                    background:roleCfg.bg,color:roleCfg.color,border:`1px solid ${roleCfg.color}30` }}>
                    {roleCfg.icon} {user?.role?.name||"GUEST"}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ padding:"14px 20px" }}>
              <InfoRow label="Employee ID"  value={user?.employee_id||"—"} mono/>
              <InfoRow label="Department"   value={user?.department?.name||"—"}/>
              <InfoRow label="Phone"        value={user?.phone||"—"}/>
              <InfoRow label="MFA Enabled"  value={user?.is_mfa_enabled?"✅ Yes":"❌ No"}/>
              <InfoRow label="Last Login IP"value={user?.last_login_ip||"—"} mono/>
              <InfoRow label="Account Status" value={user?.status||"ACTIVE"}/>
            </div>
          </div>

          {/* Sign out */}
          <button onClick={logout}
            style={{ padding:"11px",borderRadius:8,border:`1px solid ${C.red}`,
              background:"#FEF2F2",color:C.red,fontWeight:700,cursor:"pointer",
              fontSize:13,width:"100%" }}>
            🚪 Sign Out of DLMS
          </button>
        </div>

        {/* ── Right column ── */}
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

          {/* Change password */}
          <SectionCard title="Change Password" icon="🔐">
            <div style={{ display:"flex",flexDirection:"column",gap:12,maxWidth:420 }}>
              <div>
                <label style={{ display:"block",fontSize:11,fontWeight:600,
                  color:C.muted,marginBottom:5 }}>CURRENT PASSWORD</label>
                {inp("Enter your current password","current")}
              </div>
              <div>
                <label style={{ display:"block",fontSize:11,fontWeight:600,
                  color:C.muted,marginBottom:5 }}>NEW PASSWORD</label>
                {inp("Min. 8 characters","new",true)}
              </div>
              <div>
                <label style={{ display:"block",fontSize:11,fontWeight:600,
                  color:C.muted,marginBottom:5 }}>CONFIRM NEW PASSWORD</label>
                {inp("Repeat new password","confirm")}
              </div>

              {pwMsg && (
                <div style={{ padding:"10px 14px",borderRadius:8,fontSize:13,
                  background:pwMsg.type==="success"?"#D1FAE5":"#FEE2E2",
                  color:pwMsg.type==="success"?C.green:C.red }}>
                  {pwMsg.type==="success"?"✅":"⚠️"} {pwMsg.text}
                </div>
              )}

              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>{setPwForm({current:"",new:"",confirm:""});setPwMsg(null);}}
                  style={{ padding:"10px 20px",borderRadius:8,border:`1px solid ${C.border}`,
                    background:C.white,cursor:"pointer",fontSize:13,color:C.muted }}>
                  Clear
                </button>
                <button onClick={handlePwChange} disabled={pwLoading}
                  style={{ padding:"10px 24px",borderRadius:8,border:"none",
                    background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
                    color:C.navy,fontWeight:800,cursor:pwLoading?"not-allowed":"pointer",fontSize:13 }}>
                  {pwLoading?"Changing…":"Update Password"}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* System information */}
          <SectionCard title="System Information" icon="ℹ️">
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              {[
                ["System",       "DLMS v1.0"],
                ["Organisation", "Riba & Company Limited"],
                ["Backend",      "Django 4.2 + DRF 3.15"],
                ["Frontend",     "React 18 + Recharts"],
                ["Database",     "MySQL 8.0"],
                ["Task Queue",   "Celery 5.3 + Redis 7"],
                ["Auth Method",  "JWT (SimpleJWT)"],
                ["PDF Engine",   "ReportLab 4.2"],
              ].map(([label,value]) => (
                <div key={label} style={{ background:"#F8F9FB",padding:"12px",
                  borderRadius:8,border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10,color:C.muted,fontWeight:600,
                    letterSpacing:"0.04em",marginBottom:3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.navy }}>{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Security modules status */}
          <SectionCard title="Security Modules Status" icon="🛡">
            <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
              {[
                { label:"Authentication & RBAC",       phase:"Phase 2", status:"ACTIVE" },
                { label:"Data Classification Engine",  phase:"Phase 3", status:"ACTIVE" },
                { label:"Real-Time Threat Detection",  phase:"Phase 4", status:"ACTIVE" },
                { label:"Automated Response Engine",   phase:"Phase 5", status:"ACTIVE" },
                { label:"Audit Logging & Reporting",   phase:"Phase 6", status:"ACTIVE" },
                { label:"User & RBAC Management",      phase:"Phase 7", status:"ACTIVE" },
              ].map((m,i) => (
                <div key={m.label} style={{ display:"flex",alignItems:"center",
                  justifyContent:"space-between",padding:"11px 0",
                  borderBottom:i<5?`1px solid ${C.border}`:"none" }}>
                  <div>
                    <div style={{ fontSize:13,fontWeight:600,color:C.navy }}>{m.label}</div>
                    <div style={{ fontSize:11,color:C.muted }}>{m.phase}</div>
                  </div>
                  <span style={{ display:"inline-flex",alignItems:"center",gap:5,
                    padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                    background:"#D1FAE5",color:C.green }}>
                    <span style={{ width:6,height:6,borderRadius:"50%",background:C.green,
                      display:"inline-block" }}/>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* MFA placeholder */}
          <SectionCard title="Multi-Factor Authentication" icon="📱">
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"4px 0" }}>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:C.navy }}>TOTP Authenticator</div>
                <div style={{ fontSize:12,color:C.muted,marginTop:2 }}>
                  Use Google Authenticator, Authy, or any TOTP app
                </div>
              </div>
              <div style={{ padding:"8px 16px",borderRadius:8,
                background:"#FEF3C7",color:"#92400E",fontSize:12,fontWeight:600 }}>
                Coming in Phase 8+
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
