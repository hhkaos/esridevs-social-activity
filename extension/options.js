/**
 * options.js — Settings page for the EsriDevs Activity extension.
 *
 * Loads filter options from the opensheet API (same source as the web app),
 * reads/writes settings to chrome.storage.sync, and presents a MultiSelect
 * widget (searchable dropdown + chips) for each filter dimension.
 */

const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
const BASE_URL = `https://opensheet.elk.sh/${SPREADSHEET_ID}`;

const DEFAULT_SETTINGS = {
  refreshIntervalMinutes: 15,
  filters: {
    technologies: [],
    categories: [],
    channels: [],
    authors: [],
    contributors: [],
    languages: [],
  },
  targetBaseUrl: 'https://hhkaos.github.io/esridevs-social-activity/',
  notificationsEnabled: false,
};

// ── MultiSelect ───────────────────────────────────────────────────────────────

/**
 * Searchable multi-select widget with chips.
 *
 * Expected HTML structure (provided in options.html):
 *   <div class="ms-field" id="ms-*">
 *     <div class="ms-control">
 *       <div class="ms-chips-area">
 *         <span class="ms-placeholder">All</span>
 *         <input class="ms-input" ...>
 *       </div>
 *       <ul class="ms-dropdown" hidden ...></ul>
 *     </div>
 *   </div>
 */
