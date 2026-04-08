/**
 * RSS feed server for esridevs-social-activity.
 *
 * Exposes GET /feed.xml?state=<LZString> (same share-link format as the web app).
 * Caches Google Sheet data in memory to avoid hammering the opensheet proxy.
 *
 * Environment variables:
 *   PORT             — TCP port to listen on (default: 3001)
 *   CACHE_TTL_MS     — How long to keep sheet data in memory, ms (default: 600000 = 10 min)
 *   FEED_BASE_URL    — Canonical URL of the web app, used in <link> and <guid> (default: https://esri.github.io/esridevs-social-activity/)
 *   MAX_ITEMS        — Maximum items per feed response (default: 100)
 */

import http from 'node:http';
import pkg from 'lz-string';
const { decompressFromBase64 } = pkg;

// ── Config ─────────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
const SHEET_BASE = `https://opensheet.elk.sh/${SPREADSHEET_ID}`;

const PORT = Number(process.env.PORT) || 3001;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000;
const FEED_BASE_URL = (process.env.FEED_BASE_URL || 'https://www.rauljimenez.info/esridevs-social-activity/').replace(/\/$/, '') + '/';
const MAX_ITEMS = Number(process.env.MAX_ITEMS) || 100;

// ── Logging ────────────────────────────────────────────────────────────────────
// Structured logs to stdout/stderr. PM2 (or systemd) captures these to files.
// Format: [LEVEL] ISO-timestamp message

function log(level, message, extra) {
  const ts = new Date().toISOString();
  const prefix = `[${level}] ${ts}`;
  if (extra instanceof Error) {
    // Always include stack trace for errors so logs are actionable
    (level === 'ERROR' ? console.error : console.log)(`${prefix} ${message}\n${extra.stack}`);
  } else if (extra !== undefined) {
    (level === 'ERROR' ? console.error : console.log)(`${prefix} ${message}`, extra);
  } else {
    (level === 'ERROR' ? console.error : console.log)(`${prefix} ${message}`);
  }
}

const logger = {
  info: (msg, extra) => log('INFO ', msg, extra),
  warn: (msg, extra) => log('WARN ', msg, extra),
  error: (msg, extra) => log('ERROR', msg, extra),
};

// Catch unhandled errors so PM2/systemd get an exit code and can restart
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — process will exit', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection — process will exit', reason instanceof Error ? reason : new Error(String(reason)));
  process.exit(1);
});

// ── Cache ──────────────────────────────────────────────────────────────────────

/** @type {{ rows: object[], fetchedAt: number } | null} */
let dataCache = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function loadSheetRows() {
  logger.info('Fetching sheet data from opensheet…');
  const start = Date.now();
  const [activityRows] = await Promise.all([
    fetchJson(`${SHEET_BASE}/Activity`),
  ]);
  logger.info(`Sheet fetch complete (${Date.now() - start}ms, ${activityRows.length} raw rows)`);
  return activityRows;
}

async function getCachedRows() {
  const now = Date.now();
  if (dataCache && (now - dataCache.fetchedAt) < CACHE_TTL_MS) {
    const ageS = Math.round((now - dataCache.fetchedAt) / 1000);
    logger.info(`Cache hit (age ${ageS}s, ${dataCache.rows.length} rows)`);
    return dataCache.rows;
  }
  const rows = await loadSheetRows();
  const sanitized = sanitizeActivityRows(rows);
  dataCache = { rows: sanitized, fetchedAt: now };
  logger.info(`Cache refreshed — ${sanitized.length} rows stored (TTL ${CACHE_TTL_MS / 1000}s)`);
  return dataCache.rows;
}

// ── Data helpers (ported from activity-utils.js, self-contained) ───────────────

const INVISIBLE_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

function normalizeCell(value) {
  return `${value ?? ''}`.replace(/\u00A0/g, ' ').replace(INVISIBLE_CHARS_RE, '').trim();
}

function hasText(value) { return normalizeCell(value) !== ''; }
function isMeaningfulValue(value) {
  const n = normalizeCell(value).toLowerCase();
  return Boolean(n) && !['n/a', 'na', 'none', '-', '--', 'tbd'].includes(n);
}
function isTruthyFlag(value) {
  return ['true', 'yes', 'y', '1', 'x'].includes(normalizeCell(value).toLowerCase());
}
function hasActiveSelections(map) {
  return Object.values(map || {}).some((v) => v === 1);
}

