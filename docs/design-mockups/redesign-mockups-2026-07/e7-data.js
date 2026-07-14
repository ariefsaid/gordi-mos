/* ════════════════════════════════════════════════════════════════════════════
   E7 DATA — immutable fixtures, capability registry, route/coverage registries
   Static + in-memory only. Representative people/Teams/Sites/figures are
   fixtures, NOT approved production seed truth. can() is a fixture, not auth.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── Org taxonomy: BU ≠ Site ≠ Team (ADR-0025 D36/D39/D41) ─────────────────── */
export const bus = {
  bu_retail:   { id:'bu_retail',   name:'Retail Ops',   kind:'revenue' },
  bu_b2b:      { id:'bu_b2b',      name:'B2B Ops',      kind:'revenue' },
  bu_finance:  { id:'bu_finance',  name:'Finance',      kind:'support' },
  bu_marketing:{ id:'bu_marketing',name:'Marketing',    kind:'support' },
  bu_b2bsales: { id:'bu_b2bsales', name:'B2B Sales',    kind:'support' },
};
export const sites = {
  s_hq:   { id:'s_hq',   name:'Gordi HQ' },
  s_rad:  { id:'s_rad',  name:'Radiant' },
  s_roast:{ id:'s_roast',name:'Roastery' },
};
export const teams = {
  t_hq_ops:  { id:'t_hq_ops',  name:'Gordi HQ Operations', buId:'bu_retail',   siteId:'s_hq',   signalLayer:0, areas:['Kitchen','Bar'] },
  t_rad_ops: { id:'t_rad_ops', name:'Radiant Operations',  buId:'bu_retail',   siteId:'s_rad',  signalLayer:0, areas:['Kitchen','Bar'] },
  t_ecom:    { id:'t_ecom',    name:'Ecommerce Team',      buId:'bu_retail',   siteId:'s_hq',   signalLayer:0 },
  t_roast:   { id:'t_roast',   name:'Roastery Team',       buId:'bu_b2b',      siteId:'s_roast',signalLayer:0 },
  t_finance: { id:'t_finance', name:'Finance Team',        buId:'bu_finance',  siteId:null,     signalLayer:2 },
};
export const roles = {
  role_barista:   { id:'role_barista',   name:'Barista',          buId:'bu_retail' },
  role_supervisor:{ id:'role_supervisor',name:'Branch Supervisor',buId:'bu_retail' },
  role_ops_head:  { id:'role_ops_head',  name:'Retail Ops Head',  buId:'bu_retail' },
  role_finance:   { id:'role_finance',   name:'Finance Controller',buId:'bu_finance' },
  role_b2b_head:  { id:'role_b2b_head',  name:'B2B Ops Head',     buId:'bu_b2b' },
  role_owner:     { id:'role_owner',     name:'Owner',            buId:'bu_retail' },
};
export const accessRoles = {
  ar_operator:  { id:'ar_operator',  name:'Operator',  caps:['home.view','work.view','inbox.view','task.create','task.edit','signal.create','signal.correct','run.start','check.submit','deputy.use'] },
  ar_supervisor:{ id:'ar_supervisor',name:'Supervisor',caps:['home.view','work.view','inbox.view','task.create','task.edit','signal.create','signal.correct','run.start','run.complete','check.submit','process.adopt','deputy.use'] },
  ar_manager:   { id:'ar_manager',   name:'Manager',   caps:['home.view','work.view','inbox.view','money.view','task.create','task.edit','signal.create','signal.create_for_team','signal.mention_bu','signal.correct','process.draft','process.publish','process.adopt','standard.publish','standard.adopt','budget.view','deputy.use'] },
  ar_finance:   { id:'ar_finance',   name:'Finance',   caps:['home.view','work.view','inbox.view','money.view','task.create','task.edit','signal.create','signal.mention_bu','process.draft','process.publish','process.adopt','standard.publish','run.start','run.complete','check.submit','budget.create','budget.view','followup.chase','followup.settle','deputy.use'] },
  ar_admin:     { id:'ar_admin',     name:'Admin',     caps:['home.view','work.view','inbox.view','money.view','cafe.view','ecommerce.view','roastery.view','admin.view','admin.org','admin.access','task.create','task.edit','signal.create','signal.create_for_team','signal.mention_bu','signal.correct','signal.retract','process.draft','process.publish','process.adopt','standard.publish','standard.adopt','run.start','run.complete','check.submit','budget.create','budget.view','followup.chase','followup.settle','deputy.use'] },
};

/* Scope helper — does a grant scope cover the requested context? */
function scopeMatch(scope, person, ctx = {}) {
  if (!scope || scope === 'org') return true;          // org-wide always covers
  if (scope.type === 'own_team') {
    const mine = [person.primaryTeamId, ...(person.additionalTeams||[])];
    return !ctx.teamId || mine.includes(ctx.teamId);
  }
  if (scope.type === 'own_bu') return !ctx.buId || ctx.buId === person.buId;
  if (scope.type === 'selected_teams') return !ctx.teamId || scope.ids.includes(ctx.teamId);
  if (scope.type === 'selected_bus') return !ctx.buId || scope.ids.includes(ctx.buId);
  if (scope.type === 'self') return !ctx.personId || ctx.personId === person.id;
  return false;
}
function capMatch(ruleCap, cap) {
  return ruleCap === '*' || ruleCap === cap || cap.startsWith(ruleCap + '.');
}

/**
 * can(person, capability, ctx?) — fixture authorization.
 * Resolution: explicit Deny → explicit Allow → union of role grants → default deny.
 * NOT production authorization. The UI may explain the result, never pretend it is RLS.
 */
