import { loadHeader } from './layout/header.js';
import { loadFooter } from './layout/footer.js';

async function loadDashboardLayout() {
  const headerTarget = document.querySelector('[data-dashboard-include="header"]');
  if (headerTarget) {
    try {
      await loadHeader(headerTarget);
    } catch (error) {
      console.error(error);
    }
  }

  const footerTarget = document.querySelector('[data-dashboard-include="footer"]');
  if (footerTarget) {
    try {
      await loadFooter(footerTarget);
    } catch (error) {
      console.error(error);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadDashboardLayout, { once: true });
} else {
  loadDashboardLayout();
}

export { loadDashboardLayout };
