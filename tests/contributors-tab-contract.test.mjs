import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('contributors tab is feature-flagged by contributor=true and has a grid shell', () => {
  const indexHtml = readProjectFile('index.html');
  const applyFiltersJs = readProjectFile('apply-filters.js');

  assert.match(indexHtml, /id="tab-contributors-item" hidden/);
  assert.match(indexHtml, /id="tab-contributors-trigger"[\s\S]*>Contributors<\/button>/);
  assert.match(indexHtml, /id="contributors-toolbar-toggle"/);
  assert.match(indexHtml, /id="contributors-toolbar-content"/);
  assert.match(indexHtml, /id="contributor-relationship-chips"/);
  assert.match(indexHtml, /id="contributor-team-chips"/);
  assert.match(indexHtml, /id="contributors-count"/);
  assert.match(indexHtml, /id="contributors-grid"/);
  assert.match(indexHtml, /src="\.\/contributors\.js\?v=/);

  assert.match(applyFiltersJs, /CONTRIBUTORS_TAB_FEATURE_ENABLED[\s\S]*searchParams\.get\('contributor'\)/);
  assert.match(applyFiltersJs, /value === 'contributors' && CONTRIBUTORS_TAB_FEATURE_ENABLED/);
  assert.match(applyFiltersJs, /window\.renderContributors\(\)/);
});

test('load-table exposes Authors sheet rows and Dropdowns relationship options to contributors view', () => {
  const loadTableJs = readProjectFile('load-table.js');

  assert.match(loadTableJs, /window\.authorsData = \[\];/);
  assert.match(loadTableJs, /AUTHOR_SHEET_NAME_KEYS = \['name', 'Name'/);
  assert.match(loadTableJs, /const RELATIONSHIP_FIELD_KEYS = \[/);
  assert.match(loadTableJs, /RelationshipWithEsri/);
  assert.match(loadTableJs, /Relantionship/);
  assert.match(loadTableJs, /relationships: uniqueColumnValues\(dropdownRows, RELATIONSHIP_FIELD_KEYS\)/);
  assert.match(loadTableJs, /window\.authorsData = Array\.isArray\(authorsRows\) \? authorsRows : \[\];/);
});

test('contributors view counts filtered people involved and supports relationship and team chips', () => {
  const contributorsJs = readProjectFile('contributors.js');
  const styleCss = readProjectFile('style.css');

  assert.match(contributorsJs, /window\.getFilteredActivityRows/);
  assert.match(contributorsJs, /countContributions/);
  assert.match(contributorsJs, /PEOPLE_INVOLVED_FIELD_KEYS/);
  assert.match(contributorsJs, /const UNKNOWN_RELATIONSHIP = 'Unknown'/);
  assert.match(contributorsJs, /ESRI_EMPLOYEE_RELATIONSHIP = 'Esri employee'/);
  assert.match(contributorsJs, /NAME_FIELD_KEYS = \['name', 'Name'/);
  assert.match(contributorsJs, /Picture/);
  assert.match(contributorsJs, /RelationshipWithEsri/);
  assert.match(contributorsJs, /Relantionship/);
  assert.match(contributorsJs, /normalizeRelationshipLabel/);
  assert.match(contributorsJs, /normalizeTeamLabel/);
  assert.match(contributorsJs, /state\.activeRelationships/);
  assert.match(contributorsJs, /state\.activeTeams/);
  assert.match(contributorsJs, /collectContactLinks/);
  assert.match(contributorsJs, /initializeToolbarCollapse/);
  assert.match(contributorsJs, /updateOpenContactMenu/);
  assert.match(contributorsJs, /event\.preventDefault\(\)/);
  assert.match(contributorsJs, /contributor-card__menu/);
  assert.match(contributorsJs, /contributor-card__tooltip/);
  assert.match(contributorsJs, /getGroupLabel/);
  assert.match(contributorsJs, /sumContributionsByGroup/);
  assert.match(contributorsJs, /countPeopleByGroup/);
  assert.match(contributorsJs, /groupContributionTotals\.get\(getGroupSortKey\(b\)\)/);
  assert.match(contributorsJs, /getReadableTextColor/);
  assert.match(contributorsJs, /getPersonGroupColor/);
  assert.match(contributorsJs, /renderGroupTitle/);
  assert.match(contributorsJs, /--group-color/);
  assert.match(contributorsJs, /--group-text-color/);
  assert.match(contributorsJs, /contributors-group__total/);
  assert.match(contributorsJs, /contributors-group__people/);
  assert.match(contributorsJs, /fa-user-group/);
  assert.match(contributorsJs, /b\.total - a\.total/);
  assert.match(contributorsJs, /contributor-card__badge/);
  assert.match(contributorsJs, /#contributors-count/);
  assert.match(contributorsJs, /people\.length === 1 \? 'contributor' : 'contributors'/);

  assert.match(styleCss, /\.contributor-card__avatar-img,\n\.contributor-card__avatar-fallback/);
  assert.match(styleCss, /border: 4px solid var\(--avatar-border-color\)/);
  assert.match(styleCss, /\.contributors-chip__swatch/);
  assert.match(styleCss, /\.contributors-chip__count/);
  assert.match(styleCss, /\.contributors-count/);
  assert.match(styleCss, /\.contributors-toolbar\.is-collapsed/);
  assert.match(styleCss, /\.contributors-toolbar__content\[hidden\]/);
  assert.match(styleCss, /\.contributors-group \{\n  display: contents;/);
  assert.match(styleCss, /\.contributors-group__grid \{\n  display: contents;/);
  assert.match(styleCss, /--group-color: #eef5ff/);
  assert.match(styleCss, /background: var\(--group-color\)/);
  assert.match(styleCss, /color: var\(--group-text-color\)/);
  assert.match(styleCss, /\.contributors-group__total/);
  assert.match(styleCss, /\.contributors-group__people/);
  assert.match(styleCss, /font-size: 0\.76rem/);
  assert.match(styleCss, /grid-template-columns: repeat\(auto-fill, minmax\(88px, 96px\)\)/);
  assert.match(styleCss, /grid-auto-rows: 112px/);
  assert.match(styleCss, /column-gap: 14px/);
  assert.match(styleCss, /row-gap: 6px/);
  assert.match(styleCss, /grid-template-rows: 72px 1\.9rem/);
  assert.match(styleCss, /\.contributor-card__menu/);
  assert.match(styleCss, /\.contributor-card__tooltip/);
});
