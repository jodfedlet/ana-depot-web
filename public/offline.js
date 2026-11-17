(function () {
  var m = /^\/(fr|ht)(\/|$)/.exec(location.pathname);
  var l = m ? m[1] : /^ht\b/i.test(navigator.language || "") ? "ht" : "fr";
  document.body.setAttribute("data-l", l);
  document.documentElement.lang = l;
  var buttons = document.querySelectorAll("[data-retry]");
  for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener("click", function () { location.reload(); });
  // Connection back: try the page again, but never in a loop (at most once every 10 seconds, and only when the browser really reports being online).
  window.addEventListener("online", function () {
    if (!navigator.onLine) return;
    try {
      var last = Number(sessionStorage.getItem("ana.offline.reload") || 0);
      if (Date.now() - last < 10000) return;
      sessionStorage.setItem("ana.offline.reload", String(Date.now()));
    } catch (_) { /* storage blocked: reload once anyway */ }
    location.reload();
  });
})();
