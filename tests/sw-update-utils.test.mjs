import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  shouldShowUpdatePrompt,
  shouldReloadOnControllerChange,
  isNavigationRequest,
  queueCachePut,
} = require('../sw-update-utils.js');

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('shouldShowUpdatePrompt returns true only for installed worker with active controller', () => {
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installed', hasController: true }), true);
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installing', hasController: true }), false);
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installed', hasController: false }), false);
});

test('shouldReloadOnControllerChange skips the first-ever activation', () => {
  // Regression: first visit installs the worker, it claims the page, and the
  // resulting controllerchange reloaded a URL from which `?state=` had already
  // been stripped — silently dropping the filters of a shared view link.
  assert.equal(shouldReloadOnControllerChange({
    hadControllerAtStartup: false,
    didRequestReload: false,
  }), false);

  assert.equal(shouldReloadOnControllerChange({
    hadControllerAtStartup: true,
    didRequestReload: false,
  }), true);

  assert.equal(shouldReloadOnControllerChange({
    hadControllerAtStartup: true,
    didRequestReload: true,
  }), false);
});

test('index.html gates the controllerchange reload behind shouldReloadOnControllerChange', () => {
  const indexHtml = readProjectFile('index.html');
  assert.match(indexHtml, /hadControllerAtStartup = !!navigator\.serviceWorker\.controller/);
  assert.match(
    indexHtml,
    /addEventListener\('controllerchange'[\s\S]{0,220}shouldReloadOnControllerChange\(\{ hadControllerAtStartup, didRequestReload \}\)/,
  );
});

test('sw.js does not skipWaiting on install so updates wait for the user', () => {
  const swJs = readProjectFile('sw.js');
  const installHandler = swJs.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.ok(installHandler, 'Expected sw.js to register an install handler');
  assert.equal(installHandler.includes('skipWaiting'), false);
  assert.match(swJs, /event\.data\?\.type === 'SKIP_WAITING'[\s\S]{0,60}self\.skipWaiting\(\)/);
});

test('isNavigationRequest detects navigation by mode or destination', () => {
  assert.equal(isNavigationRequest({ mode: 'navigate', destination: '' }), true);
  assert.equal(isNavigationRequest({ mode: 'cors', destination: 'document' }), true);
  assert.equal(isNavigationRequest({ mode: 'cors', destination: 'script' }), false);
  assert.equal(isNavigationRequest({ mode: 'same-origin', destination: 'style' }), false);
});

test('queueCachePut returns false when response clone fails', () => {
  const result = queueCachePut({
    cacheName: 'cache-name',
    request: { url: 'https://example.test/app.js' },
    response: {
      ok: true,
      clone() {
        throw new TypeError('Response body is already used');
      },
    },
    cachesApi: {
      open() {
        throw new Error('should not be called when clone fails');
      },
    },
  });

  assert.equal(result, false);
});

test('queueCachePut writes cloned response and wires waitUntil when available', async () => {
  let waitUntilPromise = null;
  let openedCacheName = '';
  let putArgs = null;

  const result = queueCachePut({
    event: {
      waitUntil(promise) {
        waitUntilPromise = promise;
      },
    },
    cacheName: 'cache-name',
    request: { url: 'https://example.test/app.js' },
    response: {
      ok: true,
      clone() {
        return { cloned: true };
      },
    },
    cachesApi: {
      async open(name) {
        openedCacheName = name;
        return {
          async put(request, response) {
            putArgs = { request, response };
          },
        };
      },
    },
  });

  assert.equal(result, true);
  assert.equal(openedCacheName, 'cache-name');
  assert.ok(waitUntilPromise && typeof waitUntilPromise.then === 'function');
  await waitUntilPromise;
  assert.deepEqual(putArgs, {
    request: { url: 'https://example.test/app.js' },
    response: { cloned: true },
  });
});
