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

## Change guidance
- Keep edits focused and preserve existing behavior unless the task requires change.
- Prefer small, reviewable commits and include clear rationale for behavior changes.
- Validate filter, table, and chart interactions when touching shared data/state logic.
- If a change touches service-worker-cached shell assets (`index.html`, `style.css`, `load-table.js`, `apply-filters.js`, `charts.js`, `sw-update-utils.js`), bump `CACHE_VERSION` in `sw.js`.