export function can(person, capability, ctx) {
  if (!person) return false;
  const deny = (person.denies||[]).some(r => capMatch(r.cap, capability) && scopeMatch(r.scope, person, ctx));
  if (deny) return false;
  const allow = (person.allows||[]).some(r => capMatch(r.cap, capability) && scopeMatch(r.scope, person, ctx));
  if (allow) return true;
  return (person.roleGrants||[]).some(r => capMatch(r.cap, capability) && scopeMatch(r.scope, person, ctx));
}

/* Effective scope label for UI explanations */
export function scopeOf(person, capability) {
  const g = (person.roleGrants||[]).find(r => capMatch(r.cap, capability));
  if (!g || !g.scope) return 'org';
  if (g.scope === 'org') return 'org';
  if (g.scope.type === 'own_team') return 'own team';
  if (g.scope.type === 'own_bu') return 'own BU';
  if (g.scope.type === 'selected_teams') return 'selected Teams';
  if (g.scope.type === 'selected_bus') return 'selected BUs';
  if (g.scope.type === 'self') return 'self';
  return 'org';
}

/**
 * Canonical record visibility for the static prototype. The same predicate is
 * used by lists, panel opens, command results, and full-page deep links so the
 * shell cannot reveal a record that its originating surface would hide.
 */
export function canViewRecord(person, record) {
  if (!person || !record) return false;
  if (['budget','metric','followup','ingredient'].includes(record.type)) {
    return can(person, 'money.view');
  }
  if (record.type === 'signal') {
    const mentioned = (record.mentions || []).some(m =>
      (m.kind === 'person' && m.ref === person.id) ||
      (m.kind === 'team' && [person.primaryTeamId, ...(person.additionalTeams || [])].includes(m.ref))
    );
    return mentioned || can(person, 'work.view', { teamId: record.owningTeamId, buId: teams[record.owningTeamId]?.buId });
  }
  const moduleCap = {
    greenlot: 'roastery.view', batch: 'roastery.view', transfer: 'roastery.view',
    order: 'ecommerce.view', replenish: 'ecommerce.view',
  }[record.type];
  if (moduleCap) return can(person, moduleCap, { teamId: record.teamId, buId: teams[record.teamId]?.buId });

  const teamIds = [
    record.teamId,
    ...(record.participatingTeams || []),
    ...Object.values(teams).filter(t => record.buId && t.buId === record.buId).map(t => t.id),
  ].filter(Boolean);
  if (teamIds.length) {
    return teamIds.some(teamId => can(person, 'work.view', { teamId, buId: teams[teamId]?.buId || record.buId }));
  }
  return can(person, 'work.view', record.buId ? { buId: record.buId } : undefined);
}

/* ── Representative people (6 in the switcher) + support people as PICs ─────── */
const ownT = { type:'own_team' }, ownB = { type:'own_bu' }, orgS = 'org', selfS = { type:'self' };
const st = (...ids) => ({ type:'selected_teams', ids });
const sb = (...ids) => ({ type:'selected_bus', ids });

