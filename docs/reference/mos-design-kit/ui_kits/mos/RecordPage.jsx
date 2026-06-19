/* MOS Design Kit UI — RecordPage (two-column: details + tabbed feed). Per ia-patterns.md. */
(function () {
  var ID = 'mosdk-recordpage';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-record{height:100%;display:flex;flex-direction:column;background:var(--ds-background-primary);',
    'font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);}',
    /* breadcrumb */
    '.mk-crumb{display:flex;align-items:center;gap:6px;height:48px;padding:0 var(--ds-spacing-4);',
    'border-bottom:1px solid var(--ds-border-color-light);color:var(--ds-font-color-tertiary);}',
    '.mk-crumb__back{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--ds-font-color-secondary);',
    'background:none;border:none;font-family:inherit;font-size:var(--ds-font-size-sm);padding:4px 6px;border-radius:var(--ds-border-radius-sm);}',
    '.mk-crumb__back:hover{background:var(--ds-background-transparent-light);color:var(--ds-font-color-primary);}',
    '.mk-crumb__current{color:var(--ds-font-color-primary);}',
    /* body */
    '.mk-record__body{flex:1;display:flex;min-height:0;}',
    /* left details */
    '.mk-details{width:332px;flex:none;border-right:1px solid var(--ds-border-color-light);',
    'padding:var(--ds-spacing-4);display:flex;flex-direction:column;gap:var(--ds-spacing-4);overflow:auto;}',
    '.mk-details__identity{display:flex;align-items:center;gap:12px;}',
    '.mk-details__name{font-family:var(--ds-font-display);font-size:var(--ds-font-size-xl);font-weight:600;',
    'letter-spacing:-0.01em;color:var(--ds-font-color-primary);line-height:1.2;}',
    '.mk-details__sub{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-tertiary);}',
    '.mk-details__actions{display:flex;gap:6px;}',
    '.mk-sectionlabel{font-size:var(--ds-font-size-xs);font-weight:500;color:var(--ds-font-color-light);',
    'text-transform:uppercase;letter-spacing:.05em;}',
    '.mk-fields{display:flex;flex-direction:column;}',
    '.mk-field{display:flex;align-items:center;min-height:30px;}',
    '.mk-field__label{width:104px;flex:none;display:inline-flex;align-items:center;gap:6px;',
    'color:var(--ds-font-color-tertiary);font-size:var(--ds-font-size-sm);}',
    '.mk-field__label .ti{color:var(--ds-font-color-tertiary);}',
    '.mk-field__value{color:var(--ds-font-color-primary);font-size:var(--ds-font-size-sm);}',
    '.mk-tags{display:flex;flex-wrap:wrap;gap:6px;}',
    '.mk-people{display:flex;flex-wrap:wrap;gap:6px;}',
    /* right feed */
    '.mk-feed{flex:1;display:flex;flex-direction:column;min-width:0;}',
    '.mk-tabs{display:flex;gap:0;border-bottom:1px solid var(--ds-border-color-light);padding:0 var(--ds-spacing-4);}',
    '.mk-feedtab{height:40px;padding:0 12px;display:inline-flex;align-items:center;background:none;border:none;',
    'font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);font-weight:500;color:var(--ds-font-color-tertiary);',
    'cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}',
    '.mk-feedtab:hover{color:var(--ds-font-color-secondary);}',
    '.mk-feedtab.is-active{color:var(--ds-font-color-primary);border-bottom-color:var(--ds-color-blue);}',
    '.mk-feed__list{flex:1;overflow:auto;padding:var(--ds-spacing-4);display:flex;flex-direction:column;gap:2px;}',
    '.mk-event{display:flex;align-items:flex-start;gap:10px;padding:8px 0;}',
    '.mk-event__glyph{display:inline-flex;width:24px;height:24px;border-radius:var(--ds-border-radius-sm);',
    'background:var(--ds-background-tertiary);align-items:center;justify-content:center;color:var(--ds-font-color-secondary);flex:none;}',
    '.mk-event__body{display:flex;flex-direction:column;gap:2px;}',
    '.mk-event__text{color:var(--ds-font-color-secondary);font-size:var(--ds-font-size-sm);}',
    '.mk-event__time{color:var(--ds-font-color-light);font-size:var(--ds-font-size-xs);}',
    '.mk-note{background:var(--ds-color-yellow1);border:1px solid var(--ds-border-color-light);',
    'border-radius:var(--ds-border-radius-md);padding:12px 14px;}',
    '.mk-note__head{display:flex;align-items:center;gap:8px;margin-bottom:4px;}',
    '.mk-note__author{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-primary);font-weight:500;}',
    '.mk-note__time{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);margin-left:auto;}',
    '.mk-note__body{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-secondary);}',
    '.mk-taskrow{display:flex;align-items:center;gap:10px;padding:6px 0;}',
    '.mk-taskrow__text{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-secondary);}',
    '.mk-taskrow__due{margin-left:auto;font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);}',
    '.mk-file{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--ds-border-color-light);}',
    '.mk-file__icon{display:inline-flex;color:var(--ds-font-color-tertiary);}',
    '.mk-file__name{color:var(--ds-font-color-primary);font-size:var(--ds-font-size-sm);}',
    '.mk-file__size{margin-left:auto;color:var(--ds-font-color-tertiary);font-size:var(--ds-font-size-xs);}',
  ].join('');
  document.head.appendChild(s);
})();

