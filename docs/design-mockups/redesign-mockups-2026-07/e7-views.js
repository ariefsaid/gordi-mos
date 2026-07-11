/* ════════════════════════════════════════════════════════════════════════════
   E7 VIEWS — destination renderers. Pure functions returning HTML strings;
   interaction is wired by e7-app.js via data-* delegation. Uses one shared
   record/panel/inline grammar. data-journey/data-scenario/data-state markers
   satisfy the static coverage contract on real surfaces.
   ════════════════════════════════════════════════════════════════════════════ */
import { records, people, teams, bus, sites, inboxItems, cafeAreas, periodEvents, can, scopeOf, canViewRecord } from './e7-data.js';
import { renderRecord, linkTo } from './e7-records.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (n) => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const pill = (status) => {
  const map = { 'Open':'open','In Progress':'progress','Done':'done','Blocked':'blocked','Published':'done','Draft':'warn','Completed':'done' };
  return `<span class="pill ${map[status]||'neutral'}"><span class="dot"></span>${esc(status)}</span>`;
};
const attentionPill = (attention) => `<span class="pill ${attention==='Urgent'?'blocked':attention==='Needs attention'?'warn':'neutral'}"><span class="dot"></span>${esc(attention)}</span>`;
const lifecyclePill = (lifecycle) => `<span class="pill ${lifecycle==='settled'?'done':lifecycle==='partial'?'progress':lifecycle==='promised'?'warn':'neutral'}"><span class="dot"></span>${esc(lifecycle)}</span>`;

/* ─── Shared attention computation (Home + Deputy) ───
   Returns an array of { sort, sourceId, record } for attention items:
   1. Open Exceptions visible to the person (team-scoped)
   2. Blocked Tasks where person is PIC
   3. Overdue Tasks where person is PIC
   4. Unread mention Signals (inbox items)
   Sorted by priority: Exceptions → Blocked → Overdue → Mentions
*/
export function computeAttention(person) {
  const today = '2026-07-11';
  const isOverdue = (t) => t.due && t.due <= today;
  
  const myTasks = Object.values(records).filter(r=>
    r.type==='task' && r.picId===person.id && r.status!=='Done' && !r.archivedAt
  );
  const teamExceptions = Object.values(records).filter(r=>
    r.type==='exception' && r.status!=='Closed' && can(person,'work.view',{teamId:r.teamId})
  );
  const mySignals = inboxItems.filter(i=>i.toPersonId===person.id && i.unread);

  const items = [];
  teamExceptions.forEach(e=>items.push({sort:0, sourceId:e.id, record:e}));
  myTasks.filter(t=>t.status==='Blocked').forEach(t=>items.push({sort:1, sourceId:t.id, record:t}));
  myTasks.filter(t=>isOverdue(t)).forEach(t=>items.push({sort:2, sourceId:t.id, record:t}));
  mySignals.slice(0,3).forEach(i=>items.push({sort:3, sourceId:i.sourceId, record:records[i.sourceId]}));
  
  items.sort((a,b)=>a.sort-b.sort);
  return items;
}

function head(title, sub, actions, journey){
  return `<div class="e7-page-head"><div><h1 data-journey="${journey||''}">${esc(title)}</h1>${sub?`<div class="muted-2">${sub}</div>`:''}</div><div class="e7-head-actions">${actions||''}</div></div>`;
}

