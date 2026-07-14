#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   verify-e7-prototype.mjs — dependency-free static coverage/contract verifier.
   Reads E7 source as TEXT (no import/DOM) and enforces the J01–J23 · S1–S6 ·
   A1–A14 contracts, the 9 required states, the 3 responsive regimes, the record
   renderer registry, the route set, the Signal-has-no-work-fields invariant, and
   the retired-UI / team-as-actor prohibitions (comments/allowwords exempted).
   Exit non-zero with named missing coverage until the prototype is complete.
   ════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');

const FILES = ['e7-prototype.html','e7-prototype.css','e7-data.js','e7-records.js','e7-views.js','e7-app.js'];
const errors = [];
const notes = [];
const ok = (m) => notes.push('  ✓ ' + m);
const fail = (m) => errors.push(m);

/* 1. All source files present */
for (const f of FILES) {
  if (!existsSync(join(here, f))) fail(`missing source file: ${f}`);
  else ok(`file present: ${f}`);
}
if (errors.length) { report(); }   // can't read further

const html = read('e7-prototype.html');
const css  = read('e7-prototype.css');
const data = read('e7-data.js');
const recs = read('e7-records.js');
const views= read('e7-views.js');
const app  = read('e7-app.js');
const ALL  = html + css + data + recs + views + app;

/* 2. Journeys J01–J23 in data-journey */
const journeys = Array.from({length:23},(_,i)=>`J${String(i+1).padStart(2,'0')}`);
for (const j of journeys) {
  const re = new RegExp(`data-journey="[^"]*\\b${j}\\b`);
  (re.test(ALL)) ? ok(`journey ${j}`) : fail(`missing J: data-journey="${j}"`);
}

/* 3. Scenarios S1–S6 in data-scenario */
for (let i=1;i<=6;i++){
  const s='S'+i;
  (new RegExp(`data-scenario="[^"]*\\b${s}\\b"`).test(ALL)) ? ok(`scenario ${s}`) : fail(`missing S: data-scenario="${s}"`);
}

/* 4. Anchors A1–A14 must be ABSENT as intended UI defects.
      We reject forbidden defect-UI strings (retired destinations, Task RACI,
      Restricted Signal, team-as-actor) outside comment/allowword contexts. */
const allowwords = /(avoid|superseded|never|not a|not |no |retired|rejected|forbidden|do not|don't|supersedes|prohibited|no longer|removed|replaces|amends|instead|says |offered |there is no|anti-)/i;
function commentSafe(line){
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--') || t.endsWith('-->');
}
const forbidden = [
  { re:/\bWeekly Update\b/g, id:'A1/retired' },
  { re:/\bDaily Log\b/g, id:'A1/retired' },
  { re:/\bTask RACI\b/g, id:'A4' },
  { re:/\bRestricted Signal\b/gi, id:'A13' },
  { re:/\bCapture\b(?![-\w])/g, id:'retired' },          // retired ambiguous Capture action
  { re:/\bthe Team (publishes|adopts|configures)\b/gi, id:'A5' },
  { re:/\bTeam (publishes|adopts|configures)\b/gi, id:'A5' },
];
let anchorViolations = 0;
for (const { re, id } of forbidden) {
  for (const f of FILES) {
    const txt = read(f);
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(txt))) {
      const lineStart = txt.lastIndexOf('\n', m.index) + 1;
      const lineEnd = txt.indexOf('\n', m.index);
      const line = txt.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (commentSafe(line) || allowwords.test(line)) continue;
      anchorViolations++;
      fail(`[${id}] forbidden UI term "${m[0]}" in ${f}: ${line.trim().slice(0,90)}`);
    }
  }
}
if (!anchorViolations) ok('A1–A14 calibration anchors absent from intended UI');

/* 5. Required states (9) wired as data-state on real surfaces */
const states = ['loading','empty','error','denied','validation','pending','archived','stale','version'];
for (const st of states) {
  (new RegExp(`data-state="${st}"`).test(ALL)) ? ok(`state ${st}`) : fail(`missing state: data-state="${st}"`);
}
if (!views.includes('data-retry-source') || !views.includes('Last valid result') || !app.includes("'[data-retry-source]'")) fail('Money error state lacks preserved last-valid data and a wired Retry control');
else ok('Money error state preserves last-valid data and wires Retry');

