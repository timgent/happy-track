// crypto.randomUUID was added in Chrome 92. Older Android WebViews (e.g. on
// Android 11 devices that haven't updated their WebView) don't have it.
// The @uvdsl/solid-oidc-client-browser library calls it during login, so we
// need the polyfill in place before any auth code runs.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    const buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    // Set version 4 and variant bits per RFC 4122
    buf[6] = (buf[6] & 0x0f) | 0x40
    buf[8] = (buf[8] & 0x3f) | 0x80
    const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
  }
  ;(crypto as Crypto & { randomUUID: typeof randomUUID }).randomUUID = randomUUID
}
