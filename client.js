/**
 * DSH Model Filter Plugin - Client Side
 *
 * Adds a filter/search box to DeepSeek Harness model picker menus.
 * Works with both the /model popup and composer's model selector.
 */

const FILTER_ATTRIBUTE = 'data-dsh-model-filter';
const MENU_SELECTOR = '[role="menu"]';
const GROUP_SELECTOR = '[role="group"]';
const ROW_SELECTOR = '[role="menuitemradio"]';
const STORAGE_KEY = 'dsh-model-filter-last-query';
const DEBOUNCE_MS = 100;
let compatibilityWarningShown = false;

/**
 * Normalize text for case-insensitive, separator-agnostic matching.
 * Treats common model-name separators as presentation only.
 */
function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Check if a menu element is a compatible provider-grouped model menu.
 */
function isModelMenu(menu) {
  const groups = Array.from(menu.querySelectorAll(GROUP_SELECTOR));
  const rows = Array.from(menu.querySelectorAll(ROW_SELECTOR));
  if (groups.length === 0 || rows.length === 0) return false;
  // Compatibility guard: only touch menus whose model rows are still nested
  // in provider groups. If DSH changes this contract, fail closed.
  return rows.every(row => row.closest(GROUP_SELECTOR) !== null);
}

/**
 * Warn once if no compatible model menu structure is found.
 */
function warnIfUnsupported(menu) {
  if (compatibilityWarningShown || menu.querySelector(ROW_SELECTOR) === null) return;
  compatibilityWarningShown = true;
  console.warn(
    '[dsh-model-filter] No compatible provider-grouped model menu was found. ' +
    'The DSH UI structure may have changed; filtering is disabled for this menu.'
  );
}

/**
 * Get the label text for a provider group.
 */
function groupLabel(group) {
  const labelledBy = group.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const heading = document.getElementById(labelledBy);
    if (heading !== null) return heading.textContent ?? '';
  }
  // Fallback: first child that isn't a model row
  const heading = Array.from(group.children).find(child => !child.matches(ROW_SELECTOR));
  return heading?.textContent ?? '';
}

/**
 * Get all searchable text from an element (content, title, aria-label).
 */
function searchableText(element) {
  return [
    element.textContent ?? '',
    element.getAttribute('title') ?? '',
    element.getAttribute('aria-label') ?? ''
  ].join(' ');
}

/**
 * Update the "(filtered)" indicator on a group heading.
 */
function updateGroupIndicator(group, filtered, visibleCount, totalCount) {
  const labelledBy = group.getAttribute('aria-labelledby');
  let heading = null;
  if (labelledBy !== null) {
    heading = document.getElementById(labelledBy);
  }
  if (heading === null) {
    heading = Array.from(group.children).find(child => !child.matches(ROW_SELECTOR));
  }
  if (heading === null) return;

  let indicator = heading.querySelector('[data-dsh-model-filter-indicator]');
  if (filtered) {
    const text = ` (${visibleCount}/${totalCount} models)`;
    if (indicator === null) {
      indicator = document.createElement('span');
      indicator.dataset.dshModelFilterIndicator = 'true';
      indicator.style.cssText = `font-size:0.8em;opacity:0.7;margin-left:4px`;
      heading.appendChild(indicator);
    }
    if (indicator.textContent !== text) {
      indicator.textContent = text;
    }
  } else if (indicator !== null) {
    indicator.remove();
  }
}

/**
 * Update the live region with filter result count.
 */
function updateLiveRegion(liveRegion, query, visibleCount) {
  if (!liveRegion) return;
  let text = '';
  if (query.length > 0) {
    if (visibleCount === 0) {
      text = 'No models match your filter.';
    } else if (visibleCount === 1) {
      text = '1 model matches your filter.';
    } else {
      text = `${visibleCount} models match your filter.`;
    }
  }
  // Assigning textContent always replaces the child text node, even when the
  // string is unchanged, so it would queue a fresh childList mutation on every
  // call and re-trigger our own observer. Only write when the text changes.
  if (liveRegion.textContent !== text) liveRegion.textContent = text;
}

/**
 * Apply the filter query to a menu, hiding non-matching rows and groups.
 */
function filterMenu(menu, query) {
  const groups = Array.from(menu.querySelectorAll(GROUP_SELECTOR));
  let visible = 0;

  for (const group of groups) {
    const groupNameMatches = normalize(groupLabel(group)).includes(query);
    const rows = Array.from(group.querySelectorAll(ROW_SELECTOR));
    let groupVisible = 0;

    for (const row of rows) {
      const matches = query.length === 0 ||
        groupNameMatches ||
        normalize(searchableText(row)).includes(query);

      // The harness menu styles can override the browser's default [hidden]
      // rule, so set an explicit display rule as well.
      row.hidden = !matches;
      row.style.setProperty('display', matches ? '' : 'none', 'important');

      if (matches) {
        groupVisible += 1;
        visible += 1;
      }
    }

    group.hidden = groupVisible === 0;
    group.style.setProperty('display', groupVisible === 0 ? 'none' : '', 'important');

    // Show "(filtered)" indicator on group headings when filtering is active
    updateGroupIndicator(group, query.length > 0, groupVisible, rows.length);
  }

  // Update empty state message
  let empty = menu.querySelector('[data-dsh-model-filter-empty]');
  if (query.length > 0 && visible === 0) {
    if (empty === null) {
      empty = document.createElement('div');
      empty.dataset.dshModelFilterEmpty = 'true';
      empty.setAttribute('role', 'status');
      empty.textContent = 'No models match your filter.';
      menu.insertBefore(empty, menu.firstChild);
    }
    empty.hidden = false;
    empty.style.setProperty('display', '', 'important');
  } else if (empty !== null) {
    empty.hidden = true;
    empty.style.setProperty('display', 'none', 'important');
  }

  // Update live region for accessibility
  updateLiveRegion(menu.querySelector('[data-dsh-model-filter-live]'), query, visible);

  return visible;
}

