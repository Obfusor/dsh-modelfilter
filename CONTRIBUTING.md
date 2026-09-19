# Contributing to DSH Model Filter

Thank you for your interest in contributing! This plugin adds a filter/search box to DeepSeek Harness model picker menus.

## Development Setup

This project has no npm dependencies and runs entirely in the browser as a DSH client plugin.

### Prerequisites
- Node.js (for running tests)
- A local DSH installation for testing the plugin

### Running Tests

```bash
node --test test/*.test.mjs
```

Two suites run:

- `test/model-filter.test.mjs` — pure normalization and matching contract, no DOM.
- `test/dom-behaviour.test.mjs` — drives the real `client.js` bundle through the
  DOM shim in `test/fake-dom.mjs`: single-character queries, provider-name
  matches, clearing, empty state, and idempotence of repeated filters.

### Why the DOM shim exists

The plugin observes its own subtree with a `MutationObserver`, and
`MutationObserver` callbacks are delivered as **microtasks**. An observer that
writes to its own subtree can therefore re-trigger itself forever; because the
event loop never yields, the tab freezes and nothing reaches the console. That
is exactly the 0.2.2 bug.

`test/fake-dom.mjs` models the two details that make the loop possible:

1. Observer callbacks are delivered as microtasks.
2. Assigning `textContent` always replaces the child text node, so it queues a
   `childList` record even when the string is unchanged.

`dom-behaviour.test.mjs` also derives a pre-fix variant from `client.js` at
runtime and asserts the harness flags it as a runaway. Keep that test: without
it, the suite could pass simply because it is incapable of detecting the loop.

Rules when editing `client.js`:

- Never write to a node inside an observed subtree unconditionally. Guard the
  write on an actual value change.
- Any code that mutates the menu must run inside `applyFilter()`, which calls
  `observer.takeRecords()` to drop the plugin's own mutations.
- A boolean re-entrancy flag around the filter call does **not** work, because
  it is reset before the microtask callback runs.

### Testing the Plugin Locally

1. Install the plugin from your local checkout:
   ```bash
   dsh plugin --profile web add "/path/to/dsh-modelfilter"
   ```

2. Open the DSH Web GUI and use the model picker to verify filtering works

3. Check browser console for any warnings or errors (look for `[dsh-model-filter]` prefix)

## Code Style Guidelines

- Use template literals for multi-line strings and CSS
- Add JSDoc comments for all exported/public functions
- Keep inline styles concise; use CSS variables where possible
- Follow existing naming conventions (`data-dsh-model-filter-*` attributes)

## Architecture Notes

The plugin consists of two parts:
- `index.js`: Host-side stub (empty implementation, mounted by patch)
- `client.js`: Browser-side implementation that injects filter UI into model menus

Key design decisions:
- Uses ARIA roles (`[role="menu"]`, `[role="group"]`) for stable selectors
- Compatibility guard ensures plugin fails closed if DSH changes menu structure
- MutationObserver watches for dynamically created menus
- Filter state persists across menu opens/closes via sessionStorage

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Make your changes and run tests
4. Commit with clear, descriptive messages
5. Push to your fork and submit a pull request

Please ensure all tests pass before submitting a PR.