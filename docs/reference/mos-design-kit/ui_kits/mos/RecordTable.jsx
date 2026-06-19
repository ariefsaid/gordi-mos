/* MOS Design Kit UI — RecordTable (Companies). Layout per ia-patterns.md. */
(function () {
  var ID = 'mosdk-table';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-tablepage{background:var(--ds-background-primary);height:100%;display:flex;flex-direction:column;',
    'font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);overflow:auto;}',
    '.mk-tablepage__head{display:flex;align-items:center;gap:8px;height:56px;padding:0 var(--ds-spacing-4);',
    'border-bottom:1px solid var(--ds-border-color-light);}',
    '.mk-tablepage__icon{display:inline-flex;color:var(--ds-font-color-tertiary);}',
    '.mk-tablepage__title{font-family:var(--ds-font-display);font-size:var(--ds-font-size-md);font-weight:600;',
    'color:var(--ds-font-color-primary);}',
    '.mk-tablepage__count{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);',
    'background:var(--ds-background-tertiary);border-radius:var(--ds-border-radius-pill);padding:1px 8px;}',
    '.mk-tablepage__headactions{margin-left:auto;display:flex;align-items:center;gap:8px;}',
    /* toolbar */
    '.mk-toolbar{display:flex;align-items:center;gap:8px;padding:8px var(--ds-spacing-4);',
    'border-bottom:1px solid var(--ds-border-color-light);}',
    '.mk-tab{height:28px;padding:0 8px;display:inline-flex;align-items:center;gap:6px;border:none;',
    'background:transparent;border-radius:var(--ds-border-radius-sm);font-family:var(--ds-font-family);',
    'font-size:var(--ds-font-size-sm);font-weight:500;color:var(--ds-font-color-secondary);cursor:pointer;}',
    '.mk-tab:hover{background:var(--ds-background-transparent-light);}',
    '.mk-tab.is-active{color:var(--ds-font-color-primary);box-shadow:inset 0 -2px 0 var(--ds-color-blue);}',
    '.mk-chipbtn{height:28px;padding:0 8px;display:inline-flex;align-items:center;gap:6px;',
    'background:var(--ds-background-primary);border:1px solid var(--ds-border-color-medium);',
    'border-radius:var(--ds-border-radius-sm);font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);',
    'font-weight:500;color:var(--ds-font-color-secondary);cursor:pointer;}',
    '.mk-chipbtn:hover{background:var(--ds-background-transparent-light);}',
    '.mk-toolbar__spacer{flex:1;}',
    /* table */
    '.mk-table{width:100%;border-collapse:collapse;table-layout:fixed;}',
    '.mk-table th{position:sticky;top:0;background:var(--ds-background-primary);height:32px;text-align:left;',
    'font-size:var(--ds-font-size-xs);font-weight:400;color:var(--ds-font-color-light);',
    'border-bottom:1px solid var(--ds-border-color-light);padding:0 8px;z-index:1;}',
    '.mk-table th .mk-th__icon{display:inline-flex;color:var(--ds-font-color-light);vertical-align:middle;margin-right:4px;}',
    '.mk-table td{height:33px;padding:0 8px;border-bottom:1px solid var(--ds-border-color-light);',
    'color:var(--ds-font-color-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mk-table tbody tr{position:relative;}',
    '.mk-table tbody tr:hover{background:var(--ds-background-secondary);}',
    '.mk-table tbody tr:hover .mk-rowcheck{visibility:visible;}',
    '.mk-rowcheck{visibility:hidden;display:inline-flex;}',
    '.mk-rowcheck.is-selected{visibility:visible;}',
    '.mk-cell-secondary{display:inline-flex;align-items:center;gap:6px;color:var(--ds-font-color-secondary);}',
    '.mk-cell-secondary .ti{color:var(--ds-font-color-tertiary);}',
    '.mk-tnum{font-variant-numeric:tabular-nums;}',
    '.mk-col-co{width:30%;}', '.mk-col-owner{width:18%;}', '.mk-col-arr{width:13%;text-align:right;}',
    '.mk-col-emp{width:11%;text-align:right;}', '.mk-col-stage{width:14%;}', '.mk-col-loc{width:14%;}',
    '.mk-col-check{width:32px;padding-left:12px;}',
    '.mk-th-arr,.mk-th-emp{text-align:right;}',
  ].join('');
  document.head.appendChild(s);
})();

