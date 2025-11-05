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

export { PARTIALS_BASE_PATH, fetchPartial, createFragment, injectPartial };