export const people = {
  p_ayu:   { id:'p_ayu',   name:'Ayu',   initials:'A', role:'Café operator',        roleId:'role_barista',    primaryTeamId:'t_hq_ops',  buId:'bu_retail',   additionalTeams:[], switchable:true,
             roleGrants:[
               { cap:'home.view', scope:orgS },{ cap:'work.view', scope:ownT },{ cap:'inbox.view', scope:orgS },
               { cap:'cafe.view', scope:ownT },{ cap:'task.create', scope:ownT },{ cap:'task.edit', scope:ownT },
               { cap:'signal.create', scope:ownT },{ cap:'signal.correct', scope:selfS },
               { cap:'run.start', scope:ownT },{ cap:'check.submit', scope:ownT },{ cap:'deputy.use', scope:orgS } ] },
  p_budi:  { id:'p_budi',  name:'Budi',  initials:'B', role:'Branch Supervisor',    roleId:'role_supervisor', primaryTeamId:'t_hq_ops',  buId:'bu_retail',   additionalTeams:[], switchable:true,
             roleGrants:[
               { cap:'home.view', scope:orgS },{ cap:'work.view', scope:ownT },{ cap:'inbox.view', scope:orgS },
               { cap:'cafe.view', scope:ownT },{ cap:'task.create', scope:ownT },{ cap:'task.edit', scope:ownT },
               { cap:'signal.create', scope:ownT },{ cap:'signal.correct', scope:ownT },
               { cap:'run.start', scope:ownT },{ cap:'run.complete', scope:ownT },{ cap:'check.submit', scope:ownT },
               { cap:'process.adopt', scope:ownT },{ cap:'deputy.use', scope:orgS } ] },
  p_rina:  { id:'p_rina',  name:'Rina',  initials:'R', role:'Retail Ops Head',      roleId:'role_ops_head',   primaryTeamId:'t_hq_ops',  buId:'bu_retail',   additionalTeams:['t_rad_ops'], switchable:true,
             roleGrants:[
               { cap:'home.view', scope:orgS },{ cap:'work.view', scope:st('t_hq_ops','t_rad_ops') },{ cap:'inbox.view', scope:orgS },
               { cap:'cafe.view', scope:st('t_hq_ops','t_rad_ops') },{ cap:'ecommerce.view', scope:ownB },
               { cap:'money.view', scope:ownB },{ cap:'budget.view', scope:ownB },
               { cap:'task.create', scope:st('t_hq_ops','t_rad_ops') },{ cap:'task.edit', scope:st('t_hq_ops','t_rad_ops') },
               { cap:'signal.create', scope:st('t_hq_ops','t_rad_ops') },{ cap:'signal.create_for_team', scope:st('t_hq_ops','t_rad_ops') },
               { cap:'signal.mention_bu', scope:ownB },{ cap:'signal.correct', scope:ownB },{ cap:'signal.retract', scope:ownB },
               { cap:'process.draft', scope:ownB },{ cap:'process.publish', scope:ownB },{ cap:'process.adopt', scope:st('t_hq_ops','t_rad_ops') },
               { cap:'standard.publish', scope:ownB },{ cap:'standard.adopt', scope:ownB },{ cap:'deputy.use', scope:orgS } ] },
  p_dimas: { id:'p_dimas', name:'Dimas', initials:'D', role:'B2B Ops Head',         roleId:'role_b2b_head',   primaryTeamId:'t_roast',   buId:'bu_b2b',      additionalTeams:[], switchable:true,
             roleGrants:[
               { cap:'home.view', scope:orgS },{ cap:'work.view', scope:ownB },{ cap:'inbox.view', scope:orgS },
               { cap:'roastery.view', scope:ownB },{ cap:'money.view', scope:ownB },{ cap:'budget.view', scope:ownB },
               { cap:'task.create', scope:ownB },{ cap:'task.edit', scope:ownB },
               { cap:'signal.create', scope:ownB },{ cap:'signal.mention_bu', scope:ownB },{ cap:'signal.correct', scope:ownB },{ cap:'signal.retract', scope:ownB },
               { cap:'process.draft', scope:ownB },{ cap:'process.publish', scope:ownB },{ cap:'process.adopt', scope:ownB },
               { cap:'standard.publish', scope:ownB },{ cap:'standard.adopt', scope:ownB },{ cap:'deputy.use', scope:orgS } ] },
  p_maya:  { id:'p_maya',  name:'Maya',  initials:'M', role:'Finance Controller',   roleId:'role_finance',    primaryTeamId:'t_finance', buId:'bu_finance',  additionalTeams:[], switchable:true,
             roleGrants:[
               { cap:'home.view', scope:orgS },{ cap:'work.view', scope:ownB },{ cap:'inbox.view', scope:orgS },
               { cap:'money.view', scope:orgS },{ cap:'budget.create', scope:orgS },{ cap:'budget.view', scope:orgS },
               { cap:'task.create', scope:ownB },{ cap:'task.edit', scope:ownB },
               { cap:'signal.create', scope:ownB },{ cap:'signal.mention_bu', scope:ownB },
               { cap:'process.draft', scope:ownB },{ cap:'process.publish', scope:ownB },{ cap:'process.adopt', scope:ownB },
               { cap:'standard.publish', scope:ownB },{ cap:'run.start', scope:ownB },{ cap:'run.complete', scope:ownB },{ cap:'check.submit', scope:ownB },
               { cap:'followup.chase', scope:ownB },{ cap:'followup.settle', scope:orgS },{ cap:'deputy.use', scope:orgS } ] },
  p_arief: { id:'p_arief', name:'Arief', initials:'A', role:'Owner / Admin',        roleId:'role_owner',      primaryTeamId:'t_hq_ops',  buId:'bu_retail',   additionalTeams:[], switchable:true,
             roleGrants:[
               { cap:'*', scope:orgS } ] },
  /* support people — appear as PIC/Supervisor/owners, not in the switcher */
  p_sari:  { id:'p_sari',  name:'Sari',  initials:'S', role:'Barista',              roleId:'role_barista',    primaryTeamId:'t_rad_ops', buId:'bu_retail',   additionalTeams:[], switchable:false, roleGrants:[{cap:'home.view',scope:orgS}] },
  p_andi:  { id:'p_andi',  name:'Andi',  initials:'A', role:'Radiant Supervisor',   roleId:'role_supervisor', primaryTeamId:'t_rad_ops', buId:'bu_retail',   additionalTeams:[], switchable:false, roleGrants:[{cap:'home.view',scope:orgS}] },
  p_joko:  { id:'p_joko',  name:'Joko',  initials:'J', role:'Roastery Operator',    roleId:'role_barista',    primaryTeamId:'t_roast',   buId:'bu_b2b',      additionalTeams:[], switchable:false, roleGrants:[{cap:'home.view',scope:orgS}] },
  p_ega:   { id:'p_ega',   name:'Ega',   initials:'E', role:'Ecommerce Packer',     roleId:'role_barista',    primaryTeamId:'t_ecom',    buId:'bu_retail',   additionalTeams:[], switchable:false, roleGrants:[{cap:'home.view',scope:orgS}] },
  p_tom:   { id:'p_tom',   name:'Tom',   initials:'T', role:'Finance Analyst',      roleId:'role_finance',    primaryTeamId:'t_finance', buId:'bu_finance',  additionalTeams:[], switchable:false, roleGrants:[{cap:'home.view',scope:orgS}] },
};

/* ── Routes / coverage registries ──────────────────────────────────────────── */
export const routes = ['home','work','money','inbox','cafe','ecommerce','roastery','profile','admin'];
export const journeys = Array.from({ length: 23 }, (_, i) => `J${String(i + 1).padStart(2, '0')}`);
export const scenarios = ['S1','S2','S3','S4','S5','S6'];
export const anchors = Array.from({ length: 14 }, (_, i) => `A${i + 1}`);
export const requiredStates = ['loading','empty','error','denied','validation','pending','archived','stale','version'];

/* Journey → scenario map (for coverage dialog) */
export const journeyScenarios = {
  J01:'S1', J02:'S1', J03:'S3', J04:'S1', J05:'S2', J06:'S1',
  J07:'S5', J08:'S5', J09:'S1', J10:'S1', J11:'S4', J12:'S1',
  J13:'S3', J14:'S3', J15:'S3', J16:'S1', J17:'S5', J18:'S5',
  J19:'S2', J20:'S2', J21:'S2', J22:'S6', J23:'S6',
};

