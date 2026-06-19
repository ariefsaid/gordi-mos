/* MOS Design Kit UI — Kanban (Opportunities board). Per ia-patterns.md. */
(function () {
  var ID = 'mosdk-kanban';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-board{height:100%;display:flex;flex-direction:column;background:var(--ds-background-secondary);',
    'font-family:var(--ds-font-family);}',
    '.mk-board__head{display:flex;align-items:center;gap:8px;height:56px;padding:0 var(--ds-spacing-4);',
    'border-bottom:1px solid var(--ds-border-color-light);}',
    '.mk-board__icon{display:inline-flex;color:var(--ds-font-color-tertiary);}',
    '.mk-board__title{font-family:var(--ds-font-display);font-size:var(--ds-font-size-md);font-weight:600;',
    'color:var(--ds-font-color-primary);}',
    '.mk-board__count{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);',
    'background:var(--ds-background-tertiary);border-radius:var(--ds-border-radius-pill);padding:1px 8px;}',
    '.mk-board__headactions{margin-left:auto;display:flex;align-items:center;gap:8px;}',
    '.mk-board__cols{flex:1;display:flex;gap:var(--ds-spacing-3);padding:var(--ds-spacing-3);overflow:auto;align-items:flex-start;}',
    '.mk-col{width:248px;flex:none;display:flex;flex-direction:column;gap:var(--ds-spacing-2);}',
    '.mk-col__head{display:flex;align-items:center;gap:6px;padding:0 2px;}',
    '.mk-col__dot{width:8px;height:8px;border-radius:50%;flex:none;}',
    '.mk-col__name{font-size:var(--ds-font-size-sm);font-weight:500;color:var(--ds-font-color-primary);}',
    '.mk-col__count{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-light);}',
    '.mk-col__sum{margin-left:auto;font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);font-variant-numeric:tabular-nums;}',
    '.mk-card{background:var(--ds-background-primary);border:1px solid var(--ds-border-color-medium);',
    'border-radius:var(--ds-border-radius-md);padding:var(--ds-spacing-2);box-shadow:var(--ds-box-shadow-light);',
    'display:flex;flex-direction:column;gap:8px;cursor:pointer;}',
    '.mk-card:hover{border-color:var(--ds-border-color-strong);box-shadow:var(--ds-box-shadow-strong);}',
    '.mk-card__name{font-size:var(--ds-font-size-sm);font-weight:500;color:var(--ds-font-color-primary);line-height:1.3;}',
    '.mk-card__amount{font-size:var(--ds-font-size-sm);font-weight:600;color:var(--ds-color-green);font-variant-numeric:tabular-nums;}',
    '.mk-card__meta{display:flex;align-items:center;gap:6px;font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);}',
    '.mk-card__meta .ti{color:var(--ds-font-color-tertiary);}',
  ].join('');
  document.head.appendChild(s);
})();

function Kanban(props) {
  props = props || {};
  var items = props.items || window.MOS_DATA.opportunities;
  var onToggleView = props.onToggleView;
  var { IconButton, Button } = window.MosDesignKit;
  var { Ti, mkIcon } = window;
  var D = window.MOS_DATA;

  var stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'];
  var dotColor = { 'Lead': 'gray', 'Qualified': 'sky', 'Proposal': 'amber', 'Negotiation': 'iris', 'Closed Won': 'green' };

  var byStage = {};
  stages.forEach(function (st) { byStage[st] = []; });
  items.forEach(function (o) { if (byStage[o.stage]) byStage[o.stage].push(o); });

  var sum = function (list) { return list.reduce(function (a, o) { return a + (o.amount || 0); }, 0); };

  return (
    <div className="mk-board">
      <div className="mk-board__head">
        <span className="mk-board__icon"><Ti name="target" size={20} /></span>
        <span className="mk-board__title">Opportunities</span>
        <span className="mk-board__count">{window.fmtNum(items.length)}</span>
        <div className="mk-board__headactions">
          <IconButton ariaLabel="Layout: table" variant="secondary" Icon={mkIcon('layout-list')} onClick={onToggleView} />
          <Button variant="secondary" Icon={mkIcon('plus')}>Add</Button>
        </div>
      </div>
      <div className="mk-board__cols">
        {stages.map(function (st) {
          var list = byStage[st];
          return (
            <div className="mk-col" key={st}>
              <div className="mk-col__head">
                <span className="mk-col__dot" style={{ background: 'var(--ds-color-' + dotColor[st] + '9)' }} />
                <span className="mk-col__name">{st}</span>
                <span className="mk-col__count">{window.fmtNum(list.length)}</span>
                <span className="mk-col__sum">{window.fmtMoney(sum(list))}</span>
              </div>
              {list.map(function (o) {
                return (
                  <div className="mk-card" key={o.id}>
                    <div className="mk-card__name">{o.name}</div>
                    <div className="mk-card__amount">{window.fmtMoney(o.amount)}</div>
                    <div className="mk-card__meta">
                      <Avatar placeholder={o.owner} size="xs" type="rounded" />
                      <span>{o.company}</span>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Ti name="calendar" size={13} /> {o.closeDate}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Kanban: Kanban });
