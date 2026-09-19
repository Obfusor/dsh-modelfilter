/**
 * Behaviour tests for the model filter, driven through a fake DOM.
 *
 * These exist because the reported bug ("typing 1 freezes the browser, nothing
 * in the console") is a microtask starvation loop, which unit tests over
 * normalize() can never catch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installDom } from './fake-dom.mjs';

const SETTLE_MS = 250;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Evaluate a client bundle from source. A unique trailing comment gives every
 * call a distinct data: URL, so module state does not leak between tests.
 */
async function loadSource(source) {
  let registration = null;
  globalThis.window = {
    __ModuleLoader__: {
      load(reg) {
        registration = reg;
      },
    },
  };
  const unique = `${Date.now()}-${Math.random()}`;
  const encoded = Buffer.from(`${source}\n// ${unique}\n`, 'utf8').toString('base64');
  await import(`data:text/javascript;base64,${encoded}`);
  assert.ok(registration, 'client.js must register itself with window.__ModuleLoader__');
  assert.equal(registration.id, 'dsh-model-filter', 'registration id must match package.json name');
  return registration.factory();
}

async function readClientSource() {
  return readFile(new URL('../client.js', import.meta.url), 'utf8');
}

async function loadClient() {
  return loadSource(await readClientSource());
}

function visibleRows(groups) {
  return groups.flatMap((g) => g.rows).filter((row) => row.hidden === false);
}

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

async function type(input, text) {
  input.value = text;
  input.dispatch('input');
  await delay(SETTLE_MS);
}

test('harness detects a self-triggering observer (control)', async () => {
  const dom = installDom();
  try {
    const { document, body, state } = dom;
    const target = document.createElement('div');
    body.appendChild(target);
    const live = document.createElement('div');
    target.appendChild(live);

    let calls = 0;
    const observer = new dom.MutationObserver(() => {
      calls += 1;
      // Exactly the plugin's old behaviour: rewriting textContent with an
      // unchanged string still replaces the text node, queueing a mutation.
      live.textContent = 'unchanged';
    });
    observer.observe(target, { childList: true, subtree: true });

    live.textContent = 'unchanged';
    await delay(100);

    assert.equal(state.runaway, true, 'a self-triggering observer must be flagged, not hang');
    assert.ok(calls > 0, 'the observer must actually have been invoked');
  } finally {
    dom.cleanup();
  }
});

test('typing a single character does not starve the microtask queue', async () => {
  const dom = installDom();
  try {
    const { state } = dom;
    const { menu, groups } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();

    const input = menu.querySelector('[data-dsh-model-filter-input]');
    assert.ok(input, 'filter input must be injected into the menu');

    const deliveriesBeforeTyping = state.deliveries;

    await type(input, '1');

    assert.equal(state.runaway, false, 'filtering a single character must not loop');
    assert.ok(
      state.deliveries - deliveriesBeforeTyping < 10,
      `filtering must settle quickly, saw ${state.deliveries - deliveriesBeforeTyping} deliveries`,
    );
    assert.deepEqual(state.warnings, [], 'filtering must not log warnings');

    // "Qwen1.5-7B" normalizes to "qwen157b" and is the only row holding a 1.
    const visible = visibleRows(groups);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].textContent, 'Qwen1.5-7B');
    assert.equal(groups[0].rows[0].hidden, true, 'DeepSeek-V3 must be hidden');
    assert.equal(groups[1].group.hidden, true, 'provider B has no match and must be hidden');

    const liveRegion = menu.querySelector('[data-dsh-model-filter-live]');
    assert.equal(liveRegion.textContent, '1 model matches your filter.');
  } finally {
    dom.cleanup();
  }
});

test('the menu observer never re-delivers for the plugin\'s own writes', async () => {
  const dom = installDom();
  try {
    const { menu } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();

    const input = menu.querySelector('[data-dsh-model-filter-input]');
    const before = dom.state.deliveryLog.length;
    await type(input, 'a');
    const after = dom.state.deliveryLog.slice(before);

    assert.equal(dom.state.runaway, false);
    // The plugin's own filtering must not come back to its own menu observer.
    const menuDeliveries = after.filter((targets) => targets.includes('menu'));
    assert.deepEqual(
      menuDeliveries,
      [],
      `menu observer must stay quiet during filtering, saw ${JSON.stringify(menuDeliveries)}`,
    );
  } finally {
    dom.cleanup();
  }
});

