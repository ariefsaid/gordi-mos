/* MOS Design Kit — Chip (label + optional leading avatar/icon) */
(function () {
  var ID = 'mosdk-chip';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-chip{display:inline-flex;align-items:center;gap:6px;padding:0;border:none;background:transparent;',
    'font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);color:var(--ds-font-color-primary);',
    'line-height:1;max-width:100%;}',
    '.mk-chip.is-clickable{cursor:pointer;}',
    '.mk-chip.is-clickable:hover .mk-chip__label{text-decoration:underline;}',
    '.mk-chip__icon{display:inline-flex;color:var(--ds-font-color-tertiary);flex:none;}',
    '.mk-chip__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  ].join('');
  document.head.appendChild(s);
})();

function Chip(props) {
  props = props || {};
  var label = props.label, avatarUrl = props.avatarUrl, avatarType = props.avatarType || 'squared',
    Icon = props.Icon, clickable = props.clickable, onClick = props.onClick,
    avatarColor = props.avatarColor;
  var cls = ['mk-chip'];
  if (clickable) cls.push('is-clickable');
  var TagName = clickable ? 'button' : 'span';
  return (
    <TagName className={cls.join(' ')} type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}>
      {avatarUrl || avatarColor
        ? <Avatar avatarUrl={avatarUrl} placeholder={label} size="sm" type={avatarType} color={avatarColor} />
        : (Icon ? <span className="mk-chip__icon"><Icon size={14} /></span> : null)}
      <span className="mk-chip__label">{label}</span>
    </TagName>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Chip: Chip });
