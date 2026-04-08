import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const applyFiltersSource = fs.readFileSync(path.join(projectRoot, 'apply-filters.js'), 'utf8');
const activityUtilsSource = fs.readFileSync(path.join(projectRoot, 'activity-utils.js'), 'utf8');
const loadTableSource = fs.readFileSync(path.join(projectRoot, 'load-table.js'), 'utf8');

test('content title header includes accessible featured-only toggle button', () => {
  assert.match(indexHtml, /id="content-title-header"/);
  assert.match(indexHtml, /id="featured-only-toggle"/);
  assert.match(indexHtml, /aria-pressed="false"/);
  assert.match(indexHtml, /aria-label="Show featured only"/);
  assert.match(indexHtml, /title="Show featured only"/);
});

test('featuredOnly filter flag is normalized and toggled in apply-filters', () => {
  assert.match(applyFiltersSource, /featuredOnly: false/);
  assert.match(applyFiltersSource, /typeof input\.featuredOnly === 'boolean'/);
  assert.match(applyFiltersSource, /filters: flags,/);
  assert.match(applyFiltersSource, /const getFilteredActivityRows = \(rows = window\.activityData \|\| \[\]\) => \{/);
  assert.match(applyFiltersSource, /window\.activityUtils\?\.filterActivityRows/);
  assert.match(activityUtilsSource, /if \(featuredOnly && !isTruthyFlag\(pickFirst\(row, FEATURED_FIELD_ALIASES\)\)\) return false;/);
  assert.match(applyFiltersSource, /const featuredOnlyToggleBtn = document\.querySelector\('#featured-only-toggle'\);/);
  assert.match(applyFiltersSource, /featuredOnlyToggleBtn\?\.addEventListener\('click'/);
  assert.match(applyFiltersSource, /flags\.featuredOnly = false;/);
});

test('table rows expose featured dataset and inline featured star marker', () => {
  assert.match(loadTableSource, /row\.setAttribute\('data-featured', featured \? '1' : '0'\);/);
  assert.match(loadTableSource, /class="featured-row-star"/);
  assert.match(loadTableSource, /const FEATURED_FIELD_KEYS = \['Featured', 'featured', 'Featured\?', 'Featured \?', 'FEATURED'\];/);
  assert.match(loadTableSource, /const FEATURED_FIELD_CANONICALS = new Set\(/);
  assert.match(loadTableSource, /const getFeaturedCell = \(row\) => \{/);
  assert.match(loadTableSource, /FEATURED_FIELD_CANONICALS\.has\(canonicalKey\)/);
  assert.match(loadTableSource, /\['true', 'yes', 'y', '1', 'x'\]\.includes\(normalized\)/);
});
