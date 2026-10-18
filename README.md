<div align="center">

# 📱 Mahfooz Mobile

### A Secure Citizen-Facing System for Reporting and Blocking Stolen Mobile Phones

> **CY-321 — Secure Software Design**
> **Instructor:** Dr. Zubair Ahmad
> **Instructor Git-Hub:**[@ZAhmaad](https://github.com/ZAhmaad) | 
> **Institution:** Faculty of Computer Science & Engineering, Ghulam Ishaq Khan Institute (GIKI)


<div align="center">
<sub>Developed as an academic project. Not affiliated with PTA or NADRA. Uses mocked government data for demonstration purposes only.</sub>
</div>
</div>
---

## 👥 Group Members

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/mhariszaffar">
        <img src="https://github.com/mhariszaffar.png" width="100px;" alt="Haris"/>
        <br />
        <b>Muhammad Haris Zafar</b>
      </a>
      <br />
      <a href="https://github.com/mhariszaffar">github.com/mhariszaffar</a>
    </td>
    <td align="center">
      <a href="https://github.com/abdullahk150">
        <img src="https://github.com/abdullahk150.png" width="100px;" alt="Abdullah"/>
        <br />
        <b>Muhammad Abdullah Kaleem</b>
      </a>
      <br />
      <a href="https://github.com/abdullahk150">github.com/abdullahk150</a>
    </td>
    <td align="center">
      <a href="https://github.com/naqi005">
        <img src="https://github.com/naqi005.png" width="100px;" alt="Naqi"/>
        <br />
        <b>Muhammad Naqi Afaq</b>
      </a>
      <br />
      <a href="https://github.com/naqi005">github.com/naqi005</a>
    </td>
    <td align="center">
      <a href="https://github.com/ibrahim-gulzar-11">
        <img src="https://github.com/ibrahim-gulzar-11.png" width="100px;" alt="Ibrahim"/>
        <br />
        <b>Muhammad Ibrahim Gulzar</b>
      </a>
      <br />
      <a href="https://github.com/ibrahim-gulzar-11">github.com/ibrahim-gulzar</a>
    </td>
  </tr>
</table>

---






*Built for **CY321 — Secure Software Design** · Ghulam Ishaq Khan Institute (GIKI)*

![Frontend](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JS-e34c26)
![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-3c873a)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791)
![Security](https://img.shields.io/badge/Focus-Secure%20by%20Design-1f4e79)

</div>

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [The Problem](#-the-problem)
3. [Features](#-features)
4. [Architecture](#-architecture)
5. [Technology Stack](#-technology-stack)
6. [Project Structure](#-project-structure)
7. [Database Design](#-database-design)
8. [API Overview](#-api-overview)
9. [Security Design](#-security-design)
10. [Getting Started](#-getting-started)
11. [Demo Data](#-demo-data)
12. [Usage Walkthrough](#-usage-walkthrough)
13. [Testing & Validation](#-testing--validation)
14. [Limitations](#-limitations--residual-risks)
15. [Team](#-team)

---

## 🔍 Overview

**Mahfooz Mobile** ("mahfooz" = *protected* / *secure* in Urdu) is a web-based, self-contained device
registration and blocking authority that mirrors Pakistan Telecommunication Authority (PTA)
DIRBS/LSDS model on mocked government data. It enables citizens to register their mobile devices,
quickly report a theft using a dedicated memorised **Emergency PIN**, automatically generate a
pre-filled theft report (FIR draft), and recover access — all with **security designed in from the
ground up** rather than bolted on afterwards.

The project is a complete **three-tier application**: a plain HTML/CSS/JavaScript frontend, a
Node.js/Express REST backend, and a PostgreSQL database that actively enforces integrity and
security rules.

---

## ❗ The Problem

When a phone is stolen, the first few minutes matter most — yet that is exactly when the victim is
least able to act. The stolen device often holds the owner's authentication factors (SMS codes,
authenticator apps, saved passwords), so the very tool they would use to prove their identity is now
in the thief's hands. PTA can blacklist a stolen IMEI nationwide, but the citizen-facing reporting
process today is slow and high-friction.

Mahfooz Mobile addresses two core challenges:

- **Security–usability tension** — letting a victim authenticate and block their device *fast*, at a
  moment their normal credentials may be compromised, **without** opening a path for a malicious
  actor to block someone else's phone.
- **Data integrity** — ensuring only legitimate, government-approved devices can be registered
  against a national identity number, and that identity data is protected at rest and in the UI.

---

## ✨ Features

- **Account & device registration** with national-identity (**CNIC**) uniqueness enforced at the database level.
- **PTA type-approved IMEI registry** — only approved *and active* IMEIs can be linked to a CNIC; invalid or de-listed IMEIs are rejected by the database itself.
- **Role-based access control** — Citizen, Support Agent, Auditor, and System roles, enforced server-side.
- **Emergency theft reporting** using a memorised Emergency PIN + account password, independent of day-to-day login factors.
- **Risk engine** — scores each report (*low / medium / high*) and decides between an automatic block and manual review.
- **Automatic FIR draft generation** — a downloadable theft-report document laid out to match the official Section 154 CrPC "Initial Information Report" template.
- **Emergency-PIN recovery** — via five personal security questions *or* a one-time code sent to the registered email.
- **Device unblock, disputes, staff case queue, auditor dashboard**, and a public **IMEI status check**.
- **Tamper-evident, hash-chained audit log** with an integrity-verification routine.
- **Data protection** — CNIC/phone/email encrypted at rest, masked in the UI, with blind-index lookups.

---

## 🏗 Architecture

Mahfooz Mobile follows a classic **three-tier architecture**. The browser never receives database
credentials or direct query access — all business logic lives on the server, which is the only
component that talks to the database.

```
┌──────────────────┐     HTTP / JSON      ┌────────────────────┐      SQL       ┌──────────────────┐
│   Browser (UI)   │ ───────────────────▶ │  Node.js / Express │ ─────────────▶ │   PostgreSQL     │
│ HTML · CSS · JS  │ ◀─────────────────── │   REST API server  │ ◀───────────── │  (mahfooz DB)    │
└──────────────────┘   session token      └────────────────────┘   parameterized └──────────────────┘
      presentation            business logic, risk engine,            queries      data + integrity
                              auth, audit chain, IMEI checks                         rules + encryption
```

- **Frontend** — a thin API client; each user action issues a request and renders the response.
- **Backend** — holds every business rule (credential verification, the risk engine, the
  approved-IMEI check, the audit chain) so nothing can be bypassed from a manipulated client.
- **Database** — enforces security and integrity via constraints, foreign keys, triggers, and
  functions, so invalid data cannot be persisted even if an application check were missed.

---

## 🛠 Technology Stack

| Layer     | Technology                                              |
|-----------|---------------------------------------------------------|
| Frontend  | HTML5, CSS3, vanilla JavaScript (no framework, no build) |
| Backend   | Node.js, Express 4, `pg` (PostgreSQL driver), Nodemailer |
| Database  | PostgreSQL 14+ with the `pgcrypto` extension            |
| Auth      | Bearer-token sessions, bcrypt password hashing (via pgcrypto) |

---

## 📁 Project Structure

```
Mahfooz-Mobile/
├── README.md
├── .gitignore
├── website/                 # Frontend
│   ├── index.html, login.html, register.html, emergency.html, ...  (pages)
│   ├── css/styles.css        # design system / all styles
│   ├── js/
│   │   ├── store.js          # API client (talks to the backend)
│   │   ├── app.js            # page logic / wiring
│   │   └── main.js           # shared UI behaviour (transitions, a11y, toasts)
│   └── img/                  # logos / assets
├── server/                  # Backend
│   ├── server.js             # Express app + all REST endpoints
│   ├── db.js                 # PostgreSQL connection + crypto key config
│   └── package.json          # dependencies
├── database/                # Database
│   ├── 01_schema.sql         # tables, constraints, triggers, functions, roles
│   └── 02_seed.sql           # demo data (accounts, devices, approved IMEIs, ...)
└── docs/                    # Documentation
    ├── Mahfooz_Mobile_Project_Report.docx
    └── Mahfooz_Mobile_Concept.md
```

---

## 🗄 Database Design

The schema models every entity in the system and enforces the core rules itself.

**Main tables:** `pta_approved_imei`, `account`, `account_recovery_question`, `device`, `theft_case`,
`case_timeline`, `dispute`, `notification`, `otp`, `app_session`, `cnic_registration_attempt`,
`audit_log`.

**Key database-level controls:**

- **Approved-IMEI enforcement** — `device.imei` is a foreign key into `pta_approved_imei`, and a
  `BEFORE INSERT` trigger additionally rejects any IMEI whose approval has been revoked. *Only an
  approved, active IMEI can be linked to a CNIC.*
- **CNIC uniqueness** — enforced with a unique constraint on the CNIC blind index.
- **Column encryption** — CNIC, phone, and email are stored encrypted (`pgp_sym_encrypt`); a keyed
  HMAC "blind index" allows uniqueness/lookup without the plaintext; masked forms are kept for the UI.
- **IMEI validation** — a `is_luhn_valid()` SQL function + a `CHECK` constraint enforce 15-digit + Luhn.
- **Tamper-evident log** — a trigger hash-chains every `audit_log` row; `verify_audit_chain()`
  recomputes and detects tampering; `UPDATE`/`DELETE` on the log are revoked (append-only).
- **Least-privilege roles** — `mahfooz_app`, `mahfooz_audit_writer`, `mahfooz_auditor`.

---

## 🔌 API Overview

All endpoints are served under the same origin as the frontend (default `http://localhost:8090`).

| Area | Endpoints |
|------|-----------|
| Auth / identity | `POST /api/login` · `GET /api/me` · `POST /api/logout` · `GET /api/demo/accounts` · `POST /api/demo/login` |
| Registration | `POST /api/register` · `POST /api/devices` |
| Emergency / reporting | `POST /api/emergency/devices` · `POST /api/emergency/report` · `GET /api/case/:ref` · `GET /api/fir/:ref` |
| Recovery | `POST /api/recovery/questions` · `POST /api/recovery/answers` · `POST /api/pin/reset` · `POST /api/otp/issue` · `POST /api/recovery/otp` |
| Device actions | `POST /api/devices/unblock` · `POST /api/pin/set` · `GET /api/imei/check` |
| Staff / audit | `POST /api/disputes` · `POST /api/disputes/update` · `GET /api/audit/verify` · `POST /api/audit/append` |
| Scoped data | `GET /api/state` (per-user, role-scoped view) |

### The Risk Engine

Each theft report is scored on four ownership signals:

| Signal | Meaning |
|--------|---------|
| **Emergency PIN** | The correct memorised PIN was entered (gate) |
| **Phone match** | The phone number provided matches the registered number |
| **IMEI active** | The selected device is a currently-active linked device |
| **SIM ownership** | The report was made from the registered number (not just the CNIC) |

| Matches | Risk | Outcome |
|---------|------|---------|
| 3–4 | **Low** | Device blocked immediately (verified by password) |
| 2 | **Medium** | Device blocked, and the case is sent to staff for manual verification |
| 0–1 | **High** | **No** automatic block — held for a manual ownership check first |

---

## 🔐 Security Design

Security was treated as a first-class concern throughout. Headline controls include authentication
with hashed credentials and expiring tokens, server-side authorization checks, encryption of
identifying data at rest, strict input validation, and a tamper-evident audit trail.

### Defence against the three required attack classes

| Attack | How it is prevented |
|--------|---------------------|
| **SQL Injection** | **Parameterized queries (prepared statements) everywhere.** User input is passed to the driver as a separate value list, referenced only through numbered placeholders (`$1, $2, …`) — never concatenated into SQL. The database treats input strictly as data, so payloads like `' OR '1'='1' --` match no record and cannot alter the query. |
| **Cross-Site Scripting (XSS)** | **Consistent output encoding.** Every user-controlled value is HTML-encoded (`< > & " '`) before it is placed on the page, so a payload such as `<img src=x onerror=...>` is stored but displayed as inert text. No `eval`, `Function`, or `document.write` is used. |
| **Buffer Overflow** | **Not applicable** to the memory-safe JavaScript/Node.js runtime (no manual buffers or pointer arithmetic). Mitigated in depth with input length limits on every form field, a request-body size cap on the server, and strongly-typed, length-bounded database columns. |

---

## 🚀 Getting Started

### Prerequisites
- [PostgreSQL](https://www.postgresql.org/) **14+** (the `pgcrypto` extension ships with it)
- [Node.js](https://nodejs.org/) **18+**

### 1. Create and load the database
```bash
createdb mahfooz
psql -d mahfooz -f database/01_schema.sql
psql -d mahfooz -f database/02_seed.sql
```

### 2. Install backend dependencies
```bash
cd server
npm install
```

### 3. Run the server

**Linux / macOS:**
```bash
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/mahfooz" PORT=8090 node server.js
```

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/mahfooz"
$env:PORT=8090
node server.js
```

You should see: `Mahfooz Mobile running on http://localhost:8090`

### 4. Open the app
Visit **http://localhost:8090** in your browser.

> **Optional — real email for recovery codes:** set `SMTP_USER` and `SMTP_PASS` (e.g. a Gmail
> address + App Password) before starting the server. Without them, one-time codes are shown
> on-screen in demo mode.

---

## 🧪 Demo Data

**Accounts** (log in with CNIC *or* phone + password):

| Role | Login (CNIC) | Password | Emergency PIN |
|------|--------------|----------|---------------|
| Citizen — Ali Farooq | `42101-1234567-3` | `password123` | `446688` |
| Citizen — Sara Khan | `42101-7654321-1` | `passwordS123` | `552211` |
| Support Agent — S. Raza | *(via Demo switcher)* | `staffpass` | — |
| Auditor — N. Chaudhry | *(via Demo switcher)* | `auditpass` | — |

**Approved IMEIs available to register** (PTA-approved, unlinked):
`865432109876549` (Xiaomi) · `359876543210983` (Oppo) · `012456789012341` (Vivo)

> The encryption keys in `database/02_seed.sql` are **demo-only placeholders**. In production they
> are supplied from a secrets vault via the `ENC_KEY` / `IDX_KEY` environment variables and are
> **never committed**.

---

## 📖 Usage Walkthrough

1. **Register** — create an account and link a device using one of the approved IMEIs above.
2. **Log in** — with your CNIC/phone and password.
3. **Report a theft** — go to *Report a stolen phone*, identify your account, pick the device from
   your IMEI history, enter your phone number, Emergency PIN, and password, then block it.
4. **View the case** — see the risk level and block state, and **download the FIR draft**.
5. **Recover a forgotten PIN** — via security questions or a one-time email code.
6. **Staff / Auditor** — use the identity switcher to review the staff queue or verify the audit chain.

---

## ✅ Testing & Validation

The system was validated end-to-end across all three tiers (browser, API, database). A comprehensive
automated suite exercised the full journey starting from registration — confirming via direct
database queries that new accounts and devices are **actually persisted**, that the CNIC is stored
encrypted *and* masked, and that a registered user can **log back in**. It also verified login,
device management, the full emergency flow at all three risk levels, FIR generation, unblock,
disputes, both recovery paths, the staff/auditor functions, and the public IMEI check. Negative
cases (duplicate CNIC, non-approved/invalid IMEI, weak PIN) were correctly rejected, injected
SQL/XSS payloads were neutralised, and the audit chain verified intact and detected tampering — all
with no client-side errors.

---

## ⚠️ Limitations & Residual Risks

- **Identity is self-reported** — without live NADRA access, a CNIC is only checked against the
  system's own records, not ground truth.
- **Enforcement is simulated** — a "block" is a database state and a conceptual operator check, not a
  real instruction to Pakistani cellular networks.
- **Coverage is opt-in** — only devices registered beforehand are protected.
- **The FIR is a reference draft**, not a legally registered police report.
- Some controls are demonstration-level (authenticator/TOTP verification is simulated; recovery codes
  are shown on-screen unless SMTP is configured; encryption keys ship with demo values).

These define the trust boundary of an academic prototype built on mocked government data and do not
affect the correctness of the security mechanisms described above.

---
