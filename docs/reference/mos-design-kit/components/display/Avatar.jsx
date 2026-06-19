/* MOS Design Kit — Avatar
   When no avatarUrl, paints a deterministic pastel (color-3 bg / color-11 text)
   seeded from the placeholder name. */
(function () {
  var ID = 'mosdk-avatar';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-avatar{display:inline-flex;align-items:center;justify-content:center;overflow:hidden;',
    'flex:none;font-family:var(--ds-font-family);font-weight:var(--ds-font-weight-medium);',
    'line-height:1;user-select:none;}',
    '.mk-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
  ].join('');
  document.head.appendChild(s);
})();

var MK_AVATAR_PALETTE = [
  'blue', 'iris', 'violet', 'purple', 'plum', 'pink', 'red', 'tomato', 'orange',
  'amber', 'grass', 'green', 'jade', 'turquoise', 'cyan', 'sky', 'bronze', 'gold',
  'mauve', 'slate', 'sage', 'olive', 'sand', 'gray',
];
var MK_AVATAR_SIZES = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 };

function mkHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function Avatar(props) {
  props = props || {};
  var avatarUrl = props.avatarUrl, placeholder = props.placeholder,
    size = props.size || 'md', type = props.type || 'squared',
    color = props.color, backgroundColor = props.backgroundColor, Icon = props.Icon;
  var dim = MK_AVATAR_SIZES[size] || 24;
  var radius = type === 'rounded' ? '50%' : 'var(--ds-border-radius-sm)';
  var base = {
    width: dim, height: dim, borderRadius: radius,
    fontSize: dim >= 32 ? 'var(--ds-font-size-sm)' : 'var(--ds-font-size-xs)',
  };
  if (avatarUrl) {
    return (
      <span className="mk-avatar" style={base}>
        <img src={avatarUrl} alt="" />
      </span>
    );
  }
  var fam = color || MK_AVATAR_PALETTE[mkHash(placeholder || '?') % MK_AVATAR_PALETTE.length];
  var bg = backgroundColor || ('var(--ds-color-' + fam + '3)');
  var fg = color ? 'var(--ds-font-color-inverted)' : ('var(--ds-color-' + fam + '11)');
  var letter = ((placeholder || '?').trim().charAt(0) || '?').toUpperCase();
  if (Icon) {
    return (
      <span className="mk-avatar" style={Object.assign({}, base, { background: bg, color: fg })}>
        <Icon size={Math.round(dim * 0.55)} />
      </span>
    );
  }
  return (
    <span className="mk-avatar" style={Object.assign({}, base, { background: bg, color: fg })}>
      {letter}
    </span>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Avatar: Avatar });