export const anchorText = {
  A1:'Signal gains workflow Status / PIC-Supervisor / due date / resolution / Approve-Close',
  A2:'Acknowledge treated as commitment, or Signal promoted into a Task',
  A3:'Sibling Team reads a Signal without layered reach or explicit mention',
  A4:'Task shows RACI, or governed record shows only PIC/Supervisor',
  A5:'Copy says a Team publishes/adopts/configures instead of the scoped Person',
  A6:'Relation opens a nested drawer / second record editor',
  A7:'Publishing a Process/Standard silently changes adoption/consumers/active Runs',
  A8:'Budget/reference value copied into another record instead of linked',
  A9:'Follow-up reaches Settled without cash-in date, proof, and Finance confirmation',
  A10:'Metric lacks certified definition / basis / freshness / honest state / drill',
  A11:'Stock shown globally without Team/Site/stock-location context',
  A12:'Routine events auto-flood Signals without deliberate share / published rule',
  A13:'Sensitive HR/legal/medical content offered a Restricted Signal mode',
  A14:'Deputy gains broader access, bypasses confirmation, or cannot reverse its write',
};

/* ════════════════════════════════════════════════════════════════════════════
   CONNECTED RECORD GRAPH — shared IDs across S1–S6
   ════════════════════════════════════════════════════════════════════════════ */
