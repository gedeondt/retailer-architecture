import { injectPartial } from './partial-loader.js';

function applyHeaderState(headerElement) {
  if (!headerElement) {
    return;
  }

  const { dashboardTitle, dashboardSection } = document.body.dataset;
  const titleElement = headerElement.querySelector('[data-dashboard-header-title]');
  if (titleElement) {
    const fallbackTitle = document.title || '';
    titleElement.textContent = dashboardTitle || fallbackTitle;
  }

  if (dashboardSection) {
    const navLink = headerElement.querySelector(`[data-dashboard-nav="${dashboardSection}"]`);
    if (navLink) {
      navLink.setAttribute('aria-current', 'page');
      navLink.classList.add('text-amber-300');
    }
  }
}

async function loadHeader(target) {
  if (!target) {
    return null;
  }

  const headerElement = await injectPartial(target, 'header.html');
  applyHeaderState(headerElement);
  return headerElement;
}

export { applyHeaderState, loadHeader };