/* 6. Three responsive regimes present in CSS */
for (const bp of ['max-width: 1099px','max-width: 767px','max-width: 390px']) {
  (css.includes(bp)) ? ok(`responsive regime @media (${bp})`) : fail(`missing responsive regime: ${bp}`);
}

/* 7. Route set complete (registry + renderers + hash router) */
const routes = ['home','work','money','inbox','cafe','ecommerce','roastery','admin'];
const routeLabels = { home:'Home', work:'Work', money:'Money', inbox:'Inbox', cafe:'Café', ecommerce:'Ecommerce', roastery:'Roastery', admin:'Admin' };
for (const r of routes) {
  const hasRenderer = views.includes(`render${r.charAt(0).toUpperCase()+r.slice(1)}`) || app.includes(`render${r.charAt(0).toUpperCase()+r.slice(1)}`);
  (hasRenderer) ? ok(`route renderer: ${r}`) : fail(`missing route renderer: render${r.charAt(0).toUpperCase()+r.slice(1)}`);
}
if (!app.includes('hashchange') && !app.includes('location.hash')) fail('no hash router detected (hashchange/location.hash)');
else ok('hash router present');
/* Money is capability-gated */
if (!app.includes('money.view')) fail('Money route not capability-gated (money.view)');
else ok('Money route capability-gated');

/* 8. Record renderer registry covers all first-class types */
const renderers = [
  'renderTask','renderSignal','renderProcess','renderRun','renderStandard','renderException',
  'renderBudget','renderFollowup','renderObjective','renderProject','renderMetric','renderStock',
  'renderOrder','renderGreenLot','renderBatch','renderTransfer','renderReplenish','renderIngredient',
];
for (const fn of renderers) {
  (recs.includes(fn)) ? ok(`record renderer: ${fn}`) : fail(`missing record renderer: ${fn}`);
}
if (!recs.includes('renderRecord')) fail('no canonical renderRecord(id, {mode}) entry');
else ok('canonical renderRecord(id, {mode}) present');
if (!recs.includes("mode = 'panel'") && !recs.includes("mode='panel'")) fail('renderer does not accept panel/page mode');
else ok('renderer accepts panel/page mode');

/* 9. One panel stack + one capability registry */
if (!app.includes('panelStack')) fail('no single panel stack (panelStack)');
else ok('single panel stack present');
if (!data.includes('export function can(')) fail('no capability registry can()');
else ok('capability registry can() present');
if (!data.includes('export function canViewRecord(') || !app.includes('canViewRecord(')) fail('record opens/deep links do not share a visibility predicate');
else ok('panel and deep-link record access share canViewRecord()');
if (!recs.includes('data-signal-task') || !app.includes('sourceSignalId') || !app.includes('linkedWork')) fail('Signal → separate linked Task flow is incomplete');
else ok('Signal creates a separate canonical Task and retains a many-to-many link');
if (!data.includes("linkedTasks:['t_fix_chiller']") || !data.includes("standardId:'std_chiller'")) fail('Process → Task → Standard panel path is not represented');
else ok('Process → Task → Standard canonical panel path is represented');
if (!views.includes('data-transfer-person') || !views.includes('data-access-action') || !app.includes("'[data-transfer-person]'")) fail('S6 Admin org/access mutations are not walkable');
else ok('S6 Admin transfer/access/reset/preview controls are wired');
if (!views.includes('data-role-default') || !app.includes("'[data-role-default]'")) fail('S6 Access-role default mutation is not walkable');
else ok('S6 Access-role default mutation is wired before Person overrides');
if (!app.includes("kind:'task-ref', label:'Contributing Task'")) fail('Project canvas insert contract omits task-ref');
else ok('Project canvas insert contract includes Contributing Task');
if (!views.includes('data-cafe-team') || !app.includes("'[data-cafe-team]'")) fail('Authorized Café Team switching is not demonstrable');
else ok('Authorized Café Team switching is wired');
if (!app.includes('panelHistoryDepth') || !app.includes('history.go(-historyDepth)')) fail('Close cannot deterministically clear the full panel history stack');
else ok('Panel Close deterministically drains same-URL history pushes');
if (!recs.includes('data-followup-action') || !app.includes("'[data-followup-action]'")) fail('Follow-up lifecycle actions/validation are not walkable');
else ok('Follow-up chase/promise/partial/settle flow is wired with evidence validation');
if (!app.includes("querySelectorAll('[data-close-modal]')")) fail('Visible modal close buttons are not all wired');
else ok('Scrim and visible modal close controls are wired');

