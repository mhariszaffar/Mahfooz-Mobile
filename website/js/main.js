/* ==========================================================================
   Mahfooz Mobile — shared site behavior
   Plain vanilla JS, no dependencies. Progressive enhancement only:
   every page must remain fully usable with this file absent or slow.
   ========================================================================== */
(function () {
  "use strict";

  // Flag JS as available — CSS scopes animation-start states to `.js` so
  // content never disappears for users without JavaScript.
  document.documentElement.classList.add("js");

  // Reveal the page immediately once the DOM is parseable — never wait on
  // anything that could fail or stall (images, fonts, other scripts).
  // Make the page visible: clear any lingering fade-out and mark it ready.
  var reveal = function () {
    if (!document.body) return;
    document.body.classList.remove("page-leaving");
    document.body.classList.add("page-ready");
  };
  if (document.readyState !== "loading") reveal();
  else document.addEventListener("DOMContentLoaded", reveal);
  // Absolute safety net: body must never stay invisible.
  setTimeout(reveal, 800);

  // Back/forward navigation (including bfcache restore) does NOT re-fire
  // DOMContentLoaded, so a page could come back still carrying the
  // `page-leaving` fade-out (opacity 0) from the click that left it —
  // showing a blank white page until a manual refresh.
  //  - `pageshow` fires on every display (initial load AND bfcache restore).
  //  - `pagehide` with persisted=true means this page is being frozen into
  //    bfcache; clear the fade there too so the stored snapshot is visible.
  window.addEventListener("pageshow", reveal);
  window.addEventListener("pagehide", function (e) {
    if (e.persisted) reveal();
  });

  document.addEventListener("DOMContentLoaded", function () {
    initScrollReveal();
    initSmoothAnchorScroll();
    initMobileNavToggle();
    initScrollProgress();
    initStickyNavShrink();
    initCountUp();
    initCardTilt();
    initButtonRipple();
    initToastSystem();
    initCopyToClipboard();
    initPinAutoAdvance();
    initHeroCanvas();
    initPageTransitions();
    initAccessibilityEnhancements();
    initFormValidationUX();
  });

  // ------------------------------------------------------------------
  // Scroll-reveal
  // ------------------------------------------------------------------
  function initScrollReveal() {
    var targets = document.querySelectorAll(
      ".how-card, .feature-card, .faq-item, .trust-item, .problem-stat, .quote-section, .compare-wrap"
    );
    if (!targets.length) return;

    targets.forEach(function (el) { el.classList.add("reveal"); });
    var reveal = function (el) { el.classList.add("in-view"); };

    if (!("IntersectionObserver" in window)) {
      targets.forEach(reveal);
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var delay = Math.min(i * 40, 240);
            setTimeout(function () { reveal(el); }, delay);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach(function (el) { io.observe(el); });

    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.in-view)").forEach(reveal);
    }, 2500);
  }

  // ------------------------------------------------------------------
  // Smooth-scroll for in-page anchors
  // ------------------------------------------------------------------
  function initSmoothAnchorScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        var id = link.getAttribute("href").slice(1);
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // ------------------------------------------------------------------
  // Mobile nav toggle
  // ------------------------------------------------------------------
  function initMobileNavToggle() {
    var nav = document.querySelector(".topnav");
    if (!nav) return;

    var btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle navigation menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    nav.appendChild(btn);

    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ------------------------------------------------------------------
  // Scroll progress bar — thin accent bar along the top of the page.
  // ------------------------------------------------------------------
  function initScrollProgress() {
    var bar = document.createElement("div");
    bar.id = "scroll-progress";
    document.body.appendChild(bar);

    var update = function () {
      var h = document.documentElement;
      var scrollable = h.scrollHeight - h.clientHeight;
      var pct = scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0;
      bar.style.width = pct + "%";
    };
    document.addEventListener("scroll", throttle(update, 50), { passive: true });
    update();
  }

  // ------------------------------------------------------------------
  // Sticky nav shrink — adds `.scrolled` once the page scrolls past a
  // small threshold, for a denser nav with a shadow.
  // ------------------------------------------------------------------
  function initStickyNavShrink() {
    var nav = document.querySelector(".topnav");
    if (!nav) return;
    var update = function () {
      if (window.scrollY > 12) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    document.addEventListener("scroll", throttle(update, 50), { passive: true });
    update();
  }

  // ------------------------------------------------------------------
  // Number count-up — any element with [data-count-to="N"] animates its
  // text from 0 (or its current prefix) up to N once scrolled into view.
  // ------------------------------------------------------------------
  function initCountUp() {
    var els = document.querySelectorAll("[data-count-to]");
    if (!els.length) return;

    var run = function (el) {
      var to = parseFloat(el.getAttribute("data-count-to"));
      var suffix = el.getAttribute("data-count-suffix") || "";
      var prefix = el.getAttribute("data-count-prefix") || "";
      if (isNaN(to)) return;
      var duration = 900;
      var start = null;
      var step = function (ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.round(eased * to);
        el.textContent = prefix + current + suffix;
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = prefix + to + suffix;
      };
      requestAnimationFrame(step);
    };

    if (!("IntersectionObserver" in window)) {
      els.forEach(run);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { run(entry.target); io.unobserve(entry.target); }
        });
      },
      { threshold: 0.4 }
    );
    els.forEach(function (el) { io.observe(el); });
  }

  // ------------------------------------------------------------------
  // Card 3D tilt — subtle perspective tilt following the cursor, reset
  // on mouse leave. Skipped on touch devices (no hover).
  // ------------------------------------------------------------------
  function initCardTilt() {
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
    var cards = document.querySelectorAll(".feature-card, .how-card");
    cards.forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          "perspective(700px) rotateX(" + (y * -6) + "deg) rotateY(" + (x * 6) + "deg) translateY(-3px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  // ------------------------------------------------------------------
  // Button ripple — a small expanding circle from the click point.
  // ------------------------------------------------------------------
  function initButtonRipple() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn");
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var size = Math.max(r.width, r.height);
      var span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = e.clientX - r.left - size / 2 + "px";
      span.style.top = e.clientY - r.top - size / 2 + "px";
      btn.appendChild(span);
      setTimeout(function () { span.remove(); }, 650);
    });
  }

  // ------------------------------------------------------------------
  // Toast notifications — window.MahfoozToast.show("message")
  // ------------------------------------------------------------------
  function initToastSystem() {
    var stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);

    window.MahfoozToast = {
      show: function (message) {
        var el = document.createElement("div");
        el.className = "toast";
        el.innerHTML =
          '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span></span>';
        el.querySelector("span").textContent = message;
        stack.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () {
          el.classList.remove("show");
          setTimeout(function () { el.remove(); }, 300);
        }, 2800);
      },
    };
  }

  // ------------------------------------------------------------------
  // Copy-to-clipboard — any element with [data-copy="text"] copies that
  // text and shows a toast confirmation.
  // ------------------------------------------------------------------
  function initCopyToClipboard() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-copy]");
      if (!btn) return;
      var text = btn.getAttribute("data-copy");
      var done = function () {
        if (window.MahfoozToast) window.MahfoozToast.show("Copied to clipboard");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
      } else {
        done();
      }
    });
  }

  // ------------------------------------------------------------------
  // Emergency PIN auto-advance — generically finds any run of 3+ sibling
  // inputs with maxlength="1" and wires up auto-advance, backspace-back,
  // and paste-splitting. No per-page markup required.
  // ------------------------------------------------------------------
  function initPinAutoAdvance() {
    document.querySelectorAll('input[maxlength="1"]').forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.value.length >= 1) {
          var next = findSibling(input, 1);
          if (next) next.focus();
        }
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !input.value) {
          var prev = findSibling(input, -1);
          if (prev) { prev.focus(); }
        }
      });
      input.addEventListener("paste", function (e) {
        var data = (e.clipboardData || window.clipboardData).getData("text");
        if (!data) return;
        var chars = data.replace(/\s/g, "").split("");
        if (chars.length < 2) return;
        e.preventDefault();
        var cur = input;
        chars.forEach(function (ch) {
          if (!cur) return;
          cur.value = ch;
          cur = findSibling(cur, 1);
        });
        if (cur) cur.focus();
      });
    });

    function findSibling(el, dir) {
      var sib = dir > 0 ? el.nextElementSibling : el.previousElementSibling;
      while (sib && !(sib.tagName === "INPUT" && sib.getAttribute("maxlength") === "1")) {
        sib = dir > 0 ? sib.nextElementSibling : sib.previousElementSibling;
      }
      return sib;
    }
  }

  // ------------------------------------------------------------------
  // Hero network canvas — a slow, subtle drifting node network behind
  // the landing hero. Purely decorative; pauses off-screen and respects
  // reduced-motion preferences.
  // ------------------------------------------------------------------
  function initHeroCanvas() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var canvas = document.createElement("canvas");
    canvas.id = "hero-canvas";
    hero.insertBefore(canvas, hero.firstChild);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w, h, nodes;

    function size() {
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeNodes() {
      var count = Math.max(18, Math.min(36, Math.round((w * h) / 28000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
        });
      }
    }

    size();
    makeNodes();
    window.addEventListener("resize", throttle(function () { size(); makeNodes(); }, 300));

    var linkDist = 130;
    var running = true;
    var io = ("IntersectionObserver" in window)
      ? new IntersectionObserver(function (entries) { running = entries[0].isIntersecting; }, { threshold: 0 })
      : null;
    if (io) io.observe(hero);

    function frame() {
      requestAnimationFrame(frame);
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      nodes.forEach(function (n) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDist) {
            ctx.strokeStyle = "rgba(26,122,76," + (0.14 * (1 - dist / linkDist)) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      nodes.forEach(function (n) {
        ctx.fillStyle = "rgba(11,46,79,0.28)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  // Page transitions — fade out on internal navigation, fade in on load
  // (the fade-in is handled by `.page-ready`, this handles the fade-out).
  // ------------------------------------------------------------------
  function initPageTransitions() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || a.target === "_blank") return;
      if (/^https?:\/\//i.test(href) || href.indexOf("mailto:") === 0) return;

      e.preventDefault();
      document.body.classList.add("page-leaving");
      setTimeout(function () { window.location.href = href; }, 180);
    });
  }

  // ------------------------------------------------------------------
  // Accessibility enhancements — applied generically so every page
  // benefits without per-page markup changes:
  //  - associates every .field's <label> with its input via id/for
  //  - marks .topnav/.sidebar as navigation landmarks, .content as main
  //  - adds a "skip to content" link for keyboard users
  //  - makes error banners (id ending in "-error") announce via aria-live
  // ------------------------------------------------------------------
  function initAccessibilityEnhancements() {
    // Label <-> input association
    document.querySelectorAll(".field").forEach(function (field, idx) {
      var label = field.querySelector("label");
      var input = field.querySelector("input, select, textarea");
      if (!label || !input) return;
      if (!input.id) {
        input.id = "f-" + idx + "-" + (input.name || Math.random().toString(36).slice(2, 7));
      }
      label.setAttribute("for", input.id);
    });

    // Landmark roles (added via JS, not markup, so no tag/CSS risk)
    var nav = document.querySelector(".topnav");
    if (nav) {
      nav.setAttribute("role", "navigation");
      nav.setAttribute("aria-label", "Primary");
    }
    var sidebar = document.querySelector(".sidebar");
    if (sidebar) {
      sidebar.setAttribute("role", "navigation");
      sidebar.setAttribute("aria-label", "Account");
    }
    var main = document.querySelector(".content, .content-narrow");
    if (main) {
      main.setAttribute("role", "main");
      if (!main.id) main.id = "main-content";
    }

    // Skip-to-content link (visually hidden until focused)
    if (main) {
      var skip = document.createElement("a");
      skip.href = "#" + main.id;
      skip.className = "skip-link";
      skip.textContent = "Skip to main content";
      document.body.insertBefore(skip, document.body.firstChild);
    }

    // Error banners announce themselves to assistive tech when shown
    document.querySelectorAll('[id$="-error"]').forEach(function (el) {
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "polite");
    });
  }

  // ------------------------------------------------------------------
  // Per-field validation feedback — listens for the browser's native
  // 'invalid' event (fires on failed required/pattern/type checks before
  // submit) and highlights the field, clearing it once corrected.
  // Complements, not replaces, the business-rule checks in js/app.js.
  // ------------------------------------------------------------------
  function initFormValidationUX() {
    document.addEventListener("invalid", function (e) {
      var field = e.target.closest && e.target.closest(".field");
      if (field) field.classList.add("field-invalid");
    }, true);

    document.addEventListener("input", function (e) {
      var field = e.target.closest && e.target.closest(".field");
      if (field && e.target.checkValidity && e.target.checkValidity()) {
        field.classList.remove("field-invalid");
      }
    }, true);

    document.addEventListener("change", function (e) {
      var field = e.target.closest && e.target.closest(".field");
      if (field && e.target.checkValidity && e.target.checkValidity()) {
        field.classList.remove("field-invalid");
      }
    }, true);
  }

  // ------------------------------------------------------------------
  // Utility: throttle
  // ------------------------------------------------------------------
  function throttle(fn, wait) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now();
      var args = arguments, ctx = this;
      if (now - last >= wait) {
        last = now;
        fn.apply(ctx, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(function () { last = Date.now(); fn.apply(ctx, args); }, wait - (now - last));
      }
    };
  }
})();