class MultiSelect {
  constructor(container) {
    this._selected = new Set();
    this._options  = [];

    this._container  = container;
    this._control    = container.querySelector('.ms-control');
    this._chipsArea  = container.querySelector('.ms-chips-area');
    this._placeholder = container.querySelector('.ms-placeholder');
    this._input      = container.querySelector('.ms-input');
    this._dropdown   = container.querySelector('.ms-dropdown');

    // Open dropdown on focus / click inside the control
    this._input.addEventListener('focus', () => this._open());
    this._input.addEventListener('input', () => this._renderDropdown());
    this._control.addEventListener('click', (e) => {
      if (!e.target.closest('.ms-chip')) this._input.focus();
    });

    // Close when clicking outside or pressing Escape
    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) this._close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._close();
    });
  }

  /** Populate the list of selectable options. */
  setOptions(values) {
    this._options = values;
    this._renderDropdown();
  }

  /** Pre-select values (called when loading saved settings). */
  setSelected(values) {
    this._selected = new Set(values);
    this._renderChips();
    this._renderDropdown();
  }

  /** Return the currently selected values as an array. */
  getSelected() {
    return [...this._selected];
  }

  _open() {
    this._dropdown.hidden = false;
    this._renderDropdown();
  }

  _close() {
    this._dropdown.hidden = true;
    this._input.value = '';
  }

  _toggle(value) {
    if (this._selected.has(value)) {
      this._selected.delete(value);
    } else {
      this._selected.add(value);
    }
    this._renderChips();
    this._renderDropdown();
  }

  _filteredOptions() {
    const q = this._input.value.toLowerCase();
    return q
      ? this._options.filter((o) => o.toLowerCase().includes(q))
      : this._options;
  }

  _renderChips() {
    // Remove existing chips, keep placeholder and input intact
    this._chipsArea.querySelectorAll('.ms-chip').forEach((c) => c.remove());
    this._placeholder.hidden = this._selected.size > 0;

    for (const value of this._selected) {
      const chip = document.createElement('span');
      chip.className = 'ms-chip';
      chip.title = value;
      chip.textContent = value;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'ms-chip-remove';
      removeBtn.setAttribute('aria-label', `Remove ${value}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggle(value);
      });
      chip.appendChild(removeBtn);
      this._chipsArea.insertBefore(chip, this._input);
    }
  }

  _renderDropdown() {
    const filtered = this._filteredOptions();
    this._dropdown.innerHTML = '';

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'ms-empty';
      li.textContent = this._options.length === 0 ? 'Loading options…' : 'No matches';
      this._dropdown.appendChild(li);
      return;
    }

    for (const opt of filtered) {
      const isSel = this._selected.has(opt);
      const li = document.createElement('li');
      li.className = 'ms-option' + (isSel ? ' is-selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(isSel));

      const cb = document.createElement('span');
      cb.className = 'ms-checkbox';
      cb.textContent = isSel ? '☑' : '☐';
      li.appendChild(cb);
      li.append(` ${opt}`);

      // mousedown to prevent the input losing focus before the toggle fires
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._toggle(opt);
      });

      this._dropdown.appendChild(li);
    }
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Extract unique non-placeholder values for the first matching column alias found in rows.
 * Mirrors uniqueColumnValues() in load-table.js.
 */
function uniqueColumnValues(rows, keys) {
  const PLACEHOLDERS = new Set(['n/a', 'na', 'none', '-', '--', 'tbd']);
  const seen = new Set();
  for (const row of rows) {
    for (const key of keys) {
      const val = `${row[key] ?? ''}`.trim();
      if (val && !PLACEHOLDERS.has(val.toLowerCase())) {
        seen.add(val);
        break; // use only the first matching alias per row
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Fetch filter options from the Dropdowns and Authors sheets.
 * Mirrors buildDropdownData() in load-table.js.
 */
async function loadDropdownOptions() {
  const [dropdownRows, authorsRows] = await Promise.all([
    fetch(`${BASE_URL}/Dropdowns`).then((r) => { if (!r.ok) throw new Error('Dropdowns'); return r.json(); }),
    fetch(`${BASE_URL}/Authors`).then((r) => { if (!r.ok) throw new Error('Authors'); return r.json(); }),
  ]);

  // Authors sheet: extract first non-empty value per row (the author name)
  const authorsFromSheet = [
    ...new Set(
      authorsRows
        .map((row) => Object.values(row).map((v) => `${v ?? ''}`.trim()).find(Boolean))
        .filter(Boolean)
    ),
  ];

  const contributorsFromDropdown = uniqueColumnValues(dropdownRows, ['Contributors', 'Contributor', 'Authors']);
  const contributors = [...new Set([...contributorsFromDropdown, ...authorsFromSheet])].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    technologies: uniqueColumnValues(dropdownRows, ['Technologies', 'Technology', 'Topics_Product']),
    categories:   uniqueColumnValues(dropdownRows, ['Category / Content type', 'Category', 'Content type']),
    channels:     uniqueColumnValues(dropdownRows, ['Channel']),
    authors:      uniqueColumnValues(dropdownRows, ['Author', 'Authors']),
    contributors,
    languages:    uniqueColumnValues(dropdownRows, ['Languages', 'Language']),
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // ── Build MultiSelect instances ───────────────────────────────────────────
  const fields = {
    technologies: new MultiSelect(document.querySelector('#ms-technologies')),
    categories:   new MultiSelect(document.querySelector('#ms-categories')),
    channels:     new MultiSelect(document.querySelector('#ms-channels')),
    authors:      new MultiSelect(document.querySelector('#ms-authors')),
    contributors: new MultiSelect(document.querySelector('#ms-contributors')),
    languages:    new MultiSelect(document.querySelector('#ms-languages')),
  };

  const intervalInput   = document.querySelector('#refresh-interval');
  const urlInput        = document.querySelector('#target-url');
  const notifCheckbox   = document.querySelector('#notifications');
  const saveBtn         = document.querySelector('#save-btn');
  const resetBtn        = document.querySelector('#reset-btn');

  // ── Load stored settings ──────────────────────────────────────────────────
  const stored = await chrome.storage.sync.get([
    'filters', 'refreshIntervalMinutes', 'targetBaseUrl', 'notificationsEnabled',
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...stored };

  intervalInput.value     = settings.refreshIntervalMinutes;
  urlInput.value          = settings.targetBaseUrl;
  notifCheckbox.checked   = settings.notificationsEnabled;

  // Pre-select chips from storage (visible before options finish loading)
  for (const [key, ms] of Object.entries(fields)) {
    ms.setSelected(settings.filters?.[key] ?? []);
  }

  // ── Load dropdown options from API ────────────────────────────────────────
  try {
    const options = await loadDropdownOptions();
    for (const [key, ms] of Object.entries(fields)) {
      ms.setOptions(options[key] ?? []);
    }
  } catch {
    showStatus('Could not load filter options — check your connection. Saved selections still apply.', 'error');
  }

  // ── Notifications permission ──────────────────────────────────────────────
  // Request permission immediately when the checkbox is enabled so the user
  // gets the browser prompt right away (permission requests require a user gesture).
  notifCheckbox.addEventListener('change', async () => {
    if (notifCheckbox.checked) {
      const granted = await chrome.permissions.request({ permissions: ['notifications'] });
      if (!granted) notifCheckbox.checked = false;
    }
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;

    const filters = {};
    for (const [key, ms] of Object.entries(fields)) {
      filters[key] = ms.getSelected();
    }

    await chrome.storage.sync.set({
      filters,
      refreshIntervalMinutes: Math.max(1, Number(intervalInput.value) || DEFAULT_SETTINGS.refreshIntervalMinutes),
      targetBaseUrl: urlInput.value.trim() || DEFAULT_SETTINGS.targetBaseUrl,
      notificationsEnabled: notifCheckbox.checked,
    });

    showStatus('Settings saved.', 'ok');
    saveBtn.disabled = false;
  });

  // ── Reset to defaults ─────────────────────────────────────────────────────
  resetBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    for (const ms of Object.values(fields)) ms.setSelected([]);
    intervalInput.value   = DEFAULT_SETTINGS.refreshIntervalMinutes;
    urlInput.value        = DEFAULT_SETTINGS.targetBaseUrl;
    notifCheckbox.checked = DEFAULT_SETTINGS.notificationsEnabled;
    showStatus('Settings reset to defaults.', 'ok');
  });

  // ── Status helper ─────────────────────────────────────────────────────────
  let statusTimer;
  function showStatus(msg, type = 'ok') {
    const el = document.querySelector('#status-msg');
    clearTimeout(statusTimer);
    el.textContent  = msg;
    el.className    = `status-msg status-${type}`;
    el.hidden       = false;
    statusTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
});
