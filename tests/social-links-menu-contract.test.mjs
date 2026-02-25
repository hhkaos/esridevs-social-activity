import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadTableSource = fs.readFileSync(path.join(__dirname, '..', 'load-table.js'), 'utf8');

test('social links render a dropdown menu when multiple targets exist', () => {
  assert.match(loadTableSource, /safeTargets\.length === 1/);
  assert.match(loadTableSource, /data-bs-toggle="dropdown"/);
  assert.match(loadTableSource, /social-link__count/);
  assert.match(loadTableSource, /social-link-menu/);
  assert.match(loadTableSource, /dropdown-item/);
});
