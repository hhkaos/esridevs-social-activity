(function (global) {
  const INVISIBLE_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

  const normalizeCell = (value) => `${value ?? ''}`
    .replace(/\u00A0/g, ' ')
    .replace(INVISIBLE_CHARS_RE, '')
    .trim();

  const hasText = (value) => normalizeCell(value) !== '';
  const hasLink = (value) => hasText(value) && normalizeCell(value).toLowerCase() !== 'n/a';
  const hasActiveSelections = (map) => Object.values(map || {}).some((selection) => selection === 1);
  const matchesSelectionMap = (map, value, { splitValues = false } = {}) => {
    if (!hasActiveSelections(map)) return true;

    const raw = `${value ?? ''}`;
    const candidates = splitValues
      ? raw.split(',').map((item) => normalizeCell(item)).filter(Boolean)
      : [normalizeCell(raw)].filter(Boolean);

    if (candidates.length === 0) return false;
    return candidates.some((candidate) => map[candidate] === 1);
  };
  const isMeaningfulValue = (value) => {
    const normalized = normalizeCell(value).toLowerCase();
    if (!normalized) return false;
    return !['n/a', 'na', 'none', '-', '--', 'tbd'].includes(normalized);
  };

  const toISODateLocal = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateToLocalDay = (value) => {
    const raw = normalizeCell(value);
    if (!raw) return null;

    const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoDate) {
      const [, yearStr, monthStr, dayStr] = isoDate;
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      const parsed = new Date(year, month - 1, day);
      if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
      ) return null;
      return parsed;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const getLatestActivityDate = (rows = []) => {
    let latest = null;
    rows.forEach((row) => {
      const parsed = parseDateToLocalDay(row?.Date);
      if (!parsed) return;
      if (!latest || parsed > latest) latest = parsed;
    });
    return latest;
  };

  const addDaysLocal = (date, days) => {
    const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    shifted.setDate(shifted.getDate() + days);
    return shifted;
  };

  const getDateRangeForPreset = (preset, anchorDate) => {
    if (preset === 'showAll') {
      return { from: '', to: '' };
    }

    if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) return null;

    const toDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    let fromDate = null;
    let finalToDate = toDate;

    switch (preset) {
      case 'last30':
        fromDate = addDaysLocal(toDate, -29);
        break;
      case 'last60':
        fromDate = addDaysLocal(toDate, -59);
        break;
      case 'last90':
        fromDate = addDaysLocal(toDate, -89);
        break;
      case 'thisMonth':
        fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
        break;
      case 'thisQuarter': {
        const quarterStartMonth = Math.floor(toDate.getMonth() / 3) * 3;
        fromDate = new Date(toDate.getFullYear(), quarterStartMonth, 1);
        break;
      }
      case 'lastQuarter': {
        const quarterStartMonth = Math.floor(toDate.getMonth() / 3) * 3;
        const thisQuarterStart = new Date(toDate.getFullYear(), quarterStartMonth, 1);
        finalToDate = addDaysLocal(thisQuarterStart, -1);
        const previousQuarterStartMonth = Math.floor(finalToDate.getMonth() / 3) * 3;
        fromDate = new Date(finalToDate.getFullYear(), previousQuarterStartMonth, 1);
        break;
      }
      case 'thisYear':
        fromDate = new Date(toDate.getFullYear(), 0, 1);
        break;
      case 'pastYear':
        fromDate = addDaysLocal(toDate, -364);
        break;
      default:
        return null;
    }

    return {
      from: toISODateLocal(fromDate),
      to: toISODateLocal(finalToDate),
    };
  };

  const pickFirst = (row, keys) => {
    for (const key of keys) {
      const normalized = normalizeCell(row?.[key]);
      if (normalized) return normalized;
    }
    return '';
  };

  const normalizeValueKey = (value) => normalizeCell(value).toLowerCase();

  const buildValueDefinitionMap = ({
    rows = [],
    valueKeys = [],
    definitionKeys = [],
  } = {}) => {
    const definitions = {};

    rows.forEach((row) => {
      const value = pickFirst(row, valueKeys);
      const definition = pickFirst(row, definitionKeys);
      if (!value || !definition) return;

      const normalizedKey = normalizeValueKey(value);
      if (!normalizedKey || definitions[normalizedKey]) return;
      definitions[normalizedKey] = definition;
    });

    return definitions;
  };

  const resolveValueDefinition = (definitions = {}, value = '') => {
    const normalizedKey = normalizeValueKey(value);
    if (!normalizedKey) return '';
    return definitions[normalizedKey] || '';
  };

  const detectSocialPlatform = (url, fallback = 'shared') => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes('linkedin.com')) return 'linkedin';
      if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
      if (host.includes('bsky.app') || host.includes('bluesky')) return 'bluesky';
    } catch {
      return fallback;
    }
    return fallback;
  };

  const buildShareIntentUrl = ({ platform, title, url }) => {
    if (!hasLink(url)) return '';
    const safeTitle = normalizeCell(title);
    const safeUrl = normalizeCell(url);
    const shareText = [safeTitle, safeUrl].filter(Boolean).join(' ');

    if (platform === 'linkedin') {
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(safeUrl)}`;
    }
    if (platform === 'x') {
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    }
    if (platform === 'bluesky') {
      return `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
    }

    return '';
  };

  const buildSocialTargets = ({
    platform,
    platformUrl,
    sharedUrl,
    contentTitle,
    contentUrl,
    openTitle,
    shareTitle,
  }) => {
    const targets = [];
    const pushTarget = (target) => {
      const key = normalizeCell(target?.url);
      if (!key) return;
      targets.push(target);
    };

    if (hasLink(platformUrl)) {
      pushTarget({
        url: platformUrl,
        title: openTitle,
        label: 'Community post',
      });
    }

    if (hasLink(sharedUrl)) {
      pushTarget({
        url: sharedUrl,
        title: `Open EsriDevs Shared (${openTitle.replace(/^Open /, '')})`,
        label: 'EsriDevs shared',
      });
    }

    if (targets.length === 0) {
      const shareUrl = buildShareIntentUrl({
        platform,
        title: contentTitle,
        url: contentUrl,
      });
      if (hasLink(shareUrl)) {
        pushTarget({
          url: shareUrl,
          title: shareTitle,
          label: 'Share this content',
        });
      }
    }

    return targets;
  };

  const buildSocialLinks = ({
    linkedin,
    xPost,
    bluesky,
    sharedByPlatform,
    contentTitle,
    contentUrl,
  }) => {
    const links = [];
    [
      ['linkedin', linkedin, 'Open LinkedIn post', 'Share on LinkedIn'],
      ['x', xPost, 'Open X/Twitter post', 'Share on X/Twitter'],
      ['bluesky', bluesky, 'Open Bluesky post', 'Share on Bluesky'],
    ].forEach(([platform, platformUrl, openTitle, shareTitle]) => {
      const targets = buildSocialTargets({
        platform,
        platformUrl,
        sharedUrl: sharedByPlatform?.[platform] || '',
        contentTitle,
        contentUrl,
        openTitle,
        shareTitle,
      });
      if (targets.length === 0) return;
      links.push({
        platform,
        title: targets.length > 1 ? `Open ${openTitle.replace(/^Open /, '')} links` : targets[0].title,
        url: targets[0].url,
        targets,
      });
    });

    return links;
  };

  const extractContentLinks = (row) => {
    const directUrl = pickFirst(row, ['URL', 'Url', 'Link']);
    return hasLink(directUrl)
      ? [{ url: directUrl, title: 'Open content link' }]
      : [];
  };

  const extractSocialLinks = (row) => {
    const contentTitle = pickFirst(row, ['Title', 'Content title']);
    const contentUrl = pickFirst(row, ['URL', 'Url', 'Link']);
    const linkedin = pickFirst(row, ['Linkedin', 'LinkedIn']);
    const xPost = pickFirst(row, ['X/Twitter', 'X', 'Twitter']);
    const bluesky = pickFirst(row, ['Bluesky', 'BlueSky']);
    const esriDevsShared = pickFirst(row, ['EsriDevs Shared', 'EsriDevs shared', 'EsriDevs\nShared']);
    const sharedByPlatform = {};

    if (hasLink(esriDevsShared)) {
      const sharedPlatform = detectSocialPlatform(esriDevsShared, 'shared');
      if (sharedPlatform === 'linkedin' || sharedPlatform === 'x' || sharedPlatform === 'bluesky') {
        sharedByPlatform[sharedPlatform] = esriDevsShared;
      }
    }

    return buildSocialLinks({
      linkedin,
      xPost,
      bluesky,
      sharedByPlatform,
      contentTitle,
      contentUrl,
    });
  };

  const sanitizeActivityRows = (rows = []) => rows.filter((row) => {
    const title = pickFirst(row, ['Title', 'Content title']);
    const date = pickFirst(row, ['Date']);
    const author = pickFirst(row, ['Author', 'Authors']);
    const contributors = pickFirst(row, ['Contributors', 'Contributor', 'Authors']);
    const channel = pickFirst(row, ['Channel']);
    const language = pickFirst(row, ['Language', 'Languages']);
    const technology = pickFirst(row, ['Topics_Product', 'Technology', 'Technologies']);
    const category = pickFirst(row, ['Category', 'Category / Content type', 'Content type']);
    const contentLinks = extractContentLinks(row);
    const socialLinks = extractSocialLinks(row);

    // Activity rows must have both a title and a primary content URL.
    if (!hasText(title) || contentLinks.length === 0) return false;

    return [
      title,
      date,
      author,
      contributors,
      channel,
      language,
      technology,
      category,
    ].some(isMeaningfulValue) || contentLinks.length > 0 || socialLinks.length > 0;
  });

  const runPostRefreshUiSync = (hooks = {}) => {
    const { syncColumnVisibility, applyFilters } = hooks;
    if (typeof syncColumnVisibility === 'function') syncColumnVisibility();
    if (typeof applyFilters === 'function') applyFilters();
  };

  const createRenderGate = () => {
    let ready = false;
    let callbacks = [];

    const flush = () => {
      const queued = callbacks;
      callbacks = [];
      queued.forEach((cb) => cb());
    };

    return {
      isComplete: () => ready,
      onComplete: (callback) => {
        if (typeof callback !== 'function') return;
        if (ready) {
          callback();
          return;
        }
        callbacks.push(callback);
      },
      markComplete: () => {
        if (ready) return;
        ready = true;
        flush();
      },
      reset: () => {
        ready = false;
        callbacks = [];
      },
    };
  };

  const OPEN_SHEET_SCHEMA = {
    activity: {
      Date: ['Date'],
      Title: ['Title', 'Content title'],
      URL: ['URL', 'Url', 'Link'],
      Author: ['Author', 'Authors'],
      Contributor: ['Contributors', 'Contributor', 'Authors'],
      Channel: ['Channel'],
      Language: ['Language', 'Languages'],
      Technology: ['Topics_Product', 'Technology', 'Technologies'],
      Category: ['Category', 'Category / Content type', 'Content type'],
    },
    dropdowns: {
      Technology: ['Technologies', 'Technology', 'Topics_Product'],
      Category: ['Category / Content type', 'Category', 'Content type'],
      Channel: ['Channel'],
      Author: ['Author', 'Authors'],
      Language: ['Languages', 'Language'],
    },
  };

  const getRowHeaders = (rows = []) => {
    const headers = new Set();
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach((key) => {
        const normalized = normalizeCell(key);
        if (normalized) headers.add(normalized);
      });
    });
    return headers;
  };

  const toComparableKey = (value) => normalizeCell(value).toLowerCase();

  const toComparableHeaderSet = (headers) => new Set(
    [...headers].map((header) => toComparableKey(header)).filter(Boolean)
  );

  const findSchemaMissingGroups = (headers, groups = {}) => {
    const comparableHeaders = toComparableHeaderSet(headers);
    return Object.entries(groups)
      .filter(([, aliases]) => !aliases.some((alias) => comparableHeaders.has(toComparableKey(alias))))
    .map(([groupName, aliases]) => ({ groupName, aliases }));
  };

  const validateSheetSchema = ({ activityRows = [], dropdownRows = [] } = {}) => {
    const activityHeaders = getRowHeaders(activityRows);
    const dropdownHeaders = getRowHeaders(dropdownRows);

    const activityMissing = findSchemaMissingGroups(activityHeaders, OPEN_SHEET_SCHEMA.activity);
    const dropdownMissing = findSchemaMissingGroups(dropdownHeaders, OPEN_SHEET_SCHEMA.dropdowns);

    const mismatches = [];
    if (activityMissing.length > 0) {
      mismatches.push({
        sheet: 'Activity',
        missing: activityMissing,
        foundHeaders: [...activityHeaders],
      });
    }
    if (dropdownMissing.length > 0) {
      mismatches.push({
        sheet: 'Dropdowns',
        missing: dropdownMissing,
        foundHeaders: [...dropdownHeaders],
      });
    }

    return {
      isValid: mismatches.length === 0,
      mismatches,
    };
  };

  const buildSchemaMismatchMessage = (validationResult) => {
    if (!validationResult || validationResult.isValid) return '';

    const sections = validationResult.mismatches.map(({ sheet, missing, foundHeaders = [] }) => {
      const fields = missing
        .map(({ groupName, aliases }) => `${groupName} (expected one of: ${aliases.join(' | ')})`)
        .join('; ');
      const found = foundHeaders.length > 0 ? foundHeaders.join(' | ') : '(none)';
      return `${sheet}: ${fields}. Found headers: ${found}`;
    });

    return `OpenSheet schema mismatch detected. ${sections.join(' — ')}`;
  };

  const getFilterCollapseMeta = (collapsed) => (collapsed
    ? {
      label: 'Show filters',
      ariaExpanded: 'false',
    }
    : {
      label: 'Hide filters',
      ariaExpanded: 'true',
    });

  const api = {
    hasText,
    hasLink,
    matchesSelectionMap,
    isMeaningfulValue,
    pickFirst,
    extractContentLinks,
    extractSocialLinks,
    toISODateLocal,
    parseDateToLocalDay,
    getLatestActivityDate,
    getDateRangeForPreset,
    sanitizeActivityRows,
    runPostRefreshUiSync,
    createRenderGate,
    OPEN_SHEET_SCHEMA,
    validateSheetSchema,
    buildSchemaMismatchMessage,
    getFilterCollapseMeta,
    buildValueDefinitionMap,
    resolveValueDefinition,
  };

  global.activityUtils = Object.assign({}, global.activityUtils || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
