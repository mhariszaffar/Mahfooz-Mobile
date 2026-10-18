/* ==========================================================================
   Mahfooz Mobile — client-side data layer (simulated backend)
   ==========================================================================
   This project has no real server (see "Known Limitations" in the concept
   doc — enforcement and identity verification are explicitly simulated).
   This module makes the site *functionally* interactive by using
   localStorage as a stand-in persistence layer, so actions on one page
   (register a device, report it stolen, unblock it) are actually
   reflected on every other page.

   Honesty notes baked into the design, matching the written concept:
   - Passwords/PINs/recovery answers are hashed with SHA-256 (Web Crypto),
     not Argon2id — SHA-256 is NOT a safe password hash for a real backend
     (no salt/work-factor), but a client-only demo can't do real server-side
     Argon2id anyway. This is clearly weaker than the design doc's spec and
     is only meant to avoid storing raw plaintext in localStorage.
   - The audit log is hash-chained (entry_hash = SHA256(data + prevHash)),
     genuinely detecting tampering with the chain — but since everything
     lives in the one browser's localStorage, a user with devtools access
     can still edit it directly. That's an inherent limitation of having
     no real server, not a flaw in the chaining logic itself.
   - TOTP is not really implemented (no shared secret / real authenticator
     app integration is possible client-side) — step-up "TOTP" entry
     accepts any 6-digit code, same spirit as the rest of the demo.
   ========================================================================== */

