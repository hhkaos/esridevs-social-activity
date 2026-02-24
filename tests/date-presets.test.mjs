import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  toISODateLocal,
  parseDateToLocalDay,
  getLatestActivityDate,
  getDateRangeForPreset,
} = require('../activity-utils.js');

test('parseDateToLocalDay parses ISO dates and rejects invalid values', () => {
  const valid = parseDateToLocalDay('2026-02-24');
  assert.equal(toISODateLocal(valid), '2026-02-24');
  assert.equal(parseDateToLocalDay('2026-02-31'), null);
  assert.equal(parseDateToLocalDay('not-a-date'), null);
});

test('getLatestActivityDate returns latest parseable activity date', () => {
  const rows = [
    { Date: '2026-02-10' },
    { Date: 'invalid' },
    { Date: '2026-02-24' },
    { Date: '2026-01-20' },
  ];

  const latest = getLatestActivityDate(rows);
  assert.equal(toISODateLocal(latest), '2026-02-24');
});

test('getLatestActivityDate returns null when rows have no parseable dates', () => {
  const latest = getLatestActivityDate([{ Date: '' }, { Date: 'unknown' }]);
  assert.equal(latest, null);
});

test('getDateRangeForPreset computes last 60 days inclusively', () => {
  const anchor = new Date(2026, 4, 10);
  const range = getDateRangeForPreset('last60', anchor);
  assert.deepEqual(range, { from: '2026-03-12', to: '2026-05-10' });
});

test('getDateRangeForPreset computes month, quarter, and year boundaries', () => {
  const anchor = new Date(2026, 4, 10);

  assert.deepEqual(getDateRangeForPreset('thisMonth', anchor), {
    from: '2026-05-01',
    to: '2026-05-10',
  });

  assert.deepEqual(getDateRangeForPreset('thisQuarter', anchor), {
    from: '2026-04-01',
    to: '2026-05-10',
  });

  assert.deepEqual(getDateRangeForPreset('lastQuarter', anchor), {
    from: '2026-01-01',
    to: '2026-03-31',
  });

  assert.deepEqual(getDateRangeForPreset('thisYear', anchor), {
    from: '2026-01-01',
    to: '2026-05-10',
  });

  assert.deepEqual(getDateRangeForPreset('pastYear', anchor), {
    from: '2025-05-11',
    to: '2026-05-10',
  });
});

test('getDateRangeForPreset returns null for unsupported presets or missing anchor', () => {
  assert.equal(getDateRangeForPreset('custom', new Date(2026, 4, 10)), null);
  assert.equal(getDateRangeForPreset('last60', null), null);
});
