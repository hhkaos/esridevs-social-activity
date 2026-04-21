import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

class FakeClassList {
  constructor() {
    this.tokens = new Set();
  }

  add(...tokens) {
    tokens.forEach((token) => this.tokens.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.tokens.delete(token));
  }

  toggle(token, force) {
    if (force === true) {
      this.tokens.add(token);
      return true;
    }
    if (force === false) {
      this.tokens.delete(token);
      return false;
    }
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      return false;
    }
    this.tokens.add(token);
    return true;
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.options = this.tagName === 'SELECT' ? [] : undefined;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.innerHTMLValue = '';
    this.className = '';
    this.classList = new FakeClassList();
    this.style = {
      setProperty() {},
    };
    this.listeners = new Map();
    this._queryMap = new Map();
  }

  set innerHTML(value) {
    this.innerHTMLValue = value;
    if (value.includes('contributors-group__grid')) {
      this._queryMap.set('.contributors-group__grid', new FakeElement('div'));
    }
    if (value.includes('contributor-card__button')) {
      this._queryMap.set('.contributor-card__button', new FakeElement('button'));
    }
    if (value.includes('contributor-card__view-contributions')) {
      this._queryMap.set('.contributor-card__view-contributions', new FakeElement('button'));
    }
  }

  get innerHTML() {
    return this.innerHTMLValue;
  }

  appendChild(child) {
    this.children.push(child);
    if (Array.isArray(this.options) && child.tagName === 'OPTION') {
      this.options.push(child);
    }
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatchEvent(event) {
    const handler = this.listeners.get(event.type);
    if (typeof handler === 'function') {
      handler(event);
      return true;
    }
    return false;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      preventDefault() {},
      stopPropagation() {},
      currentTarget: this,
      target: this,
    });
  }

  querySelector(selector) {
    return this._queryMap.get(selector) || null;
  }

  querySelectorAll() {
    return [];
  }
}

function renderContributorsWithData({ activityData, eventsData, authorsData, flags }) {
  const contributorsSelect = new FakeElement('select');
  const aliceOption = new FakeElement('option');
  aliceOption.value = 'Alice';
  aliceOption.textContent = 'Alice';
  aliceOption.selected = false;
  contributorsSelect.appendChild(aliceOption);
  const bobOption = new FakeElement('option');
  bobOption.value = 'Bob';
  bobOption.textContent = 'Bob';
  bobOption.selected = false;
  contributorsSelect.appendChild(bobOption);

  const tableTrigger = new FakeElement('button');

  const elements = new Map([
    ['#contributors-grid', new FakeElement('div')],
    ['#contributors-empty', new FakeElement('p')],
    ['#contributors-count', new FakeElement('p')],
    ['#contributor-relationship-chips', new FakeElement('div')],
    ['#contributor-team-chips', new FakeElement('div')],
    ['#tab-contributors-item', new FakeElement('li')],
    ['#tab-contributors', new FakeElement('div')],
    ['.contributors-toolbar', new FakeElement('div')],
    ['#contributors-toolbar-toggle', new FakeElement('button')],
    ['#contributors-toolbar-content', new FakeElement('div')],
    ['#tab-contributors-trigger', new FakeElement('button')],
    ['#tab-table-trigger', tableTrigger],
    ['#contributors', contributorsSelect],
  ]);

  let applyFiltersCalls = 0;

  const context = {
    console,
    URL,
    Event: class FakeEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = !!options.bubbles;
      }

      preventDefault() {}

      stopPropagation() {}
    },
    window: {
      location: { href: 'https://example.com/?contributor=true' },
      activityData,
      eventsData,
      authorsData,
      dropdownData: { relationships: [] },
      flags,
      activityUtils: {
        pickFirst(row, keys) {
          for (const key of keys) {
            const value = `${row?.[key] ?? ''}`.trim();
            if (value) return value;
          }
          return '';
        },
        OPEN_SHEET_FIELD_ALIASES: {
          peopleInvolved: ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'],
        },
      },
      getFilteredActivityRows(rows) {
        return rows;
      },
      applyFilters() {
        applyFiltersCalls += 1;
      },
      addEventListener() {},
    },
    document: {
      querySelector(selector) {
        return elements.get(selector) || null;
      },
      querySelectorAll() {
        return [];
      },
      createElement(tagName) {
        return new FakeElement(tagName);
      },
      addEventListener() {},
    },
  };

  contributorsSelect.addEventListener('change', () => {
    context.window.applyFilters();
  });

  vm.runInNewContext(readProjectFile('contributors.js'), context);
  context.window.renderContributors();
  return { elements, flags, contributorsSelect, tableTrigger, getApplyFiltersCalls: () => applyFiltersCalls };
}

test('contributors tab counts every person listed in multi-select event PoC cells', () => {
  const { elements } = renderContributorsWithData({
    activityData: [
      { Contributors: 'Alice' },
    ],
    eventsData: [
      { Date: '2026-09-09', 'Who (PoC)': 'Alice, Bob' },
    ],
    authorsData: [
      { Name: 'Alice', RelationshipWithEsri: 'Esri employee', Team: 'Maps SDKs' },
      { Name: 'Bob', RelationshipWithEsri: 'Partner' },
    ],
    flags: {
      technologies: {},
      categories: {},
      channels: {},
      authors: {},
      contributors: {},
      languages: {},
      featuredOnly: false,
      dateRange: { from: '', to: '' },
    },
  });

  const countEl = elements.get('#contributors-count');
  const gridEl = elements.get('#contributors-grid');

  assert.equal(countEl.textContent, '2 contributors shown');
  assert.equal(gridEl.children.length, 2, 'Expected one group for Alice and one for Bob');

  const renderedMarkup = gridEl.children
    .flatMap((child) => {
      const groupGrid = child.querySelector('.contributors-group__grid');
      return groupGrid ? groupGrid.children.map((card) => card.innerHTML) : [];
    })
    .join('\n');
  assert.match(renderedMarkup, /aria-label="2 contributions"/);
  assert.match(renderedMarkup, /Alice/);
  assert.match(renderedMarkup, /Bob/);
});

test('view contributions filters the activity feed to the selected person and switches tabs', () => {
  const flags = {
    technologies: {},
    categories: {},
    channels: {},
    authors: {},
    contributors: {},
    languages: {},
    featuredOnly: false,
    dateRange: { from: '', to: '' },
  };

  const {
    elements,
    contributorsSelect,
    tableTrigger,
    getApplyFiltersCalls,
  } = renderContributorsWithData({
    activityData: [
      { Contributors: 'Alice' },
    ],
    eventsData: [],
    authorsData: [
      { Name: 'Alice', RelationshipWithEsri: 'Esri employee', Team: 'Maps SDKs' },
    ],
    flags,
  });

  let tableClicks = 0;
  tableTrigger.addEventListener('click', () => {
    tableClicks += 1;
  });

  const firstGroup = elements.get('#contributors-grid').children[0];
  const firstCard = firstGroup.querySelector('.contributors-group__grid').children[0];
  const actionButton = firstCard.querySelector('.contributor-card__view-contributions');
  actionButton.click();

  assert.equal(Object.keys(flags.contributors).length, 1);
  assert.equal(flags.contributors.Alice, 1);
  assert.equal(contributorsSelect.options[0].selected, true);
  assert.equal(contributorsSelect.options[1].selected, false);
  assert.equal(getApplyFiltersCalls(), 1);
  assert.equal(tableClicks, 1);
});
