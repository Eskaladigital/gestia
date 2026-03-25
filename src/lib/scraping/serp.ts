/**
 * Búsqueda Google orgánica:
 * - Apify (Google Search Scraper actor)
 * - SearchAPI.io → SEARCHAPI_API_KEY
 * - SerpAPI.com → SERPAPI_KEY (mismo JSON organic_results)
 * SERP_PROVIDER: auto | apify_only | searchapi_only (REST = SearchAPI.io y/o SerpAPI)
 */

const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_GOOGLE_SEARCH_TIMEOUT_SEC = 180;
const DEFAULT_GOOGLE_SEARCH_ACTOR = 'apify~google-search-scraper';
const SEARCHAPI_DEFAULT_BASE = 'https://www.searchapi.io/api/v1/search';

function normalizeUrl(raw: string): string {
  if (raw.startsWith('http')) return raw;
  return `https://${raw}`;
}

function hostnameKeyFromUrl(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function shouldSkipSerpHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const tests = [
    /google\./,
    /gstatic|googleusercontent/,
    /facebook\.com|fb\.com|instagram\.com|twitter\.com/,
    /^x\.com$/,
    /linkedin\.com|tiktok\.com|youtube\.com|youtu\.be/,
    /pinterest\.|reddit\.com|wikipedia\.org/,
    /amazon\.|ebay\./,
    /tripadvisor\.|yelp\./,
    /bing\.com|yahoo\.com/,
  ];
  return tests.some(t => t.test(h));
}

function parseApifyDatasetItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Record<string, unknown>[] }).items;
  }
  return [];
}

function collectOrganicUrlsFromApifyItems(items: Record<string, unknown>[]): string[] {
  const urls: string[] = [];
  for (const item of items) {
    const organic = item.organicResults;
    if (Array.isArray(organic)) {
      for (const r of organic) {
        if (r && typeof r === 'object' && typeof (r as { url?: string }).url === 'string') {
          const u = (r as { url: string }).url.trim();
          if (u.startsWith('http') && !u.includes('google.com/search')) urls.push(u);
        }
      }
    }
  }
  return urls;
}

function collectOrganicRichFromApifyItems(items: Record<string, unknown>[]): Array<{
  link: string;
  title: string;
  snippet: string;
}> {
  const out: Array<{ link: string; title: string; snippet: string }> = [];
  for (const item of items) {
    const organic = item.organicResults;
    if (!Array.isArray(organic)) continue;
    for (const r of organic) {
      if (!r || typeof r !== 'object') continue;
      const o = r as { url?: string; title?: string; description?: string; snippet?: string };
      const link = typeof o.url === 'string' ? o.url.trim() : '';
      if (!link.startsWith('http') || link.includes('google.com/search')) continue;
      out.push({
        link,
        title: typeof o.title === 'string' ? o.title : '',
        snippet: (typeof o.snippet === 'string' ? o.snippet : o.description) || '',
      });
    }
  }
  return out;
}

function apifyGoogleSearchActorId(): string {
  const raw = process.env.APIFY_GOOGLE_SEARCH_ACTOR_ID?.trim() || DEFAULT_GOOGLE_SEARCH_ACTOR;
  return raw.replace(/\//g, '~');
}

async function apifyGoogleSearchRaw(queries: string[]): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token || queries.length === 0) return [];

  const actorId = apifyGoogleSearchActorId();
  const qs = new URLSearchParams({
    timeout: String(APIFY_GOOGLE_SEARCH_TIMEOUT_SEC),
    memory: '1024',
  });
  const endpoint = `${APIFY_API_BASE}/acts/${encodeURIComponent(actorId)}/runs/run-sync-get-dataset-items?${qs}`;

  const body = {
    queries: queries.join('\n'),
    maxPagesPerQuery: 1,
    resultsPerPage: 15,
    languageCode: 'es',
    countryCode: 'es',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (APIFY_GOOGLE_SEARCH_TIMEOUT_SEC + 25) * 1000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[serp-apify] HTTP', res.status, await res.text().catch(() => ''));
      return [];
    }

    const data = (await res.json()) as unknown;
    return parseApifyDatasetItems(data);
  } catch (e) {
    console.warn('[serp-apify]', e);
    return [];
  }
}