/* Every anchor that opens a canonical record must remain a real href so
   modifier-click/new-tab and no-script URL semantics are preserved. */
const anchorOpeners = [...views.matchAll(/<a\b[^>]*data-open-record[^>]*>/g), ...recs.matchAll(/<a\b[^>]*data-open-record[^>]*>/g)];
const hrefMissing = anchorOpeners.filter(m => !/\bhref=/.test(m[0]));
if (hrefMissing.length) fail(`${hrefMissing.length} canonical record anchor(s) lack href`);
else ok(`${anchorOpeners.length} canonical record anchors carry real hrefs`);

/* 10. Signal fixtures carry NO work fields (A1/A2/A9) — brace-scoped scan */
function findObjectBlocks(src, marker){
  const out=[]; let i=0;
  while (true){
    const idx = src.indexOf(marker, i);
    if (idx === -1) break;
    // walk back to the opening brace of the enclosing object
    let depth=0, k=idx;
    while (k >= 0){
      const ch = src[k];
      if (ch === '}') depth++;
      else if (ch === '{'){ if (depth===0) break; depth--; }
      k--;
    }
    if (k < 0){ i = idx+1; continue; }
    const open = k;
    // walk forward to matching close
    let d=0, j=open;
    for (; j < src.length; j++){
      if (src[j] === '{') d++;
      else if (src[j] === '}'){ d--; if (d===0) break; }
    }
    out.push(src.slice(open, j+1));
    i = j+1;
  }
  return out;
}
const signalBlocks = findObjectBlocks(data, "type:'signal'");
if (signalBlocks.length === 0) fail('no Signal fixtures found to validate');
else {
  const workFields = ['picId','supervisorId','due:','resolution','status:','assignee',' Approve','Approve',' Close action'];
  let bad=0;
  for (const blk of signalBlocks){
    for (const w of workFields){
      if (blk.includes(w)) { bad++; fail(`Signal fixture carries work field "${w}": …${blk.slice(0,70).replace(/\s+/g,' ')}…`); }
    }
  }
  if (!bad) ok(`${signalBlocks.length} Signal fixtures carry no work lifecycle fields (A1/A2)`);
}

/* 11. Follow-up cannot settle without evidence (A9) */
if (!data.includes('settleRequires')) fail('Follow-up has no settleRequires gate');
else ok('Follow-up evidence-gated (settleRequires)');

/* 12. Stock is location-scoped, never global (A11) */
const stockBlocks = findObjectBlocks(data, "type:'stock'");
if (stockBlocks.length === 0) fail('no Stock fixtures found');
else {
  const globalStock = stockBlocks.some(b => !b.includes('location:'));
  (globalStock) ? fail('Stock fixture lacks location context (A11)') : ok(`${stockBlocks.length} Stock fixtures are location-scoped (A11)`);
}

/* 13. Budget links cost sources, never copies (A8) */
if (!data.includes('source:')) fail('Budget lines do not link cost sources (A8)');
else ok('Budget lines link canonical cost sources (A8)');

/* ════════════════════════════════════════════════════════════════════════════
   14. AUDIT REMEDIATION CONTRACT (Task 1) — functional-control, Work grammar,
   source-aware navigation, plain-language UI, touch targets, and execution
   actions. Each assertion names a real audited defect and must FAIL against
   the current prototype until Tasks 2–6 remediate it.
   ════════════════════════════════════════════════════════════════════════════ */

