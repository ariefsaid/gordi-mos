/* MOS Design Kit — Button
   Self-contained primitive. Injects its own (idempotent) <style>, registers on
   window.MosDesignKit. Styled exclusively via --ds-* tokens. No hardcoded colors. */
(function () {
  var ID = 'mosdk-button';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;',
    'gap:6px;box-sizing:border-box;border:1px solid transparent;',
    'border-radius:var(--ds-border-radius-sm);font-family:var(--ds-font-family);',
    'font-size:var(--ds-font-size-sm);font-weight:var(--ds-font-weight-medium);line-height:1;',
    'white-space:nowrap;cursor:pointer;user-select:none;transition:box-shadow .12s ease;}',
    '.mk-btn--medium{height:32px;padding:0 12px;}',
    '.mk-btn--small{height:24px;padding:0 8px;font-size:var(--ds-font-size-xs);gap:4px;}',
    '.mk-btn--full{width:100%;}',
    '.mk-btn__icon{display:inline-flex;flex:none;}',
    /* primary fills */
    '.mk-btn--primary{background:var(--ds-background-inverted-primary);color:var(--ds-font-color-inverted);}',
    '.mk-btn--primary.mk-accent--blue{background:var(--ds-color-blue);color:var(--ds-font-color-inverted);}',
    '.mk-btn--primary.mk-accent--danger{background:var(--ds-color-red);color:var(--ds-font-color-inverted);}',
    /* secondary */
    '.mk-btn--secondary{background:var(--ds-background-primary);border-color:var(--ds-border-color-medium);color:var(--ds-font-color-primary);}',
    '.mk-btn--secondary.mk-accent--blue{color:var(--ds-color-blue);}',
    '.mk-btn--secondary.mk-accent--danger{color:var(--ds-color-red);}',
    /* tertiary */
    '.mk-btn--tertiary{background:transparent;color:var(--ds-font-color-primary);}',
    '.mk-btn--tertiary.mk-accent--blue{color:var(--ds-color-blue);}',
    '.mk-btn--tertiary.mk-accent--danger{color:var(--ds-color-red);}',
    /* hover overlay (token flips per theme, so darkens in light / lifts in dark) */
    '.mk-btn::after{content:"";position:absolute;inset:0;border-radius:inherit;',
    'background:var(--ds-background-transparent-medium);opacity:0;transition:opacity .12s ease;pointer-events:none;}',
    '.mk-btn:not(:disabled):hover::after{opacity:1;}',
    '.mk-btn--tertiary:not(:disabled):hover{background:var(--ds-background-transparent-light);}',
    '.mk-btn--tertiary:not(:disabled):hover::after{opacity:0;}',
    '.mk-btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ds-accent-tertiary);}',
    '.mk-btn:disabled{opacity:.5;cursor:not-allowed;}',
  ].join('');
  document.head.appendChild(s);
})();

function Button(props) {
  props = props || {};
  var title = props.title,
    children = props.children,
    Icon = props.Icon,
    variant = props.variant || 'primary',
    accent = props.accent || 'default',
    size = props.size || 'medium',
    fullWidth = props.fullWidth,
    disabled = props.disabled,
    justify = props.justify || 'center',
    type = props.type || 'button',
    onClick = props.onClick;
  var iconSize = size === 'small' ? 14 : 16;
  var cls = ['mk-btn', 'mk-btn--' + variant, 'mk-accent--' + accent, 'mk-btn--' + size];
  if (fullWidth) cls.push('mk-btn--full');
  return (
    <button type={type} className={cls.join(' ')} disabled={disabled || false}
      onClick={onClick} style={{ justifyContent: justify }}>
      {Icon ? <span className="mk-btn__icon"><Icon size={iconSize} /></span> : null}
      {title || children ? <span>{title || children}</span> : null}
    </button>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { Button: Button });
