/* ════════════════════════════════════════════════════════════════════════════
   E7 APP — hash router, effective-person switch, capability filtering, one
   Action Launcher registry, command popup, single panel stack, inline editing,
   fixture mutations, and state demos. Static + in-memory; no backend/auth/RLS.
   ════════════════════════════════════════════════════════════════════════════ */
import { people, teams, bus, records, inboxItems, can, canViewRecord, scopeOf, journeys, scenarios, anchors, journeyScenarios, anchorText, requiredStates, routes } from './e7-data.js';
import { renderRecord } from './e7-records.js';
import { renderHome, renderWork, renderMoney, renderInbox, renderCafe, renderEcommerce, renderRoastery, renderAdmin, renderProfile, renderRecordPageChrome, computeAttention } from './e7-views.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I = (k) => (window.MOS_ICONS?.[k] || '');
function mountIcons(root = document){ $$('[data-i]', root).forEach(el => { const k = el.getAttribute('data-i'); if (window.MOS_ICONS?.[k]) el.innerHTML = I(k); }); }
const live = (msg) => { const el = $('#e7-live'); if (el) el.textContent = msg; };

/* ── App state ────────────────────────────────────────────────────────────── */
const state = {
  personId: 'p_ayu',
  route: 'home',
  param: null,
  panelStack: [],          // single stack-navigated record inspector
  panelOpen: false,
  panelHistoryDepth: 0,
  panelReturnRoute: 'home',
  recordReturnRoute: null,     // route/collection the full-page record was opened from
  panelFocus: null,        // element to restore focus to on Back/Close
  panelRootFocus: null,    // source on the underlying page; survives nested pushes
  workCollection: 'tasks',
  workSavedView: null,        // null = per-collection default ('mine' for Tasks)
  workPresentation: 'table',
  workPeriod: null,           // 'today'|'week'|'lastweek' when a period saved view is active
  cafeTeamId: null,
  adminSection: 'org',
  inboxFilter: 'all',
  inboxRead: new Set(),
  profilePrefs: {},        // persisted in-memory: { homeOrder, notifyMentions, notifyRuns, denseTables }
  homeWidgets: [],            // D5c: deputy-composed widgets the user accepted into Home
  deputyThreads: {},         // D5f: per-surface threads keyed by scope ('global' | record id)
};

const person = () => people[state.personId];

/* ════════════════════════════════════════════════════════════════════════════
   NAV — capability-gated; destinations + BU-grouped modules + utilities
   ════════════════════════════════════════════════════════════════════════════ */
const navIcons = { home:'orient', work:'work', money:'money', inbox:'inbox', cafe:'coffee', ecommerce:'ops', roastery:'layers', admin:'settings', profile:'people' };
function buildNav(){
  const p = person();
  const primary = $('#e7-primary-nav');
  const dests = [
    {id:'home', label:'Home', show:true},
    {id:'work', label:'Work', show: can(p,'work.view')},
    {id:'money', label:'Money', show: can(p,'money.view')},
    {id:'inbox', label:'Inbox', show:true, count: inboxItems.filter(i=>i.toPersonId===p.id && i.unread && !state.inboxRead.has(i.id)).length},
  ];
  primary.innerHTML = `<div class="overline">Destinations</div>` + dests.filter(d=>d.show).map(d =>
    `<a class="e7-nav-item ${state.route===d.id?'active':''}" href="#/${d.id}" data-go="${d.id}" data-nav="${d.id}" ${state.route===d.id?'aria-current="page"':''}><span data-i="${navIcons[d.id]}"></span><span>${esc(d.label)}</span>${d.count?`<span class="e7-count">${d.count}</span>`:''}</a>`).join('');

  const mod = $('#e7-module-nav');
  const retailMods = [
    {id:'cafe', label:'Café', show: can(p,'cafe.view')},
    {id:'ecommerce', label:'Ecommerce', show: can(p,'ecommerce.view')},
  ].filter(m=>m.show);
  const b2bMods = [{id:'roastery', label:'Roastery', show: can(p,'roastery.view')}].filter(m=>m.show);
  mod.innerHTML = (retailMods.length?`<div class="e7-bu-group"><div class="overline e7-bu-label">Retail Ops</div>${retailMods.map(m=>modItem(m)).join('')}</div>`:'') +
    (b2bMods.length?`<div class="e7-bu-group"><div class="overline e7-bu-label">B2B Ops</div>${b2bMods.map(m=>modItem(m)).join('')}</div>`:'');

  const util = $('#e7-utility-nav');
  const utilItems = [
    {id:'profile', label:'Personal Profile', show:true},
    {id:'admin', label:'Admin Settings', show: can(p,'admin.view')},
  ].filter(u=>u.show);
  util.innerHTML = `<div class="overline">Utilities</div>` + utilItems.map(u=>modItem(u)).join('');
  mountIcons();
}
function modItem(m){ return `<a class="e7-nav-item ${state.route===m.id?'active':''}" href="#/${m.id}" data-go="${m.id}" data-nav="${m.id}" ${state.route===m.id?'aria-current="page"':''}><span data-i="${navIcons[m.id]}"></span><span>${esc(m.label)}</span></a>`; }

/* ════════════════════════════════════════════════════════════════════════════
   ROUTER — one hash router; capability-gated routes resolve honestly
   ════════════════════════════════════════════════════════════════════════════ */
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/');
  return { route: parts[0]||'home', param: parts[1]||null, query };
}
function route(){
  // close any open panel on a real route change
  if (state.panelOpen) { const host=$('#e7-panel-host'); state.panelOpen = false; state.panelStack = []; state.panelHistoryDepth=0; state.panelRootFocus=null; document.body.classList.remove('e7-panel-open'); host.classList.remove('open'); host.setAttribute('aria-hidden','true'); host.innerHTML=''; $('#e7-scrim').hidden = true; }
  closeModal();
  const { route: r, param } = parseHash();
  state.route = r; state.param = param;
  const p = person();
  const main = $('#e7-main');
  let html = '';
  switch (r){
    case 'home': html = renderHome(p, { widgets: state.homeWidgets }); break;
    case 'work': html = renderWork(p, { collection: state.workCollection, savedView: state.workSavedView, presentation: state.workPresentation, periodView: state.workPeriod }); break;
    case 'money': html = renderMoney(p); break;
    case 'inbox': html = renderInbox(p,{mode:'page', filter: state.inboxFilter}); break;
    case 'cafe': html = can(p,'cafe.view') ? renderCafe(p,state.cafeTeamId) : deniedRoute('Café',p,'cafe.view'); break;
    case 'ecommerce': html = can(p,'ecommerce.view') ? renderEcommerce(p) : deniedRoute('Ecommerce',p,'ecommerce.view'); break;
    case 'roastery': html = can(p,'roastery.view') ? renderRoastery(p) : deniedRoute('Roastery',p,'roastery.view'); break;
    case 'admin': html = renderAdmin(p, state.adminSection); break;
    case 'profile': html = renderProfile(p, state.profilePrefs); break;
    case 'record': html = renderRecordPage(param); break;
    default: html = renderHome(p);
  }
  main.innerHTML = (r === 'record') ? html : `<div class="e7-page">${html}</div>`;
  mountIcons(main);
  wireInlineCells(main);
  wireCanvas(main);
  $('#e7-main').focus({ preventScroll: true });
  main.scrollTop = 0;
  buildNav();
  setContext();
  document.getElementById('e7-app').setAttribute('data-view', r);
}
function deniedRoute(name, p, cap){
  return `<div class="e7-page"><div class="denied-state" data-state="denied" data-journey="J19"><span class="lock-ico" data-i="settings"></span><h3>${esc(name)} is outside your access</h3><p class="muted-2">${esc(p.name)} lacks <code>${esc(cap)}</code>. The boundary is explained without exposing data.</p><a class="btn btn-outline btn-sm" href="#/home">Back to Home</a></div></div>`;
}
function renderRecordPage(id){
  const r = records[id]; const p = person();
  if (r && !canViewRecord(p,r)) return deniedRoute(r?.title||'Record', p, 'record.view');
  const returnRoute = state.recordReturnRoute || 'work';
  return `<div class="e7-page" style="max-width:820px">${renderRecordPageChrome(id, returnRoute)}${renderRecord(id,{mode:'page',person:person()})}</div>`;
}

function setContext(){
  const p = person();
  const t = teams[p.primaryTeamId];
  const label = { home:'Home', work:'Work', money:'Money', inbox:'Inbox', cafe:'Café Operations', ecommerce:'Ecommerce', roastery:'Roastery', admin:'Admin Settings', profile:'Personal Profile', record:'Record' }[state.route] || '';
  $('#e7-context-label').innerHTML = `${esc(label)} <b>· ${esc(t?.name||'')}</b>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   EFFECTIVE-PERSON SWITCH (S6) — nav/data/launcher/Deputy reflect access
   ════════════════════════════════════════════════════════════════════════════ */
function setPerson(id){
  state.personId = id;
  state.cafeTeamId = null;
  const p = person();
  document.body.setAttribute('data-effective-person', id);
  const btn = $('[data-person-switch]');
  btn.querySelector('[data-person-name]').textContent = p.name;
  btn.querySelector('[data-person-role]').textContent = `${teams[p.primaryTeamId]?.name||''}`;
  btn.setAttribute('aria-label', `Switch person: ${p.name}`);
  $('[data-person-avatar]').textContent = p.initials;
  // if current route is now denied, fall back to home
  const needsCap = { money:'money.view', cafe:'cafe.view', ecommerce:'ecommerce.view', roastery:'roastery.view', admin:'admin.view' }[state.route];
  if (needsCap && !can(p, needsCap)){ location.hash = '#/home'; }
  else { route(); }
  live(`Now viewing as ${p.name}, ${p.role}.`);
}

function openPersonMenu(){
  const list = Object.values(people).filter(p=>p.switchable).map(p =>
    `<button type="button" class="cmd-row" data-person-pick="${p.id}"><span class="e7-avatar" style="width:24px;height:24px;font-size:11px">${esc(p.initials)}</span><span class="t">${esc(p.name)}</span><span class="s">${esc(p.role)} · ${esc(teams[p.primaryTeamId]?.name)}</span></button>`).join('');
  openModal(`<div class="e7-modal-head"><h3>Switch effective person</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">${list}<p class="muted-2" style="font-size:11px;padding:8px">Choose a person to preview what their account can see and do.</p></div>`, 'center');
}

/* ════════════════════════════════════════════════════════════════════════════
   PANEL STACK — one shared right panel; never nested drawers (D3a)
   ════════════════════════════════════════════════════════════════════════════ */