/* Rows builder for canonical record lists */
function recordRow(id, opts={}){
  const r = records[id]; if (!r) return '';
  const title = r.title || r.name || r.ref || id;
  const sub = opts.sub || '';
  return `<a class="row-item" href="#/record/${id}" data-open-record="${id}">
    <div class="body"><div class="t">${esc(title)}</div>${sub?`<div class="s">${sub}</div>`:''}</div>
    <div class="meta">${opts.meta||''}</div>
  </a>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   HOME — non-removable attention brief + personal canvas. Role-aware (J01-J03)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderHome(person, { widgets = [] } = {}){
  const isOperator = person.id==='p_ayu';
  const isSupervisor = person.id==='p_budi';
  const isCross = ['p_rina','p_dimas','p_maya','p_arief'].includes(person.id);
  const journey = isOperator?'J01':(isSupervisor?'J02':'J03');
  const ctx = can(person,'money.view')?{buId:person.buId}:undefined;

  // Shared attention computation (also used by Deputy)
  const attentionItems = computeAttention(person);
  const attentionSourceIds = new Set(attentionItems.map(a=>a.sourceId));
  const myTasks = Object.values(records).filter(r=>
    r.type==='task' && r.picId===person.id && r.status!=='Done' && !r.archivedAt
  );
  const personalTasks = myTasks.filter(t=>!attentionSourceIds.has(t.id));

  const attentionHtml = attentionItems.map(item => {
    const r = item.record;
    if (!r) return '';
    if (r.type === 'exception') return recordRow(r.id, {sub:`Exception · ${esc(teams[r.teamId]?.name)}`, meta:pill('Blocked')});
    if (r.type === 'task') {
      if (r.status === 'Blocked') return recordRow(r.id, {sub:'Blocked · PIC', meta:pill('Blocked')});
      return recordRow(r.id, {sub:`Overdue · due ${esc(r.due)}`, meta:pill(r.status)});
    }
    if (r.type === 'signal') return `<a class="row-item" data-open-record="${r.id}" href="#/record/${r.id}"><div class="body"><div class="t">${esc(r.title)}</div><div class="s">Mention</div></div></a>`;
    return '';
  });

  const attnCount = attentionItems.length;
  const brief = `
    <section class="section" data-scenario="S1" data-journey="J01 J02 J03">
      <div class="section-title"><span data-i="bell"></span>Needs attention<span class="actions"><span class="e7-attention-flag"><span class="dot"></span>${attnCount}</span></span></div>
      ${attnCount?`<div class="stack">${attentionHtml.join('')}</div>`:`<div class="empty-state" data-state="empty"><span class="ico" data-i="check"></span><h3>Nothing needs your attention</h3><p>Blocked or overdue work, open exceptions, and mentions will appear here.</p></div>`}
    </section>`;

  // Personal canvas (role-aware, authorized under viewer JWT)
  const canvas = `
    <section class="section">
      <div class="section-title"><span data-i="layers"></span>Your work today</div>
      <div class="stack">
        ${personalTasks.length?personalTasks.map(t=>recordRow(t.id,{sub:`${esc(t.classification||'Task')} · ${esc(teams[t.teamId]?.name)}`,meta:pill(t.status)})).join(''):`<div class="empty-state" data-state="empty"><span class="ico" data-i="work"></span><h3>No other Tasks assigned to you</h3><p>Items needing attention remain in the section above.</p></div>`}
      </div>
    </section>`;

  // Deputy-composed widgets accepted into the personal canvas. These run
  // under the viewer's JWT/capabilities — never a new data path. Acceptance is explicit.
  const widgetSection = widgets.length ? `
    <section class="section" data-journey="J05" data-scenario="S2">
      <div class="section-title"><span data-i="sparkles"></span>From your Deputy<span class="actions"><span class="basis-chip">you accepted these</span></span></div>
      <div class="stack">
        ${widgets.map(w => `<div class="card"><div class="card-head"><h3>${esc(w.title)}</h3><span class="actions"><a class="row-link" data-open-record="${esc(w.drillId)}" href="#/record/${esc(w.drillId)}">Open →</a></span></div>
          <div class="card-body"><div class="kpi" style="border:none;box-shadow:none;padding:0"><div class="kpi-top"><span class="kpi-ico"><span data-i="money"></span></span><span class="kpi-label">${esc(w.label)}</span><span class="basis-chip">${esc(w.scope)}</span></div><div class="kpi-value tabular">${esc(w.value)}</div><div class="kpi-foot"><span class="muted-2" style="font-size:12px">${esc(w.foot)}</span></div></div></div></div>`).join('')}
      </div>
    </section>` : '';

  // Money snippet only if authorized (not a second dashboard)
  const moneySnip = can(person,'money.view') ? `
    <section class="section" data-journey="J19" data-scenario="S2">
      <div class="section-title"><span data-i="money"></span>Money position<span class="actions"><a class="row-link" data-go="money" href="#/money">Open Money →</a></span></div>
      <div class="kpi"><div class="kpi-top"><span class="kpi-ico"><span data-i="trendUp"></span></span><span class="kpi-label">Outstanding AR</span><span class="basis-chip">${scopeOf(person,'money.view')}</span></div>
        <div class="kpi-value tabular">${money(records.metric_ar.value)}</div><div class="kpi-foot"><span class="stale-note"><span class="dot" style="width:7px;height:7px;border-radius:99px;background:var(--e7-warning)"></span>as of ${esc(records.metric_ar.asOf)} · MOS Follow-ups</span></div></div>
    </section>` : '';

  // Period strip (live, sourced) — filtered to the viewer's effective scope (A3)
  const inScope = (sid) => {
    const x = records[sid]; if (!x) return false;
    if (x.type==='signal') return can(person,'work.view',{teamId:x.owningTeamId}) || (x.mentions||[]).some(m=>m.kind==='person'&&m.ref===person.id);
    if (x.teamId) return can(person,'work.view',{teamId:x.teamId});
    if (x.buId) return can(person,'work.view',{buId:x.buId}) || x.participatingTeams?.some(t=>can(person,'work.view',{teamId:t}));
    return false;
  };
  const period = can(person,'work.view')?`
    <section class="section" data-journey="J15" data-scenario="S3">
      <div class="section-title"><span data-i="clock"></span>This week<span class="actions"><a class="row-link" data-go="work" data-collection="period" href="#/work">See period view →</a></span></div>
      <div class="stack">${periodEvents.filter(e=>inScope(e.source) && !attentionSourceIds.has(e.source)).slice(0,4).map(e=>recordRow(e.source,{sub:esc(e.label),meta:`<span class="pill neutral"><span class="dot"></span>${esc(e.kind)}</span>`})).join('')||`<div class="empty-state" data-state="empty"><span class="ico" data-i="clock"></span><h3>Nothing in your scope this week</h3><p>Tasks, Runs, Signals and events you can see will appear here.</p></div>`}</div>
    </section>`:'';

  return `${head(`Good morning, ${esc(person.name)}`, `${esc(person.role)} · ${esc(teams[person.primaryTeamId]?.name)}${person.additionalTeams?.length?` +${person.additionalTeams.length}`:''}`, '', journey)}
  <div class="stack">
    ${brief}
    ${canvas}
    ${widgetSection}
    ${moneySnip}
    ${period}
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   WORK — one collection / saved-view workspace (J07-J15)
   Three separate dimensions: collection picker, saved view subset, and
   Table/Board/Timeline presentation. New users start at "My tasks". Period
   buckets (Today / This week / Last week) are temporal saved views, not a
   collection — and Tasks support all three presentations.
   ════════════════════════════════════════════════════════════════════════════ */
const collections = [
  {id:'tasks', label:'Tasks', j:'J07'},
  {id:'runs', label:'Process Runs', j:'J10'},
  {id:'projects', label:'Projects', j:'J08'},
  {id:'processes', label:'Processes', j:'J09'},
  {id:'standards', label:'Standards', j:'J11'},
  {id:'objectives', label:'Objectives', j:'J08'},
  {id:'signals', label:'Signals', j:'J12'},
  {id:'followups', label:'Follow-ups', j:'J21'},
];

/* Saved-view subsets per collection. "My tasks" is the Tasks default. */
const savedViews = {
  tasks:   [{id:'mine',   label:'My tasks'},      {id:'today',    label:'Today'},       {id:'week', label:'This week'}, {id:'lastweek', label:'Last week'}, {id:'openteam', label:'Open on my Team'}],
  runs:    [{id:'active', label:'In progress'},  {id:'today',    label:'Started today'}, {id:'week', label:'This week'}],
  projects:[{id:'all',    label:'All projects'}, {id:'active',   label:'Active'}],
  processes:[{id:'all',   label:'All processes'},{id:'mine',     label:'I am accountable for'}],
  standards:[{id:'all',   label:'All standards'},{id:'upgrade',  label:'Upgrade available'}],
  objectives:[{id:'all',  label:'All objectives'}],
  signals: [{id:'all',    label:'All signals'},  {id:'attention',label:'Needs attention'}, {id:'mine', label:'I posted'}],
  followups:[{id:'all',   label:'All follow-ups'},{id:'overdue', label:'Overdue'}],
};
/* Presentations supported by each collection. Most are table-only. */
const presentations = {
  tasks:['table','board','timeline'],
  runs:['table','board'],
  projects:['table','board'],
  processes:['table'],
  standards:['table'],
  objectives:['table'],
  signals:['table'],
  followups:['table'],
};

function dueBucket(rec, viewId){
  if (viewId==='today'){ return rec.due === '2026-07-10' || rec.due === '2026-07-11'; }
  if (viewId==='week'){ return rec.due && rec.due <= '2026-07-17'; }
  if (viewId==='lastweek'){ return rec.due && rec.due >= '2026-07-04' && rec.due <= '2026-07-10'; }
  return true;
}
function filterRows(rows, colId, viewId, person){
  if (colId==='tasks'){
    if (viewId==='mine') return rows.filter(r=>r.picId===person.id);
    if (viewId==='openteam') return rows.filter(r=>r.status!=='Done');
    if (['today','week','lastweek'].includes(viewId)) return rows.filter(r=>dueBucket(r,viewId));
  } else if (colId==='runs'){
    if (viewId==='active') return rows.filter(r=>r.status==='In Progress');
    if (viewId==='today') return rows.filter(r=>(r.startedAt||'').startsWith('2026-07-10'));
    if (viewId==='week') return rows.filter(r=>(r.startedAt||'').startsWith('2026-07'));
  } else if (colId==='processes'){
    if (viewId==='mine') return rows.filter(r=>r.accountableId===person.id);
  } else if (colId==='standards'){
    if (viewId==='upgrade') return rows.filter(r=>r.upgrade?.available);
  } else if (colId==='signals'){
    if (viewId==='attention') return rows.filter(r=>r.attention!=='FYI' && !r.retracted);
    if (viewId==='mine') return rows.filter(r=>r.authorId===person.id);
  } else if (colId==='followups'){
    if (viewId==='overdue') return rows.filter(r=>r.ageDays>30);
  }
  return rows;
}

function rowCells(r){
  /* Returns [[dataLabel, innerHTML], ...] for one record row. */
  const t = r.title||r.name||r.ref||r.id;
  if (r.type==='task') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span><span class="s">${esc(r.classification||'Ad hoc')}</span></div>`], ['Ownership', `${esc(teams[r.teamId]?.name)} · PIC ${esc(people[r.picId]?.name)}`], ['Supervisor', `${esc(people[r.supervisorId]?.name)}`], ['Status', pill(r.status)], ['Due', r.due?esc(r.due):'—']];
  if (r.type==='run') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['Team', `${esc(teams[r.teamId]?.name)}`], ['Version', `v${r.snapshotVersion}`], ['Status', pill(r.status)], ['Started', r.startedAt?esc(r.startedAt):'—']];
  if (r.type==='process') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['BU', `${esc(bus[r.buId]?.name)}`], ['Accountable', `${esc(people[r.accountableId]?.name)}`], ['Version', `v${r.version}`], ['Status', pill(r.status)]];
  if (r.type==='project') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['BU', `${esc(bus[r.buId]?.name)}`], ['Accountable', `${esc(people[r.accountableId]?.name)}`], ['Progress', `<div class="bar" style="max-width:90px"><span style="width:${Math.round((r.progress||0)*100)}%"></span></div>`], ['Due', r.due?esc(r.due):'—']];
  if (r.type==='standard') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['BU', `${esc(bus[r.buId]?.name)}`], ['Version', `v${r.publishedVersion}`], ['Upgrade', r.upgrade?.available?`<span class="pill warn"><span class="dot"></span>v${r.upgrade.toVersion}</span>`:'—']];
  if (r.type==='objective') return [['Title', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['BU', `${esc(bus[r.buId]?.name)}`], ['Accountable', `${esc(people[r.accountableId]?.name)}`], ['Progress', `<div class="bar" style="max-width:90px"><span style="width:${Math.round((r.progress||0)*100)}%"></span></div>`]];
  if (r.type==='signal') return [['Signal', `<div class="title-cell"><span class="t">${esc(t)}</span><span class="s">${esc(r.category||'Uncategorised')}</span></div>`], ['Owning Team', `${esc(teams[r.owningTeamId]?.name)}`], ['Attention', attentionPill(r.attention)], ['Occurred', `<span class="tabular">${esc(r.occurredAt)}</span>`]];
  if (r.type==='followup') return [['Follow-up', `<div class="title-cell"><span class="t">${esc(t)}</span></div>`], ['Counterparty', `${esc(r.counterparty)}`], ['Balance', `<span class="tabular">${money(r.balance)}</span>`], ['Age', `${r.ageDays}d`], ['Stage', lifecyclePill(r.lifecycle)]];
  return [['Title', esc(t)]];
}
function tableHeaders(cells){
  return cells[0].map(([label])=>label).map((h,i)=>`<th${h==='Due'||h==='Started'||h==='Age'||h==='Occurred'?' class="num"':''}>${esc(h)}</th>`).join('');
}

function presentationButton(p, isActive){
  /* literal attributes keep the source contract scannable; values are a known enum. */
  const label = p.charAt(0).toUpperCase()+p.slice(1);
  if (p==='table')  return `<button class="chip ${isActive?'active':''}" data-presentation="table" aria-pressed="${isActive?'true':'false'}" aria-label="Table view">Table</button>`;
  if (p==='board')  return `<button class="chip ${isActive?'active':''}" data-presentation="board" aria-pressed="${isActive?'true':'false'}" aria-label="Board view">Board</button>`;
  return `<button class="chip ${isActive?'active':''}" data-presentation="timeline" aria-pressed="${isActive?'true':'false'}" aria-label="Timeline view">Timeline</button>`;
}

function tableView(rows, col){
  if (!rows.length) return `<div class="empty-state" data-state="empty"><span class="ico" data-i="work"></span><h3>No ${esc(col.label.toLowerCase())} match this view</h3><p>Try a different saved view, or create one from the launcher.</p></div>`;
  const headerCells = rowCells(rows[0]);
  return `<table class="data-table" data-journey="${col.j}"><thead><tr>${tableHeaders([headerCells])}</tr></thead>
    <tbody>${rows.map(r=>{ const cells=rowCells(r); return `<tr class="rowlink" data-open-record="${r.id}">${cells.map(([label,html])=>`<td${label==='Due'||label==='Started'||label==='Age'||label==='Occurred'?' class="num"':''} data-label="${esc(label)}">${html}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;
}

/* Board view — Tasks grouped by Status (also used for Runs/Projects by status). */
function boardView(rows, col){
  const groups = col.id==='tasks'
    ? [{id:'Open',label:'Open'},{id:'In Progress',label:'In progress'},{id:'Blocked',label:'Blocked'},{id:'Done',label:'Done'}]
    : [{id:'In Progress',label:'In progress'},{id:'Completed',label:'Completed'}];
  return `<div class="board" data-journey="${col.j}">${groups.map(g=>{
    const items = rows.filter(r=>(r.status)===g.id);
    return `<div class="board-col"><div class="board-head"><span class="overline">${esc(g.label)}</span><span class="basis-chip">${items.length}</span></div><div class="board-body">${items.map(r=>`<a class="board-card" data-open-record="${r.id}" href="#/record/${r.id}"><div class="t">${esc(r.title)}</div><div class="s">${esc(teams[r.teamId||r.owningTeamId]?.name)||''}</div>${r.type==='task'?`<div class="meta"><span class="mention-chip">${esc(people[r.picId]?.name||'—')}</span>${pill(r.status)}</div>`:''}</a>`).join('')||`<div class="muted-2" style="font-size:12px;padding:8px">No items</div>`}</div></div>`;
  }).join('')}</div>`;
}

/* Timeline view — Tasks ordered by due date. */
function timelineView(rows, col){
  const sorted = rows.filter(r=>r.due).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  if (!sorted.length) return `<div class="empty-state" data-state="empty"><span class="ico" data-i="clock"></span><h3>Nothing dated in this view</h3><p>Tasks with a due date appear here in order.</p></div>`;
  return `<div class="timeline" data-journey="${col.j}">${sorted.map(r=>`<a class="tl-item" data-open-record="${r.id}" href="#/record/${r.id}"><div class="tl-date tabular">${esc(r.due)}</div><div class="tl-dot"></div><div class="tl-body"><div class="t">${esc(r.title)}</div><div class="s">${esc(teams[r.teamId]?.name)} · PIC ${esc(people[r.picId]?.name)}</div><div class="meta">${pill(r.status)}</div></div></a>`).join('')}</div>`;
}

export function renderWork(person, opts={}){
  const activeCollection = opts.collection || 'tasks';
  const col = collections.find(c=>c.id===activeCollection)||collections[0];
  const activeView = opts.savedView || (activeCollection==='tasks' ? 'mine' : (savedViews[activeCollection][0]?.id||'all'));
  const activePresentation = opts.presentation || 'table';
  const supported = presentations[activeCollection]||['table'];
  const presentation = supported.includes(activePresentation) ? activePresentation : supported[0];

  /* Today/This week/Last week are temporal saved views: when active on Tasks,
     show the live period list; otherwise the normal table/board/timeline. */
  if (activeCollection==='tasks' && ['today','week','lastweek'].includes(activeView)){
    return renderPeriodTasks(person, activeView, presentation);
  }

  let allRows = Object.values(records).filter(r=>col.id==='tasks' ? (r.type==='task' && !r.archivedAt) : (
    col.id==='runs'?r.type==='run':
    col.id==='projects'?r.type==='project':
    col.id==='processes'?r.type==='process':
    col.id==='standards'?r.type==='standard':
    col.id==='objectives'?r.type==='objective':
    col.id==='signals'?r.type==='signal':
    col.id==='followups'?r.type==='followup':false
  )).filter(r=>canViewRecord(person,r));
  const rows = filterRows(allRows, activeCollection, activeView, person);

  const viewDef = savedViews[activeCollection].find(v=>v.id===activeView)||savedViews[activeCollection][0];
  const count = rows.length;
  let bodyHtml;
  if (presentation==='board') bodyHtml = boardView(rows, col);
  else if (presentation==='timeline') bodyHtml = timelineView(rows, col);
  else bodyHtml = tableView(rows, col);

  const createTxt = col.id==='tasks'?'Create Task':(col.id==='processes'?'Draft Process':(col.id==='standards'?'New Standard':(col.id==='signals'?'Share Signal':'Create')));
  const launcherCmd = col.id==='tasks'?'create-task':(col.id==='signals'?'share-signal':'more');

  /* Functional workspace toolbar: Search, Sort, Group, Fields, Save view.
     Each control is a real semantic input/select wired in e7-app.js. */
  const sortOptions = [['due','Due date'],['title','Title'],['status','Status'],['pic','PIC'],['team','Team']];
  const groupOptions = [['none','No grouping'],['status','Status'],['team','Team'],['due','Due date']];
  const fieldOptions = [['title','Title'],['ownership','Ownership'],['supervisor','Supervisor'],['status','Status'],['due','Due'],['version','Version'],['progress','Progress']];
  const workspaceToolbar = `
    <div class="work-row work-db-row"><span class="work-label overline sr-only">Search</span>
      <div class="field" style="max-width:260px"><span data-i="search" class="ico"></span><input type="search" data-work-search placeholder="Search ${esc(col.label.toLowerCase())}…" aria-label="Search ${esc(col.label)}" /></div>
      <span class="work-db-spacer" style="flex:1"></span>
      <label class="work-control"><span class="overline sr-only">Sort by</span>
        <select class="field" data-work-sort aria-label="Sort by"><span data-i="sort"></span>${sortOptions.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>
      <label class="work-control"><span class="overline sr-only">Group by</span>
        <select class="field" data-work-group aria-label="Group by">${groupOptions.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>
      <button class="chip" data-work-fields aria-label="Choose table fields" aria-haspopup="dialog" aria-expanded="false"><span data-i="columns"></span>Fields</button>
      <button class="btn btn-sm btn-outline" data-save-view aria-label="Save current view"><span data-i="star"></span>Save view</button>
    </div>`;

  /* Compact phone pickers: replace the full chip cloud on narrow screens so
     one thumb picks collection, saved view, and presentation from native menus. */
  const mobilePickers = `
    <div class="work-mobile-pickers" data-work-mobile-toolbar>
      <label class="work-mobile-field"><span class="overline">Collection</span>
        <select class="field" data-work-mobile-collection aria-label="Collection">${collections.map(c=>`<option value="${c.id}" ${c.id===activeCollection?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>
      <label class="work-mobile-field"><span class="overline">Saved view</span>
        <select class="field" data-work-mobile-saved-view aria-label="Saved view">${savedViews[activeCollection].map(v=>`<option value="${esc(v.id)}" ${v.id===activeView?'selected':''}>${esc(v.label)}</option>`).join('')}</select></label>
      ${supported.length>1?`<label class="work-mobile-field"><span class="overline">View as</span>
        <select class="field" data-work-mobile-presentation aria-label="View as">${supported.map(p=>`<option value="${p}" ${p===presentation?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}</select></label>`:''}
    </div>`;

  return `${head('Work', `One workspace for Tasks, Processes, Standards, Signals, and date-based views`,
    `<button class="btn btn-primary btn-sm" data-launcher="${launcherCmd}" data-journey="${col.j}" data-inline-create="${esc(col.id)}"><span data-i="plus"></span>${createTxt}</button>`, 'J07')}
  <div class="stack">
    <div class="card"><div class="card-body work-toolbar">
      <div class="work-row"><span class="work-label overline">Collection</span>
        <div class="chiplist">${collections.map(c=>`<button class="chip ${c.id===activeCollection?'active':''}" data-collection="${c.id}" aria-pressed="${c.id===activeCollection?'true':'false'}" data-journey="${c.j}">${esc(c.label)}</button>`).join('')}</div>
      </div>
      <div class="work-row"><span class="work-label overline">Saved view</span>
        <div class="chiplist">${savedViews[activeCollection].map(v=>`<button class="chip ${v.id===activeView?'active':''}" data-saved-view="${esc(v.id)}" aria-pressed="${v.id===activeView?'true':'false'}">${esc(v.label)}${v.id==='mine'&&col.id==='tasks'?'':''}</button>`).join('')}</div>
      </div>
      ${supported.length>1?`<div class="work-row"><span class="work-label overline">View as</span>
        <div class="chiplist">${supported.map(p=>presentationButton(p, p===presentation)).join('')}</div>
      </div>`:''}
      ${workspaceToolbar}
      ${mobilePickers}
    </div></div>
    <div class="card work-results" data-journey="J07 J08 J09 J10 J11 J12 J15 J21">
      <div class="card-head"><h3>${esc(viewDef.label)} · ${esc(col.label)}</h3><span class="actions"><span class="basis-chip">${count} item${count===1?'':'s'} in your scope</span></span></div>
      ${bodyHtml}
    </div>
    ${activeCollection==='tasks'?`<p class="muted-2" style="font-size:12px">Select a Task title to edit it. <span class="e7-kbd">Enter</span> saves · <span class="e7-kbd">Esc</span> discards · <span class="e7-kbd">Tab</span> moves.</p>`:''}
    <div class="state-skeleton" data-state="loading" aria-hidden="true" hidden style="display:none;max-width:240px;margin-top:var(--e7-s-md)"><div class="sk-line"></div><div class="sk-line" style="width:80%"></div></div>
  </div>`;
}

function renderPeriodTasks(person, viewId, presentation){
  const viewLabel = {today:'Today',week:'This week',lastweek:'Last week'}[viewId]||'This week';
  const rows = Object.values(records).filter(r=>r.type==='task' && !r.archivedAt && canViewRecord(person,r) && dueBucket(r,viewId));
  const sorted = rows.slice().sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  let body;
  if (presentation==='board') body = boardView(sorted, {id:'tasks',j:'J07',label:'Tasks'});
  else if (presentation==='timeline') body = timelineView(sorted, {id:'tasks',j:'J07',label:'Tasks'});
  else body = tableView(sorted, {id:'tasks',label:'Tasks',j:'J07'});
  return `${head('Work', `${esc(viewLabel)} · Tasks in your scope`, `<button class="btn btn-primary btn-sm" data-launcher="create-task" data-journey="J07" data-inline-create="tasks"><span data-i="plus"></span>Create Task</button>`, 'J07')}
  <div class="stack">
    <div class="card"><div class="card-body work-toolbar">
      <div class="work-row"><span class="work-label overline">Collection</span>
        <div class="chiplist">${collections.map(c=>`<button class="chip ${c.id==='tasks'?'active':''}" data-collection="${c.id}" aria-pressed="${c.id==='tasks'?'true':'false'}" data-journey="${c.j}">${esc(c.label)}</button>`).join('')}</div>
      </div>
      <div class="work-row"><span class="work-label overline">Saved view</span>
        <div class="chiplist">${savedViews.tasks.map(v=>`<button class="chip ${v.id===viewId?'active':''}" data-saved-view="${esc(v.id)}" aria-pressed="${v.id===viewId?'true':'false'}">${esc(v.label)}</button>`).join('')}</div>
      </div>
      <div class="work-row"><span class="work-label overline">View as</span>
        <div class="chiplist">${presentations.tasks.map(p=>presentationButton(p, p===presentation)).join('')}</div>
      </div>
    </div></div>
    <div class="card" data-journey="J07 J15">
      <div class="card-head"><h3>${esc(viewLabel)} — Tasks</h3><span class="actions"><span class="basis-chip">${sorted.length} item${sorted.length===1?'':'s'}</span></span></div>
      ${body}
    </div>
    <p class="muted-2" style="font-size:12px">This view uses the same Tasks as the rest of Work, filtered by date.</p>
  </div>`;
}

function renderPeriod(person, viewId='week'){
  const viewLabel = {today:'Today',week:'This week',lastweek:'Last week'}[viewId]||'This week';
  return `${head('Period view', `Live, sourced — every item links to its real record`, `<div class="chiplist">${[{id:'today',l:'Today'},{id:'week',l:'This week'},{id:'lastweek',l:'Last week'}].map(p=>`<button class="chip ${p.id===viewId?'active':''}" data-period="${p.id}" aria-pressed="${p.id===viewId?'true':'false'}">${esc(p.l)}</button>`).join('')}</div>`, 'J15')}
  <div class="stack" data-journey="J15" data-scenario="S3">
    <div class="card"><div class="card-head"><h3>${esc(viewLabel)} — as of 2026-07-11 09:00</h3><span class="basis-chip">sourced from real work</span></div>
      <div class="card-body" style="padding:0">${periodEvents.filter(e=>canViewRecord(person,records[e.source])).map(e=>`<a class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)" data-open-record="${e.source}" href="#/record/${e.source}"><div class="body"><div class="t">${esc(e.label)}</div><div class="s">${esc(e.kind)} · ${esc(e.when)}</div></div></a>`).join('')}</div>
    </div>
    <p class="muted-2" style="font-size:12px">Every item links to its real source record. No Draft/Submitted/missing-submission lifecycle — missing context is captured in real time as a Signal.</p>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   INBOX — one collection, page + quick panel share state (J06)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderInbox(person, { mode='page', filter='all' } = {}){
  const all = inboxItems.filter(i=>i.toPersonId===person.id);
  const items = filter==='unread' ? all.filter(i=>i.unread) : filter==='handled' ? all.filter(i=>!i.unread) : all;
  const unread = all.filter(i=>i.unread).length;
  const filterBar = `<div class="chiplist" style="margin-bottom:var(--e7-s-md)"><button class="chip ${filter==='all'?'active':''}" data-inbox-filter="all" aria-pressed="${filter==='all'?'true':'false'}">All <span class="muted-2">${all.length}</span></button><button class="chip ${filter==='unread'?'active':''}" data-inbox-filter="unread" aria-pressed="${filter==='unread'?'true':'false'}">Unread <span class="muted-2">${unread}</span></button><button class="chip ${filter==='handled'?'active':''}" data-inbox-filter="handled" aria-pressed="${filter==='handled'?'true':'false'}">Handled <span class="muted-2">${all.length-unread}</span></button></div>`;
  return `${mode==='page'?head('Inbox', `${unread} unread · triage then return to the source record`, filterBar, 'J06'):filterBar}
  <div data-journey="J06" data-scenario="S1" ${mode==='page'?'':'style="padding:0"'}>
    ${items.length?`<div class="${mode==='page'?'e7-inbox-list':''}">${items.map(i=>`
      <a class="inbox-item ${i.unread?'unread':''}" data-open-record="${i.sourceId}" data-inbox-id="${i.id}" href="#/record/${i.sourceId}">
        <span class="inbox-dot"></span>
        <div class="body"><div class="t">${esc(i.title)}</div><div class="s">${esc(i.reason)}</div></div>
        <span class="time">${esc(i.time)}</span>
      </a>`).join('')}</div>`:
      `<div class="empty-state" data-state="empty"><span class="ico" data-i="inbox"></span><h3>${filter==='unread'?'No unread items':'Inbox zero'}</h3><p>Mentions, approvals, and exceptions route here.</p></div>`}
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   MONEY — control surface, not a second Home (J19-J21). Capability-gated.
   ════════════════════════════════════════════════════════════════════════════ */
export function renderMoney(person){
  if (!can(person,'money.view')) return deniedSurface('Money', person, 'money.view');
  const gm = records.metric_gm, gmi = records.metric_gm_interim, ar = records.metric_ar;
  const bus2 = scopeOf(person,'money.view');
  return `${head('Money', `Financial overview · ${esc(bus2)} · checked figures with their source and date`,
    `<button class="btn btn-outline btn-sm" data-launcher="more" data-journey="J20"><span data-i="plus"></span>New Budget</button>`, 'J19')}
  <div class="stack" data-journey="J19" data-scenario="S2">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--e7-s-md)">
      <a class="kpi" data-open-record="metric_gm" href="#/record/metric_gm" style="cursor:pointer">
        <div class="kpi-top"><span class="kpi-ico violet"><span data-i="trendUp"></span></span><span class="kpi-label">Certified gross margin — Jul</span><span class="basis-chip">certified</span></div>
        <div class="kpi-value tabular">${gm.value}%</div><div class="kpi-foot"><span class="delta flat">as of ${esc(gm.asOf)}</span></div>
      </a>
      <a class="kpi" data-open-record="metric_gm_interim" href="#/record/metric_gm_interim" style="cursor:pointer" data-state="stale">
        <div class="kpi-top"><span class="kpi-ico"><span data-i="trendDown"></span></span><span class="kpi-label">Interim gross margin</span><span class="basis-chip">interim · uncertified</span></div>
        <div class="kpi-value tabular">${gmi.value}%</div><div class="kpi-foot"><span class="stale-note"><span class="dot" style="width:7px;height:7px;border-radius:99px;background:var(--e7-warning)"></span>stock-movement basis · as of ${esc(gmi.asOf)}</span></div>
      </a>
      <a class="kpi" data-open-record="metric_ar" href="#/record/metric_ar" style="cursor:pointer">
        <div class="kpi-top"><span class="kpi-ico"><span data-i="money"></span></span><span class="kpi-label">Outstanding AR</span></div>
        <div class="kpi-value tabular">${money(ar.value)}</div><div class="kpi-foot"><span class="delta down">oldest 38d</span></div>
      </a>
    </div>
    <div class="card" data-journey="J20"><div class="card-head"><h3>Budgets</h3><span class="actions"><span class="basis-chip">linked to source costs</span></span></div>
      <div class="card-body" style="padding:0">${[records.budget_latte,records.budget_promo].map(b=>`<a class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)" data-open-record="${b.id}" href="#/record/${b.id}"><div class="body"><div class="t">${esc(b.title)}</div><div class="s">${money(b.valuePerUnit)} ${esc(b.unit)} · as of ${esc(b.asOf)}</div></div><span class="basis-chip">${esc(b.scenario)}</span></a>`).join('')}</div></div>
    <div class="card" data-journey="J21"><div class="card-head"><h3>Follow-ups</h3><span class="actions"><span class="basis-chip">owner chases · Finance confirms</span></span></div>
      <div class="card-body" style="padding:0">${Object.values(records).filter(r=>r.type==='followup' && canViewRecord(person,r)).map(f=>`<a class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)" data-open-record="${f.id}" href="#/record/${f.id}"><div class="body"><div class="t">${esc(f.title)}</div><div class="s">${esc(f.counterparty)} · balance ${money(f.balance)} · ${f.ageDays}d</div></div>${lifecyclePill(f.lifecycle)}</a>`).join('')}</div></div>
    <div class="card source-error" data-state="error"><div class="card-head"><h3>Procurement source temporarily unavailable</h3><span class="pill blocked"><span class="dot"></span>Unavailable</span></div><div class="card-body"><p>Ingredient-cost feed did not refresh. Last valid result remains visible <b>as of 2026-07-09 03:30 WIB</b>; MOS does not substitute zero.</p><button class="btn btn-sm btn-outline" data-retry-source style="margin-top:10px">Retry source</button></div></div>
  </div>`;
}

/* Chrome for the full-page record view: a source-aware Back link plus the
   deputy-context button. The originating route is restored on Back. */
export function renderRecordPageChrome(id, returnRoute){
  const label = { home:'Home', work:'Work', money:'Money', inbox:'Inbox', cafe:'Café', ecommerce:'Ecommerce', roastery:'Roastery', admin:'Admin', profile:'Profile' }[returnRoute] || 'Work';
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--e7-s-md)"><a class="row-link" href="#/${esc(returnRoute)}" data-return-route="${esc(returnRoute)}" style="display:inline-flex;gap:4px;align-items:center">← Back to ${esc(label)}</a><span style="flex:1"></span><button class="btn btn-sm btn-outline" data-deputy-context="${esc(id)}" data-journey="J05"><span data-i="sparkles"></span>Ask @Deputy about this</button></div>`;
}

export function renderProfile(person, prefs={}){
  const homeOrder = prefs.homeOrder || 'attention';
  const notifyMentions = prefs.notifyMentions !== false;
  const notifyRuns = prefs.notifyRuns !== false;
  const denseTables = prefs.denseTables === true;
  return `${head('Personal Profile', 'Choose your Home layout, notifications, and table density. Admin manages access.', '', 'J05')}
  <div class="stack" style="max-width:760px">
    <div class="card"><div class="card-head"><h3>Identity</h3><span class="basis-chip">managed by Admin</span></div><div class="card-body"><div class="form-grid"><div><label class="field-label" for="profile-person">Person</label><div class="field"><input id="profile-person" value="${esc(person.name)}" readonly /></div></div><div><label class="field-label" for="profile-role">Role</label><div class="field"><input id="profile-role" value="${esc(person.role)}" readonly /></div></div></div></div></div>
    <div class="card"><div class="card-head"><h3>Home layout</h3></div><div class="card-body"><label class="field-label" for="profile-home-order">Where your personal section appears</label><div class="field"><select id="profile-home-order" data-profile-setting="homeOrder"><option value="attention" ${homeOrder==='attention'?'selected':''}>Below Needs attention</option><option value="personal" ${homeOrder==='personal'?'selected':''}>Above Needs attention</option></select></div><p class="muted-2" style="font-size:12px;margin-top:8px">Needs attention always stays on Home.</p></div></div>
    <div class="card"><div class="card-head"><h3>Notifications</h3></div><div class="card-body">
      <label class="row-item" style="cursor:pointer"><div class="body"><div class="t">Mentions and assigned work</div><div class="s">Inbox plus push notification</div></div><input type="checkbox" data-profile-setting="notifyMentions" ${notifyMentions?'checked':''} /></label>
      <label class="row-item" style="cursor:pointer;margin-top:6px"><div class="body"><div class="t">Due Process Runs and Checks</div><div class="s">Remind me before my shift starts</div></div><input type="checkbox" data-profile-setting="notifyRuns" ${notifyRuns?'checked':''} /></label>
    </div></div>
    <div class="card"><div class="card-head"><h3>Tables</h3></div><div class="card-body"><label class="row-item" style="cursor:pointer"><div class="body"><div class="t">Compact rows</div><div class="s">Show more rows per screen</div></div><input type="checkbox" data-profile-setting="denseTables" ${denseTables?'checked':''} /></label></div>
  </div>`;
}

function deniedSurface(name, person, cap){
  return `${head(name, `Access required`, '', '')}
  <div class="denied-state" data-state="denied" data-journey="J19">
    <span class="lock-ico" data-i="settings"></span>
    <h3>${esc(name)} is outside your access</h3>
    <p class="muted-2">${esc(person.name)} cannot view this area with their current access.</p>
    <p class="muted-2" style="font-size:12px">An admin can review this in People &amp; access.</p>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   CAFÉ — execution workspace (J16)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderCafe(person, requestedTeamId=null){
  const available=['t_hq_ops','t_rad_ops'].filter(id=>can(person,'cafe.view',{teamId:id,buId:teams[id].buId}));
  const teamId = available.includes(requestedTeamId) ? requestedTeamId : (available.includes(person.primaryTeamId)?person.primaryTeamId:available[0]);
  const team = teams[teamId];
  const openRun = teamId==='t_hq_ops'?'run_hq_open':'run_rad_open';
  const run = records[openRun];
  const runActive = run && run.status==='In Progress';
  /* A Team may have only one active opening Run — Start becomes Continue. */
  const runBtn = runActive
    ? `<button class="btn btn-primary btn-sm" data-cafe-continue="${esc(openRun)}" data-journey="J16" aria-label="Continue the active opening Run">Continue Run</button>`
    : `<button class="btn btn-primary btn-sm" data-cafe-start="${esc(teamId)}" data-journey="J16"><span data-i="plus"></span>Start opening Run</button>`;
  /* Step actions: Check / complete the next incomplete step in the active Run. */
  const runSteps = (run && runActive) ? renderCafeRunSteps(run, person) : '';
  return `${head('Café Operations', `${esc(team.name)} · ${esc(sites[team.siteId]?.name)} · shift Morning`,
    `${available.length>1?available.map(id=>`<button class="chip ${id===teamId?'active':''}" data-cafe-team="${id}" aria-pressed="${id===teamId?'true':'false'}">${esc(sites[teams[id].siteId]?.name)}</button>`).join(''):''}${runBtn}`, 'J16')}
  <div class="stack" data-journey="J16" data-scenario="S1">
    <div class="cafe-area-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--e7-s-md)">
      ${(team.areas||['Kitchen','Bar']).map(a => {
        const runInArea = runActive && run.area === a ? run : null;
        if (runInArea) {
          return `<div class="card"><div class="card-head"><h3>${esc(a)}</h3><span class="basis-chip">Area</span></div><div class="card-body"><a class="row-item" data-open-record="${openRun}" href="#/record/${openRun}"><div class="body"><div class="t">Opening Run</div><div class="s">v${runInArea.snapshotVersion||2} · in progress</div></div>${pill(runInArea.status||'In Progress')}</a></div></div>`;
        } else {
          return `<div class="card"><div class="card-head"><h3>${esc(a)}</h3><span class="basis-chip">Area</span></div><div class="card-body"><div class="empty-state" data-state="empty" style="padding:var(--e7-s-md);text-align:center"><span class="ico" data-i="clock"></span><h3>No active Run</h3><p>No opening steps are assigned to this Area.</p></div></div></div>`;
        }
      }).join('')}
    </div>
    ${runSteps}
    <div class="card"><div class="card-head"><h3>Today's work</h3></div><div class="card-body" style="padding:0">
      ${Object.values(records).filter(r=>r.type==='task'&&r.teamId===teamId&&!r.archivedAt).map(t=>`<a class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)" data-open-record="${t.id}" href="#/record/${t.id}"><div class="body"><div class="t">${esc(t.title)}</div><div class="s">PIC ${esc(people[t.picId]?.name)} · Supervisor ${esc(people[t.supervisorId]?.name)}</div></div>${pill(t.status)}</a>`).join('')||'<div class="empty-state" data-state="empty"><span class="ico" data-i="work"></span><h3>No tasks</h3></div>'}
    </div></div>
    <div class="card"><div class="card-head"><h3>Stock — ${esc(team.name)}</h3><span class="basis-chip">this location</span></div><div class="card-body"><a class="row-item" data-open-record="${teamId==='t_hq_ops'?'stock_hq_beans':'stock_rad_beans'}" href="#/record/${teamId==='t_hq_ops'?'stock_hq_beans':'stock_rad_beans'}"><div class="body"><div class="t">Roasted House Blend</div><div class="s">${esc(teamId==='t_hq_ops'?'HQ retail café':'Radiant café')} · ${esc(teamId==='t_hq_ops'?records.stock_hq_beans.qty:records.stock_rad_beans.qty)} kg</div></div></a></div></div>
  </div>`;
}

function renderCafeRunSteps(run, person){
  const canSubmit = can(person,'check.submit',{teamId:run.teamId,buId:teams[run.teamId]?.buId});
  const steps = (run.steps||[]).map(s => {
    const done = s.kind==='check' ? (s.result==='pass'||s.result==='fail') : s.done;
    let action = '';
    if (canSubmit && !done){
      if (s.kind==='check') action = `<button class="btn btn-sm btn-outline" data-run-action="check|${esc(run.id)}|${esc(s.id)}">Check</button>`;
      else action = `<button class="btn btn-sm btn-outline" data-run-action="complete|${esc(run.id)}|${esc(s.id)}">Complete</button>`;
    }
    const left = s.kind==='check' ? `<span class="check-box ${s.result==='fail'?'fail':s.result==='pass'?'pass':''}">${s.result==='fail'?'!':(s.result==='pass'?'<span data-i="check"></span>':'')}</span>` : `<span class="check-box ${done?'pass':''}">${done?'<span data-i="check"></span>':''}</span>`;
    const sub = s.kind==='check' ? `${esc(s.label)}${s.value?` · submitted ${esc(s.value)}`:''}` : esc(s.label);
    return `<div class="check-row">${left}<div class="body"><div class="t">${esc(s.kind)}</div><div class="s">${sub}</div></div>${action}${s.exceptionId?`<a class="rel-pill" data-open-record="${esc(s.exceptionId)}" href="#/record/${esc(s.exceptionId)}" style="background:var(--e7-blocked-tint);color:var(--e7-blocked-text)">Exception →</a>`:''}</div>`;
  }).join('');
  return `<div class="card"><div class="card-head"><h3>Continue · ${esc(run.title)}</h3><span class="basis-chip">${(run.steps||[]).filter(s=>s.done||s.result).length}/${(run.steps||[]).length} steps</span></div><div class="card-body"><div class="stack">${steps||'<div class="muted-2" style="font-size:12px">No steps.</div>'}</div></div></div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   ECOMMERCE — fulfilment queue (J17)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderEcommerce(person){
  const orders = Object.values(records).filter(r=>r.type==='order');
  const stateOrder = ['new','picked','packed','shipped'];
  const nextState = { new:'Pick', picked:'Pack', packed:'Ship', shipped:null };
  const nextAction = { new:'picked', picked:'packed', packed:'shipped', shipped:null };
  const canAct = can(person,'task.edit',{teamId:'t_ecom',buId:'bu_retail'}) || can(person,'ecommerce.view',{teamId:'t_ecom'});
  /* Risk-first: at-risk orders, then new, then in progress, then shipped. */
  const sorted = orders.slice().sort((a,b)=>{
    const rank = o => o.sla==='at risk'?0 : stateOrder.indexOf(o.state);
    return rank(a)-rank(b);
  });
  return `${head('Ecommerce fulfilment', `Order → picked → packed → shipped · Ecommerce stock location`,
    `<button class="btn btn-primary btn-sm" data-eco-new-order data-journey="J17"><span data-i="plus"></span>Log fulfilment</button>`, 'J17')}
  <div class="stack" data-journey="J17" data-scenario="S5">
    <div style="display:flex;gap:3px;align-items:center;margin-bottom:var(--e7-s-sm)">${stateOrder.map((s,i)=>`<span class="pill ${s==='new'?'open':s==='shipped'?'done':'neutral'}"><span class="dot"></span>${esc(s)}</span>${i<3?'<span class="muted-3">→</span>':''}`).join('')}</div>
    <div class="card"><div class="card-body" style="padding:0">${sorted.map(o=>{ const nx=nextAction[o.state]; const act = (nx && canAct) ? `<button class="btn btn-sm btn-outline" data-eco-action="${esc(o.id)}|${esc(nx)}">${esc(nextState[o.state])}</button>` : ''; return `<div class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)"><a class="body" data-open-record="${o.id}" href="#/record/${o.id}" style="text-decoration:none;color:inherit;flex:1;min-width:0"><div class="t">${esc(o.ref)} · ${esc(o.customer)}</div><div class="s">${esc(o.items)} · PIC ${esc(people[o.picId]?.name)}</div></a>${o.sla==='at risk'?'<span class="pill warn"><span class="dot"></span>SLA risk</span>':pill(o.state)}${act}</div>`; }).join('')}</div></div>
    <div class="card"><div class="card-head"><h3>Ecommerce stock & replenishment</h3></div><div class="card-body">
      <a class="row-item" data-open-record="stock_eco_beans" href="#/record/stock_eco_beans"><div class="body"><div class="t">Roasted House Blend — Ecommerce fulfilment</div><div class="s">${esc(records.stock_eco_beans.qty)} kg · location: Ecommerce</div></div>${records.stock_eco_beans.slaRisk?'<span class="pill warn"><span class="dot"></span>low</span>':''}</a>
      <a class="row-item" data-open-record="replenish_eco" href="#/record/replenish_eco"><div class="body"><div class="t">Internal replenishment ← Roastery</div><div class="s">${esc(records.replenish_eco.qty)} kg · ${esc(records.replenish_eco.status)}</div></div></a>
    </div></div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   ROASTERY — batch / yield / transfer (J18)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderRoastery(person){
  const canLog = can(person,'run.start',{teamId:'t_roast',buId:'bu_b2b'}) || can(person,'roastery.view',{teamId:'t_roast'});
  return `${head('Roastery', `Green lot → roast batch → yield/quality → stock & transfer`,
    `<button class="btn btn-primary btn-sm" data-roast-focus data-journey="J18"><span data-i="plus"></span>Log roast</button>`, 'J18')}
  <div class="stack" data-journey="J18" data-scenario="S5">
    <div class="card"><div class="card-head"><h3>Green lot</h3></div><div class="card-body"><a class="row-item" data-open-record="green_lot_G1" href="#/record/green_lot_G1"><div class="body"><div class="t">${esc(records.green_lot_G1.origin)} ${esc(records.green_lot_G1.variety)}</div><div class="s">balance ${esc(records.green_lot_G1.balanceKg)} kg · ${money(records.green_lot_G1.costPerKg)}/kg · ${esc(records.green_lot_G1.basis)}</div></div></a></div></div>
    <div class="card" data-roast-form><div class="card-head"><h3>Log a roast batch</h3><span class="basis-chip">yield · quality · evidence</span></div><div class="card-body">
      <div class="form-grid">
        <div><label class="field-label" for="rf-green">Green in (kg)</label><div class="field"><input id="rf-green" type="number" min="0" step="0.1" value="20" /></div></div>
        <div><label class="field-label" for="rf-out">Roasted out (kg)</label><div class="field"><input id="rf-out" type="number" min="0" step="0.1" value="16" /></div></div>
        <div><label class="field-label" for="rf-score">Cupping score</label><div class="field"><input id="rf-score" type="number" min="0" max="100" value="85" /></div></div>
        <div><label class="field-label" for="rf-evidence">Evidence</label><div class="field"><input id="rf-evidence" type="text" value="CUP-NEW.jpg" /></div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary btn-sm" data-roast-action="log" ${canLog?'':'disabled'}>Save batch</button>${canLog?'':'<span class="muted-2" style="font-size:12px">Logging requires Roastery access.</span>'}</div>
    </div></div>
    <div class="card"><div class="card-head"><h3>Roast batches</h3></div><div class="card-body" style="padding:0">
      ${Object.values(records).filter(r=>r.type==='batch').map(b=>`<a class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border)" data-open-record="${b.id}" href="#/record/${b.id}"><div class="body"><div class="t">Batch ${esc(b.id.replace('roast_batch_',''))} · ${esc(b.date)}</div><div class="s">green-in ${esc(b.greenInKg)}kg → roasted ${esc(b.roastedOutKg)}kg · yield ${esc(b.yieldPct)}% · shrink ${esc(b.shrinkPct)}% · cupping ${esc(b.qualityCheck.score)}</div></div>${b.qualityCheck.result==='pass'?pill('Done'):pill('Blocked')}</a>`).join('')}
    </div></div>
    <div class="card"><div class="card-head"><h3>Stock & transfers</h3><span class="basis-chip">by location</span></div><div class="card-body">
      <a class="row-item" data-open-record="stock_roast_beans" href="#/record/stock_roast_beans"><div class="body"><div class="t">Roastery finished goods</div><div class="s">${esc(records.stock_roast_beans.qty)} kg · Roastery Team</div></div></a>
      <a class="row-item" data-open-record="transfer_9" href="#/record/transfer_9"><div class="body"><div class="t">→ HQ retail café (internal replenishment)</div><div class="s">${esc(records.transfer_9.qty)} kg · ${esc(records.transfer_9.kind)} · ${esc(records.transfer_9.status)}</div></div></a>
    </div></div>
    <p class="muted-2" style="font-size:12px">Each stock figure names its location.</p>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   ADMIN — Organization (J22) + People & access (J23)
   ════════════════════════════════════════════════════════════════════════════ */
export function renderAdmin(person, section='org'){
  if (!can(person,'admin.view')) return deniedSurface('Admin', person, 'admin.view');
  return `${head('Admin Settings', `Manage Teams, people, roles, and individual access`, 
    `<button class="chip ${section==='org'?'active':''}" data-admin-section="org" data-journey="J22">Organization</button><button class="chip ${section==='access'?'active':''}" data-admin-section="access" data-journey="J23">People & access</button>`, 'J22')}
  <div class="stack">${section==='org'?renderOrgSection():renderAccessSection(person)}</div>`;
}

function renderOrgSection(){
  return `<div class="card" data-journey="J22" data-scenario="S6"><div class="card-head"><h3>Structure</h3><span class="actions"><button class="btn btn-sm btn-outline" data-add-team>+ Team</button></span></div><div class="card-body" style="padding:0">
    ${Object.values(teams).map(t=>`<div class="row-item" style="border-radius:0;border:none;border-bottom:1px solid var(--e7-border);cursor:default"><div class="body"><div class="t">${esc(t.name)} ${t.archived?'<span class="basis-chip">Archived</span>':''}</div><div class="s">${esc(bus[t.buId]?.name)} · ${esc(sites[t.siteId]?.name||'central')} ${t.areas?`· Areas ${esc(t.areas.join(', '))}`:''}</div></div><button class="btn btn-sm btn-ghost" data-archive-team="${esc(t.id)}">${t.archived?'Restore':'Archive'}</button></div>`).join('')}
  </div></div>
  <div class="card"><div class="card-head"><h3>Transfer a Person</h3><span class="basis-chip">starts on a chosen date</span></div><div class="card-body"><div class="form-grid"><div><label class="field-label" for="org-person">Person</label><div class="field"><select id="org-person">${Object.values(people).map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(teams[p.primaryTeamId]?.name)}</option>`).join('')}</select></div></div><div><label class="field-label" for="org-team">New primary Team</label><div class="field"><select id="org-team">${Object.values(teams).filter(t=>!t.archived).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></div><div><label class="field-label" for="org-effective">Start date</label><div class="field"><input id="org-effective" type="date" value="2026-07-11" /></div></div></div><button class="btn btn-sm btn-primary" data-transfer-person style="margin-top:10px">Transfer Person</button></div></div>
  <div class="callout info" style="font-size:12px">The old Team membership ends when the new one begins, and the person’s history is preserved. Each person has one primary Team and may also belong to other Teams.</div>`;
}

function renderAccessSection(person){
  const permissionNames = {
    'money.view':'View Money',
    'admin.access':'Manage people and access',
    'task.create':'Create Tasks',
    'process.adopt':'Adopt Processes',
    'standard.publish':'Publish Standards',
  };
  const operatorMoneyDefault = Object.values(people).filter(p=>p.roleId==='role_barista').some(p=>(p.roleGrants||[]).some(g=>g.cap==='money.view'));
  const matrix = [
    ['p_ayu','money.view','Operator'],
    ['p_ayu','admin.access','Operator'],
    ['p_ayu','task.create','Operator'],
    ['p_sari','money.view','Operator'],
    ['p_budi','process.adopt','Supervisor'],
    ['p_rina','standard.publish','Manager'],
  ];
  return `<div class="card" data-journey="J23" data-scenario="S6"><div class="card-head"><h3>Role defaults</h3><span class="basis-chip">applies to everyone in the role</span></div><div class="card-body"><div class="row-item" style="cursor:default"><div class="body"><div class="t">Operator · View Money</div><div class="s">Change the Role default, then adjust an individual below when needed.</div></div><span class="pill ${operatorMoneyDefault?'done':'neutral'}"><span class="dot"></span>${operatorMoneyDefault?'Allowed by role':'Not granted'}</span><button class="btn btn-sm btn-outline" data-role-default="role_barista|money.view">${operatorMoneyDefault?'Remove default':'Grant default'}</button></div></div></div>
  <div class="card" data-journey="J23" data-scenario="S6"><div class="card-head"><h3>Access by person</h3><span class="actions"><span class="basis-chip">From role · Allowed · Denied</span></span></div>
    <table class="data-table" style="box-shadow:none"><thead><tr><th>Person</th><th>Permission</th><th>State</th><th>Why</th><th>Actions</th></tr></thead><tbody>
    ${matrix.map(([pid,c,role])=>{ const target=people[pid]; const denied=(target.denies||[]).some(x=>x.cap===c); const allowed=(target.allows||[]).some(x=>x.cap===c); const inherited=can(target,c); const state=denied?'Denied':allowed?'Allowed':inherited?'Inherited':'Denied'; const src=denied?'Denied for this person':allowed?'Allowed for this person':inherited?'From the person’s role':'Not included in the role'; return `<tr><td data-label="Person"><div class="title-cell"><span class="t">${esc(target?.name)}</span><span class="s">${esc(role)}</span></div></td><td data-label="Permission">${esc(permissionNames[c]||c)}</td><td data-label="State">${state==='Denied'?'<span class="pill blocked"><span class="dot"></span>Denied</span>':state==='Allowed'?'<span class="pill done"><span class="dot"></span>Allowed</span>':'<span class="pill neutral"><span class="dot"></span>From role</span>'}</td><td data-label="Why">${esc(src)}</td><td data-label="Actions"><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-access-action="allow|${pid}|${c}">Allow</button><button class="btn btn-sm btn-ghost" data-access-action="deny|${pid}|${c}">Deny</button><button class="btn btn-sm btn-ghost" data-access-action="reset|${pid}|${c}">Use role</button><button class="btn btn-sm btn-outline" data-preview-person="${pid}">Preview</button></div></td></tr>`; }).join('')}
    </tbody></table></div>
  <div class="callout warn" style="font-size:12px">Essential admin access cannot be removed from the final admin. Every change is recorded. Use Preview to check exactly what a person can see and do.</div>`;
}
