(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { preference = localStorage.getItem('spectater-theme') || 'system'; } catch { /* Theme controls remain available when storage is denied. */ }
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  const apply = () => {
    root.dataset.themePreference = preference;
    root.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
  };
  apply();
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const control = document.getElementById('theme');
    control.value = preference;
    control.addEventListener('change', () => {
      preference = control.value;
      apply();
      try { localStorage.setItem('spectater-theme', preference); } catch { /* The selection still lasts for this page. */ }
    });
  });
})();
