/* MOS Design Kit — IconButton (reuses the mk-btn base sheet) */
function IconButton(props) {
  props = props || {};
  var Icon = props.Icon,
    variant = props.variant || 'secondary',
    accent = props.accent || 'default',
    size = props.size || 'medium',
    disabled = props.disabled,
    ariaLabel = props.ariaLabel,
    onClick = props.onClick;
  var iconSize = size === 'small' ? 14 : 16;
  var cls = ['mk-btn', 'mk-iconbtn', 'mk-btn--' + variant, 'mk-accent--' + accent, 'mk-btn--' + size];
  return (
    <button type="button" className={cls.join(' ')} disabled={disabled || false}
      onClick={onClick} aria-label={ariaLabel} title={ariaLabel}>
      {Icon ? <Icon size={iconSize} /> : null}
    </button>
  );
}

(function () {
  var ID = 'mosdk-iconbtn';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-iconbtn{width:32px;padding:0;}',
    '.mk-iconbtn.mk-btn--small{width:24px;}',
  ].join('');
  document.head.appendChild(s);
})();

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { IconButton: IconButton });
