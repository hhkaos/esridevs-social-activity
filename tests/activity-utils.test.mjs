import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  sanitizeActivityRows,
  extractSocialLinks,
  matchesSelectionMap,
  runPostRefreshUiSync,
  createRenderGate,
  validateSheetSchema,
  buildSchemaMismatchMessage,
  getFilterCollapseMeta,
  buildValueDefinitionMap,
  resolveValueDefinition,
} = require('../activity-utils.js');

test('sanitizeActivityRows removes blank rows with invisible characters', () => {
  const blankRow = {
    Date: '\u200B',
    Title: '\u00A0',
    Author: '\u200D',
    Contributors: '',
    Channel: '  ',
    Language: '',
    Topics_Product: '',
    Category: '--',
    URL: 'N/A',
    Linkedin: '',
    'X/Twitter': '',
    Bluesky: '',
    'EsriDevs Shared': '',
  };

  const sanitized = sanitizeActivityRows([blankRow]);
  assert.equal(sanitized.length, 0);
});

test('sanitizeActivityRows keeps meaningful rows', () => {
  const validRow = {
    Date: '2026-02-23',
    Title: 'ArcGIS Maps SDK update',
    URL: 'https://developers.arcgis.com',
    Author: 'Esri',
    Channel: 'Blog',
    Language: 'English',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([validRow]);
  assert.equal(sanitized.length, 1);
});

test('sanitizeActivityRows removes rows missing title', () => {
  const rowMissingTitle = {
    Date: '2026-02-23',
    Title: '',
    URL: 'https://developers.arcgis.com',
    Author: 'Esri',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([rowMissingTitle]);
  assert.equal(sanitized.length, 0);
});

test('sanitizeActivityRows removes rows missing URL', () => {
  const rowMissingUrl = {
    Date: '2026-02-23',
    Title: 'ArcGIS Maps SDK update',
    URL: '',
    Author: 'Esri',
    Category: 'Article',
  };

  const sanitized = sanitizeActivityRows([rowMissingUrl]);
  assert.equal(sanitized.length, 0);
});

test('extractSocialLinks maps EsriDevs Shared fallback to X when X/Twitter is empty', () => {
  const row = {
    Title: 'ArcGIS Maps SDK update',
    URL: 'https://developers.arcgis.com/javascript/latest/',
    'X/Twitter': '',
    'EsriDevs Shared': 'https://x.com/esri/status/123',
  };

  const socialLinks = extractSocialLinks(row);
  const xLink = socialLinks.find((link) => link.platform === 'x');
  assert.equal(xLink?.targets?.length, 1);
  assert.equal(xLink?.targets?.[0]?.url, 'https://x.com/esri/status/123');
  assert.ok(socialLinks.some((link) => link.platform === 'linkedin' && link.targets?.[0]?.title === 'Share on LinkedIn'));
  assert.ok(socialLinks.some((link) => link.platform === 'bluesky' && link.targets?.[0]?.title === 'Share on Bluesky'));
});

test('extractSocialLinks adds share-intent links for missing LinkedIn, X, and Bluesky', () => {
  const row = {
    Title: 'ArcGIS Online tips',
    URL: 'https://developers.arcgis.com',
  };

  const socialLinks = extractSocialLinks(row);
  assert.equal(socialLinks.length, 3);

  const linkedInShare = socialLinks.find((link) => link.platform === 'linkedin');
  assert.equal(linkedInShare?.targets?.length, 1);
  assert.equal(linkedInShare?.targets?.[0]?.title, 'Share on LinkedIn');
  assert.equal(
    linkedInShare?.targets?.[0]?.url,
    'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fdevelopers.arcgis.com',
  );

  const xShare = socialLinks.find((link) => link.platform === 'x');
  assert.equal(xShare?.targets?.[0]?.title, 'Share on X/Twitter');
  assert.equal(
    xShare?.targets?.[0]?.url,
    'https://twitter.com/intent/tweet?text=ArcGIS%20Online%20tips%20https%3A%2F%2Fdevelopers.arcgis.com',
  );

  const blueskyShare = socialLinks.find((link) => link.platform === 'bluesky');
  assert.equal(blueskyShare?.targets?.[0]?.title, 'Share on Bluesky');
  assert.equal(
    blueskyShare?.targets?.[0]?.url,
    'https://bsky.app/intent/compose?text=ArcGIS%20Online%20tips%20https%3A%2F%2Fdevelopers.arcgis.com',
  );
});

test('extractSocialLinks preserves provided links and only falls back for missing platforms', () => {
  const row = {
    Title: 'Scene Viewer update',
    URL: 'https://www.esri.com',
    LinkedIn: 'https://www.linkedin.com/feed/update/urn:li:activity:111',
    Bluesky: 'https://bsky.app/profile/esri.com/post/3kxyz',
  };

  const socialLinks = extractSocialLinks(row);

  assert.ok(socialLinks.some((link) => link.platform === 'linkedin' && link.targets?.[0]?.title === 'Open LinkedIn post'));
  assert.ok(socialLinks.some((link) => link.platform === 'bluesky' && link.targets?.[0]?.title === 'Open Bluesky post'));
  assert.ok(socialLinks.some((link) => link.platform === 'x' && link.targets?.[0]?.title === 'Share on X/Twitter'));
});

test('extractSocialLinks always returns exactly LinkedIn, X, and Bluesky icons', () => {
  const row = {
    Title: 'Arcade Tips',
    URL: 'https://developers.arcgis.com/arcade/',
    LinkedIn: 'https://www.linkedin.com/feed/update/urn:li:activity:222',
    'X/Twitter': 'https://x.com/esri/status/456',
    Bluesky: '',
    'EsriDevs Shared': 'https://x.com/esri/status/789',
  };

  const socialLinks = extractSocialLinks(row);
  assert.equal(socialLinks.length, 3);
  assert.deepEqual(socialLinks.map((link) => link.platform), ['linkedin', 'x', 'bluesky']);
  assert.equal(socialLinks[1].targets?.length, 2);
  assert.equal(socialLinks[1].targets?.[0]?.url, 'https://x.com/esri/status/456');
  assert.equal(socialLinks[1].targets?.[1]?.url, 'https://x.com/esri/status/789');
  assert.equal(socialLinks[2].targets?.[0]?.title, 'Share on Bluesky');
});

test('extractSocialLinks keeps two X targets when X/Twitter and EsriDevs Shared are both set to the same URL', () => {
  const row = {
    Title: 'Calcite Design System: Latest Updates in Version 5.0',
    URL: 'https://www.youtube.com/watch?v=b0ru4oRR3qE',
    'X/Twitter': 'https://x.com/EsriDevs/status/2025911074147426341',
    'EsriDevs\nShared': 'https://x.com/EsriDevs/status/2025911074147426341',
  };

  const socialLinks = extractSocialLinks(row);
  const xLink = socialLinks.find((link) => link.platform === 'x');

  assert.equal(xLink?.targets?.length, 2);
  assert.equal(xLink?.targets?.[0]?.label, 'Community post');
  assert.equal(xLink?.targets?.[1]?.label, 'EsriDevs shared');
});

test('extractSocialLinks reads EsriDevs Shared when OpenSheet key contains a newline', () => {
  const row = {
    Title: 'Calcite update',
    URL: 'https://developers.arcgis.com/calcite-design-system/',
    'X/Twitter': '',
    'EsriDevs\nShared': 'https://x.com/EsriDevs/status/2025911074147426341',
  };

  const socialLinks = extractSocialLinks(row);
  const xLink = socialLinks.find((link) => link.platform === 'x');
  assert.equal(xLink?.targets?.[0]?.url, 'https://x.com/EsriDevs/status/2025911074147426341');
});

test('matchesSelectionMap allows all values when no selections are active', () => {
  assert.equal(matchesSelectionMap({}, 'Arcade'), true);
  assert.equal(matchesSelectionMap({ Arcade: 0, StoryMaps: 0 }, 'StoryMaps'), true);
});

test('matchesSelectionMap rejects non-selected values when a filter is active', () => {
  const activeTopicFilter = { Arcade: 1, StoryMaps: 0 };
  assert.equal(matchesSelectionMap(activeTopicFilter, 'StoryMaps'), false);
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Maps SDK for JavaScript'), false);
});

test('matchesSelectionMap supports comma-delimited cells for topic matching', () => {
  const activeTopicFilter = { Arcade: 1, StoryMaps: 0 };
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Dashboards, Arcade', { splitValues: true }), true);
  assert.equal(matchesSelectionMap(activeTopicFilter, 'ArcGIS Dashboards, StoryMaps', { splitValues: true }), false);
});

test('runPostRefreshUiSync executes column sync and filters hooks', () => {
  const calls = [];
  runPostRefreshUiSync({
    syncColumnVisibility: () => calls.push('sync'),
    applyFilters: () => calls.push('filter'),
  });

  assert.deepEqual(calls, ['sync', 'filter']);
});

test('runPostRefreshUiSync tolerates missing hooks', () => {
  assert.doesNotThrow(() => runPostRefreshUiSync({}));
  assert.doesNotThrow(() => runPostRefreshUiSync());
});

test('createRenderGate queues completion handlers until marked complete', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.onComplete(() => calls.push('first'));
  gate.onComplete(() => calls.push('second'));

  assert.equal(gate.isComplete(), false);
  assert.deepEqual(calls, []);

  gate.markComplete();
  assert.equal(gate.isComplete(), true);
  assert.deepEqual(calls, ['first', 'second']);
});

test('createRenderGate invokes completion handler immediately after completion', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.markComplete();
  gate.onComplete(() => calls.push('late'));

  assert.deepEqual(calls, ['late']);
});