function pickFirst(row, keys) {
  for (const key of (keys || [])) {
    const n = normalizeCell(row?.[key]);
    if (n) return n;
  }
  return '';
}

const FIELD = {
  date: ['Date'],
  title: ['Title', 'Content title'],
  url: ['URL', 'Url', 'Link'],
  publisher: ['Publisher', 'Author', 'Authors'],
  peopleInvolved: ['People involved', 'People Involved', 'People_involved', 'Contributors', 'Contributor', 'Authors'],
  channelOwner: ['Channel owner', 'Channel Owner', 'Channel_owner', 'ChannelOwner', 'Channel'],
  language: ['Language', 'Languages'],
  technology: ['Topics_Product', 'Technology', 'Technologies'],
  category: ['Category', 'Category / Content type', 'Content type'],
};
const FEATURED_KEYS = ['Featured', 'featured', 'Featured?', 'Featured ?', 'FEATURED'];

function sanitizeActivityRows(rows = []) {
  return rows.filter((row) => {
    const title = pickFirst(row, FIELD.title);
    const url = pickFirst(row, FIELD.url);
    if (!hasText(title) || !hasText(url)) return false;
    if (url.toLowerCase() === 'n/a') return false;
    return true;
  });
}

function parseDateToLocalDay(value) {
  const raw = normalizeCell(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    const parsed = new Date(y, mo - 1, d);
    if (parsed.getFullYear() === y && parsed.getMonth() === mo - 1 && parsed.getDate() === d) {
      return parsed;
    }
  }
  // Fallback: parse other common formats
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function toISODateLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysLocal(date, days) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function getDateRangeForPreset(preset, anchorDate = new Date()) {
  if (preset === 'showAll') return { from: '', to: '' };
  const toDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  let fromDate = null;
  let finalToDate = toDate;

  switch (preset) {
    case 'last30': fromDate = addDaysLocal(toDate, -29); break;
    case 'last60': fromDate = addDaysLocal(toDate, -59); break;
    case 'last90': fromDate = addDaysLocal(toDate, -89); break;
    case 'thisMonth': fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1); break;
    case 'thisQuarter': {
      const qStart = Math.floor(toDate.getMonth() / 3) * 3;
      fromDate = new Date(toDate.getFullYear(), qStart, 1);
      break;
    }
    case 'lastQuarter': {
      const qStart = Math.floor(toDate.getMonth() / 3) * 3;
      const thisQStart = new Date(toDate.getFullYear(), qStart, 1);
      finalToDate = addDaysLocal(thisQStart, -1);
      const prevQStart = Math.floor(finalToDate.getMonth() / 3) * 3;
      fromDate = new Date(finalToDate.getFullYear(), prevQStart, 1);
      break;
    }
    case 'thisYear': fromDate = new Date(toDate.getFullYear(), 0, 1); break;
    case 'pastYear': fromDate = addDaysLocal(toDate, -364); break;
    default: return { from: '', to: '' };
  }

  return { from: toISODateLocal(fromDate), to: toISODateLocal(finalToDate) };
}

function isDateWithinRange(value, dateRange = {}) {
  const rowDate = parseDateToLocalDay(value);
  if (!rowDate) return true;
  const fromDate = parseDateToLocalDay(dateRange?.from);
  const toDate = parseDateToLocalDay(dateRange?.to);
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
}

function matchesSelectionMap(map, value, { splitValues = false } = {}) {
  if (!hasActiveSelections(map)) return true;
  const raw = `${value ?? ''}`;
  const candidates = splitValues
    ? raw.split(',').map(normalizeCell).filter(Boolean)
    : [normalizeCell(raw)].filter(Boolean);
  if (candidates.length === 0) return false;
  return candidates.some((c) => map[c] === 1);
}

