# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **All:** Added an `Image` column to the activity table that displays a clickable thumbnail when an image URL (from `Image`, `Image URL`, `Picture`, or `Picture URL` spreadsheet fields) is available. The column is hidden by default and can be enabled via the Configure columns panel.

### Changed
- Refactored activity data helpers into a shared `activity-utils.js` module and loaded it before table logic.
- Updated `load-table.js` to consume shared helpers and centralized post-refresh UI synchronization.
- Exposed `syncColumnVisibilityWithToggles` on `window` for consistent refresh behavior across modules.
- Switched table rendering to chunked frame-based rendering to keep the UI responsive while loading large datasets.
- **All:** Added date-range preset filtering (`Show all`, `Last 30/60/90`, month/quarter/year presets, and custom range) anchored to the latest activity date.
- **All:** Updated reset behavior to restore the `Show all` preset and recalculate preset ranges after background data refresh.
- **All:** Updated service-worker navigation handling to network-first while keeping cache fallback for offline shell resilience.
- Added a collapsible filters section that is collapsed by default.
- Added a `Contributor` column to the activity table and aligned row mapping/indexing for the expanded schema.
- Refactored service-worker cache write logic to use shared `queueCachePut` helper behavior.
- Restored active tab state directly from shared URL state payloads and removed fallback dependence on standalone tab query params.
- Updated tab activation logic to use Bootstrap's Tab API when available to keep trigger/pane classes synchronized.
- Reapplied restored tab state on window load and after initial data refresh to keep table/trends views consistent.
- Bumped service worker shell cache version to invalidate stale cached runtime assets after tab-state updates.

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
- Added schema-contract validation for OpenSheet `Activity` and `Dropdowns` headers with fail-fast error reporting.
- Added an in-app schema warning banner to surface header mismatches.
- Added regression tests for schema validation messaging, contributor header mapping, table column toggle parity, `showAll/last90` presets, and service-worker cache put handling.
- Added regression tests for share-state tab serialization, tab restoration, and Bootstrap tab activation behavior.
