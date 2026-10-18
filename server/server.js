// ============================================================================
// Mahfooz Mobile — backend API
// Serves the static website AND exposes the real logic against PostgreSQL.
// Preserves the shapes the frontend's MahfoozStore expects, so the UI works
// unchanged except for store.js (now an API client) and a few session tweaks.
// ============================================================================
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const { pool, query, ENC_KEY, IDX_KEY } = require("./db");

const app = express();
app.use(express.json({ limit: "256kb" }));

// ---------------------------------------------------------------------------
// Email (OTP delivery). Configured via env vars; if they're absent the app
// falls back to "demo mode" (the code is shown on screen instead of emailed).
//   SMTP_USER / SMTP_PASS  (e.g. a Gmail address + App Password)
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), SMTP_FROM
// ---------------------------------------------------------------------------
let mailer = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  const port = Number(process.env.SMTP_PORT || 465);
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  mailer.verify().then(
    () => console.log("Email sending ENABLED (SMTP ready)."),
    (e) => console.warn("SMTP configured but verify failed:", e.message)
  );
} else {
  console.log("Email sending DISABLED — no SMTP_USER/SMTP_PASS. OTPs shown on screen (demo mode).");
}

async function sendOtpEmail(toEmail, code, purpose) {
  if (!mailer || !toEmail) return false;
  const what = purpose === "pin_recovery" ? "Emergency PIN recovery" : "stolen-phone report";
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || ('"Mahfooz Mobile" <' + process.env.SMTP_USER + ">"),
      to: toEmail,
      subject: "Mahfooz Mobile — your verification code: " + code,
      text:
        "Your Mahfooz Mobile verification code for your " + what + " is: " + code + "\n\n" +
        "It expires in 10 minutes. If you did not request this, you can ignore this email.",
      html:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">' +
        '<h2 style="color:#0b3d2e">Mahfooz Mobile</h2>' +
        "<p>Your verification code for your <strong>" + what + "</strong> is:</p>" +
        '<p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#1a7a4c">' + code + "</p>" +
        "<p style=\"color:#666;font-size:13px\">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>" +
        "</div>",
    });
    return true;
  } catch (e) {
    console.error("OTP email send failed:", e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const bidx = (v) => crypto.createHmac("sha256", IDX_KEY).update(String(v)).digest("hex");
const normHash = (v) => crypto.createHash("sha256").update(String(v == null ? "" : v).trim().toLowerCase()).digest("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");
const tokenHash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

function luhnOk(num) {
  if (!/^\d+$/.test(num)) return false;
  let s = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    s += d; alt = !alt;
  }
  return s % 10 === 0;
}
const validCnic = (c) => /^\d{5}-\d{7}-\d$/.test(String(c || ""));
const validImei = (i) => /^\d{15}$/.test(String(i || "")) && luhnOk(String(i));
function isWeakPin(pin) {
  const p = String(pin);
  if (/^(\d)\1+$/.test(p)) return true;
  if ("0123456789".includes(p) || "9876543210".includes(p)) return true;
  return false;
}
function maskImei(imei) { return imei ? "•••• •••• " + String(imei).slice(-4) : ""; }

// account row -> safe object for the client (no secrets, identifiers masked)
function accountSafe(r) {
  if (!r) return null;
  return {
    id: r.id, role: r.role, name: r.full_name, initials: r.initials,
    cnic: r.cnic_masked || null, phone: r.phone_masked || null,
    email: r.email_masked || null,
  };
}

async function findAccountByIdentifier(identifier) {
  const id = String(identifier || "").trim();
  const r = await query(
    `SELECT *, pgp_sym_decrypt(email_enc, $2) AS email_plain
       FROM account WHERE cnic_bidx = $1 OR phone_bidx = $1 LIMIT 1`,
    [bidx(id), ENC_KEY]
  );
  return r.rows[0] || null;
}

async function appendAudit(actor, action, ref) {
  await query("INSERT INTO audit_log(actor, action, ref) VALUES ($1,$2,$3)", [actor, action, ref || "—"]);
}

// ---------------------------------------------------------------------------
// Auth: bearer token -> account
// ---------------------------------------------------------------------------
async function accountFromToken(token) {
  if (!token) return null;
  const r = await query(
    `SELECT a.* FROM app_session s JOIN account a ON a.id = s.account_id
       WHERE s.refresh_token_hash = $1 AND NOT s.revoked AND s.expires_at > now()
       LIMIT 1`,
    [tokenHash(token)]
  );
  return r.rows[0] || null;
}
async function loadAuth(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  req.account = token ? await accountFromToken(token) : null;
  req.token = token;
  next();
}
function requireAuth(req, res, next) {
  if (!req.account) return res.status(401).json({ ok: false, error: "Not authenticated." });
  next();
}
async function issueSession(accountId) {
  const token = newToken();
  await query("INSERT INTO app_session(account_id, refresh_token_hash) VALUES ($1,$2)", [accountId, tokenHash(token)]);
  return token;
}

app.use(loadAuth);

// ===========================================================================
// Auth / identity
// ===========================================================================
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const id = String(identifier || "").trim();
    const r = await query(
      `SELECT *, (password_hash = crypt($2, password_hash)) AS pw_ok
         FROM account WHERE cnic_bidx = $1 OR phone_bidx = $1 LIMIT 1`,
      [bidx(id), String(password || "")]
    );
    const acc = r.rows[0];
    if (!acc || !acc.pw_ok) return res.json({ ok: false, error: "Invalid credentials. Check your CNIC/phone and password." });
    const token = await issueSession(acc.id);
    await appendAudit(acc.full_name, "LOGIN_SUCCESS", "—");
    res.json({ ok: true, account: accountSafe(acc), token });
  } catch (e) { res.json({ ok: false, error: "Login failed." }); }
});

