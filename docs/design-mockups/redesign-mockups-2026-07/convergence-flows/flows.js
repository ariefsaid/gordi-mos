/* ════════════════════════════════════════════════════════════════════════════
   CONVERGENCE FLOWS — flows.js
   Three thin flows against the Experience Contract (EXPERIENCE-CONTRACT.md):
     F1 — Ayu posts a Signal from phone Home            (persona: Ayu,  ≤390px)
     F2 — Ayu starts and completes today's Café opening  (persona: Ayu)
     F3 — Rina finds and acts on overdue Team work       (persona: Rina, desktop)
   Hash-routed, in-memory, no build step, self-contained inline SVG icons.
   Reuses e7-prototype.css tokens/classes. Domain law is closed — this is grammar.
   ════════════════════════════════════════════════════════════════════════════ */
import {
  people, teams, bus, sites, records, can,
  liveDb, workViews, jobSentences, cafeOpeningToday,
} from './fixtures.js';

/* ── Runtime mutable db (prototype-only, persisted across refresh) ───────── */
const STORAGE_KEY = 'gordi-convergence-flows-v2';
const DEFAULT_FEED_IDS = ['sig_sales_peak', 'sig_chiller', 'sig_vendor'];
const persisted = loadPersisted();
const db = persisted.db || liveDb();
const feed = (persisted.feedIds || DEFAULT_FEED_IDS).map(id => db[id]).filter(Boolean);

/* ── Icons (lucide-style stroke; sized via CSS .ico) ──────────────────────── */
const P = {
  home:'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  work:'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  money:'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M15 14h2',
  inbox:'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
  cafe:'M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 1v3M10 1v3M14 1v3',
  eco:'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  roast:'M8.5 14.5A3.5 3.5 0 0 0 12 11a3.5 3.5 0 0 0 3.5 3.5 4.5 4.5 0 1 1-7 0zM12 2v3M5 5l2 2M19 5l-2 2M3 11h2M19 11h2',
  plus:'M12 5v14M5 12h14',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  bell:'M18 16a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V11a6 6 0 0 1 12 0zM10 22h4',
  spark:'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8zM5 14l.7 1.8L7.5 16.5 5.7 17.2 5 19l-.7-1.8L2.5 16.5l1.8-.7z',
  check:'M5 12l4.5 4.5L19 7',
  pin:'M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12zM12 12.5A2.5 2.5 0 1 0 12 7.5a2.5 2.5 0 0 0 0 5z',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  warn:'M12 3 2 21h20zM12 9v5M12 18v.5',
  cam:'M3 7h4l2-2h6l2 2h4v13H3zM9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  chev:'M6 9l6 6 6-6',
  chevr:'M9 6l6 6-6 6',
  back:'M15 18l-6-6 6-6',
  x:'M6 6l12 12M18 6 6 18',
  menu:'M3 6h18M3 12h18M3 18h18',
  more:'M5 12h.5M12 12h.5M19 12h.5',
  shield:'M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6zM9 12l2 2 4-4',
  user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  send:'M4 12 20 4l-6 16-3-7zM14 9l-10 3',
  list:'M4 6h16M4 12h16M4 18h16',
  build:'M14 7l3-3 3 3-3 3zM5 12l5-5 7 7-5 5zM9 8l4 4M3 21l5-1',
  external:'M14 5h5v5M19 5l-9 9M19 14v5H5V5h5',
  calendar:'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4',
};
function ico(name, cls) {
  const p = P[name] || '';
  return `<svg class="ico ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const teamName = id => teams[id]?.name || id;
const personName = id => people[id]?.name || id;
const initials = id => people[id]?.initials || '?';
const teamSite = id => sites[teams[id]?.siteId || ''];
const todayISO = '2026-07-13';                 /* prototype "today" (jtbd fixtures dated 07-10/11) */
function teamMemberCount(teamId) {
  return Object.values(people).filter(p => p.primaryTeamId === teamId || (p.additionalTeams||[]).includes(teamId)).length;
}
function buMemberCount(buId) {
  return Object.values(people).filter(p => {
    const pt = teams[p.primaryTeamId]; return (pt && pt.buId === buId) || p.buId === buId;
  }).length;
}
function nowLocal() { const d = new Date(); return d.toTimeString().slice(0, 5); }
function isPhone() { return window.innerWidth <= 767; }
function fuzzyScore(query, candidate) {
  const q = String(query || '').trim().toLowerCase();
  const c = String(candidate || '').toLowerCase();
  if (!q) return 1;
  let last = -1; let score = 0;
  for (const ch of q) {
    const idx = c.indexOf(ch, last + 1);
    if (idx === -1) return 0;
    score += idx === last + 1 ? 2 : 1;
    last = idx;
  }
  if (c.includes(q)) score += q.length * 3;
  return score;
}
function fuzzyHits(items, query, getName, limit) {
  return items.map(item => ({ item, score: fuzzyScore(query, getName(item)) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || getName(a.item).localeCompare(getName(b.item)))
    .slice(0, limit)
    .map(x => x.item);
}
function defaultComposer() { return { open: false, body: '', teamId: 't_hq_ops', occurred: nowLocal(), attention: 'FYI', mentions: [] }; }
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}
function savePersisted() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      db,
      feedIds: feed.map(x => x.id),
      personId: state.personId,
      composer: {
        body: state.composer.body,
        teamId: state.composer.teamId,
        occurred: state.composer.occurred,
        attention: state.composer.attention,
        mentions: state.composer.mentions,
      },
    }));
  } catch (_e) {
    /* no-op in read-only/private contexts */
  }
}
function person() { return people[state.personId]; }

/* ── State ────────────────────────────────────────────────────────────────── */
const state = {
  personId: persisted.personId || 'p_ayu',
  launcherOpen: false,
  deputy: { open: false, msgs: [] },
  personaPopOpen: false,
  mobileViewMenuOpen: false,
  composer: Object.assign(defaultComposer(), persisted.composer || {}),
  signalsQuery: '',
};

/* ── Router (Rule 4: canonical routes + URL state) ────────────────────────── */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathStr, queryStr] = raw.split('?');
  const path = pathStr.split('/').filter(Boolean);
  const query = {};
  if (queryStr) queryStr.split('&').forEach(kv => { const [k, v] = kv.split('='); query[k] = decodeURIComponent(v||''); });
  return { route: path[0] || 'home', path, query };
}
function go(hash) { location.hash = hash; }
function recordHref(id) { return `#/record/${id}`; }
function withQuery(base, q) {
  const entries = Object.entries(q || {}).filter(([, v]) => v !== '' && v != null);
  return entries.length ? `${base}?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : base;
}
const TASKS_VIEWS = ['all', 'mine', 'team', 'overdue', 'followups'];
/* Rule 4 back-compat: legacy Work routes (mine/team/library) redirect to the
   canonical owner-frame children (tasks / projects), preserving record/view. */
function legacyRedirect(parsed) {
  if (parsed.route !== 'work') return null;
  const child = parsed.path[1];
  const q = parsed.query;
  if (!child) return withQuery('#/work/tasks', q);
  if (child === 'mine' || child === 'team') {
    const v = (q.view && TASKS_VIEWS.includes(q.view)) ? q.view : child;
    return withQuery('#/work/tasks', Object.assign({}, q, { view: v }));
  }
  if (child === 'library') return withQuery('#/work/projects', q);
  return null;
}

/* Which nav element owns a route (exactly-one aria-current — Rule 5).
   Work parent collapses to `location` when one of its children is the active
   page. Owner frame (2026-07-14): Work children = Signals · Tasks · Projects &
   Processes · Objectives; Events is a new destination root. */
function activeNav(parsed) {
  const { route, path } = parsed;
  if (route === 'home') return { dest: 'home' };
  if (route === 'work') return { dest: 'work', child: path[1] || 'tasks' };
  if (route === 'events') return { dest: 'events' };
  if (route === 'record') {
    const id = path[1];
    if (id === 'occ_cafe_open_today') return { dest: 'cafe' };
    const rec = db[id];
    if (rec?.type === 'signal') return { dest: 'work', child: 'signals' };
    if (rec?.type === 'followup') return { dest: 'money' };
    if (rec?.type === 'task') return { dest: 'work', child: 'tasks' };
    if (rec?.type === 'process' || rec?.type === 'project' || rec?.type === 'standard') return { dest: 'work', child: 'projects' };
    if (rec?.type === 'objective') return { dest: 'work', child: 'objectives' };
    return { dest: 'work', child: 'tasks' };
  }
  if (['cafe','ecommerce','roastery','money','inbox'].includes(route)) return { dest: route };
  if (route === 'profile') return { util: 'profile' };
  if (route === 'admin') return { util: 'admin' };
  return { dest: 'home' };
}

/* ════════════════════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════════════════════ */
function render() {
  const parsed = parseHash();
  const p = person();
  const nav = activeNav(parsed);
  const app = $('#app');
  app.setAttribute('aria-busy', 'false');
  app.innerHTML = shell(parsed, p, nav);
  if (state.launcherOpen) mountLauncher();
  bindShell(parsed, p);
  renderContent(parsed, p);
  renderRegion4(parsed, p);
  if (state.deputy.open) mountDeputy();
  afterPaint(parsed, p);
}

/* Shell: rail + header + main skeleton — four-region anatomy (Rule 6).
   Owner frame (2026-07-14): header = logo + breadcrumb (left) · search field +
   Inbox + Deputy (right). NO "+ Actions" button — its actions live in the ⌘K
   palette, opened by the search field, ⌘K, or the phone FAB. */
function shell(parsed, p, nav) {
  const phone = isPhone();
  return `
  <div class="e7-app" data-route="${esc(parsed.route)}" data-view="${parsed.route === 'record' ? 'record' : 'collection'}">
    ${phone ? '' : rail(parsed, p, nav)}
    <header class="e7-topbar">
      <a class="e7-brand e7-brand-lockup" href="#/home" aria-label="Gordi MOS home">
        <span class="e7-brand-square"><span class="e7-brand-dot"></span></span>
        Gordi<span class="e7-brand-mos">MOS</span>
      </a>
      <span class="e7-context-label e7-breadcrumb">${contextLabel(parsed)}</span>
      <span class="e7-topbar-spacer"></span>
      <button class="e7-searchfield" type="button" data-launcher aria-label="Open search and actions">
        ${ico('search')}<span class="e7-searchfield-text">Search</span><span class="e7-kbd">⌘K</span>
      </button>
      <button class="e7-iconbtn" type="button" data-inbox aria-label="Inbox">${ico('bell')}<span class="e7-dot">3</span></button>
      <button class="e7-iconbtn" type="button" data-deputy-open aria-label="Ask Deputy">${ico('spark')}</button>
    </header>
    <main class="e7-main" id="main" tabindex="-1">
      <div class="ctx-row" id="ctx-row">${contextRow(parsed, p)}</div>
      <div class="e7-page" id="content"></div>
    </main>
    <aside class="e7-panel-host" id="panel-host" aria-label="Record drawer"></aside>
    <div class="e7-modal-host" id="modal-host"></div>
    <button class="e7-fab" type="button" data-launcher aria-label="Open search and actions"></button>
    ${phone ? mobileNav(parsed, nav) : ''}
  </div>`;
}

/* Rail: 5 destinations (Home · Work · Events · Money[gated] · Inbox) +
   BU-grouped Modules + pinned Admin + profile row (Rule 3 caps).
   Owner frame (2026-07-14): Work children = Signals · Tasks · Projects &
   Processes · Objectives, always expanded; Events is a destination root;
   the persona lives in a pinned profile row, not the header. */
function rail(parsed, p, nav) {
  const workChildren = [
    { id: 'signals', label: 'Signals', icon: 'spark' },
    { id: 'tasks', label: 'Tasks', icon: 'check' },
    { id: 'projects', label: 'Projects & Processes', icon: 'build' },
    { id: 'objectives', label: 'Objectives', icon: 'pin' },
  ];
  const dests = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'work', label: 'Work', icon: 'work', children: workChildren },
    { id: 'events', label: 'Events', icon: 'calendar' },
    /* Money is capability-gated (D1): unauthorized viewers don't see the entry
       at all — same rule on desktop and phone (contract Rule 9 reachability). */
    ...(can(p, 'money.view') ? [{ id: 'money', label: 'Money', icon: 'money' }] : []),
    { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  ];
  const modules = [
    { bu: 'Retail Ops', items: [
      { id: 'cafe', label: 'Café', icon: 'cafe' },
      { id: 'ecommerce', label: 'Ecommerce', icon: 'eco' },
    ]},
    { bu: 'B2B Ops', items: [
      { id: 'roastery', label: 'Roastery', icon: 'roast' },
    ]},
  ];
  const util = [
    { id: 'admin', label: 'Admin Settings', icon: 'shield', gated: !can(p, 'admin.view') },
  ];

  const destHtml = dests.map(d => {
    const isActive = nav.dest === d.id && !nav.child && parsed.route !== 'record';
    const isLocation = nav.dest === d.id && (!!nav.child || (parsed.route === 'record' && nav.dest === d.id));
    let sub = '';
    if (d.id === 'work') {
      sub = `<div class="e7-nav-sub">` +
        d.children.map(c => {
          const cActive = nav.dest === 'work' && nav.child === c.id;
          return `<a class="e7-nav-item e7-nav-child ${cActive?'active':''}" href="#/work/${c.id}" ${cActive?'aria-current="page"':''}>${ico(c.icon)}<span>${esc(c.label)}</span></a>`;
        }).join('') + `</div>`;
    }
    const curAttr = isActive ? 'aria-current="page"' : (isLocation ? 'aria-current="location"' : '');
    const href = d.id === 'work' ? '#/work/tasks' : `#/${d.id}`;
    return `<a class="e7-nav-item ${isActive||isLocation?'active':''}" href="${href}" ${curAttr}>${ico(d.icon)}<span>${esc(d.label)}</span>${d.gated?'<span class="e7-count" title="Capability-gated">•</span>':''}</a>${sub}`;
  }).join('');

  const modHtml = modules.map(g =>
    `<div class="e7-rail-group e7-bu-group"><div class="overline e7-bu-label">${esc(g.bu)}</div>` +
    g.items.map(m => {
      const active = nav.dest === m.id;
      return `<a class="e7-nav-item ${active?'active':''}" href="#/${m.id}" ${active?'aria-current="page"':''}>${ico(m.icon)}<span>${esc(m.label)}</span></a>`;
    }).join('') + `</div>`
  ).join('');

  const utilHtml = `<div class="e7-rail-group e7-rail-utility">` +
    util.map(u => {
      const active = nav.util === u.id;
      return `<a class="e7-nav-item ${active?'active':''}" href="#/${u.id}" ${active?'aria-current="page"':''}>${ico(u.icon)}<span>${esc(u.label)}</span>${u.gated?'<span class="e7-count" title="Capability-gated">•</span>':''}</a>`;
    }).join('') +
    `<span class="e7-rail-profile-wrap">
       <button class="e7-rail-profile" type="button" data-persona aria-label="Switch persona" aria-haspopup="menu" aria-expanded="${state.personaPopOpen}" ${nav.util === 'profile' ? 'aria-current="page"' : ''}>
         <span class="e7-avatar">${esc(initials(p.id))}</span>
         <span class="e7-profile-text"><span class="nm">${esc(p.name)}</span><span class="rl">${esc(teamSite(p.primaryTeamId)?.name || teamName(p.primaryTeamId))} ${esc(p.role)}</span></span>
         ${ico('chevr')}
       </button>
       <div id="persona-pop-mount"></div>
     </span>` +
    `</div>`;

  return `<aside class="e7-rail" aria-label="Primary"><div class="e7-rail-group"><div class="overline" style="padding:0 10px">Workspace</div>${destHtml}</div><div class="e7-rail-modules">${modHtml}</div>${utilHtml}</aside>`;
}
function mobileNav(parsed, nav) {
  const primary = ['home','work','cafe','inbox'];
  const items = [
    { id:'home', label:'Home', icon:'home', href:'#/home' },
    { id:'work', label:'Work', icon:'work', href:'#/work/tasks' },
    { id:'cafe', label:'Café', icon:'cafe', href:'#/cafe' },
    { id:'inbox', label:'Inbox', icon:'inbox', href:'#/inbox' },
  ];
  /* "More" owns every authorized destination not in the bottom nav (Events,
     Money, Modules, Profile/Admin, module-shaped records) so exactly-one
     aria-current holds on phone for every route (Rule 5 / Rule 9). */
  const moreActive = !primary.includes(nav.dest);
  return `<nav class="e7-mobile-nav" aria-label="Primary">${items.map(i => `<a href="${i.href}" ${nav.dest===i.id?'aria-current="page"':''}>${ico(i.icon)}<span>${esc(i.label)}</span></a>`).join('')}<button type="button" data-mobile-menu aria-label="Open more destinations" ${moreActive?'aria-current="page"':''}>${ico('menu')}<span>More</span></button></nav>`;
}

