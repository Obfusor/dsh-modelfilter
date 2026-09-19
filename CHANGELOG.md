# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2025-07-14

### Fixed
- Infinite loop bug where searching for single characters (e.g., "1", "a") would freeze the browser due to re-entrant MutationObserver calls during filtering

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