var MahfoozStore = (function () {
  "use strict";

  var DB_KEY = "mahfoozmobile_db_v1";
  var SESSION_KEY = "mahfoozmobile_session_v1";

  // ------------------------------------------------------------------
  // Hashing (Web Crypto SHA-256)
  // ------------------------------------------------------------------
  function sha256(text) {
    var enc = new TextEncoder().encode(String(text));
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      var bytes = Array.from(new Uint8Array(buf));
      return bytes.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  // ------------------------------------------------------------------
  // Validation helpers (match the concept doc's rules)
  // ------------------------------------------------------------------
  function validateCNIC(cnic) {
    return /^\d{5}-\d{7}-\d$/.test(String(cnic || "").trim());
  }

  function luhnCheck(numStr) {
    var sum = 0, alt = false;
    for (var i = numStr.length - 1; i >= 0; i--) {
      var n = parseInt(numStr.charAt(i), 10);
      if (isNaN(n)) return false;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validateIMEI(imei) {
    var digits = String(imei || "").replace(/\s/g, "");
    if (!/^\d{15}$/.test(digits)) return false;
    return luhnCheck(digits);
  }

  function maskCNIC(cnic) {
    if (!cnic) return "";
    var parts = cnic.split("-");
    if (parts.length !== 3) return cnic;
    return parts[0] + "-" + "•".repeat(parts[1].length) + "-" + parts[2];
  }

  function maskIMEI(imei) {
    if (!imei) return "";
    var d = String(imei);
    return "•••• •••• " + d.slice(-4);
  }

  function maskEmail(email) {
    if (!email) return "";
    var parts = String(email).split("@");
    if (parts.length !== 2) return email;
    var name = parts[0];
    var shown = name.slice(0, 2);
    return shown + "•••••@" + parts[1];
  }

  function maskPhone(phone) {
    if (!phone) return "";
    var p = String(phone).replace(/[^\d]/g, "");
    if (p.length < 4) return phone;
    return "•••• ••• " + p.slice(-4);
  }

  // ------------------------------------------------------------------
  // DB load/save
  // ------------------------------------------------------------------
  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function save(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function nextId(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function fakeIp() {
    return "39." + Math.floor(Math.random() * 255) + ".x.x";
  }

  // ------------------------------------------------------------------
  // Seed data (first run only)
  // ------------------------------------------------------------------
  function seed() {
    return Promise.all([
      sha256("password123"),
      sha256("446688"),
      sha256("passwordS123"),
      sha256("552211"),
      sha256("staffpass"),
      sha256("auditpass"),
      sha256("iphone"),
      sha256("march 2026"),
      sha256("karachi"),
      sha256("blue"),
      sha256("askari 11"),
    ]).then(function (hashes) {
      var aliPwd = hashes[0], aliPin = hashes[1], saraPwd = hashes[2], saraPin = hashes[3],
        agentPwd = hashes[4], auditPwd = hashes[5],
        q1 = hashes[6], q2 = hashes[7], q3 = hashes[8], q4 = hashes[9], q5 = hashes[10];

      var db = {
        accounts: [
          {
            id: "acc_ali", role: "citizen", name: "Ali Farooq", initials: "AF",
            cnic: "42101-1234567-3", phone: "0300-1234567",
            email: "ali.farooq@example.com", altPhone: "0310-9876543",
            passwordHash: aliPwd, emergencyPinHash: aliPin,
            recoveryQuestions: [
              { q: "What nickname did you give your first device?", aHash: q1 },
              { q: "Approximately when did you register?", aHash: q2 },
              { q: "What city did you register from?", aHash: q3 },
              { q: "What's your favourite colour?", aHash: q4 },
              { q: "Which neighbourhood did you grow up in?", aHash: q5 },
            ],
            physicalCodeHash: null,
          },
          {
            id: "acc_sara", role: "citizen", name: "Sara Khan", initials: "SK",
            cnic: "42101-7654321-1", phone: "0321-7654321",
            email: "sara.khan@example.com", altPhone: "0345-1122334",
            passwordHash: saraPwd, emergencyPinHash: saraPin,
            recoveryQuestions: [
              { q: "What nickname did you give your first device?", aHash: q1 },
              { q: "Approximately when did you register?", aHash: q2 },
              { q: "What city did you register from?", aHash: q3 },
              { q: "What's your favourite colour?", aHash: q4 },
              { q: "Which neighbourhood did you grow up in?", aHash: q5 },
            ],
            physicalCodeHash: null,
          },
          { id: "acc_agent", role: "agent", name: "S. Raza", initials: "SR", cnic: null, phone: null, passwordHash: agentPwd },
          { id: "acc_auditor", role: "auditor", name: "N. Chaudhry", initials: "NC", cnic: null, phone: null, passwordHash: auditPwd },
        ],
        devices: [
          { id: "dev_iphone", ownerId: "acc_ali", nickname: "iPhone", brand: "iPhone", model: "iPhone 13 Pro", imei: "490154203237518", status: "active", registeredAt: "2026-03-12T10:00:00Z" },
          { id: "dev_galaxy", ownerId: "acc_ali", nickname: "Work Galaxy", brand: "Samsung", model: "Samsung Galaxy S23", imei: "356938035643809", status: "blocked", registeredAt: "2026-01-02T09:00:00Z" },
          { id: "dev_ipad", ownerId: "acc_ali", nickname: "iPad", brand: "iPhone", model: "iPad Air (2022)", imei: "013888003685123", status: "active", registeredAt: "2025-11-19T09:00:00Z" },
          { id: "dev_old_nokia", ownerId: "acc_ali", nickname: "Old Nokia", brand: "Nokia", model: "Nokia G21", imei: "358765102345671", status: "retired", registeredAt: "2024-06-01T09:00:00Z" },
          { id: "dev_pixel", ownerId: "acc_sara", nickname: "Pixel", brand: "Pixel", model: "Pixel 7", imei: "352099001761481", status: "active", registeredAt: "2025-08-08T09:00:00Z" },
        ],
        cases: [
          {
            id: "case_1", ref: "MM-2026-00482", deviceId: "dev_galaxy", ownerId: "acc_ali",
            createdAt: "2026-10-14T19:42:00Z", policeStation: "Gulberg Station",
            timeline: [
              { step: "Reported", at: "2026-10-14T19:42:00Z" },
              { step: "Device Blocked", at: "2026-10-14T19:42:00Z" },
              { step: "Report Sent to Police", at: "2026-10-14T19:42:05Z" },
            ],
          },
        ],
        disputes: [
          { id: "disp_1", citizenId: null, citizenLabel: "•••• (masked)", summary: "Disputed Block", priority: "High", status: "Open", caseRef: "CS-10492", createdAt: "2026-10-14T00:00:00Z" },
          { id: "disp_2", citizenId: null, citizenLabel: "•••• (masked)", summary: "Unblock Assist", priority: "Normal", status: "In Review", caseRef: "CS-10488", createdAt: "2026-10-13T00:00:00Z" },
        ],
        notifications: {
          acc_ali: [
            { id: "n1", text: "Device blocked — Samsung Galaxy S23", meta: "Ref# MM-2026-00482 · 14 Oct 2026, 7:42 PM", icon: "check" },
          ],
          acc_sara: [],
        },
        otps: {},
        auditLog: [],
        meta: { caseSeq: 482, refYear: 2026 },
      };

      return appendAuditLogToDb(db, "System", "SEED_INITIALIZED", "—").then(function (db2) {
        save(db2);
        return db2;
      });
    });
  }

  function ensureDb() {
    var db = load();
    if (db) return Promise.resolve(db);
    return seed();
  }

  // ------------------------------------------------------------------
  // Audit log (hash-chained)
  // ------------------------------------------------------------------
  function appendAuditLogToDb(db, actor, action, ref) {
    var prevHash = db.auditLog.length ? db.auditLog[db.auditLog.length - 1].hash : "0".repeat(64);
    var entry = {
      id: nextId("log"),
      ts: new Date().toISOString(),
      actor: actor,
      action: action,
      ref: ref || "—",
      ip: fakeIp(),
      prevHash: prevHash,
    };
    return sha256(JSON.stringify({ ts: entry.ts, actor: entry.actor, action: entry.action, ref: entry.ref, prevHash: prevHash })).then(function (hash) {
      entry.hash = hash;
      db.auditLog.push(entry);
      return db;
    });
  }

  function appendAuditLog(actor, action, ref) {
    return ensureDb().then(function (db) {
      return appendAuditLogToDb(db, actor, action, ref).then(function (db2) {
        save(db2);
        return db2;
      });
    });
  }

  function verifyAuditChain() {
    return ensureDb().then(function (db) {
      var chain = Promise.resolve({ ok: true, brokenAt: null });
      var prevHash = "0".repeat(64);
      var p = Promise.resolve(true);
      db.auditLog.forEach(function (entry, idx) {
        p = p.then(function (stillOk) {
          if (!stillOk) return false;
          if (entry.prevHash !== prevHash) return false;
          return sha256(JSON.stringify({ ts: entry.ts, actor: entry.actor, action: entry.action, ref: entry.ref, prevHash: entry.prevHash })).then(function (h) {
            prevHash = entry.hash;
            return h === entry.hash;
          });
        });
      });
      return p.then(function (ok) { return { ok: ok, count: db.auditLog.length }; });
    });
  }

  // ------------------------------------------------------------------
  // Session (demo identity switcher)
  // ------------------------------------------------------------------
  function getSessionId() {
    return localStorage.getItem(SESSION_KEY);
  }
  function setSessionId(id) {
    localStorage.setItem(SESSION_KEY, id);
  }
  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }
  function getCurrentAccount() {
    return ensureDb().then(function (db) {
      var id = getSessionId() || "acc_ali";
      if (!getSessionId()) setSessionId(id);
      return db.accounts.find(function (a) { return a.id === id; }) || db.accounts[0];
    });
  }

  // ------------------------------------------------------------------
  // Accounts / devices
  // ------------------------------------------------------------------
  function findAccountByCnic(db, cnic) {
    return db.accounts.find(function (a) { return a.cnic === cnic; });
  }
  function findAccountByIdentifier(db, identifier) {
    var id = String(identifier || "").trim();
    return db.accounts.find(function (a) { return a.cnic === id || a.phone === id; });
  }

  function registerAccountAndDevice(data) {
    // data: { name, cnic, phone, password, emergencyPin, answers:[5], customQuestions:[2], imei, nickname, brand, model }
    return ensureDb().then(function (db) {
      if (!validateCNIC(data.cnic)) return { ok: false, error: "Invalid CNIC format. Use 00000-0000000-0." };
      if (findAccountByCnic(db, data.cnic)) {
        return appendAuditLogToDb(db, "Unknown", "DUPLICATE_CNIC_ATTEMPT", maskCNIC(data.cnic)).then(function (db2) {
          save(db2);
          return { ok: false, error: "This CNIC is already registered to an account. If this is you, log in instead. If it isn't, this attempt has been logged." };
        });
      }
      if (!validateIMEI(data.imei)) return { ok: false, error: "Invalid IMEI — must be 15 digits and pass the Luhn checksum." };

      return Promise.all([sha256(data.password), sha256(data.emergencyPin)]).then(function (hashes) {
        return Promise.all(data.answers.map(function (a) { return sha256(normalize(a)); })).then(function (answerHashes) {
          var accId = nextId("acc");
          var account = {
            id: accId, role: "citizen", name: data.name || "New Citizen",
            initials: (data.name || "NC").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(),
            cnic: data.cnic, phone: data.phone, email: data.email || "", altPhone: "",
            passwordHash: hashes[0], emergencyPinHash: hashes[1],
            recoveryQuestions: [
              { q: "What nickname did you give your first device?", aHash: answerHashes[0] },
              { q: "Approximately when did you register?", aHash: answerHashes[1] },
              { q: "What city did you register from?", aHash: answerHashes[2] },
              { q: (data.customQuestions && data.customQuestions[0]) || "Custom security question (set by you)", aHash: answerHashes[3] },
              { q: (data.customQuestions && data.customQuestions[1]) || "Custom security question (set by you)", aHash: answerHashes[4] },
            ],
            physicalCodeHash: null,
          };
          var devId = nextId("dev");
          var fullModel = [data.brand, data.model].filter(Boolean).join(" ").trim() || "Registered Device";
          var device = {
            id: devId, ownerId: accId, nickname: data.nickname || "My Device",
            brand: data.brand || "", model: fullModel,
            imei: data.imei, status: "active", registeredAt: new Date().toISOString(),
          };
          db.accounts.push(account);
          db.devices.push(device);
          db.notifications[accId] = [];
          return appendAuditLogToDb(db, account.name, "ACCOUNT_REGISTERED", maskCNIC(data.cnic)).then(function (d) {
            return appendAuditLogToDb(d, account.name, "DEVICE_REGISTERED", maskIMEI(data.imei));
          }).then(function (d) {
            save(d);
            return { ok: true, account: account, device: device };
          });
        });
      });
    });
  }

  function registerDeviceForCurrentUser(data) {
    // data: { imei, nickname, brand, model }
    return ensureDb().then(function (db) {
      return getCurrentAccount().then(function (acc) {
        if (!validateIMEI(data.imei)) return { ok: false, error: "Invalid IMEI — must be 15 digits and pass the Luhn checksum." };
        var existing = db.devices.find(function (d) { return d.imei === data.imei; });
        if (existing && existing.status === "blocked") {
          return appendAuditLogToDb(db, acc.name, "REGISTRATION_ATTEMPT_ON_BLOCKED_IMEI", maskIMEI(data.imei)).then(function (d) {
            save(d);
            return { ok: false, error: "This IMEI is already registered and currently blocked. It cannot be re-registered as a new device." };
          });
        }
        var devId = nextId("dev");
        var fullModel = [data.brand, data.model].filter(Boolean).join(" ").trim() || "Registered Device";
        var device = { id: devId, ownerId: acc.id, nickname: data.nickname || "My Device", brand: data.brand || "", model: fullModel, imei: data.imei, status: "active", registeredAt: new Date().toISOString() };
        db.devices.push(device);
        return appendAuditLogToDb(db, acc.name, "DEVICE_REGISTERED", maskIMEI(data.imei)).then(function (d) {
          save(d);
          return { ok: true, device: device };
        });
      });
    });
  }

  function login(identifier, password) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account found with that CNIC/phone number." };
      return sha256(password).then(function (h) {
        if (h !== acc.passwordHash) return { ok: false, error: "Incorrect password." };
        setSessionId(acc.id);
        return appendAuditLog(acc.name, "LOGIN_SUCCESS", "—").then(function () {
          return { ok: true, account: acc };
        });
      });
    });
  }

  function staffLogin(identifier, password) {
    // identifier here is the account id for simplicity in this demo (agent/auditor have no CNIC)
    return ensureDb().then(function (db) {
      var acc = db.accounts.find(function (a) { return a.id === identifier; });
      if (!acc) return { ok: false, error: "Unknown staff account." };
      return sha256(password).then(function (h) {
        if (h !== acc.passwordHash) return { ok: false, error: "Incorrect password." };
        setSessionId(acc.id);
        return { ok: true, account: acc };
      });
    });
  }

  // ------------------------------------------------------------------
  // IMEI history — the devices (active + past) linked to an account,
  // so a victim can pick the stolen phone instead of recalling the IMEI.
  // Public (no session): the emergency flow runs before login.
  // ------------------------------------------------------------------
  function getDevicesForReport(identifier) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account matches that CNIC/phone number." };
      var mine = db.devices.filter(function (d) { return d.ownerId === acc.id; });
      return {
        ok: true,
        account: { name: acc.name, email: maskEmail(acc.email), phone: maskPhone(acc.phone), altPhone: maskPhone(acc.altPhone) },
        simMatch: acc.phone === String(identifier || "").trim(),
        devices: mine.map(function (d) {
          return { id: d.id, nickname: d.nickname, model: d.model, maskedImei: maskIMEI(d.imei), status: d.status, selectable: d.status === "active" || d.status === "retired" };
        }),
      };
    });
  }

  // ------------------------------------------------------------------
  // One-time passcode (demo). No real email/SMS exists in this mock —
  // the code is returned so the UI can display it, and also stored so
  // it can be verified. Used both as a risk-scoring factor in the
  // emergency flow and as an alternate PIN-recovery channel.
  // ------------------------------------------------------------------
  function issueOtp(identifier) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account matches that CNIC/phone number." };
      var code = String(Math.floor(100000 + Math.random() * 900000));
      if (!db.otps) db.otps = {};
      db.otps[acc.id] = { code: code, issuedAt: Date.now() };
      save(db);
      return { ok: true, otp: code, sentTo: maskEmail(acc.email) || maskPhone(acc.altPhone) || maskPhone(acc.phone) };
    });
  }

  function checkOtp(db, acc, otp) {
    var rec = db.otps && db.otps[acc.id];
    return !!(rec && otp && String(otp).trim() === rec.code);
  }

  // ------------------------------------------------------------------
  // Risk engine — scores how many ownership signals match, then maps
  // to a block decision:
  //   low  (>=3 of 4 match)  -> temporary block immediately (auto)
  //   med  (2 of 4 match)    -> temporary block + manual review
  //   high (<=1 of 4 match)  -> no auto block; manual ownership check first
  // ------------------------------------------------------------------
  function assessRisk(factors) {
    var matches = 0;
    Object.keys(factors).forEach(function (k) { if (factors[k]) matches++; });
    var level = matches >= 3 ? "low" : matches === 2 ? "medium" : "high";
    return { level: level, matches: matches, total: Object.keys(factors).length, factors: factors };
  }

  // ------------------------------------------------------------------
  // Emergency report (PIN gate + risk-based block)
  // ------------------------------------------------------------------
  function reportTheft(identifier, pin, deviceId, otp) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account matches that CNIC/phone number." };
      return sha256(pin).then(function (h) {
        var pinOk = h === acc.emergencyPinHash;
        if (!pinOk) {
          return appendAuditLogToDb(db, acc.name, "EMERGENCY_PIN_FAILED", "—").then(function (d) {
            save(d);
            return { ok: false, error: "Incorrect Emergency PIN." };
          });
        }
        var myDevices = db.devices.filter(function (d) { return d.ownerId === acc.id; });
        var target = deviceId ? myDevices.find(function (d) { return d.id === deviceId; }) : null;
        if (!target) {
          return {
            ok: false,
            needsDevice: true,
            devices: myDevices.filter(function (d) { return d.status === "active" || d.status === "retired"; })
              .map(function (d) { return { id: d.id, label: d.nickname + " — " + d.model }; }),
            error: "Select which of your linked devices was stolen.",
          };
        }
        if (target.status === "blocked" || target.status === "temp_blocked") {
          return { ok: false, error: "That device is already blocked." };
        }

        // --- Risk factors (how strongly ownership is corroborated) ---
        var factors = {
          emergencyPin: pinOk,                                        // knows the memorized PIN (gate)
          otpConfirmation: checkOtp(db, acc, otp),                    // controls the registered email/number
          imeiActive: target.status === "active",                     // the IMEI is a currently-active linked device
          simOwnership: acc.phone === String(identifier || "").trim(), // reported from the registered SIM/number
        };
        var risk = assessRisk(factors);

        var seq = ++db.meta.caseSeq;
        var ref = "MM-" + db.meta.refYear + "-" + String(seq).padStart(5, "0");
        var now = new Date().toISOString();
        var blocked, reviewStatus, blockState, timeline;

        if (risk.level === "low") {
          target.status = "temp_blocked";
          blocked = true; blockState = "temporary"; reviewStatus = "auto-approved";
          timeline = [
            { step: "Reported", at: now },
            { step: "Temporarily Blocked", at: now },
            { step: "Report Sent to Police", at: now },
          ];
        } else if (risk.level === "medium") {
          target.status = "temp_blocked";
          blocked = true; blockState = "temporary"; reviewStatus = "manual-review";
          timeline = [
            { step: "Reported", at: now },
            { step: "Temporarily Blocked", at: now },
            { step: "Sent for Manual Verification", at: now },
          ];
        } else {
          blocked = false; blockState = "none"; reviewStatus = "manual-review-required";
          timeline = [
            { step: "Reported", at: now },
            { step: "Held for Manual Ownership Check", at: now },
          ];
        }

        var caseObj = {
          id: nextId("case"), ref: ref, deviceId: target.id, ownerId: acc.id,
          createdAt: now, policeStation: "Gulberg Station",
          riskLevel: risk.level, riskMatches: risk.matches, riskTotal: risk.total, riskFactors: factors,
          blockState: blockState, reviewStatus: reviewStatus,
          reportedVia: factors.simOwnership ? "registered phone" : "CNIC",
          timeline: timeline,
        };
        db.cases.push(caseObj);
        if (db.otps) delete db.otps[acc.id]; // consume the OTP

        if (!db.notifications[acc.id]) db.notifications[acc.id] = [];
        var notifText = blocked ? "Temporary block placed — " + target.model : "Theft report held for review — " + target.model;
        db.notifications[acc.id].unshift({ id: nextId("notif"), text: notifText, meta: "Ref# " + ref + " · " + risk.level.toUpperCase() + " risk · " + new Date().toLocaleString(), icon: blocked ? "check" : "bell" });

        // Medium/high cases enter the staff manual-review queue.
        if (reviewStatus !== "auto-approved") {
          db.disputes.unshift({
            id: nextId("disp"), citizenId: acc.id, citizenLabel: "•••• (masked)",
            summary: "Theft Review — " + risk.level.toUpperCase() + " risk",
            priority: risk.level === "high" ? "High" : "Normal",
            status: blocked ? "Temp-blocked, awaiting review" : "Awaiting ownership check",
            caseRef: ref, createdAt: now,
            reason: "Automated theft report flagged for manual verification. Risk level: " + risk.level.toUpperCase() +
              " (" + risk.matches + "/" + risk.total + " ownership signals matched). " +
              "Signals — Emergency PIN: " + (factors.emergencyPin ? "match" : "no") +
              ", OTP/email: " + (factors.otpConfirmation ? "match" : "no") +
              ", IMEI currently active: " + (factors.imeiActive ? "yes" : "no") +
              ", reported from registered SIM: " + (factors.simOwnership ? "match" : "no") + ".",
            deviceLabel: target.nickname + " — " + target.model,
          });
        }

        return appendAuditLogToDb(db, acc.name, "EMERGENCY_PIN_SUCCESS", "—").then(function (d) {
          return appendAuditLogToDb(d, acc.name, "RISK_ASSESSED", risk.level.toUpperCase() + " " + risk.matches + "/" + risk.total);
        }).then(function (d) {
          return blocked
            ? appendAuditLogToDb(d, acc.name, "DEVICE_TEMP_BLOCKED", ref)
            : appendAuditLogToDb(d, acc.name, "THEFT_REPORT_HELD", ref);
        }).then(function (d) {
          save(d);
          return { ok: true, device: target, caseObj: caseObj, risk: risk, blocked: blocked };
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Complete full verification — promotes a TEMPORARY block to a full
  // block after stronger re-authentication (password + authenticator).
  // This is the "finish verifying afterwards" half of the fast-block flow.
  // ------------------------------------------------------------------
  function completeFullVerification(caseRef, password, totp) {
    return ensureDb().then(function (db) {
      var caseObj = db.cases.find(function (c) { return c.ref === caseRef; });
      if (!caseObj) return { ok: false, error: "Case not found." };
      var acc = db.accounts.find(function (a) { return a.id === caseObj.ownerId; });
      if (!acc) return { ok: false, error: "Account not found." };
      if (!totp || !/^\d{6}$/.test(totp)) return { ok: false, error: "Enter the 6-digit authenticator code." };
      return sha256(password).then(function (h) {
        if (h !== acc.passwordHash) return { ok: false, error: "Incorrect password." };
        var device = db.devices.find(function (d) { return d.id === caseObj.deviceId; });
        if (device && device.status === "temp_blocked") device.status = "blocked";
        caseObj.blockState = "full";
        caseObj.reviewStatus = "fully-verified";
        caseObj.timeline.push({ step: "Full Verification Complete", at: new Date().toISOString() });
        return appendAuditLogToDb(db, acc.name, "FULL_VERIFICATION_COMPLETE", caseRef).then(function (d) {
          save(d);
          return { ok: true, caseObj: caseObj };
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // FIR / theft-report draft (downloadable). Includes the FULL CNIC —
  // the documented law-enforcement exception to CNIC masking.
  // ------------------------------------------------------------------
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // A deterministic QR-style SVG (demo placeholder — looks like a scannable
  // code, keyed off the seed, with the three corner finder patterns).
  function firQr(seed) {
    var N = 25, cell = 4;
    var h = 2166136261;
    var s = String(seed);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    var rng = h || 123456789;
    function rand() { rng ^= rng << 13; rng >>>= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng >>>= 0; return rng / 4294967296; }
    function finder(r, c) {
      function ring(r0, c0) { var rr = r - r0, cc = c - c0; return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4); }
      if (r < 7 && c < 7) return { f: true, on: ring(0, 0) };
      if (r < 7 && c >= N - 7) return { f: true, on: ring(0, N - 7) };
      if (r >= N - 7 && c < 7) return { f: true, on: ring(N - 7, 0) };
      return { f: false, on: false };
    }
    var rects = "";
    for (var r = 0; r < N; r++) {
      for (var cc2 = 0; cc2 < N; cc2++) {
        var fd = finder(r, cc2);
        var on = fd.f ? fd.on : rand() > 0.5;
        if (on) rects += '<rect x="' + (cc2 * cell) + '" y="' + (r * cell) + '" width="' + cell + '" height="' + cell + '"/>';
      }
    }
    return '<svg class="qr" viewBox="0 0 ' + (N * cell) + ' ' + (N * cell) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + rects + '</g></svg>';
  }

  // Builds a printable FIR document (HTML) matching the official
  // Section-154 CrPC "Initial Information Report" template.
  function generateFirDocument(caseRef) {
    return ensureDb().then(function (db) {
      var c = db.cases.find(function (x) { return x.ref === caseRef; });
      if (!c) return { ok: false, error: "Case not found." };
      var acc = db.accounts.find(function (a) { return a.id === c.ownerId; });
      var dev = db.devices.find(function (d) { return d.id === c.deviceId; });
      var when = new Date(c.createdAt).toLocaleString();
      var risk = c.riskLevel ? c.riskLevel.toUpperCase() : "—";
      var riskStr = risk + (c.riskMatches != null ? " (" + c.riskMatches + "/" + c.riskTotal + " ownership signals matched)" : "");

      var offence =
        "Mobile phone theft. The complainant reports that the registered device below was stolen and has requested it be blocked. " +
        "Device: " + escHtml(dev ? dev.model : "—") + ", IMEI " + escHtml(dev ? dev.imei : "—") + ". " +
        "Block state: " + escHtml(c.blockState || "—") + ". Risk assessment: " + escHtml(riskStr) + ". " +
        "Reported via the Mahfooz Mobile emergency portal (reference " + escHtml(c.ref) + ").";

      var html =
'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>FIR ' + escHtml(c.ref) + '</title><style>' +
'@page{size:A4;margin:16mm;}' +
'*{box-sizing:border-box;}' +
'body{font-family:"Times New Roman",Georgia,serif;color:#111;margin:28px;line-height:1.35;}' +
'.fir-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;}' +
'.qr-box{width:150px;border:1px solid #000;text-align:center;padding:6px 6px 8px;font-size:12px;flex-shrink:0;}' +
'.qr-box .qr{width:108px;height:108px;margin:4px auto 2px;display:block;}' +
'.qr-box b{display:block;font-size:12.5px;}' +
'.fir-title{text-align:center;flex:1;padding:6px 8px 0;}' +
'.fir-title h1{font-size:20px;margin:2px 0 8px;}' +
'.fir-title .sub{font-size:13px;}' +
'.fir-title .sub2{font-size:12px;font-style:italic;margin-top:2px;}' +
'.meta{font-size:12.5px;margin:18px 0 10px;display:flex;flex-wrap:wrap;gap:6px 22px;}' +
'table.fir{width:100%;border-collapse:collapse;}' +
'table.fir td{border:1px solid #000;padding:12px 10px;vertical-align:top;font-size:13px;}' +
'table.fir td.num{width:40px;text-align:center;font-weight:bold;}' +
'table.fir td.label{width:38%;font-weight:bold;}' +
'.foot{margin-top:24px;font-weight:bold;font-size:13px;display:flex;flex-wrap:wrap;gap:10px 48px;}' +
'.center-note{text-align:center;margin-top:18px;font-size:13px;}' +
'.disclaimer{text-align:center;margin-top:12px;font-size:10.5px;color:#555;}' +
'</style></head><body>' +
'<div class="fir-head">' +
  '<div class="qr-box"><b>Authentication</b>' + firQr("AUTH-" + c.ref) + '<b>Scan for Verification</b></div>' +
  '<div class="fir-title"><h1>Police Station</h1>' +
    '<div class="sub">Initial Information Report under Section 154 of the Criminal Procedure Code</div>' +
    '<div class="sub2">(To be sent to the concerned police station without delay)</div></div>' +
  '<div class="qr-box"><b>Citizen Feedback</b>' + firQr("FEEDBACK-" + c.ref) + '<b>Scan for Feedback</b></div>' +
'</div>' +
'<div class="meta">' +
  '<span>No: <b>' + escHtml(c.ref) + '</b></span>' +
  '<span>Police Station: <b>' + escHtml(c.policeStation || "—") + '</b></span>' +
  '<span>District: <b>Lahore</b></span>' +
  '<span>Circle: <b>—</b></span>' +
  '<span>FIR No: <b>' + escHtml(c.ref) + '</b></span>' +
  '<span>Date and Time of Report: <b>' + escHtml(when) + '</b></span>' +
'</div>' +
'<table class="fir">' +
  '<tr><td class="num">1</td><td class="label">Date and time of report</td><td>' + escHtml(when) + '</td></tr>' +
  '<tr><td class="num">2</td><td class="label">Name and government designation of the informant / complainant</td><td>' +
    escHtml(acc ? acc.name : "—") + ' — Citizen (registered device owner)<br>CNIC: ' + escHtml(acc ? acc.cnic : "—") +
    '<br>Registered phone: ' + escHtml(acc ? acc.phone : "—") + (acc && acc.email ? '<br>Email: ' + escHtml(acc.email) : "") + '</td></tr>' +
  '<tr><td class="num">3</td><td class="label">The nature and classification of the offence (briefly what happened)</td><td>' + offence + '</td></tr>' +
  '<tr><td class="num">4</td><td class="label">Place of occurrence and distance and direction</td><td>Routed to ' + escHtml(c.policeStation || "—") + '. Exact location of occurrence to be stated by the complainant at the station.</td></tr>' +
  '<tr><td class="num">5</td><td class="label">Reasons for delay in reporting the incident (if any)</td><td>None — reported immediately through the Mahfooz Mobile emergency portal.</td></tr>' +
  '<tr><td class="num">6</td><td class="label">Date and time of occurrence of incident</td><td>' + escHtml(when) + ' (as reported)</td></tr>' +
'</table>' +
'<div class="foot"><span>In-charge: _______________</span><span>Belt No: _________</span><span>Rank: _________</span><span>Mobile No: _______________</span></div>' +
'<div class="center-note">(Initial Information Report)</div>' +
'<div class="disclaimer">Mahfooz Mobile — system-generated theft report draft (reference ' + escHtml(c.ref) + '). This is NOT a legally-registered FIR. ' +
  'The complainant must complete official filing at the named police station. QR codes are demo placeholders.</div>' +
'</body></html>';

      return { ok: true, html: html, filename: "FIR-" + c.ref + ".html" };
    });
  }

  // ------------------------------------------------------------------
  // Alternate PIN recovery via email / registered number OTP.
  // ------------------------------------------------------------------
  function recoverPinViaOtp(identifier, otp, newPin) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account matches that CNIC/phone number." };
      if (!checkOtp(db, acc, otp)) {
        return appendAuditLogToDb(db, acc.name, "PIN_RECOVERY_OTP_FAILED", "—").then(function (d) {
          save(d);
          return { ok: false, error: "Incorrect or expired code." };
        });
      }
      if (isWeakPin(newPin)) return { ok: false, error: "That PIN is too easy to guess (sequential/repeated/common). Choose another." };
      return sha256(newPin).then(function (h) {
        acc.emergencyPinHash = h;
        if (db.otps) delete db.otps[acc.id];
        return appendAuditLogToDb(db, acc.name, "PIN_RECOVERY_OTP_SUCCESS", "—").then(function (d) {
          save(d);
          return { ok: true, accountId: acc.id };
        });
      });
    });
  }

  function unblockDevice(deviceId, password, totp) {
    return ensureDb().then(function (db) {
      return getCurrentAccount().then(function (acc) {
        var device = db.devices.find(function (d) { return d.id === deviceId; });
        if (!device) return { ok: false, error: "Device not found." };
        if (device.ownerId !== acc.id) return { ok: false, error: "You do not own this device." };
        if (!totp || !/^\d{6}$/.test(totp)) return { ok: false, error: "Enter the 6-digit authenticator code." };
        return sha256(password).then(function (h) {
          if (h !== acc.passwordHash) return { ok: false, error: "Incorrect password." };
          device.status = "active";
          return appendAuditLogToDb(db, acc.name, "DEVICE_UNBLOCKED", maskIMEI(device.imei)).then(function (d) {
            save(d);
            return { ok: true, device: device };
          });
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Forgot-PIN recovery
  // ------------------------------------------------------------------
  function getRecoveryQuestions(identifier) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account found with that CNIC/phone number." };
      return { ok: true, questions: acc.recoveryQuestions.map(function (rq) { return rq.q; }) };
    });
  }

  function recoverPin(identifier, answers) {
    return ensureDb().then(function (db) {
      var acc = findAccountByIdentifier(db, identifier);
      if (!acc) return { ok: false, error: "No account found with that CNIC/phone number." };
      return Promise.all(answers.map(function (a) { return sha256(normalize(a)); })).then(function (hashes) {
        var correct = 0;
        hashes.forEach(function (h, i) {
          if (acc.recoveryQuestions[i] && h === acc.recoveryQuestions[i].aHash) correct++;
        });
        var pass = correct >= 3;
        return appendAuditLogToDb(db, acc.name, pass ? "PIN_RECOVERY_SUCCESS" : "PIN_RECOVERY_FAILED", correct + "/5 correct").then(function (d) {
          save(d);
          return { ok: pass, correct: correct, accountId: acc.id, error: pass ? null : "Only " + correct + " of 5 answers matched — at least 3 are required." };
        });
      });
    });
  }

  function setNewEmergencyPin(accountId, newPin, password, totp) {
    // password/totp are optional: the forgot-PIN recovery flow omits them
    // (identity was already proven via the 5 questions); the routine
    // account-settings flow requires both for step-up re-authentication.
    return ensureDb().then(function (db) {
      var acc = db.accounts.find(function (a) { return a.id === accountId; });
      if (!acc) return { ok: false, error: "Account not found." };
      if (isWeakPin(newPin)) return { ok: false, error: "That PIN is too easy to guess (sequential/repeated/common). Choose another." };

      var authCheck = Promise.resolve(true);
      if (password !== undefined) {
        if (!totp || !/^\d{6}$/.test(totp)) return { ok: false, error: "Enter the 6-digit authenticator code." };
        authCheck = sha256(password).then(function (h) { return h === acc.passwordHash; });
      }
      return authCheck.then(function (ok) {
        if (!ok) return { ok: false, error: "Incorrect password." };
        return sha256(newPin).then(function (h) {
          acc.emergencyPinHash = h;
          return appendAuditLogToDb(db, acc.name, "EMERGENCY_PIN_CHANGED", "—").then(function (d) {
            save(d);
            return { ok: true };
          });
        });
      });
    });
  }

  function isWeakPin(pin) {
    var p = String(pin);
    if (/^(\d)\1+$/.test(p)) return true; // all same digit
    var seqUp = "0123456789", seqDown = "9876543210";
    if (seqUp.indexOf(p) !== -1 || seqDown.indexOf(p) !== -1) return true;
    return false;
  }

  // ------------------------------------------------------------------
  // Disputes
  // ------------------------------------------------------------------
  function submitDispute(deviceId, reason) {
    return ensureDb().then(function (db) {
      return getCurrentAccount().then(function (acc) {
        var device = db.devices.find(function (d) { return d.id === deviceId; });
        var dispute = {
          id: nextId("disp"), citizenId: acc.id, citizenLabel: "•••• (masked)",
          summary: "Disputed Block", priority: "Normal", status: "Open",
          caseRef: "CS-" + Math.floor(10000 + Math.random() * 89999), createdAt: new Date().toISOString(),
          reason: reason, deviceLabel: device ? device.nickname : "—",
        };
        db.disputes.unshift(dispute);
        return appendAuditLogToDb(db, acc.name, "DISPUTE_SUBMITTED", dispute.caseRef).then(function (d) {
          save(d);
          return { ok: true, dispute: dispute };
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // IMEI lookup (anti-enumeration: generic shape regardless of existence)
  // ------------------------------------------------------------------
  function checkImei(imei) {
    return ensureDb().then(function (db) {
      var device = db.devices.find(function (d) { return d.imei === String(imei).trim(); });
      var blocked = !!(device && (device.status === "blocked" || device.status === "temp_blocked"));
      return appendAuditLog("Public", "IMEI_LOOKUP", maskIMEI(imei)).then(function () {
        return { blocked: blocked };
      });
    });
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  return {
    ensureDb: ensureDb,
    load: load,
    save: save,
    sha256: sha256,
    validateCNIC: validateCNIC,
    validateIMEI: validateIMEI,
    maskCNIC: maskCNIC,
    maskIMEI: maskIMEI,
    getSessionId: getSessionId,
    setSessionId: setSessionId,
    logout: logout,
    getCurrentAccount: getCurrentAccount,
    registerAccountAndDevice: registerAccountAndDevice,
    registerDeviceForCurrentUser: registerDeviceForCurrentUser,
    login: login,
    staffLogin: staffLogin,
    getDevicesForReport: getDevicesForReport,
    issueOtp: issueOtp,
    reportTheft: reportTheft,
    completeFullVerification: completeFullVerification,
    generateFirDocument: generateFirDocument,
    unblockDevice: unblockDevice,
    getRecoveryQuestions: getRecoveryQuestions,
    recoverPin: recoverPin,
    recoverPinViaOtp: recoverPinViaOtp,
    maskEmail: maskEmail,
    maskPhone: maskPhone,
    setNewEmergencyPin: setNewEmergencyPin,
    isWeakPin: isWeakPin,
    submitDispute: submitDispute,
    checkImei: checkImei,
    appendAuditLog: appendAuditLog,
    verifyAuditChain: verifyAuditChain,
  };
})();