test('createRenderGate reset requires a new completion mark', () => {
  const gate = createRenderGate();
  const calls = [];

  gate.markComplete();
  gate.reset();
  gate.onComplete(() => calls.push('after-reset'));
  assert.deepEqual(calls, []);

  gate.markComplete();
  assert.deepEqual(calls, ['after-reset']);
});

test('getFilterCollapseMeta returns correct labels and aria-expanded value', () => {
  assert.deepEqual(getFilterCollapseMeta(true), {
    label: 'Show filters',
    ariaExpanded: 'false',
  });

  assert.deepEqual(getFilterCollapseMeta(false), {
    label: 'Hide filters',
    ariaExpanded: 'true',
  });
});

test('validateSheetSchema passes when Activity and Dropdowns contain expected aliases', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      Date: '2026-02-24',
      Title: 'Sample',
      URL: 'https://example.com',
      Author: 'A',
      Contributor: 'B',
      Channel: 'Blog',
      Language: 'English',
      Topics_Product: 'ArcGIS',
      Category: 'Article',
    }],
    dropdownRows: [{
      Technologies: 'ArcGIS',
      'Category / Content type': 'Article',
      Channel: 'Blog',
      Author: 'A',
      Contributor: 'B',
      Languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema matches aliases case-insensitively', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      date: '2026-02-24',
      title: 'Sample',
      url: 'https://example.com',
      author: 'A',
      contributor: 'B',
      channel: 'Blog',
      language: 'English',
      topics_product: 'ArcGIS',
      category: 'Article',
    }],
    dropdownRows: [{
      technologies: 'ArcGIS',
      'category / content type': 'Article',
      channel: 'Blog',
      author: 'A',
      contributor: 'B',
      languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema does not require Contributor header in Dropdowns endpoint', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      Date: '2026-02-24',
      Title: 'Sample',
      URL: 'https://example.com',
      Author: 'A',
      Contributor: 'B',
      Channel: 'Blog',
      Language: 'English',
      Topics_Product: 'ArcGIS',
      Category: 'Article',
    }],
    dropdownRows: [{
      Technologies: 'ArcGIS',
      'Category / Content type': 'Article',
      Channel: 'Blog',
      Author: 'A',
      Languages: 'English',
    }],
  });

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.mismatches, []);
});

