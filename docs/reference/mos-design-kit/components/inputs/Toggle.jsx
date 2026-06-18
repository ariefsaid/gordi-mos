/* MOS Design Kit — Toggle (switch) */
(function () {
  var ID = 'mosdk-toggle';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-toggle{display:inline-flex;align-items:center;padding:2px;box-sizing:border-box;',
    'background:var(--ds-background-quaternary);border-radius:var(--ds-border-radius-pill);',
    'cursor:pointer;vertical-align:middle;flex:none;transition:background .15s ease;}',
    '.mk-toggle.is-on{background:var(--ds-color-blue);}',
    '.mk-toggle.is-disabled{opacity:.5;cursor:not-allowed;}',
    '.mk-toggle__knob{background:var(--ds-background-primary);border-radius:50%;',
    'transition:transform .15s ease;transform:translateX(0);}',
    '.mk-toggle.is-on .mk-toggle__knob{transform:translateX(var(--mk-travel, 12px));}',
    '.mk-toggle:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ds-accent-tertiary);}',
  ].join('');
  document.head.appendChild(s);
})();

function Toggle(props) {
  props = props || {};
  var value = props.value || false,
    disabled = props.disabled || false,
    size = props.size || 'medium',
    onChange = props.onChange;
  var small = size === 'small';
  var w = small ? 22 : 28;
  var h = small ? 14 : 16;
  var knob = h - 4;
  var travel = w - h; /* knob travel = track - height */
  var cls = ['mk-toggle'];
  if (value) cls.push('is-on');
  if (disabled) cls.push('is-disabled');
  var toggle = function () { if (!disabled && onChange) onChange(!value); };
  return (
    <span role="switch" aria-checked={value ? 'true' : 'false'}
      tabIndex={disabled ? -1 : 0} className={cls.join(' ')}
      style={{ width: w, height: h, ['--mk-travel']: travel + 'px' }}
      onClick={toggle}
      onKeyDown={function (e) {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      }}>
      <span className="mk-toggle__knob" style={{ width: knob, height: knob }} />
    </span>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Toggle: Toggle });
