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

Tests cover:
- Text normalization logic
- Filter matching behavior
- Edge cases with special characters and Unicode

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