function RecordPage(props) {
  props = props || {};
  var record = props.record, onBack = props.onBack;
  var D = window.MOS_DATA;
  var { Avatar, Tag, Chip, IconButton, Checkbox } = window.MosDesignKit;
  var { Ti } = window;
  var tabState = React.useState('Timeline');
  var tab = tabState[0], setTab = tabState[1];
  if (!record) return null;
  var tabs = ['Timeline', 'Tasks', 'Notes', 'Files'];

  return (
    <div className="mk-record">
      <div className="mk-crumb">
        <button className="mk-crumb__back" onClick={onBack}>
          <Ti name="building" size={16} /> Companies
        </button>
        <Ti name="chevron-right" size={16} color="var(--ds-font-color-light)" />
        <span className="mk-crumb__current">{record.name}</span>
      </div>

      <div className="mk-record__body">
        {/* LEFT DETAILS */}
        <div className="mk-details">
          <div>
            <div className="mk-details__identity">
              <Avatar placeholder={record.name} size="xl" type="rounded" />
              <div>
                <div className="mk-details__name">{record.name}</div>
                <div className="mk-details__sub">{record.domain}</div>
              </div>
            </div>
            <div className="mk-details__actions" style={{ marginTop: 12 }}>
              <IconButton ariaLabel="Edit" variant="secondary" size="small" Icon={function (p) { return <Ti name="pencil" {...p} />; }} />
              <IconButton ariaLabel="Share" variant="secondary" size="small" Icon={function (p) { return <Ti name="share" {...p} />; }} />
              <IconButton ariaLabel="More" variant="secondary" size="small" Icon={function (p) { return <Ti name="dots" {...p} />; }} />
            </div>
          </div>

          <div>
            <div className="mk-sectionlabel" style={{ marginBottom: 8 }}>Details</div>
            <div className="mk-fields">
              <div className="mk-field"><span className="mk-field__label"><Ti name="user" size={14} /> Owner</span><span className="mk-field__value">{record.owner}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="currency-dollar" size={14} /> ARR</span><span className="mk-field__value mk-tnum">{record.arr ? window.fmtMoney(record.arr) : '—'}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="users" size={14} /> Employees</span><span className="mk-field__value mk-tnum">{window.fmtNum(record.employees)}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="chart-dots" size={14} /> Stage</span><span className="mk-field__value">{record.stage ? <Tag text={record.stage} color={(D.stageColor && D.stageColor[record.stage]) || 'gray'} /> : '—'}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="map-pin" size={14} /> Location</span><span className="mk-field__value">{record.location}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="world" size={14} /> Website</span><span className="mk-field__value">{record.website}</span></div>
              <div className="mk-field"><span className="mk-field__label"><Ti name="phone" size={14} /> Phone</span><span className="mk-field__value">{record.phone}</span></div>
            </div>
          </div>

          <div>
            <div className="mk-sectionlabel" style={{ marginBottom: 8 }}>Tags</div>
            <div className="mk-tags">
              {(record.tags || []).map(function (t, i) {
                var colors = ['blue', 'purple', 'amber'];
                return <Tag key={t} text={t} color={colors[i % colors.length]} />;
              })}
            </div>
          </div>

          <div>
            <div className="mk-sectionlabel" style={{ marginBottom: 8 }}>Related people</div>
            <div className="mk-people">
              {(record.people || []).map(function (p) {
                return <Chip key={p} label={p} clickable onClick={function () {}} />;
              })}
            </div>
          </div>
        </div>

        {/* RIGHT FEED */}
        <div className="mk-feed">
          <div className="mk-tabs">
            {tabs.map(function (t) {
              return <button key={t} className={'mk-feedtab' + (tab === t ? ' is-active' : '')} onClick={function () { setTab(t); }}>{t}</button>;
            })}
          </div>
          <div className="mk-feed__list">
            {tab === 'Timeline' && D.timeline.map(function (ev) {
              return (
                <div className="mk-event" key={ev.id}>
                  <span className="mk-event__glyph"><Ti name={ev.glyph} size={14} /></span>
                  <div className="mk-event__body">
                    <span className="mk-event__text">{ev.text}</span>
                    <span className="mk-event__time">{ev.time}</span>
                  </div>
                </div>
              );
            })}

            {tab === 'Tasks' && D.tasks.map(function (t) {
              return (
                <div className="mk-taskrow" key={t.id}>
                  <Checkbox checked={t.done} size="small" />
                  <span className="mk-taskrow__text" style={t.done ? { textDecoration: 'line-through', color: 'var(--ds-font-color-tertiary)' } : null}>{t.text}</span>
                  <span className="mk-taskrow__due">{t.due}</span>
                </div>
              );
            })}

            {tab === 'Notes' && D.notes.map(function (n) {
              return (
                <div className="mk-note" key={n.id} style={{ marginBottom: 10 }}>
                  <div className="mk-note__head">
                    <Avatar placeholder={n.author} size="xs" type="rounded" />
                    <span className="mk-note__author">{n.author}</span>
                    <span className="mk-note__time">{n.time}</span>
                  </div>
                  <div className="mk-note__body">{n.body}</div>
                </div>
              );
            })}

            {tab === 'Files' && D.files.map(function (f) {
              return (
                <div className="mk-file" key={f.id}>
                  <span className="mk-file__icon"><Ti name="file-text" size={18} /></span>
                  <span className="mk-file__name">{f.name}</span>
                  <span className="mk-file__size">{f.size}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { RecordPage: RecordPage });
