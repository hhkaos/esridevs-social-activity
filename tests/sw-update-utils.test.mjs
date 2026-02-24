import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  shouldShowUpdatePrompt,
  isNavigationRequest,
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
