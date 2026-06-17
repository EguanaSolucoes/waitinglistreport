(function () {
  try {
    if (localStorage.getItem('bi_tagme_theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (_) { /* ignore */ }
})();
