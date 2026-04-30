import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computePreviousRange, computeDelta } = require('../activity-utils.js');

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

// ── computePreviousRange ─────────────────────────────────────────────────────

test('computePreviousRange shifts a 30-day range to the immediately preceding 30 days', () => {
  const range = computePreviousRange({ from: '2026-04-01', to: '2026-04-30' });
  assert.deepEqual(range, { from: '2026-03-02', to: '2026-03-31' });
});

test('computePreviousRange shifts a 1-day range to the previous day', () => {
  const range = computePreviousRange({ from: '2026-05-10', to: '2026-05-10' });
  assert.deepEqual(range, { from: '2026-05-09', to: '2026-05-09' });
});

test('computePreviousRange handles month and year boundaries', () => {
  // 2026-01-01 to 2026-01-31 inclusive = 31 days. Previous: 2025-12-01 to 2025-12-31.
  const range = computePreviousRange({ from: '2026-01-01', to: '2026-01-31' });
  assert.deepEqual(range, { from: '2025-12-01', to: '2025-12-31' });
});

test('computePreviousRange handles a 90-day range', () => {
  const range = computePreviousRange({ from: '2026-02-10', to: '2026-05-10' });
  // 2026-02-10 to 2026-05-10 inclusive = 90 days. Previous: 2025-11-12 to 2026-02-09.
  assert.deepEqual(range, { from: '2025-11-12', to: '2026-02-09' });
});

test('computePreviousRange returns null for an empty or partial range', () => {
  assert.equal(computePreviousRange({ from: '', to: '' }), null);
  assert.equal(computePreviousRange({ from: '2026-04-01', to: '' }), null);
  assert.equal(computePreviousRange({ from: '', to: '2026-04-30' }), null);
  assert.equal(computePreviousRange({}), null);
  assert.equal(computePreviousRange(null), null);
});

test('computePreviousRange returns null for invalid dates', () => {
  assert.equal(computePreviousRange({ from: 'not-a-date', to: '2026-04-30' }), null);
  assert.equal(computePreviousRange({ from: '2026-13-01', to: '2026-04-30' }), null);
});

test('computePreviousRange returns null when from is after to', () => {
  assert.equal(computePreviousRange({ from: '2026-05-10', to: '2026-05-01' }), null);
});

// ── computeDelta ─────────────────────────────────────────────────────────────

test('computeDelta returns up status with positive percentage', () => {
  const delta = computeDelta(120, 100);
  assert.equal(delta.status, 'up');
  assert.equal(delta.label, '+20%');
  assert.equal(Math.round(delta.pct), 20);
});

test('computeDelta returns down status with negative percentage', () => {
  const delta = computeDelta(80, 100);
  assert.equal(delta.status, 'down');
  // The '−' prefix uses the U+2212 minus sign, matching the visual convention.
  assert.equal(delta.label, '−20%');
  assert.equal(Math.round(delta.pct), -20);
});

test('computeDelta returns flat when current equals previous', () => {
  const delta = computeDelta(100, 100);
  assert.equal(delta.status, 'flat');
  assert.equal(delta.label, '0%');
});

test('computeDelta returns flat when both are zero', () => {
  const delta = computeDelta(0, 0);
  assert.equal(delta.status, 'flat');
  assert.equal(delta.label, '0%');
});

test('computeDelta returns "new" when previous is zero and current is positive', () => {
  const delta = computeDelta(5, 0);
  assert.equal(delta.status, 'new');
  assert.equal(delta.label, 'new');
  assert.equal(delta.pct, null);
});

test('computeDelta returns "gone" when current is zero and previous was positive', () => {
  const delta = computeDelta(0, 12);
  assert.equal(delta.status, 'gone');
  assert.equal(delta.label, '−100%');
  assert.equal(delta.pct, -100);
});

test('computeDelta returns na when previous is null (no comparison data)', () => {
  const delta = computeDelta(42, null);
  assert.equal(delta.status, 'na');
  assert.equal(delta.label, '—');
  assert.equal(delta.pct, null);
});

test('computeDelta rounds small fractional differences to flat', () => {
  // 100 → 100.4 is +0.4%, which rounds to 0% (flat).
  const delta = computeDelta(100.4, 100);
  assert.equal(delta.status, 'flat');
});

// ── charts.js wiring ─────────────────────────────────────────────────────────

test('charts.js exposes window.chartsCompare with the expected helpers', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /window\.chartsCompare\s*=\s*\{/, 'expected window.chartsCompare exposure');
  assert.match(chartsJs, /getCompareMode/, 'expected getCompareMode helper');
  assert.match(chartsJs, /setCompareMode/, 'expected setCompareMode helper');
  assert.match(chartsJs, /getPreviousFilteredData/, 'expected getPreviousFilteredData helper');
  assert.match(chartsJs, /COMPARE_MODE_PREVIOUS_PERIOD/, 'expected previous-period mode constant');
});

test('charts.js getPreviousFilteredData calls activityUtils.filterActivityRows with shifted dateRange', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(
    chartsJs,
    /computePreviousRange/,
    'getPreviousRange should rely on activityUtils.computePreviousRange',
  );
  assert.match(
    chartsJs,
    /const previousFlags = \{ \.\.\.f, dateRange: previousRange \}/,
    'previous filter state should override only dateRange',
  );
});