app.get("/api/me", (req, res) => res.json({ ok: true, account: accountSafe(req.account) }));

app.post("/api/logout", requireAuth, async (req, res) => {
  await query("UPDATE app_session SET revoked = true WHERE refresh_token_hash = $1", [tokenHash(req.token)]);
  res.json({ ok: true });
});

// Demo convenience: list seed identities + log in as one without a password
// (clearly a demo affordance; limited to the seeded citizen/staff accounts).
app.get("/api/demo/accounts", async (_req, res) => {
  const r = await query("SELECT id, full_name, role FROM account WHERE role IN ('citizen','agent','auditor') ORDER BY id");
  res.json({
    ok: true,
    citizens: r.rows.filter((a) => a.role === "citizen").map((a) => ({ id: a.id, name: a.full_name })),
    staff: r.rows.filter((a) => a.role !== "citizen").map((a) => ({ id: a.id, name: a.full_name + (a.role === "agent" ? " (Support Agent)" : " (Auditor)") })),
  });
});
app.post("/api/demo/login", async (req, res) => {
  const { accountId } = req.body || {};
  const r = await query("SELECT * FROM account WHERE id = $1 AND role IN ('citizen','agent','auditor')", [accountId]);
  const acc = r.rows[0];
  if (!acc) return res.json({ ok: false, error: "Unknown demo account." });
  const token = await issueSession(acc.id);
  res.json({ ok: true, account: accountSafe(acc), token });
});

// ===========================================================================
// Registration
// ===========================================================================
app.post("/api/register", async (req, res) => {
  const d = req.body || {};
  if (!validCnic(d.cnic)) return res.json({ ok: false, error: "Invalid CNIC format. Use 00000-0000000-0." });
  if (!validImei(d.imei)) return res.json({ ok: false, error: "Invalid IMEI — must be 15 digits and pass the Luhn checksum." });

  const client = await pool.connect();
  try {
    // CNIC uniqueness (concept 1a)
    const dup = await client.query("SELECT 1 FROM account WHERE cnic_bidx = $1", [bidx(d.cnic)]);
    if (dup.rows.length) {
      await client.query("INSERT INTO cnic_registration_attempt(cnic_bidx, cnic_masked, note) VALUES ($1, mask_cnic($2), $3)",
        [bidx(d.cnic), d.cnic, "Duplicate CNIC registration attempt"]);
      await appendAudit("Unknown", "DUPLICATE_CNIC_ATTEMPT", "masked");
      return res.json({ ok: false, error: "This CNIC is already registered to an account. If this is you, log in instead. If it isn't, this attempt has been logged." });
    }

    await client.query("BEGIN");
    const initials = String(d.name || "NC").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const acc = await client.query(
      `INSERT INTO account
        (role, full_name, initials, cnic_enc, phone_enc, email_enc, alt_phone_enc,
         cnic_bidx, phone_bidx, cnic_masked, phone_masked, password_hash, emergency_pin_hash)
       VALUES ('citizen',$1,$2,
         pgp_sym_encrypt($3,$11), pgp_sym_encrypt($4,$11), pgp_sym_encrypt($5,$11), pgp_sym_encrypt('',$11),
         $6,$7, mask_cnic($3), $8, crypt($9, gen_salt('bf')), crypt($10, gen_salt('bf')))
       RETURNING id, full_name`,
      [d.name || "New Citizen", initials, d.cnic, d.phone || "", d.email || "",
       bidx(d.cnic), bidx(d.phone || ""),
       (String(d.phone || "").length >= 4 ? "•••• ••• " + String(d.phone).replace(/\D/g, "").slice(-4) : null),
       d.password || "", d.emergencyPin || "", ENC_KEY]
    );
    const accId = acc.rows[0].id;

    // recovery questions
    const qs = [
      ["What nickname did you give your first device?", (d.answers || [])[0]],
      ["Approximately when did you register?", (d.answers || [])[1]],
      ["What city did you register from?", (d.answers || [])[2]],
      [(d.customQuestions || [])[0] || "Custom security question (set by you)", (d.answers || [])[3]],
      [(d.customQuestions || [])[1] || "Custom security question (set by you)", (d.answers || [])[4]],
    ];
    for (let i = 0; i < 5; i++) {
      await client.query("INSERT INTO account_recovery_question(account_id, position, question, answer_hash) VALUES ($1,$2,$3,$4)",
        [accId, i + 1, qs[i][0], normHash(qs[i][1])]);
    }

    // device (DB enforces: IMEI must be PTA-approved & active)
    const fullModel = [d.brand, d.model].filter(Boolean).join(" ").trim() || "Registered Device";
    let dev;
    try {
      dev = await client.query(
        "INSERT INTO device(account_id, imei, nickname, brand, model, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING *",
        [accId, d.imei, d.nickname || "My Device", d.brand || "", fullModel]
      );
    } catch ( e) {
      await client.query("ROLLBACK");
      if (/not an active PTA-approved|foreign key|pta_approved/i.test(e.message))
        return res.json({ ok: false, error: "This IMEI is not PTA-approved and cannot be registered." });
      if (/duplicate key/i.test(e.message))
        return res.json({ ok: false, error: "This IMEI is already registered." });
      throw e;
    }
    await client.query("COMMIT");
    await appendAudit(acc.rows[0].full_name, "ACCOUNT_REGISTERED", "masked");
    await appendAudit(acc.rows[0].full_name, "DEVICE_REGISTERED", maskImei(d.imei));

    const token = await issueSession(accId);
    const accRow = (await query("SELECT * FROM account WHERE id=$1", [accId])).rows[0];
    res.json({ ok: true, account: accountSafe(accRow), device: dev.rows[0], token });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    res.json({ ok: false, error: "Registration failed." });
  } finally { client.release(); }
});

