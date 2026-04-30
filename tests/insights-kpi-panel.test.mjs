import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('index.html exposes the compare-mode select and KPI panel containers', () => {
  const html = readProjectFile('index.html');
  assert.match(html, /id="insights-compare-mode"/, 'expected #insights-compare-mode select');
  assert.match(html, /value="previous-period"/, 'expected previous-period option');
  assert.match(html, /id="insights-kpis"/, 'expected #insights-kpis container');
});

test('charts.js defines the four KPI metrics expected by the design', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /id:\s*'posts'/, 'expected posts KPI');
  assert.match(chartsJs, /id:\s*'people'/, 'expected people KPI');
  assert.match(chartsJs, /id:\s*'channels'/, 'expected channels KPI');
  assert.match(chartsJs, /id:\s*'topics'/, 'expected topics KPI');
});

test('charts.js renderKpiCards reads compare mode and previous filtered data', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /renderKpiCards\(data, previousData, compareMode\)/);
  assert.match(chartsJs, /getPreviousFilteredData\(\)/);
});

test('charts.js sparklines are tracked so they are destroyed on rerender', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /destroySparklines/, 'expected destroySparklines helper');
  assert.match(chartsJs, /sparklineInstances\.push\(sparkChart\)/, 'expected sparkline tracking');
});

test('compare-mode select change triggers renderCharts via persisted setCompareMode', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /initializeCompareModeControl/, 'expected init helper');
  assert.match(chartsJs, /setCompareMode\(select\.value\)/, 'expected persisted write on change');
  assert.match(chartsJs, /window\.renderCharts\(\)/, 'expected re-render after change');
});

test('KPI cards render absolute previous-period value alongside delta', () => {
  const chartsJs = readProjectFile('charts.js');
  assert.match(chartsJs, /insights-kpi__previous/, 'expected previous-value element class');
  assert.match(chartsJs, /Previous:\s*\$\{previousText\}/, 'expected "Previous:" label with computed value');
  assert.match(chartsJs, /typeof previousValue === 'number'\s*\?\s*previousValue\.toLocaleString\(\)/,
    'expected previous absolute value formatted via toLocaleString when available');
  const css = readProjectFile('style.css');
  assert.match(css, /\.insights-kpi__previous\s*\{/, 'expected .insights-kpi__previous style rule');
});