export const records = {
  /* ── Objectives / Projects (RACI) — J07/J08/S5 ─────────────────────────── */
  obj_retail: { id:'obj_retail', type:'objective', title:'Grow Retail Ops revenue — H2 2026', buId:'bu_retail', lane:'Run',
    accountableId:'p_rina', responsibleId:'p_rina', consulted:['p_maya'], informed:['p_arief'],
    target:'+18% café revenue vs H1', progress:0.42, links:['proj_new_menu','proc_cafe_open'] },
  proj_new_menu: { id:'proj_new_menu', type:'project', title:'New autumn menu rollout', buId:'bu_retail', lane:'Transform',
    accountableId:'p_rina', responsibleId:'p_rina', consulted:['p_maya','p_dimas'], informed:['p_arief'],
    participatingTeams:['t_hq_ops','t_rad_ops'], due:'2026-09-20', progress:0.3,
    links:['t_taste_test','t_menu_print','std_espresso','budget_promo'],
    /* typed structured canvas (Project contract). */
    canvasSave:'saved',
    sections:[
      { id:'ps_1', kind:'milestone', label:'Taste test sign-off', due:'2026-08-15', pinned:false },
      { id:'ps_2', kind:'task-ref', task:'t_taste_test', pinned:false },
      { id:'ps_3', kind:'task-ref', task:'t_menu_print', pinned:false },
      { id:'ps_4', kind:'field', label:'Target launch date', input:'date', pinned:false },
    ] },

  /* ── Processes (BU-governed, RACI) — J09/S1/S2 ─────────────────────────── */
  proc_cafe_open: { id:'proc_cafe_open', type:'process', title:'Café Opening', buId:'bu_retail', version:2, status:'Published',
    accountableId:'p_rina', responsibleId:'p_rina', consulted:['p_budi'], informed:['p_arief'],
    cadence:'Daily before service', generatedTaskDefs:[
      { title:'Unlock & lights', own:'opener' },{ title:'Chiller temp check', own:'opener', checkable:true },
      { title:'Espresso dial-in', own:'barista', checkable:true },{ title:'Stock count', own:'opener', form:true } ],
    linkedStandards:['std_espresso','std_chiller','std_stock_opname'], linkedTasks:['t_fix_chiller'], adoptedBy:['t_hq_ops','t_rad_ops'],
    /* typed structured canvas blocks (OD-REDESIGN-16 / D7). pinned = required, cannot be removed. */
    canvasSave:'saved',
    sections:[
      { id:'cs_open_1', kind:'task-def', title:'Unlock & lights', own:'opener', sup:'Process A', pinned:false },
      { id:'cs_open_2', kind:'check', label:'Chiller temperature 2–4°C at open', spec:'std_chiller', pinned:true },
      { id:'cs_open_3', kind:'check', label:'Espresso shot weight 18g ±0.5', spec:'std_espresso', pinned:true },
      { id:'cs_open_4', kind:'field', label:'Stock count — milk (L) / beans (kg)', input:'number', pinned:false },
      { id:'cs_open_5', kind:'evidence', label:'Photo of chiller thermometer', pinned:false },
      { id:'cs_open_6', kind:'signoff', label:'Supervisor open sign-off', role:'Supervisor', pinned:false },
    ] },
  proc_monthly_close: { id:'proc_monthly_close', type:'process', title:'Monthly Close', buId:'bu_finance', version:1, status:'Published',
    accountableId:'p_maya', responsibleId:'p_maya', consulted:['p_arief'], informed:[],
    cadence:'Monthly, 5th business day', generatedTaskDefs:[
      { title:'Bank reconciliation', own:'analyst', checkable:false },{ title:'Stock-opname report', own:'analyst' },{ title:'GL account-5 COGS reconciliation', own:'controller', checkable:true } ],
    linkedStandards:['std_recon'], adoptedBy:['t_finance'] },
  proc_roast: { id:'proc_roast', type:'process', title:'Roast Batch', buId:'bu_b2b', version:1, status:'Published',
    accountableId:'p_dimas', responsibleId:'p_dimas', consulted:['p_maya'], informed:['p_arief'],
    cadence:'Per production day', generatedTaskDefs:[{title:'Green lot intake'},{title:'Roast & log yield', checkable:true},{title:'Quality cupping', checkable:true}],
    linkedStandards:['std_cupping'], adoptedBy:['t_roast'] },

  /* ── Process Runs (Team-scoped, snapshot version) — J10/S1/S2 ──────────── */
  run_hq_open: { id:'run_hq_open', type:'run', title:'Café Opening · 10 Jul · HQ', teamId:'t_hq_ops', processId:'proc_cafe_open',
    snapshotVersion:2, status:'In Progress', startedAt:'2026-07-10 06:40', shift:'Morning', area:'Bar',
    steps:[
      { id:'s1', kind:'checklist', label:'Unlock & lights', done:true },
      { id:'s2', kind:'check', label:'Chiller temperature 2–4°C', spec:'std_chiller', value:'8.2°C', result:'fail', evidence:'IMG_0421.jpg', exceptionId:'exc_chiller' },
      { id:'s3', kind:'check', label:'Espresso shot weight 18g ±0.5', spec:'std_espresso', value:'18.1g', result:'pass', evidence:'IMG_0422.jpg' },
      { id:'s4', kind:'form', label:'Stock count — milk (L)', value:'24', fields:[{k:'Milk (L)',v:'24'},{k:'Beans (kg)',v:'6.2'}] },
      { id:'s5', kind:'instruction', label:'Set POS to service mode', done:false } ],
    tasks:['t_fix_chiller'], signals:['sig_chiller'] },
  run_rad_open: { id:'run_rad_open', type:'run', title:'Café Opening · 10 Jul · Radiant', teamId:'t_rad_ops', processId:'proc_cafe_open',
    snapshotVersion:2, status:'In Progress', startedAt:'2026-07-10 06:55', shift:'Morning', area:'Kitchen', steps:[], tasks:[] },
  run_monthly_close: { id:'run_monthly_close', type:'run', title:'July 2026 Monthly Close', teamId:'t_finance', processId:'proc_monthly_close',
    snapshotVersion:1, status:'In Progress', startedAt:'2026-08-03 09:00',
    steps:[
      { id:'m1', kind:'task', label:'Bank reconciliation', taskId:'t_bank_recon', done:false },
      { id:'m2', kind:'task', label:'Stock-opname report', taskId:'t_stock_report', done:false },
      { id:'m3', kind:'check', label:'GL account-5 COGS reconciliation', spec:'std_recon', value:'Rp 412.6M', result:'pass', evidence:'GL-Jul.pdf' } ],
    tasks:['t_bank_recon','t_stock_report'], links:['metric_gm','budget_latte'] },
  run_stock_opname_hq: { id:'run_stock_opname_hq', type:'run', title:'Retail Stock Opname · 31 Jul · HQ', teamId:'t_hq_ops', processId:'proc_cafe_open',
    snapshotVersion:2, status:'Completed', startedAt:'2026-07-31 22:00', steps:[], tasks:[] },

  /* ── Standards (BU-canonical, no RACI) — J11/S4 ────────────────────────── */
  std_espresso: { id:'std_espresso', type:'standard', title:'Espresso Preparation', buId:'bu_retail', version:2, publishedVersion:2,
    steps:[
      { kind:'instruction', text:'Dose 18g into the basket; distribute and tamp level.' },
      { kind:'measured', text:'Shot weight 36g ±1.0 in 25–30s', rule:'36g ±1.0 / 25–30s' },
      { kind:'evidence', text:'Photo of scale reading required per shift' } ],
    consumedBy:['proc_cafe_open'], publisherId:'p_rina',
    upgrade:{ available:true, toVersion:3, diff:{ from:'Shot weight 36g ±1.0 in 25–30s', to:'Shot weight 36g ±1.0 in 23–27s' } } },
  std_chiller: { id:'std_chiller', type:'standard', title:'Chiller Temperature Check', buId:'bu_retail', version:1, publishedVersion:1,
    steps:[{ kind:'measured', text:'Chiller 2–4°C at open', rule:'2–4°C' },{ kind:'evidence', text:'Photo of thermometer' }],
    consumedBy:['proc_cafe_open'], publisherId:'p_rina' },
  std_stock_opname: { id:'std_stock_opname', type:'standard', title:'Stock Opname Procedure', buId:'bu_retail', version:1, publishedVersion:1,
    steps:[{ kind:'instruction', text:'Count every location separately; never sum into a global total.' }],
    consumedBy:['proc_cafe_open'], publisherId:'p_rina' },
  std_recon: { id:'std_recon', type:'standard', title:'Bank Reconciliation', buId:'bu_finance', version:1, publishedVersion:1,
    steps:[{ kind:'measured', text:'MOS per-invoice cash-in dates tie to bank statement Σ' },{ kind:'evidence', text:'Bank statement PDF' }],
    consumedBy:['proc_monthly_close'], publisherId:'p_maya' },
  std_cupping: { id:'std_cupping', type:'standard', title:'Roast Quality Cupping', buId:'bu_b2b', version:1, publishedVersion:1,
    steps:[{ kind:'measured', text:'Cupping score ≥ 84' }], consumedBy:['proc_roast'], publisherId:'p_dimas' },

  /* ── Tasks (Team + PIC + Supervisor + Status; never RACI) — J07/S1/S3/S5 ─ */
  t_fix_chiller: { id:'t_fix_chiller', type:'task', title:'Replace HQ chiller unit (failed open Check)', teamId:'t_hq_ops', picId:'p_ayu', supervisorId:'p_budi', standardId:'std_chiller',
    status:'Open', due:'2026-07-10 12:00', generatedFrom:'run_hq_open', sourceException:'exc_chiller', classification:'Ad hoc',
    description:'Chiller read 8.2°C at open (spec 2–4°C). Vendor service call + temporary ice bath until repair.', comments:[] },
  t_bank_recon: { id:'t_bank_recon', type:'task', title:'Bank reconciliation — July', teamId:'t_finance', picId:'p_tom', supervisorId:'p_maya',
    status:'In Progress', due:'2026-08-05', parentRun:'run_monthly_close', classification:'Generated', checklist:[{label:'Import statement',done:true},{label:'Match 142 invoices',done:false}] },
  t_stock_report: { id:'t_stock_report', type:'task', title:'Submit stock-opname report — July', teamId:'t_finance', picId:'p_tom', supervisorId:'p_maya',
    status:'Open', due:'2026-08-04', parentRun:'run_monthly_close', classification:'Generated' },
  /* Signal follow-up Tasks — one Team each, many-to-many link (J13/S3) */
  t_menu_comm: { id:'t_menu_comm', type:'task', title:'Communicate substitute menu to floor', teamId:'t_rad_ops', picId:'p_sari', supervisorId:'p_andi',
    status:'Open', due:'2026-07-10 16:00', sourceSignal:'sig_vendor', classification:'Ad hoc', description:'Print revised menu card; brief bar staff.' },
  t_repl_supply: { id:'t_repl_supply', type:'task', title:'Arrange replacement green bean supply', teamId:'t_roast', picId:'p_joko', supervisorId:'p_dimas',
    status:'In Progress', sourceSignal:'sig_vendor', classification:'Ad hoc' },
  t_cust_resp: { id:'t_cust_resp', type:'task', title:'Customer comms — delayed wholesale orders', teamId:'t_ecom', picId:'p_ega', supervisorId:'p_rina',
    status:'Open', sourceSignal:'sig_vendor', classification:'Ad hoc' },
  /* S5 governed project + cross-team tasks */
  t_taste_test: { id:'t_taste_test', type:'task', title:'New menu taste test', teamId:'t_hq_ops', picId:'p_ayu', supervisorId:'p_budi', status:'Open', parentProject:'proj_new_menu', due:'2026-08-15', classification:'Project' },
  t_menu_print: { id:'t_menu_print', type:'task', title:'Print new menu cards (HQ + Radiant)', teamId:'t_rad_ops', picId:'p_sari', supervisorId:'p_andi', status:'Open', parentProject:'proj_new_menu', due:'2026-09-10', classification:'Project' },
  /* archived task (reversal state) */
  t_old_promo: { id:'t_old_promo', type:'task', title:'Ramadan promo setup', teamId:'t_hq_ops', picId:'p_ayu', supervisorId:'p_budi', status:'Done', archivedAt:'2026-04-15', classification:'Ad hoc' },

  /* ── Exceptions (failed-Check outcomes) — J10/S1 ───────────────────────── */
  exc_chiller: { id:'exc_chiller', type:'exception', title:'Chiller 8.2°C at HQ open — out of 2–4°C', teamId:'t_hq_ops',
    runId:'run_hq_open', standardId:'std_chiller', correctionTaskId:'t_fix_chiller', raisedAt:'2026-07-10 06:48',
    evidence:'IMG_0421.jpg', status:'Open' },

  /* ── Signals (factual; no PIC/Supervisor/due/Status/resolution) — J12-15/S1/S3 ─ */
  sig_chiller: { id:'sig_chiller', type:'signal', title:'HQ chiller warm at open — product moved to ice bath', owningTeamId:'t_hq_ops',
    authorId:'p_ayu', occurredAt:'2026-07-10 06:50', attention:'Needs attention', category:'Equipment/facility',
    body:'Chiller read 8.2°C at 06:48 (spec 2–4°C). Stock moved to ice bath; service call logged. Correction Task open.',
    mentions:[], comments:[{who:'p_budi', text:'On it — vendor ETA 11:00.'}], acks:['p_budi'],
    linkedWork:[{id:'exc_chiller'},{id:'t_fix_chiller'}], revisions:[] },
  sig_vendor: { id:'sig_vendor', type:'signal', title:'Green bean supplier delayed 5 days (Sumatra Gayo lot)', owningTeamId:'t_rad_ops',
    authorId:'p_rina', occurredAt:'2026-07-10 08:10', attention:'Urgent', category:'Supply/vendor',
    body:'Our Sumatra Gayo supplier pushed the lot to 15 Jul. Affects Radiant + Ecommerce wholesale fulfilment and the new-menu roast plan.',
    mentions:[{kind:'team', ref:'t_roast'},{kind:'person', ref:'p_dimas'},{kind:'person', ref:'p_arief'}],
    comments:[{who:'p_dimas', text:'Roastery has 9 days cover; will prioritise wholesale.'}],
    acks:['p_dimas','p_arief'],
    linkedWork:[{id:'t_menu_comm'},{id:'t_repl_supply'},{id:'t_cust_resp'}], revisions:[] },
  sig_sales_peak: { id:'sig_sales_peak', type:'signal', title:'Friday café revenue +22% vs avg', owningTeamId:'t_hq_ops',
    authorId:'p_budi', occurredAt:'2026-07-11 21:00', attention:'FYI', category:'Customer',
    body:'Strong Friday lunch rush; Bar hit queue risk 12:30–13:00.', mentions:[], comments:[], acks:[], linkedWork:[], revisions:[] },
  sig_retracted: { id:'sig_retracted', type:'signal', title:'(retracted) Dishwasher leak reported', owningTeamId:'t_hq_ops',
    authorId:'p_ayu', occurredAt:'2026-07-08 14:00', attention:'FYI', category:'Equipment/facility',
    body:'Initial report was a condensation drip, not a leak. Retracted to avoid confusion.',
    mentions:[], comments:[], acks:[], linkedWork:[], retracted:true, retractReason:'False alarm — condensation, not a leak.', revisions:[] },

  /* ── Budget (canonical in Money, linked elsewhere — never copied) — J20/S2 ─ */
  budget_latte: { id:'budget_latte', type:'budget', title:'Café Latte — BOM budget cost', buId:'bu_finance', ownerId:'p_maya',
    asOf:'2026-07-01', valuePerUnit:18500, unit:'per cup', scenario:'Current recipe',
    lines:[{ k:'Espresso shot (18g green→roasted)', cost:2400, source:'green_lot_G1' },{ k:'Milk 180ml', cost:4200, source:'ingredient_milk' },{ k:'Cup + lid', cost:1800, source:'ingredient_cup' }],
    basis:'BOM × latest ingredient purchase cost', freshness:'2026-07-01', links:['std_espresso'] },
  budget_promo: { id:'budget_promo', type:'budget', title:'Weekend promo scenario — Latte Rp 35k', buId:'bu_finance', ownerId:'p_maya',
    asOf:'2026-07-05', valuePerUnit:35000, unit:'promo price', scenario:'Weekend −18%',
    lines:[{ k:'Budgeted COGS (linked)', cost:8400, source:'budget_latte' }], basis:'Links the canonical Latte Budget', freshness:'2026-07-05', links:['budget_latte','proj_new_menu'] },

  /* ── Follow-ups (settlement lifecycle, evidence-gated) — J21/S2 ─────────── */
  fu_ar: { id:'fu_ar', type:'followup', title:'B2B AR — PT Sentosa Coffee · INV-2041', counterparty:'PT Sentosa Coffee', teamId:'t_roast',
    amount:42000000, balance:12000000, currency:'IDR', ageDays:38, ownerChaseId:'p_dimas', financeConfirmId:'p_maya',
    lifecycle:'partial', promises:[{ date:'2026-07-28', amount:30000000, cashInDate:'2026-07-30', proof:'BANK-TR-887.pdf' }],
    history:[{ at:'2026-06-25', event:'Chased', by:'p_dimas'},{ at:'2026-07-28', event:'Partial Rp 30M logged', by:'p_dimas'},{ at:'2026-07-30', event:'Cash-in Rp 30M confirmed', by:'p_maya'}],
    settleRequires:['cash-in date','proof','Finance confirmation'] },
  fu_tab: { id:'fu_tab', type:'followup', title:'Pending bill — Regular owner tab · Radiant', counterparty:'Owner tab', teamId:'t_rad_ops',
    amount:1850000, balance:1850000, currency:'IDR', ageDays:12, ownerChaseId:'p_andi', financeConfirmId:'p_maya',
    lifecycle:'chased', promises:[], history:[{at:'2026-07-05',event:'Chased',by:'p_andi'}], settleRequires:['cash-in date','proof','Finance confirmation'] },

  /* ── Certified metrics (basis/freshness/source/drill) — J19/S2 ──────────── */
  metric_gm: { id:'metric_gm', type:'metric', title:'Certified gross margin — July', buId:'bu_finance',
    certified:true, value:61.2, unit:'%', basis:'Revenue − GL account-5 COGS (certified, after-the-fact)',
    asOf:'2026-08-05', sourceRun:'run_monthly_close', source:'Finance gross-margin report',
    drill:[{id:'run_monthly_close'},{id:'budget_latte'}], interim:false },
  metric_gm_interim: { id:'metric_gm_interim', type:'metric', title:'Interim gross margin — July (to date)', buId:'bu_finance',
    certified:false, value:58.4, unit:'%', basis:'Revenue − stock-movement COGS (POS-only, mid-month, uncertified)',
    asOf:'2026-07-31', source:'Daily sales-margin estimate', drill:[], interim:true },
  metric_ar: { id:'metric_ar', type:'metric', title:'Outstanding AR', buId:'bu_finance',
    certified:false, value:142000000, unit:'IDR', basis:'Open Follow-up balances', asOf:'2026-07-10', source:'Money Follow-ups',
    drill:[{id:'fu_ar'},{id:'fu_tab'}], interim:false },

  /* ── Operational stock — location-scoped, never global (J16-18/S5/A11) ──── */
  stock_hq_beans:   { id:'stock_hq_beans',   type:'stock', sku:'Roasted House Blend', location:'HQ retail café', teamId:'t_hq_ops',  siteId:'s_hq',   qty:6.2, unit:'kg' },
  stock_rad_beans:  { id:'stock_rad_beans',  type:'stock', sku:'Roasted House Blend', location:'Radiant café',   teamId:'t_rad_ops', siteId:'s_rad',  qty:4.1, unit:'kg' },
  stock_eco_beans:  { id:'stock_eco_beans',  type:'stock', sku:'Roasted House Blend', location:'Ecommerce fulfilment', teamId:'t_ecom', siteId:'s_hq', qty:12.0, unit:'kg', slaRisk:true },
  stock_roast_beans:{ id:'stock_roast_beans',type:'stock', sku:'Roasted House Blend', location:'Roastery FG',  teamId:'t_roast',   siteId:'s_roast',qty:48.0, unit:'kg' },
  green_lot_G1: { id:'green_lot_G1', type:'greenlot', origin:'Sumatra Gayo', variety:'Gayo Wet-Hull', process:'Wet-hulled',
    costPerKg:95000, balanceKg:120, basis:'Recorded purchase cost at receipt', teamId:'t_roast', siteId:'s_roast' },
  roast_batch_441: { id:'roast_batch_441', type:'batch', lotId:'green_lot_G1', greenInKg:20, roastedOutKg:16.0, yieldPct:80, shrinkPct:20,
    date:'2026-07-09', operatorId:'p_joko', teamId:'t_roast', siteId:'s_roast', qualityCheck:{ score:85, result:'pass' }, evidence:'CUP-441.jpg' },
  transfer_9: { id:'transfer_9', type:'transfer', from:'Roastery FG', to:'HQ retail café', qty:10, unit:'kg', teamId:'t_roast', date:'2026-07-09',
    kind:'internal replenishment from Roastery to HQ', status:'Delivered' },

  /* ── Ecommerce fulfilment (order→picked→packed→shipped) — J17/S5 ────────── */
  eco_order_101: { id:'eco_order_101', type:'order', ref:'#ECO-101', customer:'Kopi Tiam Group', items:'4kg House Blend', state:'picked', sla:'on time', picId:'p_ega', teamId:'t_ecom', stockRef:'stock_eco_beans' },
  eco_order_102: { id:'eco_order_102', type:'order', ref:'#ECO-102', customer:'Ankara Bistro',   items:'6kg House Blend', state:'new',     sla:'at risk', picId:'p_ega', teamId:'t_ecom', stockRef:'stock_eco_beans' },
  eco_order_103: { id:'eco_order_103', type:'order', ref:'#ECO-103', customer:'Hotel Nusa',      items:'2kg Decaf',       state:'shipped', sla:'on time', picId:'p_ega', teamId:'t_ecom', stockRef:'stock_eco_beans' },
  replenish_eco: { id:'replenish_eco', type:'replenish', from:'Roastery FG', to:'Ecommerce fulfilment', qty:8, unit:'kg', teamId:'t_ecom', kind:'internal replenishment', status:'Requested' },

  /* Reference data (ingredient cost lines) — linked, never copied (A8) */
  ingredient_milk: { id:'ingredient_milk', type:'ingredient', name:'Fresh milk 1L', lastHpp:23300, basis:'Latest purchase cost from Finance', asOf:'2026-07-01', owner:'Finance + Procurement' },
  ingredient_cup:  { id:'ingredient_cup',  type:'ingredient', name:'8oz cup + lid', lastHpp:1800, basis:'Latest purchase cost from Finance', asOf:'2026-07-01', owner:'Finance + Procurement' },
};

