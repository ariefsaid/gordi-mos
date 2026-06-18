/* MOS Design Kit — Tag (uses --ds-tag-background-{color} / --ds-tag-text-{color}) */
(function () {
  var ID = 'mosdk-tag';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;',
    'border-radius:var(--ds-border-radius-pill);font-family:var(--ds-font-family);',
    'font-size:var(--ds-font-size-xs);font-weight:var(--ds-font-weight-regular);line-height:1.4;',
    'white-space:nowrap;vertical-align:middle;}',
    '.mk-tag--medium{font-weight:var(--ds-font-weight-medium);}',
    '.mk-tag__icon{display:inline-flex;flex:none;}',
  ].join('');
  document.head.appendChild(s);
})();

function Tag(props) {
  props = props || {};
  var text = props.text, children = props.children, color = props.color || 'gray',
    Icon = props.Icon, weight = props.weight || 'regular';
  var style = {
    background: 'var(--ds-tag-background-' + color + ')',
    color: 'var(--ds-tag-text-' + color + ')',
  };
  var cls = ['mk-tag'];
  if (weight === 'medium') cls.push('mk-tag--medium');
  return (
    <span className={cls.join(' ')} style={style}>
      {Icon ? <span className="mk-tag__icon"><Icon size={14} /></span> : null}
      <span>{text || children}</span>
    </span>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Tag: Tag });
