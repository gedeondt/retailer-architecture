const PARTIALS_BASE_PATH = '/dashboard/partials';

async function fetchPartial(relativePath) {
  const response = await fetch(`${PARTIALS_BASE_PATH}/${relativePath}`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${relativePath} (${response.status})`);
  }
  return response.text();
}

function createFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

async function injectPartial(target, relativePath) {
  const html = await fetchPartial(relativePath);
  const fragment = createFragment(html);
  const firstElement = fragment.firstElementChild || null;
  target.replaceWith(fragment);
  return firstElement;
}

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

async function loadDashboardLayout() {
  const headerTarget = document.querySelector('[data-dashboard-include="header"]');
  if (headerTarget) {
    try {
      const headerElement = await injectPartial(headerTarget, 'header.html');
      applyHeaderState(headerElement);
    } catch (error) {
      console.error(error);
    }
  }

  const footerTarget = document.querySelector('[data-dashboard-include="footer"]');
  if (footerTarget) {
    try {
      const footerElement = await injectPartial(footerTarget, 'footer.html');
      applyFooterState(footerElement);
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