/* Inbox items — derived from mentions/exceptions/upgrades (canonical router) */
export const inboxItems = [
  { id:'inb_1', toPersonId:'p_budi', kind:'exception', title:'Exception raised: HQ chiller out of range', sourceId:'exc_chiller', reason:'Failed Check in your Team Run', time:'06:48', unread:true, scenario:'S1', journey:'J06' },
  { id:'inb_2', toPersonId:'p_budi', kind:'mention',  title:'Ayu mentioned you in a Signal', sourceId:'sig_chiller', reason:'Comment on chiller Signal', time:'06:52', unread:true, scenario:'S1', journey:'J06' },
  { id:'inb_3', toPersonId:'p_dimas',kind:'mention',  title:'Rina mentioned you in a Signal', sourceId:'sig_vendor', reason:'@Dimas on vendor-delay Signal', time:'08:11', unread:true, scenario:'S3', journey:'J06' },
  { id:'inb_4', toPersonId:'p_rina', kind:'upgrade',  title:'Standard upgrade available: Espresso Preparation v3', sourceId:'std_espresso', reason:'You are Process A for Café Opening', time:'09:30', unread:true, scenario:'S4', journey:'J06' },
  { id:'inb_5', toPersonId:'p_maya', kind:'approval', title:'Confirm settlement: PT Sentosa AR partial', sourceId:'fu_ar', reason:'Finance confirmation requested', time:'10:05', unread:true, scenario:'S2', journey:'J06' },
  { id:'inb_6', toPersonId:'p_arief',kind:'mention',  title:'Rina mentioned you in a Signal', sourceId:'sig_vendor', reason:'@Arief on vendor-delay Signal', time:'08:11', unread:true, scenario:'S3', journey:'J06' },
  { id:'inb_7', toPersonId:'p_ayu',  kind:'task',     title:'New Task assigned: Replace HQ chiller unit', sourceId:'t_fix_chiller', reason:'PIC · Supervisor Budi', time:'06:49', unread:false, scenario:'S1', journey:'J06' },
];

