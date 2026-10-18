/* ==========================================================================
   Mahfooz Mobile — page wiring
   Detects which page is loaded (by checking for that page's known element
   IDs) and wires it to js/store.js. Runs before js/main.js (script order:
   store.js -> app.js -> main.js) so any DOM content it renders is in place
   before main.js's generic scroll-reveal/count-up logic runs.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.MahfoozStore;

  document.addEventListener("DOMContentLoaded", function () {
    if (!S) return; // store.js failed to load — page still works statically

    // IMPORTANT: the session must be confirmed valid for this page's role
    // (citizen vs staff) BEFORE any page-specific init reads the current
    // account — otherwise a leftover session from a different page type
    // can be read mid-correction (race condition). Everything below runs
    // only after that's settled.
    ensureCorrectSessionForPageType().then(function () {
      renderIdentitySwitcher();
      runPageInit();
    });
  });

  function runPageInit() {
    if (document.getElementById("reg-form")) initRegisterPage();
    if (document.getElementById("login-form")) initLoginPage();
    if (document.getElementById("dash-device-list")) initDashboardPage();
    if (document.getElementById("devices-table-body")) initMyDevicesPage();
    if (document.getElementById("emergency-form")) initEmergencyPage();
    if (document.getElementById("cs-ref")) initCaseStatusPage();
    if (document.getElementById("history-table-body")) initCaseHistoryPage();
    if (document.getElementById("dd-name")) initDeviceDetailsPage();
    if (document.getElementById("regdev-form")) initRegisterDevicePage();
    if (document.getElementById("unblock-form")) initUnblockPage();
    if (document.getElementById("as-cnic")) initAccountSettingsPage();
    if (document.getElementById("pin-settings-form")) initPinSettingsPage();
    if (document.getElementById("recover-answers-form")) initForgotPinPage();
    if (document.getElementById("dispute-form")) initDisputePage();
    if (document.getElementById("notif-list")) initNotificationsPage();
    if (document.getElementById("staff-queue-body")) initStaffDashboardPage();
    if (document.getElementById("scr-title")) initStaffCaseReviewPage();
    if (document.getElementById("aud-log-body")) initAuditorPage();
    if (document.getElementById("checkimei-form")) initCheckImeiPage();
    if (document.getElementById("landing-navcta")) initLandingNav();
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function qs(name) { return new URLSearchParams(window.location.search).get(name); }
  function esc(s) {
    // Escape for BOTH text and quoted-attribute contexts. The DOM
    // textContent trick only encodes < > & (safe for text nodes); we add
    // " and ' so the same helper is safe if a value is ever placed inside
    // a quoted HTML attribute. Defense-in-depth against stored XSS.
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return iso; }
  }
  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  }
  function hideError(el) { if (el) el.style.display = "none"; }
  function toast(msg) { if (window.MahfoozToast) window.MahfoozToast.show(msg); }
  function goTo(url) {
    // Respect main.js's page-transition fade if present, else just navigate.
    document.body.classList.add("page-leaving");
    setTimeout(function () { window.location.href = url; }, 180);
  }
  function formEntries(form) {
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === "string" ? v.trim() : v; });
    return data;
  }
  function badgeFor(status) {
    if (status === "active") return '<span class="badge badge-active">Active</span>';
    if (status === "blocked") return '<span class="badge badge-blocked">Blocked</span>';
    if (status === "temp_blocked") return '<span class="badge badge-pending">Temporarily Blocked</span>';
    if (status === "retired") return '<span class="badge" style="background:var(--field-bg); color:var(--ink-soft);">Retired</span>';
    return '<span class="badge badge-pending">' + esc(status) + "</span>";
  }

  // ------------------------------------------------------------------
  // Identity switcher (demo convenience — simulates multiple logged-in
  // users in one browser so dispute/staff-review flows can
  // actually be demonstrated without a real multi-user server).
  // ------------------------------------------------------------------
  function isStaffPageType() {
    return !!document.querySelector('.sidebar a[href="staff-dashboard.html"], .sidebar a[href="auditor-dashboard.html"]');
  }

  // Ensures the active session belongs to this page's role (citizen vs staff).
  // If there's no session, or it's the wrong role, demo-log-in as the default
  // account of the right type (keeps the demo "just works" behaviour).
  function ensureCorrectSessionForPageType() {
    var chip = document.querySelector(".topbar .user-chip");
    if (!chip) return Promise.resolve();
    var staff = isStaffPageType();
    return S.getCurrentAccount().then(function (acc) {
      var isStaffAccount = acc && (acc.role === "agent" || acc.role === "auditor");
      if (!acc || staff !== isStaffAccount) {
        return S.demoLoginDefault(staff ? "staff" : "citizen");
      }
    });
  }

  // ------------------------------------------------------------------
  // Identity switcher (demo convenience — switch between seeded accounts).
  // Must run after ensureCorrectSessionForPageType() has resolved.
  // ------------------------------------------------------------------
  function renderIdentitySwitcher() {
    var chip = document.querySelector(".topbar .user-chip");
    if (!chip) return;
    var staff = isStaffPageType();
    return Promise.all([S.getCurrentAccount(), S.getDemoAccounts()]).then(function (res) {
      var acc = res[0], demo = res[1];
      if (!acc) return;
      var options = (demo && demo.ok) ? (staff ? demo.staff : demo.citizens) : [];
      if (!options.some(function (o) { return o.id === acc.id; })) {
        options = [{ id: acc.id, name: acc.name + " (current)" }].concat(options);
      }
      chip.innerHTML =
        '<div class="avatar">' + esc(acc.initials) + "</div>" +
        '<span>' + esc(acc.name) + "</span>" +
        '<select id="identity-switcher" aria-label="Demo: switch identity" style="margin-left:8px; font-size:11px; padding:4px 6px; border-radius:6px; border:1px solid var(--border); background:var(--surface); color:var(--ink);"></select>' +
        '<button type="button" id="logout-btn" class="btn btn-ghost btn-sm" style="margin-left:8px;">Log Out</button>';
      var sel = document.getElementById("identity-switcher");
      options.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.id; opt.textContent = "Demo: " + o.name;
        if (o.id === acc.id) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function () {
        S.demoLogin(parseInt(sel.value, 10) || sel.value).then(function () { window.location.reload(); });
      });
      document.getElementById("logout-btn").addEventListener("click", function () {
        S.logout().then(function () { goTo("index.html"); });
      });
    });
  }

  // ------------------------------------------------------------------
  // Register page (multi-step form)
  // ------------------------------------------------------------------
  function initRegisterPage() {
    var form = document.getElementById("reg-form");
    var steps = Array.prototype.slice.call(form.querySelectorAll(".reg-step"));
    var current = 1;
    var backBtn = document.getElementById("reg-back");
    var nextBtn = document.getElementById("reg-next");
    var submitBtn = document.getElementById("reg-submit");
    var errorEl = document.getElementById("reg-error");
    var breadcrumb = document.getElementById("reg-breadcrumb");
    var stepline = document.getElementById("reg-stepline");
    var labels = ["Account", "Device Info", "Security Setup", "Recovery Setup"];

    function render() {
      steps.forEach(function (s) { s.hidden = parseInt(s.dataset.step, 10) !== current; });
      backBtn.hidden = current === 1;
      nextBtn.hidden = current === 4;
      submitBtn.hidden = current !== 4;
      breadcrumb.textContent = "Step " + current + " of 4 — " + labels[current - 1];
      stepline.innerHTML = labels.map(function (l, i) {
        return (i + 1 === current) ? "<strong style=\"color:var(--ink);\">Step " + (i + 1) + ": " + l + "</strong>" : "Step " + (i + 1) + ": " + l;
      }).join(" · ");
      hideError(errorEl);
    }

    function currentStepValid() {
      var step = steps[current - 1];
      var inputs = step.querySelectorAll("input[required], select[required]");
      for (var i = 0; i < inputs.length; i++) {
        if (!inputs[i].value.trim()) { showError(errorEl, "Please fill in all fields on this step."); inputs[i].focus(); return false; }
      }
      if (current === 1 && !S.validateCNIC(form.cnic.value)) { showError(errorEl, "CNIC must look like 42101-1234567-3."); return false; }
      if (current === 2 && !S.validateIMEI(form.imei.value)) { showError(errorEl, "IMEI must be 15 digits and pass the Luhn checksum. Try 490154203237518 for a demo value."); return false; }
      if (current === 3 && form.password.value.length < 8) { showError(errorEl, "Password must be at least 8 characters."); return false; }
      if (current === 3 && S.isWeakPin(form.emergencyPin.value)) { showError(errorEl, "That Emergency PIN is too easy to guess (repeated/sequential digits)."); return false; }
      if (current === 3 && !/^\d{6}$/.test(form.emergencyPin.value)) { showError(errorEl, "Emergency PIN must be exactly 6 digits."); return false; }
      return true;
    }

    nextBtn.addEventListener("click", function () {
      if (!currentStepValid()) return;
      current = Math.min(4, current + 1);
      render();
    });
    backBtn.addEventListener("click", function () {
      current = Math.max(1, current - 1);
      render();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!currentStepValid()) return;
      var data = formEntries(form);
      submitBtn.disabled = true;
      S.registerAccountAndDevice({
        name: data.name, cnic: data.cnic, phone: data.phone, email: data.email,
        password: data.password, emergencyPin: data.emergencyPin,
        answers: [data.a1, data.a2, data.a3, data.a4, data.a5],
        customQuestions: [data.q4, data.q5],
        imei: data.imei, nickname: data.nickname, brand: data.brand, model: data.model,
      }).then(function (res) {
        submitBtn.disabled = false;
        if (!res.ok) { showError(errorEl, res.error); current = res.error.indexOf("CNIC") !== -1 ? 1 : current; render(); return; }
        // registerAccountAndDevice already stored the session token.
        toast("Account and device registered");
        goTo("dashboard.html");
      });
    });

    render();
  }

  // ------------------------------------------------------------------
  // Login page
  // ------------------------------------------------------------------
  function initLoginPage() {
    var form = document.getElementById("login-form");
    var errorEl = document.getElementById("login-error");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(form);
      S.login(data.identifier, data.password).then(function (res) {
        if (!res.ok) { showError(errorEl, res.error); return; }
        toast("Welcome back, " + res.account.name);
        goTo("dashboard.html");
      });
    });
  }

  // ------------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------------
  function initDashboardPage() {
    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var myDevices = db.devices.filter(function (d) { return d.ownerId === acc.id; });
        var myCases = db.cases.filter(function (c) { return c.ownerId === acc.id; });

        document.getElementById("dash-stat-devices").textContent = myDevices.length;
        document.getElementById("dash-stat-reports").textContent = myCases.length;

        var listEl = document.getElementById("dash-device-list");
        if (!myDevices.length) {
          listEl.innerHTML = '<div class="card" style="color:var(--ink-soft); font-size:13px;">No devices registered yet. <a href="register-device.html" style="color:var(--accent-text); font-weight:600;">Register one →</a></div>';
        } else {
          listEl.innerHTML = myDevices.map(function (d) {
            var actions = d.status === "active"
              ? '<a class="btn btn-ghost btn-sm" href="device-details.html?id=' + d.id + '">Details</a>'
              : '<a class="btn btn-ghost btn-sm" href="case-history.html">View Report</a>';
            return '<div class="card" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">' +
              '<div style="display:flex; align-items:center; gap:14px;">' +
              '<div style="width:42px; height:42px; border-radius:7px; background:var(--accent-soft); color:var(--accent-text); display:flex; align-items:center; justify-content:center;"><svg class="ic"><use href="#ic-phone"/></svg></div>' +
              '<div><div style="font-weight:700;">' + esc(d.model) + " — IMEI " + esc(S.maskIMEI(d.imei)) + "</div><div style=\"font-size:11px; color:var(--ink-soft);\">Registered " + esc(fmtDate(d.registeredAt)) + "</div></div></div>" +
              '<div style="display:flex; gap:10px; align-items:center;">' + badgeFor(d.status) + actions + "</div></div>";
          }).join("");
        }

        var notifs = (db.notifications[acc.id] || []).slice(0, 4);
        var actEl = document.getElementById("dash-activity");
        actEl.innerHTML = notifs.length
          ? notifs.map(function (n) {
              return '<div class="card" style="display:flex; align-items:center; gap:14px; margin-bottom:8px;">' +
                '<div style="width:42px; height:42px; border-radius:7px; background:var(--accent-soft); color:var(--accent-text); display:flex; align-items:center; justify-content:center;"><svg class="ic"><use href="#ic-' + esc(n.icon) + '"/></svg></div>' +
                '<div><div style="font-weight:700;">' + esc(n.text) + "</div><div style=\"font-size:11px; color:var(--ink-soft);\">" + esc(n.meta) + "</div></div></div>";
            }).join("")
          : '<div class="card" style="color:var(--ink-soft); font-size:13px;">No recent activity yet.</div>';
      });
    });
  }

  // ------------------------------------------------------------------
  // My Devices
  // ------------------------------------------------------------------
  function initMyDevicesPage() {
    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var myDevices = db.devices.filter(function (d) { return d.ownerId === acc.id; });
        var body = document.getElementById("devices-table-body");
        if (!myDevices.length) {
          body.innerHTML = '<tr><td colspan="5" style="color:var(--ink-soft);">No devices yet. <a href="register-device.html">Register one</a>.</td></tr>';
          return;
        }
        body.innerHTML = myDevices.map(function (d) {
          var actions;
          if (d.status === "active") {
            actions = '<a href="device-details.html?id=' + d.id + '">Details</a> · <a href="emergency.html">Report Stolen</a>';
          } else if (d.status === "blocked" || d.status === "temp_blocked") {
            actions = '<a href="case-history.html">View Report</a> · <a href="unblock-request.html?id=' + d.id + '">Unblock</a>';
          } else {
            actions = '<a href="device-details.html?id=' + d.id + '">Details</a>';
          }
          return "<tr><td>" + esc(d.model) + "</td><td>" + esc(S.maskIMEI(d.imei)) + "</td><td>" + badgeFor(d.status) + "</td><td>" + esc(fmtDate(d.registeredAt)) + "</td><td>" + actions + "</td></tr>";
        }).join("");
      });
    });
  }

  // ------------------------------------------------------------------
  // Emergency report
  // ------------------------------------------------------------------
  function initEmergencyPage() {
    var identifyForm = document.getElementById("emergency-identify-form");
    var form = document.getElementById("emergency-form");
    var idErrorEl = document.getElementById("emergency-id-error");
    var errorEl = document.getElementById("emergency-error");
    var acctLine = document.getElementById("emergency-acct-line");
    var deviceList = document.getElementById("emergency-device-list");
    var currentIdentifier = null;

    // Step 1: look up the account and show its linked devices (IMEI history).
    identifyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var identifier = identifyForm.identifier.value.trim();
      hideError(idErrorEl);
      S.getDevicesForReport(identifier).then(function (res) {
        if (!res.ok) { showError(idErrorEl, res.error); return; }
        currentIdentifier = identifier;
        acctLine.innerHTML = "Account: <strong>" + esc(res.account.name) + "</strong> · " +
          (res.simMatch ? "reporting from your registered number ✓" : "reporting via CNIC (registered SIM not matched)");
        var selectable = res.devices.filter(function (d) { return d.status === "active" || d.status === "retired"; });
        if (!selectable.length) {
          deviceList.innerHTML = '<div class="notice">No linked devices available to block on this account.</div>';
        } else {
          deviceList.innerHTML = selectable.map(function (d, i) {
            return '<label style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1.3px solid var(--border); border-radius:8px; margin-bottom:8px; cursor:pointer;">' +
              '<input type="radio" name="deviceId" value="' + d.id + '"' + (i === 0 ? " checked" : "") + '>' +
              '<span style="flex:1;"><span style="font-weight:700;">' + esc(d.nickname) + "</span> — " + esc(d.model) +
              '<span style="display:block; font-size:11px; color:var(--ink-soft);">IMEI ' + esc(d.maskedImei) + " · " + esc(d.status === "retired" ? "previously linked" : "active") + "</span></span>" +
              badgeFor(d.status) + "</label>";
          }).join("");
        }
        identifyForm.hidden = true;
        form.hidden = false;
      });
    });

    // Step 2: run the risk-based report.
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideError(errorEl);
      var selected = form.querySelector('input[name="deviceId"]:checked');
      if (!selected) { showError(errorEl, "Select which device was stolen."); return; }
      var pinDigits = Array.prototype.map.call(form.querySelectorAll(".pin-digit"), function (i) { return i.value; }).join("");
      var phone = form.phone ? form.phone.value.trim() : "";
      var password = form.password ? form.password.value : "";
      S.reportTheft(currentIdentifier, pinDigits, selected.value, phone, password).then(function (res) {
        if (!res.ok) { showError(errorEl, res.error); return; }
        toast(res.blocked ? "Temporary block placed — " + res.risk.level.toUpperCase() + " risk" : "Report held for manual review — " + res.risk.level.toUpperCase() + " risk");
        goTo("case-status.html?ref=" + encodeURIComponent(res.caseObj.ref));
      });
    });
  }

  // ------------------------------------------------------------------
  // Case status
  // ------------------------------------------------------------------
  function initCaseStatusPage() {
    var ref = qs("ref");
    var currentRef = ref || "";
    var firBtn = document.getElementById("cs-fir-btn");

    if (firBtn) {
      firBtn.addEventListener("click", function () {
        if (!currentRef) return;
        S.generateFirDocument(currentRef).then(function (res) {
          if (!res.ok) { toast(res.error); return; }
          var blob = new Blob([res.html], { type: "text/html" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = res.filename;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          toast("FIR draft downloaded");
        });
      });
    }

    if (ref) {
      S.getCase(ref).then(function (r) { render(r.ok ? r.caseObj : null, r.ok ? r.device : null); });
    } else {
      // No ref: fall back to the current user's most recent case.
      S.ensureDb().then(function (db) {
        var mine = db.cases || [];
        var caseObj = mine[mine.length - 1];
        if (!caseObj) { render(null, null); return; }
        currentRef = caseObj.ref;
        var device = (db.devices || []).find(function (d) { return String(d.id) === String(caseObj.deviceId); });
        render(caseObj, device);
      });
    }

    function render(caseObj, device) {
      if (!caseObj) {
        document.getElementById("cs-device-line").textContent = "No case found. Report a device stolen from the Emergency page first.";
        return;
      }
      var deviceName = device ? device.model : "Device";
      var blockState = caseObj.blockState || "full";
      var risk = (caseObj.riskLevel || "").toUpperCase();

      var heading = document.getElementById("cs-heading");
      var line = document.getElementById("cs-device-line");
      if (blockState === "none") {
        heading.textContent = "Report received — held for verification";
        line.textContent = deviceName + " was NOT auto-blocked. Because ownership signals were weak (high risk), the case is held for a manual ownership check first.";
      } else {
        heading.textContent = "Your phone has been blocked";
        line.textContent = deviceName + " is blocked and cannot connect to any network." +
          (caseObj.reviewStatus === "manual-review" ? " It also goes to staff for manual verification (medium risk)." : "");
      }

      // Risk / status banner
      var banner = document.getElementById("cs-status-banner");
      if (risk) {
        var colors = risk === "LOW"
          ? "background:var(--accent-soft); color:var(--accent-text);"
          : risk === "MEDIUM"
            ? "background:#fff4e0; color:#8a5a00;"
            : "background:var(--danger-soft); color:var(--danger-text);";
        banner.style.cssText = "border-radius:8px; padding:12px 16px; margin:14px 0; text-align:left; font-size:12.5px; " + colors;
        banner.innerHTML = "<strong>Risk: " + risk + "</strong> — " + caseObj.riskMatches + "/" + caseObj.riskTotal +
          " ownership signals matched. Block state: <strong>" + esc(blockState) + "</strong>.";
        banner.style.display = "block";
      }

      document.getElementById("cs-ref").textContent = caseObj.ref;
      document.getElementById("cs-copy-btn").setAttribute("data-copy", caseObj.ref);
      document.getElementById("cs-blocked-at").textContent = fmtDate(caseObj.createdAt);
      document.getElementById("cs-station").textContent = caseObj.policeStation;

      var tl = document.getElementById("cs-timeline");
      tl.innerHTML = caseObj.timeline.map(function (t) {
        return "<tr><td>" + esc(t.step) + "</td><td>✓ " + new Date(t.at).toLocaleTimeString() + "</td></tr>";
      }).join("");
    }
  }

  // ------------------------------------------------------------------
  // Case history
  // ------------------------------------------------------------------
  function initCaseHistoryPage() {
    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var rows = [];
        db.cases.filter(function (c) { return c.ownerId === acc.id; }).forEach(function (c) {
          var device = db.devices.find(function (d) { return d.id === c.deviceId; });
          rows.push({ ref: c.ref, device: device ? device.model : "—", type: "Theft Report", status: "blocked", date: c.createdAt, href: "case-status.html?ref=" + encodeURIComponent(c.ref) });
        });
        db.devices.filter(function (d) { return d.ownerId === acc.id; }).forEach(function (d) {
          rows.push({ ref: d.id.slice(-8).toUpperCase(), device: d.model, type: "Registration", status: "active", date: d.registeredAt, href: "device-details.html?id=" + d.id });
        });
        rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

        var body = document.getElementById("history-table-body");
        body.innerHTML = rows.length ? rows.map(function (r) {
          return "<tr><td>" + esc(r.ref) + "</td><td>" + esc(r.device) + "</td><td>" + esc(r.type) + "</td><td>" + badgeFor(r.status) + "</td><td>" + esc(fmtDate(r.date)) + '</td><td><a href="' + r.href + '">View</a></td></tr>';
        }).join("") : '<tr><td colspan="6" style="color:var(--ink-soft);">No case history yet.</td></tr>';
      });
    });
  }

  // ------------------------------------------------------------------
  // Device details
  // ------------------------------------------------------------------
  function initDeviceDetailsPage() {
    var id = qs("id");
    S.ensureDb().then(function (db) {
      var device = db.devices.find(function (d) { return String(d.id) === String(id); }) || db.devices[0];
      if (!device) { document.getElementById("dd-name").textContent = "Device not found"; return; }
      document.getElementById("dd-name").textContent = device.nickname + " — " + device.model;
      document.getElementById("dd-breadcrumb-name").textContent = device.nickname;
      document.getElementById("dd-meta").textContent = "IMEI " + S.maskIMEI(device.imei) + " · Registered " + fmtDate(device.registeredAt);
      document.getElementById("dd-badge").outerHTML = badgeFor(device.status).replace("<span", '<span id="dd-badge"');
      var actions = document.getElementById("dd-actions");
      if (device.status === "active") {
        actions.innerHTML = '<a class="btn btn-danger" href="emergency.html">Report Stolen</a>';
      } else if (device.status === "blocked" || device.status === "temp_blocked") {
        actions.innerHTML = '<a class="btn btn-ghost" href="case-history.html">View Theft Report</a><a class="btn btn-accent" href="unblock-request.html?id=' + device.id + '">Request Unblock</a>';
      } else {
        actions.innerHTML = '<span style="font-size:12px; color:var(--ink-soft);">This device is retired (previously linked). It can still be selected when reporting a theft.</span>';
      }
      var history = document.getElementById("dd-history");
      var rows = [{ date: device.registeredAt, event: "Device registered" }];
      var caseObj = db.cases.find(function (c) { return c.deviceId === device.id; });
      if (caseObj) rows.push({ date: caseObj.createdAt, event: "Blocked — Ref# " + caseObj.ref });
      history.innerHTML = rows.map(function (r) { return "<tr><td>" + esc(fmtDate(r.date)) + "</td><td>" + esc(r.event) + "</td></tr>"; }).join("");
    });
  }

  // ------------------------------------------------------------------
  // Register another device
  // ------------------------------------------------------------------
  function initRegisterDevicePage() {
    var form = document.getElementById("regdev-form");
    var errorEl = document.getElementById("regdev-error");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(form);
      S.registerDeviceForCurrentUser(data).then(function (res) {
        if (!res.ok) { showError(errorEl, res.error); return; }
        toast("Device registered");
        goTo("my-devices.html");
      });
    });
  }

  // ------------------------------------------------------------------
  // Unblock request
  // ------------------------------------------------------------------
  function initUnblockPage() {
    var id = qs("id");
    var form = document.getElementById("unblock-form");
    var errorEl = document.getElementById("unblock-error");
    var lineEl = document.getElementById("unblock-device-line");

    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var device = (id && db.devices.find(function (d) { return String(d.id) === String(id); })) ||
          db.devices.find(function (d) { return d.ownerId === acc.id && (d.status === "blocked" || d.status === "temp_blocked"); });
        if (!device) { lineEl.textContent = "No blocked device found to unblock."; form.querySelector("button").disabled = true; return; }
        var stateLabel = device.status === "temp_blocked" ? "Temporarily Blocked" : "Blocked";
        lineEl.textContent = device.model + " — IMEI " + S.maskIMEI(device.imei) + " — currently " + stateLabel;
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var data = formEntries(form);
          S.unblockDevice(device.id, data.password, data.totp).then(function (res) {
            if (!res.ok) { showError(errorEl, res.error); return; }
            toast("Device unblocked");
            goTo("my-devices.html");
          });
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Account settings
  // ------------------------------------------------------------------
  function initAccountSettingsPage() {
    S.getCurrentAccount().then(function (acc) {
      document.getElementById("as-name").value = acc.name;
      document.getElementById("as-cnic").value = S.maskCNIC(acc.cnic);
      document.getElementById("as-phone").value = acc.phone;
    });
    var regenBtn = document.getElementById("as-regen-code");
    if (regenBtn) regenBtn.addEventListener("click", function () {
      S.appendAuditLog("Current user", "PHYSICAL_CODE_REGENERATED", "—").then(function () {
        toast("New physical recovery code generated (demo — not actually printable here)");
      });
    });
    var revokeBtn = document.getElementById("as-revoke-session");
    if (revokeBtn) revokeBtn.addEventListener("click", function () {
      var row = document.getElementById("as-other-session");
      S.appendAuditLog("Current user", "SESSION_REVOKED", "Safari — iPhone").then(function () {
        if (row) row.remove();
        toast("Session signed out on that device");
      });
    });
  }

  // ------------------------------------------------------------------
  // Emergency PIN settings
  // ------------------------------------------------------------------
  function initPinSettingsPage() {
    var form = document.getElementById("pin-settings-form");
    var errorEl = document.getElementById("pin-settings-error");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(form);
      S.getCurrentAccount().then(function (acc) {
        return S.setNewEmergencyPin(acc.id, data.newPin, data.password, data.totp);
      }).then(function (res) {
        if (!res.ok) { showError(errorEl, res.error); return; }
        toast("Emergency PIN updated");
        form.reset();
      });
    });
  }

  // ------------------------------------------------------------------
  // Forgot PIN recovery (3-step: identify → answer own questions → new PIN)
  // ------------------------------------------------------------------
  function initForgotPinPage() {
    var identifyForm = document.getElementById("recover-identify-form");
    var answersForm = document.getElementById("recover-answers-form");
    var newPinForm = document.getElementById("recover-newpin-form");
    var idErrorEl = document.getElementById("recover-id-error");
    var errorEl = document.getElementById("recover-error");
    var error2El = document.getElementById("recover-step2-error");
    var qWrap = document.getElementById("recover-questions");
    var identifiedNote = document.getElementById("recover-identified");
    var currentIdentifier = null;
    var recoveryToken = null;

    // Step 1: look up the account and render the questions it set.
    identifyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(identifyForm);
      S.getRecoveryQuestions(data.identifier).then(function (res) {
        if (!res.ok) { showError(idErrorEl, res.error); return; }
        currentIdentifier = data.identifier;
        qWrap.innerHTML = res.questions.map(function (q, i) {
          return '<div class="field">' +
            '<label>Q' + (i + 1) + ". " + esc(q) + "</label>" +
            '<input name="a' + (i + 1) + '" required maxlength="60" placeholder="Your answer">' +
            "</div>";
        }).join("");
        identifiedNote.textContent = "These are the 5 questions you set at registration. Answer at least 3 correctly.";
        identifyForm.hidden = true;
        answersForm.hidden = false;
      });
    });

    // Step 2: verify the answers.
    answersForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(answersForm);
      S.recoverPin(currentIdentifier, [data.a1, data.a2, data.a3, data.a4, data.a5]).then(function (res) {
        if (!res.ok) { showError(errorEl, res.error); return; }
        recoveryToken = res.recoveryToken;
        answersForm.hidden = true;
        newPinForm.hidden = false;
        toast(res.correct + "/5 answers matched — identity verified");
      });
    });

    // Step 3: set the new PIN using the recovery token (no login required).
    newPinForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = formEntries(newPinForm);
      S.resetEmergencyPinByRecovery(recoveryToken, data.newPin).then(function (res) {
        if (!res.ok) { showError(error2El, res.error); return; }
        toast("New Emergency PIN set");
        goTo("login.html");
      });
    });

    // --- Alternate path: email / registered-number OTP ---
    var otpForm = document.getElementById("recover-otp-form");
    var otpErrorEl = document.getElementById("recover-otp-error");
    var otpNote = document.getElementById("recover-otp-note");
    var useOtpLink = document.getElementById("recover-use-otp");
    var useQuestionsLink = document.getElementById("recover-use-questions");

    if (useOtpLink) useOtpLink.addEventListener("click", function (e) {
      e.preventDefault();
      answersForm.hidden = true;
      otpForm.hidden = false;
    });
    if (useQuestionsLink) useQuestionsLink.addEventListener("click", function (e) {
      e.preventDefault();
      otpForm.hidden = true;
      answersForm.hidden = false;
    });

    document.getElementById("recover-send-otp").addEventListener("click", function () {
      if (!currentIdentifier) { showError(otpErrorEl, "Start again — identify your account first."); return; }
      S.issueOtp(currentIdentifier, "pin_recovery").then(function (res) {
        if (!res.ok) { showError(otpErrorEl, res.error); return; }
        otpNote.style.display = "block";
        otpNote.innerHTML = res.emailed
          ? "A 6-digit code was emailed to <strong>" + esc(res.sentTo) + "</strong>. Check your inbox (and spam) and enter it above."
          : "Demo: a code was “sent” to <strong>" + esc(res.sentTo) + "</strong>. Enter <code>" + esc(res.otp) + "</code> above.";
      });
    });

    otpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      hideError(otpErrorEl);
      var data = formEntries(otpForm);
      S.recoverPinViaOtp(currentIdentifier, data.otp, data.newPin).then(function (res) {
        if (!res.ok) { showError(otpErrorEl, res.error); return; }
        toast("New Emergency PIN set");
        goTo("login.html");
      });
    });
  }

  // ------------------------------------------------------------------
  // Dispute
  // ------------------------------------------------------------------
  function initDisputePage() {
    var form = document.getElementById("dispute-form");
    var select = document.getElementById("dispute-device-select");
    var errorEl = document.getElementById("dispute-error");

    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var blocked = db.devices.filter(function (d) { return d.ownerId === acc.id && (d.status === "blocked" || d.status === "temp_blocked"); });
        if (!blocked.length) {
          select.innerHTML = '<option value="">No blocked devices on your account</option>';
          form.querySelector("button[type=submit]").disabled = true;
          return;
        }
        select.innerHTML = blocked.map(function (d) { return '<option value="' + d.id + '">' + esc(d.model) + "</option>"; }).join("");
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var data = formEntries(form);
          S.submitDispute(data.deviceId, data.reason).then(function (res) {
            if (!res.ok) { showError(errorEl, res.error || "Could not submit dispute."); return; }
            toast("Dispute submitted — reference " + res.dispute.caseRef);
            goTo("case-history.html");
          });
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Notifications
  // ------------------------------------------------------------------
  function initNotificationsPage() {
    S.ensureDb().then(function (db) {
      return S.getCurrentAccount().then(function (acc) {
        var list = document.getElementById("notif-list");
        var notifs = db.notifications[acc.id] || [];
        list.innerHTML = notifs.length ? notifs.map(function (n) {
          return '<div class="card" style="display:flex; gap:14px; margin-bottom:10px;">' +
            '<svg class="ic" style="width:20px;height:20px; color:var(--accent-text); flex-shrink:0; margin-top:2px;"><use href="#ic-' + esc(n.icon) + '"/></svg>' +
            '<div><div style="font-weight:700;">' + esc(n.text) + "</div><div style=\"font-size:11.5px; color:var(--ink-soft);\">" + esc(n.meta) + "</div></div></div>";
        }).join("") : '<div class="card" style="color:var(--ink-soft); font-size:13px;">No notifications yet.</div>';
      });
    });
  }

  // ------------------------------------------------------------------
  // Staff dashboard
  // ------------------------------------------------------------------
  function initStaffDashboardPage() {
    S.ensureDb().then(function (db) {
      var body = document.getElementById("staff-queue-body");
      if (!db.disputes.length) { body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-soft);">Queue is empty.</td></tr>'; return; }
      body.innerHTML = db.disputes.map(function (d) {
        var prioBadge = d.priority === "High" ? '<span class="badge badge-blocked">High</span>' : '<span class="badge badge-pending">Normal</span>';
        return "<tr><td>" + esc(d.caseRef) + "</td><td>" + esc(d.citizenLabel) + "</td><td>" + esc(d.summary) + "</td><td>" + prioBadge + "</td><td>" + esc(d.status) + '</td><td><a href="staff-case-review.html?id=' + esc(d.id) + '">Review</a></td></tr>';
      }).join("");
    });
  }

  // ------------------------------------------------------------------
  // Staff case review
  // ------------------------------------------------------------------
  function initStaffCaseReviewPage() {
    var id = qs("id");
    S.ensureDb().then(function (db) {
      var dispute = db.disputes.find(function (d) { return String(d.id) === String(id); }) || db.disputes[0];
      if (!dispute) { document.getElementById("scr-title").textContent = "No case found"; return; }
      document.getElementById("scr-caseref").textContent = dispute.caseRef;
      document.getElementById("scr-title").textContent = "Case " + dispute.caseRef + " — " + dispute.summary;
      document.getElementById("scr-meta").textContent = "Citizen: " + dispute.citizenLabel + " · Opened " + fmtDate(dispute.createdAt);
      document.getElementById("scr-priority").textContent = dispute.priority + " Priority";
      document.getElementById("scr-statement").value = dispute.reason || "I did not request this block. My phone was with me the whole time.";
      document.getElementById("scr-device").value = dispute.deviceLabel || "—";

      document.getElementById("scr-resolve").addEventListener("click", function () {
        S.updateDispute(dispute.id, "In Review").then(function () {
          document.getElementById("scr-resolved-note").style.display = "block";
          document.getElementById("scr-resolved-note").textContent = "Marked In Review — the citizen must still re-authenticate before any unblock can happen.";
          toast("Case updated");
        });
      });
      document.getElementById("scr-escalate").addEventListener("click", function () {
        S.appendAuditLog("Support Agent", "CASE_ESCALATED_TO_AUDITOR", dispute.caseRef).then(function () { toast("Escalated to Auditor"); });
      });
    });
  }

  // ------------------------------------------------------------------
  // Auditor dashboard
  // ------------------------------------------------------------------
  function initAuditorPage() {
    function render(filterText) {
      S.ensureDb().then(function (db) {
        var entries = db.auditLog.slice().reverse();
        if (filterText) {
          var q = filterText.toLowerCase();
          entries = entries.filter(function (e) {
            return (e.actor + " " + e.action + " " + e.ref).toLowerCase().indexOf(q) !== -1;
          });
        }
        var body = document.getElementById("aud-log-body");
        body.innerHTML = entries.length ? entries.map(function (e) {
          return "<tr><td>" + esc(new Date(e.ts).toLocaleString()) + "</td><td>" + esc(e.actor) + "</td><td>" + esc(e.action) + "</td><td>" + esc(e.ref) + "</td><td>" + esc(e.ip) + "</td><td>" + esc(e.hash.slice(0, 4) + "…" + e.hash.slice(-2)) + "</td></tr>";
        }).join("") : '<tr><td colspan="6" style="color:var(--ink-soft);">No log entries.</td></tr>';
      });
    }

    function verify() {
      document.getElementById("aud-chain-text").textContent = "Verifying…";
      S.verifyAuditChain().then(function (res) {
        var dot = document.getElementById("aud-chain-dot");
        var text = document.getElementById("aud-chain-text");
        if (res.ok) {
          dot.style.background = "var(--accent)";
          text.textContent = "Hash chain verified — " + res.count + " entries, no tampering detected.";
        } else {
          dot.style.background = "var(--danger)";
          text.textContent = "CHAIN BROKEN — tampering detected. Investigate immediately.";
        }
      });
    }

    render();
    verify();
    document.getElementById("aud-verify-btn").addEventListener("click", verify);
    document.getElementById("aud-search").addEventListener("input", function (e) { render(e.target.value); });
    document.getElementById("aud-export").addEventListener("click", function () {
      S.appendAuditLog("Auditor", "AUDIT_LOG_EXPORTED", "—").then(function () { toast("Export logged (demo — no file download)"); });
    });
  }

  // ------------------------------------------------------------------
  // Check IMEI
  // ------------------------------------------------------------------
  function initCheckImeiPage() {
    var form = document.getElementById("checkimei-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var imei = form.imei.value.trim();
      S.checkImei(imei).then(function (res) {
        var box = document.getElementById("checkimei-result");
        box.hidden = false;
        document.getElementById("checkimei-result-imei").textContent = "IMEI " + S.maskIMEI(imei);
        var badge = document.getElementById("checkimei-result-badge");
        if (res.blocked) { badge.className = "badge badge-blocked"; badge.textContent = "Blocked — Reported Stolen"; }
        else { badge.className = "badge badge-active"; badge.textContent = "Clean — Not Reported Stolen"; }
      });
    });
  }

  // ------------------------------------------------------------------
  // Landing page nav — shows "Dashboard"/"Log Out" instead of
  // "Register"/"Log In" if a citizen session is already active.
  // ------------------------------------------------------------------
  function initLandingNav() {
    if (!S.getSessionId()) return; // no session — keep the default Register/Log In
    S.getCurrentAccount().then(function (acc) {
      if (!acc || acc.role !== "citizen") return; // only citizens land here
      var cta = document.getElementById("landing-navcta");
      cta.innerHTML =
        '<a class="btn btn-ghost" href="dashboard.html">Dashboard</a>' +
        '<button type="button" class="btn btn-outline" id="landing-logout-btn">Log Out</button>';
      document.getElementById("landing-logout-btn").addEventListener("click", function () {
        S.logout().then(function () { window.location.reload(); });
      });
    });
  }
})();
