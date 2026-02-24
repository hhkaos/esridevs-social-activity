# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Refactored activity data helpers into a shared `activity-utils.js` module and loaded it before table logic.
- Updated `load-table.js` to consume shared helpers and centralized post-refresh UI synchronization.
- Exposed `syncColumnVisibilityWithToggles` on `window` for consistent refresh behavior across modules.

### Fixed
- Enforced row sanitization to reject activity entries without both a title and a primary content URL.
- Preserved social link fallback behavior when `EsriDevs Shared` is used as the `X/Twitter` source.

### Added
- Added regression tests for activity sanitization, social link extraction, and post-refresh UI sync hooks.