async function searchApiGoogleRaw(
  query: string,
  opts: { location?: string | null; gl?: string; hl?: string }
): Promise<Record<string, unknown> | null> {
  const key = process.env.SEARCHAPI_API_KEY?.trim();
  if (!key || !query.trim()) return null;

  const base = process.env.SEARCHAPI_BASE_URL?.trim() || SEARCHAPI_DEFAULT_BASE;
  const u = new URL(base);
  u.searchParams.set('engine', 'google');
  u.searchParams.set('q', query.trim());
  u.searchParams.set('api_key', key);
  u.searchParams.set('gl', opts.gl || 'es');
  u.searchParams.set('hl', opts.hl || 'es');
  if (opts.location?.trim()) u.searchParams.set('location', opts.location.trim());

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const res = await fetch(u.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[serp-searchapi] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn('[serp-searchapi]', e);
    return null;
  }
}

/** SerpAPI.com (search.json) — misma forma de `organic_results` que SearchAPI.io */
async function serpApiComGoogleRaw(
  query: string,
  opts: { location?: string | null; gl?: string; hl?: string }
): Promise<Record<string, unknown> | null> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key || !query.trim()) return null;

  const u = new URL('https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google');
  u.searchParams.set('q', query.trim());
  u.searchParams.set('api_key', key);
  u.searchParams.set('gl', opts.gl || 'es');
  u.searchParams.set('hl', opts.hl || 'es');
  if (opts.location?.trim()) u.searchParams.set('location', opts.location.trim());

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const res = await fetch(u.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[serp-serpapi.com] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn('[serp-serpapi.com]', e);
    return null;
  }
}

function hasOrganicResults(data: Record<string, unknown> | null): boolean {
  const o = data?.organic_results;
  return Array.isArray(o) && o.length > 0;
}

/** Una petición Google orgánica vía REST: prioriza SearchAPI.io, si no hay resultados SerpAPI.com */
async function fetchOrganicGoogleJson(
  query: string,
  opts: { location?: string | null; gl?: string; hl?: string }
): Promise<Record<string, unknown> | null> {
  if (process.env.SEARCHAPI_API_KEY?.trim()) {
    const d = await searchApiGoogleRaw(query, opts);
    if (hasOrganicResults(d)) return d;
  }
  if (process.env.SERPAPI_KEY?.trim()) {
    const d = await serpApiComGoogleRaw(query, opts);
    if (hasOrganicResults(d)) return d;
  }
  return null;
}

/** Hay al menos un proveedor REST (SearchAPI.io o SerpAPI.com) configurado */
export function hasGoogleSerpRestKey(): boolean {
  return !!(process.env.SEARCHAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim());
}

function organicUrlsFromSearchApiJson(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const organic = data.organic_results;
  if (!Array.isArray(organic)) return [];
  const urls: string[] = [];
  for (const r of organic) {
    if (r && typeof r === 'object' && typeof (r as { link?: string }).link === 'string') {
      const link = (r as { link: string }).link.trim();
      if (link.startsWith('http') && !link.includes('google.com/search')) urls.push(link);
    }
  }
  return urls;
}

function organicRichFromSearchApiJson(data: Record<string, unknown> | null): Array<{
  link: string;
  title: string;
  snippet: string;
}> {
  if (!data) return [];
  const organic = data.organic_results;
  if (!Array.isArray(organic)) return [];
  return organic
    .map(r => {
      if (!r || typeof r !== 'object') return null;
      const o = r as { link?: string; title?: string; snippet?: string };
      const link = typeof o.link === 'string' ? o.link.trim() : '';
      if (!link.startsWith('http') || link.includes('google.com/search')) return null;
      return {
        link,
        title: typeof o.title === 'string' ? o.title : '',
        snippet: typeof o.snippet === 'string' ? o.snippet : '',
      };
    })
    .filter((x): x is { link: string; title: string; snippet: string } => x != null);
}

function filterAndDedupeUrls(
  rawUrls: string[],
  excludeHosts: Set<string>,
  maxUrls: number
): string[] {
  const out: string[] = [];
  const seenHost = new Set<string>();
  for (const raw of rawUrls) {
    const host = hostnameKeyFromUrl(raw);
    if (!host || excludeHosts.has(host)) continue;
    if (shouldSkipSerpHost(host)) continue;
    if (seenHost.has(host)) continue;
    seenHost.add(host);
    out.push(raw);
    if (out.length >= maxUrls) break;
  }
  return out;
}

type SerpMode = 'auto' | 'apify_only' | 'searchapi_only';

function serpMode(): SerpMode {
  const m = (process.env.SERP_PROVIDER || 'auto').trim().toLowerCase();
  if (m === 'apify_only' || m === 'apify') return 'apify_only';
  if (m === 'searchapi_only' || m === 'searchapi') return 'searchapi_only';
  return 'auto';
}

