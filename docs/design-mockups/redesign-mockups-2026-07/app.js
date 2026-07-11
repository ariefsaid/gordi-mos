/* ════════════════════════════════════════════════════════════════════════════
   Gordi MOS redesign mockups — SPA interaction layer
   ════════════════════════════════════════════════════════════════════════════
   Turns a static mockup into a clickable prototype. Each variant HTML is a
   single persistent shell (.topbar + .rail + <main>) with multiple
   [data-screen] panels inside <main>; this swaps them. Nav, drills, tabs, and
   forms are wired by attribute — no per-variant JS needed.

   CONVENTIONS (authors must follow these in the HTML):
     • <main class="main"> contains one or more <section data-screen="id" class="screen">
       The first screen gets class "screen active".
     • Navigation: anything with [data-go="screenId"] switches to that screen.
       Apply data-go to .nav-item, .nav-sub, .viewtab, .tabbar a, .kpi (drill),
       .phone-row, links — anything clickable that navigates.
     • Modals: <div data-modal="name" class="modal">…</div> opened by
       [data-modal-trigger="name"], closed by [data-close]. Backdrop + Esc auto.
     • Right drawer: <aside data-drawer="task" class="drawer"> opened by
       [data-drawer-trigger="task"] (e.g. clicking a task row), closed by
       [data-close] or Esc.
     • Role switch on Orient: buttons with [data-role="owner|lead|floor|buhead"]
       reveal matching [data-role-pane] children inside the screen.
     • Forms: <form data-form="name"> on submit prevents default, shows a
       toast ([data-toast]) and closes any open modal. Fields are real inputs.
     • Toast: <div data-toast class="toast">. Mos.toast("Saved · log captured")
       fills + shows it.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const Mos = { current: null, role: "owner", user: null };
  window.Mos = Mos;

  /* ── Personas for impersonation (the canonical Gordi cast) ──────────────── */
  const PERSONAS = {
    arief:   { id: "arief",   name: "Arief",   title: "Owner-director", initials: "AS", role: "owner",   color: "var(--brand-navy)", accent: "#1f3a5f", sees: { money: true, ops: true, allBU: true, manage: true, review: true } },
    rina:    { id: "rina",    name: "Rina",    title: "Retail Ops head",  initials: "RA", role: "buhead", color: "hsl(221 70% 45%)",  accent: "#2563eb", sees: { money: "Retail Ops", ops: true, manage: true, review: true } },
    dimas:   { id: "dimas",   name: "Dimas",   title: "B2B Ops head",     initials: "DS", role: "buhead", color: "hsl(262 55% 50%)",  accent: "#7c3aed", sees: { money: "B2B Ops", ops: true, manage: true, review: true } },
    sari:    { id: "sari",    name: "Sari",    title: "Ecommerce lead",   initials: "SP", role: "lead",   color: "hsl(142 55% 40%)",  accent: "#16a34a", sees: { ops: true, review: false } },
    yusuf:   { id: "yusuf",   name: "Yusuf",   title: "Roastery operator",initialials: "YU", role: "floor", color: "hsl(18 70% 48%)",  accent: "#ea7c2a", initials: "YU", sees: { capture: true } },
  };
  Mos.personas = PERSONAS;
  Mos.user = "arief";

  /* ── Font-size control (user preference, persisted) ─────────────────────── */
  const FONT_SIZES = { s: 14, m: 16, l: 18, xl: 20 };
  function setFontSize(key) {
    const px = FONT_SIZES[key] || 16;
    document.documentElement.style.setProperty("--fs-body", px + "px");
    document.documentElement.dataset.fontsize = key;
    try { localStorage.setItem("mos-fontsize", key); } catch (e) {}
    $$("[data-fontsize-pick]").forEach((b) => b.classList.toggle("active", b.dataset.fontsizePick === key));
  }
  Mos.setFontSize = setFontSize;

  /* ── Scrim (shared backdrop for modal + drawer) ─────────────────────────── */
  function ensureScrim() {
    let scrim = $("#mos-scrim");
    if (!scrim) {
      scrim = document.createElement("div");
      scrim.id = "mos-scrim";
      scrim.className = "scrim";
      document.body.appendChild(scrim);
      scrim.addEventListener("click", closeAll);
    }
    return scrim;
  }

  /* ── Screen routing ─────────────────────────────────────────────────────── */
  function showScreen(id) {
    const target = $(`[data-screen="${id}"]`);
    if (!target) { console.warn("[Mos] no screen:", id); return; }
    $$(".screen").forEach((el) => el.classList.toggle("active", el === target));
    Mos.current = id;
    // active nav state: mark .nav-item / .nav-sub whose data-go matches
    $$("[data-go]").forEach((el) => {
      if (el.classList.contains("nav-item") || el.classList.contains("nav-sub") ||
          el.classList.contains("viewtab") || el.closest(".tabbar")) {
        el.classList.toggle("active", el.dataset.go === id);
      }
    });
    closeAll();
    const main = $(".main"); if (main) main.scrollTop = 0;
    // breadcrumb update if present
    const bc = $("[data-crumb]"); if (bc) bc.textContent = titleFor(id);
    document.dispatchEvent(new CustomEvent("mos:screen", { detail: { id } }));
  }
  Mos.go = showScreen;

  function titleFor(id) {
    const map = {
      "orient": "Orient", "work-tasks": "Work · Tasks", "work-objectives": "Work · Objectives",
      "work-followups": "Work · Follow-ups", "work-weekly": "Work · Weekly update",
      "ops-log": "Operate · Log", "ops-plan": "Operate · Plan", "ops-stock": "Operate · Stock",
      "ops-review": "Operate · Review", "money": "Money", "money-position": "Money · Position",
      "money-budget": "Money · Budget", "money-pricing": "Money · Pricing pre-flight",
      "inbox": "Inbox", "now": "Now", "now-work": "Work", "now-ops": "Ops", "now-money": "Money",
    };
    return map[id] || id;
  }

  /* ── Modal / drawer open + close ────────────────────────────────────────── */
  function openOverlay(kind, name) { // kind: 'modal' | 'drawer'
    const el = $(`[data-${kind}="${name}"]`);
    if (!el) { console.warn(`[Mos] no ${kind}:`, name); return; }
    ensureScrim().classList.add("open");
    el.classList.add("open");
    if (kind === "modal") {
      const first = el.querySelector("input, select, textarea, button");
      if (first) setTimeout(() => { try { first.focus(); } catch (e) {} }, 50);
    }
  }
  Mos.modal = (n) => openOverlay("modal", n);
  Mos.drawer = (n) => openOverlay("drawer", n);

  function closeAll() {
    $$(".modal.open, .drawer.open").forEach((el) => el.classList.remove("open"));
    const scrim = $("#mos-scrim"); if (scrim) scrim.classList.remove("open");
  }
  Mos.close = closeAll;

  /* ── Role switching (Orient) ────────────────────────────────────────────── */
  function setRole(role) {
    Mos.role = role;
    const screen = $('[data-screen="orient"], [data-screen="now"]');
    if (!screen) return;
    $$("[data-role-switch]", screen).forEach((b) => b.classList.toggle("active", b.dataset.roleSwitch === role));
    $$("[data-role-pane]", screen).forEach((p) => {
      const show = p.dataset.rolePane === role || p.dataset.rolePane === "all";
      p.hidden = !show;
    });
  }
  Mos.role = setRole;

  /* ── User impersonation (app-wide) ──────────────────────────────────────── */
  /* Switches the signed-in user. Cascades: topbar chip, Orient role-pane,
     nav visibility (via [data-sees] gates), greeting copy, and any
     [data-user-name]/[data-user-title]/[data-user-initials] bindings. */
  function setUser(id) {
    const p = PERSONAS[id];
    if (!p) { console.warn("[Mos] unknown persona:", id); return; }
    Mos.user = id; Mos.role = p.role;
    document.documentElement.dataset.user = id;
    document.documentElement.dataset.userRole = p.role;
    // topbar chip + greeting bindings
    $$("[data-user-name]").forEach((el) => el.textContent = p.name);
    $$("[data-user-title]").forEach((el) => el.textContent = p.title);
    $$("[data-user-initials]").forEach((el) => el.textContent = p.initials);
    $$("[data-user-avatar]").forEach((el) => { el.textContent = p.initials; el.style.background = p.color; });
    $$("[data-greeting]").forEach((el) => {
      const hr = new Date().getHours();
      const tod = hr < 11 ? "Morning" : hr < 15 ? "Afternoon" : "Evening";
      el.textContent = `${tod}, ${p.name}`;
    });
    // persona picker active state
    $$("[data-user-pick]").forEach((el) => el.classList.toggle("active", el.dataset.userPick === id));
    // permission gates: [data-sees="money"] shows only if persona sees money
    $$("[data-sees]").forEach((el) => {
      const cap = el.dataset.sees;
      const has = p.sees[cap];
      el.hidden = !has;
    });
    // orient role pane follows the persona
    setRole(p.role);
    // re-run screen show to refresh nav active states after gate changes
    if (Mos.current) {
      const cur = $(`[data-screen="${Mos.current}"]`);
      if (cur && cur.hidden) { showScreen("orient"); }
    }
    Mos.toast(`Viewing as ${p.name} · ${p.title}`);
  }
  Mos.setUser = setUser;

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  let toastTimer;
  Mos.toast = function (msg) {
    let t = $("[data-toast]");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("data-toast", ""); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  };

  /* ── Form submit handler ────────────────────────────────────────────────── */
  function handleForm(form) {
    const name = form.dataset.form || "form";
    const verb = ({ "capture": "captured", "create-task": "created", "weekly-write": "submitted",
      "followup": "advanced", "budget": "saved", "pricing": "checked", "task-edit": "saved" })[name] || "saved";
    // pretend-save
    Mos.toast(`✓ ${labelFor(name)} ${verb}`);
    closeAll();
    form.reset?.();
  }
  function labelFor(name) {
    return ({ "capture": "Log entry", "create-task": "Task", "weekly-write": "Weekly update",
      "followup": "Follow-up", "budget": "Budget", "pricing": "Margin check", "task-edit": "Task" })[name] || "Saved";
  }

  /* ── Filter chip toggle (cosmetic) ──────────────────────────────────────── */
  function toggleChip(el) {
    if (el.dataset.toggle === "multi") { el.classList.toggle("on"); }
    else {
      const group = el.closest("[data-chip-group]");
      if (group) $$("[data-chip]", group).forEach((c) => c.classList.remove("on"));
      el.classList.add("on");
    }
  }

  /* ── Global event delegation ────────────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go && !go.dataset.modalTrigger && !go.dataset.drawerTrigger) {
      // a row that opens a drawer takes precedence if it has drawer-trigger
      e.preventDefault(); showScreen(go.dataset.go); return;
    }
    const dt = e.target.closest("[data-drawer-trigger]");
    if (dt) { e.preventDefault(); openOverlay("drawer", dt.dataset.drawerTrigger); return; }
    const mt = e.target.closest("[data-modal-trigger]");
    if (mt) {
      e.preventDefault();
      // if it also has data-go (e.g. capture FAB shouldn't navigate), skip screen
      openOverlay("modal", mt.dataset.modalTrigger); return;
    }
    const role = e.target.closest("[data-role-switch]");
    if (role) { e.preventDefault(); setRole(role.dataset.roleSwitch); return; }
    const fs = e.target.closest("[data-fontsize-pick]");
    if (fs) { e.preventDefault(); setFontSize(fs.dataset.fontsizePick); return; }
    const pick = e.target.closest("[data-user-pick]");
    if (pick) {
      e.preventDefault();
      setUser(pick.dataset.userPick);
      const pm = $(".persona-menu.open"); if (pm) pm.classList.remove("open");
      return;
    }
    const trig = e.target.closest("[data-user-pick-trigger]");
    if (trig) {
      e.preventDefault();
      const menu = $(".persona-menu");
      if (menu) menu.classList.toggle("open");
      return;
    }
    // outside-click closes persona menu (if click isn't inside the menu or its trigger)
    const pm = $(".persona-menu.open");
    if (pm && !e.target.closest(".persona-menu") && !e.target.closest("[data-user-pick-trigger]")) {
      pm.classList.remove("open");
    }
    const chip = e.target.closest("[data-chip]");
    if (chip) { e.preventDefault(); toggleChip(chip); return; }
    const close = e.target.closest("[data-close]");
    if (close) { e.preventDefault(); closeAll(); return; }
    // a task row with neither go nor drawer-trigger defaults to opening task drawer
    const row = e.target.closest("tr[data-task]");
    if (row) { e.preventDefault(); openOverlay("drawer", "task"); return; }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (form) { e.preventDefault(); handleForm(form); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
    // ⌘K / Ctrl+K opens command/search modal if present
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      const cmd = $('[data-modal="command"]'); if (cmd) { e.preventDefault(); openOverlay("modal", "command"); }
    }
  });

  /* ── Init ───────────────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    // mockups: disable native HTML5 validation so the submit handler always
    // fires and the toast confirms the action (a prototype, not real validation).
    $$("form[data-form]").forEach((f) => f.setAttribute("novalidate", ""));
    // mount icons (delegates to icons.js if loaded, else no-op)
    if (window.MOS_ICONS) {
      $$("[data-i]").forEach((el) => { if (window.MOS_ICONS[el.dataset.i]) el.innerHTML = window.MOS_ICONS[el.dataset.i]; });
    }
    // reveal first screen
    const first = $(".screen.active") || $(".screen");
    if (first) { Mos.current = first.dataset.screen; }
    // initial role + user
    setRole(Mos.role);
    setUser(Mos.user || "arief");
    // font size from storage
    let savedFs = "m";
    try { savedFs = localStorage.getItem("mos-fontsize") || "m"; } catch (e) {}
    setFontSize(savedFs);
    // viewtab visual-only groups already handled by icons.js; ensure no-op safe
  });
})();
