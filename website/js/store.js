// ============================================================================
// MahfoozStore — API client
// Talks to the Express backend (which talks to PostgreSQL). Exposes the same
// interface the pages used when this was localStorage-backed, so the UI works
// unchanged. The session is a bearer token kept in localStorage.
// ============================================================================
var MahfoozStore = (function () {
  "use strict";

  var SESSION_KEY = "mahfoozmobile_token";

  // ---- session token (localStorage) ----
  function getSessionId() { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } }
  function setSessionId(t) { try { if (t) localStorage.setItem(SESSION_KEY, t); } catch (e) {} invalidate(); }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} invalidate(); }

  // ---- fetch helper ----
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    var token = getSessionId();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(path, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "Network error — is the server running?" }; });
  }

  // ---- per-page caches (avoid refetching state/me repeatedly) ----
  var _state = null, _me = null;
  function invalidate() { _state = null; _me = null; }

  function ensureDb() {
    if (_state) return _state;
    _state = api("/api/state").then(function (r) {
      return r.ok ? r.state : { accounts: [], devices: [], cases: [], disputes: [], notifications: {}, auditLog: [] };
    });
    return _state;
  }
  function getCurrentAccount() {
    if (_me) return _me;
    _me = api("/api/me").then(function (r) { return r.ok ? r.account : null; });
    return _me;
  }

  // ---- auth / identity ----
  function login(identifier, password) {
    return api("/api/login", { body: { identifier: identifier, password: password } }).then(function (r) {
      if (r.ok && r.token) setSessionId(r.token);
      return r;
    });
  }
  function logout() { return api("/api/logout", { method: "POST" }).then(function () { clearSession(); return { ok: true }; }); }
  function getDemoAccounts() { return api("/api/demo/accounts"); }
  function demoLogin(accountId) {
    return api("/api/demo/login", { body: { accountId: accountId } }).then(function (r) {
      if (r.ok && r.token) setSessionId(r.token);
      return r;
    });
  }
  function demoLoginDefault(type) {
    return getDemoAccounts().then(function (r) {
      if (!r.ok) return null;
      var list = type === "staff" ? r.staff : r.citizens;
      if (!list || !list.length) return null;
      return demoLogin(list[0].id);
    });
  }

  // ---- registration ----
  function registerAccountAndDevice(data) {
    return api("/api/register", { body: data }).then(function (r) {
      if (r.ok && r.token) setSessionId(r.token);
      return r;
    });
  }
  function registerDeviceForCurrentUser(data) { return api("/api/devices", { body: data }); }

  // ---- emergency / reporting ----
  function getDevicesForReport(identifier) { return api("/api/emergency/devices", { body: { identifier: identifier } }); }
  function issueOtp(identifier, purpose) { return api("/api/otp/issue", { body: { identifier: identifier, purpose: purpose } }); }
  function reportTheft(identifier, pin, deviceId, phone, password) {
    return api("/api/emergency/report", { body: { identifier: identifier, pin: pin, deviceId: deviceId, phone: phone, password: password } });
  }
  function completeFullVerification(caseRef, password, totp) {
    return api("/api/case/verify", { body: { caseRef: caseRef, password: password, totp: totp } });
  }
  function getCase(ref) { return api("/api/case/" + encodeURIComponent(ref)); }
  function generateFirDocument(ref) { return api("/api/fir/" + encodeURIComponent(ref)); }

  // ---- devices / disputes / recovery ----
  function unblockDevice(deviceId, password, totp) {
    return api("/api/devices/unblock", { body: { deviceId: deviceId, password: password, totp: totp } });
  }
  function submitDispute(deviceId, reason) { return api("/api/disputes", { body: { deviceId: deviceId, reason: reason } }); }
  function updateDispute(id, status) { return api("/api/disputes/update", { body: { id: id, status: status } }); }
  function getRecoveryQuestions(identifier) { return api("/api/recovery/questions", { body: { identifier: identifier } }); }
  function recoverPin(identifier, answers) { return api("/api/recovery/answers", { body: { identifier: identifier, answers: answers } }); }
  function recoverPinViaOtp(identifier, otp, newPin) { return api("/api/recovery/otp", { body: { identifier: identifier, otp: otp, newPin: newPin } }); }
  function setNewEmergencyPin(accountId, newPin, password, totp) {
    return api("/api/pin/set", { body: { accountId: accountId, newPin: newPin, password: password, totp: totp } });
  }
  function resetEmergencyPinByRecovery(recoveryToken, newPin) {
    return api("/api/pin/reset", { body: { recoveryToken: recoveryToken, newPin: newPin } });
  }
  function checkImei(imei) { return api("/api/imei/check?imei=" + encodeURIComponent(imei)); }

  // ---- audit ----
  function appendAuditLog(actor, action, ref) { return api("/api/audit/append", { body: { action: action, ref: ref } }); }
  function verifyAuditChain() { return api("/api/audit/verify"); }

  // ---- pure client-side helpers (no backend needed) ----
  function validateCNIC(c) { return /^\d{5}-\d{7}-\d$/.test(String(c || "")); }
  function luhn(num) {
    var s = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) { var d = parseInt(num.charAt(i), 10); if (isNaN(d)) return false; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; }
    return s % 10 === 0;
  }
  function validateIMEI(imei) { var d = String(imei || "").replace(/\s/g, ""); return /^\d{15}$/.test(d) && luhn(d); }
  function maskCNIC(c) { if (!c) return ""; var p = String(c).split("-"); if (p.length !== 3) return c; return p[0] + "-" + "•".repeat(p[1].length) + "-" + p[2]; }
  function maskIMEI(imei) { if (!imei) return ""; return "•••• •••• " + String(imei).slice(-4); }
  function maskEmail(e) { if (!e) return ""; var p = String(e).split("@"); if (p.length !== 2) return e; return p[0].slice(0, 2) + "•••••@" + p[1]; }
  function maskPhone(p) { if (!p) return ""; var d = String(p).replace(/\D/g, ""); return d.length < 4 ? p : "•••• ••• " + d.slice(-4); }
  function isWeakPin(pin) { var p = String(pin); if (/^(\d)\1+$/.test(p)) return true; if ("0123456789".indexOf(p) !== -1 || "9876543210".indexOf(p) !== -1) return true; return false; }

  return {
    getSessionId: getSessionId, setSessionId: setSessionId, logout: logout,
    ensureDb: ensureDb, getCurrentAccount: getCurrentAccount,
    getDemoAccounts: getDemoAccounts, demoLogin: demoLogin, demoLoginDefault: demoLoginDefault,
    login: login,
    registerAccountAndDevice: registerAccountAndDevice,
    registerDeviceForCurrentUser: registerDeviceForCurrentUser,
    getDevicesForReport: getDevicesForReport, issueOtp: issueOtp, reportTheft: reportTheft,
    completeFullVerification: completeFullVerification, getCase: getCase, generateFirDocument: generateFirDocument,
    unblockDevice: unblockDevice, submitDispute: submitDispute, updateDispute: updateDispute,
    getRecoveryQuestions: getRecoveryQuestions, recoverPin: recoverPin, recoverPinViaOtp: recoverPinViaOtp,
    setNewEmergencyPin: setNewEmergencyPin, resetEmergencyPinByRecovery: resetEmergencyPinByRecovery, checkImei: checkImei,
    appendAuditLog: appendAuditLog, verifyAuditChain: verifyAuditChain,
    validateCNIC: validateCNIC, validateIMEI: validateIMEI,
    maskCNIC: maskCNIC, maskIMEI: maskIMEI, maskEmail: maskEmail, maskPhone: maskPhone, isWeakPin: isWeakPin,
  };
})();
