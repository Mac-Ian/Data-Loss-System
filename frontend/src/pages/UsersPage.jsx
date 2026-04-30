/**
 * src/pages/UsersPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 7
 *
 * Features:
 *   • Paginated, searchable, filterable users table
 *   • Role & department badges
 *   • Create User modal (with role/dept dropdowns)
 *   • Edit User modal (role, department, status)
 *   • Suspend / Activate confirmation dialogs
 *   • User detail drawer (access stats, recent activity)
 *   • RBAC role permissions matrix panel
 */

import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

// ── Brand tokens
const C = {
  navy:"#0D2137", navyL:"#163352", gold:"#C8960C", goldL:"#E8B420",
  teal:"#1A6B8A", red:"#C0392B", orange:"#D35400", green:"#1E8449",
  purple:"#7D3C98", white:"#F5F7FA", surface:"#FFFFFF",
  border:"#DEE4EC", muted:"#6B7C93",
};

const ROLE_CFG = {
  ADMIN:      { color:"#C8960C", bg:"rgba(200,150,12,0.12)",  icon:"⚡" },
  FINANCE:    { color:"#1E8449", bg:"rgba(30,132,73,0.12)",   icon:"💼" },
  OPERATIONS: { color:"#1A6B8A", bg:"rgba(26,107,138,0.12)",  icon:"🚛" },
  DRIVER:     { color:"#7D3C98", bg:"rgba(125,60,152,0.12)",  icon:"🔑" },
  GUEST:      { color:"#6B7C93", bg:"rgba(107,124,147,0.1)",  icon:"👤" },
};

const STATUS_CFG = {
  ACTIVE:    { color:"#1E8449", bg:"#D1FAE5", label:"Active" },
  SUSPENDED: { color:"#C0392B", bg:"#FEE2E2", label:"Suspended" },
  INACTIVE:  { color:"#6B7C93", bg:"#F3F4F6", label:"Inactive" },
};

