# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Added dedicated table surface states (`loading`, `ready`, `error`) so the app switches cleanly between skeleton, table, and error UI states.
- Updated table rendering to build rows in a detached `tbody` and swap once complete to avoid partial live-table updates during chunked renders.
- Made initial load always show loading status/skeleton instead of suppressing it when cache is present to avoid stale-first visual confusion.
- Bumped service worker shell cache version to `v10` after updating cached runtime assets (`index.html`, `style.css`, `load-table.js`).
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
- Ensured background refresh render failures now surface a visible table load error state instead of silently leaving the UI stale.
- Enforced row sanitization to reject activity entries without both a title and a primary content URL.
- Preserved social link fallback behavior when `EsriDevs Shared` is used as the `X/Twitter` source.
- Prevented filters and the trends tab from running until initial table rendering completes.
- Corrected topic filtering so comma-delimited technology values match selected filters.
- **All:** Reduced stale app-shell behavior by wiring `SKIP_WAITING` messaging and reloading once the new service worker controls the page.

### Added
- Added regression coverage for loading/error surface markup, render state transitions, detached-`tbody` row commits, and refresh failure handling.
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