function filterActivityRows(rows, filterState = {}) {
  const {
    channels = {},
    technologies = {},
    categories = {},
    authors = {},
    contributors = {},
    languages = {},
    featuredOnly = false,
    datePreset = 'showAll',
    dateRange = { from: '', to: '' },
  } = filterState;

  // Resolve date range from preset if not custom
  const resolvedDateRange = datePreset === 'custom' || datePreset === 'showAll'
    ? dateRange
    : (getDateRangeForPreset(datePreset) || dateRange);

  return rows.filter((row) => {
    if (featuredOnly && !isTruthyFlag(pickFirst(row, FEATURED_KEYS))) return false;
    if (!isDateWithinRange(pickFirst(row, FIELD.date), resolvedDateRange)) return false;
    return [
      [channels, pickFirst(row, FIELD.channelOwner), false],
      [technologies, pickFirst(row, FIELD.technology), true],
      [categories, pickFirst(row, FIELD.category), false],
      [authors, pickFirst(row, FIELD.publisher), false],
      [contributors, pickFirst(row, FIELD.peopleInvolved), true],
      [languages, pickFirst(row, FIELD.language), false],
    ].every(([map, val, split]) => matchesSelectionMap(map, val, { splitValues: split }));
  });
}

// ── State decoding (mirrors apply-filters.js decodeShareState) ─────────────────

const DATE_PRESETS = new Set([
  'showAll', 'last30', 'last60', 'last90',
  'thisMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'pastYear', 'custom',
]);

