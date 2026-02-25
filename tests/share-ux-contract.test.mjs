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
  assert.match(indexHtml, /id="col-toggle-social" checked> Share<\/label>/);
  assert.match(indexHtml, /data-col="social">Share<\/th>/);
});

test('opening a content link activates persistent share nudge behavior for the row', () => {
  assert.match(loadTableSource, /closest\('\.table-title-link'\)/);
  assert.match(loadTableSource, /share-nudge-active/);
  assert.match(loadTableSource, /Found this useful\? Help/);
  assert.match(loadTableSource, /class="share-nudge"/);
  assert.match(loadTableSource, /share-nudge__close/);
  assert.match(loadTableSource, /dismissShareNudgeForRow/);
  assert.doesNotMatch(loadTableSource, /SHARE_NUDGE_VISIBLE_MS/);
});