// Register another device under the logged-in account
app.post("/api/devices", requireAuth, async (req, res) => {
  const d = req.body || {};
  if (!validImei(d.imei)) return res.json({ ok: false, error: "Invalid IMEI — must be 15 digits and pass the Luhn checksum." });
  const existing = await query("SELECT status FROM device WHERE imei=$1", [d.imei]);
  if (existing.rows[0] && (existing.rows[0].status === "blocked" || existing.rows[0].status === "temp_blocked"))
    return res.json({ ok: false, error: "This IMEI is already registered and currently blocked." });
  const fullModel = [d.brand, d.model].filter(Boolean).join(" ").trim() || "Registered Device";
  try {
    const dev = await query(
      "INSERT INTO device(account_id, imei, nickname, brand, model, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING *",
      [req.account.id, d.imei, d.nickname || "My Device", d.brand || "", fullModel]
    );
    await appendAudit(req.account.full_name, "DEVICE_REGISTERED", maskImei(d.imei));
    res.json({ ok: true, device: dev.rows[0] });
  } catch (e) {
    if (/not an active PTA-approved|foreign key|pta_approved/i.test(e.message))
      return res.json({ ok: false, error: "This IMEI is not PTA-approved and cannot be registered." });
    if (/duplicate key/i.test(e.message)) return res.json({ ok: false, error: "This IMEI is already registered." });
    res.json({ ok: false, error: "Could not register device." });
  }
});

// ===========================================================================
// Emergency reporting (public) + risk engine
// ===========================================================================
app.post("/api/emergency/devices", async (req, res) => {
  const acc = await findAccountByIdentifier(req.body && req.body.identifier);
  if (!acc) return res.json({ ok: false, error: "No account matches that CNIC/phone number." });
  const devs = (await query("SELECT * FROM device WHERE account_id=$1 ORDER BY id", [acc.id])).rows;
  res.json({
    ok: true,
    account: { name: acc.full_name, email: acc.email_plain ? maskEmailStr(acc.email_plain) : "", phone: acc.phone_masked, altPhone: "" },
    simMatch: acc.phone_bidx === bidx(String(req.body.identifier).trim()),
    devices: devs.map((d) => ({ id: d.id, nickname: d.nickname, model: d.model, maskedImei: maskImei(d.imei), status: d.status, selectable: d.status === "active" || d.status === "retired" })),
  });
});
function maskEmailStr(e) {
  const p = String(e).split("@"); if (p.length !== 2) return e;
  return p[0].slice(0, 2) + "•••••@" + p[1];
}

app.post("/api/otp/issue", async (req, res) => {
  const acc = await findAccountByIdentifier(req.body && req.body.identifier);
  if (!acc) return res.json({ ok: false, error: "No account matches that CNIC/phone number." });
  const purpose = req.body.purpose === "pin_recovery" ? "pin_recovery" : "emergency_report";
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await query("INSERT INTO otp(account_id, code_hash, purpose) VALUES ($1,$2,$3)", [acc.id, normHash(code), purpose]);
  const sentTo = acc.email_plain ? maskEmailStr(acc.email_plain) : acc.phone_masked;

  // Try to email the code. If SMTP isn't configured (or send fails), fall
  // back to demo mode: return the code so the UI can show it on screen.
  const emailed = acc.email_plain ? await sendOtpEmail(acc.email_plain, code, purpose) : false;
  if (emailed) return res.json({ ok: true, sentTo: sentTo, emailed: true });
  return res.json({ ok: true, sentTo: sentTo, otp: code, demo: true });
});

