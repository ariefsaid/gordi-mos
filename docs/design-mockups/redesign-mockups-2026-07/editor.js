/* ════════════════════════════════════════════════════════════════════════════
   Gordi MOS — Block Editor (γ Notion-like)
   ════════════════════════════════════════════════════════════════════════════
   A real contenteditable block editor, compatible with app.js:
     • app.js owns screen routing (data-go), modals, drawers, impersonation, fonts.
     • editor.js owns the editable surface: block create/split/merge/delete,
       the "/" slash-menu, drag-to-reorder, inline-property popovers, to-do
       toggle, tree expand/collapse, and the mobile tree drawer.

   Compatibility contract (verified against app.js):
     • app.js's keydown only acts on Escape + Ctrl/Cmd+K. This listener
       early-returns for those so app.js keeps working.
     • contenteditable blocks live as direct children of .editor-blocks —
       never inside .tree-row / [data-go] / [data-modal-trigger] ancestors,
       so app.js click delegation never hijacks a cursor placement.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const E = { version: 1 };
  window.MosEditor = E;

  /* ── Block definitions for the "/" menu ──────────────────────────────────── */
  const BLOCK_TYPES = [
    { type: "text",     name: "Text",          desc: "Plain paragraph",       icon: "T" },
    { type: "heading",  name: "Heading",       desc: "Big section heading",   icon: "H" },
    { type: "heading2", name: "Subheading",    desc: "Medium heading",        icon: "h" },
    { type: "todo",     name: "To-do",         desc: "Checkbox task",         icon: "☐" },
    { type: "callout",  name: "Callout",       desc: "Highlighted info box",  icon: "💡" },
    { type: "divider",  name: "Divider",       desc: "Visual separator",      icon: "—" },
  ];

  /* ── Build a block element ──────────────────────────────────────────────── */
  function makeBlock(type, text) {
    const el = document.createElement("div");
    el.className = "eb";
    el.setAttribute("data-type", type);
    el.setAttribute("draggable", "true");
    el.innerHTML = '<span class="grip" title="Drag to reorder">⋮⋮</span><button class="add" title="Add block">+</button>';
    if (type === "todo") {
      const cb = document.createElement("span");
      cb.className = "checkbox";
      cb.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); toggleTodo(el); });
      el.appendChild(cb);
    }
    if (type === "callout") {
      const ic = document.createElement("span");
      ic.className = "icon"; ic.textContent = "💡";
      el.appendChild(ic);
    }
    const content = document.createElement("div");
    content.className = "content";
    content.setAttribute("contenteditable", "true");
    content.setAttribute("data-placeholder", type === "heading" ? "Heading" : type === "todo" ? "To-do" : type === "callout" ? "Write a callout…" : "Type '/' for commands");
    if (type === "divider") {
      content.removeAttribute("contenteditable");
      content.setAttribute("data-placeholder", "");
    }
    if (text) content.textContent = text;
    el.appendChild(content);
    wireBlock(el);
    return el;
  }

  function toggleTodo(block) {
    block.classList.toggle("done");
    block.querySelector(".checkbox")?.classList.toggle("checked");
  }

  /* ── The / slash menu ───────────────────────────────────────────────────── */
  let slashMenu = null, slashFocus = -1, slashAnchor = null;

  function openSlash(anchorBlock) {
    closeSlash();
    slashAnchor = anchorBlock;
    const content = anchorBlock.querySelector(".content");
    // remove the "/" that triggered it
    content.textContent = "";
    slashMenu = document.createElement("div");
    slashMenu.className = "slash-menu";
    let html = '<div class="slash-menu-head">Basic blocks</div>';
    BLOCK_TYPES.forEach((b, i) => {
      html += `<button class="slash-item" data-btype="${b.type}" data-idx="${i}"><span class="sic">${b.icon}</span><span><div class="sin">${b.name}</div><div class="sid">${b.desc}</div></span></button>`;
    });
    slashMenu.innerHTML = html;
    document.body.appendChild(slashMenu);
    positionSlash();
    slashFocus = 0;
    updateSlashFocus();
    $$("button.slash-item", slashMenu).forEach((btn) => {
      btn.addEventListener("mouseenter", () => { slashFocus = +btn.dataset.idx; updateSlashFocus(); });
      btn.addEventListener("mousedown", (e) => { e.preventDefault(); insertBlockType(btn.dataset.btype); });
    });
  }
  function positionSlash() {
    if (!slashMenu || !slashAnchor) return;
    const r = slashAnchor.getBoundingClientRect();
    slashMenu.style.top = (r.bottom + window.scrollY + 4) + "px";
    slashMenu.style.left = (r.left + window.scrollX) + "px";
  }
  function updateSlashFocus() {
    $$(".slash-item", slashMenu).forEach((it, i) => it.classList.toggle("focused", i === slashFocus));
    const focused = $$(".slash-item", slashMenu)[slashFocus];
    if (focused) focused.scrollIntoView({ block: "nearest" });
  }
  function closeSlash() {
    if (slashMenu) { slashMenu.remove(); slashMenu = null; }
    slashAnchor = null; slashFocus = -1;
  }
  function insertBlockType(type) {
    if (!slashAnchor) return;
    const anchor = slashAnchor;
    closeSlash();
    const newBlock = makeBlock(type, "");
    anchor.after(newBlock);
    // remove anchor if it was an empty text block acting as the trigger
    if (anchor.dataset.type === "text" && !anchor.querySelector(".content").textContent.trim()) {
      anchor.remove();
    }
    newBlock.querySelector(".content")?.focus();
  }

  /* ── Block lifecycle: split / merge / delete ────────────────────────────── */
  function splitBlock(block) {
    const content = block.querySelector(".content[contenteditable]");
    if (!content) { // e.g. divider — just add a text block after
      const nb = makeBlock("text", ""); block.after(nb); nb.querySelector(".content").focus(); return;
    }
    const sel = window.getSelection();
    const text = content.textContent;
    const offset = sel.anchorOffset;
    const after = text.slice(offset);
    content.textContent = text.slice(0, offset);
    const newBlock = makeBlock("text", after);
    block.after(newBlock);
    const nc = newBlock.querySelector(".content");
    nc.focus();
    // place cursor at start
    const r = document.createRange(); r.setStart(nc, 0); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  function mergeWithPrev(block) {
    const prev = block.previousElementSibling;
    if (!prev || !prev.classList.contains("eb")) { // no prev — delete if empty
      if (!block.querySelector(".content").textContent.trim()) block.remove();
      return;
    }
    const pc = prev.querySelector(".content[contenteditable]");
    if (!pc) { block.remove(); return; }
    const len = pc.textContent.length;
    const curText = block.querySelector(".content").textContent;
    pc.textContent += curText;
    block.remove();
    pc.focus();
    const sel = window.getSelection();
    const r = document.createRange();
    if (pc.firstChild) r.setStart(pc.firstChild, len); else r.setStart(pc, len);
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  }
  function deleteBlock(block) {
    const prev = block.previousElementSibling;
    block.remove();
    if (prev) prev.querySelector(".content[contenteditable]")?.focus();
  }

  /* ── Wire a block's events ──────────────────────────────────────────────── */
  function wireBlock(block) {
    const content = block.querySelector(".content[contenteditable]");
    if (content) {
      content.addEventListener("keydown", (e) => onBlockKeydown(e, block));
    }
    const addBtn = block.querySelector(".add");
    if (addBtn) addBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); const nb = makeBlock("text",""); block.after(nb); nb.querySelector(".content")?.focus(); });
    const grip = block.querySelector(".grip");
    if (grip) {
      block.addEventListener("dragstart", onDragStart);
      block.addEventListener("dragover", onDragOver);
      block.addEventListener("drop", onDrop);
      block.addEventListener("dragend", onDragEnd);
    }
  }

  function onBlockKeydown(e, block) {
    // Respect app.js: let Escape + Ctrl/Cmd+K pass through
    if (e.key === "Escape") return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return;

    // slash menu navigation when open
    if (slashMenu) {
      if (e.key === "ArrowDown") { e.preventDefault(); slashFocus = Math.min(slashFocus + 1, BLOCK_TYPES.length - 1); updateSlashFocus(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); slashFocus = Math.max(slashFocus - 1, 0); updateSlashFocus(); return; }
      if (e.key === "Enter") { e.preventDefault(); const t = BLOCK_TYPES[slashFocus]; if (t) insertBlockType(t.type); return; }
      if (e.key === "Backspace" || e.key === "/") { /* let them type/exit */ }
      else { closeSlash(); } // any other key closes the menu
    }

    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); splitBlock(block); return; }
    if (e.key === "Backspace") {
      const content = block.querySelector(".content[contenteditable]");
      const empty = content && content.textContent === "";
      const atStart = window.getSelection().anchorOffset === 0;
      if (empty) { e.preventDefault(); deleteBlock(block); return; }
      if (atStart) { e.preventDefault(); mergeWithPrev(block); return; }
    }
    // "/" at start of empty block → open menu
    if (e.key === "/" ) {
      const content = block.querySelector(".content[contenteditable]");
      const sel = window.getSelection();
      if (content && content.textContent === "" && sel.anchorOffset === 0) {
        // let the "/" render then open menu on keyup; simpler: open now, we cleared text in openSlash
        setTimeout(() => {
          if (content.textContent === "/") { openSlash(block); }
        }, 0);
      }
    }
  }

  /* ── Drag reorder ───────────────────────────────────────────────────────── */
  let dragSrc = null, dropInd = null;
  function onDragStart(e) {
    dragSrc = e.currentTarget;
    e.currentTarget.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e) {
    if (!dragSrc) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = e.currentTarget;
    if (target === dragSrc) return;
    // determine insert position relative to midpoint
    const r = target.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    removeDropInd();
    dropInd = document.createElement("div");
    dropInd.className = "drop-indicator";
    if (after) target.after(dropInd); else target.before(dropInd);
  }
  function onDrop(e) {
    e.preventDefault();
    if (!dragSrc) return;
    const target = e.currentTarget;
    const r = target.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    removeDropInd();
    if (after) target.after(dragSrc); else target.before(dragSrc);
  }
  function onDragEnd(e) { e.currentTarget.classList.remove("dragging"); removeDropInd(); dragSrc = null; }
  function removeDropInd() { if (dropInd) { dropInd.remove(); dropInd = null; } }

  /* ── Inline property popovers ───────────────────────────────────────────── */
  let propPop = null;
  function openProp(anchor, options, current) {
    closeProp();
    propPop = document.createElement("div");
    propPop.className = "prop-pop";
    let html = '<div class="pp-head">Select</div>';
    options.forEach((opt) => {
      const sel = opt.value === current ? "selected" : "";
      html += `<button class="pp-opt ${sel}" data-val="${opt.value}">${opt.label}<span class="check">✓</span></button>`;
    });
    propPop.innerHTML = html;
    anchor.appendChild(propPop);
    const r = anchor.getBoundingClientRect();
    propPop.style.top = (r.bottom + window.scrollY + 4) + "px";
    propPop.style.left = (r.left + window.scrollX) + "px";
    propPop.style.position = "absolute";
    // re-parent to body for safe layering, positioned fixed
    document.body.appendChild(propPop);
    propPop.style.position = "fixed";
    propPop.style.top = (r.bottom + 4) + "px";
    propPop.style.left = r.left + "px";
    $$(".pp-opt", propPop).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = btn.dataset.val;
        const valEl = anchor.querySelector(".val");
        const opt = options.find(o => o.value === val);
        if (valEl && opt) valEl.textContent = opt.label;
        anchor.dataset.value = val;
        // update selected markers
        $$(".pp-opt", propPop).forEach(b => b.classList.toggle("selected", b.dataset.val === val));
        closeProp();
        window.Mos && window.Mos.toast && window.Mos.toast(`Set to ${opt ? opt.label : val}`);
      });
    });
  }
  function closeProp() { if (propPop) { propPop.remove(); propPop = null; } }

  /* ── Tree expand/collapse (FIX for the stopPropagation no-op) ────────────── */
  // app.js's [data-go] click handler runs first (registered earlier). We use a
  // CAPTURE-phase listener so we run BEFORE app.js, and stopImmediatePropagation
  // to prevent app.js's bubble handler from navigating when only the chevron
  // was clicked.
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".tree-toggle");
    if (!toggle) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const node = toggle.closest(".tree-node");
    if (node) node.classList.toggle("collapsed");
  }, true); // ← capture phase, beats app.js

  /* ── Mobile tree drawer ─────────────────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const tb = e.target.closest(".tree-btn");
    if (tb) { e.preventDefault(); e.stopImmediatePropagation(); const d = $("#treeDrawer"); if (d) { d.classList.add("open"); const sc = $("#mos-scrim"); if (sc) sc.classList.add("open"); } return; }
    const close = e.target.closest("[data-close-tree]");
    if (close) { const d = $("#treeDrawer"); if (d) d.classList.remove("open"); const sc = $("#mos-scrim"); if (sc) sc.classList.remove("open"); }
  }, true);

  /* ── Global dismiss handlers (click-outside, Escape for editor menus) ───── */
  document.addEventListener("click", (e) => {
    if (slashMenu && !slashMenu.contains(e.target) && slashAnchor && !slashAnchor.contains(e.target)) closeSlash();
    if (propPop && !propPop.contains(e.target)) {
      const anchor = e.target.closest(".prop-anchor");
      if (!anchor) closeProp();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSlash(); closeProp(); }
  });

  /* ── Wire everything on load + on screen change ─────────────────────────── */
  function wireAll(scope) {
    scope = scope || document;
    // make existing static .editor-blocks live
    $$(".editor-blocks", scope).forEach((container) => {
      $$(".eb", container).forEach(wireBlock);
      // ensure each block is draggable + has grip/add if missing
      $$(".eb", container).forEach((b) => {
        if (!b.querySelector(".grip") && b.dataset.type !== "divider") {
          const g = document.createElement("span"); g.className = "grip"; g.textContent = "⋮⋮"; g.title = "Drag to reorder";
          b.insertBefore(g, b.firstChild);
          b.setAttribute("draggable", "true");
          wireBlock(b);
        }
      });
    });
    // titles editable
    $$(".editable-title[data-edit]", scope).forEach((t) => {
      if (!t.hasAttribute("contenteditable")) t.setAttribute("contenteditable", "true");
    });
    // inline-prop click → popover
    $$(".prop-anchor", scope).forEach((a) => {
      if (a.dataset.wired) return;
      a.dataset.wired = "1";
      a.addEventListener("click", (e) => {
        e.stopPropagation();
        const opts = E.PROP_OPTIONS[a.dataset.prop] || [];
        const cur = a.dataset.value || a.querySelector(".val")?.textContent?.trim() || "";
        openProp(a, opts, cur);
      });
    });
    // existing static to-do checkboxes
    $$(".eb[data-type='todo'] .checkbox", scope).forEach((cb) => {
      if (cb.dataset.wired) return; cb.dataset.wired = "1";
      cb.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); toggleTodo(cb.closest(".eb")); });
    });
    // SOP check inputs — live pass/fail. Wire both in-screen AND in body-level modals
    // (modals live outside <section data-screen>, so scope alone misses them).
    const allRows = new Set([...$$(".check-row, .check-form-step", scope), ...$$(".modal .check-row, .modal .check-form-step")]);
    allRows.forEach((row) => {
      if (row.dataset.wired || row.classList.contains("head")) return; row.dataset.wired = "1"; wireCheckInput(row);
    });
  }

  E.wireAll = wireAll;
  E.makeBlock = makeBlock;
  E.openSlash = openSlash;
  E.closeSlash = closeSlash;

  // Property option sets (consumed by inline-prop popovers)
  E.PROP_OPTIONS = {
    status: [
      { value: "open", label: "● Open" }, { value: "progress", label: "◐ In progress" },
      { value: "blocked", label: "⛔ Blocked" }, { value: "done", label: "✓ Done" },
    ],
    lane: [
      { value: "run", label: "Run / BAU" }, { value: "optimize", label: "Optimize" }, { value: "transform", label: "Transform" },
    ],
    type: [{ value: "project", label: "Project" }, { value: "process", label: "Process" }],
    pic: [
      { value: "rina", label: "Rina A." }, { value: "dimas", label: "Dimas S." },
      { value: "sari", label: "Sari P." }, { value: "budi", label: "Budi W." }, { value: "yusuf", label: "Yusuf" },
    ],
    sup: [
      { value: "arief", label: "Arief" }, { value: "rina", label: "Rina A." }, { value: "dimas", label: "Dimas S." },
    ],
    r: [{ value: "rina", label: "Rina A." }, { value: "sari", label: "Sari P." }, { value: "yusuf", label: "Yusuf" }],
    a: [{ value: "arief", label: "Arief" }, { value: "rina", label: "Rina A." }, { value: "dimas", label: "Dimas S." }],
    c: [{ value: "dimas", label: "Dimas S." }, { value: "budi", label: "Budi W." }],
    i: [{ value: "sari", label: "Sari P." }, { value: "budi", label: "Budi W." }],
    // SOP / shift properties
    target: [{ value: "q3", label: "Q3 2026" }, { value: "q4", label: "Q4 2026" }, { value: "2026", label: "FY 2026" }],
    due: [{ value: "1d", label: "Tomorrow" }, { value: "3d", label: "In 3 days" }, { value: "1w", label: "Next week" }, { value: "2w", label: "In 2 weeks" }, { value: "overdue", label: "Overdue" }],
    station: [{ value: "roastery", label: "Roastery" }, { value: "espresso", label: "Espresso bar" }, { value: "kitchen", label: "Kitchen" }, { value: "ecom", label: "Ecommerce pack" }],
    area: [{ value: "roastery", label: "Roastery" }, { value: "kitchen", label: "Kitchen" }, { value: "bar", label: "Bar" }, { value: "ecom", label: "Ecommerce" }],
    cadence: [{ value: "per-shot", label: "Per shot" }, { value: "per-batch", label: "Per batch" }, { value: "daily-open", label: "Daily open" }, { value: "daily-close", label: "Daily close" }, { value: "weekly", label: "Weekly" }],
  };

  /* ════════════════════════════════════════════════════════════════════════════
     SOP QUALITY LOOP — capture check vs spec → pass/fail → exception → correction
     ════════════════════════════════════════════════════════════════════════════
     A spec step carries data attributes: data-target (number), data-min, data-max,
     data-unit, data-param. captureCheck reads a reading input, computes verdict,
     and on fail calls raiseException which inserts an .exception block + a
     linked correction-task chip.
     ════════════════════════════════════════════════════════════════════════════ */

  // Evaluate a reading against a spec step. Returns {verdict, detail}.
  function evalReading(step, reading) {
    const min = parseFloat(step.dataset.min);
    const max = parseFloat(step.dataset.max);
    const val = parseFloat(reading);
    if (isNaN(val)) return { verdict: "pending", detail: "—" };
    if (!isNaN(min) && !isNaN(max)) {
      return val >= min && val <= max
        ? { verdict: "pass", detail: `${val} in ${min}–${max}` }
        : { verdict: "fail", detail: `${val} outside ${min}–${max}` };
    }
    const target = parseFloat(step.dataset.target);
    if (!isNaN(target)) {
      return Math.abs(val - target) <= (target * 0.05)
        ? { verdict: "pass", detail: `${val} ≈ ${target}` }
        : { verdict: "fail", detail: `${val} vs ${target}` };
    }
    return { verdict: "pass", detail: String(val) };
  }

  // Wire a check-capture input: live pass/fail as you type.
  function wireCheckInput(checkRow) {
    const step = checkRow.querySelector("[data-step]") || checkRow;
    const input = checkRow.querySelector(".cr-reading input");
    const verdictEl = checkRow.querySelector(".cr-verdict");
    const evidenceEl = checkRow.querySelector(".cr-evidence");
    if (!input || !verdictEl) return;
    const update = () => {
      const { verdict, detail } = evalReading(checkRow, input.value);
      checkRow.classList.remove("pass", "fail");
      verdictEl.className = "cr-verdict " + verdict;
      verdictEl.innerHTML = verdict === "pass" ? "✓ in spec" : verdict === "fail" ? "✗ out of spec" : "— pending";
      if (verdict === "pass") checkRow.classList.add("pass");
      if (verdict === "fail") {
        checkRow.classList.add("fail");
        if (evidenceEl) { evidenceEl.classList.add("required"); evidenceEl.innerHTML = "📎 evidence required"; }
      } else if (evidenceEl) {
        evidenceEl.classList.remove("required");
        if (!evidenceEl.classList.contains("attached")) evidenceEl.innerHTML = "";
      }
      checkRow.dataset.verdict = verdict;
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  }

  // Raise an exception from a failed check: insert an .exception block + correction task chip.
  function raiseException(container, stepLabel, reading, owner) {
    const ex = document.createElement("div");
    ex.className = "exception";
    const id = "EXC-" + Math.floor(100 + Math.random() * 900);
    ex.innerHTML =
      '<span class="ex-icon">⚠</span>' +
      '<div class="ex-body">' +
        '<div class="ex-title">Out of spec — ' + stepLabel + ' read ' + reading + '</div>' +
        '<div class="ex-meta">Auto-raised ' + new Date().toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"}) + ' · routed to ' + (owner || "on-shift supervisor") + '</div>' +
        '<a class="ex-link" data-go="work-tasks">→ Correction task ' + id + ' (open in Work)</a>' +
      '</div>';
    container.appendChild(ex);
    return id;
  }

  // Submit a check form: evaluate each row, raise exceptions for fails, toast summary.
  function submitCheckForm(form) {
    const rows = $$(".check-form-step, .check-row", form);
    let passes = 0, fails = 0;
    const excHost = form.closest("[data-screen]") || form.parentElement;
    const exceptionsHost = excHost.querySelector(".audit-trail, .exceptions-host") || excHost;
    rows.forEach((row) => {
      const input = row.querySelector("input.cr-input, .cr-reading input");
      if (!input) return;
      const { verdict } = evalReading(row, input.value);
      if (verdict === "pass") passes++;
      if (verdict === "fail") {
        fails++;
        const label = (row.querySelector(".cfs-param, .cr-param") || {}).textContent || "parameter";
        raiseException(exceptionsHost, label.trim(), input.value || "—", "on-shift supervisor");
      }
    });
    if (window.Mos && window.Mos.toast) {
      window.Mos.toast(fails > 0
        ? `✓ Check captured · ${passes} pass · ${fails} fail → ${fails} correction task${fails>1?"s":""} raised`
        : `✓ Check captured · ${passes} pass · all in spec`);
    }
  }

  E.evalReading = evalReading;
  E.raiseException = raiseException;
  E.submitCheckForm = submitCheckForm;

  // Close the mobile tree drawer whenever a modal/drawer opens or ⌘K fires,
  // so it doesn't intercept pointer events over the overlay (z-index conflict).
  function closeTreeDrawer() {
    const d = document.getElementById("treeDrawer");
    if (d) d.classList.remove("open");
    const sc = document.getElementById("mos-scrim");
    if (sc) sc.classList.remove("open");
  }
  // capture-phase: run before app.js opens modals
  document.addEventListener("click", (e) => {
    const mt = e.target.closest("[data-modal-trigger]");
    if (mt) closeTreeDrawer();
  }, true);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") closeTreeDrawer();
  }, true);

  // Intercept check-form submits (capture phase → runs before app.js, stops propagation)
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form='check']");
    if (!form) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    submitCheckForm(form);
    // close the modal if the form is inside one
    const modal = form.closest(".modal");
    if (modal) modal.classList.remove("open");
    const scrim = document.getElementById("mos-scrim");
    if (scrim) scrim.classList.remove("open");
  }, true);

  document.addEventListener("DOMContentLoaded", () => wireAll(document));
  // re-wire when app.js swaps screens
  document.addEventListener("mos:screen", (e) => {
    const screen = document.querySelector(`[data-screen="${e.detail.id}"]`);
    if (screen) wireAll(screen);
  });
})();
