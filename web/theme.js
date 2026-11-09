(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { preference = localStorage.getItem('spectater-theme') || 'system'; } catch { /* Theme controls remain available when storage is denied. */ }
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  const apply = () => {
    root.dataset.themePreference = preference;
    root.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    const control = document.getElementById('theme');
    if (control) {
      control.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
      control.title = `Switch to ${root.dataset.theme === 'dark' ? 'light' : 'dark'} mode${preference === 'system' ? ' (currently follows system)' : ''}`;
      document.getElementById('theme-system').hidden = preference === 'system';
    }
  };
  apply();
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const control = document.getElementById('theme');
    apply();
    control.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem('spectater-theme', preference); } catch { /* The selection still lasts for this page. */ }
    });
    document.getElementById('theme-system').addEventListener('click', () => {
      preference = 'system'; apply();
      try { localStorage.removeItem('spectater-theme'); } catch { /* System mode still works for this page. */ }
    });
  });
})();
