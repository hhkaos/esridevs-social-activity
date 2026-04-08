import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const indexHtml = readProjectFile('index.html');
const swJs = readProjectFile('sw.js');

test('shell asset version stays in sync between index.html and sw.js', () => {
  const cacheVersionMatch = swJs.match(/const CACHE_VERSION = '(v\d+)';/);
  assert.ok(cacheVersionMatch, 'Expected sw.js to define CACHE_VERSION');
  const assetVersion = cacheVersionMatch[1];

  [
    './style.css',
    './cookie-consent.js',
    './sw-update-utils.js',
    './activity-utils.js',
    './load-table.js',
    './apply-filters.js',
    './analytics.js',
    './charts.js',
    './sw.js',
  ].forEach((assetPath) => {
    assert.equal(
      indexHtml.includes(`${assetPath}?v=${assetVersion}`),
      true,
      `Expected index.html to version ${assetPath} with ${assetVersion}`,
    );
  });

  [
    './style.css',
    './activity-utils.js',
    './load-table.js',
    './apply-filters.js',
    './charts.js',
    './sw-update-utils.js',
    './cookie-consent.js',
    './analytics.js',
  ].forEach((assetPath) => {
    assert.equal(
      swJs.includes(`\`${assetPath}?v=\${SHELL_ASSET_VERSION}\``),
      true,
      `Expected sw.js shell precache to include versioned ${assetPath}`,
    );
  });

  assert.equal(
    swJs.includes("importScripts(`./sw-update-utils.js?v=${SHELL_ASSET_VERSION}`);"),
    true,
    'Expected the service worker helper import to be versioned as well',
  );
});