/* Current-location breadcrumb in the header (owner frame): "Home",
   "Work · Tasks", "Café", … — last segment is the current location. */
function contextLabel(parsed) {
  const segs = [];
  const r = parsed.route;
  if (r === 'work') {
    segs.push('Work');
    const child = parsed.path[1];
    const childLabel = { signals:'Signals', tasks:'Tasks', projects:'Projects & Processes', objectives:'Objectives' }[child];
    if (childLabel) segs.push(childLabel);
    if (child === 'tasks' && parsed.query.view) {
      const v = (workViews.tasks || []).find(w => w.id === parsed.query.view);
      if (v && v.id !== 'all') segs.push(v.label);
    }
  } else {
    const map = { home:'Home', events:'Events', money:'Money', inbox:'Inbox', cafe:'Café', ecommerce:'Ecommerce', roastery:'Roastery', profile:'Personal Profile', admin:'Admin Settings', record:'Record' };
    segs.push(map[r] || 'Home');
  }
  return segs.map((s, i) => {
    const last = i === segs.length - 1;
    const sep = i === 0 ? '' : '<span class="crumb-sep">·</span>';
    return `${sep}<span class="${last ? 'crumb-current' : 'crumb-parent'}">${esc(s)}</span>`;
  }).join('');
}
function contextRow(parsed, p) {
  /* Resolve the job sentence to the active child/record, not the bare route. */
  let jobKey = parsed.route;
  if (parsed.route === 'work') jobKey = parsed.path[1] || 'tasks';
  else if (parsed.route === 'record') {
    const rec = db[parsed.path[1]];
    if (rec?.type === 'signal') jobKey = 'signals';
    else if (rec?.type === 'task') jobKey = 'tasks';
    else if (rec?.type === 'process' || rec?.type === 'project' || rec?.type === 'standard') jobKey = 'projects';
    else if (rec?.type === 'objective') jobKey = 'objectives';
  }
  const job = jobSentences[jobKey] || jobSentences[parsed.route] || jobSentences[parsed.path?.[0]] || 'Find your next action.';
  const team = teams[p.primaryTeamId];
  return `
    <span class="ctx-scope">${ico('user')}<span class="e7-avatar">${esc(initials(p.id))}</span><span class="ctx-scope-name">${esc(p.name)}</span></span>
    <span class="ctx-job"><b>${esc(job)}</b></span>
    <span class="ctx-meta"><span class="loc-pill">${ico('pin')}${esc(teamSite(p.primaryTeamId)?.name || team?.name)}</span></span>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   CONTENT (region 3)
   ════════════════════════════════════════════════════════════════════════════ */
function renderContent(parsed, p) {
  const el = $('#content'); if (!el) return;
  switch (parsed.route) {
    case 'home': el.innerHTML = viewHome(p); break;
    case 'work': el.innerHTML = viewWork(p, parsed); break;
    case 'cafe': el.innerHTML = viewCafe(p); break;
    case 'events': el.innerHTML = viewEvents(p); break;
    case 'money': el.innerHTML = viewStub('money', 'Money is capability-gated; the overdue Follow-ups queue lives here in the full build.'); break;
    case 'inbox': el.innerHTML = viewStub('inbox', 'Inbox triage routes every mention/exception/upgrade to its source record.'); break;
    case 'ecommerce': el.innerHTML = viewStub('ecommerce', 'Ecommerce fulfilment queue — not in this slice.'); break;
    case 'roastery': el.innerHTML = viewStub('roastery', 'Roastery batch/yield recording — not in this slice.'); break;
    case 'profile': el.innerHTML = viewStub('profile', 'Personal Profile + Home region order preference.'); break;
    case 'admin': el.innerHTML = viewStub('admin', 'Admin Settings — Organization & People & access.'); break;
    case 'record': el.innerHTML = ''; break;
    default: el.innerHTML = viewHome(p);
  }
}

/* F1: Home — attention brief (non-removable) + Signal feed region (Q1). */
function viewHome(p) {
  const myTasks = Object.values(db).filter(r => r.type === 'task' && r.picId === p.id && r.status !== 'Done' && r.id !== 'occ_cafe_open_today');
  const overdue = myTasks.filter(t => t.due && t.due < todayISO);
  const opening = db.occ_cafe_open_today;
  const showOpening = p.id === 'p_ayu' && opening;
  const items = [];
  if (showOpening && opening.status !== 'Done') items.push(attItem('cafe', 'Café opening — today', `Due before service · ${opening.checklist.filter(c=>c.done).length}/${opening.checklist.length} done`, '#/cafe', 'warn'));
  if (p.id === 'p_rina') {
    const od = overdueTeamTasks(p);
    if (od.length) items.push(attItem('warn', `${od.length} overdue in your Teams`, 'Retail Ops · Gordi HQ + Radiant', '#/work/tasks?view=overdue', 'overdue'));
  }
  overdue.forEach(t => items.push(attItem('check', t.title, `Overdue · due ${esc(t.due)}`, recordHref(t.id), 'overdue')));

  const brief = `
    <section class="section">
      <div class="e7-page-head"><div><h1>Needs attention</h1><p class="muted-2">${esc(p.name)} · ${esc(teams[p.primaryTeamId]?.name)}</p></div></div>
      <div class="stack">${items.length ? items.join('') : `<div class="callout">Nothing needs your attention right now.</div>`}</div>
    </section>`;

  const composer = state.composer.open ? sigComposer(p) :
    `<button class="row-item" data-compose aria-label="Share a Signal">${ico('spark')}<div class="body"><span class="t">Share a Signal</span><span class="s">Post what just happened for your Team</span></div>${ico('chevr')}</button>`;
  const feedHtml = feed.length ? feed.map(s => sigCard(s, p)).join('') : `<div class="callout">No Signals yet. Share the first one above.</div>`;
  return `${brief}
    <section class="section">
      <div class="e7-page-head"><div><h1>Signals</h1><p class="muted-2">Ambient feed for ${esc(teams[p.primaryTeamId]?.name)} · visibility follows the Team layer</p></div></div>
      <div class="stack">${composer}${feedHtml}</div>
    </section>`;
}
function attItem(icon, title, meta, href, tone) {
  return `<a class="row-item" href="${href}">${ico(icon)}<div class="body"><span class="t">${esc(title)}</span><span class="s">${meta}</span></div><span class="pill ${tone==='overdue'?'overdue':'warn'}">${tone==='overdue'?'Overdue':'Due'}</span>${ico('chevr')}</a>`;
}

/* F1: FB-style Signal composer (capture-first; Rule 8 / audit item 1). */
function sigComposer(p) {
  const c = state.composer;
  const team = teams[c.teamId];
  const site = teamSite(c.teamId);
  const attRaised = c.attention !== 'FYI';
  return `
  <div class="card" data-composer-root>
    <div class="card-head"><h3>Share a Signal</h3><span class="actions"><button class="btn btn-ico btn-sm btn-ghost" data-compose-close aria-label="Close composer">${ico('x')}</button></span></div>
    <div class="card-body composer">
      <div style="position:relative">
        <textarea class="sig-body" id="sig-body" placeholder="What happened? Type @ to mention a person, team, or BU." data-sig-body>${esc(c.body)}</textarea>
        <div id="mention-pop-mount"></div>
      </div>
      <div class="composer-pills">
        <span class="composer-pill" data-loc title="Location derives from the owning Team (Site is never a mention target)">${ico('pin')}${esc(site?.name || team?.name)}</span>
        <span class="composer-pill" data-occ>${ico('clock')}${esc(c.occurred || 'just now')}</span>
        <span class="composer-pill ${attRaised?'raised':''}" data-att>${ico('warn')}${esc(c.attention)}</span>
      </div>
      <div class="composer-team">Owning Team: <b>${esc(team?.name)}</b> · Author: <b>${esc(p.name)}</b> (implicit)</div>
      <div class="composer-vis">${ico('shield')}<span id="vis-line">${visibilityLine(c)}</span></div>
      <div class="composer-foot">
        <button class="evidence-ico" data-evidence aria-label="Attach photo or evidence">${ico('cam')}<span class="sr-only">Attach evidence</span></button>
        <span class="muted-2" style="font-size:11px">Category is added after posting — it never blocks capture.</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-sig-post>${ico('send')}Share Signal</button>
      </div>
      <div id="att-pop-mount"></div>
    </div>
  </div>`;
}
function visibilityLine(c) {
  const team = teams[c.teamId];
  let notify = 0;
  (c.mentions||[]).forEach(m => { notify += m.kind==='person'?1:m.kind==='team'?teamMemberCount(m.ref):m.kind==='bu'?buMemberCount(m.ref):0; });
  return `Visible to ${esc(team?.name)}${notify?` · notify ${notify}`:''}`;
}

/* Posted Signal card — FB grammar; "Create Task" lives here, not in the composer. */
function sigCard(s, p) {
  if (s.retracted) return `<div class="signal-card"><div class="rev-tomb">This Signal was retracted. ${esc(s.retractReason||'')}</div></div>`;
  const body = renderMentions(s.body, s.mentions||[]);
  const site = teamSite(s.owningTeamId);
  const occ = s.occurredAt ? String(s.occurredAt).replace(/^2026-07-\d+\s*/,'') : '';
  const vis = visibilityLine({ teamId: s.owningTeamId, mentions: s.mentions });
  const cat = s.category ? `<span class="pill neutral">${esc(s.category)}</span>` :
    `<button class="enrich-link" data-enrich="${esc(s.id)}">${ico('plus')}Add category</button>`;
  return `
  <div class="signal-card" data-sig="${esc(s.id)}">
    <div class="signal-head">
      <span class="e7-avatar">${esc(initials(s.authorId))}</span>
      <span class="who">${esc(personName(s.authorId))}</span>
      <span class="when">${esc(s.justNow?'just now':(occ||s.occurredAt||''))}</span>
      <span class="actions"><span class="pill ${s.attention==='Urgent'?'blocked':s.attention==='Needs attention'?'warn':'neutral'}">${esc(s.attention)}</span></span>
    </div>
    <div class="signal-body">${body}</div>
    <div class="signal-meta">
      <span class="loc-pill">${ico('pin')}${esc(site?.name||teamName(s.owningTeamId))}</span>
      <span class="loc-pill">${ico('clock')}${esc(occ||s.occurredAt)}</span>
    </div>
    <div class="signal-vis">${ico('shield')}<span>${vis}</span></div>
    <div class="signal-actions">${cat}<span class="spacer"></span><button class="btn btn-sm btn-outline" data-followup="${esc(s.id)}">${ico('plus')}Create Task</button></div>
  </div>`;
}
function renderMentions(body, mentions) {
  let out = esc(body);
  (mentions||[]).forEach(m => {
    const name = m.kind==='team'?teams[m.ref]?.name:m.kind==='bu'?bus[m.ref]?.name:people[m.ref]?.name;
    if (name) out = out.replace(new RegExp(`@${escapeReg(name)}`,'g'), `<span class="mention-chip">@${esc(name)}</span>`);
  });
  return out;
}
const escapeReg = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/* F2: Café module — occurrence caption + Start (occurrences ARE tasks). */
function viewCafe(p) {
  const occ = db.occ_cafe_open_today;
  const done = occ.checklist.filter(c => c.done).length;
  const total = occ.checklist.length;
  const started = occ.status !== 'Open';
  return `
    <div class="e7-page-head"><div><h1>Café</h1><p class="muted-2">${esc(teams[p.primaryTeamId]?.name)} · ${esc(teamSite(p.primaryTeamId)?.name||'')}</p></div></div>
    <div class="cafe-grid">
      <div class="cafe-area">
        <div class="area-h">${ico('cafe')}<span class="t">Café opening — today</span></div>
        <div class="occ-rollup ${done===total?'done':''}"><span class="bar-mini"><span style="width:${Math.round(done/total*100)}%"></span></span>${done}/${total} done</div>
        <div class="prov-line">${ico('user')}<span><b>PIC:</b> ${esc(personName(occ.picId))} — via <b>${esc(occ.picFunction.label)}</b> (Café HQ)</span></div>
        ${started ? `<span class="pill ${occ.status==='Done'?'done':'progress'}">${esc(occ.status)}</span>` : `<p class="muted-2" style="font-size:12.5px">Single-operator opening checklist — one task with checks inside, not ${total} task rows.</p>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${occ.status==='Done'
            ? `<span class="inline-ok">${ico('check')}Opening complete</span>`
            : `<button class="btn btn-primary" data-open-occ>${ico('check')}${started?'Resume opening':`Start today's opening`}</button>`}
          <a class="btn btn-outline" href="${recordHref(occ.id)}">${ico('chevr')}Open record</a>
        </div>
      </div>
      <div class="cafe-area">
        <div class="area-h">${ico('list')}<span class="t">Other floor work</span></div>
        <p class="muted-2" style="font-size:12.5px">Stock count, shift handover, and closing checks arrive as their own occurrences — all surface as tasks here, never as a "Process Run".</p>
        <span class="basis-chip">Not scheduled today</span>
      </div>
    </div>`;
}

/* F3: Work — owner-frame children (Signals · Tasks · Projects & Processes ·
   Objectives). Tasks carries the saved views (all/mine/team/overdue/followups)
   as ?view= query params (Rule 4): My/Team/Overdue are saved-view chips, not
   rail roots. */
function viewWork(p, parsed) {
  const child = parsed.path[1] || 'tasks';
  if (child === 'signals') return workMobileSwitcher(child, parsed) + viewSignals(p, parsed);
  if (child === 'projects') return workMobileSwitcher(child, parsed) + viewProjects(p, parsed);
  if (child === 'objectives') return workMobileSwitcher(child, parsed) + viewObjectives(p, parsed);
  return workMobileSwitcher(child, parsed) + viewTasks(p, parsed);
}

/* Phone-only collection + saved-view switcher (one affordance — Rule 8).
   Hidden on desktop via .mobile-viewbar { display:none }. */
function workMobileSwitcher(child, parsed) {
  const childLabel = { signals:'Signals', tasks:'Tasks', projects:'Projects & Processes', objectives:'Objectives' }[child] || 'Tasks';
  const childOpts = [
    { id:'signals', label:'Signals' }, { id:'tasks', label:'Tasks' },
    { id:'projects', label:'Projects & Processes' }, { id:'objectives', label:'Objectives' },
  ];
  let viewLabel = '', viewTabsHtml = '';
  if (child === 'tasks') {
    const view = parsed.query.view || 'all';
    const views = workViews.tasks;
    viewLabel = (views.find(v => v.id === view) || views[0]).label;
    viewTabsHtml = `<div><div class="overline" style="margin:10px 0 8px">Saved view</div><div class="view-tabs">${views.map(v => `<a class="view-tab ${view===v.id?'active':''}" href="#/work/tasks?view=${v.id}">${esc(v.label)}</a>`).join('')}</div></div>`;
  }
  const curView = child === 'tasks' ? (parsed.query.view || 'all') : 'all';
  const collectionHtml = `<div><div class="overline" style="margin:0 0 8px">Collection</div><div class="view-tabs">${childOpts.map(o => `<a class="view-tab ${child===o.id?'active':''}" href="#/work/${o.id}${o.id==='tasks'?`?view=${curView}`:''}">${esc(o.label)}</a>`).join('')}</div></div>`;
  const bar = `<div class="mobile-viewbar"><button class="btn btn-outline" type="button" data-mobile-view aria-haspopup="dialog" aria-expanded="${state.mobileViewMenuOpen}">${ico('list')}<span>View options · ${esc(childLabel)}${viewLabel?` · ${esc(viewLabel)}`:''}</span></button></div>`;
  const sheet = state.mobileViewMenuOpen ? `
    <div class="mobile-viewsheet" role="dialog" aria-label="Work view options">
      <div class="card">
        <div class="card-head"><h3>View options</h3><span class="actions"><button class="btn btn-ico btn-sm btn-ghost" type="button" data-mobile-view-close aria-label="Close">${ico('x')}</button></span></div>
        <div class="card-body stack">${collectionHtml}${viewTabsHtml}</div>
      </div>
    </div>` : '';
  return bar + sheet;
}

/* Work → Signals: the archive/search surface (Rule 1 job, Rule 4 canonical route). */
function viewSignals(p, parsed) {
  return `
    <div class="e7-page-head"><div><h1>Signals</h1><p class="muted-2">Search and revisit the Signals your Teams have shared.</p></div></div>
    <div class="searchbar">${ico('search')}<input id="signals-search" placeholder="Search Signals by text, author, team…" value="${esc(state.signalsQuery||'')}" data-signals-search aria-label="Search Signals" /></div>
    <div id="signals-list">${signalsListInner(p)}</div>`;
}
function signalsListInner(p) {
  const q = (state.signalsQuery || '').trim().toLowerCase();
  const all = Object.values(db).filter(r => r.type === 'signal');
  const rows = q ? all.filter(s => `${s.title} ${s.body||''} ${personName(s.authorId)} ${teamName(s.owningTeamId)}`.toLowerCase().includes(q)) : all;
  if (!rows.length) return `<div class="callout">No Signals match “${esc(q)}”.</div>`;
  return `<div class="stack">${rows.map(signalArchiveRow).join('')}</div>`;
}
function signalArchiveRow(s) {
  if (s.retracted) return `<div class="row-item" style="cursor:default;opacity:.6">${ico('spark')}<div class="body"><span class="t">Retracted Signal</span><span class="s">${esc(s.retractReason||'')}</span></div></div>`;
  const site = teamSite(s.owningTeamId);
  const occ = s.occurredAt ? String(s.occurredAt).replace(/^2026-07-\d+\s*/,'') : '';
  return `<a class="row-item" href="${recordHref(s.id)}" data-canonical="${recordHref(s.id)}">${ico('spark')}<div class="body"><span class="t">${esc(s.title)}</span><span class="s">${esc(personName(s.authorId))} · ${esc(teamName(s.owningTeamId))}${site?` · ${esc(site.name)}`:''}${occ?` · ${esc(occ)}`:''}</span></div><span class="pill ${s.attention==='Urgent'?'blocked':s.attention==='Needs attention'?'warn':'neutral'}">${esc(s.attention)}</span>${ico('chevr')}</a>`;
}

/* Work → Tasks: the collection; My/Team/Overdue/Follow-ups are saved-view chips. */
function viewTasks(p, parsed) {
  const view = parsed.query.view || 'all';
  const myTeams = [p.primaryTeamId, ...(p.additionalTeams||[])];
  let rows, scopeLabel;
  const taskRows = () => Object.values(db).filter(r => r.type === 'task' && !r.archivedAt);
  if (view === 'mine') { rows = taskRows().filter(r => r.picId === p.id); scopeLabel = 'Tasks you own'; }
  else if (view === 'team') { rows = taskRows().filter(r => myTeams.includes(r.teamId)); scopeLabel = `Work owned by ${myTeams.map(t=>teamName(t)).join(' · ')}`; }
  else if (view === 'overdue') { rows = taskRows().filter(r => myTeams.includes(r.teamId) && r.status!=='Done' && r.due && r.due < todayISO); scopeLabel = 'Overdue across your Teams'; }
  else if (view === 'followups') { rows = Object.values(db).filter(r => r.type==='followup' && myTeams.includes(r.teamId)); scopeLabel = 'Follow-ups in your Teams'; }
  else { rows = taskRows().filter(r => r.picId===p.id || myTeams.includes(r.teamId)); scopeLabel = `Your work + ${myTeams.map(t=>teamName(t)).join(' · ')}`; }

  const views = workViews.tasks;
  const tabs = views.map(v => `<a class="view-tab ${view===v.id?'active':''}" href="#/work/tasks?view=${v.id}">${esc(v.label)}</a>`).join('');
  const followupNote = view === 'followups'
    ? `<div class="callout info" style="margin-bottom:12px">Follow-ups also have a <a href="#/money">Money queue</a> entry for Finance settlement — they are a saved view, not a navigation noun.</div>` : '';
  const table = rows.length ? `
    <table class="data-table">
      <thead><tr><th>Work</th><th>Team</th><th>PIC</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>
      ${rows.map(r => {
        const href = `#/work/tasks?view=${view}&record=${r.id}`;
        const overdueTone = r.due && r.due < todayISO && r.status !== 'Done';
        const st = r.type === 'followup'
          ? `<span class="pill warn">${esc(r.lifecycle||'open')}</span>`
          : `<span class="pill ${r.status==='Done'?'done':r.status==='In Progress'?'progress':'open'}">${esc(r.status)}</span>`;
        return `<tr class="rowlink" data-record-href="${href}" data-canonical="${recordHref(r.id)}">
          <td data-label="Work"><div class="title-cell"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.classification||r.type)}</span></div></td>
          <td data-label="Team">${esc(teamName(r.teamId))}</td>
          <td data-label="PIC">${esc(personName(r.picId||r.ownerChaseId))}</td>
          <td data-label="Due" style="${overdueTone?'color:var(--e7-blocked-text);font-weight:600':''}">${esc(r.due||'—')}</td>
          <td data-label="Status">${st}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>` : `<div class="callout">No work matches this view.</div>`;
  return `
    <div class="e7-page-head"><div><h1>Tasks</h1><p class="muted-2">${esc(scopeLabel)}</p></div></div>
    <div class="view-tabs work-desktop-tabs" style="margin-bottom:12px">${tabs}</div>
    ${followupNote}${table}`;
}

/* Work → Projects & Processes: governed definitions (thin list). */
function viewProjects(p, parsed) {
  const projects = Object.values(db).filter(r => r.type === 'project');
  const procs = Object.values(db).filter(r => r.type === 'process');
  const stds = Object.values(db).filter(r => r.type === 'standard');
  const card = (title, rows, empty) => `<div class="card"><div class="card-head"><h3>${title}</h3></div><div class="card-body"><div class="stack">${rows.length ? rows.join('') : `<span class="muted-2">${empty}</span>`}</div></div></div>`;
  const projRows = projects.map(r => `<a class="row-item" href="${recordHref(r.id)}" data-canonical="${recordHref(r.id)}">${ico('build')}<div class="body"><span class="t">${esc(r.title)}</span><span class="s">${esc(bus[r.buId]?.name)} · ${esc(r.lane)} · ${Math.round((r.progress||0)*100)}%</span></div>${ico('chevr')}</a>`);
  const procRows = procs.map(r => `<a class="row-item" href="${recordHref(r.id)}" data-canonical="${recordHref(r.id)}">${ico('build')}<div class="body"><span class="t">${esc(r.title)}</span><span class="s">v${r.version} · ${esc(r.status)} · ${esc((r.adoptedBy||[]).map(t=>teamName(t)).join(' · '))}</span></div>${ico('chevr')}</a>`);
  const stdRows = stds.map(r => `<a class="row-item" href="${recordHref(r.id)}" data-canonical="${recordHref(r.id)}">${ico('shield')}<div class="body"><span class="t">${esc(r.title)}</span><span class="s">v${r.publishedVersion} · ${esc(bus[r.buId]?.name)}</span></div>${ico('chevr')}</a>`);
  return `
    <div class="e7-page-head"><div><h1>Projects & Processes</h1><p class="muted-2">Govern the definitions that generate the work — Projects, Processes, Standards.</p></div></div>
    <div class="stack">${card('Projects', projRows, 'No Projects.')}${card('Processes', procRows, 'No Processes.')}${card('Standards', stdRows, 'No Standards.')}</div>`;
}

/* Work → Objectives: thin definition list. */
function viewObjectives(p, parsed) {
  const objs = Object.values(db).filter(r => r.type === 'objective');
  return `
    <div class="e7-page-head"><div><h1>Objectives</h1><p class="muted-2">Track the Objectives the org committed to.</p></div></div>
    <div class="stack">
      ${objs.length ? objs.map(r => `<a class="row-item" href="${recordHref(r.id)}" data-canonical="${recordHref(r.id)}">${ico('pin')}<div class="body"><span class="t">${esc(r.title)}</span><span class="s">${esc(bus[r.buId]?.name)} · ${esc(r.lane)} · target: ${esc(r.target||'—')}</span></div><span class="pill neutral">${Math.round((r.progress||0)*100)}%</span>${ico('chevr')}</a>`).join('') : '<div class="callout">No Objectives yet.</div>'}
    </div>`;
}

/* Events destination (owner frame): stub with its Rule-1 job sentence. */
function viewEvents(p) {
  return `<div class="e7-page-head"><div><h1>Events</h1><p class="muted-2">See what’s happening around our outlets and when.</p></div></div>
    <div class="slice-stub"><span class="pill neutral">Not in this slice</span><p>The Events calendar surfaces scheduled occurrences, shifts, and outlet events across Retail and B2B Ops. It ships as a collection + view renderer inside this shell — no new rail root or anatomy (Rule 10).</p></div>`;
}
function viewStub(route, blurb) {
  const job = jobSentences[route] || '';
  return `<div class="e7-page-head"><div><h1>${esc(route[0].toUpperCase()+route.slice(1))}</h1><p class="muted-2">${esc(job)}</p></div></div>
    <div class="slice-stub"><span class="pill neutral">Not in this slice</span><p>${esc(blurb)}</p></div>`;
}
function overdueTeamTasks(p) {
  const ids = [p.primaryTeamId, ...(p.additionalTeams||[])];
  return Object.values(db).filter(r => r.type==='task' && ids.includes(r.teamId) && r.status!=='Done' && r.due && r.due < todayISO);
}

/* ════════════════════════════════════════════════════════════════════════════
   REGION 4 — record drawer (panel via &record= ; full page via #/record/<id>)
   ════════════════════════════════════════════════════════════════════════════ */
function renderRegion4(parsed, p) {
  const host = $('#panel-host'); const content = $('#content');
  if (parsed.route === 'record') {
    const id = parsed.path[1];
    host.classList.remove('open'); host.innerHTML = '';
    if (content) content.innerHTML = `<div class="e7-record e7-record--page">${recordBody(id, p, 'page')}</div>`;
    return;
  }
  const rid = parsed.query.record;
  if (rid && db[rid]) {
    host.classList.add('open');
    host.innerHTML = panelShell(rid, p);
  } else {
    host.classList.remove('open'); host.innerHTML = '';
  }
}
function panelShell(id, p) {
  const rec = db[id];
  return `
    <div class="e7-panel-bar">
      <button class="btn btn-ico btn-sm btn-ghost" data-panel-back aria-label="Back">${ico('back')}</button>
      <span class="e7-panel-title">${esc(typeName(rec.type))}</span>
      <a class="btn btn-ico btn-sm btn-ghost" href="${recordHref(id)}" data-open-page aria-label="Open full page" title="Open full page">${ico('external')}</a>
      <button class="btn btn-ico btn-sm btn-ghost" data-panel-close aria-label="Close">${ico('x')}</button>
    </div>
    <div class="e7-panel-content"><div class="e7-record">${recordBody(id, p, 'panel')}</div></div>`;
}
function sourceBackHref() {
  const parsed = parseHash();
  const q = Object.assign({}, parsed.query); delete q.record;
  const qs = Object.keys(q).length ? '?' + Object.entries(q).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&') : '';
  return `#/${parsed.path.join('/')}${qs}`;
}
function typeName(t){ return ({task:'Task',signal:'Signal',followup:'Follow-up',process:'Process',standard:'Standard',objective:'Objective',project:'Project',run:'Occurrence'})[t]||'Record'; }

function recordBody(id, p, mode) {
  const r = db[id];
  if (!r) return `<div class="empty-state">${ico('warn')}<h3>Record not found</h3></div>`;
  if (r.type === 'task') return taskRecord(r, p, mode);
  if (r.type === 'signal') return sigRecord(r, p, mode);
  if (r.type === 'followup') return followupRecord(r, p, mode);
  if (r.type === 'process') return defRecord(r, p, mode, 'Process');
  if (r.type === 'standard') return defRecord(r, p, mode, 'Standard');
  if (r.type === 'project') return projectRecord(r, p, mode);
  if (r.type === 'objective') return objectiveRecord(r, p, mode);
  return `<div class="e7-rec-head"><div><div class="e7-rec-type">${esc(typeName(r.type))}</div><div class="e7-rec-title">${esc(r.title||id)}</div></div></div>`;
}

/* Project definition (thin RACI + linked work). */
function projectRecord(r, p, mode) {
  const pct = Math.round((r.progress||0)*100);
  const linked = (r.links||[]).map(id => db[id]).filter(Boolean);
  return `
    <div class="e7-rec-head"><div><div class="e7-rec-type">Project · ${esc(r.lane||'')}</div><div class="e7-rec-title">${esc(r.title)}</div></div><div class="actions"><span class="pill neutral">${pct}%</span></div></div>
    <div class="e7-rec-body">
      <div class="kv">
        <dt>BU</dt><dd>${esc(bus[r.buId]?.name)}</dd>
        <dt>Accountable</dt><dd>${esc(personName(r.accountableId))}</dd>
        <dt>Responsible</dt><dd>${esc(personName(r.responsibleId))}</dd>
        <dt>Due</dt><dd>${esc(r.due||'—')}</dd>
      </div>
      <div class="e7-rec-section"><h4>Linked work</h4><div class="e7-rel-list">
        ${linked.length ? linked.map(x=>`<a class="e7-relation" href="${recordHref(x.id)}" data-canonical="${recordHref(x.id)}"><span class="dot"></span><span class="t">${esc(x.title)}</span><span class="s">${esc(typeName(x.type))}</span></a>`).join('') : '<span class="muted-2" style="font-size:12px">No linked work.</span>'}
      </div></div>
    </div>`;
}

/* Objective definition (thin RACI + target). */
function objectiveRecord(r, p, mode) {
  const pct = Math.round((r.progress||0)*100);
  return `
    <div class="e7-rec-head"><div><div class="e7-rec-type">Objective · ${esc(r.lane||'')}</div><div class="e7-rec-title">${esc(r.title)}</div></div><div class="actions"><span class="pill neutral">${pct}%</span></div></div>
    <div class="e7-rec-body">
      <div class="kv">
        <dt>BU</dt><dd>${esc(bus[r.buId]?.name)}</dd>
        <dt>Target</dt><dd>${esc(r.target||'—')}</dd>
        <dt>Accountable</dt><dd>${esc(personName(r.accountableId))}</dd>
        <dt>Responsible</dt><dd>${esc(personName(r.responsibleId))}</dd>
      </div>
      <div class="occ-rollup" style="margin-top:8px"><span class="bar-mini"><span style="width:${pct}%"></span></span>${pct}% to target</div>
    </div>`;
}

/* Task record (F2 occurrence + F3 tasks). */
function taskRecord(r, p, mode) {
  const isOcc = !!r.checklist;
  const done = isOcc ? r.checklist.filter(c=>c.done).length : 0;
  const total = isOcc ? r.checklist.length : 0;
  const canEdit = can(p, 'task.edit', { teamId: r.teamId });
  const eligiblePic = Object.values(people).filter(x => [x.primaryTeamId,...(x.additionalTeams||[])].includes(r.teamId));
  const checklistHtml = isOcc ? `
    <div class="e7-rec-section">
      <h4>Opening checklist <span class="basis-chip" style="margin-left:6px">derived roll-up</span></h4>
      <div class="occ-rollup ${done===total?'done':''}" style="margin-bottom:8px"><span class="bar-mini"><span style="width:${Math.round(done/total*100)}%"></span></span>${done}/${total} done</div>
      <div class="checklist">
        ${r.checklist.map(c => `<div class="check-item ${c.done?'done':''}"><button class="check-box e7-check-toggle ${c.done?'pass':''}" data-check="${esc(c.id)}" aria-pressed="${c.done}" aria-label="${esc(c.label)}">${c.done?ico('check'):''}</button><span class="lbl">${esc(c.label)}</span></div>`).join('')}
      </div>
    </div>` : '';
  const provHtml = r.picFunction ? `<div class="prov-line" style="margin-bottom:8px">${ico('user')}<span><b>PIC:</b> ${esc(personName(r.picId))} — via <b>${esc(r.picFunction.label)}</b> (Café HQ)</span></div>` : '';
  const actionsHtml = `
    <div class="e7-panel-foot" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${(canEdit && !isOcc) ? `<label class="chip" style="gap:6px">Reassign PIC <select data-reassign style="border:none;background:transparent;font:inherit;color:inherit;outline:none">${eligiblePic.map(x=>`<option value="${esc(x.id)}" ${x.id===r.picId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      ${(canEdit && !isOcc && r.status!=='Done') ? `<button class="btn btn-primary" data-complete>${ico('check')}Mark complete</button>` : ''}
      ${(canEdit && isOcc && r.status!=='Done' && done===total) ? `<button class="btn btn-primary" data-complete>${ico('check')}Mark opening complete</button>` : ''}
      ${(isOcc && r.status!=='Done' && done<total) ? `<span class="muted-2" style="font-size:11px">Finish all ${total} checks to complete this opening.</span>` : ''}
      ${r.status==='Done' ? `<span class="inline-ok">${ico('check')}Completed</span>` : ''}
      <span class="spacer"></span>
      <span class="muted-2" style="font-size:11px" id="task-feedback"></span>
    </div>`;
  return `
    <div class="e7-rec-head">
      <div><div class="e7-rec-type">Task · ${esc(r.classification||'Ad hoc')}</div><div class="e7-rec-title">${esc(r.title)}</div></div>
      <div class="actions"><span class="pill ${r.status==='Done'?'done':r.status==='In Progress'?'progress':'open'}">${esc(r.status)}</span></div>
    </div>
    <div class="e7-rec-body">
      ${provHtml}
      <div class="kv">
        <dt>PIC</dt><dd>${esc(personName(r.picId))}</dd>
        <dt>Supervisor</dt><dd>${esc(personName(r.supervisorId))}</dd>
        <dt>Team</dt><dd>${esc(teamName(r.teamId))} · ${esc(bus[teams[r.teamId]?.buId]?.name)}</dd>
        <dt>Due</dt><dd>${esc(r.due||'—')}</dd>
      </div>
      ${r.description ? `<p class="muted" style="font-size:13px">${esc(r.description)}</p>` : ''}
      ${checklistHtml}
    </div>
    ${actionsHtml}`;
}

/* Signal record (F1 source-of-truth). */
function sigRecord(s, p, mode) {
  const body = renderMentions(s.body, s.mentions||[]);
  const site = teamSite(s.owningTeamId);
  return `
    <div class="e7-rec-head"><div><div class="e7-rec-type">Signal · ${esc(s.attention)}</div><div class="e7-rec-title">${esc(s.title)}</div></div></div>
    <div class="e7-rec-body">
      <div class="signal-body">${body}</div>
      <div class="kv">
        <dt>Author</dt><dd>${esc(personName(s.authorId))}</dd>
        <dt>Team</dt><dd>${esc(teamName(s.owningTeamId))}</dd>
        <dt>Occurred</dt><dd>${esc(s.occurredAt)} ${site?`· ${esc(site.name)}`:''}</dd>
      </div>
      <div class="signal-vis">${ico('shield')}<span>${visibilityLine({teamId:s.owningTeamId,mentions:s.mentions})}</span></div>
      <div class="e7-rec-section"><h4>Linked work</h4><div class="e7-rel-list">
        ${(s.linkedWork||[]).length ? s.linkedWork.map(w=>{const x=db[w.id];return x?`<a class="e7-relation" href="${recordHref(x.id)}" data-canonical="${recordHref(x.id)}"><span class="dot"></span><span class="t">${esc(x.title)}</span><span class="s">${esc(typeName(x.type))}</span></a>`:'';}).join('') : '<span class="muted-2" style="font-size:12px">No linked work yet.</span>'}
      </div></div>
      <div class="signal-actions"><button class="btn btn-sm btn-outline" data-followup="${esc(s.id)}">${ico('plus')}Create Task</button></div>
    </div>`;
}

/* Follow-up record. */
function followupRecord(r, p, mode) {
  const fmt = n => 'Rp ' + Number(n).toLocaleString('en-US');
  return `
    <div class="e7-rec-head"><div><div class="e7-rec-type">Follow-up · ${esc(r.lifecycle)}</div><div class="e7-rec-title">${esc(r.title)}</div></div></div>
    <div class="e7-rec-body">
      <div class="kv">
        <dt>Counterparty</dt><dd>${esc(r.counterparty)}</dd>
        <dt>Balance</dt><dd class="tabular">${fmt(r.balance)} <span class="muted-2">of ${fmt(r.amount)}</span></dd>
        <dt>Age</dt><dd>${esc(r.ageDays)} days</dd>
        <dt>Chase owner</dt><dd>${esc(personName(r.ownerChaseId))}</dd>
      </div>
      <div class="callout warn"><b>Settlement requires:</b> ${esc((r.settleRequires||[]).join(' · '))} — no settle-without-evidence path (A9).</div>
      <div class="e7-rec-section"><h4>History</h4><div class="stack">
        ${(r.history||[]).map(h=>`<div class="row-item" style="cursor:default"><div class="body"><span class="t">${esc(h.event)}</span><span class="s">${esc(h.at)} · ${esc(personName(h.by))}</span></div></div>`).join('')}
      </div></div>
    </div>`;
}

/* Process / Standard definition. */
function defRecord(r, p, mode, label) {
  return `
    <div class="e7-rec-head"><div><div class="e7-rec-type">${label} · v${r.version}</div><div class="e7-rec-title">${esc(r.title)}</div></div><div class="actions"><span class="pill neutral">${esc(r.status||'Published')}</span></div></div>
    <div class="e7-rec-body">
      <div class="kv">
        <dt>BU</dt><dd>${esc(bus[r.buId]?.name)}</dd>
        <dt>Cadence</dt><dd>${esc(r.cadence||'—')}</dd>
        ${r.adoptedBy?`<dt>Adopted by</dt><dd>${esc(r.adoptedBy.map(t=>teamName(t)).join(' · '))}</dd>`:''}
      </div>
      <div class="e7-rec-section"><h4>Generated work structure</h4><div class="stack">
        ${(r.generatedTaskDefs||[]).map(d=>`<div class="row-item" style="cursor:default">${ico('check')}<div class="body"><span class="t">${esc(d.title)}</span><span class="s">owner: ${esc(d.own||'operator')}${d.checkable?' · checkable':''}${d.form?' · form':''}</span></div></div>`).join('')}
      </div></div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION LAUNCHER — stable universal + ≤1 contextual (Rule 7)
   ════════════════════════════════════════════════════════════════════════════ */
function launcherActions(p, parsed) {
  const ctx = parsed.route === 'cafe' && db.occ_cafe_open_today?.status !== 'Done'
    ? [{ id:'start-opening', label:`Start today's opening`, icon:'cafe', hint:'Café', contextual:true, act:()=>{ if (db.occ_cafe_open_today.status === 'Open') db.occ_cafe_open_today.status = 'In Progress'; savePersisted(); closeLauncher(); go('#/work/tasks?view=team&record=occ_cafe_open_today'); } }]
    : [];
  /* Owner frame: universal actions are Ask Deputy · Share Signal · Create Task
     (stable order — Rule 7 forbids reordering them), plus ≤1 contextual. */
  return [
    { id:'deputy', label:'Ask Deputy', icon:'spark', act:()=>openDeputy() },
    { id:'signal', label:'Share Signal', icon:'send', act:()=>{ closeLauncher(); go('#/home'); setTimeout(()=>{state.composer.open=true; render(); setTimeout(()=>$('#sig-body')?.focus(),30);},40); } },
    { id:'task', label:'Create Task', icon:'check', act:()=>createAdHocTask(p) },
    ...ctx,
  ];
}
function closeLauncher() { state.launcherOpen = false; const h = $('#modal-host'); if (h) h.innerHTML = ''; }
function mountLauncher() {
  const parsed = parseHash(); const p = person(); const host = $('#modal-host'); if (!host) return;
  const actions = launcherActions(p, parsed);
  const contextual = actions.filter(a => a.contextual);
  const universal = actions.filter(a => !a.contextual);
  host.innerHTML = `
    <div class="e7-modal-scrim" data-close-launcher></div>
    <div class="e7-modal sheet" role="dialog" aria-label="Command palette" aria-modal="true">
      <div class="cmdk-input-wrap">${ico('search')}<input class="cmdk-input" id="cmdk-input" placeholder="Search or type a command…" aria-label="Search actions" autocomplete="off" /><button class="btn btn-ico btn-sm btn-ghost" type="button" data-close-launcher aria-label="Close">${ico('x')}</button></div>
      <div class="cmdk-list" id="cmdk-list"></div>
    </div>`;
  renderCmdkList('', universal, contextual);
  $$('[data-close-launcher]', host).forEach(el => el.addEventListener('click', closeLauncher));
  $('#cmdk-input')?.addEventListener('input', e => renderCmdkList(e.target.value, contextual, universal));
  $('#cmdk-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const first = $('#cmdk-list [data-launch]'); if (first) first.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLauncher(); }
  });
  const input = $('#cmdk-input'); if (input) { input.focus(); requestAnimationFrame(() => input.focus()); }
}
function renderCmdkList(q, contextual, universal) {
  const list = $('#cmdk-list'); if (!list) return;
  const ql = String(q || '').trim().toLowerCase();
  const match = a => !ql || a.label.toLowerCase().includes(ql);
  const ctxHits = contextual.filter(match);
  const uniHits = universal.filter(match);
  if (!ctxHits.length && !uniHits.length) { list.innerHTML = `<div class="cmdk-empty">No matching actions.</div>`; return; }
  const section = (head, rows) => rows.length ? `<div class="cmdk-section"><div class="overline cmdk-section-h">${head}</div>${rows.map(a => `<button class="cmd-row" type="button" data-launch="${esc(a.id)}">${ico(a.icon)}<span class="t">${esc(a.label)}</span>${a.hint?`<span class="hint">${esc(a.hint)}</span>`:''}</button>`).join('')}</div>` : '';
  list.innerHTML = section('This screen', ctxHits) + section('Actions', uniHits);
  list.querySelectorAll('[data-launch]').forEach(el => el.addEventListener('click', () => {
    const action = launcherActions(person(), parseHash()).find(x => x.id === el.getAttribute('data-launch'));
    if (action) action.act();
  }));
}
function openDeputy() {
  state.launcherOpen = false; state.deputy.open = true;
  const p = person();
  const od = overdueTeamTasks(p);
  const reply = od.length ? `You have ${od.length} overdue item(s) in Team work — oldest "${od[0].title}" (due ${od[0].due}). Open Work → Tasks → Overdue.` : `No overdue Team work. You're clear.`;
  state.deputy.msgs = [{ who:'bot', text:reply, src:'Source · Tasks' }];
  render();
}
function mountDeputy() {
  const host = $('#panel-host'); if (!host) return;
  host.classList.add('open');
  host.innerHTML = `
    <div class="e7-panel-bar">${ico('spark')}<span class="e7-panel-title">Deputy</span><span class="e7-panel-sub">runs as ${esc(person().name)}</span><button class="btn btn-ico btn-sm btn-ghost" data-deputy-close aria-label="Close">${ico('x')}</button></div>
    <div class="e7-panel-content" style="padding:12px;display:flex;flex-direction:column;gap:8px">
      ${state.deputy.msgs.map(m=>`<div class="deputy-msg ${m.who}">${esc(m.text)}${m.src?`<div class="src">${ico('spark')}<span style="margin-left:4px">${esc(m.src)}</span></div>`:''}</div>`).join('')}
    </div>
    <div class="e7-panel-foot"><input class="field" id="deputy-input" placeholder="Ask the deputy…" /><button class="btn btn-primary btn-sm" data-deputy-ask>${ico('send')}</button></div>`;
}
function createAdHocTask(p) {
  state.launcherOpen = false;
  const title = window.prompt('Task title:','');
  if (!title) { render(); return; }
  const id = 't_adhoc_' + Math.random().toString(36).slice(2,7);
  db[id] = { id, type:'task', title, teamId:p.primaryTeamId, picId:p.id, supervisorId:p.id, status:'Open', due:'', classification:'Ad hoc', comments:[] };
  savePersisted();
  go(`#/work/tasks?view=mine&record=${id}`);
}

/* ════════════════════════════════════════════════════════════════════════════
   EVENT BINDING
   ════════════════════════════════════════════════════════════════════════════ */
function bindShell(parsed, p) {
  $('[data-persona]')?.addEventListener('click', e => { e.stopPropagation(); state.personaPopOpen = !state.personaPopOpen; mountPersonaPop(); });
  $$('[data-launcher]').forEach(el => el.addEventListener('click', () => { state.launcherOpen = true; mountLauncher(); }));
  $('[data-deputy-open]')?.addEventListener('click', () => openDeputy());
  $('[data-inbox]')?.addEventListener('click', () => go('#/inbox'));
  $$('[data-mobile-menu]').forEach(el => el.addEventListener('click', () => mountMobileMenu()));
}
function mountPersonaPop() {
  const mount = $('#persona-pop-mount'); if (!mount) return;
  if (!state.personaPopOpen) { mount.innerHTML = ''; return; }
  const opts = [{id:'p_ayu',why:'F1 Signal · F2 Café opening'},{id:'p_rina',why:'F3 overdue Team work'}];
  mount.innerHTML = `<div class="persona-pop">${opts.map(o=>{const x=people[o.id];return `<button class="persona-opt" data-pick="${esc(o.id)}" aria-current="${state.personId===o.id}"><span class="e7-avatar">${esc(x.initials)}</span><span><div class="nm">${esc(x.name)}</div><div class="rl">${esc(o.why)}</div></span></button>`;}).join('')}<div class="cmd-sep" style="margin:4px 0"></div><a class="persona-opt" href="#/profile">${ico('user')}<span><div class="nm">Personal Profile</div><div class="rl">Account &amp; home preferences</div></span></a></div>`;
  mount.querySelector('[data-pick]') && $$('[data-pick]', mount).forEach(b => b.addEventListener('click', () => { setPerson(b.getAttribute('data-pick')); }));
}
function setPerson(id) {
  state.personId = id; state.personaPopOpen = false;
  const parsed = parseHash();
  if (parsed.route === 'record') { const rec = db[parsed.path[1]]; if (rec && !canView(rec, person())) { savePersisted(); go('#/home'); return; } }
  if (parsed.route === 'money' && !can(person(),'money.view')) { savePersisted(); go('#/home'); return; }
  savePersisted();
  render();
}
function canView(rec, p) { if (!rec) return true; if (rec.type==='task') return [p.primaryTeamId,...(p.additionalTeams||[])].includes(rec.teamId)||rec.picId===p.id; return true; }
function mountMobileMenu() {
  const host = $('#modal-host'); if (!host) return;
  const p = person();
  const link = (href,label,icon) => `<a class="cmd-row" href="${href}">${ico(icon)}<span class="t">${esc(label)}</span></a>`;
  /* Reachability (Rule 9): every authorized rail entry not in the bottom nav
     is reachable here — Events, the Modules, Money (gated), Admin (gated),
     Profile, and the persona switch. Work children are reached via the in-page
     View-options switcher on the Work surface. */
  const rows = [
    link('#/events','Events','calendar'),
    link('#/ecommerce','Ecommerce','eco'),
    link('#/roastery','Roastery','roast'),
    ...(can(p,'money.view')?[link('#/money','Money','money')]:[]),
    `<div class="cmd-sep"></div>`,
    ...(can(p,'admin.view')?[link('#/admin','Admin Settings','shield')]:[]),
    link('#/profile','Personal Profile','user'),
    `<div class="cmd-sep"></div>`,
    `<button class="cmd-row" data-pick="p_ayu"><span style="width:17px">${ico('user')}</span><span class="t">View as Ayu</span></button>`,
    `<button class="cmd-row" data-pick="p_rina"><span style="width:17px">${ico('user')}</span><span class="t">View as Rina</span></button>`,
  ];
  host.innerHTML = `<div class="e7-modal-scrim" data-close-launcher></div><div class="e7-modal sheet" role="dialog" aria-modal="true"><div class="e7-modal-head"><h3>More</h3><button class="btn btn-ico btn-sm btn-ghost" data-close-launcher aria-label="Close">${ico('x')}</button></div><div class="e7-modal-body">${rows.join('')}</div></div>`;
  $$('[data-close-launcher]', host).forEach(el => el.addEventListener('click', () => { $('#modal-host').innerHTML = ''; }));
  $$('[data-pick]', host).forEach(el => el.addEventListener('click', () => setPerson(el.getAttribute('data-pick'))));
}

function afterPaint(parsed, p) {
  $$('[data-close-launcher]').forEach(el => el.addEventListener('click', () => { state.launcherOpen = false; state.mobileViewMenuOpen = false; $('#modal-host').innerHTML = ''; }));
  $$('[data-launch]').forEach(el => el.addEventListener('click', () => { const a = launcherActions(p, parsed).find(x=>x.id===el.getAttribute('data-launch')); if (a) a.act(); }));
  $$('[data-pick]').forEach(el => el.addEventListener('click', () => setPerson(el.getAttribute('data-pick'))));
  $('[data-deputy-close]')?.addEventListener('click', () => { state.deputy.open = false; render(); });
  $('[data-mobile-view]')?.addEventListener('click', () => { state.mobileViewMenuOpen = !state.mobileViewMenuOpen; render(); });
  $('[data-mobile-view-close]')?.addEventListener('click', () => { state.mobileViewMenuOpen = false; render(); });
  /* Work → Signals: filter the archive in-place (input keeps focus). */
  $('[data-signals-search]')?.addEventListener('input', e => {
    state.signalsQuery = e.target.value;
    const list = $('#signals-list'); if (list) list.innerHTML = signalsListInner(person());
  });
  $('[data-deputy-ask]')?.addEventListener('click', () => {
    const v = $('#deputy-input')?.value?.trim(); if (!v) return;
    state.deputy.msgs.push({who:'user',text:v});
    state.deputy.msgs.push({who:'bot',text:'In the full build I act on this under your authority. This slice proves the launcher + grounded reply grammar.',src:'Deputy (mocked)'});
    mountDeputy();
  });

  /* Composer (F1) */
  $('[data-compose]')?.addEventListener('click', () => { state.composer.open = true; savePersisted(); render(); requestAnimationFrame(()=>$('#sig-body')?.focus()); });
  $('[data-compose-close]')?.addEventListener('click', () => { state.composer.open = false; savePersisted(); render(); });
  $('[data-sig-body]')?.addEventListener('input', onSigInput);
  $('[data-sig-post]')?.addEventListener('click', postSignal);
  $('[data-att]')?.addEventListener('click', toggleAttPop);
  $('[data-evidence]')?.addEventListener('click', () => flash('evidence','Evidence attach — wired in the full build.'));
  $('[data-occ]')?.addEventListener('click', () => flash('occ','Occurrence time defaults to now; editor in the full build.'));

  /* Posted-card actions */
  $$('[data-followup]').forEach(el => el.addEventListener('click', e => { e.preventDefault?.();
    const sid = el.getAttribute('data-followup');
    const id = 't_fu_' + Math.random().toString(36).slice(2,7);
    db[id] = { id, type:'task', title:'Follow-up from Signal', teamId: db[sid]?.owningTeamId||'t_hq_ops', picId: p.id, supervisorId: p.id, status:'Open', classification:'Ad hoc', sourceSignal: sid, comments:[] };
    if (db[sid]) db[sid].linkedWork = uniqueBy((db[sid].linkedWork||[]).concat({id}), 'id');
    savePersisted();
    go(`#/work/tasks?view=mine&record=${id}`);
  }));
  $$('[data-enrich]').forEach(el => el.addEventListener('click', () => {
    const sid = el.getAttribute('data-enrich');
    const cat = window.prompt('Category (optional enrichment):', db[sid]?.category || 'Equipment/facility');
    if (cat && db[sid]) { db[sid].category = cat; savePersisted(); render(); }
  }));

  /* F2: open occurrence / toggle checks */
  $('[data-open-occ]')?.addEventListener('click', () => { const o = db.occ_cafe_open_today; if (o.status==='Open') o.status='In Progress'; savePersisted(); go('#/work/tasks?view=team&record=occ_cafe_open_today'); });
  $$('[data-check]').forEach(el => el.addEventListener('click', () => {
    const cid = el.getAttribute('data-check'); const o = db.occ_cafe_open_today;
    const item = o.checklist.find(c=>c.id===cid);
    if (item) { item.done = !item.done; if (o.checklist.every(c=>c.done)) o.status='Done'; else if (o.status==='Open') o.status='In Progress'; else if (!o.checklist.some(c=>c.done)) o.status='Open'; }
    savePersisted();
    render();
  }));

  /* F3: record rows → push &record= (D3a; new-tab uses canonical href) */
  $$('[data-record-href]').forEach(el => el.addEventListener('click', e => {
    if (e.metaKey||e.ctrlKey||e.button===1) return; e.preventDefault(); go(el.getAttribute('data-record-href'));
  }));
  $$('[data-canonical]').forEach(el => el.addEventListener('click', e => {
    if (el.hasAttribute('data-record-href')) return; /* rows are handled by the data-record-href listener */
    if (e.metaKey||e.ctrlKey||e.button===1) return; e.preventDefault();
    const href = el.getAttribute('href'); const parsed = parseHash();
    if (parsed.route==='work' && parsed.path[1]) {
      const id = href.split('/record/')[1];
      const q = {};
      if (parsed.path[1] === 'tasks') q.view = parsed.query.view || 'all';
      q.record = id;
      go(withQuery(`#/work/${parsed.path[1]}`, q));
    } else { go(href); }
  }));
  $$('[data-open-page]').forEach(el => el.addEventListener('click', e => {
    if (e.metaKey||e.ctrlKey||e.button===1) return;
    e.preventDefault();
    go(el.getAttribute('href'));
  }));
  $('[data-panel-back]')?.addEventListener('click', () => go(sourceBackHref()));
  $('[data-panel-close]')?.addEventListener('click', () => go(sourceBackHref()));

  /* F3: reassign / complete */
  $('[data-reassign]')?.addEventListener('change', e => {
    const parsed = parseHash(); const id = parsed.query.record || parsed.path[1];
    if (db[id]) { db[id].picId = e.target.value; savePersisted(); const f = $('#task-feedback'); if (f) { f.textContent = `Reassigned to ${personName(db[id].picId)}`; setTimeout(render, 400); } }
  });
  $('[data-complete]')?.addEventListener('click', () => {
    const parsed = parseHash(); const id = parsed.query.record || parsed.path[1];
    if (db[id]) { db[id].status = 'Done'; savePersisted(); const f = $('#task-feedback'); if (f) f.textContent = 'Completed'; setTimeout(render, 350); }
  });

  /* Close persona pop on outside click */
  document.addEventListener('click', closePersonaOnOutside, { once: true });
}
function closePersonaOnOutside(e) {
  if (state.personaPopOpen && !e.target.closest('[data-persona]') && !e.target.closest('.persona-pop')) {
    state.personaPopOpen = false; mountPersonaPop();
  } else if (state.personaPopOpen) {
    document.addEventListener('click', closePersonaOnOutside, { once: true });
  }
}

/* F1: @ mention fuzzy (grouped; Person/Team/BU only; BU capability-gated). */
function onSigInput(e) {
  state.composer.body = e.target.value;
  savePersisted();
  const { token, query, at } = currentMentionToken(e.target);
  const mount = $('#mention-pop-mount');
  if (!token) { closeMentionPop(); return; }
  const p = person(); const canBu = can(p,'signal.mention_bu');
  const peopleHits = fuzzyHits(Object.values(people).filter(x => x.id !== p.id), query, x => x.name, 5);
  const teamHits = fuzzyHits(Object.values(teams), query, t => t.name, 4);
  const buHits = canBu ? fuzzyHits(Object.values(bus), query, b => b.name, 3) : [];
  if (!peopleHits.length && !teamHits.length && !buHits.length) {
    mount.innerHTML = `<div class="mention-pop"><div class="mention-empty">No matches — Person/Team${canBu?'/BU':''} only. Site is a location pill, not a mention.</div></div>`; positionPop(mount); return;
  }
  const group = (head, rows) => rows.length ? `<div class="mention-group"><div class="mention-group-head">${head}</div>${rows.map(r=>`<div class="mention-row" data-mention="${esc(r.kind)}:${esc(r.ref)}:${esc(String(at))}"><span class="type-badge ${esc(r.kind)}">${esc(r.kind)}</span><span class="nm">${esc(r.name)}</span></div>`).join('')}</div>` : '';
  mount.innerHTML = `<div class="mention-pop">
    ${group('Person', peopleHits.map(x=>({kind:'person',ref:x.id,name:x.name})))}
    ${group('Team', teamHits.map(t=>({kind:'team',ref:t.id,name:t.name})))}
    ${group(canBu?'BU':'BU (capability-gated)', buHits.map(b=>({kind:'bu',ref:b.id,name:b.name})))}
  </div>`;
  positionPop(mount);
  mount.querySelectorAll('[data-mention]').forEach(row => row.addEventListener('mousedown', ev => { ev.preventDefault(); const parts = row.getAttribute('data-mention').split(':'); const atN = parseInt(parts[2],10); insertMention(parts[0], parts[1], atN); }));
}
function currentMentionToken(ta) {
  const pos = ta.selectionStart; const before = ta.value.slice(0,pos);
  const m = before.match(/(^|\s)@([^\s@]*)$/);
  if (!m) return {};
  const at = before.length - m[2].length - 1;
  return { token: m[0], query: m[2], at };
}
function positionPop(mount) {
  const pop = mount.querySelector('.mention-pop'); if (!pop) return;
  pop.style.left = '0px'; pop.style.top = '104px';
}
function insertMention(kind, ref, atIdx) {
  const ta = $('#sig-body'); if (!ta) return;
  const name = kind==='team'?teams[ref]?.name:kind==='bu'?bus[ref]?.name:people[ref]?.name;
  const before = ta.value.slice(0, atIdx);
  const after = ta.value.slice(atIdx).replace(/^@[^\s@]*/, '');
  ta.value = `${before}@${name} ${after}`;
  state.composer.body = ta.value;
  const mentions = (state.composer.mentions||[]).filter(m => !(m.kind===kind && m.ref===ref));
  mentions.push({ kind, ref, name });
  state.composer.mentions = mentions;
  savePersisted();
  closeMentionPop();
  const vis = $('#vis-line'); if (vis) vis.textContent = visibilityLine(state.composer);
  ta.focus();
  const pos = before.length + name.length + 2; ta.setSelectionRange(pos,pos);
}
function closeMentionPop() { const m = $('#mention-pop-mount'); if (m) m.innerHTML = ''; }
function toggleAttPop() {
  const mount = $('#att-pop-mount');
  if (mount.innerHTML.trim()) { mount.innerHTML = ''; return; }
  const opts = [{id:'FYI',desc:'default — ambient'},{id:'Needs attention',desc:'surface + suggest a task'},{id:'Urgent',desc:'may use doorbell'}];
  mount.innerHTML = `<div class="att-pop">${opts.map(o=>`<button class="att-row" data-att-set="${esc(o.id)}"><span class="pill ${o.id==='Urgent'?'blocked':o.id==='Needs attention'?'warn':'neutral'}">${esc(o.id)}</span><span class="desc">${esc(o.desc)}</span></button>`).join('')}</div>`;
  mount.querySelectorAll('[data-att-set]').forEach(r => r.addEventListener('click', () => { state.composer.attention = r.getAttribute('data-att-set'); savePersisted(); mount.innerHTML=''; render(); requestAnimationFrame(()=>$('#sig-body')?.focus()); }));
}

/* Post Signal (F1 commit). */
function postSignal() {
  const c = state.composer; const body = c.body.trim();
  if (!body) { $('#sig-body')?.focus(); return; }
  const id = 'sig_' + Math.random().toString(36).slice(2,7);
  const mentions = (c.mentions||[]).filter(m => body.includes(`@${m.name}`));
  const sig = { id, type:'signal', title:body.slice(0,56), owningTeamId:c.teamId, authorId:state.personId, occurredAt:c.occurred||nowLocal(), attention:c.attention, category:null, body, mentions, comments:[], acks:[], linkedWork:[], revisions:[], justNow:true };
  db[id] = sig; feed.unshift(sig);
  state.composer = defaultComposer();
  savePersisted();
  render();
  requestAnimationFrame(() => { const card = $(`[data-sig="${id}"]`); if (card) card.scrollIntoView({behavior:'smooth',block:'center'}); });
}

/* Helpers */
function uniqueBy(arr,key){const s=new Set();return arr.filter(x=>!s.has(x[key])&&s.add(x[key]));}
function flash(_id,msg){const f=$('#task-feedback');if(f){f.textContent=msg;return;}const n=document.createElement('div');n.className='callout info';n.textContent=msg;n.style.cssText='position:fixed;bottom:80px;right:16px;z-index:80;max-width:280px';document.body.appendChild(n);setTimeout(()=>n.remove(),2200);}

/* Boot — seed Home behind first load so Back never exits blank. */
function boot() {
  const seedKey = 'gordi-convergence-seeded';
  const firstLoad = !sessionStorage.getItem(seedKey);
  if (!location.hash || location.hash === '#/') {
    if (firstLoad) {
      history.replaceState({ e7seed:true }, '', '#/home');
      history.pushState({ e7seed:true, landing:true }, '', '#/home');
      sessionStorage.setItem(seedKey, '1');
    } else {
      location.replace('#/home');
    }
  } else if (firstLoad) {
    const cur = location.hash;
    history.replaceState({ e7seed:true }, '', '#/home');
    history.pushState({ e7seed:true, landing:true }, '', cur);
    sessionStorage.setItem(seedKey, '1');
  }
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('resize', () => render());
  document.addEventListener('keydown', e => {
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k') { e.preventDefault(); state.launcherOpen = true; mountLauncher(); }
    else if (e.key === 'Escape') {
      if (state.launcherOpen) { state.launcherOpen=false; $('#modal-host').innerHTML=''; }
      else if (state.mobileViewMenuOpen) { state.mobileViewMenuOpen=false; render(); }
      else if (state.composer.open) { state.composer.open=false; savePersisted(); render(); }
    }
  });
  savePersisted();
  /* Resolve a legacy Work route (#/work/mine|team|library) to its canonical
     owner-frame URL before first paint; the replace re-fires hashchange→render. */
  if (applyRedirectIfLegacy()) return;
  render();
}
function onHashChange() {
  if (applyRedirectIfLegacy()) return;            // location.replace → fires again
  state.launcherOpen = false; state.mobileViewMenuOpen = false; render();
}
function applyRedirectIfLegacy() {
  const parsed = parseHash();
  const target = legacyRedirect(parsed);
  if (target && target !== location.hash) { location.replace(target); return true; }
  /* Access guard: a destination hidden from this viewer (Money is fully
     capability-gated, not dotted) must not deep-link render — redirect home so
     exactly-one aria-current (Rule 5) holds on every reachable route. */
  if (parsed.route === 'money' && !can(person(), 'money.view')) { location.replace('#/home'); return true; }
  return false;
}
boot();
