/**
 * Contract tests for native "New" badge detection via localStorage.
 *
 * Verifies that load-table.js contains the expected implementation patterns
 * for computing and persisting "seen" item URLs without the Chrome extension.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const loadTableJs = fs.readFileSync(path.join(projectRoot, 'load-table.js'), 'utf8');

test('SEEN_URLS_KEY constant is defined', () => {
  assert.match(loadTableJs, /const SEEN_URLS_KEY = 'esridevs_seen_urls';/);
});

test('computeNativeNewItems skips when highlightedItemUrls already set by extension', () => {
  assert.match(loadTableJs, /window\.highlightedItemUrls !== null/);
});

test('computeNativeNewItems reads from SEEN_URLS_KEY localStorage', () => {
  assert.match(loadTableJs, /localStorage\.getItem\(SEEN_URLS_KEY\)/);
});

test('computeNativeNewItems returns early on first visit (null in storage)', () => {
  // Must check for null raw value and return without setting any badges.
  assert.match(loadTableJs, /if \(raw === null\)/);
});

test('computeNativeNewItems sets window.highlightedItemUrls with new URLs', () => {
  assert.match(loadTableJs, /window\.highlightedItemUrls = new Set\(newUrls\)/);
});

test('saveAllUrlsAsSeen writes to SEEN_URLS_KEY', () => {
  assert.match(loadTableJs, /localStorage\.setItem\(SEEN_URLS_KEY/);
});

test('saveAllUrlsAsSeen deduplicates URLs before saving', () => {
  assert.match(loadTableJs, /new Set\(/);
});

test('processAndRender calls computeNativeNewItems before renderTableRows', () => {
  const processAndRenderFn = loadTableJs.slice(
    loadTableJs.indexOf('async function processAndRender('),
    loadTableJs.indexOf('async function refreshTableOnly('),
  );
  const computeIdx = processAndRenderFn.indexOf('computeNativeNewItems(');
  const renderIdx = processAndRenderFn.indexOf('await renderTableRows(');
  assert.ok(computeIdx !== -1, 'computeNativeNewItems should be called inside processAndRender');
  assert.ok(renderIdx !== -1, 'renderTableRows should be called inside processAndRender');
  assert.ok(computeIdx < renderIdx, 'computeNativeNewItems must be called before renderTableRows');
});

test('processAndRender calls saveAllUrlsAsSeen after renderTableRows', () => {
  const processAndRenderFn = loadTableJs.slice(
    loadTableJs.indexOf('async function processAndRender('),
    loadTableJs.indexOf('async function refreshTableOnly('),
  );
  const saveIdx = processAndRenderFn.indexOf('saveAllUrlsAsSeen(');
  const renderIdx = processAndRenderFn.indexOf('await renderTableRows(');
  assert.ok(saveIdx !== -1, 'saveAllUrlsAsSeen should be called inside processAndRender');
  assert.ok(saveIdx > renderIdx, 'saveAllUrlsAsSeen must be called after renderTableRows');
});

test('processAndRender passes dedupedActivityRows (full set) to saveAllUrlsAsSeen', () => {
  const processAndRenderFn = loadTableJs.slice(
    loadTableJs.indexOf('async function processAndRender('),
    loadTableJs.indexOf('async function refreshTableOnly('),
  );
  assert.match(processAndRenderFn, /saveAllUrlsAsSeen\(dedupedActivityRows\)/);
});

test('processAndRender passes rowsForTable (filtered) to computeNativeNewItems', () => {
  const processAndRenderFn = loadTableJs.slice(
    loadTableJs.indexOf('async function processAndRender('),
    loadTableJs.indexOf('async function refreshTableOnly('),
  );
  assert.match(processAndRenderFn, /computeNativeNewItems\(rowsForTable\)/);
});
