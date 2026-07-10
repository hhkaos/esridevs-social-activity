import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const loadTableSource = fs.readFileSync(path.join(projectRoot, 'load-table.js'), 'utf8');

test('share column labels are rendered as Share in table and column picker', () => {
  assert.match(indexHtml, /data-col-key="social"[\s\S]*id="col-toggle-social" checked/);
  assert.match(indexHtml, /data-col="social">Share<\/th>/);
});

test('share action uses floating button and floating feedback region', () => {
  assert.match(indexHtml, /id="share-view-btn" class="share-fab"/);
  assert.match(indexHtml, /id="share-view-feedback" class="share-view-feedback share-view-feedback--floating"/);
});

test('opening a content link shows a floating share-nudge popover for the row', () => {
  assert.match(loadTableSource, /closest\('\.table-title-link'\)/);
  assert.match(loadTableSource, /share-nudge-active/);
  assert.match(loadTableSource, /Found this useful\? Help/);
  // The nudge is a floating Bootstrap popover, not an inline block, so it can
  // never push the table layout around.
  assert.match(loadTableSource, /new bootstrap\.Popover\(/);
  assert.match(loadTableSource, /customClass: 'share-nudge-popover'/);
  assert.doesNotMatch(loadTableSource, /class="share-nudge"/);
  assert.doesNotMatch(loadTableSource, /share-nudge__close/);
  assert.doesNotMatch(loadTableSource, /SHARE_NUDGE_VISIBLE_MS/);
});

test('the share-nudge popover auto-dismisses on outside click and Escape', () => {
  assert.match(loadTableSource, /const dismissShareNudge = \(\)/);
  // Outside-click dismissal keeps the popover open only for the popover itself
  // and the content links that open it.
  assert.match(loadTableSource, /target\.closest\('\.share-nudge-popover'\)/);
  assert.match(loadTableSource, /event\.key === 'Escape'/);
});