/**
 * Install the filter UI into a model menu.
 */
function installFilter(menu) {
  if (menu.hasAttribute(FILTER_ATTRIBUTE)) return null;

  if (!isModelMenu(menu)) {
    warnIfUnsupported(menu);
    return null;
  }

  menu.setAttribute(FILTER_ATTRIBUTE, 'true');

  // Create filter wrapper
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: calc(100% - 16px);
    margin: 8px;
  `;

  // Create search input
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter models…';
  input.setAttribute('aria-label', 'Filter models');
  input.dataset.dshModelFilterInput = 'true';
  input.autocomplete = 'off';
  input.style.cssText = `
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--border-color, #777);
    border-radius: 6px;
    background: var(--input-background, transparent);
    color: inherit;
    font: inherit;
  `;

  // Create clear button with SVG icon
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.setAttribute('aria-label', 'Clear filter');
  clearBtn.dataset.dshModelFilterClear = 'true';
  clearBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path d="M3.4 3.4l5.2 5.2m0-5.2l-5.2 5.2"/>
  </svg>`;
  clearBtn.style.cssText = `
    display: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: 4px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--button-background, #666);
    color: inherit;
    font-size: 12px;
    cursor: pointer;
  `;

  // Create live region for accessibility announcements
  const liveRegion = document.createElement('div');
  liveRegion.dataset.dshModelFilterLive = 'true';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.cssText = `position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);`;

  wrapper.appendChild(input);
  wrapper.appendChild(clearBtn);
  menu.insertBefore(wrapper, menu.firstChild);
  menu.insertBefore(liveRegion, menu.firstChild);

  function updateClearButton() {
    clearBtn.style.display = input.value.length > 0 ? 'flex' : 'none';
  }

  // Re-entrancy guard for the observer below. MutationObserver callbacks are
  // delivered as microtasks, so a flag cleared synchronously after filtering
  // would already be false again by the time the callback runs. The barrier
  // that actually works is observer.takeRecords(), called in applyFilter().
  let applying = false;

  const observer = new MutationObserver(() => {
    if (!menu.isConnected) {
      observer.disconnect();
      return;
    }
    if (applying) return;
    applyFilter();
  });

  /**
   * Run the filter and discard the mutation records it produces. Without the
   * takeRecords() call our own DOM writes re-trigger this observer, and each
   * pass queues another microtask that writes again, which starves the event
   * loop and freezes the page.
   */
  function applyFilter() {
    applying = true;
    try {
      filterMenu(menu, normalize(input.value));
    } catch (e) {
      console.warn('[dsh-model-filter] Error while filtering:', e);
    } finally {
      observer.takeRecords();
      applying = false;
    }
  }

  function persistQuery() {
    try {
      if (input.value.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, input.value);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  let debounceTimer;
  input.addEventListener('input', () => {
    updateClearButton();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      persistQuery();
      applyFilter();
    }, DEBOUNCE_MS);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    updateClearButton();
    persistQuery();
    applyFilter();
    input.focus();
  });

  // Restore the previous query, if the browser still has one for this session.
  try {
    const savedQuery = sessionStorage.getItem(STORAGE_KEY);
    if (savedQuery !== null) input.value = savedQuery;
  } catch (e) {
    // sessionStorage may be unavailable in some contexts
  }
  updateClearButton();

  try {
    observer.observe(menu, { childList: true, subtree: true });
  } catch (e) {
    console.warn('[dsh-model-filter] Failed to observe menu:', e);
  }

  // Apply after observe() so takeRecords() has an observer to drain.
  applyFilter();

  // Auto-focus the filter when menu opens
  setTimeout(() => {
    if (menu.isConnected && !input.disabled) {
      input.focus();
    }
  }, 50);

  return { input, clearBtn, wrapper, liveRegion, observer };
}

/**
 * Install model filters on all compatible menus in the given root.
 */
function installModelFilters(root = document) {
  for (const menu of Array.from(root.querySelectorAll(MENU_SELECTOR))) {
    installFilter(menu);
  }
}

// Track installed filter instances for cleanup
let installedFilters = [];

/**
 * Apply the plugin: install filters on existing menus and watch for new ones.
 */
function apply() {
  installModelFilters();

  const observer = new MutationObserver(() => {
    try {
      installModelFilters();
    } catch (e) {
      console.warn('[dsh-model-filter] Error installing filters:', e);
    } finally {
      // Installation inserts nodes into the tree. Drop those records so the
      // body observer does not keep re-delivering for changes we caused.
      observer.takeRecords();
    }
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn('[dsh-model-filter] Failed to observe document body:', e);
  }

  // Store observer for cleanup
  installedFilters.push({ observer });
}

/**
 * Dispose of all observers and clean up plugin state.
 */
function dispose() {
  for (const filter of installedFilters) {
    try {
      filter.observer.disconnect();
    } catch (e) {
      console.warn('[dsh-model-filter] Error disconnecting observer:', e);
    }
  }
  installedFilters = [];
}

// DSH client bundles are lazy CJS registrations, not browser ESM modules.
// The registration id must exactly equal package.json.name.
window.__ModuleLoader__.load({
  id: 'dsh-model-filter',
  factory: () => ({ apply, dispose })
});
