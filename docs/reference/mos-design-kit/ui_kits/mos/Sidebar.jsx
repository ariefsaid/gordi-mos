/* MOS Design Kit UI — Sidebar (left rail). Layout per ia-patterns.md. */
(function () {
  var ID = 'mosdk-sidebar';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-rail{width:236px;height:100%;background:var(--ds-background-secondary);',
    'border-right:1px solid var(--ds-border-color-light);box-sizing:border-box;',
    'display:flex;flex-direction:column;padding:var(--ds-spacing-2);gap:var(--ds-spacing-2);',
    'font-family:var(--ds-font-family);overflow:hidden;}',
    /* workspace switcher */
    '.mk-ws{display:flex;align-items:center;gap:8px;height:36px;padding:0 6px;border-radius:var(--ds-border-radius-sm);cursor:pointer;}',
    '.mk-ws:hover{background:var(--ds-background-transparent-light);}',
    '.mk-ws__mark{width:24px;height:24px;border-radius:var(--ds-border-radius-sm);',
    'background:var(--ds-color-blue);color:var(--ds-font-color-inverted);display:inline-flex;',
    'align-items:center;justify-content:center;font-family:var(--ds-font-display);font-weight:600;font-size:var(--ds-font-size-sm);flex:none;}',
    '.mk-ws__name{font-size:var(--ds-font-size-md);font-weight:600;color:var(--ds-font-color-primary);flex:1;}',
    /* search row */
    '.mk-searchrow{display:flex;align-items:center;gap:8px;height:32px;padding:0 8px;',
    'background:var(--ds-background-primary);border:1px solid var(--ds-border-color-medium);',
    'border-radius:var(--ds-border-radius-sm);color:var(--ds-font-color-light);cursor:text;}',
    '.mk-searchrow:hover{background:var(--ds-background-secondary);}',
    '.mk-searchrow__label{flex:1;font-size:var(--ds-font-size-sm);}',
    '.mk-kbd{font-family:var(--ds-code-font-family);font-size:var(--ds-font-size-xxs);',
    'color:var(--ds-font-color-tertiary);background:var(--ds-background-tertiary);',
    'border:1px solid var(--ds-border-color-light);border-radius:var(--ds-border-radius-xs);padding:1px 5px;}',
    /* nav item */
    '.mk-navitem{display:flex;align-items:center;gap:8px;height:28px;padding:0 8px;',
    'border-radius:var(--ds-border-radius-sm);font-size:var(--ds-font-size-sm);font-weight:400;',
    'color:var(--ds-font-color-secondary);cursor:pointer;flex:none;}',
    '.mk-navitem__icon{display:inline-flex;color:var(--ds-font-color-tertiary);flex:none;}',
    '.mk-navitem__label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mk-navitem__count{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-light);}',
    '.mk-navitem:hover{background:var(--ds-background-transparent-light);}',
    '.mk-navitem.is-active{background:var(--ds-background-transparent-light);color:var(--ds-font-color-primary);font-weight:500;}',
    '.mk-navitem.is-active .mk-navitem__icon{color:var(--ds-color-blue);}',
    /* sections */
    '.mk-section__label{font-size:var(--ds-font-size-xs);font-weight:500;color:var(--ds-font-color-light);',
    'padding:14px 8px 4px;letter-spacing:.02em;}',
    '.mk-section{display:flex;flex-direction:column;gap:1px;}',
    /* user chip foot */
    '.mk-rail__spacer{flex:1;}',
    '.mk-userchip{display:flex;align-items:center;gap:8px;height:36px;padding:0 6px;',
    'border-radius:var(--ds-border-radius-sm);cursor:pointer;}',
    '.mk-userchip:hover{background:var(--ds-background-transparent-light);}',
    '.mk-userchip__meta{display:flex;flex-direction:column;line-height:1.2;min-width:0;}',
    '.mk-userchip__name{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-primary);font-weight:500;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mk-userchip__role{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);}',
  ].join('');
  document.head.appendChild(s);
})();

function Sidebar(props) {
  props = props || {};
  var active = props.active, onNavigate = props.onNavigate;
  var D = window.MOS_DATA;
  var workspace = props.workspace || D.workspace;
  var user = props.user || D.user;
  var favorites = props.favorites || [
    { key: 'fav-globex', label: 'Globex Corporation', icon: 'star' },
    { key: 'fav-northwind', label: 'Northwind Traders', icon: 'star' },
  ];
  var { Ti } = window;

  var nav = function (key) { return function () { onNavigate && onNavigate(key); }; };
  var workspaceItems = [
    { key: 'companies', label: 'Companies', icon: 'building', count: D.companies.length },
    { key: 'people', label: 'People', icon: 'users' },
    { key: 'opportunities', label: 'Opportunities', icon: 'target', count: D.opportunities.length },
    { key: 'tasks', label: 'Tasks', icon: 'checklist' },
    { key: 'notes', label: 'Notes', icon: 'notes' },
  ];

  return (
    <aside className="mk-rail">
      <div className="mk-ws" onClick={nav('workspace')}>
        <span className="mk-ws__mark">{workspace.charAt(0)}</span>
        <span className="mk-ws__name">{workspace}</span>
        <Ti name="chevron-down" size={16} color="var(--ds-font-color-tertiary)" />
      </div>

      <div className="mk-searchrow" onClick={nav('search')}>
        <Ti name="search" size={16} />
        <span className="mk-searchrow__label">Search</span>
        <span className="mk-kbd">⌘K</span>
      </div>

      <div className="mk-section">
        <div className="mk-navitem"><span className="mk-navitem__icon"><Ti name="search" size={16} /></span><span className="mk-navitem__label">Search</span></div>
        <div className="mk-navitem"><span className="mk-navitem__icon"><Ti name="bell" size={16} /></span><span className="mk-navitem__label">Notifications</span></div>
        <div className="mk-navitem"><span className="mk-navitem__icon"><Ti name="settings" size={16} /></span><span className="mk-navitem__label">Settings</span></div>
      </div>

      <div className="mk-section">
        <div className="mk-section__label">Favorites</div>
        {favorites.map(function (f) {
          return (
            <div key={f.key} className={'mk-navitem' + (active === f.key ? ' is-active' : '')} onClick={nav(f.key)}>
              <span className="mk-navitem__icon"><Ti name={f.icon} size={16} /></span>
              <span className="mk-navitem__label">{f.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mk-section">
        <div className="mk-section__label">Workspace</div>
        {workspaceItems.map(function (it) {
          return (
            <div key={it.key} className={'mk-navitem' + (active === it.key ? ' is-active' : '')} onClick={nav(it.key)}>
              <span className="mk-navitem__icon"><Ti name={it.icon} size={16} /></span>
              <span className="mk-navitem__label">{it.label}</span>
              {it.count != null ? <span className="mk-navitem__count">{window.fmtNum(it.count)}</span> : null}
            </div>
          );
        })}
      </div>

      <div className="mk-rail__spacer" />

      <div className="mk-userchip">
        <Avatar placeholder={user.name} size="md" type="rounded" />
        <div className="mk-userchip__meta">
          <span className="mk-userchip__name">{user.name}</span>
          <span className="mk-userchip__role">{user.role}</span>
        </div>
        <Ti name="dots-vertical" size={16} color="var(--ds-font-color-tertiary)" />
      </div>
    </aside>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Sidebar: Sidebar });