// RBAC permissions matrix data
const PERMISSIONS_MATRIX = [
  { resource:"Dashboard",         ADMIN:"✅",FINANCE:"✅",OPERATIONS:"✅",DRIVER:"✅",GUEST:"✅" },
  { resource:"Data Assets",       ADMIN:"✅",FINANCE:"👁",OPERATIONS:"✅",DRIVER:"👁",GUEST:"👁" },
  { resource:"Create Assets",     ADMIN:"✅",FINANCE:"❌",OPERATIONS:"✅",DRIVER:"❌",GUEST:"❌" },
  { resource:"Classify Assets",   ADMIN:"✅",FINANCE:"❌",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
  { resource:"Live Monitoring",   ADMIN:"✅",FINANCE:"❌",OPERATIONS:"✅",DRIVER:"❌",GUEST:"❌" },
  { resource:"Threat Alerts",     ADMIN:"✅",FINANCE:"❌",OPERATIONS:"✅",DRIVER:"❌",GUEST:"❌" },
  { resource:"Resolve Alerts",    ADMIN:"✅",FINANCE:"❌",OPERATIONS:"✅",DRIVER:"❌",GUEST:"❌" },
  { resource:"Audit Trail",       ADMIN:"✅",FINANCE:"❌",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
  { resource:"Reports",           ADMIN:"✅",FINANCE:"✅",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
  { resource:"User Management",   ADMIN:"✅",FINANCE:"❌",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
  { resource:"System Settings",   ADMIN:"✅",FINANCE:"❌",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
  { resource:"Export Data",       ADMIN:"✅",FINANCE:"✅",OPERATIONS:"❌",DRIVER:"❌",GUEST:"❌" },
];

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
  : "—";

// ── Reusable components
function RoleBadge({ role }) {
  const cfg = ROLE_CFG[role] || ROLE_CFG.GUEST;
  return (
    <span style={{ display:"inline-flex",alignItems:"center",gap:5,
      padding:"3px 10px",borderRadius:5,fontSize:11,fontWeight:700,
      background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}30` }}>
      {cfg.icon} {role}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.INACTIVE;
  return (
    <span style={{ padding:"2px 9px",borderRadius:4,fontSize:11,fontWeight:600,
      background:cfg.bg,color:cfg.color }}>{cfg.label}</span>
  );
}

function Avatar({ name, size=32 }) {
  const initials = name?.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase() || "?";
  const colors   = [C.teal, C.gold, C.purple, C.green, C.orange];
  const color    = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div style={{ width:size,height:size,borderRadius:"50%",background:color,
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#fff",fontWeight:800,fontSize:size*0.38,flexShrink:0 }}>
      {initials}
    </div>
  );
}

// ── Modal wrapper
function Modal({ open, onClose, title, width=520, children }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:1100,
      background:"rgba(13,33,55,0.65)",backdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:C.surface,borderRadius:12,width,maxWidth:"100%",
        maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 24px 80px rgba(0,0,0,0.28)" }}>
        <div style={{ padding:"16px 22px",background:C.navy,
          display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
          <span style={{ color:"#fff",fontWeight:700,fontSize:14 }}>{title}</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.12)",border:"none",
            borderRadius:5,color:"#fff",cursor:"pointer",width:26,height:26,fontSize:15 }}>✕</button>
        </div>
        <div style={{ overflowY:"auto",flex:1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Field component
function Field({ label, children, required }) {
  return (
    <div>
      <label style={{ display:"block",fontSize:11,fontWeight:600,color:C.muted,
        marginBottom:5,letterSpacing:"0.04em" }}>
        {label}{required&&<span style={{ color:C.red }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width:"100%",padding:"10px 14px",borderRadius:8,boxSizing:"border-box",
  border:`1px solid ${C.border}`,fontSize:13,fontFamily:"inherit",
  outline:"none",color:C.navy,background:C.white,
};

// ── Create User Modal
function CreateUserModal({ open, onClose, onCreated, roles, departments }) {
  const [form, setForm]     = useState({
    email:"", first_name:"", last_name:"", employee_id:"",
    role_id:"", department_id:"", phone:"",
    password:"", password2:"",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);

  const upd = (k) => (e) => setForm(f=>({...f,[k]:e.target.value}));

  const handleSubmit = async () => {
    if (!form.email||!form.first_name||!form.last_name||!form.role_id||!form.password) {
      setError("Please fill in all required fields."); return;
    }
    if (form.password !== form.password2) {
      setError("Passwords do not match."); return;
    }
    setLoading(true); setError("");
    try {
      await api.post("/users/", {
        email:         form.email,
        first_name:    form.first_name,
        last_name:     form.last_name,
        employee_id:   form.employee_id || undefined,
        role_id:       form.role_id,
        department_id: form.department_id || undefined,
        phone:         form.phone || undefined,
        password:      form.password,
        password2:     form.password2,
      });
      onCreated();
      onClose();
      setForm({ email:"",first_name:"",last_name:"",employee_id:"",
        role_id:"",department_id:"",phone:"",password:"",password2:"" });
    } catch (e) {
      const data = e.response?.data;
      setError(
        data?.email?.[0] || data?.password?.[0] || data?.detail ||
        Object.values(data||{})[0]?.[0] || "Failed to create user."
      );
    } finally { setLoading(false); }
  };

  const sel = (k) => (
    <select value={form[k]} onChange={upd(k)}
      style={{ ...inputStyle }}>
      <option value="">— Select —</option>
      {k==="role_id"
        ? roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)
        : departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)
      }
    </select>
  );

  return (
    <Modal open={open} onClose={onClose} title="👤  Create New User" width={560}>
      <div style={{ padding:24,display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="First Name" required>
            <input style={inputStyle} value={form.first_name} onChange={upd("first_name")} placeholder="Patricia"/>
          </Field>
          <Field label="Last Name" required>
            <input style={inputStyle} value={form.last_name} onChange={upd("last_name")} placeholder="Nakato"/>
          </Field>
        </div>
        <Field label="Email Address" required>
          <input style={inputStyle} type="email" value={form.email} onChange={upd("email")}
            placeholder="patricia.nakato@riba.ug"/>
        </Field>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="Employee ID">
            <input style={inputStyle} value={form.employee_id} onChange={upd("employee_id")} placeholder="RCL-FIN-002"/>
          </Field>
          <Field label="Phone Number">
            <input style={inputStyle} value={form.phone} onChange={upd("phone")} placeholder="+256 700 000000"/>
          </Field>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="Role" required>{sel("role_id")}</Field>
          <Field label="Department">{sel("department_id")}</Field>
        </div>
        <div style={{ padding:"14px",borderRadius:8,background:"#F8F9FB",
          border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.muted,marginBottom:12 }}>SET PASSWORD</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <Field label="Password" required>
              <div style={{ position:"relative" }}>
                <input style={{ ...inputStyle,paddingRight:40 }}
                  type={showPw?"text":"password"} value={form.password}
                  onChange={upd("password")} placeholder="Min. 8 characters"/>
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                    background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:14 }}>
                  {showPw?"🙈":"👁"}
                </button>
              </div>
            </Field>
            <Field label="Confirm Password" required>
              <input style={inputStyle} type={showPw?"text":"password"}
                value={form.password2} onChange={upd("password2")} placeholder="Repeat password"/>
            </Field>
          </div>
        </div>

        {error && (
          <div style={{ background:"#FDE8E8",color:C.red,padding:"10px 14px",
            borderRadius:8,fontSize:13 }}>⚠️ {error}</div>
        )}
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px",borderRadius:8,
            border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding:"10px 24px",borderRadius:8,border:"none",cursor:"pointer",
              background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
              color:C.navy,fontWeight:800,fontSize:13 }}>
            {loading?"Creating…":"Create User"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit User Modal
function EditUserModal({ user, open, onClose, onUpdated, roles, departments }) {
  const [form, setForm]     = useState({});
  const [error, setError]   = useState("");
  const [loading,setLoading]= useState(false);

  useEffect(() => {
    if (user) setForm({
      first_name:    user.first_name    || "",
      last_name:     user.last_name     || "",
      employee_id:   user.employee_id   || "",
      phone:         user.phone         || "",
      role_id:       user.role?.id      || "",
      department_id: user.department?.id|| "",
      status:        user.status        || "ACTIVE",
    });
  }, [user]);

  const upd = (k) => (e) => setForm(f=>({...f,[k]:e.target.value}));

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      await api.patch(`/users/${user.id}/update/`, {
        first_name:    form.first_name,
        last_name:     form.last_name,
        employee_id:   form.employee_id || undefined,
        phone:         form.phone       || undefined,
        role_id:       form.role_id     || undefined,
        department_id: form.department_id || undefined,
        status:        form.status,
      });
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Update failed.");
    } finally { setLoading(false); }
  };

  if (!user) return null;

  return (
    <Modal open={open} onClose={onClose} title={`✏️  Edit — ${user.full_name}`} width={520}>
      <div style={{ padding:24,display:"flex",flexDirection:"column",gap:14 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="First Name">
            <input style={inputStyle} value={form.first_name||""} onChange={upd("first_name")}/>
          </Field>
          <Field label="Last Name">
            <input style={inputStyle} value={form.last_name||""} onChange={upd("last_name")}/>
          </Field>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="Employee ID">
            <input style={inputStyle} value={form.employee_id||""} onChange={upd("employee_id")}/>
          </Field>
          <Field label="Phone">
            <input style={inputStyle} value={form.phone||""} onChange={upd("phone")}/>
          </Field>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="Role">
            <select style={inputStyle} value={form.role_id||""} onChange={upd("role_id")}>
              <option value="">— Select Role —</option>
              {roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select style={inputStyle} value={form.department_id||""} onChange={upd("department_id")}>
              <option value="">— No Department —</option>
              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Account Status">
          <select style={inputStyle} value={form.status||"ACTIVE"} onChange={upd("status")}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>

        {error && <div style={{ background:"#FDE8E8",color:C.red,padding:"10px 14px",
          borderRadius:8,fontSize:13 }}>⚠️ {error}</div>}
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px",borderRadius:8,
            border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding:"10px 24px",borderRadius:8,border:"none",cursor:"pointer",
              background:C.navy,color:"#fff",fontWeight:700,fontSize:13 }}>
            {loading?"Saving…":"Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm dialog
function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, confirmColor }) {
  const [loading, setLoading] = useState(false);
  const go = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <div style={{ padding:24,display:"flex",flexDirection:"column",gap:16 }}>
        <p style={{ margin:0,fontSize:13,color:C.navy,lineHeight:1.7 }}>{message}</p>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px",borderRadius:8,
            border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13 }}>
            Cancel
          </button>
          <button onClick={go} disabled={loading}
            style={{ padding:"10px 24px",borderRadius:8,border:"none",cursor:"pointer",
              background:confirmColor||C.red,color:"#fff",fontWeight:700,fontSize:13 }}>
            {loading?"Processing…":confirmLabel||"Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── User detail drawer
function UserDrawer({ user, open, onClose, onEdit, onSuspend, onActivate, currentUserId }) {
  if (!open || !user) return null;
  const isSelf = user.id === currentUserId;
  const roleCfg = ROLE_CFG[user.role?.name] || ROLE_CFG.GUEST;

  return (
    <div style={{ position:"fixed",inset:0,zIndex:900,display:"flex",justifyContent:"flex-end" }}>
      <div onClick={onClose} style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.38)" }}/>
      <div style={{ position:"relative",width:420,height:"100%",background:C.surface,
        boxShadow:"-8px 0 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",
        zIndex:1,overflowY:"auto" }}>

        {/* Header */}
        <div style={{ padding:"24px",background:C.navy,flexShrink:0 }}>
          <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:16 }}>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.1)",border:"none",
              borderRadius:6,color:"#fff",cursor:"pointer",width:28,height:28,fontSize:15 }}>✕</button>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <Avatar name={user.full_name} size={52}/>
            <div>
              <div style={{ color:"#fff",fontWeight:800,fontSize:16 }}>{user.full_name}</div>
              <div style={{ color:"rgba(255,255,255,0.55)",fontSize:12,marginTop:2 }}>{user.email}</div>
              <div style={{ marginTop:8,display:"flex",gap:6,flexWrap:"wrap" }}>
                <RoleBadge role={user.role?.name||"GUEST"}/>
                <StatusBadge status={user.status}/>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:16 }}>
          {/* Info grid */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {[
              ["Employee ID",  user.employee_id||"—"],
              ["Department",   user.department?.name||"—"],
              ["Phone",        user.phone||"—"],
              ["MFA Enabled",  user.is_mfa_enabled?"✅ Yes":"❌ No"],
              ["Joined",       fmtDate(user.date_joined)],
              ["Last Login IP",user.last_login_ip||"—"],
              ["Failed Logins",user.failed_logins||0],
              ["Last Updated", fmtDate(user.updated_at)],
            ].map(([l,v])=>(
              <div key={l} style={{ background:"#F8F9FB",padding:"10px 12px",
                borderRadius:8,border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10,color:C.muted,fontWeight:600,
                  letterSpacing:"0.04em",marginBottom:3 }}>{l.toUpperCase()}</div>
                <div style={{ fontSize:12,fontWeight:600,color:C.navy,
                  fontFamily:l==="Last Login IP"||l==="Employee ID"?"'DM Mono',monospace":"inherit" }}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          {/* Role permissions */}
          <div>
            <div style={{ fontSize:11,color:C.muted,fontWeight:600,marginBottom:8 }}>
              ROLE PERMISSIONS — {user.role?.name||"GUEST"}
            </div>
            <div style={{ background:"#F8F9FB",borderRadius:8,border:`1px solid ${C.border}`,
              overflow:"hidden" }}>
              {(Object.entries(user.role?.permissions||{})).slice(0,6).map(([resource,perms],i)=>(
                <div key={resource} style={{ display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"8px 12px",
                  borderBottom:i<5?`1px solid ${C.border}`:"none",
                  background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
                  <span style={{ fontSize:12,color:C.navy,textTransform:"capitalize" }}>
                    {resource}
                  </span>
                  <div style={{ display:"flex",gap:4 }}>
                    {Array.isArray(perms)
                      ? perms.map(p=>(
                          <span key={p} style={{ padding:"1px 6px",borderRadius:3,fontSize:10,
                            fontWeight:600,background:roleCfg.bg,color:roleCfg.color }}>
                            {p}
                          </span>
                        ))
                      : <span style={{ fontSize:11,color:C.muted }}>{String(perms)}</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <button onClick={()=>{ onClose(); onEdit(user); }}
              style={{ padding:"11px",borderRadius:8,border:`1px solid ${C.border}`,
                background:C.white,fontWeight:700,cursor:"pointer",fontSize:13,
                color:C.navy,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
              ✏️ Edit User Details
            </button>
            {!isSelf && (
              user.status==="SUSPENDED" ? (
                <button onClick={()=>{ onClose(); onActivate(user); }}
                  style={{ padding:"11px",borderRadius:8,border:"none",
                    background:C.green,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13 }}>
                  ✅ Activate Account
                </button>
              ) : (
                <button onClick={()=>{ onClose(); onSuspend(user); }}
                  style={{ padding:"11px",borderRadius:8,border:"none",
                    background:C.red,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13 }}>
                  🚫 Suspend Account
                </button>
              )
            )}
            {isSelf && (
              <p style={{ fontSize:11,color:C.muted,textAlign:"center",margin:0 }}>
                You cannot suspend your own account.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RBAC Matrix Modal
function RBACMatrix({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="🛡  RBAC Permissions Matrix" width={720}>
      <div style={{ padding:20 }}>
        <p style={{ fontSize:12,color:C.muted,margin:"0 0 14px",lineHeight:1.6 }}>
          This matrix defines what each role can access within the DLMS.
          ✅ = Full access · 👁 = Read-only · ❌ = No access
        </p>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={{ padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,
                  color:"#fff",background:C.navy,borderBottom:`2px solid ${C.gold}` }}>
                  RESOURCE
                </th>
                {Object.keys(ROLE_CFG).map(role => (
                  <th key={role} style={{ padding:"10px 14px",textAlign:"center",fontSize:11,
                    fontWeight:700,color:"#fff",background:C.navy,
                    borderBottom:`2px solid ${C.gold}`,whiteSpace:"nowrap" }}>
                    <RoleBadge role={role}/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS_MATRIX.map((row,i) => (
                <tr key={row.resource} style={{ background:i%2===0?C.white:"#F8F9FB" }}>
                  <td style={{ padding:"10px 14px",fontSize:12,fontWeight:600,color:C.navy,
                    borderBottom:`1px solid ${C.border}` }}>
                    {row.resource}
                  </td>
                  {Object.keys(ROLE_CFG).map(role => (
                    <td key={role} style={{ padding:"10px 14px",textAlign:"center",
                      fontSize:16,borderBottom:`1px solid ${C.border}` }}>
                      {row[role]||"❌"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page
export default function UsersPage() {
  const { user:currentUser }            = useAuth();
  const [users,      setUsers]          = useState([]);
  const [roles,      setRoles]          = useState([]);
  const [departments,setDepts]          = useState([]);
  const [loading,    setLoading]        = useState(true);
  const [total,      setTotal]          = useState(0);
  const [page,       setPage]           = useState(1);
  const [search,     setSearch]         = useState("");
  const [fRole,      setFRole]          = useState("ALL");
  const [fStatus,    setFStatus]        = useState("ALL");

  // Modal states
  const [showCreate,   setShowCreate]   = useState(false);
  const [editUser,     setEditUser]     = useState(null);
  const [drawerUser,   setDrawerUser]   = useState(null);
  const [suspendUser,  setSuspendUser]  = useState(null);
  const [activateUser, setActivateUser] = useState(null);
  const [showMatrix,   setShowMatrix]   = useState(false);

  const PAGE_SIZE = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
      if (search)           params.append("search",    search);
      if (fRole !== "ALL")  params.append("role__name",fRole);
      if (fStatus!=="ALL")  params.append("status",    fStatus);
      const res = await api.get(`/users/?${params}`);
      setUsers(res.data.results || res.data);
      setTotal(res.data.count   || (res.data.results||res.data).length);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [page, search, fRole, fStatus]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    api.get("/roles/").then(r=>setRoles(r.data)).catch(()=>{});
    api.get("/departments/").then(r=>setDepts(r.data)).catch(()=>{});
  }, []);

  const doSuspend = async () => {
    await api.post(`/users/${suspendUser.id}/suspend/`);
    fetchUsers();
  };
  const doActivate = async () => {
    await api.post(`/users/${activateUser.id}/activate/`);
    fetchUsers();
  };

  // Role stats for header
  const roleCounts = {};
  users.forEach(u => {
    const r = u.role?.name || "GUEST";
    roleCounts[r] = (roleCounts[r]||0)+1;
  });

  const tbH = { padding:"9px 14px",fontSize:10,fontWeight:700,color:C.muted,
    letterSpacing:"0.04em",borderBottom:`2px solid ${C.border}`,
    background:"#F8F9FB",textAlign:"left",whiteSpace:"nowrap" };
  const tbD = { padding:"11px 14px",borderBottom:`1px solid ${C.border}`,
    fontSize:13,verticalAlign:"middle" };

  return (
    <div style={{ minHeight:"100vh",background:C.white,fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .user-row:hover { background:#F8FBFF !important; cursor:pointer; }
        .user-row { transition:background 0.12s; }
        .action-btn:hover { opacity:0.8; }
      `}</style>

      {/* Header */}
      <div style={{ background:C.navy,padding:"20px 28px",borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ color:C.gold,fontSize:10,fontWeight:600,letterSpacing:"0.08em",
              fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
              PHASE 7 — USER MANAGEMENT & RBAC
            </div>
            <h1 style={{ color:"#fff",margin:0,fontSize:20,fontWeight:800 }}>Users & RBAC</h1>
            <p style={{ color:"rgba(255,255,255,0.5)",margin:"4px 0 0",fontSize:12 }}>
              {total} users · {roles.length} roles · {departments.length} departments
            </p>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button onClick={()=>setShowMatrix(true)}
              style={{ padding:"10px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.2)",
                background:"transparent",color:"rgba(255,255,255,0.8)",cursor:"pointer",
                fontSize:12,fontWeight:600 }}>
              🛡 Permission Matrix
            </button>
            <button onClick={()=>setShowCreate(true)}
              style={{ padding:"10px 20px",borderRadius:8,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${C.gold},${C.goldL})`,
                color:C.navy,fontWeight:800,fontSize:13,
                boxShadow:"0 4px 14px rgba(200,150,12,0.4)" }}>
              + Add User
            </button>
          </div>
        </div>

        {/* Role breakdown bar */}
        <div style={{ display:"flex",gap:10,marginTop:16,flexWrap:"wrap" }}>
          {Object.entries(ROLE_CFG).map(([role,cfg]) => (
            <div key={role} style={{ padding:"7px 14px",borderRadius:8,
              background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",
              display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:14 }}>{cfg.icon}</span>
              <div>
                <div style={{ color:"rgba(255,255,255,0.45)",fontSize:9,fontWeight:600,letterSpacing:"0.06em" }}>
                  {role}
                </div>
                <div style={{ color:"#fff",fontSize:16,fontWeight:800,lineHeight:1.1 }}>
                  {roleCounts[role]||0}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding:"14px 28px",background:C.surface,borderBottom:`1px solid ${C.border}`,
        display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
        <input placeholder="🔍 Search by name, email, employee ID…"
          value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          style={{ flex:1,minWidth:240,padding:"9px 14px",borderRadius:8,
            border:`1px solid ${C.border}`,fontSize:13,outline:"none",fontFamily:"inherit" }}/>
        <select value={fRole} onChange={e=>{setFRole(e.target.value);setPage(1);}}
          style={{ padding:"9px 14px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:13,color:C.navy,background:C.white }}>
          <option value="ALL">All Roles</option>
          {roles.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
        <select value={fStatus} onChange={e=>{setFStatus(e.target.value);setPage(1);}}
          style={{ padding:"9px 14px",borderRadius:8,border:`1px solid ${C.border}`,
            fontSize:13,color:C.navy,background:C.white }}>
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button onClick={()=>{setSearch("");setFRole("ALL");setFStatus("ALL");setPage(1);}}
          style={{ padding:"9px 14px",borderRadius:8,border:`1px solid ${C.border}`,
            background:C.white,cursor:"pointer",fontSize:13,color:C.muted }}>
          ✕ Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ padding:"20px 28px" }}>
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`,
          background:C.surface }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["USER","EMAIL","ROLE","DEPARTMENT","STATUS","EMPLOYEE ID","JOINED","ACTIONS"].map(h=>(
                  <th key={h} style={tbH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding:40,textAlign:"center",color:C.muted }}>
                  Loading users…
                </td></tr>
              ) : users.length===0 ? (
                <tr><td colSpan={8} style={{ padding:40,textAlign:"center",color:C.muted }}>
                  No users match your filters.{" "}
                  <span style={{ color:C.teal,cursor:"pointer" }} onClick={()=>setShowCreate(true)}>
                    Create one →
                  </span>
                </td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="user-row" onClick={()=>setDrawerUser(u)}>
                  <td style={tbD}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <Avatar name={u.full_name} size={34}/>
                      <div>
                        <div style={{ fontWeight:700,color:C.navy }}>{u.full_name}</div>
                        {u.failed_logins>0 && (
                          <div style={{ fontSize:10,color:C.red,fontWeight:600 }}>
                            ⚠ {u.failed_logins} failed login{u.failed_logins>1?"s":""}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted,fontFamily:"'DM Mono',monospace" }}>
                    {u.email}
                  </td>
                  <td style={tbD}><RoleBadge role={u.role?.name||"GUEST"}/></td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted }}>{u.department?.name||"—"}</td>
                  <td style={tbD}><StatusBadge status={u.status}/></td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted,
                    fontFamily:"'DM Mono',monospace" }}>{u.employee_id||"—"}</td>
                  <td style={{ ...tbD,fontSize:12,color:C.muted,whiteSpace:"nowrap" }}>
                    {fmtDate(u.date_joined)}
                  </td>
                  <td style={tbD} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex",gap:6 }}>
                      <button className="action-btn"
                        onClick={()=>setEditUser(u)}
                        style={{ padding:"5px 10px",borderRadius:6,border:`1px solid ${C.border}`,
                          background:C.white,cursor:"pointer",fontSize:11,fontWeight:600,color:C.navy }}>
                        ✏️ Edit
                      </button>
                      {u.id !== currentUser?.id && (
                        u.status==="SUSPENDED" ? (
                          <button className="action-btn"
                            onClick={()=>setActivateUser(u)}
                            style={{ padding:"5px 10px",borderRadius:6,border:"none",
                              background:C.green,cursor:"pointer",fontSize:11,
                              fontWeight:600,color:"#fff" }}>
                            ✅
                          </button>
                        ) : (
                          <button className="action-btn"
                            onClick={()=>setSuspendUser(u)}
                            style={{ padding:"5px 10px",borderRadius:6,border:"none",
                              background:C.red,cursor:"pointer",fontSize:11,
                              fontWeight:600,color:"#fff" }}>
                            🚫
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display:"flex",justifyContent:"space-between",
            alignItems:"center",marginTop:14 }}>
            <span style={{ fontSize:12,color:C.muted }}>
              Showing {Math.min((page-1)*PAGE_SIZE+1,total)}–{Math.min(page*PAGE_SIZE,total)} of {total} users
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

      {/* ── Modals & drawers */}
      <CreateUserModal
        open={showCreate} onClose={()=>setShowCreate(false)}
        onCreated={fetchUsers} roles={roles} departments={departments}/>

      <EditUserModal
        user={editUser} open={!!editUser} onClose={()=>setEditUser(null)}
        onUpdated={fetchUsers} roles={roles} departments={departments}/>

      <UserDrawer
        user={drawerUser} open={!!drawerUser} onClose={()=>setDrawerUser(null)}
        onEdit={(u)=>setEditUser(u)} onSuspend={(u)=>setSuspendUser(u)}
        onActivate={(u)=>setActivateUser(u)} currentUserId={currentUser?.id}/>

      <ConfirmDialog
        open={!!suspendUser} onClose={()=>setSuspendUser(null)} onConfirm={doSuspend}
        title="🚫 Suspend User Account"
        message={`Are you sure you want to suspend ${suspendUser?.full_name}? They will be immediately logged out and unable to access the DLMS until reactivated.`}
        confirmLabel="Suspend Account" confirmColor={C.red}/>

      <ConfirmDialog
        open={!!activateUser} onClose={()=>setActivateUser(null)} onConfirm={doActivate}
        title="✅ Activate User Account"
        message={`Reactivate ${activateUser?.full_name}? They will regain access based on their assigned role.`}
        confirmLabel="Activate Account" confirmColor={C.green}/>

      <RBACMatrix open={showMatrix} onClose={()=>setShowMatrix(false)}/>
    </div>
  );
}
