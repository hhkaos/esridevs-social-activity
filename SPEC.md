# EsriDevs Social Activity - Specification

## 1. Product Summary

`esridevs-social-activity` is a static, browser-only web app that aggregates Esri developer content and social activity from a Google Sheet and presents it as:

- A filterable activity table ("Activity Feed")
- A filter-aware chart dashboard ("Insights")

The app has no backend in this repository and runs directly in the browser.

## 2. Goals

- Provide a single, easy-to-scan view of recent Esri developer content.
- Allow users to narrow results by topic, content type, channel, author, contributor, language, and date range.
- Keep table and chart views synchronized to the same active filters.
- Support shareable URLs that restore filter, column, and tab state.
- Improve perceived performance with local cache + background refresh.

## 3. Non-Goals

- User authentication or role-based access control.
- Server-side rendering or backend APIs owned by this repo.
- Data entry workflows beyond linking out to the source spreadsheet.

## 4. Runtime Architecture

## 4.1 Files and responsibilities

- `index.html`: app shell, controls, tabs, table/charts containers, templates, modal, toast.
- `load-table.js`: fetching, sanitization, dedupe, table rendering, localStorage caching, background refresh flow.
- `apply-filters.js`: filter state, URL share-state decode/encode, row visibility logic, reset/share, column toggles, tab state.
- `charts.js`: Chart.js rendering from filtered dataset, chart card expansion modal behavior.
- `style.css`: presentation layer.
- `sw-update-utils.js`: shared helpers for service-worker update prompt and navigation request detection.
- `sw.js`: service worker shell cache strategy.

## 4.2 Shared global contracts

- `window.activityData`: canonical in-memory activity rows after sanitize/dedupe.
- `window.dropdownData`: options for filter dropdowns.
- `window.flags`: active filter state, including `datePreset` and `dateRange`.
- `window.onDataLoaded()`: called after data is processed to initialize filters/UI.
- `window.applyFilters()`: applies current filter state to table rows.
- `window.renderCharts()`: renders/re-renders insights charts from filtered data.
- `window.handleActivityDataRefresh()`: recomputes date preset ranges after background activity refresh.

## 5. External Dependencies

CDN runtime dependencies:

- Bootswatch Morph (Bootstrap theme)
- Bootstrap JS bundle
- Tom Select
- Font Awesome
- LZ-String
- Chart.js

External data source:

- Google Sheet via opensheet:
  - `https://opensheet.elk.sh/1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg/Activity`
  - `https://opensheet.elk.sh/1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg/Dropdowns`
  - `https://opensheet.elk.sh/1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg/Authors`

## 6. Data Model and Normalization

## 6.1 Primary row fields (logical)

Rows are normalized from variant sheet headers into this logical shape during rendering/filtering:

- `Date`
- `Title` / `Content title`
- `Author` / `Authors`
- `Contributors` / `Contributor` / `Authors`
- `Channel`
- `Language` / `Languages`
- `Topics_Product` / `Technology` / `Technologies`
- `Category` / `Category / Content type` / `Content type`
- Content URL (`URL`/`Url`/`Link`)
- Social links (`LinkedIn`, `X/Twitter`, `Bluesky`, `EsriDevs Shared`)
- `Featured` flag

## 6.2 Sanitization rules

- Rows with no meaningful data are removed.
- Placeholder values such as `n/a`, `na`, `none`, `-`, `--`, `tbd` are treated as non-meaningful.

## 6.3 Dedupe rules

- Rows are deduplicated by a composite key based on normalized core fields.
- Duplicate rows merge distinct content/social links.
- Truthy `Featured` is preserved if present in any duplicate.

## 7. Functional Behavior

## 7.1 Activity table

- Columns: Date, Content title, Author, Channel, Language, Social, Technology, Content type.
- Date formatting: `MMM D, YYYY` (UTC-safe formatting).
- Featured rows are visually marked.
- Content links show domain labels under title.
- Missing social links render `N/A` with a help tooltip.

## 7.2 Filters

- Multi-select filters: Topic, Content type, Channel, Author, Contributors, Language.
- Date filter supports presets (`Last 30 days`, `Last 60 days`, `This month`, `This quarter`, `Last quarter`, `This year`, `Past year`) and a custom inclusive `from`/`to` range.
- Non-custom presets are computed from the latest available activity date.
- Empty multi-select means "no restriction".
- Contributors filter supports split values from comma-separated cells.
- Filter summary shows visible count / total count.

## 7.3 Column visibility

Toggleable columns:

- Author
- Channel
- Language
- Social
- Contributor filter visibility
- Content type

Defaults:

- Visible: Social, Content type
- Hidden: Author, Channel, Language, Contributor

## 7.4 Reset behavior

Reset action:

- Clears all multi-select restrictions.
- Restores date filter to the default `Last 60 days` preset.
- Restores default column visibility.
- Reapplies filtering and chart synchronization.

## 7.5 Share-state behavior

- Current view is serialized as `{ filters, columns, activeTab }`.
- State is compressed (LZ-String Base64) and placed in `?state=...`.
- Copy to clipboard is attempted via Clipboard API with fallback.
- Legacy hash-based state is decoded if present, then cleaned from URL.

## 7.6 Insights charts

Charts always use the currently filtered dataset.

Rendered charts:

- Channel breakdown over time (stacked bar)
- Author breakdown over time (stacked bar)
- Content type (doughnut)
- Channel (doughnut)
- Top topics/technologies by author (stacked horizontal bar)
- Contributors (doughnut, title includes unique contributor count)
- Language (doughnut)

Each chart card can be expanded into a modal with a larger chart.

## 8. Caching and Offline Behavior

## 8.1 localStorage data cache

- Cache key: `esridevs_data_v1`
- On warm start, cached data is rendered immediately.
- Background network refresh checks for changes and updates table if needed.
- Toast messages indicate checking/updating/up-to-date states.

## 8.2 Service worker shell cache

- Network-first for navigation/document requests with cache fallback.
- Cache-first for same-origin static shell assets.
- opensheet API requests are excluded from service worker caching.
- Cache versioning removes stale shell caches on activate.
- In-app update prompts can trigger `SKIP_WAITING`, and the page reloads after controller handoff.

## 9. Error Handling and Resilience

- Initial data load failure shows inline loading error state.
- Background refresh failure logs error and suppresses stale toast.
- localStorage quota/corruption issues are handled defensively.
- Invalid share-state payloads are ignored safely.

## 10. Accessibility and UX Notes

- Live regions used for status and share feedback.
- Charts have sectioning and card labels; keyboard activation supported for expansion.
- Table and filters use semantic controls and labels.

## 11. Constraints and Compatibility

- Client-side only; depends on third-party CDNs and opensheet availability.
- Requires modern browser features used by dependencies and clipboard flow.
- No build step required; app runs directly from static files.

## 12. Out-of-Scope Enhancements (Future Considerations)

- Automated test suite and CI validation.
- Server-side caching, analytics, or authenticated admin tooling.
- Advanced permissions or moderation workflow for data edits.
