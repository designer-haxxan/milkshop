// Login link helper: https://<app>/#u=<username>&p=<password> fills the two login boxes (it never submits them).
// Classic script, loaded before the app's module so it runs before the router reads location.hash.
// The credentials stay in memory only: they are removed from the address bar at once and are never stored,
// logged or sent anywhere.
(function () {
  var params = new URLSearchParams(location.hash.replace(/^#/, ''));
  var u = params.get('u');
  var p = params.get('p');
  if (u === null || p === null) return;
  history.replaceState(null, '', location.pathname + location.search);
  var tries = 0;
  (function fill() {
    var login = document.getElementById('view-login');
    var user = document.getElementById('login-username');
    var pass = document.getElementById('login-password');
    // The inputs exist in the page from the start; only fill once the login screen is really shown
    // (if the user is already signed in it never is, and nothing happens).
    if (!login || login.classList.contains('d-none') || !user || !pass) {
      if (++tries < 100) setTimeout(fill, 100); else u = p = null;
      return;
    }
    user.value = u; pass.value = p;
    user.dispatchEvent(new Event('input', { bubbles: true }));
    pass.dispatchEvent(new Event('input', { bubbles: true }));
    u = p = null;
    var hint = document.getElementById('login-autofill');
    if (hint) hint.classList.remove('d-none');
    var btn = document.getElementById('login-btn');
    if (btn) btn.classList.add('pulse-hint');
  })();
})();