test('validateSheetSchema returns mismatch details when required groups are missing', () => {
  const validation = validateSheetSchema({
    activityRows: [{ Date: '2026-02-24', Title: 'Sample', URL: 'https://example.com' }],
    dropdownRows: [{ Channel: 'Blog' }],
  });

  assert.equal(validation.isValid, false);
  assert.ok(validation.mismatches.some((entry) => entry.sheet === 'Activity'));
  assert.ok(validation.mismatches.some((entry) => entry.sheet === 'Dropdowns'));
});

test('validateSheetSchema flags Activity title header when neither Title nor Content title exists', () => {
  const validation = validateSheetSchema({
    activityRows: [{
      Date: '2026-02-24',
      Headline: 'Renamed title header',
      URL: 'https://example.com',
      Author: 'A',
      Contributor: 'B',
      Channel: 'Blog',
      Language: 'English',
      Topics_Product: 'ArcGIS',
      Category: 'Article',
    }],
    dropdownRows: [{
      Technologies: 'ArcGIS',
      'Category / Content type': 'Article',
      Channel: 'Blog',
      Author: 'A',
      Languages: 'English',
    }],
  });

  assert.equal(validation.isValid, false);
  const activityMismatch = validation.mismatches.find((entry) => entry.sheet === 'Activity');
  assert.ok(activityMismatch);
  assert.ok(activityMismatch.missing.some((group) => group.groupName === 'Title'));
});

test('buildSchemaMismatchMessage produces a readable contract error string', () => {
  const validation = validateSheetSchema({
    activityRows: [{ Date: '2026-02-24', Title: 'Sample', URL: 'https://example.com' }],
    dropdownRows: [{ Channel: 'Blog' }],
  });

  const message = buildSchemaMismatchMessage(validation);
  assert.equal(message.startsWith('OpenSheet schema mismatch detected.'), true);
  assert.equal(message.includes('Activity:'), true);
  assert.equal(message.includes('Dropdowns:'), true);
  assert.equal(message.includes('Found headers:'), true);
});

test('buildValueDefinitionMap builds case-insensitive first-win map from dropdown rows', () => {
  const definitions = buildValueDefinitionMap({
    rows: [
      { Channel: 'Esri', Channel_value_definition: 'Official Esri channels' },
      { Channel: 'esri', Channel_value_definition: 'Should be ignored duplicate' },
      { Channel: 'Community', Channel_value_definition: 'Community-managed channels' },
      { Channel: '', Channel_value_definition: 'Ignored because value is blank' },
      { Channel: 'Distributor', Channel_value_definition: '' },
    ],
    valueKeys: ['Channel'],
    definitionKeys: ['Channel_value_definition'],
  });

  assert.deepEqual(definitions, {
    esri: 'Official Esri channels',
    community: 'Community-managed channels',
  });
});

test('resolveValueDefinition looks up values case-insensitively', () => {
  const definitions = {
    esri: 'Official Esri channels',
  };

  assert.equal(resolveValueDefinition(definitions, 'ESRI'), 'Official Esri channels');
  assert.equal(resolveValueDefinition(definitions, 'Unknown value'), '');
});
