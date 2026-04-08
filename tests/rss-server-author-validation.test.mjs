import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRSS, DEFAULT_FEED_DESCRIPTION } from '../rss-server/server.js';

test('buildRSS writes publisher names to dc:creator instead of author email field', () => {
  const xml = buildRSS([
    {
      Title: 'RSS validation fix',
      URL: 'https://example.com/post',
      Date: '2026-04-08',
      Publisher: 'Distributor',
      Category: 'Article',
    },
  ], {
    feedTitle: 'Esri Developers Activity',
    feedDescription: DEFAULT_FEED_DESCRIPTION,
    feedLink: 'https://example.com/',
    selfUrl: 'https://example.com/feed.xml',
  });

  assert.match(xml, /xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/);
  assert.match(xml, /<dc:creator>Distributor<\/dc:creator>/);
  assert.doesNotMatch(xml, /<author>Distributor<\/author>/);
});

test('default RSS description matches the curated ArcGIS sharing message', () => {
  assert.equal(
    DEFAULT_FEED_DESCRIPTION,
    'Track curated ArcGIS developer content and share useful resources with your network to thank the people involved.',
  );
});