function RecordTable(props) {
  props = props || {};
  var items = props.items || window.MOS_DATA.companies;
  var onOpenRecord = props.onOpenRecord, onToggleView = props.onToggleView;
  var { Checkbox, Tag, Chip, IconButton, Button } = window.MosDesignKit;
  var { Ti, mkIcon } = window;
  var D = window.MOS_DATA;

  var tabsState = React.useState('All');
  var tab = tabsState[0], setTab = tabsState[1];
  var selState = React.useState({});
  var selected = selState[0], setSelected = selState[1];

  var rows = items;
  if (tab === 'Customers') rows = items.filter(function (c) { return c.stage === 'Customer'; });
  if (tab === 'Prospects') rows = items.filter(function (c) { return c.stage !== 'Customer'; });

  var allKeys = rows.map(function (c) { return c.id; });
  var selectedCount = allKeys.filter(function (k) { return selected[k]; }).length;
  var allSelected = selectedCount === allKeys.length && allKeys.length > 0;
  var someSelected = selectedCount > 0 && !allSelected;

  var toggleRow = function (id) {
    setSelected(function (prev) { var n = Object.assign({}, prev); n[id] = !n[id]; return n; });
  };
  var toggleAll = function () {
    setSelected(function () {
      if (allSelected) return {};
      var n = {}; allKeys.forEach(function (k) { n[k] = true; }); return n;
    });
  };

  return (
    <div className="mk-tablepage">
      <div className="mk-tablepage__head">
        <span className="mk-tablepage__icon"><Ti name="building" size={20} /></span>
        <span className="mk-tablepage__title">Companies</span>
        <span className="mk-tablepage__count">{window.fmtNum(rows.length)}</span>
        <div className="mk-tablepage__headactions">
          <IconButton ariaLabel="Layout: kanban" variant="secondary" Icon={mkIcon('layout-columns')} onClick={onToggleView} />
          <Button variant="secondary" Icon={mkIcon('plus')}>Add</Button>
        </div>
      </div>

      <div className="mk-toolbar">
        {['All', 'Customers', 'Prospects'].map(function (t) {
          return <button key={t} className={'mk-tab' + (tab === t ? ' is-active' : '')} onClick={function () { setTab(t); }}>{t}</button>;
        })}
        <button className="mk-chipbtn"><Ti name="filter" size={14} /> Filter</button>
        <button className="mk-chipbtn"><Ti name="arrows-sort" size={14} /> Sort</button>
        <div className="mk-toolbar__spacer" />
        <span style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-font-color-tertiary)' }}>
          {selectedCount > 0 ? selectedCount + ' selected' : ''}
        </span>
      </div>

      <table className="mk-table">
        <colgroup>
          <col className="mk-col-check" />
          <col className="mk-col-co" />
          <col className="mk-col-owner" />
          <col className="mk-col-arr" />
          <col className="mk-col-emp" />
          <col className="mk-col-stage" />
          <col className="mk-col-loc" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <Checkbox checked={allSelected} indeterminate={someSelected} size="small" onChange={toggleAll} />
            </th>
            <th>Name</th>
            <th>Account owner</th>
            <th className="mk-th-arr">ARR</th>
            <th className="mk-th-emp">Employees</th>
            <th>Stage</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(function (c) {
            var isSel = !!selected[c.id];
            return (
              <tr key={c.id}>
                <td>
                  <span className={'mk-rowcheck' + (isSel ? ' is-selected' : '')}>
                    <Checkbox checked={isSel} size="small" onChange={function () { toggleRow(c.id); }} />
                  </span>
                </td>
                <td>
                  <Chip label={c.name} clickable onClick={function () { onOpenRecord && onOpenRecord(c); }} />
                </td>
                <td>
                  <span className="mk-cell-secondary">
                    <Avatar placeholder={c.owner} size="xs" type="rounded" /> {c.owner}
                  </span>
                </td>
                <td className="mk-tnum" style={{ textAlign: 'right', color: 'var(--ds-font-color-secondary)' }}>{c.arr ? window.fmtMoney(c.arr) : '—'}</td>
                <td className="mk-tnum" style={{ textAlign: 'right', color: 'var(--ds-font-color-secondary)' }}>{window.fmtNum(c.employees)}</td>
                <td>{c.stage ? <Tag text={c.stage} color={(D.stageColor && D.stageColor[c.stage]) || 'gray'} /> : null}</td>
                <td><span className="mk-cell-secondary"><Ti name="map-pin" size={14} /> {c.location}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { RecordTable: RecordTable });