function decodeStateParam(encoded) {
  if (!encoded) return null;
  try {
    const normalized = `${encoded}`
      .replace(/\s/g, '+')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decompressed = decompressFromBase64(normalized);
    if (!decompressed) return null;
    const parsed = JSON.parse(decompressed);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeFlags(input) {
  const out = {
    technologies: {},
    categories: {},
    channels: {},
    authors: {},
    contributors: {},
    languages: {},
    featuredOnly: false,
    datePreset: 'showAll',
    dateRange: { from: '', to: '' },
  };
  if (!input || typeof input !== 'object') return out;

  for (const key of ['technologies', 'categories', 'channels', 'authors', 'contributors', 'languages']) {
    if (input[key] && typeof input[key] === 'object') out[key] = input[key];
  }
  if (typeof input.featuredOnly === 'boolean') out.featuredOnly = input.featuredOnly;
  if (typeof input.datePreset === 'string' && DATE_PRESETS.has(input.datePreset)) {
    out.datePreset = input.datePreset;
  }
  if (input.dateRange && typeof input.dateRange === 'object') {
    out.dateRange = {
      from: typeof input.dateRange.from === 'string' ? input.dateRange.from : '',
      to: typeof input.dateRange.to === 'string' ? input.dateRange.to : '',
    };
    if (!input.datePreset) out.datePreset = 'custom';
  }
  return out;
}

function flagsFromStateParam(encoded) {
  const parsed = decodeStateParam(encoded);
  if (!parsed) return null;
  // Support both nested { filters: {...} } and flat { technologies: {...}, ... }
  const rawFlags = (parsed.filters && typeof parsed.filters === 'object') ? parsed.filters : parsed;
  return normalizeFlags(rawFlags);
}

// ── Filter description (used in feed title) ────────────────────────────────────

function describeFlags(flags) {
  const parts = [];
  const sel = (map) => Object.entries(map || {}).filter(([, v]) => v === 1).map(([k]) => k);

  const topics = sel(flags.technologies);
  const cats = sel(flags.categories);
  const channels = sel(flags.channels);
  const authors = sel(flags.authors);
  const contributors = sel(flags.contributors);
  const langs = sel(flags.languages);

  if (topics.length) parts.push(`topics: ${topics.join(', ')}`);
  if (cats.length) parts.push(`types: ${cats.join(', ')}`);
  if (channels.length) parts.push(`channels: ${channels.join(', ')}`);
  if (authors.length) parts.push(`publishers: ${authors.join(', ')}`);
  if (contributors.length) parts.push(`people: ${contributors.join(', ')}`);
  if (langs.length) parts.push(`languages: ${langs.join(', ')}`);
  if (flags.featuredOnly) parts.push('featured only');
  if (flags.datePreset && flags.datePreset !== 'showAll') parts.push(`date: ${flags.datePreset}`);

  return parts.length ? parts.join(' · ') : null;
}

// ── RSS 2.0 builder ────────────────────────────────────────────────────────────

function escapeXml(str) {
  return `${str ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRSS(items, { feedTitle, feedDescription, feedLink, selfUrl }) {
  const now = new Date().toUTCString();
  const itemsXml = items.map((row) => {
    const title = pickFirst(row, FIELD.title);
    const url = pickFirst(row, FIELD.url);
    const date = pickFirst(row, FIELD.date);
    const author = pickFirst(row, FIELD.publisher);
    const category = pickFirst(row, FIELD.category);
    const technology = pickFirst(row, FIELD.technology);
    const channel = pickFirst(row, FIELD.channelOwner);
    const contributors = pickFirst(row, FIELD.peopleInvolved);
    const language = pickFirst(row, FIELD.language);

    const pubDate = parseDateToLocalDay(date);
    const pubDateStr = pubDate ? pubDate.toUTCString() : '';

    // Build description with available metadata
    const meta = [
      author && `Publisher: ${author}`,
      channel && `Channel: ${channel}`,
      contributors && `People involved: ${contributors}`,
      category && `Type: ${category}`,
      technology && `Topics: ${technology}`,
      language && `Language: ${language}`,
    ].filter(Boolean).join(' | ');

    return [
      '    <item>',
      `      <title>${escapeXml(title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      pubDateStr && `      <pubDate>${escapeXml(pubDateStr)}</pubDate>`,
      author && `      <author>${escapeXml(author)}</author>`,
      category && `      <category>${escapeXml(category)}</category>`,
      meta && `      <description>${escapeXml(meta)}</description>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(feedTitle)}</title>`,
    `    <link>${escapeXml(feedLink)}</link>`,
    `    <description>${escapeXml(feedDescription)}</description>`,
    `    <lastBuildDate>${escapeXml(now)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    '  </channel>',
    '</rss>',
  ].join('\n');
}

// ── Sort rows by date descending ───────────────────────────────────────────────

function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => {
    const da = parseDateToLocalDay(pickFirst(a, FIELD.date));
    const db = parseDateToLocalDay(pickFirst(b, FIELD.date));
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });
}

// ── HTTP handler ───────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (reqUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  if (reqUrl.pathname !== '/feed.xml') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Use GET /feed.xml?state=<LZString>');
    return;
  }

  try {
    const rows = await getCachedRows();

    const stateParam = reqUrl.searchParams.get('state');
    const flags = stateParam
      ? (flagsFromStateParam(stateParam) ?? normalizeFlags(null))
      : normalizeFlags(null);

    const filtered = filterActivityRows(rows, flags);
    const sorted = sortByDateDesc(filtered);
    const limited = sorted.slice(0, MAX_ITEMS);

    const filterDesc = describeFlags(flags);
    const feedTitle = filterDesc
      ? `Esri Developers Activity — ${filterDesc}`
      : 'Esri Developers Activity';
    const feedDescription = filterDesc
      ? `Esri developer content filtered by: ${filterDesc}`
      : 'Latest content and activity from Esri developers';

    // Self URL: points to this server, not the static web app.
    // Override via RSS_SERVER_URL env var when deployed (e.g. https://home.example.com:3001).
    const serverBase = (process.env.RSS_SERVER_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
    const selfUrl = stateParam
      ? `${serverBase}/feed.xml?state=${encodeURIComponent(stateParam)}`
      : `${serverBase}/feed.xml`;

    const xml = buildRSS(limited, {
      feedTitle,
      feedDescription,
      feedLink: FEED_BASE_URL,
      selfUrl,
    });

    res.writeHead(200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
      'X-Total-Filtered': filtered.length,
      'X-Total-Source': rows.length,
    });
    res.end(xml);

    logger.info(`Served ${limited.length}/${rows.length} items — state:${stateParam ? 'yes' : 'none'} ip:${req.socket?.remoteAddress ?? '-'}`);
  } catch (err) {
    logger.error('Request failed', err instanceof Error ? err : new Error(String(err)));
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end(`Feed temporarily unavailable: ${err.message}`);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.on('error', (err) => {
  logger.error('HTTP server error', err);
  // EADDRINUSE means port is taken — no point retrying, exit so PM2 can alert
  if (err.code === 'EADDRINUSE') process.exit(1);
});

server.listen(PORT, () => {
  logger.info(`RSS server started — http://localhost:${PORT}/feed.xml`);
  logger.info(`Cache TTL: ${CACHE_TTL_MS / 1000}s | Max items: ${MAX_ITEMS}`);
});

// Graceful shutdown: finish in-flight requests before exiting
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit if requests don't finish in 10s
  setTimeout(() => { logger.warn('Forced exit after timeout'); process.exit(1); }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
