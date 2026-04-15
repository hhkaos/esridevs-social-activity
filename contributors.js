(function () {
  const FEATURE_PARAM = 'contributor';
  const ESRI_EMPLOYEE_RELATIONSHIP = 'Esri employee';
  const UNKNOWN_RELATIONSHIP = 'Unknown';
  const UNKNOWN_TEAM = 'Unassigned team';
  const COLOR_PALETTE = [
    '#007AC2',
    '#F05C28',
    '#5CB85C',
    '#9B59B6',
    '#FFB300',
    '#1ABC9C',
    '#E74C3C',
    '#56A0D3',
    '#6B7280',
    '#8E44AD',
    '#0F766E',
    '#B45309',
  ];

  const NAME_FIELD_KEYS = ['name', 'Name', 'Full name', 'Full Name', 'Author', 'Authors', 'Contributor', 'Person', 'Person name', 'People involved'];
  const IMAGE_FIELD_KEYS = ['Picture', 'Image', 'Image URL', 'Image Url', 'Photo', 'Photo URL', 'Photo Url', 'Avatar', 'Avatar URL', 'Profile image', 'Profile picture', 'Headshot'];
  const RELATIONSHIP_FIELD_KEYS = ['RelationshipWithEsri', 'Relationship', 'Relationships', 'Relantionship', 'Contributor relationship', 'Contributor Relationship'];
  const TEAM_FIELD_KEYS = ['Team', 'Teams', 'Product team', 'Product Team', 'Esri team', 'Esri Team', 'Team / Product', 'Team/Product', 'Product', 'Area'];
  const PROFILE_FIELD_KEYS = ['Profile URL', 'Profile Url', 'Profile', 'URL', 'Url', 'Link'];
  const PEOPLE_INVOLVED_FIELD_KEYS = window.activityUtils?.OPEN_SHEET_FIELD_ALIASES?.peopleInvolved || ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'];
  const EMPTY_VALUE_KEYS = new Set(['n/a', 'na', 'none', '-', '--', 'tbd']);

  const state = {
    activeRelationships: new Set(),
    activeTeams: new Set(),
    openContactKey: '',
    initialized: false,
  };

  const pickFirst = typeof window.activityUtils?.pickFirst === 'function'
    ? window.activityUtils.pickFirst
    : (row, keys) => {
      for (const key of keys) {
        const value = `${row?.[key] ?? ''}`.trim();
        if (value) return value;
      }
      return '';
    };

  const normalizeKey = (value) => `${value ?? ''}`.trim().toLowerCase();
  const isEmptySheetValue = (value) => {
    const key = normalizeKey(value);
    return !key || EMPTY_VALUE_KEYS.has(key);
  };
  const escapeHtml = (value) => `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const isFeatureEnabled = () => {
    try {
      return new URL(window.location.href).searchParams.get(FEATURE_PARAM)?.toLowerCase() === 'true';
    } catch {
      return false;
    }
  };

  const splitMultiValueCell = (value) => `${value || ''}`
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const isEsriEmployee = (relationship) => normalizeKey(relationship) === normalizeKey(ESRI_EMPLOYEE_RELATIONSHIP);

  const stableColorMap = (values) => {
    const colorMap = new Map();
    let colorIndex = 0;
    values.forEach((value) => {
      const key = `${value || ''}`.trim();
      const normalizedKey = normalizeKey(key);
      if (!key || colorMap.has(normalizedKey)) return;
      const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
      colorIndex += 1;
      colorMap.set(key, color);
      colorMap.set(normalizedKey, color);
    });
    return colorMap;
  };

  const getMappedColor = (colorMap, value, fallback = COLOR_PALETTE[0]) => (
    colorMap.get(value) || colorMap.get(normalizeKey(value)) || fallback
  );

  const getReadableTextColor = (color) => {
    const match = `${color || ''}`.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return '#fff';
    const [, redHex, greenHex, blueHex] = match;
    const red = Number.parseInt(redHex, 16) / 255;
    const green = Number.parseInt(greenHex, 16) / 255;
    const blue = Number.parseInt(blueHex, 16) / 255;
    const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    return luminance > 0.62 ? '#24314f' : '#fff';
  };

  const uniqueOrdered = (values) => {
    const seen = new Set();
    return values
      .map((value) => `${value ?? ''}`.trim())
      .filter((value) => {
        if (!value) return false;
        const key = normalizeKey(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const getInitials = (name) => {
    const parts = `${name || ''}`.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  };

  const getSafeImageUrl = (value) => {
    const raw = `${value || ''}`.trim();
    if (isEmptySheetValue(raw)) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
      return '';
    }
  };

  const extractHttpUrls = (value) => {
    const raw = `${value || ''}`.trim();
    if (isEmptySheetValue(raw)) return [];
    return (raw.match(/https?:\/\/[^\s,;|]+/gi) || [])
      .map((url) => getSafeImageUrl(url.replace(/[)\].,;]+$/, '')))
      .filter(Boolean);
  };

  const getContactLinkLabel = (fieldName, index) => {
    const key = normalizeKey(fieldName);
    if (key.includes('linkedin')) return 'LinkedIn';
    if (key.includes('twitter') || key === 'x') return 'X';
    if (key.includes('bluesky')) return 'Bluesky';
    if (key.includes('github')) return 'GitHub';
    if (key.includes('youtube')) return 'YouTube';
    if (key.includes('community')) return 'Community';
    if (key.includes('blog')) return 'Blog';
    if (key.includes('website') || key.includes('web site')) return 'Website';
    if (key.includes('profile') || key === 'url' || key === 'link') return 'Profile';
    const cleaned = `${fieldName || ''}`.replace(/[_-]+/g, ' ').trim();
    return cleaned || `Link ${index + 1}`;
  };

  const collectContactLinks = (row) => {
    const imageFieldKeys = new Set(IMAGE_FIELD_KEYS.map(normalizeKey));
    const links = [];
    const seen = new Set();
    Object.entries(row || {}).forEach(([fieldName, fieldValue]) => {
      if (imageFieldKeys.has(normalizeKey(fieldName))) return;
      extractHttpUrls(fieldValue).forEach((url, index) => {
        const key = normalizeKey(url);
        if (!url || seen.has(key)) return;
        seen.add(key);
        links.push({ label: getContactLinkLabel(fieldName, index), url });
      });
    });
    return links;
  };

  const normalizeRelationshipLabel = (value) => (
    isEmptySheetValue(value) ? UNKNOWN_RELATIONSHIP : `${value}`.trim()
  );

  const normalizeTeamLabel = (value) => {
    const raw = `${value ?? ''}`.trim();
    const key = normalizeKey(raw);
    if (isEmptySheetValue(raw) || key === 'unknown' || key === 'other' || key === 'others') return UNKNOWN_TEAM;
    return raw;
  };

  const getAuthorName = (row) => (
    pickFirst(row, NAME_FIELD_KEYS)
    || Object.values(row || {}).map((value) => `${value ?? ''}`.trim()).find(Boolean)
    || ''
  );

  const normalizeAuthorRow = (row) => {
    const name = getAuthorName(row);
    if (!name) return null;
    const contactLinks = collectContactLinks(row);
    return {
      name,
      key: normalizeKey(name),
      imageUrl: getSafeImageUrl(pickFirst(row, IMAGE_FIELD_KEYS)),
      relationship: normalizeRelationshipLabel(pickFirst(row, RELATIONSHIP_FIELD_KEYS)),
      team: normalizeTeamLabel(pickFirst(row, TEAM_FIELD_KEYS)),
      profileUrl: getSafeImageUrl(pickFirst(row, PROFILE_FIELD_KEYS)) || contactLinks[0]?.url || '',
      contactLinks,
    };
  };

  const buildAuthorMap = () => {
    const authorMap = new Map();
    (window.authorsData || []).forEach((row) => {
      const author = normalizeAuthorRow(row);
      if (!author || authorMap.has(author.key)) return;
      authorMap.set(author.key, author);
    });
    return authorMap;
  };

  const getFilteredRows = () => {
    const rows = Array.isArray(window.activityData) ? window.activityData : [];
    if (typeof window.getFilteredActivityRows === 'function') return window.getFilteredActivityRows(rows);
    return rows;
  };

  const countContributions = (rows) => {
    const counts = new Map();
    rows.forEach((row) => {
      splitMultiValueCell(pickFirst(row, PEOPLE_INVOLVED_FIELD_KEYS)).forEach((name) => {
        const key = normalizeKey(name);
        if (!key) return;
        const current = counts.get(key) || { name, total: 0 };
        current.total += 1;
        counts.set(key, current);
      });
    });
    return counts;
  };

  const buildPeople = () => {
    const authorMap = buildAuthorMap();
    const counts = countContributions(getFilteredRows());
    return [...counts.values()].map((entry) => {
      const author = authorMap.get(normalizeKey(entry.name)) || {};
      return {
        name: author.name || entry.name,
        key: normalizeKey(author.name || entry.name),
        imageUrl: author.imageUrl || '',
        relationship: normalizeRelationshipLabel(author.relationship),
        team: normalizeTeamLabel(author.team),
        profileUrl: author.profileUrl || '',
        contactLinks: Array.isArray(author.contactLinks) ? author.contactLinks : [],
        total: entry.total,
      };
    });
  };

  const getRelationshipOptions = (people) => {
    const dropdownRelationships = window.dropdownData?.relationships || [];
    return uniqueOrdered([
      ...dropdownRelationships,
      ...people.map((person) => person.relationship || UNKNOWN_RELATIONSHIP),
    ]);
  };

  const getTeamOptions = (people) => uniqueOrdered(
    people
      .filter((person) => isEsriEmployee(person.relationship))
      .map((person) => person.team || UNKNOWN_TEAM)
      .sort((a, b) => a.localeCompare(b)),
  );

  const countBy = (people, getValue) => people.reduce((counts, person) => {
    const value = getValue(person);
    const key = normalizeKey(value);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  const getGroupLabel = (person) => (
    isEsriEmployee(person.relationship)
      ? (person.team || UNKNOWN_TEAM)
      : (person.relationship || UNKNOWN_RELATIONSHIP)
  );

  const getGroupWeight = (person) => (isEsriEmployee(person.relationship) ? 0 : 1);

  const getGroupSortKey = (person) => normalizeKey(getGroupLabel(person));

  const sumContributionsByGroup = (people) => people.reduce((totals, person) => {
    const key = getGroupSortKey(person);
    totals.set(key, (totals.get(key) || 0) + (Number(person.total) || 0));
    return totals;
  }, new Map());

  const countPeopleByGroup = (people) => people.reduce((totals, person) => {
    const key = getGroupSortKey(person);
    totals.set(key, (totals.get(key) || 0) + 1);
    return totals;
  }, new Map());

  const hasToggle = (toggleSet, value) => toggleSet.has(normalizeKey(value));

  const toggleValue = (toggleSet, value) => {
    const key = normalizeKey(value);
    if (!key) return;
    if (toggleSet.has(key)) {
      toggleSet.delete(key);
    } else {
      toggleSet.add(key);
    }
  };

  const filterPeople = (people) => people.filter((person) => {
    if (state.activeRelationships.size > 0 && !hasToggle(state.activeRelationships, person.relationship)) return false;
    if (
      isEsriEmployee(person.relationship)
      && state.activeTeams.size > 0
      && !hasToggle(state.activeTeams, person.team || UNKNOWN_TEAM)
    ) return false;
    return true;
  });

  const sortPeople = (people) => {
    const groupContributionTotals = sumContributionsByGroup(people);
    return [...people].sort((a, b) => (
      (groupContributionTotals.get(getGroupSortKey(b)) || 0) - (groupContributionTotals.get(getGroupSortKey(a)) || 0)
      || getGroupWeight(a) - getGroupWeight(b)
      || getGroupLabel(a).localeCompare(getGroupLabel(b))
      || b.total - a.total
      || a.name.localeCompare(b.name)
    ));
  };

  const getPersonGroupColor = (person, relationshipColors, teamColors) => (
    isEsriEmployee(person.relationship)
      ? getMappedColor(teamColors, person.team || UNKNOWN_TEAM)
      : getMappedColor(relationshipColors, person.relationship || UNKNOWN_RELATIONSHIP)
  );

  const renderGroupTitle = (groupLabel, groupContributionTotal, groupPeopleTotal, groupColor) => `
    <h3 class="contributors-group__title" style="--group-color: ${escapeHtml(groupColor)}; --group-text-color: ${escapeHtml(getReadableTextColor(groupColor))}">
      <span class="contributors-group__name">${escapeHtml(groupLabel)}</span>
      <span class="contributors-group__stats">
        <span class="contributors-group__total">${groupContributionTotal || 0}</span>
        <span class="contributors-group__people" aria-label="${groupPeopleTotal || 0} ${groupPeopleTotal === 1 ? 'person' : 'people'}">
          <i class="fa-solid fa-user-group" aria-hidden="true"></i>
          <span>${groupPeopleTotal || 0}</span>
        </span>
      </span>
    </h3>
  `;

  const renderChip = ({
    label,
    color,
    count,
    isActive,
    controls,
    onClick,
    extraClass = '',
  }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `contributors-chip${isActive ? ' is-active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
    button.style.setProperty('--chip-color', color);
    button.setAttribute('aria-pressed', String(isActive));
    if (controls) button.setAttribute('aria-controls', controls);
    button.innerHTML = `
      <span class="contributors-chip__swatch" aria-hidden="true"></span>
      <span class="contributors-chip__label">${escapeHtml(label)}</span>
      <span class="contributors-chip__count" aria-label="${count || 0} contributors">${count || 0}</span>
    `;
    button.addEventListener('click', onClick);
    return button;
  };

  const renderRelationshipChips = (relationships, relationshipColors, relationshipCounts) => {
    const container = document.querySelector('#contributor-relationship-chips');
    if (!container) return;
    container.replaceChildren();
    relationships.forEach((relationship) => {
      container.appendChild(renderChip({
        label: relationship,
        color: getMappedColor(relationshipColors, relationship),
        count: relationshipCounts.get(normalizeKey(relationship)) || 0,
        isActive: hasToggle(state.activeRelationships, relationship),
        controls: isEsriEmployee(relationship) ? 'contributor-team-chips' : '',
        onClick: () => {
          toggleValue(state.activeRelationships, relationship);
          if (!hasToggle(state.activeRelationships, ESRI_EMPLOYEE_RELATIONSHIP)) state.activeTeams.clear();
          window.renderContributors();
        },
      }));
    });
  };

  const renderTeamChips = (teams, teamColors, teamCounts) => {
    const container = document.querySelector('#contributor-team-chips');
    if (!container) return;
    const showTeams = hasToggle(state.activeRelationships, ESRI_EMPLOYEE_RELATIONSHIP) && teams.length > 0;
    container.hidden = !showTeams;
    container.replaceChildren();
    if (!showTeams) return;
    teams.forEach((team) => {
      container.appendChild(renderChip({
        label: team,
        color: getMappedColor(teamColors, team),
        count: teamCounts.get(normalizeKey(team)) || 0,
        isActive: hasToggle(state.activeTeams, team),
        extraClass: 'contributors-chip--team',
        onClick: () => {
          toggleValue(state.activeTeams, team);
          window.renderContributors();
        },
      }));
    });
  };

  const renderAvatar = (person, borderColor) => {
    const affiliation = isEsriEmployee(person.relationship)
      ? (person.team || UNKNOWN_TEAM)
      : (person.relationship || UNKNOWN_RELATIONSHIP);
    const tooltipHtml = `
      <span class="contributor-card__tooltip" role="tooltip">
        <strong>${escapeHtml(person.name)}</strong>
        <span>${escapeHtml(affiliation)}</span>
      </span>
    `;
    if (person.imageUrl) {
      return `<img class="contributor-card__avatar-img" src="${escapeHtml(person.imageUrl)}" alt="${escapeHtml(person.name)}" loading="lazy">${tooltipHtml}`;
    }
    return `<span class="contributor-card__avatar-fallback" aria-hidden="true" style="--avatar-border-color: ${escapeHtml(borderColor)}">${escapeHtml(getInitials(person.name))}</span>${tooltipHtml}`;
  };

  const renderContactMenu = (person) => {
    const links = Array.isArray(person.contactLinks) ? person.contactLinks : [];
    const menuItems = links.length > 0
      ? links.map((link) => `
          <a class="contributor-card__menu-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(link.label)}
          </a>
        `).join('')
      : '<span class="contributor-card__menu-empty">No contact links</span>';
    return `
      <div class="contributor-card__menu" role="menu" ${state.openContactKey === person.key ? '' : 'hidden'}>
        ${menuItems}
      </div>
    `;
  };

  const updateOpenContactMenu = (nextKey) => {
    state.openContactKey = nextKey || '';
    document.querySelectorAll('.contributor-card').forEach((card) => {
      const isOpen = card.dataset.contributorKey === state.openContactKey;
      const menu = card.querySelector('.contributor-card__menu');
      const button = card.querySelector('.contributor-card__button');
      if (menu) menu.hidden = !isOpen;
      if (button) button.setAttribute('aria-expanded', String(isOpen));
    });
  };

  const renderPersonCard = (person, borderColor) => {
    const card = document.createElement('article');
    card.className = 'contributor-card';
    card.style.setProperty('--avatar-border-color', borderColor);
    card.dataset.contributorKey = person.key;
    card.innerHTML = `
      <button class="contributor-card__button" type="button" aria-haspopup="menu" aria-expanded="${state.openContactKey === person.key}">
        <span class="contributor-card__avatar">
          ${renderAvatar(person, borderColor)}
          <span class="contributor-card__badge" aria-label="${person.total} contributions">${person.total}</span>
        </span>
        <span class="contributor-card__name">${escapeHtml(person.name)}</span>
      </button>
      ${renderContactMenu(person)}
    `;
    card.querySelector('.contributor-card__button')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateOpenContactMenu(state.openContactKey === person.key ? '' : person.key);
    });
    card.querySelector('img')?.addEventListener('error', (event) => {
      const avatarEl = event.currentTarget.closest('.contributor-card__avatar');
      if (!avatarEl) return;
      avatarEl.querySelector('img')?.remove();
      avatarEl.insertAdjacentHTML('afterbegin', `<span class="contributor-card__avatar-fallback" aria-hidden="true">${escapeHtml(getInitials(person.name))}</span>`);
    });
    return card;
  };

  const renderPeopleGrid = (people, relationshipColors, teamColors) => {
    const grid = document.querySelector('#contributors-grid');
    const empty = document.querySelector('#contributors-empty');
    const count = document.querySelector('#contributors-count');
    if (!grid || !empty) return;
    const groupContributionTotals = sumContributionsByGroup(people);
    const groupPeopleTotals = countPeopleByGroup(people);

    grid.replaceChildren();
    if (count) {
      count.textContent = `${people.length} ${people.length === 1 ? 'contributor' : 'contributors'} shown`;
    }
    empty.hidden = people.length > 0;
    if (people.length === 0) return;

    let currentGroup = '';
    let currentGroupGrid = null;
    people.forEach((person) => {
      const groupLabel = getGroupLabel(person);
      if (groupLabel !== currentGroup) {
        currentGroup = groupLabel;
        const groupColor = getPersonGroupColor(person, relationshipColors, teamColors);
        const section = document.createElement('section');
        section.className = 'contributors-group';
        section.innerHTML = `${renderGroupTitle(groupLabel, groupContributionTotals.get(getGroupSortKey(person)), groupPeopleTotals.get(getGroupSortKey(person)), groupColor)}<div class="contributors-group__grid"></div>`;
        grid.appendChild(section);
        currentGroupGrid = section.querySelector('.contributors-group__grid');
      }
      const borderColor = getPersonGroupColor(person, relationshipColors, teamColors);
      currentGroupGrid?.appendChild(renderPersonCard(person, borderColor));
    });
  };

  const revealContributorsTab = () => {
    const tabItem = document.querySelector('#tab-contributors-item');
    const tabPane = document.querySelector('#tab-contributors');
    tabItem?.removeAttribute('hidden');
    tabPane?.removeAttribute('hidden');
  };

  const initializeToolbarCollapse = () => {
    const toolbar = document.querySelector('.contributors-toolbar');
    const toggle = document.querySelector('#contributors-toolbar-toggle');
    const content = document.querySelector('#contributors-toolbar-content');
    if (!toolbar || !toggle || !content || toggle.dataset.initialized === '1') return;
    toggle.dataset.initialized = '1';
    toggle.addEventListener('click', () => {
      const isCollapsed = toolbar.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      content.hidden = isCollapsed;
    });
  };

  const initialize = () => {
    if (state.initialized || !isFeatureEnabled()) return;
    state.initialized = true;
    revealContributorsTab();
    initializeToolbarCollapse();
    document.addEventListener('click', (event) => {
      if (!state.openContactKey || event.target.closest('.contributor-card')) return;
      updateOpenContactMenu('');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !state.openContactKey) return;
      updateOpenContactMenu('');
    });
  };

  window.renderContributors = function () {
    if (!isFeatureEnabled()) return;
    initialize();

    const people = buildPeople();
    const relationships = getRelationshipOptions(people);
    const teams = getTeamOptions(people);
    const relationshipColors = stableColorMap(relationships);
    const teamColors = stableColorMap(teams);
    const relationshipCounts = countBy(people, (person) => person.relationship || UNKNOWN_RELATIONSHIP);
    const teamCounts = countBy(
      people.filter((person) => isEsriEmployee(person.relationship)),
      (person) => person.team || UNKNOWN_TEAM,
    );

    const relationshipKeys = new Set(relationships.map(normalizeKey));
    state.activeRelationships = new Set([...state.activeRelationships].filter((relationship) => relationshipKeys.has(relationship)));
    if (!hasToggle(state.activeRelationships, ESRI_EMPLOYEE_RELATIONSHIP)) {
      state.activeTeams.clear();
    }
    const teamKeys = new Set(teams.map(normalizeKey));
    state.activeTeams = new Set([...state.activeTeams].filter((team) => teamKeys.has(team)));

    renderRelationshipChips(relationships, relationshipColors, relationshipCounts);
    renderTeamChips(teams, teamColors, teamCounts);
    renderPeopleGrid(sortPeople(filterPeople(people)), relationshipColors, teamColors);
  };

  const previousOnDataLoaded = window.onDataLoaded;
  window.onDataLoaded = () => {
    if (typeof previousOnDataLoaded === 'function') previousOnDataLoaded();
    window.renderContributors();
  };

  const previousApplyFilters = window.applyFilters;
  window.applyFilters = (...args) => {
    const result = previousApplyFilters?.(...args);
    window.renderContributors();
    return result;
  };

  document.querySelector('#tab-contributors-trigger')?.addEventListener('shown.bs.tab', () => {
    window.renderContributors();
  });

  initialize();
})();
