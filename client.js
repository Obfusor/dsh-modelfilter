const FILTER_ATTRIBUTE = 'data-dsh-model-filter'
const MENU_SELECTOR = '[role="menu"]'
const GROUP_SELECTOR = '[role="group"]'
const ROW_SELECTOR = '[role="menuitemradio"]'

function normalize(value) {
  // Treat common model-name separators as presentation only, so differently
  // formatted names still compare as the same searchable text.
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function isModelMenu(menu) {
  return menu.querySelector(GROUP_SELECTOR) !== null
    && menu.querySelector(ROW_SELECTOR) !== null
}

function groupLabel(group) {
  const labelledBy = group.getAttribute('aria-labelledby')
  if (labelledBy !== null) {
    const heading = document.getElementById(labelledBy)
    if (heading !== null) return heading.textContent ?? ''
  }
  // Fallback for menus that do not expose aria-labelledby: the group heading
  // is normally the first child before any model rows.
  const heading = Array.from(group.children).find(child => !child.matches(ROW_SELECTOR))
  return heading?.textContent ?? ''
}

function filterMenu(menu, query) {
  const groups = Array.from(menu.querySelectorAll(GROUP_SELECTOR))
  let visible = 0

  for (const group of groups) {
    const groupNameMatches = normalize(groupLabel(group)).includes(query)
    let groupVisible = 0
    for (const row of Array.from(group.querySelectorAll(ROW_SELECTOR))) {
      const matches = query.length === 0
        || groupNameMatches
        || normalize(row.textContent ?? '').includes(query)
      // The harness menu styles can override the browser's default `[hidden]`
      // rule, so set an explicit display rule as well.
      row.hidden = !matches
      row.style.setProperty('display', matches ? '' : 'none', 'important')
      if (matches) {
        groupVisible += 1
        visible += 1
      }
    }
    group.hidden = groupVisible === 0
    group.style.setProperty('display', groupVisible === 0 ? 'none' : '', 'important')
  }

  let empty = menu.querySelector('[data-dsh-model-filter-empty]')
  if (query.length > 0 && visible === 0) {
    if (empty === null) {
      empty = document.createElement('div')
      empty.dataset.dshModelFilterEmpty = 'true'
      empty.setAttribute('role', 'status')
      empty.textContent = 'No models match your filter.'
      menu.insertBefore(empty, menu.firstChild)
    }
    empty.hidden = false
    empty.style.setProperty('display', '', 'important')
  } else if (empty !== null) {
    empty.hidden = true
    empty.style.setProperty('display', 'none', 'important')
  }
}

function installFilter(menu) {
  if (menu.hasAttribute(FILTER_ATTRIBUTE) || !isModelMenu(menu)) return
  menu.setAttribute(FILTER_ATTRIBUTE, 'true')

  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = 'Filter models…'
  input.setAttribute('aria-label', 'Filter models')
  input.dataset.dshModelFilterInput = 'true'
  input.style.cssText = [
    'box-sizing:border-box', 'display:block', 'width:calc(100% - 16px)',
    'margin:8px', 'padding:6px 8px', 'border:1px solid var(--border-color, #777)',
    'border-radius:6px', 'background:var(--input-background, transparent)',
    'color:inherit', 'font:inherit',
  ].join(';')
  input.addEventListener('input', () => filterMenu(menu, normalize(input.value)))
  menu.insertBefore(input, menu.firstChild)

  const observer = new MutationObserver(() => {
    if (!menu.isConnected) {
      observer.disconnect()
      return
    }
    filterMenu(menu, normalize(input.value))
  })
  observer.observe(menu, { childList: true, subtree: true })
}

function installModelFilters(root = document) {
  for (const menu of Array.from(root.querySelectorAll(MENU_SELECTOR))) installFilter(menu)
}

function apply() {
  installModelFilters()
  const observer = new MutationObserver(() => installModelFilters())
  observer.observe(document.body, { childList: true, subtree: true })
}

// DSH client bundles are lazy CJS registrations, not browser ESM modules.
// The registration id must exactly equal package.json.name.
window.__ModuleLoader__.load({
  id: 'dsh-model-filter',
  factory: () => ({ apply }),
})