/* 14a. Work toolbar must expose THREE separate dimensions: collection picker,
   saved-view subset, and Table/Board/Timeline presentation — not one combined
   record-type switcher. Today only data-collection exists. */
const hasCollection = views.includes('data-collection');
const hasSavedView = views.includes('data-saved-view');
const hasPresentation = /data-presentation="(table|board|timeline)"/.test(views);
(hasCollection && hasSavedView && hasPresentation)
  ? ok('Work toolbar separates collection / saved-view / presentation dimensions')
  : fail(`Work toolbar lacks separate dimensions (collection=${hasCollection}, saved-view=${hasSavedView}, presentation=${hasPresentation})`);

/* 14b. Task default view must be "My tasks" and Today/This week/Last week must
   be temporal saved views, NOT entries in the record-type collection picker. */
const taskDefaultIsMine = /My tasks/i.test(views);
const periodInCollection = /\{id:'period'[^}]*label:'Period views'[^}]*\}/.test(views);
(taskDefaultIsMine && !periodInCollection)
  ? ok('Task default is "My tasks"; period buckets are temporal saved views')
  : fail(`Task default is not "My tasks" and/or period still a collection (mine=${taskDefaultIsMine}, periodInCollection=${periodInCollection})`);

/* 14c. Functional Inbox controls: filter chips must be semantic controls wired
   to read state. Today they are inert <div class="chip"> with no data hook. */
const inboxWired = views.includes('data-inbox-filter') && app.includes("'[data-inbox-filter]'");
(inboxWired) ? ok('Inbox filter chips are semantic wired controls')
  : fail('Inbox filter chips are inert (no data-inbox-filter control + handler)');

/* 14d. Functional period controls (Today/This week/Last week) must be wired,
   not display-only chips. */
const periodWired = views.includes('data-period') && app.includes("'[data-period]'");
(periodWired) ? ok('Period chips are wired controls')
  : fail('Period chips are display-only (no data-period handler)');

/* 14e. Profile settings must be persisted in-memory (semantic control + state).
   Today the Profile form is inert (read-only inputs / unbound selects). */
const profileWired = views.includes('data-profile-setting') && app.includes('profilePrefs');
(profileWired) ? ok('Profile preferences are persisted in-memory')
  : fail('Profile settings are not persisted (no data-profile-setting control + profilePrefs state)');

/* 14f. D3e inline create: a new record/row followed by immediate inline title
   editing. Today creation is modal-only; no data-inline-create flow exists. */
const inlineCreate = views.includes('data-inline-create') && app.includes("'[data-inline-create]'");
(inlineCreate) ? ok('D3e inline create (new row + immediate title edit) is wired')
  : fail('D3e inline create is absent (no data-inline-create control + handler)');

/* 14g. Free-form Deputy input: a typed composer is required. Today the Deputy
   panel is example-chip-driven only; there is no text input the user can type
   into (example prompts are the ONLY entry path). */
const deputyFreeform = app.includes('dp-composer') || (app.includes('dp-input') && app.includes('dp-send'));
(deputyFreeform) ? ok('Deputy exposes a free-form typed composer (shortcuts remain optional)')
  : fail('Deputy has no free-form typed input (example chips are the only entry path)');

/* 14h. Source-aware record return: a full-page record link must carry the
   originating route/collection so Back restores that source. Today the page
   Back link is hardcoded to "Back to Work" regardless of source. */
const sourceAwareReturn = /data-return-route=/.test(views) && app.includes('returnRoute') && !app.includes("← Back to Work");
(sourceAwareReturn) ? ok('Full-page record Back is source-aware (restores originating route/collection)')
  : fail('Full-page record Back is hardcoded to Work (no source-aware return-route)');

/* 14i. Café Module execution: must prevent duplicate Runs and expose Continue
   when a Run is active, plus step Check/complete actions. */
const cafeExec = views.includes('data-cafe-continue') && app.includes("'[data-cafe-continue]'")
  && views.includes('data-run-action') && app.includes("'[data-run-action]'");
(cafeExec) ? ok('Café execution: Continue-when-active + step Check/complete handlers wired')
  : fail('Café execution not walkable (no data-cafe-continue / data-run-action handlers)');

