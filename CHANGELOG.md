# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Refactored activity data helpers into a shared `activity-utils.js` module and loaded it before table logic.
- Updated `load-table.js` to consume shared helpers and centralized post-refresh UI synchronization.
- Exposed `syncColumnVisibilityWithToggles` on `window` for consistent refresh behavior across modules.
- Switched table rendering to chunked frame-based rendering to keep the UI responsive while loading large datasets.

### Fixed
- Enforced row sanitization to reject activity entries without both a title and a primary content URL.
- Preserved social link fallback behavior when `EsriDevs Shared` is used as the `X/Twitter` source.
- Prevented filters and the trends tab from running until initial table rendering completes.
- Corrected topic filtering so comma-delimited technology values match selected filters.

### Added
- Added regression tests for activity sanitization, social link extraction, and post-refresh UI sync hooks.
- Added regression tests for `createRenderGate` completion and reset behavior.
- Added regression tests for selection-map matching, including comma-delimited topic values.
- Added repository shipping/release instruction docs and a GitHub release workflow definition.
