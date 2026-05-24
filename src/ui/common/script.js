// Shared UI loader
export function loadPage(page) {
  const placeholder = document.getElementById('app');
  if (!placeholder) return console.error('No #app element');
  fetch(`/ui/${page}/index.html`)
    .then(r => r.text())
    .then(html => { placeholder.innerHTML = html; })
    .catch(err => console.error('Failed to load page', err));
}

// Initialize default page on load
window.addEventListener('DOMContentLoaded', () => {
  const hash = location.hash.replace('#', '') || 'sales';
  loadPage(hash);
});