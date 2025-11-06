'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

class FakeEvent {
  constructor(type) {
    this.type = type;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }
    bucket.delete(listener);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== 'string') {
      throw new TypeError('El evento debe tener un tipo válido');
    }
    const bucket = this.listeners.get(event.type);
    if (!bucket) {
      return true;
    }
    event.target = this;
    event.currentTarget = this;
    for (const listener of [...bucket]) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this._children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.parentNode = null;
    this._textContent = '';
    this._value = '';
    this.options = [];
    this.selected = false;
    this.id = '';
  }

  appendChild(node) {
    node.parentNode = this;
    this._children.push(node);
    if (node.id) {
      this.ownerDocument._register(node);
    }
    if (this.tagName === 'SELECT') {
      this._syncOptions();
    }
    return node;
  }

  replaceChildren(...nodes) {
    this._children = [];
    for (const node of nodes) {
      this.appendChild(node);
    }
    if (this.tagName === 'SELECT' && nodes.length === 0) {
      this._syncOptions();
    }
  }

  _syncOptions() {
    if (this.tagName !== 'SELECT') {
      return;
    }
    this.options = this._children.filter((child) => child.tagName === 'OPTION');
    if (typeof this._value === 'string' && this._value !== '') {
      this.value = this._value;
      return;
    }
    const selected = this.options.find((option) => option.selected);
    if (selected) {
      this._value = selected.value;
    } else if (this.options.length > 0) {
      this._value = this.options[0].value;
      this.options[0].selected = true;
    } else {
      this._value = '';
    }
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === 'id') {
      this.id = stringValue;
      this.ownerDocument._register(this);
    }
    if (name === 'class') {
      this.className = stringValue;
    }
    if (name === 'hidden') {
      this.hidden = true;
    }
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') {
      this.className = '';
    }
    if (name === 'hidden') {
      this.hidden = false;
    }
  }

  set id(value) {
    this._id = String(value);
    if (this._id !== '') {
      this.ownerDocument._register(this);
    }
  }

  get id() {
    return this._id ?? '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this._children = [];
    if (this.tagName === 'SELECT') {
      this._syncOptions();
    }
  }

  get textContent() {
    if (this._children.length === 0) {
      return this._textContent ?? '';
    }
    return this._children.map((child) => child.textContent).join('');
  }

  set value(value) {
    this._value = String(value);
    if (this.tagName === 'SELECT') {
      for (const option of this.options) {
        option.selected = option.value === this._value;
      }
    }
  }

  get value() {
    if (this.tagName === 'SELECT') {
      const selected = this.options.find((option) => option.selected);
      return selected ? selected.value : this._value;
    }
    return this._value;
  }

  get children() {
    return this._children;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      return this.ownerDocument.getElementById(selector.slice(1));
    }
    const target = selector.toUpperCase();
    for (const child of this._children) {
      if (child.tagName === target) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('#')) {
      const match = this.ownerDocument.getElementById(selector.slice(1));
      return match ? [match] : [];
    }
    const target = selector.toUpperCase();
    for (const child of this._children) {
      if (child.tagName === target) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.body = new FakeElement('body', this);
    this._registry = new Map();
    this.readyState = 'complete';
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this._registry.get(id) ?? null;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  _register(element) {
    if (element.id) {
      this._registry.set(element.id, element);
    }
  }
}

function createFakeDom() {
  const document = new FakeDocument();
  document.readyState = 'loading';
  const container = document.createElement('div');
  container.id = 'launcher-logs-widget';
  document.body.appendChild(container);

  const window = {
    location: { origin: 'http://launcher.local' },
    Event: FakeEvent,
  };

  return { document, window, container };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('initLogsViewer renderiza y refresca los logs por nivel', async (t) => {
  const { document, window, container } = createFakeDom();

  global.window = window;
  global.document = document;

  t.after(() => {
    delete global.window;
    delete global.document;
  });

  const loaderUrl = pathToFileURL(path.join(__dirname, '..', 'widget-loader.js'));
  const loaderModule = await import(loaderUrl);
  loaderModule.default.mountWidget = () => {};
  window.dashboardWidgets = loaderModule.default;

  const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'sistemas-page.js'));
  const { initLogsViewer } = await import(moduleUrl);

  const fetchCalls = [];
  const payloads = [
    {
      levels: ['info', 'debug', 'error'],
      items: [
        {
          service: 'launcher',
          level: 'info',
          timestamp: '2024-07-01T10:00:00.000Z',
          message: 'Arranque completado',
        },
        {
          service: 'launcher',
          level: 'debug',
          timestamp: '2024-07-01T10:00:02.000Z',
          message: 'Detalle de depuración',
        },
      ],
    },
    {
      levels: ['info', 'debug', 'error'],
      items: [
        {
          service: 'launcher',
          level: 'debug',
          timestamp: '2024-07-01T10:05:00.000Z',
          message: 'Detalle de depuración',
        },
      ],
    },
  ];
  let fetchIndex = 0;

  async function fetchImpl(url) {
    fetchCalls.push(url);
    const payload = payloads[Math.min(fetchIndex, payloads.length - 1)];
    fetchIndex += 1;
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  }

  const scheduleLog = [];
  const scheduler = {
    setInterval(fn, ms) {
      scheduleLog.push({ type: 'set', ms, fn });
      return scheduleLog.length;
    },
    clearInterval(id) {
      scheduleLog.push({ type: 'clear', id });
    },
  };

  const viewer = initLogsViewer({
    documentRef: document,
    windowRef: window,
    fetchImpl,
    scheduler,
    pollIntervalMs: 2500,
    logsEndpoint: 'http://launcher.local/api/logs',
  });

  await flushMicrotasks();
  await flushMicrotasks();

  const select = container.querySelector('select');
  assert.ok(select, 'Se esperaba el selector de niveles');
  assert.deepEqual(
    select.options.map((option) => option.value),
    ['info', 'debug', 'error'],
  );
  assert.equal(select.value, 'info');

  const list = container.querySelector('ul');
  assert.ok(list, 'Se esperaba la lista de logs');
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[1].textContent, 'Arranque completado');

  assert.equal(scheduleLog[0].type, 'set');
  assert.equal(scheduleLog[0].ms, 2500);
  assert.ok(fetchCalls[0].startsWith('http://launcher.local/api/logs'));

  select.value = 'debug';
  select.dispatchEvent(new window.Event('change'));

  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[1].textContent, 'Detalle de depuración');
  assert.match(fetchCalls.at(-1), /level=debug/);

  viewer.destroy();
  assert.deepEqual(scheduleLog.at(-1), { type: 'clear', id: 1 });
});
