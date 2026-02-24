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

  const pickFirst = (row, keys) => {
    for (const key of keys) {
      const normalized = normalizeCell(row?.[key]);
      if (normalized) return normalized;
    }
    return '';
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

  const socialPlatformName = (platform) => ({
    linkedin: 'LinkedIn',
    x: 'X/Twitter',
    bluesky: 'Bluesky',
    shared: 'EsriDevs Shared',
  }[platform] || 'EsriDevs Shared');

  const buildSocialLinks = ({ linkedin, xPost, bluesky, esriDevsShared }) => {
    const links = [];

    if (hasLink(linkedin)) {
      links.push({ url: linkedin, platform: 'linkedin', title: 'Open LinkedIn post' });
    }

    if (hasLink(xPost)) {
      links.push({ url: xPost, platform: 'x', title: 'Open X/Twitter post' });
    }

    if (hasLink(bluesky)) {
      links.push({ url: bluesky, platform: 'bluesky', title: 'Open Bluesky post' });
    }

    if (hasLink(esriDevsShared)) {
      const platform = detectSocialPlatform(esriDevsShared, 'shared');
      links.push({
        url: esriDevsShared,
        platform,
        title: `Open EsriDevs Shared (${socialPlatformName(platform)})`,
      });
    }

    return links;
  };

  const extractContentLinks = (row) => {
    const directUrl = pickFirst(row, ['URL', 'Url', 'Link']);
    return hasLink(directUrl)
      ? [{ url: directUrl, title: 'Open content link' }]
      : [];
  };

  const extractSocialLinks = (row) => {
    const linkedin = pickFirst(row, ['Linkedin', 'LinkedIn']);
    const xPost = pickFirst(row, ['X/Twitter', 'X', 'Twitter']);
    const bluesky = pickFirst(row, ['Bluesky', 'BlueSky']);
    const esriDevsShared = pickFirst(row, ['EsriDevs Shared', 'EsriDevs shared']);

    let resolvedXPost = xPost;
    if (!hasLink(resolvedXPost) && hasLink(esriDevsShared)) {
      resolvedXPost = esriDevsShared;
    }

    return buildSocialLinks({
      linkedin,
      xPost: resolvedXPost,
      bluesky,
      esriDevsShared: hasLink(xPost) ? esriDevsShared : '',
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

  const api = {
    hasText,
    hasLink,
    matchesSelectionMap,
    isMeaningfulValue,
    pickFirst,
    extractContentLinks,
    extractSocialLinks,
    sanitizeActivityRows,
    runPostRefreshUiSync,
    createRenderGate,
  };

  global.activityUtils = Object.assign({}, global.activityUtils || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
