# DLMS – Riba & Company Ltd
## Phase-by-Phase Build Checklist

Use this as your prompt guide.  Each block = one focused session with Claude.

---

## ✅ PHASE 1 — COMPLETE (this session)
- [x] Full project folder structure (Django + React)
- [x] core `models.py`: User, Role, Department, DataAsset, AccessLog, ThreatAlert, AuditTrail
- [x] `settings.py` skeleton (MySQL, JWT, CORS, Celery)
- [x] React Dashboard layout (Sidebar, Header, StatCards, Charts, AlertTable, AuditLog)

---

## 🔲 PHASE 2 — Authentication & RBAC
**Prompt:** "Build Phase 2: Django JWT authentication for the DLMS.
Write accounts/serializers.py, accounts/views.py (register, login, logout,
refresh, me endpoints), accounts/permissions.py (IsAdmin, IsFinance,
IsOperations, IsDriver custom DRF permission classes), and
accounts/middleware.py (AccessLoggingMiddleware + RateLimitMiddleware).
Also write the React AuthContext, login page, and ProtectedRoute component."

Deliverables:
- [ ] `serializers.py` for User CRUD
- [ ] JWT login / refresh / logout endpoints
- [ ] Custom DRF permission classes per role
- [ ] `AccessLoggingMiddleware` → writes to AccessLog on every API call
- [ ] React: `AuthContext`, `useAuth` hook, Login page, `ProtectedRoute`

---

## 🔲 PHASE 3 — Data Classification Engine
**Prompt:** "Build Phase 3: the Data Classification Engine.
Write data_classification/models.py (ClassificationRule),
data_classification/classifier.py (rule-based + keyword scanner for L1/L2/L3),
data_classification/views.py (CRUD for assets + manual override endpoint),
and the React DataAssets page with an upload form, classification badge,
and filter/search table."

Deliverables:
- [ ] `ClassificationRule` model (keywords, patterns, regex)
- [ ] `classify_asset()` service function
- [ ] REST endpoints: list, retrieve, upload, reclassify
- [ ] React DataAssets page with table + upload modal

---

## 🔲 PHASE 4 — Real-Time Monitoring & Threat Detection
**Prompt:** "Build Phase 4: the Threat Detection Engine.
Write monitoring/detector.py with these detection functions:
  - detect_bulk_download(user, window_minutes=5, threshold=10)
  - detect_off_hours_access(access_log_entry)
  - detect_impossible_travel(user, new_ip)
  - detect_repeated_auth_failure(user, window_minutes=10)
  - score_risk(access_log_entry) → float 0–10
Wire them into a Celery task (tasks.py) that runs every 60 seconds.
Also create monitoring/views.py (live events endpoint with Django Channels
WebSocket) and a React LiveMonitoring page with a real-time event feed."

Deliverables:
- [ ] `detector.py` with 4+ detection algorithms
- [ ] `score_risk()` function
- [ ] Celery beat task every 60 s
- [ ] Django Channels WebSocket for live feed
- [ ] React LiveMonitoring page

---

## 🔲 PHASE 5 — Alerts & Automated Response
**Prompt:** "Build Phase 5: the Automated Response & Alerting module.
Write alerts/models.py (AlertPolicy), alerts/responder.py (auto-block user,
send email via Django email backend, create AuditTrail entry),
alerts/views.py (list/detail/resolve/escalate endpoints), and the React
AlertsPage with severity filters, a detail drawer, and resolve/escalate actions."

Deliverables:
- [ ] `AlertPolicy` model (rules that trigger auto-response)
- [ ] `responder.py`: auto-block, email notification, audit write
- [ ] DRF endpoints: list, detail, resolve, escalate, assign
- [ ] React AlertsPage

---

## 🔲 PHASE 6 — Audit Logs & Reporting
**Prompt:** "Build Phase 6: the Audit & Reporting module.
Write audit_logs/views.py (filterable list endpoint with date range,
actor, event_type), audit_logs/report_generator.py (PDF + CSV export
using ReportLab and Python csv), and the React Reports page with
date-range picker, summary charts (events by type, top users by event
count), and an Export button."

Deliverables:
- [ ] Audit log list endpoint (filters: date range, actor, event type)
- [ ] PDF report generation with ReportLab
- [ ] CSV export
- [ ] React Reports page with charts + export

---

## 🔲 PHASE 7 — Users & RBAC Management UI
**Prompt:** "Build Phase 7: the Users & RBAC management module.
Write accounts/admin_views.py (list users, create, update role/status,
suspend), and the React UsersPage with a data table (search, filter by
role/status, sortable), a Create User modal, an Edit Role modal, and
a Suspend User confirmation dialog."

Deliverables:
- [ ] Admin-only user management endpoints
- [ ] Role assignment endpoint
- [ ] React UsersPage: table, modals, confirmation dialogs

---

## 🔲 PHASE 8 — Settings, Hardening & Deployment Prep
**Prompt:** "Build Phase 8: system settings and deployment configuration.
Write a Django management command to seed the database (roles, departments,
demo admin user). Add MFA scaffold (TOTP via django-otp).
Write a docker-compose.yml for MySQL + Redis + Django + Celery + React.
Add a .env.example and a production settings override (DEBUG=False,
HTTPS redirects, security headers). Update the React Settings page
(password change, MFA toggle, session management)."

Deliverables:
- [ ] `seed_data` management command
- [ ] TOTP MFA scaffold
- [ ] `docker-compose.yml`
- [ ] `.env.example`
- [ ] Production settings
- [ ] React Settings page

---

## 🔲 PHASE 9 — Testing & Academic Documentation
**Prompt:** "Build Phase 9: testing suite and academic documentation.
Write pytest-django test cases for: authentication endpoints, classification
engine, 3 detection functions, alert creation flow, and the audit trail.
Also generate: an ER diagram description for 6 entities, a DFD Level 0
and Level 1 description (SSAD), and a README with setup instructions."

Deliverables:
- [ ] Unit tests (≥15 test cases)
- [ ] Integration tests for full alert flow
- [ ] ER diagram content
- [ ] DFD Level 0 + Level 1
- [ ] README.md

---

## Quick-Reference: Key API Endpoints

| Module          | Method | Endpoint                          | Auth Role     |
|-----------------|--------|-----------------------------------|---------------|
| Auth            | POST   | /api/auth/login/                  | Public        |
| Auth            | POST   | /api/auth/refresh/                | Authenticated |
| Users           | GET    | /api/users/                       | Admin         |
| Data Assets     | GET    | /api/assets/                      | All roles     |
| Data Assets     | POST   | /api/assets/                      | Admin, Ops    |
| Classification  | POST   | /api/assets/{id}/classify/        | Admin         |
| Access Logs     | GET    | /api/logs/                        | Admin, Ops    |
| Threat Alerts   | GET    | /api/alerts/                      | Admin, Ops    |
| Threat Alerts   | PATCH  | /api/alerts/{id}/resolve/         | Admin         |
| Audit Trail     | GET    | /api/audit/                       | Admin         |
| Reports         | GET    | /api/reports/export/?fmt=pdf      | Admin, Fin    |
| WebSocket       | WS     | ws://localhost:8000/ws/monitoring/ | Admin        |
