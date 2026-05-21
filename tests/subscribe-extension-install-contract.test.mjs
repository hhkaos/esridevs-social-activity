import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isChromeWebStoreBrowser } = require('../browser-detect.js');

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const CHROME_WEBSTORE_URL =
  'https://chromewebstore.google.com/detail/esri-developer-content-tr/npcmemlmaclhlkdhjjnojbofnkmboklk';

// ── Detection logic: navigator.userAgent fallback ────────────────────────────

test('isChromeWebStoreBrowser detects desktop Chrome from the UA string', () => {
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  assert.equal(isChromeWebStoreBrowser({ userAgent: chromeWin }), true);
  assert.equal(isChromeWebStoreBrowser({ userAgent: chromeMac }), true);
});

test('isChromeWebStoreBrowser treats Brave (reports as plain Chrome) as Chrome', () => {
  // Brave does not change the UA string — and it installs from the CWS natively.
  const brave = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert.equal(isChromeWebStoreBrowser({ userAgent: brave }), true);
});

test('isChromeWebStoreBrowser excludes Edge and Opera', () => {
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
  const opera = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';

  assert.equal(isChromeWebStoreBrowser({ userAgent: edge }), false);
  assert.equal(isChromeWebStoreBrowser({ userAgent: opera }), false);
});

test('isChromeWebStoreBrowser excludes non-Chromium browsers', () => {
  const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) '
    + 'Gecko/20100101 Firefox/121.0';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
    + '(KHTML, like Gecko) Version/17.2 Safari/605.1.15';

  assert.equal(isChromeWebStoreBrowser({ userAgent: firefox }), false);
  assert.equal(isChromeWebStoreBrowser({ userAgent: safari }), false);
});

test('isChromeWebStoreBrowser excludes mobile browsers (no extension support)', () => {
  const androidChrome = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) '
    + 'AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
  const samsung = 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';

  assert.equal(isChromeWebStoreBrowser({ userAgent: androidChrome }), false);
  assert.equal(isChromeWebStoreBrowser({ userAgent: iosChrome }), false);
  assert.equal(isChromeWebStoreBrowser({ userAgent: samsung }), false);
});

test('isChromeWebStoreBrowser returns false when nothing identifies the browser', () => {
  assert.equal(isChromeWebStoreBrowser({}), false);
  assert.equal(isChromeWebStoreBrowser({ userAgent: '' }), false);
});

// ── Detection logic: navigator.userAgentData (User-Agent Client Hints) ───────

test('isChromeWebStoreBrowser detects Chrome from userAgentData brands', () => {
  const nav = {
    userAgent: 'irrelevant',
    userAgentData: {
      mobile: false,
      brands: [
        { brand: 'Not_A Brand', version: '8' },
        { brand: 'Chromium', version: '120' },
        { brand: 'Google Chrome', version: '120' },
      ],
    },
  };
  assert.equal(isChromeWebStoreBrowser(nav), true);
});

test('isChromeWebStoreBrowser excludes Edge via userAgentData brands', () => {
  const nav = {
    userAgentData: {
      mobile: false,
      brands: [
        { brand: 'Not_A Brand', version: '8' },
        { brand: 'Chromium', version: '120' },
        { brand: 'Microsoft Edge', version: '120' },
      ],
    },
  };
  assert.equal(isChromeWebStoreBrowser(nav), false);
});

test('isChromeWebStoreBrowser excludes mobile via the userAgentData mobile flag', () => {
  const nav = {
    userAgentData: {
      mobile: true,
      brands: [
        { brand: 'Chromium', version: '120' },
        { brand: 'Google Chrome', version: '120' },
      ],
    },
  };
  assert.equal(isChromeWebStoreBrowser(nav), false);
});

// ── UI contract: subscribe dropdown ──────────────────────────────────────────

test('Subscribe dropdown ships a hidden Chrome Web Store CTA the detection can reveal', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(
    indexHtml,
    /<a[^>]*id="chrome-webstore-btn"[^>]*>/,
    'Expected a #chrome-webstore-btn anchor in the subscribe dropdown',
  );

  const ctaMatch = indexHtml.match(/<a[^>]*id="chrome-webstore-btn"[^>]*>/);
  assert.ok(ctaMatch, 'Expected the Chrome Web Store CTA anchor to exist');
  const ctaTag = ctaMatch[0];

  assert.ok(ctaTag.includes(CHROME_WEBSTORE_URL), 'CTA must link to the published Chrome Web Store listing');
  assert.ok(/\bhidden\b/.test(ctaTag), 'CTA must be hidden by default (revealed only on Chrome)');
  assert.ok(ctaTag.includes('target="_blank"'), 'CTA must open the store in a new tab');
  assert.ok(ctaTag.includes('rel="noopener noreferrer"'), 'CTA must use rel="noopener noreferrer"');
});

test('Install instructions trigger keeps its modal wiring alongside the Chrome CTA', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(
    indexHtml,
    /id="install-instructions-btn"[^>]*data-bs-toggle="modal"[^>]*data-bs-target="#install-instructions-modal"/,
    'Expected the install-instructions button to still open the modal',
  );
});

// ── UI contract: install instructions modal ──────────────────────────────────

test('Install instructions modal promotes the Chrome Web Store and drops the stale "not published" copy', () => {
  const indexHtml = readProjectFile('index.html');

  assert.doesNotMatch(
    indexHtml,
    /not yet published to the Chrome Web Store/,
    'Expected the obsolete "not yet published" caption to be removed',
  );

  assert.match(
    indexHtml,
    /class="install-cws-callout"/,
    'Expected the modal to contain a Chrome Web Store callout',
  );

  const callout = indexHtml.match(/<div class="install-cws-callout">[\s\S]*?<\/div>/);
  assert.ok(callout, 'Expected the install-cws-callout block to exist');
  assert.ok(
    callout[0].includes(CHROME_WEBSTORE_URL),
    'Expected the modal callout to link to the Chrome Web Store listing',
  );
});

// ── Wiring contract: detection module loads and drives the CTA ───────────────

test('browser-detect.js loads before apply-filters.js and is precached by the service worker', () => {
  const indexHtml = readProjectFile('index.html');
  const swJs = readProjectFile('sw.js');

  const detectIdx = indexHtml.indexOf('browser-detect.js');
  const applyIdx = indexHtml.indexOf('apply-filters.js');
  assert.ok(detectIdx !== -1, 'Expected index.html to load browser-detect.js');
  assert.ok(
    detectIdx < applyIdx,
    'Expected browser-detect.js to load before apply-filters.js so window.browserDetect exists',
  );

  assert.match(
    swJs,
    /browser-detect\.js\?v=\$\{SHELL_ASSET_VERSION\}/,
    'Expected sw.js to precache the versioned browser-detect.js',
  );
});

test('apply-filters.js reveals the Chrome CTA only for Chrome Web Store browsers', () => {
  const applyFilters = readProjectFile('apply-filters.js');

  assert.match(
    applyFilters,
    /isChromeWebStoreBrowser/,
    'Expected apply-filters.js to call the detection helper',
  );
  assert.match(
    applyFilters,
    /chrome-webstore-btn/,
    'Expected apply-filters.js to reference the Chrome Web Store CTA element',
  );
});
