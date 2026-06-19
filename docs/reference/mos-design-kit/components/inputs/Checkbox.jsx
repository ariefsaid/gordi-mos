/* MOS Design Kit — Checkbox (inline SVG glyphs, no icon dependency) */
(function () {
  var ID = 'mosdk-checkbox';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-checkbox{display:inline-flex;align-items:center;justify-content:center;',
    'border:1px solid var(--ds-border-color-medium);border-radius:var(--ds-border-radius-xs);',
    'background:var(--ds-background-primary);cursor:pointer;vertical-align:middle;',
    'box-sizing:border-box;flex:none;transition:background .12s ease, border-color .12s ease;}',
    '.mk-checkbox svg{width:100%;height:100%;display:block;}',
    '.mk-checkbox.is-checked,.mk-checkbox.is-indeterminate{background:var(--ds-color-blue);border-color:var(--ds-color-blue);}',
    '.mk-checkbox.is-disabled{opacity:.5;cursor:not-allowed;}',
    '.mk-checkbox:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ds-accent-tertiary);}',
  ].join('');
  document.head.appendChild(s);
})();

function Checkbox(props) {
  props = props || {};
  var checked = props.checked || false,
    indeterminate = props.indeterminate || false,
    disabled = props.disabled || false,
    size = props.size || 'medium',
    onChange = props.onChange;
  var dim = size === 'small' ? 14 : 16;
  var cls = ['mk-checkbox'];
  if (indeterminate) cls.push('is-indeterminate');
  else if (checked) cls.push('is-checked');
  if (disabled) cls.push('is-disabled');
  var toggle = function () {
    if (disabled) return;
    if (onChange) onChange(indeterminate ? false : !checked);
  };
  return (
    <span role="checkbox" aria-checked={indeterminate ? 'mixed' : (checked ? 'true' : 'false')}
      tabIndex={disabled ? -1 : 0} className={cls.join(' ')}
      style={{ width: dim, height: dim }}
      onClick={toggle}
      onKeyDown={function (e) {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      }}>
      {indeterminate
        ? <svg viewBox="0 0 16 16" aria-hidden="true"><line x1="3.5" y1="8" x2="12.5" y2="8" stroke="var(--ds-font-color-inverted)" strokeWidth="2" strokeLinecap="round" /></svg>
        : (checked
          ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.3l3 3 6-6" fill="none" stroke="var(--ds-font-color-inverted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : null)}
    </span>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Checkbox: Checkbox });
