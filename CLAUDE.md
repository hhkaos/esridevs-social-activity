# CLAUDE.md

## Project memory
- App name: `esridevs-social-activity`.
- Type: static client-side web app (no build step required).
- Purpose: display and filter Esri Developer social/content activity sourced from a Google Sheet.
- Live data source: `https://opensheet.elk.sh/1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg/{Activity|Dropdowns|Authors}`.
- Main UI areas:
  - Activity Feed table tab (`#tab-table`)
  - Insights charts tab (`#tab-trends`)
  - Filters, date range, column visibility controls, reset/share actions.

## Key files
- `index.html`: app shell, tabs, filter controls, table template, chart containers, share/reset/configure buttons, update toast, modal for expanded charts.
- `load-table.js`: fetches spreadsheet data, sanitizes and deduplicates rows, renders table rows, builds dropdown datasets, manages localStorage cache and background refresh notifications.
- `apply-filters.js`: owns filter state (`window.flags`), URL share-state decode/encode (LZString), filtering logic, date-range filtering, filter summary, column visibility toggles, reset/share behavior, tab state handling.
- `charts.js`: renders Chart.js charts from filtered data, keeps chart configs/instances, supports expanded modal charts, rerenders when filters/trends tab changes.
- `style.css`: visual styles.
- `sw.js`: service worker for same-origin shell assets caching (cache-first), excludes opensheet API calls.

## Runtime contracts
- Shared globals:
  - `window.activityData`: canonical activity dataset after sanitize/dedupe.
  - `window.dropdownData`: values for filter multiselects.
  - `window.flags`: active filters including `dateRange`.
  - `window.onDataLoaded`, `window.applyFilters`, `window.renderCharts`: cross-file integration hooks.
- `index.html` relies on CDN libraries (Bootstrap/Bootswatch, Tom Select, Font Awesome, Chart.js, LZString).
- Share view stores compressed state in `?state=` query param.

## Data and rendering behaviors to preserve
- Empty multiselect selection means "no restriction" for that filter.
- Date filtering uses inclusive `from` and `to` ISO dates.
- Contributors can be multi-valued and are split for filtering/chart counting.
- Activity rows are sanitized and deduped before render.
- Featured detection must accept spreadsheet marker conventions beyond boolean words:
  - Treat `X`/`x` as truthy for `Featured`.
  - Match featured field headers robustly (`Featured`, `featured`, `Featured?`, and punctuation/spacing variants).
- Missing social links show an informative tooltip with guidance.
- Trends charts always reflect current active filters.

## Cache and debugging lessons
- When debugging data-mapping issues, verify the browser is actually running current JS assets (service worker can serve stale shell files).
- If behavior in UI contradicts local code, clear:
  - service worker registrations
  - Cache Storage entries (`esridevs-shell-*`)
  - localStorage key `esridevs_data_v1`
- Background refresh change detection should compare the full sanitized dataset; partial sampling (for example first 3 rows) can miss spreadsheet updates such as `Featured` flag edits.

## Testing policy (mandatory)
- After fixing any bug, add or update automated regression tests that would fail without the fix.
- After finishing any new task, run the full relevant automated test suite before handoff.
- If no automated tests exist for the touched area, create them as part of the task.
- If tests cannot be run, explicitly report why and what remains unverified.

## Chrome Extension (`/extension/`)
- Self-contained subfolder, no build step. Plan + progress: `docs/EXTENSION.md`.
- Key files:
  - `manifest.json`: MV3, targets Chrome/Firefox/Edge.
  - `filter-utils.js`: Pure filtering logic (ES module). Mirrors the relevant subset of `activity-utils.js`. **Do not import from `../activity-utils.js`** — the packaged extension must be self-contained.
  - `background.js`: Service worker — alarm, fetch, badge count, optional OS notifications.
  - `popup.html/js/css`: Popup UI, resets badge on open, builds "Open feed" URL.
  - `options.html/js/css`: Settings page with searchable multi-select + chips for each filter dimension.
  - `lzstring.min.js`: Local copy of LZString 1.5.0 (same version as the web app CDN). Required because MV3 CSP blocks CDN scripts.
- Storage schema (`chrome.storage.sync`): `filters` (arrays per dimension), `lastSeenPublishedAt` (ISO date YYYY-MM-DD), `lastKnownUnreadCount`, `lastRefreshedAt` (ISO datetime), `refreshIntervalMinutes`, `targetBaseUrl`, `notificationsEnabled`.
- Storage schema (`chrome.storage.local`): `seenItemKeys` (string[] — URLs of seen items), `currentItemKeys` (string[] — all countable URLs from last fetch), `newItemUrls` (string[] — unseen URLs matching active filters, for "New" badges).
- New-item detection uses **key-set tracking** (URL-based), not date comparison. This correctly detects items added retroactively with old dates. Migration from date-based detection is automatic.
- "Open feed" URL combines `?state=<LZString>` (user's filters, same format as web app share) + `?newItems=<btoa(JSON)>` (unseen item URLs for "New" badges). Omitted when not applicable.
- Filter options are fetched from Dropdowns + Authors sheets (same opensheet API as the web app). Contributors = Dropdowns contributors union Authors sheet first column.
- Tests: `tests/extension-filter-utils.test.mjs` (82 tests, covering all pure filtering logic including key-set tracking and URL building).

## Extension "New" badges in the web app

- `load-table.js` reads `?newItems=<btoa(JSON array of URLs)>` at startup, stores as `window.highlightedItemUrls` (Set), and removes the param from the URL.
- `createTableRowClone` adds `<span class="badge-new">New</span>` next to the title when the row's URL is in `window.highlightedItemUrls`.
- `style.css`: `.badge-new` — Esri blue pill, white uppercase text, inline-block.

## Change guidance
- Keep edits focused and preserve existing behavior unless the task requires change.
- Prefer small, reviewable commits and include clear rationale for behavior changes.
- Validate filter, table, and chart interactions when touching shared data/state logic.
- If a change touches service-worker-cached shell assets (`index.html`, `style.css`, `load-table.js`, `apply-filters.js`, `charts.js`, `sw-update-utils.js`), bump `CACHE_VERSION` in `sw.js`.
