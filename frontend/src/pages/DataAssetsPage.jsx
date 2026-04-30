/**
 * src/pages/DataAssetsPage.jsx
 * DLMS – Riba & Company Limited  —  Phase 3
 *
 * Features:
 *   • Filterable, searchable asset table
 *   • Classification badges (L1/L2/L3) with colour coding
 *   • Upload modal with live classify-preview
 *   • Manual reclassify modal (Admin only)
 *   • Asset detail drawer with scan history timeline
 *   • Stat summary bar
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

// ── Brand tokens
const C = {
  navy:     "#0D2137",
  navyL:    "#163352",
  gold:     "#C8960C",
  goldL:    "#E8B420",
  teal:     "#1A6B8A",
  tealL:    "#2590B5",
  white:    "#F5F7FA",
  surface:  "#FFFFFF",
  border:   "#DEE4EC",
  muted:    "#6B7C93",
  dark:     "#0D2137",
};

// ── Classification config
const CL = {
  L3: { label: "Confidential", color: "#C0392B", bg: "#FDE8E8", border: "#F5AEAE", icon: "🔴" },
  L2: { label: "Internal",     color: "#7D5A00", bg: "#FEF9E7", border: "#F9E49B", icon: "🟡" },
  L1: { label: "General",      color: "#145214", bg: "#EBF5EB", border: "#A9D6A9", icon: "🟢" },
};

const STATUS_COLORS = {
  ACTIVE:     { bg: "#D1FAE5", text: "#065F46" },
  ARCHIVED:   { bg: "#E0E7FF", text: "#3730A3" },
  QUARANTINE: { bg: "#FEE2E2", text: "#991B1B" },
  DELETED:    { bg: "#F3F4F6", text: "#6B7280" },
};

// ── Helpers
const fmtSize = (kb) => {
  if (!kb) return "—";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function ClassBadge({ level, size = "sm" }) {
  const cfg = CL[level] || CL.L1;
  const pad = size === "lg" ? "6px 14px" : "3px 10px";
  const fs  = size === "lg" ? 13 : 11;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: pad, borderRadius: 6, fontSize: fs, fontWeight: 700,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      letterSpacing: "0.03em",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.ACTIVE;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text,
    }}>{status}</span>
  );
}

// ── Modal wrapper
function Modal({ open, onClose, title, width = 560, children }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(13,33,55,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C.surface, borderRadius: 14, width, maxWidth: "100%",
        maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        border: `1px solid ${C.border}`,
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.navy,
        }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "'DM Mono', monospace" }}>
            {title}
          </span>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6,
            color: "#fff", cursor: "pointer", width: 28, height: 28, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Upload modal
function UploadModal({ open, onClose, onUploaded, departments }) {
  const [form, setForm]       = useState({ name: "", description: "", department: "", tags: "" });
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const dropRef = useRef();

  // Live classify-preview when name/file changes
  useEffect(() => {
    if (!form.name && !file) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api.post("/assets/classify-preview/", {
          text:      form.name + " " + form.description,
          filename:  file?.name || form.name,
          mime_type: file?.type || "",
        });
        setPreview(res.data);
      } catch { /* silently skip */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.name, form.description, file]);

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Asset name is required."); return; }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("name",        form.name);
      fd.append("description", form.description);
      if (form.department) fd.append("department", form.department);
      if (form.tags) fd.append("tags", JSON.stringify(form.tags.split(",").map(t => t.trim())));
      if (file) fd.append("file", file);

      await api.post("/assets/create/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inp = (placeholder, field, type = "text") => (
    <input
      type={type}
      placeholder={placeholder}
      value={form[field]}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: 8, boxSizing: "border-box",
        border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit",
        outline: "none", color: C.dark, background: C.white,
      }}
    />
  );

  return (
    <Modal open={open} onClose={onClose} title="📤  Register / Upload Asset" width={600}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById("file-input-dlms").click()}
          style={{
            border: `2px dashed ${file ? C.teal : C.border}`,
            borderRadius: 10, padding: "20px 16px", textAlign: "center",
            cursor: "pointer", background: file ? "rgba(26,107,138,0.04)" : "#FAFBFD",
            transition: "all 0.2s",
          }}
        >
          <input id="file-input-dlms" type="file" hidden onChange={e => setFile(e.target.files[0])} />
          <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
          {file ? (
            <>
              <div style={{ color: C.teal, fontWeight: 700, fontSize: 13 }}>{file.name}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{(file.size / 1024).toFixed(1)} KB</div>
            </>
          ) : (
            <>
              <div style={{ color: C.muted, fontSize: 13 }}>Drag & drop or click to browse</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>PDF, DOCX, XLSX, PNG — max 10 MB</div>
            </>
          )}
        </div>

        {/* Live preview */}
        {preview && (
          <div style={{
            padding: "12px 16px", borderRadius: 8,
            background: CL[preview.level]?.bg || "#F0F0F0",
            border: `1px solid ${CL[preview.level]?.border || "#ccc"}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>AUTO-CLASSIFICATION PREVIEW</div>
              <ClassBadge level={preview.level} size="lg" />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.muted }}>Confidence</div>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 18 }}>
                {Math.round((preview.confidence || 0) * 100)}%
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>ASSET NAME *</label>
            {inp("e.g. Q3 Payroll Report", "name")}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>DEPARTMENT</label>
            <select
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.dark, background: C.white }}
            >
              <option value="">— Select —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>DESCRIPTION</label>
          <textarea
            placeholder="Brief description of this asset…"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>TAGS (comma-separated)</label>
          {inp("e.g. finance, 2024, payroll", "tags")}
        </div>

        {error && (
          <div style={{ background: "#FDE8E8", color: "#C0392B", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{
            padding: "10px 24px", borderRadius: 8, border: "none",
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldL})`,
            color: C.navy, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13,
          }}>
            {loading ? "Uploading…" : "Register Asset"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reclassify modal
function ReclassifyModal({ asset, open, onClose, onDone }) {
  const [level,   setLevel]   = useState(asset?.classification || "L1");
  const [notes,   setNotes]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      await api.post(`/assets/${asset.id}/classify/`, { classification: level, notes });
      onDone();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Reclassification failed.");
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="🏷  Manual Reclassify" width={440}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#F8F9FB", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>ASSET</div>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{asset?.name}</div>
          <div style={{ marginTop: 6 }}><ClassBadge level={asset?.classification} /></div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>NEW CLASSIFICATION</label>
          <div style={{ display: "flex", gap: 10 }}>
            {["L1","L2","L3"].map(l => (
              <div key={l} onClick={() => setLevel(l)} style={{
                flex: 1, padding: "12px 8px", borderRadius: 8, textAlign: "center",
                cursor: "pointer", border: `2px solid ${level === l ? CL[l].color : C.border}`,
                background: level === l ? CL[l].bg : C.white,
                transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 18 }}>{CL[l].icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: CL[l].color, marginTop: 4 }}>{CL[l].label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>REASON / NOTES</label>
          <textarea
            placeholder="Explain why you're overriding the classification…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        {error && <div style={{ background: "#FDE8E8", color: "#C0392B", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>⚠️ {error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} style={{
            padding: "10px 24px", borderRadius: 8, border: "none",
            background: C.navy, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13,
          }}>
            {loading ? "Saving…" : "Apply Reclassify"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Asset detail drawer
function AssetDrawer({ asset, open, onClose, onReclassify, role }) {
  const [scans, setScans]   = useState([]);
  const [loading, setLoad]  = useState(false);

  useEffect(() => {
    if (!open || !asset) return;
    setLoad(true);
    api.get(`/assets/${asset.id}/scans/`).then(r => setScans(r.data.results || r.data)).catch(() => {}).finally(() => setLoad(false));
  }, [open, asset]);

  if (!open || !asset) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
      <div style={{
        position: "relative", width: 460, height: "100%",
        background: C.surface, boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", zIndex: 1,
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", background: C.navy, borderBottom: `1px solid rgba(255,255,255,0.1)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 4 }}>DATA ASSET</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, maxWidth: 320, wordBreak: "break-word" }}>{asset.name}</div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", width: 28, height: 28, fontSize: 16, flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ marginTop: 12 }}><ClassBadge level={asset.classification} size="lg" /></div>
        </div>

        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Metadata grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Status",     <StatusBadge status={asset.status} />],
              ["Size",       fmtSize(asset.file_size_kb)],
              ["Owner",      asset.owner_name || "—"],
              ["Department", asset.department_name || "—"],
              ["Created",    fmtDate(asset.created_at)],
              ["Encrypted",  asset.is_encrypted ? "🔒 Yes" : "🔓 No"],
              ["MIME Type",  asset.mime_type || "—"],
              ["Retention",  asset.retention_days ? `${asset.retention_days} days` : "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "#F8F9FB", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tags */}
          {asset.tags?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>TAGS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {asset.tags.map(t => (
                  <span key={t} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(26,107,138,0.1)", color: C.teal, fontSize: 11, fontWeight: 600 }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scan history */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 12 }}>CLASSIFICATION SCAN HISTORY</div>
            {loading ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Loading scans…</div>
            ) : scans.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>No scans recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {scans.map((sc, i) => (
                  <div key={sc.id} style={{ display: "flex", gap: 12, paddingBottom: 16, position: "relative" }}>
                    {/* Timeline line */}
                    {i < scans.length - 1 && <div style={{ position: "absolute", left: 11, top: 22, bottom: 0, width: 2, background: C.border }} />}
                    {/* Dot */}
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: CL[sc.level_after]?.bg || "#eee", border: `2px solid ${CL[sc.level_after]?.color || "#ccc"}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, zIndex: 1 }}>
                      {CL[sc.level_after]?.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
                          {sc.level_before_label} → {sc.level_after_label}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>{fmtDate(sc.scanned_at)}</div>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {sc.trigger} · {Math.round((sc.confidence || 0) * 100)}% confidence
                        {sc.rule_name && ` · Rule: ${sc.rule_name}`}
                      </div>
                      {sc.matched_terms?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                          {sc.matched_terms.slice(0, 3).map((t, j) => (
                            <span key={j} style={{ padding: "1px 6px", borderRadius: 4, background: "#F0F0F0", fontSize: 10, color: C.muted }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {role === "ADMIN" && (
            <button onClick={() => { onClose(); onReclassify(asset); }} style={{
              padding: "11px 0", width: "100%", borderRadius: 8, border: `1px solid ${C.navy}`,
              background: C.navy, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>
              🏷 Manual Reclassify
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page
export default function DataAssetsPage() {
  const { role }                   = useAuth();
  const [assets, setAssets]        = useState([]);
  const [loading, setLoading]      = useState(true);
  const [departments, setDepts]    = useState([]);
  const [search, setSearch]        = useState("");
  const [filterCL, setFilterCL]    = useState("ALL");
  const [filterStatus, setFilterS] = useState("ACTIVE");
  const [showUpload, setUpload]    = useState(false);
  const [drawerAsset, setDrawer]   = useState(null);
  const [reclassAsset, setReclass] = useState(null);
  const [page, setPage]            = useState(1);
  const [total, setTotal]          = useState(0);
  const PAGE_SIZE = 20;

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
      if (search)            params.append("search", search);
      if (filterCL !== "ALL") params.append("classification", filterCL);
      if (filterStatus !== "ALL") params.append("status", filterStatus);
      const res = await api.get(`/assets/?${params}`);
      setAssets(res.data.results || res.data);
      setTotal(res.data.count || (res.data.results || res.data).length);
    } catch { /* handle gracefully */ }
    finally { setLoading(false); }
  }, [search, filterCL, filterStatus, page]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { api.get("/departments/").then(r => setDepts(r.data)); }, []);

  // Stats
  const counts = { L3: 0, L2: 0, L1: 0, TOTAL: assets.length };
  assets.forEach(a => { if (counts[a.classification] !== undefined) counts[a.classification]++; });

  const tbH = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.04em", borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap", background: "#F8F9FB" };
  const tbD = { padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13, verticalAlign: "middle" };

  return (
    <div style={{ minHeight: "100vh", background: C.white, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .asset-row:hover { background: #F8FBFF !important; }
        .asset-row { transition: background 0.12s; cursor: pointer; }
        .filter-btn { transition: all 0.15s; }
        .filter-btn:hover { opacity: 0.85; }
      `}</style>

      {/* ── Page Header */}
      <div style={{ background: C.navy, padding: "24px 32px", borderBottom: `3px solid ${C.gold}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>PHASE 3 — DATA CLASSIFICATION ENGINE</div>
            <h1 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 800 }}>Data Assets</h1>
            <p style={{ color: "rgba(255,255,255,0.5)", margin: "4px 0 0", fontSize: 13 }}>
              {total} assets · Auto-classified by keyword, pattern &amp; MIME analysis
            </p>
          </div>
          {(role === "ADMIN" || role === "OPERATIONS") && (
            <button onClick={() => setUpload(true)} style={{
              padding: "12px 22px", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldL})`,
              color: C.navy, fontWeight: 800, cursor: "pointer", fontSize: 13,
              boxShadow: "0 4px 14px rgba(200,150,12,0.4)",
            }}>
              + Register Asset
            </button>
          )}
        </div>

        {/* Stat bar */}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {[
            { label: "TOTAL ASSETS",  value: total,       color: "#fff",    bg: "rgba(255,255,255,0.1)" },
            { label: "CONFIDENTIAL",  value: counts.L3,   color: "#FF8A80", bg: "rgba(192,57,43,0.2)"  },
            { label: "INTERNAL",      value: counts.L2,   color: C.goldL,   bg: "rgba(200,150,12,0.2)" },
            { label: "GENERAL",       value: counts.L1,   color: "#69F0AE", bg: "rgba(30,132,73,0.2)"  },
          ].map(s => (
            <div key={s.label} style={{ padding: "10px 18px", borderRadius: 8, background: s.bg, border: `1px solid rgba(255,255,255,0.1)` }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters + Search */}
      <div style={{ padding: "16px 32px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="🔍  Search assets…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 220, padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {["ALL", "L3", "L2", "L1"].map(l => (
            <button key={l} className="filter-btn" onClick={() => { setFilterCL(l); setPage(1); }} style={{
              padding: "8px 14px", borderRadius: 6, border: `1px solid ${filterCL === l ? CL[l]?.color || C.navy : C.border}`,
              background: filterCL === l ? (CL[l]?.bg || C.navy) : C.white,
              color: filterCL === l ? (CL[l]?.color || "#fff") : C.muted,
              fontWeight: filterCL === l ? 700 : 400, cursor: "pointer", fontSize: 12,
            }}>
              {l === "ALL" ? "All" : CL[l].label}
            </button>
          ))}
        </div>
        <select value={filterStatus} onChange={e => { setFilterS(e.target.value); setPage(1); }}
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.dark, background: C.white }}>
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="QUARANTINE">Quarantined</option>
        </select>
      </div>

      {/* ── Table */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}`, marginTop: 20, background: C.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={tbH}>ASSET NAME</th>
                <th style={tbH}>CLASSIFICATION</th>
                <th style={tbH}>STATUS</th>
                <th style={tbH}>OWNER</th>
                <th style={tbH}>DEPARTMENT</th>
                <th style={tbH}>SIZE</th>
                <th style={tbH}>CREATED</th>
                <th style={tbH}>ENC.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading assets…</td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: C.muted }}>
                  No assets found.{" "}
                  {(role === "ADMIN" || role === "OPERATIONS") && (
                    <span style={{ color: C.teal, cursor: "pointer" }} onClick={() => setUpload(true)}>Register one →</span>
                  )}
                </td></tr>
              ) : assets.map(a => (
                <tr key={a.id} className="asset-row" onClick={() => setDrawer(a)}>
                  <td style={{ ...tbD, fontWeight: 600, color: C.navy, maxWidth: 240 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    {a.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                        {a.tags.slice(0,2).map(t => <span key={t} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "#EEF2FF", color: C.teal }}>{t}</span>)}
                      </div>
                    )}
                  </td>
                  <td style={tbD}><ClassBadge level={a.classification} /></td>
                  <td style={tbD}><StatusBadge status={a.status} /></td>
                  <td style={{ ...tbD, color: C.muted }}>{a.owner_name || "—"}</td>
                  <td style={{ ...tbD, color: C.muted }}>{a.department_name || "—"}</td>
                  <td style={{ ...tbD, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmtSize(a.file_size_kb)}</td>
                  <td style={{ ...tbD, color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</td>
                  <td style={{ ...tbD, textAlign: "center" }}>{a.is_encrypted ? "🔒" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: page > 1 ? "pointer" : "not-allowed", fontSize: 13 }}>← Prev</button>
            <span style={{ padding: "7px 14px", fontSize: 13, color: C.muted }}>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
            <button disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 13 }}>Next →</button>
          </div>
        )}
      </div>

      {/* ── Modals */}
      <UploadModal open={showUpload} onClose={() => setUpload(false)} onUploaded={fetchAssets} departments={departments} />
      {reclassAsset && <ReclassifyModal asset={reclassAsset} open={!!reclassAsset} onClose={() => setReclass(null)} onDone={fetchAssets} />}
      <AssetDrawer asset={drawerAsset} open={!!drawerAsset} onClose={() => setDrawer(null)} onReclassify={(a) => { setDrawer(null); setReclass(a); }} role={role} />
    </div>
  );
}
