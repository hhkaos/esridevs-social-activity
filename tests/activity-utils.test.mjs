import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  sanitizeActivityRows,
  extractSocialLinks,
  matchesSelectionMap,
  runPostRefreshUiSync,
  createRenderGate,
  validateSheetSchema,
  buildSchemaMismatchMessage,
  getFilterCollapseMeta,
} = require('../activity-utils.js');

test('sanitizeActivityRows removes blank rows with invisible characters', () => {
  const blankRow = {
    Date: '\u200B',
    Title: '\u00A0',
    Author: '\u200D',
    Contributors: '',
    Channel: '  ',
    Language: '',
    Topics_Product: '',
    Category: '--',
    URL: 'N/A',
    Linkedin: '',
    'X/Twitter': '',
    Bluesky: '',
    'EsriDevs Shared': '',
  };

  const sanitized = sanitizeActivityRows([blankRow]);
  assert.equal(sanitized.length, 0);
});

test('sanitizeActivityRows keeps meaningful rows', () => {
  const validRow = {
    Date: '2026-02-23',
    Title: 'ArcGIS Maps SDK update',
    URL: 'https://developers.arcgis.com',
    Author: 'Esri',
    Channel: 'Blog',
    Language: 'English',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([validRow]);
  assert.equal(sanitized.length, 1);
});

test('sanitizeActivityRows removes rows missing title', () => {
  const rowMissingTitle = {
    Date: '2026-02-23',
    Title: '',
    URL: 'https://developers.arcgis.com',
    Author: 'Esri',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([rowMissingTitle]);
  assert.equal(sanitized.length, 0);
});

test('sanitizeActivityRows removes rows missing URL', () => {
  const rowMissingUrl = {
    Date: '2026-02-23',
    Title: 'ArcGIS Maps SDK update',
    URL: '',
    Author: 'Esri',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([rowMissingUrl]);
  assert.equal(sanitized.length, 0);
});

test('extractSocialLinks maps EsriDevs Shared fallback to X when X/Twitter is empty', () => {
  const row = {
    'X/Twitter': '',
    'EsriDevs Shared': 'https://x.com/esri/status/123',
  };

  const socialLinks = extractSocialLinks(row);
  assert.equal(socialLinks.length, 1);
  assert.equal(socialLinks[0].platform, 'x');
});

test('matchesSelectionMap allows all values when no selections are active', () => {
  assert.equal(matchesSelectionMap({}, 'Arcade'), true);
  assert.equal(matchesSelectionMap({ Arcade: 0, StoryMaps: 0 }, 'StoryMaps'), true);
});

test('matchesSelectionMap rejects non-selected values when a filter is active', () => {
  const activeTopicFilter = { Arcade: 1, StoryMaps: 0 };
  assert.equal(matchesSelectionMap(activeTopicFilter, 'StoryMaps'), false);
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Maps SDK for JavaScript'), false);
});

test('matchesSelectionMap supports comma-delimited cells for topic matching', () => {
  const activeTopicFilter = { Arcade: 1, StoryMaps: 0 };
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Dashboards, Arcade', { splitValues: true }), true);
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Dashboards, StoryMaps', { splitValues: true }), false);
});

test('runPostRefreshUiSync executes column sync and filters hooks', () => {
  const calls = [];
  runPostRefreshUiSync({
    syncColumnVisibility: () => calls.push('sync'),
    applyFilters: () => calls.push('filter'),
  });

  assert.deepEqual(calls, ['sync', 'filter']);
});

test('runPostRefreshUiSync tolerates missing hooks', () => {
  assert.doesNotThrow(() => runPostRefreshUiSync({}));
  assert.doesNotThrow(() => runPostRefreshUiSync());
});

test('createRenderGate queues completion handlers until marked complete', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.onComplete(() => calls.push('first'));
  gate.onComplete(() => calls.push('second'));

  assert.equal(gate.isComplete(), false);
  assert.deepEqual(calls, []);

  gate.markComplete();
  assert.equal(gate.isComplete(), true);
  assert.deepEqual(calls, ['first', 'second']);
});

test('createRenderGate invokes completion handler immediately after completion', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.markComplete();
  gate.onComplete(() => calls.push('late'));

  assert.deepEqual(calls, ['late']);
});

test('createRenderGate reset requires a new completion mark', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.markComplete();
  gate.reset();
  gate.onComplete(() => calls.push('after-reset'));
  assert.deepEqual(calls, []);

  gate.markComplete();
  assert.deepEqual(calls, ['after-reset']);
});

test('getFilterCollapseMeta returns correct labels and aria-expanded value', () => {
  assert.deepEqual(getFilterCollapseMeta(true), {
    label: 'Show filters',
    ariaExpanded: 'false',
  });

  assert.deepEqual(getFilterCollapseMeta(false), {
    label: 'Hide filters',
    ariaExpanded: 'true',
  });
});

test('validateSheetSchema passes when Activity and Dropdowns contain expected aliases', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      Date: '2026-02-24',
      Title: 'Sample',
      URL: 'https://example.com',
      Author: 'A',
      Contributor: 'B',
      Channel: 'Blog',
      Language: 'English',
      Topics_Product: 'ArcGIS',
      Category: 'Article',
    }],
    dropdownRows: [{
      Technologies: 'ArcGIS',
      'Category / Content type': 'Article',
      Channel: 'Blog',
      Author: 'A',
      Contributor: 'B',
      Languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema matches aliases case-insensitively', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      date: '2026-02-24',
      title: 'Sample',
      url: 'https://example.com',
      author: 'A',
      contributor: 'B',
      channel: 'Blog',
      language: 'English',
      topics_product: 'ArcGIS',
      category: 'Article',
    }],
    dropdownRows: [{
      technologies: 'ArcGIS',
      'category / content type': 'Article',
      channel: 'Blog',
      author: 'A',
      contributor: 'B',
      languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema does not require Contributor header in Dropdowns endpoint', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      Date: '2026-02-24',
      Title: 'Sample',
      URL: 'https://example.com',
      Author: 'A',
      Contributor: 'B',
      Channel: 'Blog',
      Language: 'English',
      Topics_Product: 'ArcGIS',
      Category: 'Article',
    }],
    dropdownRows: [{
      Technologies: 'ArcGIS',
      'Category / Content type': 'Article',
      Channel: 'Blog',
      Author: 'A',
      Languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema returns mismatch details when required groups are missing', () => {
  const validation = validateSheetSchema({
    activityRows: [{ Date: '2026-02-24', Title: 'Sample', URL: 'https://example.com' }],
    dropdownRows: [{ Channel: 'Blog' }],
  });

  assert.equal(validation.isValid, false);
  assert.ok(validation.mismatches.some((entry) => entry.sheet === 'Activity'));
  assert.ok(validation.mismatches.some((entry) => entry.sheet === 'Dropdowns'));
});

test('buildSchemaMismatchMessage produces a readable contract error string', () => {
  const validation = validateSheetSchema({
    activityRows: [{ Date: '2026-02-24', Title: 'Sample', URL: 'https://example.com' }],
    dropdownRows: [{ Channel: 'Blog' }],
  });

  const message = buildSchemaMismatchMessage(validation);
  assert.equal(message.startsWith('OpenSheet schema mismatch detected.'), true);
  assert.equal(message.includes('Activity:'), true);
  assert.equal(message.includes('Dropdowns:'), true);
  assert.equal(message.includes('Found headers:'), true);
});
