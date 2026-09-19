/**
 * Minimal DOM + MutationObserver shim, sufficient to exercise client.js.
 *
 * The important fidelity details, because the bug being guarded against is a
 * microtask starvation loop:
 *   - Observer callbacks are delivered as microtasks, exactly like a browser.
 *   - Assigning element.textContent always replaces the child text node, so it
 *     queues a childList record even when the string is identical.
 *   - Only structural changes record mutations. `hidden` and style writes are
 *     attribute changes, and the plugin only observes childList.
 * A runaway loop is reported instead of hanging the test process.
 */

export const MAX_DELIVERIES = 50;

const ATTR_EQ = /^\[([A-Za-z0-9_-]+)="([^"]*)"\]$/;
const ATTR_PRESENT = /^\[([A-Za-z0-9_-]+)\]$/;

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

class FakeStyle {
  constructor() {
    this._props = new Map();
  }
  set cssText(value) {
    this._props.clear();
    for (const part of String(value).split(';')) {
      const i = part.indexOf(':');
      if (i > 0) this._props.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }
  get cssText() {
    return [...this._props].map(([k, v]) => `${k}:${v}`).join(';');
  }
  setProperty(name, value) {
    this._props.set(name, String(value));
  }
  getPropertyValue(name) {
    return this._props.get(name) ?? '';
  }
  get display() {
    return this._props.get('display') ?? '';
  }
  set display(value) {
    this._props.set('display', String(value));
  }
}

class FakeText {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.parentNode = null;
  }
  get textContent() {
    return this.data;
  }
  set textContent(value) {
    this.data = String(value);
  }
}

