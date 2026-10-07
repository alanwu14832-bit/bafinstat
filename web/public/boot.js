// Runs before the app (a separate file so the Content-Security-Policy can forbid inline scripts).
// 1) Apply the persisted theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('bafin.theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch (e) {}
// 2) Restore a deep link handed over by 404.html (see public/404.html).
(function (l) {
  if (l.search[1] === '/') {
    var decoded = l.search.slice(1).split('&').map(function (s) { return s.replace(/~and~/g, '&') }).join('?')
    window.history.replaceState(null, null, l.pathname.slice(0, -1) + decoded + l.hash)
  }
})(window.location)
