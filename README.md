# DLMS — Data Loss Management System
### Riba & Company Limited | Final Year University Project

> **Stack:** React 18 · Django 4.2 · MySQL 8 · Celery · Redis  
> **Author:** [Your Name] | [Your University] | [Year]

---

## � Quick Start Guide (TL;DR)

If you want to get running ASAP, follow this exact sequence:

```
1. Install Prerequisites → 2. Clone Repo → 3. Backend Setup → 4. Frontend Setup → 5. Run All Services
```

**Time needed:** ~15-20 minutes for first-time setup

---

## 🛠️ Step 1 — Install Prerequisites

Download and install these tools (in this exact order):

| Tool | Version | Windows Install | Mac/Linux Install |
|------|---------|-----------------|-------------------|
| **Git** | 2.40+ | [git-scm.com](https://git-scm.com/download/win) | `brew install git` |
| **Python** | 3.11+ | [python.org](https://www.python.org/downloads/) | `brew install python@3.11` |
| **Node.js** | 20 LTS | [nodejs.org](https://nodejs.org/) | `brew install node@20` |
| **MySQL** | 8.0 | [MySQL Installer](https://dev.mysql.com/downloads/installer/) | `brew install mysql@8.0` |
| **Redis** | 7.x | [Memurai](https://www.memurai.com/) (Windows) | `brew install redis` |

### ⚠️ Important Installation Notes:

- **Python:** During installation, check ✅ "Add Python to PATH"
- **MySQL:** When installing, set root password to `RootPass123!` (or remember yours)
- **Redis (Windows):** Use **Memurai** instead of native Redis — it works identically
- **Node.js:** Use the LTS version (20.x), not the latest

---

## 📂 Step 2 — Clone the Repository

```bash
# Open VS Code Terminal (Ctrl + `)
git clone https://github.com/Mac-Ian/Data-Loss-System.git
cd Data-Loss-System
```

---

## ⚙️ Step 3 — Backend Setup (Django)

### 3.1 Create Virtual Environment

```bash
# Inside Data-Loss-System folder
cd backend
python -m venv .venv
```

### 3.2 Activate Virtual Environment

```powershell
# Windows PowerShell (run this exact command):
.venv\Scripts\Activate.ps1

# If you get an error, run this first:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
# Then run the activate command again
```

```bash
# Mac/Linux:
source .venv/bin/activate
```

### 3.3 Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3.4 Configure Environment Variables

```bash
# Create .env file from template
copy .env.example .env

# OR manually create backend/.env with this content:
```

Create a file named `.env` in the `backend/` folder with:

```env
DJANGO_SECRET_KEY=dlms-riba-secret-key-change-in-production-2024
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=dlms_db
DB_USER=root
DB_PASSWORD=RootPass123!
DB_HOST=127.0.0.1
DB_PORT=3306

REDIS_URL=redis://127.0.0.1:6379/0
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

> **Note:** Change `DB_PASSWORD` to match your MySQL root password

### 3.5 Start MySQL and Create Database

```bash
# Windows - Start MySQL Service
# Open Services app → Find MySQL80 → Right-click → Start

# OR in terminal (admin):
net start mysql80
```

```sql
-- Open MySQL Workbench or mysql CLI and run:
CREATE DATABASE dlms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3.6 Run Database Migrations

```bash
# Make sure you're in backend/ with venv active
python manage.py migrate
```

### 3.7 Seed Initial Data (Important!)

Run these commands **in order** to populate the database:

```bash
python manage.py seed_data          # Creates roles, departments, demo users
python manage.py seed_rules         # Creates 7 classification rules
python manage.py seed_monitoring    # Creates 7 threat detection thresholds
python manage.py seed_alerts        # Creates 6 automated response policies
```

✅ **Backend is ready when you see "Operations applied successfully" messages**

---

## 🎨 Step 4 — Frontend Setup (React)

### 4.1 Navigate to Frontend

```bash
cd ..  # Go back to root
cd frontend
```

### 4.2 Install Dependencies

```bash
npm install
```

### 4.3 Configure Environment

```bash
# Create .env file
copy .env.example .env
```

Ensure `.env` in `frontend/` has:

```env
REACT_APP_API_URL=http://127.0.0.1:8000
```

---

## 🚀 Step 5 — Run All Services

You need to run **4 services simultaneously**. Open 4 separate terminal tabs in VS Code:

### 📟 Terminal 1 — MySQL (if not running as service)

```bash
# Windows (if using MySQL directly):
net start mysql80

# Or if using Memurai:
net start Memurai
```

### 📟 Terminal 2 — Redis

```bash
# Windows (Memurai):
net start Memurai

# Mac/Linux:
redis-server
```

### 📟 Terminal 3 — Django API + Celery

```bash
# Navigate to backend
cd backend

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Start Django server (keep this terminal open)
python manage.py runserver
```

> **Keep Terminal 3 running!** You'll see "Starting development server at http://127.0.0.1:8000"

### 📟 Terminal 4 — Celery Worker (Background Tasks)

```bash
# In a NEW terminal, same path:
cd backend
.venv\Scripts\Activate.ps1
celery -A dlms_backend worker -l info -P gevent
```

> **Keep Terminal 4 running!** You'll see "celery@... ready"

### 📟 Terminal 5 — Celery Beat (Scheduled Tasks)

```bash
# In another NEW terminal:
cd backend
.venv\Scripts\Activate.ps1
celery -A dlms_backend beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### 📟 Terminal 6 — React Frontend

```bash
# In a NEW terminal, go to frontend:
cd frontend
npm start
```

> **Keep Terminal 6 running!** Browser will open at http://localhost:3000

---

## ✅ Step 6 — Verify Everything is Working

### Check these URLs:

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Django API | http://127.0.0.1:8000/api/ | JSON response or 404 |
| React App | http://localhost:3000 | Login page loads |
| API Health | http://127.0.0.1:8000/api/auth/me/ | {"detail": "Authentication credentials were not provided."} |

### Login with Demo Accounts:

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@riba.ug | Admin@2024! |
| **Finance** | finance@riba.ug | Finance@2024! |
| **Operations** | operations@riba.ug | Ops@2024! |
| **Driver** | driver01@riba.ug | Driver@2024! |

---

## 🐳 Alternative — Run with Docker (Easier!)

If you prefer not to install MySQL/Redis locally, use Docker:

### Step 1 — Install Docker Desktop
Download from [docker.com](https://www.docker.com/products/docker-desktop)

### Step 2 — Run Everything with One Command

```bash
# In project root:
docker-compose up --build

# Wait for all containers to start (~3 minutes)
# Then seed the database in a new terminal:
docker-compose exec backend python manage.py seed_data
docker-compose exec backend python manage.py seed_rules
docker-compose exec backend python manage.py seed_monitoring
docker-compose exec backend python manage.py seed_alerts
```

### Step 3 — Open the App

```
Frontend:  http://localhost:3000
Backend:   http://127.0.0.1:8000
```

### Stop Docker:
```bash
docker-compose down
```

---

## 🔧 Troubleshooting Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: No module named 'django'` | Virtual env not activated | Run `.venv\Scripts\Activate.ps1` |
| `Can't connect to MySQL server` | MySQL not running | `net start mysql80` |
| `Can't connect to Redis server` | Redis not running | `net start Memurai` |
| `Port 8000 already in use` | Another process using port | `python manage.py runserver 8001` |
| `npm ERR!` when installing | Node version mismatch | Use Node.js 20 LTS |
| `CORS error` in browser | Frontend/Backend port mismatch | Check `REACT_APP_API_URL` in frontend/.env |
| `password authentication failed` | Wrong MySQL password | Update `DB_PASSWORD` in backend/.env |
| `celery worker not starting` | Redis not connected | Start Redis first, then restart celery |

### Quick Fix Commands:

```bash
# Kill process on port 8000
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Reset database (if needed)
python manage.py migrate --fake zero
python manage.py migrate
python manage.py seed_data
```

---

## �📁 Repository Structure

```
dlms-riba/                          ← Root of the GitHub repository
│
├── backend/                        ← Django backend (Python)
│   ├── manage.py                   ← Django CLI entry point
│   ├── requirements.txt            ← Python packages to install
│   ├── Dockerfile                  ← Docker image for the backend
│   ├── .env.example                ← Template for your .env file
│   │
│   ├── dlms_backend/               ← Django project config
│   │   ├── settings.py             ← Database, JWT, CORS, Celery config
│   │   ├── settings_production.py  ← Production overrides (HTTPS, etc.)
│   │   ├── urls.py                 ← Root URL router (all /api/ endpoints)
│   │   ├── celery.py               ← Celery app definition
│   │   └── wsgi.py                 ← WSGI entry for Gunicorn
│   │
│   ├── accounts/                   ← Phase 2: Auth & RBAC
│   │   ├── models.py               ← CustomUser, Role, Department, AccessLog, ThreatAlert, AuditTrail
│   │   ├── serializers.py          ← Login, Register, Profile serializers
│   │   ├── views.py                ← Login, Logout, Me, Users CRUD
│   │   ├── urls.py                 ← /api/auth/* and /api/users/* routes
│   │   ├── permissions.py          ← IsAdmin, IsFinance, IsOperations, IsDriver
│   │   ├── middleware.py           ← AccessLoggingMiddleware, RateLimitMiddleware
│   │   └── management/commands/
│   │       └── seed_data.py        ← Creates roles, departments & demo users
│   │
│   ├── data_classification/        ← Phase 3: Classification Engine
│   │   ├── models.py               ← ClassificationRule, ClassificationScan
│   │   ├── classifier.py           ← Core engine: classify_text(), classify_asset()
│   │   ├── serializers.py
│   │   ├── views.py                ← Asset CRUD, classify-preview, manual override
│   │   ├── urls.py                 ← /api/assets/* and /api/classification/rules/*
│   │   └── management/commands/
│   │       └── seed_rules.py       ← Seeds 7 classification rules
│   │
│   ├── monitoring/                 ← Phase 4: Threat Detection
│   │   ├── models.py               ← MonitoringRule, ThreatEvent, UserBehaviorProfile
│   │   ├── detector.py             ← 5 detectors + risk scorer
│   │   ├── tasks.py                ← Celery periodic tasks
│   │   ├── serializers.py
│   │   ├── views.py                ← /api/monitoring/* endpoints + SSE live feed
│   │   ├── urls.py
│   │   └── management/commands/
│   │       └── seed_monitoring.py  ← Seeds 7 monitoring thresholds
│   │
│   ├── alerts/                     ← Phase 5: Automated Response
│   │   ├── models.py               ← AlertPolicy, AlertNotification, AlertComment
│   │   ├── responder.py            ← run_response(), notify_by_email(), suspend_user()
│   │   ├── serializers.py
│   │   ├── views.py                ← Alert CRUD + resolve/escalate/assign actions
│   │   ├── urls.py                 ← /api/alerts/* endpoints
│   │   ├── tasks.py                ← Celery escalation task
│   │   └── management/commands/
│   │       └── seed_alerts.py      ← Seeds 6 response policies
│   │
│   ├── audit_logs/                 ← Phase 6: Audit & Reporting
│   │   ├── serializers.py
│   │   ├── report_generator.py     ← PDF (ReportLab) + CSV export functions
│   │   ├── views.py                ← /api/audit/* + /api/audit/export/
│   │   └── urls.py
│   │
│   └── docker/
│       └── mysql/
│           └── init.sql            ← Auto-runs when MySQL container first starts
│
├── frontend/                       ← React frontend (JavaScript)
│   ├── package.json                ← npm dependencies
│   ├── Dockerfile                  ← Multi-stage build (Node → Nginx)
│   ├── .env.example                ← Template for your .env file
│   │
│   └── src/
│       ├── index.js                ← React DOM entry point
│       ├── App.jsx                 ← Router — all page routes defined here
│       │
│       ├── services/
│       │   └── api.js              ← Axios instance with JWT auto-refresh
│       │
│       ├── context/
│       │   └── AuthContext.jsx     ← Global auth state + login/logout functions
│       │
│       ├── components/
│       │   └── ProtectedRoute.jsx  ← Guards routes by role (ADMIN, FINANCE, etc.)
│       │
│       └── pages/
│           ├── LoginPage.jsx       ← Phase 2: Login with demo credential cards
│           ├── Dashboard.jsx       ← Phase 1: Main KPI dashboard with charts
│           ├── DataAssetsPage.jsx  ← Phase 3: Asset table, upload modal, classify preview
│           ├── LiveMonitoringPage.jsx ← Phase 4: SSE feed, threat events, detector status
│           ├── AlertsPage.jsx      ← Phase 5: Alert table, detail drawer, resolve actions
│           ├── AuditLogPage.jsx    ← Phase 6: Audit trail (table + terminal view) + export
│           ├── ReportsPage.jsx     ← Phase 6: Charts, heatmap, PDF/CSV download
│           ├── UsersPage.jsx       ← Phase 7: User management, create/edit/suspend modals
│           └── SettingsPage.jsx    ← Phase 8: Password change, system info
│
├── docker-compose.yml              ← Runs all 6 services together
├── .gitignore
└── README.md                       ← This file
```

---

## 🚀 Option A — Run Locally (Recommended for Development)

### Prerequisites
Install these on your machine before starting:

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.11+ | python.org |
| Node.js | 20 LTS | nodejs.org |
| MySQL | 8.0 | mysql.com |
| Redis | 7 | redis.io (Mac/Linux) or Memurai (Windows) |
| Git | 2.40+ | git-scm.com |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/dlms-riba.git
cd dlms-riba
```

---

### Step 2 — Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac / Linux:
source venv/bin/activate

# Install Python packages
pip install -r requirements.txt
```

---

### Step 3 — Configure Environment Variables

```bash
# Copy the template
cp .env.example .env

# Open .env in VS Code and fill in your MySQL password:
code .env
```

Your `.env` file should look like this:

```
DJANGO_SECRET_KEY=any-long-random-string-here-50-chars
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=dlms_db
DB_USER=dlms_user
DB_PASSWORD=YOUR_ACTUAL_MYSQL_PASSWORD
DB_HOST=127.0.0.1
DB_PORT=3306

REDIS_URL=redis://127.0.0.1:6379/0
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

---

### Step 4 — Create the MySQL Database

Open MySQL Workbench or the MySQL terminal and run:

```sql
CREATE DATABASE dlms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dlms_user'@'localhost' IDENTIFIED BY 'YOUR_ACTUAL_MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON dlms_db.* TO 'dlms_user'@'localhost';
FLUSH PRIVILEGES;
```

---

### Step 5 — Run Migrations and Seed Data

```bash
# Make sure you are inside backend/ with venv active

python manage.py migrate

# Seed ALL reference data (run these in order):
python manage.py seed_data          # roles, departments, demo users
python manage.py seed_rules         # 7 classification rules
python manage.py seed_monitoring    # 7 threat detection thresholds
python manage.py seed_alerts        # 6 automated response policies
```

---

### Step 6 — Start All Services

Open **4 terminal windows** in VS Code (`Ctrl+`` then click `+`):

**Terminal 1 — Django API:**
```bash
cd backend
source venv/bin/activate   # or venv\Scripts\activate on Windows
python manage.py runserver
# ✅ Running at http://127.0.0.1:8000
```

**Terminal 2 — Celery Worker:**
```bash
cd backend
source venv/bin/activate
celery -A dlms_backend worker -l info
# ✅ Celery worker running (processes background tasks)
```

**Terminal 3 — Celery Beat (periodic tasks):**
```bash
cd backend
source venv/bin/activate
celery -A dlms_backend beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
# ✅ Celery beat running (scans every 60s)
```

**Terminal 4 — React Frontend:**
```bash
cd frontend
cp .env.example .env      # only needed once
npm install               # only needed once
npm start
# ✅ Running at http://localhost:3000
```

---

### Step 7 — Open the App

Go to **http://localhost:3000** and log in with any demo account:

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@riba.ug | Admin@2024! |
| **Finance** | finance@riba.ug | Finance@2024! |
| **Operations** | operations@riba.ug | Ops@2024! |
| **Driver** | driver01@riba.ug | Driver@2024! |
| **Guest** | guest@riba.ug | Guest@2024! |

---

## 🐳 Option B — Run with Docker (One Command)

> **Prerequisite:** Install [Docker Desktop](https://docker.com/products/docker-desktop)

```bash
git clone https://github.com/YOUR-USERNAME/dlms-riba.git
cd dlms-riba

# Create backend .env
cp backend/.env.example backend/.env
# Edit backend/.env and set your passwords, then:

# Build and start all 6 services
docker compose up --build

# In a second terminal, seed the database:
docker compose exec backend python manage.py seed_data
docker compose exec backend python manage.py seed_rules
docker compose exec backend python manage.py seed_monitoring
docker compose exec backend python manage.py seed_alerts
```

Open **http://localhost:3000** — the full app is running.

To stop everything:
```bash
docker compose down
```

---

## 🔗 URLs When Everything is Running

| URL | What it is |
|-----|-----------|
| http://localhost:3000 | React frontend (main app) |
| http://127.0.0.1:8000/api/ | Django REST API |
| http://127.0.0.1:8000/admin/ | Django admin panel |

---

## 🧩 System Modules Overview

| Phase | Module | Key Files |
|-------|--------|-----------|
| 1 | Dashboard & Models | `accounts/models.py`, `pages/Dashboard.jsx` |
| 2 | Authentication & RBAC | `accounts/views.py`, `pages/LoginPage.jsx`, `context/AuthContext.jsx` |
| 3 | Data Classification | `data_classification/classifier.py`, `pages/DataAssetsPage.jsx` |
| 4 | Threat Detection | `monitoring/detector.py`, `monitoring/tasks.py`, `pages/LiveMonitoringPage.jsx` |
| 5 | Automated Response | `alerts/responder.py`, `pages/AlertsPage.jsx` |
| 6 | Audit & Reports | `audit_logs/report_generator.py`, `pages/AuditLogPage.jsx`, `pages/ReportsPage.jsx` |
| 7 | User Management | `pages/UsersPage.jsx` |
| 8 | Settings & Deployment | `docker-compose.yml`, `pages/SettingsPage.jsx` |

---

## 🛡️ RBAC Role Permissions

| Feature | Admin | Finance | Operations | Driver | Guest |
|---------|-------|---------|-----------|--------|-------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Data Assets | ✅ | 👁 Read | ✅ | 👁 Own | 👁 |
| Live Monitoring | ✅ | ❌ | ✅ | ❌ | ❌ |
| Threat Alerts | ✅ | ❌ | ✅ | ❌ | ❌ |
| Audit Trail | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🔑 Key API Endpoints

```
POST   /api/auth/login/                 Login → returns JWT tokens
POST   /api/auth/logout/                Blacklist refresh token
GET    /api/auth/me/                    Current user profile
GET    /api/users/                      List users (Admin)
POST   /api/users/                      Create user (Admin)
GET    /api/assets/                     List data assets
POST   /api/assets/create/             Upload asset (auto-classifies)
POST   /api/assets/classify-preview/   Live classification preview
POST   /api/assets/{id}/classify/      Manual reclassify (Admin)
GET    /api/monitoring/events/stats/   Dashboard monitoring stats
GET    /api/monitoring/logs/           Access log feed
GET    /api/alerts/                    List threat alerts
POST   /api/alerts/{id}/resolve/       Resolve alert
POST   /api/alerts/{id}/escalate/      Escalate alert
GET    /api/audit/                     Audit trail (Admin)
GET    /api/audit/export/?fmt=pdf      Download PDF audit report
GET    /api/audit/export/?fmt=csv      Download CSV audit report
GET    /api/audit/security-report/     Management summary PDF
```

---

## 🐞 Troubleshooting

| Problem | Fix |
|---------|-----|
| `ModuleNotFoundError` | Virtual environment not active. Run `source venv/bin/activate` |
| `django.db.OperationalError` | MySQL not running, or wrong password in `.env` |
| `CORS policy blocked` | Check `REACT_APP_API_URL` in `frontend/.env` matches Django port |
| `401 Unauthorized` | Token expired — log out and log back in |
| `npm start` fails | Run `npm install` inside `frontend/` first |
| `Celery` not starting | Redis not running. Start Redis first |
| `Port 8000 in use` | Run `python manage.py runserver 8001` and update `frontend/.env` |
| PDF export fails | Run `pip install reportlab` inside the backend venv |

---

## 👥 Team Collaboration (Git Workflow)

```bash
# Every day, start by pulling latest changes
git pull origin main

# Create your own branch for the feature you are working on
git checkout -b feature/your-feature-name

# Work, then commit
git add .
git commit -m "feat: describe what you built"

# Push and open a Pull Request on GitHub
git push origin feature/your-feature-name
```

**Never push directly to `main`.** Always use Pull Requests.

---

*Riba & Company Limited — DLMS v1.0 — Final Year University Project*
