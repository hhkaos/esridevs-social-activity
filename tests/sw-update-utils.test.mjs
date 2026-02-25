import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  shouldShowUpdatePrompt,
  isNavigationRequest,
  queueCachePut,
} = require('../sw-update-utils.js');

test('shouldShowUpdatePrompt returns true only for installed worker with active controller', () => {
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installed', hasController: true }), true);
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installing', hasController: true }), false);
  assert.equal(shouldShowUpdatePrompt({ workerState: 'installed', hasController: false }), false);
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
