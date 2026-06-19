/* MOS Design Kit — TextInput */
(function () {
  var ID = 'mosdk-textinput';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-textinput{display:inline-flex;flex-direction:column;gap:4px;font-family:var(--ds-font-family);}',
    '.mk-textinput--full{width:100%;}',
    '.mk-textinput__label{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-tertiary);}',
    '.mk-textinput__box{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 8px;',
    'background:var(--ds-background-primary);border:1px solid var(--ds-border-color-medium);',
    'border-radius:var(--ds-border-radius-sm);box-sizing:border-box;',
    'transition:border-color .12s ease, box-shadow .12s ease;}',
    '.mk-textinput__box--full{width:100%;}',
    '.mk-textinput__icon{display:inline-flex;color:var(--ds-font-color-light);flex:none;}',
    '.mk-textinput__field{flex:1 1 auto;border:none;outline:none;background:transparent;',
    'font-family:var(--ds-font-family);font-size:var(--ds-font-size-sm);color:var(--ds-font-color-primary);min-width:0;}',
    '.mk-textinput__field::placeholder{color:var(--ds-font-color-light);}',
    '.mk-textinput__box:focus-within{border-color:var(--ds-color-blue);box-shadow:0 0 0 3px var(--ds-accent-tertiary);}',
    '.mk-textinput__box.is-error{border-color:var(--ds-border-color-danger);}',
    '.mk-textinput__box.is-error:focus-within{box-shadow:0 0 0 3px var(--ds-background-transparent-danger);}',
    '.mk-textinput__box.is-disabled{background:var(--ds-background-secondary);}',
    '.mk-textinput__box.is-disabled .mk-textinput__field{color:var(--ds-font-color-light);cursor:not-allowed;}',
  ].join('');
  document.head.appendChild(s);
})();

var _mkTiSeq = 0;
function TextInput(props) {
  props = props || {};
  var label = props.label, value = props.value, defaultValue = props.defaultValue,
    placeholder = props.placeholder, Icon = props.Icon, type = props.type || 'text',
    disabled = props.disabled, error = props.error, fullWidth = props.fullWidth,
    onChange = props.onChange, name = props.name;
  _mkTiSeq += 1;
  var id = 'mk-ti-' + _mkTiSeq;
  var boxCls = ['mk-textinput__box'];
  if (fullWidth) boxCls.push('mk-textinput__box--full');
  if (error) boxCls.push('is-error');
  if (disabled) boxCls.push('is-disabled');
  var wrapCls = ['mk-textinput'];
  if (fullWidth) wrapCls.push('mk-textinput--full');
  return (
    <div className={wrapCls.join(' ')}>
      {label ? <label className="mk-textinput__label" htmlFor={id}>{label}</label> : null}
      <div className={boxCls.join(' ')}>
        {Icon ? <span className="mk-textinput__icon"><Icon size={16} /></span> : null}
        <input id={id} name={name} type={type} value={value} defaultValue={defaultValue}
          placeholder={placeholder} disabled={disabled || false} onChange={onChange}
          className="mk-textinput__field" />
      </div>
    </div>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { TextInput: TextInput });
