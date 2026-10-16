// The one Gordi logo mark (top bar and sign-in): ink square, primary-ink "G" (white/charcoal in
// light, warm brown on ivory in dark), accent dot. Wordmark beside it uses ink.
export function GordiLogoMark() {
  return (
    <div className="logo-mark">
      <div className="logo-mark__g">G</div>
      <span className="logo-mark__dot" aria-hidden="true" />
    </div>
  )
}
