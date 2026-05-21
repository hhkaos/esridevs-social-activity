import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'extension/manifest.json'), 'utf8'),
);

// The "tabs" permission triggers Chrome's "Read your browsing history" install
// warning. The extension only calls chrome.tabs.create({ url }), which works
// without the permission — so it must never be declared.
test('manifest does not request the "tabs" permission', () => {
  assert.equal(
    (manifest.permissions ?? []).includes('tabs'),
    false,
    'The "tabs" permission causes a "Read your browsing history" warning and is not needed for chrome.tabs.create',
  );
});

// host_permissions triggers Chrome's "Read and change your data on <host>"
// install warning. opensheet.elk.sh serves Access-Control-Allow-Origin: *, so
// fetches succeed via plain CORS without any host permission.
test('manifest declares no host_permissions', () => {
  assert.equal(
    Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0,
    false,
    'host_permissions causes a "Read and change your data" warning; opensheet is CORS-enabled so it is not needed',
  );
});

// Only warning-free permissions should be requested up front. "storage" and
// "alarms" show no install warning; "notifications" stays optional so its
// prompt only appears if the user enables it.
test('manifest requests only warning-free permissions up front', () => {
  assert.deepEqual(
    [...(manifest.permissions ?? [])].sort(),
    ['alarms', 'storage'],
    'Up-front permissions must stay limited to "storage" and "alarms"',
  );
  assert.deepEqual(
    manifest.optional_permissions ?? [],
    ['notifications'],
    '"notifications" must remain an optional permission',
  );
});
