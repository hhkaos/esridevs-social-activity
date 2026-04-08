import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('extension settings load dropdown options from renamed and legacy publisher headers', () => {
  const optionsJs = readProjectFile('extension/options.js');

  assert.equal(
    optionsJs.includes("authors:      uniqueColumnValues(dropdownRows, ['Publisher', 'Author', 'Authors'])"),
    true,
    'Expected extension settings to populate publisher options from renamed and legacy headers',
  );
});

test('extension settings load channel owner and people involved options from renamed and legacy headers', () => {
  const optionsJs = readProjectFile('extension/options.js');

  assert.equal(
    optionsJs.includes("channels:     uniqueColumnValues(dropdownRows, ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'])"),
    true,
    'Expected extension settings to populate channel owner options from renamed and legacy headers',
  );

  assert.equal(
    optionsJs.includes("const contributorsFromDropdown = uniqueColumnValues(dropdownRows, ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'])"),
    true,
    'Expected extension settings to populate people involved options from renamed and legacy headers',
  );

  assert.equal(
    optionsJs.includes('const contributors = [...new Set([...contributorsFromDropdown, ...authorsFromSheet])].sort((a, b) =>'),
    true,
    'Expected extension settings to keep merging Authors sheet names into people involved options',
  );
});