test('typing "a" matches provider names as well as model names', async () => {
  const dom = installDom();
  try {
    const { menu, groups } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();
    const input = menu.querySelector('[data-dsh-model-filter-input]');

    await type(input, 'a');

    // "Provider A" matches, so both of its rows stay; "Claude Sonnet" matches too.
    assert.equal(groups[0].group.hidden, false);
    assert.equal(groups[0].rows.filter((r) => r.hidden === false).length, 2);
    assert.equal(groups[1].rows.filter((r) => r.hidden === false).length, 1);
    assert.equal(visibleRows(groups).length, 3);

    const liveRegion = menu.querySelector('[data-dsh-model-filter-live]');
    assert.equal(liveRegion.textContent, '3 models match your filter.');
    assert.equal(dom.state.runaway, false);
  } finally {
    dom.cleanup();
  }
});

test('clearing the filter restores every row', async () => {
  const dom = installDom();
  try {
    const { menu, groups } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();
    const input = menu.querySelector('[data-dsh-model-filter-input]');

    await type(input, '1');
    assert.equal(visibleRows(groups).length, 1);

    await type(input, '');

    assert.equal(visibleRows(groups).length, 4, 'all rows must be visible again');
    assert.equal(groups[1].group.hidden, false, 'hidden groups must be restored');
    assert.equal(menu.querySelector('[data-dsh-model-filter-live]').textContent, '');
    // Indicators are removed when filtering stops.
    assert.equal(menu.querySelector('[data-dsh-model-filter-indicator]'), null);
    assert.equal(dom.state.runaway, false);
  } finally {
    dom.cleanup();
  }
});

test('repeated identical filters stay idempotent and quiet', async () => {
  const dom = installDom();
  try {
    const { menu } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();
    const input = menu.querySelector('[data-dsh-model-filter-input]');

    await type(input, '1');
    const afterFirst = dom.state.deliveries;
    for (let i = 0; i < 4; i += 1) await type(input, '1');
    const perRepeat = (dom.state.deliveries - afterFirst) / 4;

    assert.equal(dom.state.runaway, false, 'repeating a filter must not accumulate a loop');
    assert.ok(perRepeat <= 2, `each repeated filter must settle, saw ${perRepeat} deliveries each`);
  } finally {
    dom.cleanup();
  }
});

test('a query with no matches shows the empty state', async () => {
  const dom = installDom();
  try {
    const { menu, groups } = dom.buildMenu();
    const { apply } = await loadClient();
    apply();
    const input = menu.querySelector('[data-dsh-model-filter-input]');

    await type(input, 'zzzz');

    assert.equal(visibleRows(groups).length, 0);
    const empty = menu.querySelector('[data-dsh-model-filter-empty]');
    assert.ok(empty, 'empty state element must exist');
    assert.equal(empty.hidden, false);
    assert.equal(menu.querySelector('[data-dsh-model-filter-live]').textContent, 'No models match your filter.');
    assert.equal(dom.state.runaway, false);
  } finally {
    dom.cleanup();
  }
});

test('regression: the harness reproduces the freeze on the pre-fix code path', async () => {
  const dom = installDom();
  try {
    const source = await readClientSource();
    // Reintroduce exactly the two defects that caused the reported freeze:
    // an unguarded live-region write, and no takeRecords() barrier to drop the
    // plugin's own mutations.
    const buggy = source
      .replace(
        'if (liveRegion.textContent !== text) liveRegion.textContent = text;',
        'liveRegion.textContent = text;',
      )
      .replace('      observer.takeRecords();\n      applying = false;', '      applying = false;');

    assert.notEqual(buggy, source, 'the transform must actually alter the source');
    assert.ok(!buggy.includes('observer.takeRecords();\n      applying = false;'));
    assert.ok(buggy.includes('liveRegion.textContent = text;'));

    const { menu } = dom.buildMenu();
    const { apply } = await loadSource(buggy);
    apply();

    const input = menu.querySelector('[data-dsh-model-filter-input]');
    await type(input, '1');

    assert.equal(
      dom.state.runaway,
      true,
      'the harness must flag the pre-fix code as a runaway loop, otherwise these tests prove nothing',
    );
  } finally {
    dom.cleanup();
  }
});

test('normalize contract used by the DOM tests is stable', () => {
  assert.equal(normalize('1'), '1');
  assert.equal(normalize('Qwen1.5-7B'), 'qwen157b');
  assert.equal(normalize('Claude Sonnet'), 'claudesonnet');
  assert.equal(normalize('Provider A'), 'providera');
});