/* Module/workspace manifests — for café/ecommerce/roastery views */
export const cafeAreas = [
  { id:'area_kitchen', name:'Kitchen', teamId:'t_hq_ops', shift:'Morning', runId:'run_hq_open' },
  { id:'area_bar',     name:'Bar',     teamId:'t_hq_ops', shift:'Morning', runId:'run_hq_open' },
];
export const periodEvents = [
  { id:'pe_1', kind:'task',    label:'Bank reconciliation — July', source:'t_bank_recon', when:'2026-08-05' },
  { id:'pe_2', kind:'run',     label:'July Monthly Close',          source:'run_monthly_close', when:'2026-08-03' },
  { id:'pe_3', kind:'signal',  label:'Green bean supplier delayed 5 days', source:'sig_vendor', when:'2026-07-10' },
  { id:'pe_4', kind:'exception',label:'HQ chiller out of range',    source:'exc_chiller', when:'2026-07-10' },
  { id:'pe_5', kind:'project', label:'New autumn menu rollout',     source:'proj_new_menu', when:'2026-07-09' },
];

/* Access matrix for Admin (effective per-person: Inherited/Allowed/Denied) */
export const adminMatrix = {
  p_ayu: { 'money.view':{state:'Denied', source:'No role grant'}, 'admin.access':{state:'Denied', source:'No role grant'}, 'task.create':{state:'Inherited', source:'Operator role · own team'} },
  p_sari:{ 'money.view':{state:'Denied', source:'No role grant'}, 'process.adopt':{state:'Denied', source:'No role grant'} },
};

/* Convenience lookups */
export const teamOf = (id) => teams[id];
export const personOf = (id) => people[id];
export const recordOf = (id) => records[id];
export const buOf = (id) => bus[id];
export const siteOf = (id) => sites[id];