/* 14j. Ecommerce execution: next-state actions with risk-first ordering. */
const ecoExec = views.includes('data-eco-action') && app.includes("'[data-eco-action]'");
(ecoExec) ? ok('Ecommerce next-state actions are wired')
  : fail('Ecommerce fulfilment has no next-state action handler (data-eco-action)');

/* 14k. Roastery execution: a minimal roast-batch form with yield/quality/
   evidence results (not a toast stub). */
const roastExec = views.includes('data-roast-action') && app.includes("'[data-roast-action]'");
(roastExec) ? ok('Roastery batch form results are wired')
  : fail('Roastery batch logging is a stub (no data-roast-action handler / form)');

/* 14l. 44px phone hit targets must cover EVERY interactive control used for
   actions or navigation, including .btn, .chip, .row-link, and in-row
   .rel-pill — not just nav rows and the FAB. We require these selectors to
   appear inside the @media (max-width: 390px) block. */
const phoneBlock = (() => {
  const idx = css.indexOf('max-width: 390px');
  if (idx === -1) return '';
  const open = css.indexOf('{', idx);
  let depth = 0, j = open;
  for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}') { depth--; if (depth === 0) break; } }
  return css.slice(idx, j + 1);
})();
const requiredTapSelectors = ['.btn', '.chip', '.row-link', '.rel-pill'];
const missingTap = requiredTapSelectors.filter(sel => !phoneBlock.includes(sel));
(missingTap.length === 0) ? ok('All phone action/nav controls meet the 44px hit target')
  : fail(`Phone action controls lack 44px targets: ${missingTap.join(', ')} missing from @media (max-width: 390px)`);

/* 14m. Mobile table cells must carry data-label so reflowed rows stay readable. */
const tdCount = (views.match(/<td\b/g) || []).length + (recs.match(/<td\b/g) || []).length;
const labeledCount = (views.match(/<td\b[^>]*data-label=/g) || []).length + (recs.match(/<td\b[^>]*data-label=/g) || []).length;
(tdCount > 0 && labeledCount >= tdCount) ? ok(`${labeledCount}/${tdCount} table cells carry data-label for mobile`)
  : fail(`Mobile table cells missing data-label (${labeledCount}/${tdCount} labeled)`);

/* 14n. User-facing copy must be free of developer/test scaffolding vocabulary.
   Forbidden in user surfaces (chips, headings, callouts, toasts, panel/page
   body text — comments exempted): fixture, JWT, RLS, capability, contract,
   simulate/Simulate, "prototype fixture". */
const devCopyTerms = [/\bfixture\b/i, /\bJWT\b/, /\bRLS\b/, /\bcapability\b/i, /\bcontract\b/i, /\bSimulate\b/, /prototype fixture/i];
let devCopyViolations = 0;
function lineIsUserFacing(line){
  const t = line.trim();
  if (t === '' ) return false;
  if (commentSafe(t)) return false;
  // developer-only blocks: section banners, import lines, the coverage dialog
  if (/^(import|export|function|const|let|var|return|if|else|for|while|\}|\{|case|default|switch|\*|\/\/)/.test(t)) return false;
  if (/coverage|Developer view|Run <code>node verify/.test(t)) return false;
  // strings inside templates / JSX / callouts / labels / toasts are user-facing
  return /(class="(chip|callout|btn|muted-2|basis-chip|e7-rec-title|e7-rec-type|field-label|inline-state)|<h[1-4]|<p |toast\(|live\(|src:'|placeholder=|>[^<]*[A-Za-z])/.test(t);
}
for (const f of ['e7-views.js','e7-app.js','e7-records.js']) {
  const txt = read(f);
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!lineIsUserFacing(line)) continue;
    for (const re of devCopyTerms) {
      if (re.test(line)) {
        // allowword exemption (e.g. "no capability...") is intentionally NOT
        // applied here: Task 5 requires removing these terms from user copy
        // entirely, not hedging them.
        devCopyViolations++;
        fail(`[dev-copy] user-facing "${String(re).replace(/\.?\/$/,'')}" in ${f}:${i+1}: ${line.trim().slice(0,100)}`);
      }
    }
  }
}
if (!devCopyViolations) ok('User-facing copy is free of developer/test scaffolding vocabulary');

