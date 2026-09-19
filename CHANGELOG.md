# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2025-07-14

### Fixed
- **Browser freeze when filtering.** Typing any query (e.g. "1", "a") could lock
  up the page with nothing logged to the console. The 0.2.1 attempt used a
  boolean re-entrancy flag, which cannot work: `MutationObserver` callbacks are
  delivered as microtasks, so the flag was already reset before the callback
  ran. The real loop was `updateLiveRegion()`, which assigned `textContent` on
  every call — assigning `textContent` always replaces the child text node, even
  with an identical string, generating a fresh `childList` mutation each pass.
  That self-retriggering observer starved the microtask queue, so the event loop
  never yielded and the console never flushed.
  - `updateLiveRegion()` now only writes when the announced text actually changes.
  - `applyFilter()` calls `observer.takeRecords()` to discard the mutations the
    plugin's own filtering produces, which is the barrier that actually holds.
  - The body observer in `apply()` likewise drains its own records.
- Announcement grammar: "1 model match your filter." is now "1 model matches
  your filter."

### Added
- Behaviour tests (`test/dom-behaviour.test.mjs`) driving the real client bundle
  through a fake DOM, covering single-character queries, provider-name matches,
  clearing, empty state, and repeat-idempotence.
- A regression test that derives a pre-fix variant from `client.js` at runtime
  and asserts the harness reproduces the freeze on it, so the suite cannot pass
  merely because it is incapable of detecting the loop.

## [0.2.1] - 2025-07-14

### Fixed
- Attempted fix for an infinite loop when searching for single characters
  (e.g. "1", "a"). **This did not work** — see 0.2.2 for the actual fix.

## [0.2.0] - 2025-07-14

### Added
- Debounced filter input (100ms delay) for improved performance
- Auto-focus on filter input when model picker opens
- Persistent filter state using sessionStorage
- SVG clear button icon for consistent rendering across platforms
- Live region announcements for accessibility ("X models match your filter")
- `autocomplete="off"` on filter input to prevent browser suggestions
- Comprehensive error handling with try/catch around observer operations
- `dispose()` function for cleanup when plugin is uninstalled

### Changed
- Refactored inline CSS from string concatenation arrays to template literals
- Added JSDoc comments for all public functions
- Improved code organization and maintainability

## [0.1.0] - Initial Release

### Added
- Model filter search box for DeepSeek Harness model pickers
- Case-insensitive, separator-agnostic matching
- Provider group filtering with "(filtered)" indicators
- Empty state message when no models match
- Compatibility guard that fails closed if DSH UI structure changes