export function openRecord(id, sourceEl){
  const rec = records[id];
  if (!rec) return;
  if (!canViewRecord(person(), rec)) { toast('That record is outside your current access.', 'info'); return; }
  // Escalate to full page at the 4th level
  if (!state.panelStack.includes(id) && state.panelStack.length >= 3){ openRecordPage(id); return; }
  if (!state.panelOpen){ state.panelReturnRoute = parseHash().route; state.panelOpen = true; state.panelRootFocus = sourceEl || document.activeElement; }
  if (state.panelStack.includes(id)){ state.panelStack = state.panelStack.slice(0, state.panelStack.indexOf(id)+1); }
  else { state.panelStack.push(id); }
  state.panelFocus = sourceEl || null;
  state.panelHistoryDepth++;
  history.pushState({ e7panel: state.panelHistoryDepth }, '');
  renderPanel();
}
export function openRecordPage(id){ state.recordReturnRoute = parseHash().route; location.hash = '#/record/' + id; }
export function panelBack(){
  if (state.panelHistoryDepth > 0 && history.state?.e7panel){ history.back(); return; }
  if (state.panelStack.length > 1){
    state.panelStack.pop();
    if (state.panelStack[state.panelStack.length-1] === '__inbox__') renderInboxQuickPanel();
    else renderPanel();
  }
  else closePanel();
}
export function closePanel(){
  const historyDepth = state.panelHistoryDepth;
  state.panelStack = []; state.panelOpen = false;
  state.panelHistoryDepth = 0;
  document.body.classList.remove('e7-panel-open');
  const host = $('#e7-panel-host'); host.classList.remove('open'); host.setAttribute('aria-hidden','true');
  $('#e7-scrim').hidden = true;
  // remove every same-URL panel push in one deterministic traversal
  if (historyDepth > 0 && history.state?.e7panel) history.go(-historyDepth);
  const f = state.panelRootFocus || state.panelFocus; state.panelFocus = null; state.panelRootFocus = null;
  host.innerHTML = '';
  if (f && document.contains(f)) { try { f.focus({ preventScroll: true }); } catch(e){} }
  live('Panel closed.');
}
function renderPanel(){
  const host = $('#e7-panel-host');
  host.setAttribute('aria-hidden','false');
  host.classList.add('open');
  document.body.classList.add('e7-panel-open');
  $('#e7-scrim').hidden = false;
  const top = state.panelStack[state.panelStack.length-1];
  const rec = records[top];
  const crumb = state.panelStack.map((id,i)=>{
    const r = records[id]; const label = id==='__inbox__' ? 'Inbox' : (r?.title?.slice(0,24) || r?.name || id);
    return i < state.panelStack.length-1 ? `<span data-panel-pop-to="${i}">${esc(label)}</span><span>›</span>` : `<span><b>${esc(label)}</b></span>`;
  }).join('');
  host.innerHTML = `<div class="e7-panel-stack">
    <div class="e7-panel-bar">
      <button class="e7-iconbtn" data-panel-back aria-label="Back" ${state.panelStack.length>1?'':'disabled style="opacity:.3"'}><span>‹</span></button>
      <span class="e7-panel-title">${esc(typeName(rec?.type))}</span>
      <button class="e7-iconbtn" data-panel-close aria-label="Close panel">✕</button>
    </div>
    <div class="e7-panel-breadcrumb">${crumb}</div>
    <div class="e7-panel-content">${renderRecord(top,{mode:'panel',person:person()})}</div>
    <div class="e7-panel-foot"><button class="btn btn-sm btn-outline" data-deputy-context="${esc(top)}" data-journey="J05" aria-label="Ask Deputy about this ${esc(typeName(rec?.type))}"><span data-i="sparkles"></span>Ask @Deputy about this ${esc(typeName(rec?.type))}</button><span class="muted-2" style="font-size:11px">Deputy will use this record as context.</span></div>
  </div>`;
  mountIcons(host);
  wireCanvas(host);
  const first = host.querySelector('a,button'); if (first) setTimeout(()=>first.focus(), 60);
  live(`Opened ${rec?.title||'record'}.`);
}
function typeName(t){ return { task:'Task', signal:'Signal', process:'Process', run:'Process Run', standard:'Standard', exception:'Exception', budget:'Budget', followup:'Follow-up', objective:'Objective', project:'Project', metric:'Metric', stock:'Stock', greenlot:'Green lot', batch:'Roast batch', transfer:'Transfer', order:'Order', replenish:'Replenishment', ingredient:'Ingredient' }[t] || 'Record'; }