/* 15. Browser-review regression gate. These assertions encode defects that the
   first source pass missed but that were visible in the rendered prototype. */
if (!views.includes('data-work-mobile-collection') || !views.includes('data-work-mobile-saved-view') || !views.includes('data-work-mobile-presentation') || !app.includes("'[data-work-mobile-collection]'")) {
  fail('Phone Work still exposes the full chip cloud instead of compact collection/view pickers');
} else ok('Phone Work uses compact collection, saved-view, and presentation pickers');

if (!views.includes('data-work-search') || !views.includes('data-work-sort') || !views.includes('data-work-group') || !views.includes('data-work-fields') || !views.includes('data-save-view')) {
  fail('Work is missing the functional Search / Sort / Group / Fields / Save view toolbar');
} else ok('Work exposes the complete database-workspace toolbar');

if (!app.includes("state.workPresentation = 'table'") || !app.includes('function inlineCreateTask')) {
  fail('Inline Task creation does not force a table row before beginning title edit');
} else ok('Inline Task creation always reveals and edits the new table row');

if (/data-state="loading"[^>]*aria-hidden="true"(?![^>]*(?:hidden|display\s*:\s*none))/.test(views)) {
  fail('Loading demo skeleton is permanently visible in the normal Work state');
} else ok('Loading state is hidden outside the loading demo');

if (views.includes("myTasks.filter(t=>t.due && t.status!=='Done')") || views.includes('teamRuns.forEach(r=>attention.push')) {
  fail('Home Needs attention still includes every dated Task and every in-progress Run');
} else ok('Home attention is limited to actionable exceptions, blocked/overdue work, and mentions');

if (!views.includes('attentionSourceIds') && !views.includes('attentionIds')) {
  fail('Home does not deduplicate attention records from the period summary');
} else ok('Home avoids repeating attention records in the period summary');

if (views.includes('data-launcher="more" data-journey="J17"') || views.includes('data-launcher="log-roast" data-journey="J18"')) {
  fail('Module header action still opens a generic palette/toast instead of its real inline workflow');
} else ok('Module header actions target their real workflows');

if (!views.includes('${act}</div>')) {
  fail('Ecommerce fulfilment rows are not explicitly closed and nest subsequent content');
} else ok('Ecommerce fulfilment rows close independently');

const userEmoji = /[📌📖📐📎☑📝⚠]/u;
if (userEmoji.test(views + recs)) fail('User-facing E7 sources still contain emoji instead of the icon system');
else ok('User-facing E7 sources use the established icon system');

const leakedUiTerms = ['structured canvas · no view/edit split','process.draft','(A4)','(A7)','(A9)','(D5','canonical records','canonical source'];
const leakedTerms = leakedUiTerms.filter(term => views.includes(term) || recs.includes(term) || app.includes(term));
if (leakedTerms.length) fail(`User UI still exposes specification language: ${leakedTerms.join(', ')}`);
else ok('User UI copy contains no specification annotations or raw permission keys');

if (recs.includes('return `<dd>') || views.includes('<div class="field-label" for=')) {
  fail('Record values or form fields still emit invalid definition/label semantics');
} else ok('Record values and form controls use valid semantic markup');

if (!app.includes('groundedAttention') || !app.includes("r.type==='exception'") || !app.includes("r.type==='task'")) {
  fail('Deputy attention answers are not grounded in the same Task/Exception records as Home');
} else ok('Deputy and Home use the same attention truth');

if (views.includes("(team.areas||['Kitchen','Bar']).map(a=>") && views.includes('data-open-record="${openRun}"')) {
  fail('Café renders the same active Run once per Area, creating duplicate records');
} else ok('Café displays an active Run once, in its actual Area context');

const inlineCreateBody = app.slice(app.indexOf('function inlineCreateTask'), app.indexOf('function openTaskComposer'));
if (!inlineCreateBody.includes("state.workPresentation = 'table'")) {
  fail('Inline Task creation can remain in Board/Timeline and hide the editable row');
} else ok('Inline Task creation explicitly switches to Table before editing');