/**
 * URLs orgánicas para descubrir y scrapear competidores (o sitios relacionados).
 */
export async function discoverCompetitorUrlsFromGoogle(params: {
  queries: string[];
  excludeHosts: Set<string>;
  maxUrls: number;
}): Promise<string[]> {
  const queries = params.queries.map(q => q.trim()).filter(q => q.length > 2);
  if (queries.length === 0 || params.maxUrls <= 0) return [];

  const mode = serpMode();
  const want = params.maxUrls * 3;
  let pooled: string[] = [];

  if (mode === 'searchapi_only') {
    for (const q of queries) {
      if (pooled.length >= want) break;
      const data = await fetchOrganicGoogleJson(q, {});
      pooled.push(...organicUrlsFromSearchApiJson(data));
    }
  } else if (mode === 'apify_only') {
    const items = await apifyGoogleSearchRaw(queries);
    pooled = collectOrganicUrlsFromApifyItems(items);
  } else {
    if (process.env.APIFY_API_TOKEN?.trim()) {
      const items = await apifyGoogleSearchRaw(queries);
      pooled = collectOrganicUrlsFromApifyItems(items);
    }
    if (pooled.length === 0 && hasGoogleSerpRestKey()) {
      for (const q of queries) {
        if (pooled.length >= want) break;
        const data = await fetchOrganicGoogleJson(q, {});
        pooled.push(...organicUrlsFromSearchApiJson(data));
      }
    }
  }

  return filterAndDedupeUrls(pooled, params.excludeHosts, params.maxUrls);
}

function dedupeRichByHost(
  rows: Array<{ link: string; title: string; snippet: string }>
): Array<{ link: string; title: string; snippet: string }> {
  const seen = new Set<string>();
  const out: Array<{ link: string; title: string; snippet: string }> = [];
  for (const r of rows) {
    const h = hostnameKeyFromUrl(r.link);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(r);
  }
  return out;
}

/**
 * Texto para el prompt de «Analizar web»: resultados Google (títulos + snippets + enlaces).
 * Prioriza REST (SearchAPI.io y luego SerpAPI.com) si hay clave; `apify_only` solo Apify; `searchapi_only` solo REST.
 */
export async function fetchSerpContextForBusinessAnalysis(opts: {
  queries: string[];
  maxLinesPerQuery: number;
  location?: string | null;
}): Promise<string> {
  const queries = opts.queries.map(q => q.trim()).filter(q => q.length > 2);
  if (queries.length === 0) return '';

  const mode = serpMode();
  const perQ = Math.max(1, Math.min(opts.maxLinesPerQuery, 12));
  const maxTotal = Math.min(20, perQ * queries.length);
  const loc = opts.location ?? undefined;

  const formatRows = (
    label: string,
    rows: Array<{ link: string; title: string; snippet: string }>
  ): string => {
    if (rows.length === 0) return '';
    const lines = rows.slice(0, maxTotal).map((r, i) => {
      const sn = r.snippet ? ` — ${r.snippet}` : '';
      return `${i + 1}. ${r.title || r.link}${sn}\n   ${r.link}`;
    });
    return [
      `## Contexto desde Google (${label})`,
      'Resultados orgánicos; pueden incluir competidores o el sector. Úsalo como contexto de mercado; el sitio del cliente está en el bloque scrapeado.',
      '',
      `Consultas: ${queries.map(q => `«${q}»`).join(' · ')}`,
      '',
      ...lines,
    ].join('\n');
  };

  const restLabel = process.env.SEARCHAPI_API_KEY?.trim()
    ? 'SearchAPI.io'
    : process.env.SERPAPI_KEY?.trim()
      ? 'SerpAPI'
      : 'Google (REST)';

  if (mode === 'searchapi_only' || (mode === 'auto' && hasGoogleSerpRestKey())) {
    const merged: Array<{ link: string; title: string; snippet: string }> = [];
    for (const q of queries) {
      const data = await fetchOrganicGoogleJson(q, { location: loc });
      merged.push(...organicRichFromSearchApiJson(data));
    }
    const unique = dedupeRichByHost(merged);
    if (unique.length > 0) return formatRows(restLabel, unique);
    if (mode === 'searchapi_only') return '';
  }

  if (mode === 'apify_only' || (mode === 'auto' && process.env.APIFY_API_TOKEN?.trim())) {
    const items = await apifyGoogleSearchRaw(queries);
    const rich = dedupeRichByHost(collectOrganicRichFromApifyItems(items));
    if (rich.length > 0) return formatRows('Apify', rich);
  }

  return '';
}