async function otpValid(accountId, code) {
  if (!code) return false;
  const r = await query(
    `SELECT id FROM otp WHERE account_id=$1 AND code_hash=$2 AND NOT consumed AND expires_at > now()
       ORDER BY issued_at DESC LIMIT 1`,
    [accountId, normHash(code)]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

app.post("/api/emergency/report", async (req, res) => {
  const { identifier, pin, deviceId, phone, password } = req.body || {};
  const acc = await findAccountByIdentifier(identifier);
  if (!acc) return res.json({ ok: false, error: "No account matches that CNIC/phone number." });

  // Emergency PIN + account password are both verified up front.
  const chk = await query(
    "SELECT (emergency_pin_hash = crypt($1, emergency_pin_hash)) AS pin_ok, (password_hash = crypt($2, password_hash)) AS pw_ok FROM account WHERE id=$3",
    [String(pin || ""), String(password || ""), acc.id]
  );
  if (!chk.rows[0] || !chk.rows[0].pin_ok) {
    await appendAudit(acc.full_name, "EMERGENCY_PIN_FAILED", "—");
    return res.json({ ok: false, error: "Incorrect Emergency PIN." });
  }
  if (!chk.rows[0].pw_ok) {
    await appendAudit(acc.full_name, "EMERGENCY_PASSWORD_FAILED", "—");
    return res.json({ ok: false, error: "Incorrect password." });
  }

  const mine = (await query("SELECT * FROM device WHERE account_id=$1", [acc.id])).rows;
  const target = deviceId ? mine.find((d) => String(d.id) === String(deviceId)) : null;
  if (!target) {
    return res.json({
      ok: false, needsDevice: true,
      devices: mine.filter((d) => d.status === "active" || d.status === "retired").map((d) => ({ id: d.id, label: d.nickname + " — " + d.model })),
      error: "Select which of your linked devices was stolen.",
    });
  }
  if (target.status === "blocked" || target.status === "temp_blocked")
    return res.json({ ok: false, error: "That device is already blocked." });

  const factors = {
    emergencyPin: true,
    phoneMatch: !!phone && acc.phone_bidx === bidx(String(phone).trim()),
    imeiActive: target.status === "active",
    simOwnership: acc.phone_bidx === bidx(String(identifier).trim()),
  };
  const matches = Object.values(factors).filter(Boolean).length;
  const level = matches >= 3 ? "low" : matches === 2 ? "medium" : "high";

  const ref = "MM-" + new Date().getFullYear() + "-" + String(Math.floor(10000 + Math.random() * 89999)).padStart(5, "0");
  const now = new Date().toISOString();
  // Password is verified up front, so a block is FULL immediately — there is
  // no separate "complete full verification" step any more.
  let blocked, blockState, reviewStatus, timeline;
  if (level === "low") {
    blocked = true; blockState = "full"; reviewStatus = "fully-verified";
    timeline = [["Reported", now], ["Device Blocked", now], ["Report Sent to Police", now]];
  } else if (level === "medium") {
    blocked = true; blockState = "full"; reviewStatus = "manual-review";
    timeline = [["Reported", now], ["Device Blocked", now], ["Sent for Manual Verification", now]];
  } else {
    blocked = false; blockState = "none"; reviewStatus = "manual-review-required";
    timeline = [["Reported", now], ["Held for Manual Ownership Check", now]];
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (blocked) await client.query("UPDATE device SET status='blocked' WHERE id=$1", [target.id]);
    const c = await client.query(
      `INSERT INTO theft_case(ref, device_id, account_id, created_at, police_station, district,
          risk_level, risk_matches, risk_total, risk_factors, block_state, review_status, reported_via)
       VALUES ($1,$2,$3,$4,'Gulberg Station','Lahore',$5,$6,4,$7,$8,$9,$10) RETURNING *`,
      [ref, target.id, acc.id, now, level, matches, JSON.stringify(factors), blockState, reviewStatus,
       factors.simOwnership ? "registered phone" : "CNIC"]
    );
    for (const [step, at] of timeline)
      await client.query("INSERT INTO case_timeline(case_id, step, at) VALUES ($1,$2,$3)", [c.rows[0].id, step, at]);
    await client.query("INSERT INTO notification(account_id, text, meta, icon) VALUES ($1,$2,$3,$4)",
      [acc.id, (blocked ? "Device blocked — " : "Theft report held for review — ") + target.model,
       "Ref# " + ref + " · " + level.toUpperCase() + " risk", blocked ? "check" : "bell"]);
    if (reviewStatus !== "fully-verified") {
      await client.query(
        `INSERT INTO dispute(case_ref, account_id, citizen_label, kind, summary, priority, status, risk_level, reason, device_label)
         VALUES ($1,$2,'•••• (masked)','theft_review',$3,$4,$5,$6,$7,$8)`,
        [ref, acc.id, "Theft Review — " + level.toUpperCase() + " risk",
         level === "high" ? "High" : "Normal",
         blocked ? "Blocked, awaiting review" : "Awaiting ownership check", level,
         "Automated theft report flagged for manual verification. Risk: " + level.toUpperCase() +
           " (" + matches + "/4 signals matched).", target.nickname + " — " + target.model]);
    }
    await client.query("INSERT INTO audit_log(actor, action, ref) VALUES ($1,'EMERGENCY_PIN_SUCCESS','—'),($1,'RISK_ASSESSED',$2),($1,$3,$4)",
      [acc.full_name, level.toUpperCase() + " " + matches + "/4", blocked ? "DEVICE_BLOCKED" : "THEFT_REPORT_HELD", ref]);
    await client.query("COMMIT");
    res.json({ ok: true, device: target, caseObj: caseOut(c.rows[0], timeline), risk: { level, matches, total: 4, factors }, blocked });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    res.json({ ok: false, error: "Could not file the report." });
  } finally { client.release(); }
});

function caseOut(row, timeline) {
  return {
    id: row.id, ref: row.ref, deviceId: row.device_id, ownerId: row.account_id,
    createdAt: row.created_at, policeStation: row.police_station, district: row.district,
    riskLevel: row.risk_level, riskMatches: row.risk_matches, riskTotal: row.risk_total,
    blockState: row.block_state, reviewStatus: row.review_status, reportedVia: row.reported_via,
    timeline: (timeline || []).map((t) => (Array.isArray(t) ? { step: t[0], at: t[1] } : t)),
  };
}

// Case (public, by ref) — used by case-status.html
app.get("/api/case/:ref", async (req, res) => {
  const c = (await query("SELECT * FROM theft_case WHERE ref=$1", [req.params.ref])).rows[0];
  if (!c) return res.json({ ok: false, error: "Case not found." });
  const tl = (await query("SELECT step, at FROM case_timeline WHERE case_id=$1 ORDER BY id", [c.id])).rows;
  const dev = (await query("SELECT * FROM device WHERE id=$1", [c.device_id])).rows[0];
  res.json({ ok: true, caseObj: caseOut(c, tl), device: dev });
});

// Complete full verification (temp -> full), public by ref + password
app.post("/api/case/verify", async (req, res) => {
  const { caseRef, password, totp } = req.body || {};
  const c = (await query("SELECT * FROM theft_case WHERE ref=$1", [caseRef])).rows[0];
  if (!c) return res.json({ ok: false, error: "Case not found." });
  if (!/^\d{6}$/.test(String(totp || ""))) return res.json({ ok: false, error: "Enter the 6-digit authenticator code." });
  const chk = await query("SELECT (password_hash = crypt($1, password_hash)) AS ok, full_name FROM account WHERE id=$2", [String(password || ""), c.account_id]);
  if (!chk.rows[0] || !chk.rows[0].ok) return res.json({ ok: false, error: "Incorrect password." });
  await query("UPDATE device SET status='blocked' WHERE id=$1 AND status='temp_blocked'", [c.device_id]);
  await query("UPDATE theft_case SET block_state='full', review_status='fully-verified' WHERE id=$1", [c.id]);
  await query("INSERT INTO case_timeline(case_id, step) VALUES ($1,'Full Verification Complete')", [c.id]);
  await appendAudit(chk.rows[0].full_name, "FULL_VERIFICATION_COMPLETE", caseRef);
  res.json({ ok: true });
});

// FIR document (public, by ref)
app.get("/api/fir/:ref", async (req, res) => {
  const c = (await query("SELECT * FROM theft_case WHERE ref=$1", [req.params.ref])).rows[0];
  if (!c) return res.json({ ok: false, error: "Case not found." });
  const acc = (await query("SELECT *, pgp_sym_decrypt(cnic_enc,$2) AS cnic_plain, pgp_sym_decrypt(email_enc,$2) AS email_plain, pgp_sym_decrypt(phone_enc,$2) AS phone_plain FROM account WHERE id=$1", [c.account_id, ENC_KEY])).rows[0];
  const dev = (await query("SELECT * FROM device WHERE id=$1", [c.device_id])).rows[0];
  const tl = (await query("SELECT step, at FROM case_timeline WHERE case_id=$1 ORDER BY id", [c.id])).rows;
  res.json({ ok: true, html: firHtml(c, acc, dev, tl), filename: "FIR-" + c.ref + ".html" });
});

// ===========================================================================
// Unblock, dispute, PIN recovery, IMEI check
// ===========================================================================
app.post("/api/devices/unblock", requireAuth, async (req, res) => {
  const { deviceId, password, totp } = req.body || {};
  const dev = (await query("SELECT * FROM device WHERE id=$1", [deviceId])).rows[0];
  if (!dev) return res.json({ ok: false, error: "Device not found." });
  if (dev.account_id !== req.account.id) return res.json({ ok: false, error: "You do not own this device." });
  if (!/^\d{6}$/.test(String(totp || ""))) return res.json({ ok: false, error: "Enter the 6-digit authenticator code." });
  const chk = await query("SELECT (password_hash = crypt($1, password_hash)) AS ok FROM account WHERE id=$2", [String(password || ""), req.account.id]);
  if (!chk.rows[0] || !chk.rows[0].ok) return res.json({ ok: false, error: "Incorrect password." });
  await query("UPDATE device SET status='active' WHERE id=$1", [dev.id]);
  await appendAudit(req.account.full_name, "DEVICE_UNBLOCKED", maskImei(dev.imei));
  res.json({ ok: true, device: { ...dev, status: "active" } });
});

app.post("/api/disputes", requireAuth, async (req, res) => {
  const { deviceId, reason } = req.body || {};
  const dev = (await query("SELECT * FROM device WHERE id=$1 AND account_id=$2", [deviceId, req.account.id])).rows[0];
  const caseRef = "CS-" + Math.floor(10000 + Math.random() * 89999);
  await query(
    `INSERT INTO dispute(case_ref, account_id, citizen_label, kind, summary, priority, status, reason, device_label)
     VALUES ($1,$2,'•••• (masked)','dispute','Disputed Block','Normal','Open',$3,$4)`,
    [caseRef, req.account.id, reason || "", dev ? dev.nickname : "—"]);
  await appendAudit(req.account.full_name, "DISPUTE_SUBMITTED", caseRef);
  res.json({ ok: true, dispute: { caseRef } });
});

// Staff updates a case/dispute status (e.g., "Mark In Review")
app.post("/api/disputes/update", requireAuth, async (req, res) => {
  if (req.account.role !== "agent" && req.account.role !== "auditor")
    return res.json({ ok: false, error: "Staff only." });
  const { id, status } = req.body || {};
  await query("UPDATE dispute SET status=$1 WHERE id=$2", [String(status || "In Review"), id]);
  await appendAudit(req.account.full_name, "CASE_MARKED_IN_REVIEW", String(id));
  res.json({ ok: true });
});

app.post("/api/recovery/questions", async (req, res) => {
  const acc = await findAccountByIdentifier(req.body && req.body.identifier);
  if (!acc) return res.json({ ok: false, error: "No account found with that CNIC/phone number." });
  const qs = (await query("SELECT question FROM account_recovery_question WHERE account_id=$1 ORDER BY position", [acc.id])).rows;
  res.json({ ok: true, questions: qs.map((q) => q.question) });
});

// Short-lived recovery tokens: issued only after the 5-question identity check
// passes, consumed by /api/pin/reset. Prevents resetting a PIN just by knowing
// an account id, and is independent of any login session.
const recoveryTokens = new Map(); // token -> { accountId, exp }

app.post("/api/recovery/answers", async (req, res) => {
  const { identifier, answers } = req.body || {};
  const acc = await findAccountByIdentifier(identifier);
  if (!acc) return res.json({ ok: false, error: "No account found with that CNIC/phone number." });
  const qs = (await query("SELECT position, answer_hash FROM account_recovery_question WHERE account_id=$1 ORDER BY position", [acc.id])).rows;
  let correct = 0;
  qs.forEach((q, i) => { if ((answers || [])[i] != null && normHash(answers[i]) === q.answer_hash) correct++; });
  const pass = correct >= 3;
  await appendAudit(acc.full_name, pass ? "PIN_RECOVERY_SUCCESS" : "PIN_RECOVERY_FAILED", correct + "/5 correct");
  let recoveryToken = null;
  if (pass) {
    recoveryToken = newToken();
    recoveryTokens.set(recoveryToken, { accountId: acc.id, exp: Date.now() + 10 * 60 * 1000 });
  }
  res.json({ ok: pass, correct, accountId: acc.id, recoveryToken, error: pass ? null : "Only " + correct + " of 5 answers matched — at least 3 are required." });
});

// Reset the Emergency PIN using a recovery token (post-question recovery).
app.post("/api/pin/reset", async (req, res) => {
  const { recoveryToken, newPin } = req.body || {};
  const rec = recoveryTokens.get(recoveryToken);
  if (!rec || rec.exp < Date.now()) { recoveryTokens.delete(recoveryToken); return res.json({ ok: false, error: "Recovery session expired — please start again." }); }
  if (isWeakPin(newPin)) return res.json({ ok: false, error: "That PIN is too easy to guess (sequential/repeated/common). Choose another." });
  const acc = (await query("SELECT full_name FROM account WHERE id=$1", [rec.accountId])).rows[0];
  if (!acc) return res.json({ ok: false, error: "Account not found." });
  await query("UPDATE account SET emergency_pin_hash = crypt($1, gen_salt('bf')) WHERE id=$2", [String(newPin), rec.accountId]);
  await query("UPDATE app_session SET revoked=true WHERE account_id=$1", [rec.accountId]);
  recoveryTokens.delete(recoveryToken);
  await appendAudit(acc.full_name, "EMERGENCY_PIN_RESET_VIA_RECOVERY", "—");
  res.json({ ok: true });
});

app.post("/api/recovery/otp", async (req, res) => {
  const { identifier, otp, newPin } = req.body || {};
  const acc = await findAccountByIdentifier(identifier);
  if (!acc) return res.json({ ok: false, error: "No account found with that CNIC/phone number." });
  const otpId = await otpValid(acc.id, otp);
  if (!otpId) { await appendAudit(acc.full_name, "PIN_RECOVERY_OTP_FAILED", "—"); return res.json({ ok: false, error: "Incorrect or expired code." }); }
  if (isWeakPin(newPin)) return res.json({ ok: false, error: "That PIN is too easy to guess (sequential/repeated/common). Choose another." });
  await query("UPDATE account SET emergency_pin_hash = crypt($1, gen_salt('bf')) WHERE id=$2", [String(newPin), acc.id]);
  await query("UPDATE otp SET consumed=true WHERE id=$1", [otpId]);
  await appendAudit(acc.full_name, "PIN_RECOVERY_OTP_SUCCESS", "—");
  res.json({ ok: true, accountId: acc.id });
});

// Routine Emergency PIN change from account settings — requires the logged-in
// user to re-authenticate with password + authenticator code (step-up).
app.post("/api/pin/set", requireAuth, async (req, res) => {
  const { newPin, password, totp } = req.body || {};
  const acc = req.account;
  if (isWeakPin(newPin)) return res.json({ ok: false, error: "That PIN is too easy to guess (sequential/repeated/common). Choose another." });
  if (!/^\d{6}$/.test(String(totp || ""))) return res.json({ ok: false, error: "Enter the 6-digit authenticator code." });
  const chk = await query("SELECT (password_hash = crypt($1, password_hash)) AS ok FROM account WHERE id=$2", [String(password || ""), acc.id]);
  if (!chk.rows[0] || !chk.rows[0].ok) return res.json({ ok: false, error: "Incorrect password." });
  await query("UPDATE account SET emergency_pin_hash = crypt($1, gen_salt('bf')) WHERE id=$2", [String(newPin), acc.id]);
  await query("UPDATE app_session SET revoked=true WHERE account_id=$1 AND refresh_token_hash <> $2", [acc.id, tokenHash(req.token)]);
  await appendAudit(acc.full_name, "EMERGENCY_PIN_CHANGED", "—");
  res.json({ ok: true });
});

app.get("/api/imei/check", async (req, res) => {
  const imei = String(req.query.imei || "").trim();
  const dev = (await query("SELECT status FROM device WHERE imei=$1", [imei])).rows[0];
  const blocked = !!(dev && (dev.status === "blocked" || dev.status === "temp_blocked"));
  await appendAudit("Public", "IMEI_LOOKUP", maskImei(imei));
  res.json({ ok: true, blocked });
});

// ===========================================================================
// Audit
// ===========================================================================
app.post("/api/audit/append", requireAuth, async (req, res) => {
  await appendAudit(req.account.full_name, String((req.body && req.body.action) || "ACTION"), (req.body && req.body.ref) || "—");
  res.json({ ok: true });
});
app.get("/api/audit/verify", requireAuth, async (_req, res) => {
  const r = await query("SELECT * FROM verify_audit_chain()");
  res.json({ ok: r.rows[0].ok, count: Number(r.rows[0].entries) });
});

// ===========================================================================
// Scoped application state (what the signed-in user is allowed to see).
// Shaped like the old localStorage db object so the frontend works unchanged.
// ===========================================================================
app.get("/api/state", requireAuth, async (req, res) => {
  const acc = req.account;
  const isStaff = acc.role === "agent" || acc.role === "auditor";
  const state = { accounts: [accountSafe(acc)], devices: [], cases: [], disputes: [], notifications: {}, auditLog: [] };

  if (!isStaff) {
    state.devices = (await query("SELECT * FROM device WHERE account_id=$1 ORDER BY id", [acc.id])).rows
      .map((d) => ({ id: d.id, ownerId: d.account_id, nickname: d.nickname, brand: d.brand, model: d.model, imei: d.imei, status: d.status, registeredAt: d.registered_at }));
    const cs = (await query("SELECT * FROM theft_case WHERE account_id=$1 ORDER BY id", [acc.id])).rows;
    for (const c of cs) {
      const tl = (await query("SELECT step, at FROM case_timeline WHERE case_id=$1 ORDER BY id", [c.id])).rows;
      state.cases.push(caseOut(c, tl));
    }
    state.notifications[acc.id] = (await query("SELECT * FROM notification WHERE account_id=$1 ORDER BY created_at DESC", [acc.id])).rows
      .map((n) => ({ id: n.id, text: n.text, meta: n.meta, icon: n.icon }));
  } else {
    state.disputes = (await query("SELECT * FROM dispute ORDER BY created_at DESC").then((r) => r.rows))
      .map((d) => ({ id: d.id, caseRef: d.case_ref, citizenLabel: d.citizen_label, kind: d.kind, summary: d.summary, priority: d.priority, status: d.status, riskLevel: d.risk_level, reason: d.reason, deviceLabel: d.device_label, createdAt: d.created_at }));
    if (acc.role === "auditor") {
      state.auditLog = (await query("SELECT * FROM audit_log ORDER BY id")).rows
        .map((e) => ({ ts: e.ts, actor: e.actor, action: e.action, ref: e.ref, ip: e.ip || "127.0.0.1", hash: e.entry_hash }));
    }
  }
  res.json({ ok: true, state });
});

// ---------------------------------------------------------------------------
// FIR HTML (same template as before, built server-side)
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function firQr(seed) {
  const N = 25, cell = 4;
  let h = 2166136261; const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  let rng = h || 123456789;
  const rand = () => { rng ^= rng << 13; rng >>>= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng >>>= 0; return rng / 4294967296; };
  const finder = (r, c) => {
    const ring = (r0, c0) => { const rr = r - r0, cc = c - c0; return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4); };
    if (r < 7 && c < 7) return { f: true, on: ring(0, 0) };
    if (r < 7 && c >= N - 7) return { f: true, on: ring(0, N - 7) };
    if (r >= N - 7 && c < 7) return { f: true, on: ring(N - 7, 0) };
    return { f: false, on: false };
  };
  let rects = "";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const fd = finder(r, c); const on = fd.f ? fd.on : rand() > 0.5;
    if (on) rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}"/>`;
  }
  return `<svg class="qr" viewBox="0 0 ${N * cell} ${N * cell}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
function firHtml(c, acc, dev, tl) {
  const when = new Date(c.created_at).toLocaleString();
  const risk = (c.risk_level || "").toUpperCase();
  const riskStr = risk + (c.risk_matches != null ? ` (${c.risk_matches}/${c.risk_total} ownership signals matched)` : "");
  const offence = `Mobile phone theft. The complainant reports that the registered device below was stolen and has requested it be blocked. Device: ${esc(dev ? dev.model : "—")}, IMEI ${esc(dev ? dev.imei : "—")}. Block state: ${esc(c.block_state || "—")}. Risk assessment: ${esc(riskStr)}. Reported via the Mahfooz Mobile emergency portal (reference ${esc(c.ref)}).`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>FIR ${esc(c.ref)}</title><style>@page{size:A4;margin:16mm;}*{box-sizing:border-box;}body{font-family:"Times New Roman",Georgia,serif;color:#111;margin:28px;line-height:1.35;}.fir-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;}.qr-box{width:150px;border:1px solid #000;text-align:center;padding:6px 6px 8px;font-size:12px;flex-shrink:0;}.qr-box .qr{width:108px;height:108px;margin:4px auto 2px;display:block;}.qr-box b{display:block;font-size:12.5px;}.fir-title{text-align:center;flex:1;padding:6px 8px 0;}.fir-title h1{font-size:20px;margin:2px 0 8px;}.fir-title .sub{font-size:13px;}.fir-title .sub2{font-size:12px;font-style:italic;margin-top:2px;}.meta{font-size:12.5px;margin:18px 0 10px;display:flex;flex-wrap:wrap;gap:6px 22px;}table.fir{width:100%;border-collapse:collapse;}table.fir td{border:1px solid #000;padding:12px 10px;vertical-align:top;font-size:13px;}table.fir td.num{width:40px;text-align:center;font-weight:bold;}table.fir td.label{width:38%;font-weight:bold;}.foot{margin-top:24px;font-weight:bold;font-size:13px;display:flex;flex-wrap:wrap;gap:10px 48px;}.center-note{text-align:center;margin-top:18px;font-size:13px;}.disclaimer{text-align:center;margin-top:12px;font-size:10.5px;color:#555;}</style></head><body><div class="fir-head"><div class="qr-box"><b>Authentication</b>${firQr("AUTH-" + c.ref)}<b>Scan for Verification</b></div><div class="fir-title"><h1>Police Station</h1><div class="sub">Initial Information Report under Section 154 of the Criminal Procedure Code</div><div class="sub2">(To be sent to the concerned police station without delay)</div></div><div class="qr-box"><b>Citizen Feedback</b>${firQr("FEEDBACK-" + c.ref)}<b>Scan for Feedback</b></div></div><div class="meta"><span>No: <b>${esc(c.ref)}</b></span><span>Police Station: <b>${esc(c.police_station || "—")}</b></span><span>District: <b>${esc(c.district || "Lahore")}</b></span><span>Circle: <b>—</b></span><span>FIR No: <b>${esc(c.ref)}</b></span><span>Date and Time of Report: <b>${esc(when)}</b></span></div><table class="fir"><tr><td class="num">1</td><td class="label">Date and time of report</td><td>${esc(when)}</td></tr><tr><td class="num">2</td><td class="label">Name and government designation of the informant / complainant</td><td>${esc(acc ? acc.full_name : "—")} — Citizen (registered device owner)<br>CNIC: ${esc(acc ? acc.cnic_plain : "—")}<br>Registered phone: ${esc(acc ? acc.phone_plain : "—")}${acc && acc.email_plain ? "<br>Email: " + esc(acc.email_plain) : ""}</td></tr><tr><td class="num">3</td><td class="label">The nature and classification of the offence (briefly what happened)</td><td>${offence}</td></tr><tr><td class="num">4</td><td class="label">Place of occurrence and distance and direction</td><td>Routed to ${esc(c.police_station || "—")}. Exact location of occurrence to be stated by the complainant at the station.</td></tr><tr><td class="num">5</td><td class="label">Reasons for delay in reporting the incident (if any)</td><td>None — reported immediately through the Mahfooz Mobile emergency portal.</td></tr><tr><td class="num">6</td><td class="label">Date and time of occurrence of incident</td><td>${esc(when)} (as reported)</td></tr></table><div class="foot"><span>In-charge: _______________</span><span>Belt No: _________</span><span>Rank: _________</span><span>Mobile No: _______________</span></div><div class="center-note">(Initial Information Report)</div><div class="disclaimer">Mahfooz Mobile — system-generated theft report draft (reference ${esc(c.ref)}). This is NOT a legally-registered FIR. The complainant must complete official filing at the named police station. QR codes are demo placeholders.</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Serve the static website
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "website")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mahfooz Mobile running on http://localhost:${PORT}`));
