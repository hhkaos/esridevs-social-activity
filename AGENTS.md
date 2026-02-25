# AGENTS.md

## App overview
- `esridevs-social-activity` is a browser-only app that aggregates Esri developer content/social activity from a Google Sheet and presents it as:
  - a filterable activity table
  - an insights dashboard (Chart.js)
- No backend in this repo; runtime data is fetched from opensheet.

## Architecture snapshot
- Entry point/UI: `index.html`
- Data pipeline + table rendering: `load-table.js`
- Filter state, URL state, column toggles, share/reset: `apply-filters.js`
- Charts and expanded modal charts: `charts.js`
- Offline shell caching: `sw.js`
- Styling: `style.css`

## Integration points to watch
- Global app state and hooks are intentionally shared via `window.*`.
- `apply-filters.js` and `charts.js` both depend on normalized row fields and consistent date parsing.
- `load-table.js` must keep sanitizer/dedupe behavior compatible with filters/charts expectations.
- Featured behavior relies on normalized row metadata:
  - `data-featured="1|0"` is consumed by filters.
  - Spreadsheet `Featured` markers may use `X` instead of boolean words.
  - Header key variants for featured fields can include punctuation/case/spacing differences.

## Agent working rules for this repo
- Preserve existing UX semantics for filters, date range, and chart synchronization unless explicitly asked to change them.
- When changing row shape/field mapping, verify table rendering, filtering, and chart aggregation all still work.
- Treat URL share-state compatibility as a stability requirement.
- When changing shell assets or client runtime files that are cached by the service worker (for example `index.html`, `style.css`, `load-table.js`, `apply-filters.js`, `charts.js`, `sw-update-utils.js`), update the service worker cache version in `sw.js`.

## Required testing workflow
- Bug fix rule: every bug fix must include regression tests covering the bug path.
- Task completion rule: after every new task, run tests before considering the task done.
- If tests for the changed behavior do not exist, add them.
- If test execution is blocked/unavailable, clearly report the gap and reason.

## Debugging checklist (stale data / stale assets)
- If UI behavior does not match local code changes, check for stale shell assets served by service worker before deeper refactors.
- For local verification, clear service worker + Cache Storage + `localStorage.esridevs_data_v1` and reload.
- Prefer validating active runtime behavior with DevTools MCP after cache clearing when bug reports mention "still not updating" symptoms.
