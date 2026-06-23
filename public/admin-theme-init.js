(function () {
  try {
    const saved = localStorage.getItem('bi_tagme_admin_theme');
    document.documentElement.setAttribute('data-theme', saved === 'admin-light' ? 'admin-light' : 'admin');
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'admin');
  }
})();
