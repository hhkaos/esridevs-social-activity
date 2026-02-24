# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Refactored activity data helpers into a shared `activity-utils.js` module and loaded it before table logic.
- Updated `load-table.js` to consume shared helpers and centralized post-refresh UI synchronization.
- Exposed `syncColumnVisibilityWithToggles` on `window` for consistent refresh behavior across modules.
- Switched table rendering to chunked frame-based rendering to keep the UI responsive while loading large datasets.
- **All:** Added date-range preset filtering (`Last 30/60`, month/quarter/year presets, and custom range) anchored to the latest activity date.
- **All:** Updated reset behavior to restore the `Last 60 days` preset and recalculate preset ranges after background data refresh.
- **All:** Updated service-worker navigation handling to network-first while keeping cache fallback for offline shell resilience.

- **Tooling:** Added root `package.json` test configuration so `npm test` runs the Node test suite.

### Fixed
- Enforced row sanitization to reject activity entries without both a title and a primary content URL.
- Preserved social link fallback behavior when `EsriDevs Shared` is used as the `X/Twitter` source.
- Prevented filters and the trends tab from running until initial table rendering completes.
- Corrected topic filtering so comma-delimited technology values match selected filters.
- **All:** Reduced stale app-shell behavior by wiring `SKIP_WAITING` messaging and reloading once the new service worker controls the page.

### Added
- Added regression tests for activity sanitization, social link extraction, and post-refresh UI sync hooks.
- Added regression tests for `createRenderGate` completion and reset behavior.
- Added regression tests for selection-map matching, including comma-delimited topic values.
- Added repository shipping/release instruction docs and a GitHub release workflow definition.
- **All:** Added an in-app update banner with `Update` and `Later` actions when a newer service worker is available.
- **All:** Added shared `sw-update-utils.js` helpers and regression tests for update prompt and navigation detection logic.
- **All:** Added date preset regression tests for local-day parsing, latest-date detection, and preset range boundaries.