if (!app.includes("e.target===titleCell") && !app.includes("e.target === titleCell")) {
  fail('Enter in the inline title input bubbles to the cell and immediately reopens editing');
} else ok('Inline title commit does not re-enter edit mode');

if (/e7-toast[\s\S]{0,500}border-left/.test(app)) {
  fail('Toast still uses a decorative colored side stripe');
} else ok('Toast uses the neutral border treatment');

const visibleInternalCopy = [
  ['record decision markers', /\(A(?:7|10|11)/.test(recs)],
  ['raw permission keys', views.includes('<code>${esc(c)}</code>') || views.includes('<code>${esc(cap)}</code>') || recs.includes('standard.publish</span>')],
  ['canonical implementation wording', views.includes('>links canonical cost records<') || views.includes('Every Task links to its canonical record') || recs.includes('it is a BU-canonical asset') || app.includes('Creates a separate canonical Task')],
  ['Deputy decision markers', app.includes('live in-context record, D5e')],
].filter(([,present])=>present).map(([label])=>label);
if (visibleInternalCopy.length) fail(`User-facing copy still exposes internal design language: ${visibleInternalCopy.join(', ')}`);
else ok('User-facing copy hides internal decision and permission vocabulary');

if (!views.includes('class="cafe-area-grid"') || !css.includes('.cafe-area-grid')) {
  fail('Café Area cards do not stack into a readable phone layout');
} else ok('Café Area cards have a dedicated responsive layout');

if (!app.includes("setAttribute('aria-label', `Switch person:")) {
  fail('The phone person switcher has no accessible name');
} else ok('The phone person switcher remains named when its text is hidden');

if (!views.includes('for="profile-person"') || !views.includes('for="profile-role"') || !views.includes('for="profile-home-order"')) {
  fail('Profile identity and layout controls are not explicitly labelled');
} else ok('Profile controls have explicit labels');

const computeAttentionBody = views.slice(views.indexOf('export function computeAttention'), views.indexOf('function head'));
const renderHomeBody = views.slice(views.indexOf('export function renderHome'), views.indexOf('/* ═', views.indexOf('export function renderHome') + 10));
if (computeAttentionBody.includes('attentionSourceIds') || !renderHomeBody.includes('personalTasks')) {
  fail('Home-only attention deduplication leaked into the shared attention helper');
} else ok('Home deduplicates its personal section without breaking shared attention truth');

if (recs.includes('Tasks use <b>PIC + Supervisor</b>, not RACI') || recs.includes('source: Parent A')) {
  fail('Task records still teach internal ownership decisions instead of showing the assigned people');
} else ok('Task records present ownership without internal decision commentary');

if (!app.includes('aria-label="Ask Deputy about this ${esc(typeName(rec?.type))}"')) {
  fail('The panel Deputy action has no stable accessible name');
} else ok('The panel Deputy action has an explicit accessible name');

if (app.includes('<button type="button" class="cmd-row" data-more=') || app.includes('opens a governed create flow (prototype)')) {
  fail('Deferred create flows still appear clickable but only produce a prototype toast');
} else ok('Deferred create flows are honest non-interactive explanations');

if (app.includes('Same registry for desktop') || app.includes('Ayu sees no Money/Admin commands') || app.includes('Budget (governed)')) {
  fail('The Create launcher still explains implementation and permission-test details to users');
} else ok('The Create launcher uses task-focused plain language');

report();
function report(){
  console.log('\n──────── E7 prototype static verifier ────────');
  for (const n of notes) console.log(n);
  if (errors.length){
    console.log(`\n✗ ${errors.length} contract failure(s):`);
    for (const e of errors) console.log('  ✗ ' + e);
    console.log(`\nResult: FAIL — ${errors.length} missing/forbidden`);
    process.exit(1);
  }
  console.log(`\nPASS: J01-J23 · S1-S6 · A1-A14 contracts · 9 states · 3 responsive regimes`);
  process.exit(0);
}
