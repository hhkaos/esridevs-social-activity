import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  sanitizeActivityRows,
  extractSocialLinks,
  runPostRefreshUiSync,
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
