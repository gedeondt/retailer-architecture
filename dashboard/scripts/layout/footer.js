import { injectPartial } from './partial-loader.js';

function applyFooterState(footerElement) {
  if (!footerElement) {
    return;
  }

  const { dashboardFooter } = document.body.dataset;
  const textElement = footerElement.querySelector('[data-dashboard-footer-text]');
  if (textElement && dashboardFooter) {
    textElement.textContent = dashboardFooter;
  }
}

async function loadFooter(target) {
  if (!target) {
    return null;
  }

  const footerElement = await injectPartial(target, 'footer.html');
  applyFooterState(footerElement);
  return footerElement;
}

export { applyFooterState, loadFooter };
