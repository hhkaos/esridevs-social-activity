import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('Subscribe dropdown surfaces an "Install instructions" trigger that opens the modal', () => {
  const indexHtml = readProjectFile('index.html');

  assert.doesNotMatch(
    indexHtml,
    /Manual install required — not yet on extension stores\./,
    'Expected legacy "Manual install required" caption to be replaced',
  );

  assert.match(
    indexHtml,
    /data-bs-toggle="modal"\s+data-bs-target="#install-instructions-modal"[\s\S]*?Install instructions/,
    'Expected an "Install instructions" trigger that targets the install instructions modal',
  );
});

test('Install instructions modal renders written steps and embeds the walkthrough video', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(
    indexHtml,
    /id="install-instructions-modal"/,
    'Expected install-instructions-modal element to exist',
  );

  assert.match(
    indexHtml,
    /<ol class="install-instructions-steps">/,
    'Expected modal to contain an ordered list of install steps',
  );

  assert.match(
    indexHtml,
    /chrome:\/\/extensions/,
    'Expected modal to reference the chrome://extensions page',
  );

  assert.match(
    indexHtml,
    /Load unpacked/,
    'Expected modal to mention the Load unpacked action',
  );

  assert.match(
    indexHtml,
    /<iframe[^>]*\bsrc="https:\/\/www\.youtube\.com\/embed\/slfAHeByFFs\?start=754&enablejsapi=1"/,
    'Expected modal to embed the YouTube walkthrough at the 754s mark with enablejsapi=1',
  );
});

test('Closing the install instructions modal pauses the embedded video', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(
    indexHtml,
    /id="install-instructions-video"/,
    'Expected the install instructions iframe to expose a stable id',
  );

  assert.match(
    indexHtml,
    /hidden\.bs\.modal[\s\S]*postMessage\([\s\S]*pauseVideo/,
    'Expected a hidden.bs.modal handler to postMessage pauseVideo to the iframe',
  );
});
