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
// 3) A link into a saved older version of the site (網站版本), /v/<id>/players, that the host answered with the live
//    site's page: hand it to that version's own page, which restores the path the way 2) does.
;(function (l, s) {
  var base = s && s.src ? new URL(s.src).pathname.replace(/boot\.js$/, '') : '/'
  if (/\/v\/[^/]+\/$/.test(base) || l.pathname.indexOf(base) !== 0) return // this already is a saved copy
  var m = l.pathname.slice(base.length).match(/^v\/([^/]+)\/(.+)$/)
  if (!m) return
  l.replace(base + 'v/' + m[1] + '/?/' + m[2].replace(/&/g, '~and~') + (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') + l.hash)
})(window.location, document.currentScript)
