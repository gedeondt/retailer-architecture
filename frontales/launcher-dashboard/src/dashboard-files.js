'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const DASHBOARD_DIR = path.join(ROOT_DIR, 'dashboard');

const PAGE_MAP = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/dominios', 'index.html'],
  ['/dominios.html', 'index.html'],
  ['/sistemas', 'sistemas.html'],
  ['/sistemas.html', 'sistemas.html'],
]);

const pageCache = new Map();

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getDashboardDir() {
  return DASHBOARD_DIR;
}

function resolveDashboardPage(pathname) {
  const normalized = normalizePathname(pathname);
  return PAGE_MAP.get(normalized) || null;
}

function readDashboardPage(filename) {
  const cached = pageCache.get(filename);
  if (cached) {
    return cached;
  }

  const filePath = path.join(DASHBOARD_DIR, filename);
  const html = fs.readFileSync(filePath, 'utf8');
  pageCache.set(filename, html);
  return html;
}

function createDashboardHTML() {
  return readDashboardPage('index.html');
}

module.exports = {
  getDashboardDir,
  resolveDashboardPage,
  readDashboardPage,
  createDashboardHTML,
};