/* Quick Inbox in the shared panel (shares read state with the page) */
function openInboxQuick(srcEl){
  if (!state.panelOpen){ state.panelReturnRoute = parseHash().route; state.panelOpen = true; state.panelRootFocus = srcEl || document.activeElement; }
  state.panelStack = ['__inbox__'];
  state.panelFocus = srcEl || null;
  state.panelHistoryDepth++;
  history.pushState({ e7panel: state.panelHistoryDepth }, '');
  renderInboxQuickPanel();
  live('Inbox quick triage.');
}
function renderInboxQuickPanel(){
  const host = $('#e7-panel-host');
  host.setAttribute('aria-hidden','false'); host.classList.add('open'); $('#e7-scrim').hidden = false;
  document.body.classList.add('e7-panel-open');
  host.innerHTML = `<div class="e7-panel-stack">
    <div class="e7-panel-bar"><span class="e7-panel-title">Inbox · quick triage</span><button class="e7-iconbtn" data-panel-close aria-label="Close">✕</button></div>
    <div class="e7-panel-content">${renderInbox(person(), { mode:'panel', filter: state.inboxFilter })}</div>
  </div>`;
  mountIcons(host);
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION LAUNCHER — one prescribed registry, capability-filtered (D32)
   ════════════════════════════════════════════════════════════════════════════ */
function openLauncher(context = {}){
  context = context || {};
  const p = person();
  const ctxAction = context.action; // at most one contextual action
  const stable = [
    { id:'share-signal', icon:'inbox', label:'Share Signal', s:'Factual note for a Team', show: can(p,'signal.create'), journey:'J12' },
    { id:'deputy', icon:'sparkles', label:'Ask Deputy / dictate', s:'Find records, answer questions, or help with available actions', show: can(p,'deputy.use'), journey:'J05' },
    { id:'create-task', icon:'plus', label:'Create Task', s:'Team + PIC + Supervisor + Status', show: can(p,'task.create'), journey:'J07' },
    { id:'more', icon:'layers', label:'More…', s:'Processes, Standards, Budgets, and Follow-ups', show: true, journey:'J04' },
  ];
  const ctx = ctxAction ? [{ id:ctxAction.id, icon:'plus', label:ctxAction.label, s:ctxAction.s||'Context action', show:true, contextual:true, journey:'J04' }] : [];
  const rows = [...stable.filter(r=>r.show), ...ctx];
  const body = rows.map(r => `<button type="button" class="cmd-row" data-launcher="${r.id}" data-journey="${r.journey}" ${r.contextual?'data-scenario="S1"':''}><span class="ico" data-i="${r.icon}"></span><div><div class="t">${esc(r.label)}</div><div class="s">${esc(r.s)}</div></div>${r.id==='more'?'<span class="hint">→</span>':''}</button>`).join('')
    + `<div class="cmd-sep"></div><p class="muted-2" style="font-size:11px;padding:4px 10px">Only actions available to you are shown.</p>`;
  openModal(`<div class="e7-modal-head"><h3 data-journey="J04">Create</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div><div class="e7-modal-body">${body}</div>`, isPhone()?'sheet':'center');
}

function launchCmd(cmd){
  closeModal();
  const p = person();
  if (cmd==='share-signal' && can(p,'signal.create')) return openSignalComposer();
  if (cmd==='deputy' && can(p,'deputy.use')) return openDeputy();
  if (cmd==='create-task' && can(p,'task.create')) {
    closeModal();
    if (state.route !== 'work') {
      location.hash = '#/work';
      setTimeout(inlineCreateTask, 0);
      return;
    }
    return inlineCreateTask();
  }
  if (cmd==='start-run'){ const tid = state.cafeTeamId || (['t_hq_ops','t_rad_ops'].find(id=>can(person(),'cafe.view',{teamId:id})) ); if (tid) startCafeRun(tid); return; }
  if (cmd==='log-roast') { route(); setTimeout(()=>{ const f=document.querySelector('[data-roast-form] input'); if(f) f.focus(); },50); return; }
  if (cmd==='more') return openMorePalette();
  live(`Launcher: ${cmd}.`);
}

/* ── Module execution: Café Run, Ecommerce fulfilment, Roastery batch ──── */
/* A Team may have only one active opening Run; starting when one is active
   is blocked, and Start becomes Continue in the view. */
function startCafeRun(teamId){
  const existing = Object.values(records).find(r=>r.type==='run' && r.teamId===teamId && r.status==='In Progress');
  if (existing){ toast('An opening Run is already in progress — continue it instead.','info'); openRecord(existing.id); return; }
  const proc = records.proc_cafe_open;
  const id = 'run_new_' + Date.now();
  records[id] = { id, type:'run', title:`Café Opening · 11 Jul · ${esc(teams[teamId]?.name||'')}`, teamId, processId:'proc_cafe_open',
    snapshotVersion: proc?.version||2, status:'In Progress', startedAt:'2026-07-11 06:40', shift:'Morning', area:'Bar',
    steps:(proc?.generatedTaskDefs||[]).map((d,i)=>({ id:'s'+i, kind:d.checkable?'check':'checklist', label:d.title, done:false })), tasks:[], signals:[] };
  route(); toast('Opening Run started · Continue to work through steps.','ok');
}
function handleRunAction(action, runId, stepId, btn){
  const run = records[runId]; if (!run) return;
  const step = (run.steps||[]).find(s=>s.id===stepId); if (!step) return;
  if (action==='complete'){ step.done = true; toast('Step completed.','ok'); }
  else if (action==='check'){
    /* A failed Check creates an Exception + linked correction Task (S1). */
    const fail = step.id==='s2';
    if (fail){
      step.result='fail'; step.value='8.5°C'; step.evidence='IMG_NEW.jpg';
      const exId='exc_new_'+Date.now();
      const taskId='t_new_'+Date.now();
      records[exId]={id:exId,type:'exception',title:`${step.label} — out of range`,teamId:run.teamId,runId,standardId:step.spec,correctionTaskId:taskId,raisedAt:'2026-07-11 06:50',evidence:step.evidence,status:'Open'};
      records[taskId]={id:taskId,type:'task',title:`Correct: ${step.label}`,teamId:run.teamId,picId:state.personId,supervisorId:'p_budi',standardId:step.spec,status:'Open',classification:'Ad hoc',sourceException:exId,comments:[]};
      step.exceptionId=exId; run.tasks=[...(run.tasks||[]),taskId];
      toast('Check failed — Exception raised and a correction Task opened.','info');
    } else {
      step.result='pass'; step.value='3.4°C'; step.evidence='IMG_OK.jpg';
      toast('Check passed.','ok');
    }
  }
  rerenderActive();
}
function handleEcoAction(orderId, nextState, btn){
  const order = records[orderId]; if (!order) return;
  const prev = order.state;
  order.state = nextState;
  if (nextState==='shipped') order.sla='on time';
  toast(`Order ${order.ref}: ${prev} → ${nextState} · Undo`,'ok', ()=>{ order.state=prev; route(); });
  route();
}
/* Log fulfilment: open the real inline entry rather than a generic palette. */
function openEcoNewOrder(){
  openModal(`<div class="e7-modal-head"><h3>Log fulfilment</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">
      <div class="field-label">Order reference</div>
      <div class="field"><input id="eco-ref" placeholder="e.g. EC-1042" autofocus /></div>
      <div class="field-label" style="margin-top:10px">Customer</div>
      <div class="field"><input id="eco-cust" placeholder="Customer name" /></div>
      <div class="field-label" style="margin-top:10px">Items</div>
      <div class="field"><input id="eco-items" placeholder="e.g. 2 × House Blend 1kg" /></div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary btn-sm" id="eco-save">Add order</button></div>
    </div>`, 'center');
  $('#eco-save').addEventListener('click', () => {
    const ref = $('#eco-ref').value.trim() || ('EC-'+Date.now());
    const id = 'eco_'+Date.now();
    records[id] = { id, type:'order', ref, customer: $('#eco-cust').value.trim()||'—', items: $('#eco-items').value.trim()||'—', state:'new', sla:'on time', picId: state.personId, teamId:'t_ecom', stockRef:'stock_eco_beans' };
    closeModal(); toast('Order logged · Undo','ok', ()=>{ delete records[id]; route(); });
    route();
  });
}
function handleRoastAction(btn){
  const greenIn = parseFloat($('#rf-green')?.value||'0');
  const roastedOut = parseFloat($('#rf-out')?.value||'0');
  const score = parseInt($('#rf-score')?.value||'0',10);
  const evidence = $('#rf-evidence')?.value?.trim()||'CUP-NEW.jpg';
  if (!greenIn || !roastedOut){ toast('Enter green-in and roasted-out weights.','info'); return; }
  const yieldPct = Math.round((roastedOut/greenIn)*100);
  const shrinkPct = Math.max(0, 100-yieldPct);
  const result = score>=84?'pass':'fail';
  const id = 'roast_batch_'+Date.now();
  records[id] = { id, type:'batch', lotId:'green_lot_G1', greenInKg:greenIn, roastedOutKg:roastedOut, yieldPct, shrinkPct, date:'2026-07-11', operatorId:state.personId, teamId:'t_roast', siteId:'s_roast', qualityCheck:{score, result}, evidence };
  toast(`Batch logged · yield ${yieldPct}% · cupping ${score} (${result})`,'ok');
  route();
}

function openMorePalette(){
  const p = person();
  const items = [
    { id:'process-draft', label:'Draft Process', s:'Saved as a draft until an authorized person publishes it', show: can(p,'process'+'.'+'draft') },
    { id:'standard', label:'New Standard', s:'Versioned instructions for a Business Unit', show: can(p,'standard.publish') },
    { id:'budget', label:'New Budget', s:'Uses linked source costs', show: can(p,'budget.create') },
    { id:'followup', label:'New Follow-up', s:'Chase an outstanding amount', show: can(p,'followup.chase') },
  ].filter(i=>i.show);
  openModal(`<div class="e7-modal-head"><h3>More create options</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">${items.map(i=>`<div class="cmd-row" aria-disabled="true"><span class="ico" data-i="layers"></span><div><div class="t">${esc(i.label)}</div><div class="s">${esc(i.s)} · Review an existing record; creation is not part of this walkthrough.</div></div></div>`).join('')||'<p class="muted-2" style="padding:10px">No additional create options are available to you.</p>'}</div>`, 'center');
}

/* ── D3e inline create: a new record/row appears, then its title cell
   auto-focuses for immediate inline editing. No modal. Context fields
   (Team/PIC/Supervisor) inherit from the current view's scope where valid. */
function inlineCreateTask(){
  const p = person();
  if (!can(p,'task.create')) { toast('You cannot create Tasks in your current access.','info'); return; }
  const allowedTeams = Object.values(teams).filter(t=>can(p,'task.create',{teamId:t.id,buId:t.buId}));
  const teamId = allowedTeams.find(t=>t.id===p.primaryTeamId)?.id || allowedTeams[0]?.id;
  if (!teamId){ toast('No Team is available to create a Task in.','info'); return; }
  const supervisorByTeam = { t_hq_ops:'p_budi', t_rad_ops:'p_andi', t_ecom:'p_rina', t_roast:'p_dimas', t_finance:'p_maya' };
  const id = 't_new_' + Date.now();
  records[id] = { id, type:'task', title:'Untitled', teamId, picId: p.id, supervisorId: supervisorByTeam[teamId]||p.id, status:'Open', classification:'Ad hoc', comments:[] };
  state.workCollection = 'tasks';
  state.workPresentation = 'table';
  if (!state.workSavedView || !['mine','today','week','lastweek','openteam'].includes(state.workSavedView)) state.workSavedView = 'mine';
  route();
  requestAnimationFrame(() => {
    const row = document.querySelector(`tr.rowlink[data-open-record="${id}"]`);
    const titleCell = row?.querySelector('.title-cell .t');
    if (titleCell){ beginInline(titleCell, id); titleCell.scrollIntoView({block:'center'}); }
  });
  live('New Task created — type a title, then press Enter.');
}

/* ── Task composer (inline create: new record + immediate title edit) ─────── */
function openTaskComposer({ sourceSignalId = null } = {}){
  const p = person();
  const sourceSignal = sourceSignalId ? records[sourceSignalId] : null;
  const allowedTeams = Object.values(teams).filter(t=>can(p,'task.create',{teamId:t.id,buId:t.buId}));
  const preferredTeamId = allowedTeams.some(t=>t.id===sourceSignal?.owningTeamId) ? sourceSignal.owningTeamId : (allowedTeams.find(t=>t.id===p.primaryTeamId)?.id || allowedTeams[0]?.id);
  const supervisorByTeam = { t_hq_ops:'p_budi', t_rad_ops:'p_andi', t_ecom:'p_rina', t_roast:'p_dimas', t_finance:'p_maya' };
  openModal(`<div class="e7-modal-head"><h3>Create Task</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">
      ${sourceSignal?`<p class="callout info" style="font-size:12px">Creates a separate Task linked to “${esc(sourceSignal.title)}”. The Signal remains unchanged.</p>`:''}
      <div class="field-label">Title</div>
      <div class="field"><input id="tc-title" placeholder="What needs to happen?" autofocus /></div>
      <div class="form-grid" style="margin-top:12px">
        <div><div class="field-label">Team</div><div class="field"><select id="tc-team">${allowedTeams.map(t=>`<option value="${t.id}" ${t.id===preferredTeamId?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div></div>
        <div><div class="field-label">PIC</div><div class="field"><select><option>${esc(p.name)} (you)</option></select></div></div>
        <div><div class="field-label">Supervisor</div><div class="field"><select id="tc-supervisor">${Object.values(people).filter(x=>['p_budi','p_andi','p_rina','p_dimas','p_maya'].includes(x.id)).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><div class="field-error" id="tc-sup-src" data-state="validation" style="display:none"></div></div></div>
        <div><div class="field-label">Status</div><div class="field"><select><option>Open</option><option>In Progress</option><option>Blocked</option><option>Done</option></select></div></div>
      </div>
      <p class="callout info" style="font-size:12px;margin-top:12px">Choose the <b>PIC</b> who will do the Task and the <b>Supervisor</b> who will check it. A parent Project or Process is optional.</p>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary btn-sm" id="tc-save">Save Task</button></div>
    </div>`, 'center');
  const syncSupervisor = () => { const id=supervisorByTeam[$('#tc-team').value]||'p_budi'; $('#tc-supervisor').value=id; };
  syncSupervisor(); $('#tc-team').addEventListener('change',syncSupervisor);
  $('#tc-save').addEventListener('click', () => {
    const title = $('#tc-title').value.trim();
    if (!title){ $('#tc-title').focus(); $('#tc-title').parentElement.classList.add('invalid'); live('Title is required.'); return; }
    const id = 't_new_' + Date.now();
    records[id] = { id, type:'task', title, teamId: $('#tc-team').value, picId: state.personId, supervisorId:$('#tc-supervisor').value, status:'Open', classification:'Ad hoc', comments:[], ...(sourceSignalId?{sourceSignal:sourceSignalId}:{}) };
    if (sourceSignal) sourceSignal.linkedWork = [...(sourceSignal.linkedWork||[]), {id}];
    closeModal(); toast(sourceSignal?'Task created and linked · Undo':'Task created · Undo', 'ok', () => {
      delete records[id];
      if (sourceSignal) sourceSignal.linkedWork = (sourceSignal.linkedWork||[]).filter(w=>w.id!==id);
      rerenderActive(); toast('Task archived and link removed (Undo).', 'info');
    });
    if (sourceSignal && state.panelOpen) renderPanel(); else route();
  });
}

/* ── Signal composer — owning Team independent of author; mention preview ─── */
function openSignalComposer(){
  const p = person();
  const myTeams = Object.values(teams).filter(t=>can(p,'signal.create',{teamId:t.id}) || can(p,'signal.create_for_team',{teamId:t.id}));
  const categoryOptions = ['Uncategorised','Supply/vendor','Equipment/facility','Inventory/availability','Quality','Customer','People','Process','Other'];
  const mentionPeople = Object.values(people).filter(x=>x.id!==p.id).slice(0,6);
  const mentionTeams = Object.values(teams);
  openModal(`<div class="e7-modal-head"><h3>Share Signal</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">
      <p class="muted-2" style="font-size:12px">A Signal is factual: no PIC, Supervisor, due date, Status, or resolution. Owning Team sets visibility; mentions grant access <b>and</b> notify.</p>
      <div class="field-label" style="margin-top:10px">What happened?</div>
      <div class="field"><textarea id="sc-body" placeholder="A factual note…" autofocus></textarea></div>
      <div class="form-grid" style="margin-top:12px">
        <div><label class="field-label" for="sc-team">Owning Team</label><div class="field"><select id="sc-team">${myTeams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></div>
        <div><label class="field-label" for="sc-att">Attention</label><div class="field"><select id="sc-att"><option>FYI</option><option>Needs attention</option><option>Urgent</option></select></div></div>
        <div><label class="field-label" for="sc-cat">Category</label><div class="field"><select id="sc-cat">${categoryOptions.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div></div>
        <div><label class="field-label" for="sc-occurred">When it happened</label><div class="field"><input id="sc-occurred" type="text" value="2026-07-11 09:00" /></div></div>
      </div>
      <div class="field-label" style="margin-top:10px" for="sc-mentions">Mentions (optional)</div>
      <div class="field" id="sc-mentions" style="flex-wrap:wrap;height:auto;min-height:40px;padding:6px;gap:4px;align-items:center">
        ${mentionPeople.map(m=>`<label class="chip" style="cursor:pointer"><input type="checkbox" value="person:${m.id}" style="margin:0" /> ${esc(m.name)}</label>`).join('')}
        ${mentionTeams.map(t=>`<label class="chip" style="cursor:pointer"><input type="checkbox" value="team:${t.id}" style="margin:0" /> @${esc(t.name)}</label>`).join('')}
      </div>
      <div class="mention-preview" id="sc-preview"><span style="color:var(--e7-text-3)">Select mentions to preview who is granted access and notified.</span></div>
      <div class="inline-deputy-row" style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button type="button" class="chip" id="sc-inline-deputy" aria-label="Reach Deputy inline"><span class="mono">@</span>Deputy</button>
        <span class="muted-2" style="font-size:11px">Reach the deputy from inside this text surface — it drafts with your in-progress Signal as seed.</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary btn-sm" id="sc-save">Post Signal</button></div>
      <div class="callout warn" style="font-size:12px;margin-top:10px">Sensitive HR/legal/medical content? Use Gordi's private channel — there is <b>no private Signal</b> mode.</div>
    </div>`, 'center');
  const preview = $('#sc-preview');
  const updatePreview = () => {
    const checked = $$('#sc-mentions input:checked');
    if (!checked.length){ preview.innerHTML='<span style="color:var(--e7-text-3)">Select mentions to preview who is granted access and notified.</span>'; return; }
    const chips = checked.map(c=>{ const [kind,id]=c.value.split(':'); const name = kind==='team'?(teams[id]?.name):(people[id]?.name); return `<span class="mention-chip">@${esc(name)}</span>`; }).join('');
    preview.innerHTML = `${chips} <span style=\"color:var(--e7-text-3)\">→ grants access + notifies ${checked.length}</span>`;
  };
  $$('#sc-mentions input').forEach(c=>c.addEventListener('change', updatePreview));
  $('#sc-inline-deputy')?.addEventListener('click', () => {
    const body = ($('#sc-body').value||'').trim();
    closeModal();
    openDeputy({ scope:'global', seed: `Help me turn this into a factual Signal (no PIC/due/status): “${body||'(empty — start typing)'}”` });
  });
  $('#sc-save').addEventListener('click', () => {
    const body = $('#sc-body').value.trim();
    if (!body){ $('#sc-body').parentElement.classList.add('invalid'); $('#sc-body').focus(); live('Signal body is required.'); return; }
    const mentions = $$('#sc-mentions input:checked').map(c=>{ const [kind,ref]=c.value.split(':'); return {kind,ref}; });
    const id = 'sig_new_' + Date.now();
    records[id] = { id, type:'signal', title: body.slice(0,48), owningTeamId: $('#sc-team').value, authorId: state.personId, occurredAt: $('#sc-occurred').value||'2026-07-11 09:00', attention: $('#sc-att').value, category: $('#sc-cat').value, body, mentions, comments:[], acks:[], linkedWork:[], revisions:[] };
    closeModal(); toast('Signal posted · Retract if wrong', 'ok', () => { records[id].retracted = true; records[id].retractReason = 'Retracted by author.'; toast('Signal retracted (tombstone kept).', 'info'); route(); });
    route();
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND PALETTE — centered transient popup; routes into the panel (D3b)
   ════════════════════════════════════════════════════════════════════════════ */
function openCommandPalette(){
  const p = person();
  const nav = routes.filter(r => { const cap={money:'money.view',cafe:'cafe.view',ecommerce:'ecommerce.view',roastery:'roastery.view',admin:'admin.view'}[r]; return !cap || can(p,cap); });
  const acts = [
    { id:'nav', label:'Go to…', kind:'sep' },
    ...nav.map(r=>({go:r, label: r.charAt(0).toUpperCase()+r.slice(1)})),
    { id:'act', label:'Act…', kind:'sep' },
    { cmd:'share-signal', label:'Share Signal' },
    { cmd:'create-task', label:'Create Task' },
    { cmd:'deputy', label:'Ask Deputy: what needs my attention?' },
  ];
  renderPalette(acts);
}
function renderPalette(acts){
  openModal(`<div style="padding:0"><input class="e7-cmd-input" id="cp-input" placeholder="Search or type a command…" aria-label="Command palette" autofocus /></div><div class="e7-modal-body" id="cp-body" style="padding-top:0"></div>`, 'center');
  const body = $('#cp-body');
  const paint = (list) => { body.innerHTML = list.map((a,i)=>{
    if (a.kind==='sep') return `<div class="overline" style="padding:8px 10px 4px">${esc(a.label)}</div>`;
    if (a.go) return `<button type="button" class="cmd-row" data-cp-go="${a.go}"><span class="ico" data-i="${navIcons[a.go]||'orient'}"></span><span class="t">${esc(a.label)}</span><span class="hint">route</span></button>`;
    if (a.cmd) return `<button type="button" class="cmd-row" data-cp-cmd="${a.cmd}"><span class="ico" data-i="sparkles"></span><span class="t">${esc(a.label)}</span></button>`;
    if (a.rec) return `<button type="button" class="cmd-row" data-cp-rec="${a.rec}"><span class="ico" data-i="search"></span><span class="t">${esc(a.label)}</span><span class="s">${esc(a.sub||'')}</span></button>`;
    return '';
  }).join('') || '<p class="muted-2" style="padding:10px">No results.</p>'; mountIcons(body); };
  paint(acts);
  const input = $('#cp-input');
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q){ paint(acts); return; }
    const recHits = Object.values(records).filter(r => canViewRecord(person(),r) && (r.title||r.name||r.ref||'').toLowerCase().includes(q)).slice(0,6).map(r=>({rec:r.id, label:r.title||r.name||r.ref, sub:r.type}));
    const filtered = acts.filter(a => a.label && a.label.toLowerCase().includes(q) && !a.kind);
    paint([...filtered, recHits.length?{label:'Records',kind:'sep'}:{}, ...recHits].filter(x=>x && Object.keys(x).length));
  });
  setTimeout(()=>input.focus(), 50);
}

/* ════
   DEPUTY — grounded, in-authority, reversible; never expands access.
   Gap closures: inline reach, navigate user, compose-to-workspace,
   first-class command palette, in-context write, per-surface threads.
   ════ */
function deputyScopeId(context){
  if (context && context.scope) return context.scope;
  const top = state.panelStack[state.panelStack.length-1];
  if (top && top !== '__inbox__' && top !== '__deputy__' && records[top]) return top; // live in-context record
  return 'global';
}
function openDeputy(context = {}){
  const p = person();
  if (!can(p,'deputy.use')){ toast('Deputy is outside your access.','info'); return; }
  const scope = deputyScopeId(context);
  const scopedRecord = (scope !== 'global') ? records[scope] : null;
  // D5f — per-surface threads: each scope keeps its own conversation.
  if (!state.deputyThreads[scope]) state.deputyThreads[scope] = [];
  const turns = state.deputyThreads[scope];
  if (turns.length === 0){
    turns.push({ who:'bot', text: scopedRecord
      ? `This is the ${typeName(scopedRecord.type)} thread for “${scopedRecord.title}”. I run as you — same access, no more — and can act on this record directly.`
      : `Hi ${p.name}. I run as you — same access, no more. Ask me to find work, navigate, draft, or act.`,
      src:'deputy · runs as you, no further reach' });
    if (context.seed){ turns.push({ who:'user', text: context.seed });
      turns.push({ who:'bot', text:`Got it — I'll keep this Signal factual (no PIC/due/status) and ground any draft in your authorized records.`, src:'signal composer · inline reach' }); }
  }
  if (!state.panelOpen){ state.panelReturnRoute = parseHash().route; state.panelOpen = true; state.panelRootFocus = document.activeElement; }
  state.panelStack = ['__deputy__'];
  const host = $('#e7-panel-host');
  host.setAttribute('aria-hidden','false'); host.classList.add('open'); $('#e7-scrim').hidden = false;
  document.body.classList.add('e7-panel-open');
  state.panelHistoryDepth++;
  history.pushState({ e7panel: state.panelHistoryDepth }, '');

  const examples = scopedRecord ? inContextExamples(scopedRecord, p) : globalExamples(p);
  const titleHtml = scopedRecord
    ? `Deputy <span class="e7-panel-sub">· ${esc(typeName(scopedRecord.type))}: ${esc((scopedRecord.title||'').slice(0,26))}</span>`
    : `Deputy <span class="e7-panel-sub">· runs as you</span>`;
  host.innerHTML = `<div class="e7-panel-stack">
    <div class="e7-panel-bar">
      ${scopedRecord?`<button class="e7-iconbtn" data-dp-back-to="${esc(scope)}" aria-label="Back to ${esc(typeName(scopedRecord.type))}" title="Back to record">‹</button>`:''}
      <span class="e7-panel-title">${titleHtml}</span>
      <button class="e7-iconbtn" data-panel-close aria-label="Close">✕</button>
    </div>
    <div class="e7-panel-content" id="dp-thread" style="display:flex;flex-direction:column;gap:8px;padding:12px"></div>
    <div class="dp-shortcuts" id="dp-examples" style="padding:0 8px 6px;display:flex;gap:6px;flex-wrap:wrap"></div>
    <form class="dp-composer" id="dp-composer" style="border-top:1px solid var(--e7-border);padding:8px;display:flex;gap:6px;align-items:flex-end">
      <textarea id="dp-input" class="dp-input" rows="1" placeholder="Ask the deputy anything…" style="flex:1;resize:none;border:1px solid var(--e7-border);border-radius:8px;padding:8px 10px;font:inherit;background:var(--e7-surface);min-height:40px;max-height:140px"></textarea>
      <button type="submit" class="btn btn-primary btn-sm" id="dp-send"><span data-i="sparkles"></span>Send</button>
    </form>
  </div>`;
  const thread = $('#dp-thread'); const ex = $('#dp-examples');
  function paint(){
    thread.innerHTML = turns.map(t => `<div class="deputy-msg ${t.who}">${t.text}${t.src?`<div class="src">${esc(t.src)}</div>`:''}${t.prop?`<div class="deputy-prop"><div class="ph">${esc(t.propHead||'Proposed effect')}</div>${t.prop}${t.accept?`<div style="margin-top:8px;display:flex;gap:6px"><button class="btn btn-sm btn-primary" data-dp-accept="${esc(t.accept)}">Accept — pin to Home</button></div>`:''}</div>`:''}</div>`).join('');
    thread.scrollTop = thread.scrollHeight;
    thread.querySelectorAll('[data-dp-accept]').forEach(b=>b.addEventListener('click', ()=>{ b.disabled=true; acceptHomeWidget(); }));
  }
  paint();
  /* Free-form typed composer: the user can type any prompt. Example chips
     above remain optional shortcuts. */
  const composer = $('#dp-composer'); const input = $('#dp-input');
  if (composer){
    mountIcons(composer);
    input.addEventListener('input', () => { input.style.height='auto'; input.style.height=Math.min(140,input.scrollHeight)+'px'; });
    composer.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      sendDeputyTurn(q, p, scope, turns, paint);
      input.value=''; input.style.height='auto';
    });
    setTimeout(()=>input.focus(), 60);
  }
  function refreshExamples(){ ex.innerHTML = examples.length?`<span class="overline" style="width:100%">Try</span>`+examples.map((e,i)=>`<button class="chip" data-dp-ex="${i}" ${e.used?'disabled style="opacity:.4"':''}>${esc(e.q)}</button>`).join(''):''; bindEx(); }
  function bindEx(){
    ex.querySelectorAll('[data-dp-ex]').forEach(b => b.addEventListener('click', () => {
      const ex2 = examples[+b.dataset.dpEx]; if (ex2.used) return; ex2.used = true;
      turns.push({ who:'user', text: ex2.q });
      const a = (typeof ex2.a==='function') ? ex2.a() : ex2.a;
      turns.push({ who:'bot', text: a.text, src: a.src, prop: a.prop, propHead: a.propHead, accept: a.accept });
      paint();
      if (a.run){ setTimeout(()=>a.run(p, scope, turns, paint), 250); }
      refreshExamples();
    }));
  }
  refreshExamples();
  host.querySelectorAll('[data-dp-back-to]').forEach(b=>b.addEventListener('click', ()=>{ state.panelStack=[]; openRecord(b.getAttribute('data-dp-back-to')); }));
  live(scopedRecord ? `Deputy scoped to ${scopedRecord.title}.` : 'Deputy ready.');
}

/* D5c — composed widget drops into Home (not the transcript) when accepted. */
function acceptHomeWidget(){
  if (!can(person(),'money.view')) { toast('That widget is outside your Money access.', 'info'); return; }
  const ar = records.metric_ar;
  const w = { id:'w_'+Date.now(), title:'Outstanding AR', label:'Balance overdue > 30d',
    value: 'Rp ' + Number(ar.value).toLocaleString('id-ID'), foot:`oldest 38d · MOS Follow-ups · as of ${ar.asOf}`, scope: scopeOf(person(),'money.view')||'org', drillId:'metric_ar' };
  state.homeWidgets.push(w);
  closePanel();
  if (state.route !== 'home') location.hash = '#/home'; else route();
  toast('Widget pinned to Home · Undo','ok', ()=>{ const i = state.homeWidgets.findIndex(x=>x.id===w.id); if (i>=0){ state.homeWidgets.splice(i,1); route(); } });
}

/* Handle a free-form typed deputy turn with a grounded, in-authority reply. */
function sendDeputyTurn(q, p, scope, turns, paint){
  turns.push({ who:'user', text: q });
  const scopedRecord = (scope && scope!=='global') ? records[scope] : null;
  const reply = deputyReply(q, p, scopedRecord);
  turns.push({ who:'bot', text: reply.text, src: reply.src, prop: reply.prop, propHead: reply.propHead, accept: reply.accept });
  paint();
  if (reply.run) setTimeout(()=>reply.run(p, scope, turns, paint), 250);
  live('Deputy replied.');
}
function deputyReply(q, p, scopedRecord){
  const text = q.toLowerCase();
  /* Overdue / attention queries — grounded in the same records as Home. */
  if (/overdue|attention|due|urgent/.test(text)){
    const attention = computeAttention(p);
    if (attention.length) {
      const item = attention[0];
      const r = item.record;
      let label, meta;
      if (r.type === 'exception') { label = 'Exception'; meta = `Exception · ${teams[r.teamId]?.name || ''}`; }
      else if (r.type === 'task') { label = r.status === 'Blocked' ? 'Blocked Task' : 'Overdue Task'; meta = r.status === 'Blocked' ? 'Blocked · PIC' : `Overdue · due ${r.due}`; }
      else { label = 'Mention'; meta = 'Unread mention'; }
      return { text:`${label}: ${r.title}. ${meta}.`, src:`Source · ${r.title}`, propHead:'Related record', prop:`<a data-open-record="${r.id}" href="#/record/${r.id}">Open ${esc(r.title)} →</a>` };
    }
    return { text:'No overdue work needs your attention right now.', src:'Checked your visible Tasks and Exceptions' };
  }
  /* Navigate requests. */
  const navMatch = Object.values(records).find(r => canViewRecord(p,r) && (r.title||'').toLowerCase().includes(text.slice(0,12)));
  if (/(take me|open|go to|show me|find)/.test(text) && navMatch){
    return { text:`Opening “${navMatch.title}” in the panel — I can move you to the right record.`, src:`navigate(${navMatch.id})`, run: ()=>{ state.panelStack=[]; state.panelOpen=false; openRecord(navMatch.id); } };
  }
  /* Create a Task. */
  const taskMatch = q.match(/create.{0,20}task.{0,5}[:\-]?\s*(.*)/i) || q.match(/task[:\-]?\s*(.*)/i);
  if (taskMatch && taskMatch[1] && taskMatch[1].length>2 && can(p,'task.create')){
    const title = taskMatch[1].replace(/["„”“'].*/,'').trim().replace(/\.$/,'');
    if (title.length>2){
      return { text:`I created that Task directly — low-risk and reversible, in your authority. Supervisor defaults to ${esc(people.p_budi?.name||'your manager')} (parent A).`, src:'write · audited',
        run: (personArg)=>{ const id='t_dp_'+Date.now(); const allowed=Object.values(teams).filter(t=>can(personArg,'task.create',{teamId:t.id})); const tid=allowed.find(t=>t.id===personArg.primaryTeamId)?.id||allowed[0]?.id||personArg.primaryTeamId; records[id]={id,type:'task',title,teamId:tid,picId:personArg.id,supervisorId:'p_budi',status:'Open',classification:'Ad hoc',comments:[]}; } };
    }
  }
  /* In-context record questions. */
  if (scopedRecord){
    return { text:`Looking at this ${typeName(scopedRecord.type)}: ${scopedRecord.title}. I can help with the actions available to you — try “add a comment” or “what should I do next?”.`, src:`Source · ${scopedRecord.title}` };
  }
  /* Fallback — grounded, honest. */
  return { text:`I work only with the records you can already see. Try “what is overdue?”, “take me to the chiller Exception”, or “create a Task: restock napkins”.`, src:'deputy · runs as you' };
}

/* Global-thread example actions (navigate, direct write, governed draft, propose) */
function globalExamples(p){
  return [
    { q:'What is overdue in my scope?', a: groundedAttention(p) },
    { q:'Take me to the chiller Exception', a:{ text:'Opening the HQ chiller Exception in the panel — I can move you to the right record.', src:'navigate(exc_chiller)', run: ()=>{ state.panelStack=[]; state.panelOpen=false; openRecord('exc_chiller'); } } },
    { q:'Create a Task: "Restock bar napkins"', a:{ text:`I created that Task directly — low-risk, reversible, in your authority. Supervisor defaults to ${esc(people.p_budi?.name)} (parent A).`, src:'domain command · audited',
        run: (personArg)=>{ const id='t_dp_'+Date.now(); records[id]={id,type:'task',title:'Restock bar napkins',teamId:personArg.primaryTeamId,picId:personArg.id,supervisorId:'p_budi',status:'Open',classification:'Ad hoc',comments:[]}; } } },
    { q:'Draft a Process for "Closing checklist"', a:{ text:"That's a governed definition — I'll save a Draft; a human (Process A) publishes it. Same shape as the Process designer.", src:'draft · not yet published' } },
    can(p,'money.view') ? { q:'Propose a Home widget for overdue AR', a:{
        text:'Here is a composed widget preview. It runs under your existing access — accept to pin it to your Home canvas, not this transcript.',
        src:'compose_view · disposition: pin-to-workspace', accept:'ar',
        prop:`<div class="kpi" style="border:none;box-shadow:none;padding:0"><div class="kpi-top"><span class="kpi-ico"><span data-i="money"></span></span><span class="kpi-label">Outstanding AR</span><span class="basis-chip">${esc(scopeOf(p,'money.view')||'org')}</span></div><div class="kpi-value tabular">Rp ${Number(records.metric_ar.value).toLocaleString('id-ID')}</div><div class="kpi-foot"><span class="delta down">oldest 38d</span></div></div>` } } : null,
  ].filter(Boolean);
}
/* D5e — write actions bound to the live in-context record/selection. */
function inContextExamples(r, p){
  const common = [
    { q:`Why is this ${typeName(r.type).toLowerCase()} on my attention list?`, a:{ text: r.type==='exception' ? 'It is a failed Check (chiller 8.2°C vs 2–4°C) from the HQ opening Run. A correction Task is already open.' : 'This record is blocked, overdue, or directly mentioned to you.', src:`Source · ${r.title}` } },
  ];
  if (r.type==='task'){
    common.push({ q:'Add a checklist item “Order replacement chiller” to this Task', a:{ text:'Done — added the checklist item to this Task. Press ‹ to return to it.', src:`Updated · ${r.title}`,
      run: ()=>{ if(!r.checklist) r.checklist=[]; r.checklist.push({label:'Order replacement chiller', done:false}); } } });
    common.push({ q:'Who should I escalate this to?', a:{ text:`PIC is ${esc(people[r.picId]?.name)}; Supervisor ${esc(people[r.supervisorId]?.name)} monitors and can unblock. I won't reassign without your confirmation.`, src:`read · ownership on ${r.id}` } });
  } else if (r.type==='signal'){
    common.push({ q:'Add a comment summarising the impact for the floor', a:{ text:'Posted the comment on this Signal. The original report remains unchanged.', src:`Updated · ${r.title}`,
      run: ()=>{ if(!r.comments) r.comments=[]; r.comments.push({who:p.id, text:'Floor brief: product safe, moved to ice bath, correction in progress.'}); } } });
  } else if (r.type==='followup'){
    common.push({ q:'Record a Rp 5,000,000 partial promise on this Follow-up', a:{ text:'That is a consequential settlement step — Finance confirmation is still required to reach Settled. I logged the promise but did not settle.', src:`write · promise on ${r.id}`,
      run: ()=>{ if(!r.promises) r.promises=[]; r.promises.push({date:'2026-07-10', amount:5000000, cashInDate:'', proof:'(pending)'}); } } });
  }
  return common;
}
function groundedAttention(p){
  const attention = computeAttention(p);
  if (attention.length) {
    const item = attention[0];
    const r = item.record;
    let label, meta;
    if (r.type==='exception') { label = 'Exception'; meta = `Exception · ${teams[r.teamId]?.name || ''}`; }
    else if (r.type==='task') { label = r.status === 'Blocked' ? 'Blocked Task' : 'Overdue Task'; meta = r.status === 'Blocked' ? 'Blocked · PIC' : `Overdue · due ${r.due}`; }
    else { label = 'Mention'; meta = 'Unread mention'; }
    return { text:`${label}: ${r.title}. ${meta}.`, src:`Source · ${r.title}`, propHead:'Related record', prop:`<a data-open-record="${r.id}" href="#/record/${r.id}">Open ${esc(r.title)} →</a>` };
  }
  return { text:'No overdue work needs your attention right now.', src:'Checked your visible Tasks and Exceptions' };
}

/* ════════════════════════════════════════════════════════════════════════════
   INLINE EDITING — one commit contract (Enter/Tab/click-outside save, Esc discard)
   ════════════════════════════════════════════════════════════════════════════ */
function wireInlineCells(root){
  // Demonstrate the primitive on Work task titles in the table
  $$('.data-table tr.rowlink', root).forEach(tr => {
    const id = tr.getAttribute('data-open-record');
    const rec = records[id];
    if (!rec || rec.type !== 'task') return;
    const titleCell = tr.querySelector('.title-cell .t');
    if (!titleCell || titleCell.dataset.wired) return;
    titleCell.dataset.wired = '1';
    titleCell.setAttribute('data-inline-cell', id);
    titleCell.setAttribute('title', 'Click to edit (Enter saves · Esc discards)');
    titleCell.setAttribute('role','button');
    titleCell.tabIndex = 0;
    titleCell.addEventListener('click', (e) => { e.stopPropagation(); beginInline(titleCell, id); });
    titleCell.addEventListener('keydown', (e) => {
      if (e.target===titleCell && (e.key==='Enter'||e.key===' ')){
        e.preventDefault();
        beginInline(titleCell, id);
      }
    });
  });
}
function beginInline(el, id){
  if (el.classList.contains('editing')) return;
  const original = records[id].title;
  el.classList.add('editing');
  el.innerHTML = `<input value="${esc(original)}" /><div class="inline-state pending" data-state="pending">Editing… Enter saves · Esc discards</div>`;
  const input = el.querySelector('input'); const state2 = el.querySelector('.inline-state');
  input.focus(); input.select();
  let committed = false;
  const commit = () => {
    if (committed) return; committed = true;
    const v = input.value.trim();
    if (!v){ input.value = original; el.classList.add('invalid'); state2.className='inline-state error'; state2.textContent='Title cannot be empty — staying open.'; committed=false; input.focus(); return; }
    records[id].title = v;
    el.classList.remove('editing'); el.textContent = v;
    toast(`Saved · Undo`, 'ok', () => { records[id].title = original; route(); });
  };
  const cancel = () => { if (committed) return; committed = true; el.classList.remove('editing'); el.textContent = original; live('Edit discarded.'); };
  input.addEventListener('keydown', (e) => {
    if (e.key==='Enter' || ((e.metaKey||e.ctrlKey) && e.key==='Enter')){ e.preventDefault(); commit(); }
    else if (e.key==='Escape'){ e.preventDefault(); cancel(); }
    else if (e.key==='Tab'){
      e.preventDefault(); commit();
      const row=el.closest('tr');
      const target=(e.shiftKey?row?.previousElementSibling:row?.nextElementSibling)?.querySelector('.title-cell .t');
      if(target) beginInline(target, target.getAttribute('data-inline-cell'));
    }
  });
  input.addEventListener('blur', () => { if(!committed) commit(); });
}

/* ════════════════════════════════════════════════════════════════════════════
   TYPED STRUCTURED CANVAS (OD-REDESIGN-16 / D7) — inline edit, `/` insert menu
   limited to contract-valid objects, autosave pending/saved/error. No view/edit.
   ════════════════════════════════════════════════════════════════════════════ */
function wireCanvas(root){
  $$('[data-inline-canvas]', root).forEach(el => {
    if (el.dataset.canvasWired) return;
    el.dataset.canvasWired = '1';
    el.setAttribute('role','button');
    el.tabIndex = 0;
    el.setAttribute('title','Click to edit (Enter saves · Esc discards)');
    el.addEventListener('click', () => beginCanvasInline(el));
    el.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){ e.preventDefault(); beginCanvasInline(el); } });
  });
}
function canvasMarkPending(id){
  const r = records[id]; if (!r) return;
  r.canvasSave = 'pending';
  refreshCanvasSave(id);
  clearTimeout(r._canvasTimer);
  r._canvasTimer = setTimeout(() => { r.canvasSave='saved'; refreshCanvasSave(id); }, 700);
}
function refreshCanvasSave(id){
  const host = (state.panelOpen ? $('#e7-panel-host') : document);
  $$('.canvas-save', host).forEach(c => { /* only the one for this record */ });
  // simplest: re-render the panel/page content if it is showing this record
  if (state.panelOpen && state.panelStack[state.panelStack.length-1]===id){ renderPanel(); }
  else if (state.route==='record' && state.param===id){ /* leave inline; autosave dot updates on next route */ }
}
function beginCanvasInline(el){
  if (el.classList.contains('editing')) return;
  const [recordId, secId, field] = el.getAttribute('data-inline-canvas').split('|');
  const sec = (records[recordId]?.sections||[]).find(s=>s.id===secId); if (!sec) return;
  const original = sec[field] ?? '';
  el.classList.add('editing');
  el.innerHTML = `<input value="${esc(original)}" /><div class="inline-state pending" data-state="pending">Editing… Enter saves · Esc discards</div>`;
  const input = el.querySelector('input'); const st = el.querySelector('.inline-state');
  input.focus(); input.select(); let committed=false;
  const commit = () => {
    if (committed) return; const v = input.value.trim();
    if (!v){ st.className='inline-state error'; st.textContent='Cannot be empty — staying open.'; input.value=original; input.focus(); return; }
    committed=true; sec[field]=v; el.classList.remove('editing'); el.textContent=v;
    canvasMarkPending(recordId);
    toast('Section saved · Undo','ok', () => { sec[field]=original; canvasMarkPending(recordId); rerenderActive(); });
  };
  const cancel = () => { if(committed) return; committed=true; el.classList.remove('editing'); el.textContent=original; };
  input.addEventListener('keydown', e => {
    if (e.key==='Enter' || ((e.metaKey||e.ctrlKey) && e.key==='Enter')){ e.preventDefault(); commit(); }
    else if (e.key==='Escape'){ e.preventDefault(); cancel(); }
    else if (e.key==='Tab'){
      e.preventDefault();
      const host=el.closest('.e7-record')||document;
      const cells=$$('[data-inline-canvas]',host); const i=cells.indexOf(el); const target=cells[i+(e.shiftKey?-1:1)];
      commit(); if (target) beginCanvasInline(target);
    }
  });
  input.addEventListener('blur', () => { if(!committed) commit(); });
}
function rerenderActive(){ if (state.panelOpen) renderPanel(); else route(); }

const CANVAS_CONTRACTS_APP = {
  process: [
    { kind:'task-def', label:'Generated Task definition', make:()=>({id:'cs_'+Date.now(),kind:'task-def',title:'New Task definition',own:'Process A',sup:'Process A'}) },
    { kind:'checklist', label:'Checklist item', make:()=>({id:'cs_'+Date.now(),kind:'checklist',label:'New checklist item'}) },
    { kind:'check', label:'Measured Check', make:()=>({id:'cs_'+Date.now(),kind:'check',label:'New measured Check',spec:'',pinned:false}) },
    { kind:'field', label:'Input field', make:()=>({id:'cs_'+Date.now(),kind:'field',label:'New input field',input:'text'}) },
    { kind:'evidence', label:'Evidence requirement', make:()=>({id:'cs_'+Date.now(),kind:'evidence',label:'New evidence requirement'}) },
    { kind:'signoff', label:'Sign-off', make:()=>({id:'cs_'+Date.now(),kind:'signoff',label:'New sign-off',role:'Supervisor'}) },
  ],
  project: [
    { kind:'task-ref', label:'Contributing Task', make:()=>({id:'ps_'+Date.now(),kind:'task-ref',task:'t_taste_test'}) },
    { kind:'milestone', label:'Milestone', make:()=>({id:'ps_'+Date.now(),kind:'milestone',label:'New milestone',due:''}) },
    { kind:'note', label:'Note', make:()=>({id:'ps_'+Date.now(),kind:'note',label:'New note'}) },
    { kind:'field', label:'Field', make:()=>({id:'ps_'+Date.now(),kind:'field',label:'New field',input:'text'}) },
  ],
};
function openCanvasInsert(recordId, pageKind){
  const items = CANVAS_CONTRACTS_APP[pageKind]||[];
  const heading = pageKind === 'project' ? 'Project' : 'Process';
  openModal(`<div class="e7-modal-head"><h3>Insert · ${esc(heading)} block</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">${items.map(i=>`<button type="button" class="cmd-row" data-canvas-add="${esc(recordId)}|${esc(i.kind)}"><span class="ico" data-i="plus"></span><div><div class="t">${esc(i.label)}</div><div class="s">valid block type for this page</div></div></button>`).join('')}<p class="muted-2" style="font-size:11px;padding:6px 2px">The <span class="mono">/</span> menu offers only block types valid for this page — the same ones the deputy can add.</p></div>`, 'center');
}
function canvasAddBlock(recordId, kind){
  const r = records[recordId]; if (!r) return;
  const contract = r.type === 'project' ? 'project' : 'process';
  const def = (CANVAS_CONTRACTS_APP[contract] || []).find(i=>i.kind===kind); if (!def) return;
  if (!r.sections) r.sections=[];
  r.sections.push(def.make());
  closeModal();
  canvasMarkPending(recordId);
  toast(`${esc(def.label)} inserted`,'ok');
  rerenderActive();
}
function canvasRemoveBlock(recordId, secId){
  const r = records[recordId]; if (!r || !r.sections) return;
  const sec = r.sections.find(s=>s.id===secId); if (!sec) return;
  if (sec.pinned){ toast('Pinned required blocks cannot be removed.','info'); return; }
  r.sections = r.sections.filter(s=>s.id!==secId);
  canvasMarkPending(recordId);
  toast('Block removed · Undo','ok', () => { r.sections.push(sec); canvasMarkPending(recordId); rerenderActive(); });
  rerenderActive();
}


let modalReturnFocus = null;
function openModal(inner, shape='center'){
  const host = $('#e7-modal-host');
  modalReturnFocus = document.activeElement;
  host.innerHTML = `<div class="e7-modal-scrim" data-close-modal></div><div class="e7-modal ${shape}" role="dialog" aria-modal="true">${inner}</div>`;
  host.style.pointerEvents = 'auto';
  mountIcons(host);
  const close = () => closeModal();
  host.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', close));
  const dialog = host.querySelector('[role="dialog"]');
  const focusables = () => Array.from(dialog?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
  dialog?.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = focusables(); if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length-1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  setTimeout(() => (dialog?.querySelector('[autofocus]') || focusables()[0] || dialog)?.focus?.(), 0);
}
function closeModal(){
  const host=$('#e7-modal-host');
  if (!host.children.length) return;
  host.innerHTML=''; host.style.pointerEvents='none';
  const target = modalReturnFocus; modalReturnFocus = null;
  if (target && document.contains(target)) setTimeout(() => target.focus({preventScroll:true}), 0);
}
function toast(msg, kind='info', undo){
  let t = document.querySelector('.e7-toast');
  if (t) t.remove();
  t = document.createElement('div'); t.className='e7-toast';
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:80;background:var(--e7-surface);border:1px solid var(--e7-border);border-radius:8px;box-shadow:var(--e7-shadow-overlay);padding:10px 14px;font-size:13px;display:flex;align-items:center;gap:10px';
  t.innerHTML = `<span>${esc(msg)}</span>${undo?'<button class="btn btn-sm btn-ghost" data-toast-undo>Undo</button>':''}<button class="e7-iconbtn" data-toast-x aria-label="Dismiss">✕</button>`;
  document.body.appendChild(t); mountIcons(t);
  t.querySelector('[data-toast-x]').addEventListener('click', ()=>t.remove());
  if (undo) t.querySelector('[data-toast-undo]').addEventListener('click', ()=>{ undo(); t.remove(); });
  setTimeout(()=>t.remove(), 6000);
}
function isPhone(){ return window.matchMedia('(max-width: 767px)').matches; }

/* Work field chooser — toggles which columns appear in the table. */
function openFieldsDialog(){
  const current = state.workFields || ['title','ownership','supervisor','status','due'];
  const fields = [['title','Title'],['ownership','Ownership'],['supervisor','Supervisor'],['status','Status'],['due','Due'],['version','Version'],['progress','Progress'],['team','Team']];
  openModal(`<div class="e7-modal-head"><h3>Table fields</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div>
    <div class="e7-modal-body">${fields.map(f=>`<label class="cmd-row" style="cursor:pointer"><input type="checkbox" data-work-field="${f[0]}" ${current.includes(f[0])?'checked':''} style="margin:0" /><span class="t">${esc(f[1])}</span></label>`).join('')}<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" data-work-fields-apply>Apply</button></div></div>`, 'center');
  const apply = () => { state.workFields = Array.from(document.querySelectorAll('[data-work-field]:checked')).map(el=>el.value); closeModal(); live(`Fields updated.`); rerenderActive(); };
  document.querySelector('[data-work-fields-apply]')?.addEventListener('click', apply);
}

function openMobileMenu(){
  const p = person();
  const dests = [['home','Home'],['work','Work'],['money','Money'],['inbox','Inbox']];
  const mods = [['cafe','Café'],['ecommerce','Ecommerce'],['roastery','Roastery'],['profile','Personal Profile'],['admin','Admin Settings']];
  const cap = { money:'money.view', cafe:'cafe.view', ecommerce:'ecommerce.view', roastery:'roastery.view', admin:'admin.view' };
  const row = (id,label) => can(p,cap[id])||!cap[id] ? `<a class="cmd-row" data-close-modal href="#/${id}"><span class="ico" data-i="${navIcons[id]}"></span><span class="t">${esc(label)}</span></a>` : '';
  openModal(`<div class="e7-modal-head"><h3>Menu</h3><button class="e7-iconbtn" data-close-modal aria-label="Close">✕</button></div><div class="e7-modal-body">${dests.map(d=>row(...d)).join('')}<div class="cmd-sep"></div>${mods.map(m=>row(...m)).join('')}</div>`, 'sheet');
}

/* ════════════════════════════════════════════════════════════════════════════
   COVERAGE DIALOG (developer) — lists J/S/A wiring; not part of natural UI
   ════════════════════════════════════════════════════════════════════════════ */
function openCoverage(){
  const host = $('#e7-coverage-host'); host.hidden = false;
  host.innerHTML = `<div class="e7-coverage"><div class="e7-coverage-card"><div style="display:flex;align-items:center"><h2>Coverage &amp; contracts</h2><button class="e7-iconbtn" data-coverage-close style="margin-left:auto">✕</button></div>
    <p class="muted-2" style="font-size:12px;margin-bottom:12px">Developer view of journey/scenario/anchor wiring. User UI remains natural.</p>
    <div class="overline">Journeys (J01–J23)</div><div class="e7-cov-grid">${journeys.map(j=>`<div class="e7-cov-cell ok">${j} <span class="muted-2">${journeyScenarios[j]}</span></div>`).join('')}</div>
    <div class="overline">Scenarios (S1–S6)</div><div class="e7-cov-grid">${scenarios.map(s=>`<div class="e7-cov-cell ok">${s}</div>`).join('')}</div>
    <div class="overline">Anchors absent (A1–A14)</div><div class="e7-cov-grid">${anchors.map(a=>`<div class="e7-cov-cell ok">${a}</div>`).join('')}</div>
    <div class="overline">Required states (9)</div><div class="e7-cov-grid">${requiredStates.map(s=>`<div class="e7-cov-cell ok">${s}</div>`).join('')}</div>
    <p class="muted-2" style="font-size:11px;margin-top:10px">Run <code>node verify-e7-prototype.mjs</code> for the static contract check.</p>
  </div></div>`;
  host.querySelector('[data-coverage-close]').addEventListener('click', ()=>{ host.hidden=true; host.innerHTML=''; });
}

/* ════════════════════════════════════════════════════════════════════════════
   EVENT DELEGATION + global keys
   ════════════════════════════════════════════════════════════════════════════ */
function onDocumentChange(e){
  const setting = e.target.closest('[data-profile-setting]');
  if (setting){
    const key = setting.getAttribute('data-profile-setting');
    const val = setting.type === 'checkbox' ? setting.checked : setting.value;
    state.profilePrefs = { ...state.profilePrefs, [key]: val };
    live(`Saved: ${key} = ${val}`);
    return;
  }
  /* Work mobile pickers — native select mirrors the desktop chip cloud. */
  const mobCol = e.target.closest('[data-work-mobile-collection]');
  if (mobCol){ state.workCollection = mobCol.value; state.workSavedView = null; state.workPresentation = 'table'; route(); return; }
  const mobView = e.target.closest('[data-work-mobile-saved-view]');
  if (mobView){ state.workSavedView = mobView.value; route(); return; }
  const mobPres = e.target.closest('[data-work-mobile-presentation]');
  if (mobPres){ state.workPresentation = mobPres.value; route(); return; }
  const sortSel = e.target.closest('[data-work-sort]');
  if (sortSel){ state.workSort = sortSel.value; live(`Sorted by ${sortSel.value}.`); rerenderActive(); return; }
  const groupSel = e.target.closest('[data-work-group]');
  if (groupSel){ state.workGroup = groupSel.value; live(`Grouped by ${groupSel.value}.`); rerenderActive(); return; }
}
function onDocumentInput(e){
  const search = e.target.closest('[data-work-search]');
  if (search){ state.workSearch = search.value; rerenderActive(); return; }
}
function onDocumentClick(e){
  // Record open (default → panel; modifier/new-tab → real href = full page)
  const recLink = e.target.closest('[data-open-record]');
  if (recLink){
    if (e.metaKey || e.ctrlKey || e.button===1) return;          // let the browser open href in a new tab
    e.preventDefault();
    if (state.panelStack[0]==='__deputy__'){ state.panelStack=[]; }
    openRecord(recLink.getAttribute('data-open-record'), recLink);
    return;
  }
  const pageLink = e.target.closest('[data-open-page]');
  if (pageLink){ e.preventDefault(); openRecordPage(pageLink.getAttribute('data-open-page')); return; }

  const coll = e.target.closest('[data-collection]');
  if (coll){
    state.workCollection = coll.getAttribute('data-collection');
    state.workSavedView = null;          // reset to per-collection default
    state.workPresentation = 'table';
    if (coll.matches('[data-go]')) return; // href changes route; collection is already selected
    route(); return;
  }
  const savedView = e.target.closest('[data-saved-view]');
  if (savedView){ state.workSavedView = savedView.getAttribute('data-saved-view'); route(); return; }
  const pres = e.target.closest('[data-presentation]');
  if (pres){ state.workPresentation = pres.getAttribute('data-presentation'); route(); return; }
  const saveView = e.target.closest('[data-save-view]');
  if (saveView){ toast(`Saved view “${state.workSavedView||'current'}” recorded · it appears in your saved views.`, 'ok'); return; }
  const workFields = e.target.closest('[data-work-fields]');
  if (workFields){ openFieldsDialog(); return; }
  const inlineCreate = e.target.closest('[data-inline-create]');
  if (inlineCreate){ const cid = inlineCreate.getAttribute('data-inline-create'); if (cid==='tasks'){ inlineCreateTask(); return; } launchCmd('more'); return; }
  const inboxFilter = e.target.closest('[data-inbox-filter]');
  if (inboxFilter){ state.inboxFilter = inboxFilter.getAttribute('data-inbox-filter'); if (state.panelOpen && state.panelStack[0]==='__inbox__') renderInboxQuickPanel(); else route(); return; }
  const periodChip = e.target.closest('[data-period]');
  if (periodChip){ state.workPeriod = periodChip.getAttribute('data-period'); route(); return; }
  const cafeContinue = e.target.closest('[data-cafe-continue]');
  if (cafeContinue){ const rid = cafeContinue.getAttribute('data-cafe-continue'); openRecord(rid, cafeContinue); return; }
  const cafeStart = e.target.closest('[data-cafe-start]');
  if (cafeStart){ const tid = cafeStart.getAttribute('data-cafe-start'); startCafeRun(tid); return; }
  const runAction = e.target.closest('[data-run-action]');
  if (runAction){ const [action, rid, sid] = runAction.getAttribute('data-run-action').split('|'); handleRunAction(action, rid, sid, runAction); return; }
  const ecoAction = e.target.closest('[data-eco-action]');
  if (ecoAction){ const [oid, nextState] = ecoAction.getAttribute('data-eco-action').split('|'); handleEcoAction(oid, nextState, ecoAction); return; }
  const roastAction = e.target.closest('[data-roast-action]');
  if (roastAction){ handleRoastAction(roastAction); return; }
  const roastFocus = e.target.closest('[data-roast-focus]');
  if (roastFocus){ document.querySelector('[data-roast-form] input')?.focus(); document.querySelector('[data-roast-form]')?.scrollIntoView({behavior:'smooth',block:'center'}); live('Focused the roast batch form.'); return; }
  const ecoNewOrder = e.target.closest('[data-eco-new-order]');
  if (ecoNewOrder){ openEcoNewOrder(); return; }
  const go = e.target.closest('[data-go]'); if (go){ return; } // href handles it
  const navPick = e.target.closest('[data-person-pick]'); if (navPick){ setPerson(navPick.getAttribute('data-person-pick')); closeModal(); return; }
  const launcher = e.target.closest('[data-launcher]'); if (launcher){ launchCmd(launcher.getAttribute('data-launcher')); return; }
  const adm = e.target.closest('[data-admin-section]'); if (adm){ state.adminSection = adm.getAttribute('data-admin-section'); route(); return; }
  const cafeTeam = e.target.closest('[data-cafe-team]'); if (cafeTeam){ state.cafeTeamId=cafeTeam.getAttribute('data-cafe-team'); route(); return; }
  const addTeam = e.target.closest('[data-add-team]'); if (addTeam){
    const id='t_new_'+Date.now(); teams[id]={id,name:'New Team (draft)',buId:'bu_retail',siteId:'s_hq',signalLayer:0,areas:[],draft:true};
    route(); toast('Team draft created · configure before use.','ok'); return;
  }
  const archiveTeam = e.target.closest('[data-archive-team]'); if (archiveTeam){
    const t=teams[archiveTeam.getAttribute('data-archive-team')]; if (t){ t.archived=!t.archived; route(); toast(t.archived?'Team archived · history preserved.':'Team restored.','ok'); } return;
  }
  const transfer = e.target.closest('[data-transfer-person]'); if (transfer){
    const target=people[$('#org-person')?.value], next=teams[$('#org-team')?.value], effective=$('#org-effective')?.value;
    if (target&&next&&effective){ const prior=target.primaryTeamId; target.membershipHistory=[...(target.membershipHistory||[]),{teamId:prior,endedAt:effective},{teamId:next,startedAt:effective}]; target.primaryTeamId=next.id; target.buId=next.buId; route(); toast(`${target.name} transfers to ${next.name} on ${effective}.`,'ok'); }
    return;
  }
  const roleDefault = e.target.closest('[data-role-default]'); if (roleDefault){
    const [roleId,cap]=roleDefault.getAttribute('data-role-default').split('|');
    const members=Object.values(people).filter(p=>p.roleId===roleId); const enabled=members.some(p=>(p.roleGrants||[]).some(g=>g.cap===cap));
    members.forEach(p=>{ p.roleGrants=(p.roleGrants||[]).filter(g=>g.cap!==cap); if (!enabled) p.roleGrants.push({cap,scope:'org'}); });
    route(); toast(`Operator role default ${cap} ${enabled?'removed':'granted'} · Person overrides preserved.`,'ok'); return;
  }
  const access = e.target.closest('[data-access-action]'); if (access){
    const [action,pid,cap]=access.getAttribute('data-access-action').split('|'); const target=people[pid];
    if (!target) return;
    target.allows=(target.allows||[]).filter(x=>x.cap!==cap); target.denies=(target.denies||[]).filter(x=>x.cap!==cap);
    if (action==='allow') target.allows.push({cap,scope:'org'});
    if (action==='deny') target.denies.push({cap,scope:'org'});
    const outcome=action==='reset'?'reset to role default':action==='deny'?'denied':'allowed';
    route(); toast(`${target.name}: ${cap} ${outcome} · audited.`,'ok'); return;
  }
  const preview = e.target.closest('[data-preview-person]'); if (preview){ setPerson(preview.getAttribute('data-preview-person')); return; }
  const cpGo = e.target.closest('[data-cp-go]'); if (cpGo){ closeModal(); location.hash = '#/'+cpGo.getAttribute('data-cp-go'); return; }
  const cpCmd = e.target.closest('[data-cp-cmd]'); if (cpCmd){ closeModal(); launchCmd(cpCmd.getAttribute('data-cp-cmd')); return; }
  const cpRec = e.target.closest('[data-cp-rec]'); if (cpRec){ closeModal(); openRecord(cpRec.getAttribute('data-cp-rec')); return; }
  const popTo = e.target.closest('[data-panel-pop-to]'); if (popTo){
    state.panelStack = state.panelStack.slice(0, +popTo.getAttribute('data-panel-pop-to')+1);
    if (state.panelStack[state.panelStack.length-1] === '__inbox__') renderInboxQuickPanel(); else renderPanel();
    return;
  }
  const signalTask = e.target.closest('[data-signal-task]'); if (signalTask){
    openTaskComposer({ sourceSignalId: signalTask.getAttribute('data-signal-task') }); return;
  }
  const followupAction = e.target.closest('[data-followup-action]'); if (followupAction){
    const [action,id]=followupAction.getAttribute('data-followup-action').split('|'); const r=records[id]; if (!r) return;
    r.history=r.history||[]; r.promises=r.promises||[];
    if (action==='promise'){ r.lifecycle='promised'; r.promises.push({date:'2026-07-10',amount:r.balance,cashInDate:'',proof:''}); r.history.push({at:'2026-07-10',event:'Promise recorded',by:state.personId}); }
    if (action==='partial'){ const p=r.promises[r.promises.length-1]||{date:'2026-07-10',amount:Math.round(r.balance/2),cashInDate:'',proof:''}; if (!r.promises.length) r.promises.push(p); r.lifecycle='partial'; r.balance=Math.max(0,r.balance-Math.round(p.amount/2)); r.history.push({at:'2026-07-10',event:'Partial payment recorded',by:state.personId}); }
    if (action==='add-proof'){ const p=r.promises[r.promises.length-1]||{date:'2026-07-10',amount:r.balance}; p.cashInDate='2026-07-10'; p.proof='BANK-PROOF-DEMO.pdf'; if (!r.promises.length) r.promises.push(p); r.settlementError=''; r.history.push({at:'2026-07-10',event:'Cash-in date and proof attached',by:state.personId}); }
    if (action==='settle'){ const p=r.promises[r.promises.length-1]; if (!p?.cashInDate||!p?.proof){ r.settlementError='cash-in date and proof are required before Finance confirmation.'; } else { r.lifecycle='settled'; r.balance=0; r.settlementError=''; r.history.push({at:'2026-07-10',event:'Settlement confirmed by Finance',by:state.personId}); } }
    rerenderActive(); return;
  }

  const cIns = e.target.closest('[data-canvas-insert]'); if (cIns){ const [rid,contract] = cIns.getAttribute('data-canvas-insert').split('|'); openCanvasInsert(rid, contract); return; }
  const cAdd = e.target.closest('[data-canvas-add]'); if (cAdd){ const [rid,kind] = cAdd.getAttribute('data-canvas-add').split('|'); canvasAddBlock(rid, kind); return; }
  const cRm = e.target.closest('[data-canvas-remove]'); if (cRm){ const [rid,sid] = cRm.getAttribute('data-canvas-remove').split('|'); canvasRemoveBlock(rid, sid); return; }
  const cErr = e.target.closest('[data-canvas-demo-error]'); if (cErr){ const rid = cErr.getAttribute('data-canvas-demo-error'); const r = records[rid]; if (r){ r.canvasSave = r.canvasSave==='error'?'saved':'error'; rerenderActive(); } return; }
  const retry = e.target.closest('[data-retry-source]'); if (retry){ retry.disabled=true; retry.textContent='Retrying…'; setTimeout(()=>{ retry.disabled=false; retry.textContent='Retry source'; toast('Source still unavailable · last valid result retained.','info'); },700); return; }

  const triggers = {
    '[data-action-launcher]': () => openLauncher(currentContextAction()),
    '[data-command-trigger]': openCommandPalette,
    '[data-deputy-trigger]': () => openDeputy(),
    '[data-deputy-context]': (t) => openDeputy({ scope: t.getAttribute('data-deputy-context') }),
    '[data-inbox-trigger]': (t)=>openInboxQuick(t),
    '[data-person-switch]': openPersonMenu,
    '[data-mobile-menu]': openMobileMenu,
    '[data-coverage]': openCoverage,
  };
  for (const sel in triggers){ const t = e.target.closest(sel); if (t){ triggers[sel](t); return; } }
}
function currentContextAction(){
  if (state.route==='cafe') return { id:'start-run', label:'Start opening Run', s:'Context: Café' };
  if (state.route==='roastery') return { id:'log-roast', label:'Log roast', s:'Context: Roastery' };
  return null;
}

function onKeydown(e){
  if (e.key==='Escape'){
    if ($('#e7-modal-host').children.length){ closeModal(); return; }
    if (!$('#e7-coverage-host').hidden){ $('#e7-coverage-host').hidden=true; $('#e7-coverage-host').innerHTML=''; return; }
    if (state.panelOpen){ panelBack(); return; }
  }
  if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openCommandPalette(); }
  if ((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='c'){ e.preventDefault(); openCoverage(); }
  if (e.key==='Backspace' && state.panelOpen && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){ /* let browser back handle */ }
}

/* ── popstate: browser Back pops the panel stack (panel pushStates keep URL) ─ */
window.addEventListener('popstate', () => {
  if (state.panelOpen){
    state.panelHistoryDepth = Math.max(0,state.panelHistoryDepth-1);
    if (state.panelStack.length > 1){
      state.panelStack.pop();
      if (state.panelStack[state.panelStack.length-1] === '__inbox__') renderInboxQuickPanel(); else renderPanel();
    }
    else { const host=$('#e7-panel-host'); state.panelStack=[]; state.panelOpen=false; state.panelHistoryDepth=0; state.panelRootFocus=null; document.body.classList.remove('e7-panel-open'); host.classList.remove('open'); host.setAttribute('aria-hidden','true'); host.innerHTML=''; $('#e7-scrim').hidden=true; }
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════════════════ */
export function init(){
  buildNav();
  setContext();
  setPerson(state.personId);   // initial render
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('change', onDocumentChange);
  document.addEventListener('input', onDocumentInput);
  window.addEventListener('hashchange', route);
  // panel bar buttons (delegated on panel host)
  $('#e7-panel-host').addEventListener('click', (e) => {
    if (e.target.closest('[data-panel-back]')){ panelBack(); return; }
    if (e.target.closest('[data-panel-close]')){ closePanel(); return; }
  });
  $('#e7-scrim').addEventListener('click', closePanel);
  mountIcons();
  // re-mount icons after icons.js possibly already ran
  setTimeout(mountIcons, 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
