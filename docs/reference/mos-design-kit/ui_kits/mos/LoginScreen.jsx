/* MOS Design Kit UI — LoginScreen. Any click calls onSignIn. */
(function () {
  var ID = 'mosdk-login';
  if (document.getElementById(ID)) return;
  var s = document.createElement('style');
  s.id = ID;
  s.textContent = [
    '.mk-login{height:100%;display:flex;align-items:center;justify-content:center;',
    'background:var(--ds-background-secondary);font-family:var(--ds-font-family);padding:24px;}',
    '.mk-login__card{width:360px;background:var(--ds-background-primary);',
    'border:1px solid var(--ds-border-color-light);border-radius:var(--ds-border-radius-md);',
    'box-shadow:var(--ds-box-shadow-strong);padding:32px;display:flex;flex-direction:column;gap:14px;}',
    '.mk-login__brand{font-family:var(--ds-font-display);font-size:var(--ds-font-size-xl);font-weight:700;',
    'color:var(--ds-font-color-primary);letter-spacing:-0.01em;}',
    '.mk-login__sub{font-size:var(--ds-font-size-sm);color:var(--ds-font-color-tertiary);margin-top:-8px;}',
    '.mk-login__divider{display:flex;align-items:center;gap:10px;color:var(--ds-font-color-light);',
    'font-size:var(--ds-font-size-xs);}',
    '.mk-login__divider::before,.mk-login__divider::after{content:"";height:1px;background:var(--ds-border-color-light);flex:1;}',
    '.mk-login__foot{font-size:var(--ds-font-size-xs);color:var(--ds-font-color-light);text-align:center;margin-top:4px;}',
  ].join('');
  document.head.appendChild(s);
})();

function LoginScreen(props) {
  props = props || {};
  var onSignIn = props.onSignIn;
  var { Button, TextInput } = window.MosDesignKit;
  var { mkIcon } = window;
  var fire = function () { onSignIn && onSignIn(); };
  return (
    <div className="mk-login">
      <div className="mk-login__card" onClick={fire}>
        <div className="mk-login__brand">Acme Inc</div>
        <div className="mk-login__sub">Sign in to your workspace</div>
        <Button variant="secondary" fullWidth justify="center" Icon={mkIcon('brand-google')}>Continue with Google</Button>
        <Button variant="secondary" fullWidth justify="center" Icon={mkIcon('brand-microsoft')}>Continue with Microsoft</Button>
        <div className="mk-login__divider"><span>or</span></div>
        <TextInput placeholder="name@acme.example" type="email" fullWidth />
        <Button variant="primary" accent="blue" fullWidth>Continue</Button>
        <div className="mk-login__foot">By continuing you agree to Acme's Terms &amp; Privacy Policy.</div>
      </div>
    </div>
  );
}

window.MosDesignKit = Object.assign(window.MosDesignKit || {}, { LoginScreen: LoginScreen });