export function installDom() {
  const state = {
    runaway: false,
    deliveries: 0,
    maxDeliveries: MAX_DELIVERIES,
    deliveryLog: [],
    warnings: [],
  };

  const observers = new Set();

  const isDescendant = (node, ancestor) => {
    let n = node?.parentNode;
    while (n) {
      if (n === ancestor) return true;
      n = n.parentNode;
    }
    return false;
  };

  const schedule = (observer) => {
    if (observer._scheduled || observer._targets.length === 0) return;
    observer._scheduled = true;
    queueMicrotask(() => {
      observer._scheduled = false;
      if (observer._targets.length === 0) return;
      const records = observer.takeRecords();
      if (records.length === 0) return;
      state.deliveries += 1;
      state.deliveryLog.push(
        observer._targets.map((t) => {
          const el = t.target;
          const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
          return role ?? el.tagName ?? 'text';
        }),
      );
      if (state.deliveries > state.maxDeliveries) {
        // A real browser never gets here: it would be frozen. Stop delivering
        // so the test can report the loop instead of hanging.
        state.runaway = true;
        return;
      }
      observer._cb(records, observer);
    });
  };

  const record = (target) => {
    for (const observer of observers) {
      const hit = observer._targets.some(
        (t) => t.target === target || (t.options.subtree && isDescendant(target, t.target)),
      );
      if (hit) {
        observer._records.push({ type: 'childList', target });
        schedule(observer);
      }
    }
  };

  class FakeElement {
    constructor(tagName) {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.style = new FakeStyle();
      this.disabled = false;
      this.value = '';
      this.focused = 0;
      this._listeners = new Map();
      this._isDocumentRoot = false;
      const self = this;
      this.dataset = new Proxy(
        {},
        {
          set(_t, prop, value) {
            if (typeof prop !== 'string') return true;
            self.attributes.set(`data-${camelToKebab(prop)}`, String(value));
            return true;
          },
          get(_t, prop) {
            if (typeof prop !== 'string') return undefined;
            return self.attributes.get(`data-${camelToKebab(prop)}`);
          },
        },
      );
    }

    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
    get isConnected() {
      let n = this;
      while (n) {
        if (n._isDocumentRoot) return true;
        n = n.parentNode;
      }
      return false;
    }
    get textContent() {
      return this.childNodes.map((n) => n.textContent).join('');
    }
    set textContent(value) {
      for (const n of this.childNodes) n.parentNode = null;
      this.childNodes = [];
      const text = new FakeText(value);
      text.parentNode = this;
      this.childNodes.push(text);
      record(this);
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }

    appendChild(node) {
      return this.insertBefore(node, null);
    }
    insertBefore(node, ref) {
      if (node.parentNode) node.parentNode._removeChild(node);
      const index = ref === null ? this.childNodes.length : this.childNodes.indexOf(ref);
      if (index === -1) throw new Error('insertBefore: reference node is not a child');
      this.childNodes.splice(index, 0, node);
      node.parentNode = this;
      record(this);
      return node;
    }
    _removeChild(node) {
      const index = this.childNodes.indexOf(node);
      if (index !== -1) {
        this.childNodes.splice(index, 1);
        node.parentNode = null;
      }
    }
    remove() {
      if (this.parentNode) {
        const parent = this.parentNode;
        parent._removeChild(this);
        record(parent);
      }
    }

    addEventListener(type, handler) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(handler);
    }
    dispatch(type) {
      for (const handler of this._listeners.get(type) ?? []) handler({ type, target: this });
    }

    focus() {
      this.focused += 1;
    }

    matches(selector) {
      const eq = ATTR_EQ.exec(selector);
      if (eq) return this.getAttribute(eq[1]) === eq[2];
      const present = ATTR_PRESENT.exec(selector);
      if (present) return this.hasAttribute(present[1]);
      throw new Error(`fake-dom: unsupported selector ${selector}`);
    }
    closest(selector) {
      let n = this;
      while (n) {
        if (n.nodeType === 1 && n.matches(selector)) return n;
        n = n.parentNode;
      }
      return null;
    }

    _descendants(out = []) {
      for (const n of this.childNodes) {
        if (n.nodeType === 1) {
          out.push(n);
          n._descendants(out);
        }
      }
      return out;
    }
    querySelectorAll(selector) {
      return this._descendants().filter((el) => el.matches(selector));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
  }

  class FakeMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._records = [];
      this._targets = [];
      this._scheduled = false;
      observers.add(this);
    }
    observe(target, options = {}) {
      this._targets.push({ target, options });
    }
    disconnect() {
      this._targets = [];
      this._records = [];
      observers.delete(this);
    }
    takeRecords() {
      const records = this._records;
      this._records = [];
      return records;
    }
  }

  const body = new FakeElement('body');
  body._isDocumentRoot = true;

  const document = {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => body._descendants().find((el) => el.getAttribute('id') === id) ?? null,
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    querySelector: (selector) => body.querySelector(selector),
  };

  const store = new Map();
  const sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  const originalWarn = console.warn;
  console.warn = (...args) => {
    state.warnings.push(args.map(String).join(' '));
  };

  const previous = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    sessionStorage: globalThis.sessionStorage,
  };
  globalThis.document = document;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.sessionStorage = sessionStorage;

  return {
    state,
    document,
    body,
    MutationObserver: FakeMutationObserver,
    /** Build a provider-grouped model menu and return its parts. */
    buildMenu() {
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      body.appendChild(menu);

      const makeGroup = (id, label, modelNames) => {
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', id);
        const heading = document.createElement('div');
        heading.setAttribute('id', id);
        heading.textContent = label;
        group.appendChild(heading);
        const rows = modelNames.map((name) => {
          const row = document.createElement('div');
          row.setAttribute('role', 'menuitemradio');
          row.textContent = name;
          group.appendChild(row);
          return row;
        });
        menu.appendChild(group);
        return { group, heading, rows };
      };

      const a = makeGroup('h-a', 'Provider A', ['DeepSeek-V3', 'Qwen1.5-7B']);
      const b = makeGroup('h-b', 'Provider B', ['GPT-4o', 'Claude Sonnet']);
      return { menu, groups: [a, b] };
    },
    cleanup() {
      console.warn = originalWarn;
      globalThis.document = previous.document;
      globalThis.MutationObserver = previous.MutationObserver;
      globalThis.sessionStorage = previous.sessionStorage;
      observers.clear();
    },
  };
}
