// ============================================================
// Capa de Scraping - Interfaz abstracta + proveedor real con fetch
// ============================================================

import { ScrapedContentType, ScrapingSource } from '@/types';

export interface ScrapedPage {
  url: string;
  content: string;
  type: ScrapedContentType;
  metadata?: Record<string, unknown>;
}

export interface ScrapeMultipleOptions {
  /** Por defecto MAX_PAGES (8). Competidores / lotes grandes pueden subir el tope. */
  maxPages?: number;
}

export interface DiscoverPagesOptions {
  /** Cuántas URLs internas priorizadas añadir además de la home (por defecto MAX_PAGES - 1). */
  maxExtraPages?: number;
}

export interface ScrapingProvider {
  name: ScrapingSource;
  scrapeUrl(url: string): Promise<ScrapedPage>;
  scrapeMultiple(urls: string[], options?: ScrapeMultipleOptions): Promise<ScrapedPage[]>;
  discoverPages(baseUrl: string, options?: DiscoverPagesOptions): Promise<string[]>;
}

export function getScrapingProvider(): ScrapingProvider {
  return new RealScrapingProvider();
}

// ============================================================
// Real Scraping Provider - fetch + parse HTML
// ============================================================

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FETCH_TIMEOUT = 12000;
const MAX_PAGES = 8;
const MIN_TEXT_CHARS_FOR_FETCH = 180;
const APIFY_API_BASE = 'https://api.apify.com/v2';
const DEFAULT_WEB_CRAWLER_ACTOR = 'apify~website-content-crawler';
const APIFY_RUN_TIMEOUT_SEC = 120;

function normalizeUrl(raw: string): string {
  if (raw.startsWith('http')) return raw;
  return `https://${raw}`;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractTextFromHTML(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&[a-z]+;/gi, ' ');
  text = text.replace(/&#\d+;/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim().substring(0, 5000);
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(normalizeUrl(baseUrl));
  const links: string[] = [];
  const seen = new Set<string>();

  const hrefRegex = /<a[^>]+href=["']([^"'#?]+)/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], base.origin);
      if (resolved.hostname !== base.hostname) continue;

      const clean = resolved.origin + resolved.pathname.replace(/\/$/, '');
      if (seen.has(clean)) continue;
      seen.add(clean);

      const ext = resolved.pathname.split('.').pop()?.toLowerCase() || '';
      if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'pdf', 'zip', 'css', 'js', 'xml', 'ico'].includes(ext)) continue;

      links.push(clean);
    } catch {}
  }

  return links;
}

/** Evita confundir tokens Tailwind / variables semánticas con nombres de fuente. */
function isTailwindFontUtilityToken(part: string): boolean {
  const p = part.trim().toLowerCase();
  return /^font-(sans|serif|mono|heading|body|display|medium|bold|light|thin|black|extralight|semibold|extrabold|normal)$/.test(p);
}

function inferPageType(url: string): ScrapedContentType {
  const lower = url.toLowerCase();
  if (lower.match(/\/(about|nosotros|quienes-somos|empresa|who-we-are)/)) return 'about';
  if (lower.match(/\/(service|servicio|solucion|what-we-do)/)) return 'services';
  if (lower.match(/\/(blog|noticias|news|articulo|magazine)/)) return 'blog';
  if (lower.match(/\/(contact|contacto|get-in-touch)/)) return 'contact';
  if (lower.match(/\/(price|precio|tarifa|planes|pricing)/)) return 'pricing';
  const path = new URL(lower.startsWith('http') ? lower : `https://${lower}`).pathname;
  if (path === '' || path === '/') return 'home';
  return 'other';
}

const GENERIC_FONT_NAMES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  'inherit', 'initial', 'unset', 'revert',
  '-apple-system', 'blinkmacsystemfont',
  'arial', 'helvetica', 'helvetica neue', 'sans',
  'times new roman', 'times', 'courier new', 'courier',
  'verdana', 'georgia', 'palatino', 'garamond',
  'trebuchet ms', 'impact', 'segoe ui', 'tahoma',
]);

function isGenericFont(name: string): boolean {
  return GENERIC_FONT_NAMES.has(name.toLowerCase().trim());
}

function extractFontsFromHTML(html: string): string[] {
  const fonts = new Set<string>();
  let m;

  // Google Fonts via <link> href
  const gfRegex = /fonts\.googleapis\.com\/css2?\?family=([^"'&)]+)/gi;
  while ((m = gfRegex.exec(html)) !== null) {
    const families = decodeURIComponent(m[1]).split('|');
    for (const fam of families) {
      const name = fam.split(':')[0].replace(/\+/g, ' ').trim();
      if (name && !isGenericFont(name)) fonts.add(name);
    }
  }

  // Google Fonts via @import url(...) inside CSS
  const importRegex = /@import\s+url\s*\(\s*['"]?([^'")\s]+fonts\.googleapis\.com\/css2?\?family=[^'")\s]+)/gi;
  while ((m = importRegex.exec(html)) !== null) {
    const urlStr = m[1];
    const famMatch = urlStr.match(/family=([^&"')\s]+)/);
    if (famMatch) {
      const families = decodeURIComponent(famMatch[1]).split('|');
      for (const fam of families) {
        const name = fam.split(':')[0].replace(/\+/g, ' ').trim();
        if (name && !isGenericFont(name)) fonts.add(name);
      }
    }
  }

  // @font-face declarations
  const fontFaceRegex = /@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}\)]+)/gi;
  while ((m = fontFaceRegex.exec(html)) !== null) {
    const name = m[1].replace(/['"]/g, '').trim();
    if (name && name.length < 60 && !isGenericFont(name)) fonts.add(name);
  }

  // font-family declarations
  const ffRegex = /font-family\s*:\s*['"]?([^;'"}\)]+)/gi;
  while ((m = ffRegex.exec(html)) !== null) {
    const raw = m[1].replace(/!important/gi, '').trim();
    const parts = raw.split(',').map(p => p.replace(/['"]/g, '').trim());
    for (const part of parts) {
      if (!part || part.length < 2 || part.length >= 60) continue;
      if (/^var\s*\(/i.test(part) || /^--/.test(part)) continue;
      if (isTailwindFontUtilityToken(part)) continue;
      if (!isGenericFont(part)) {
        fonts.add(part);
      }
    }
  }

  return Array.from(fonts);
}

async function fetchExternalCSS(html: string, baseUrl: string): Promise<string> {
  const base = new URL(normalizeUrl(baseUrl));
  const cssUrls: string[] = [];

  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    try {
      cssUrls.push(new URL(m[1], base.origin).href);
    } catch {}
  }
  const linkRegex2 = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi;
  while ((m = linkRegex2.exec(html)) !== null) {
    try {
      cssUrls.push(new URL(m[1], base.origin).href);
    } catch {}
  }

  const unique = [...new Set(cssUrls)].slice(0, 8);
  const results: string[] = [];

  for (const url of unique) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        results.push(text.substring(0, 20000));
      }
    } catch {}
  }

  return results.join('\n');
}

function apifyActorIdFromEnv(): string {
  const raw = process.env.APIFY_WEB_CRAWLER_ACTOR_ID?.trim() || DEFAULT_WEB_CRAWLER_ACTOR;
  return raw.replace(/\//g, '~');
}

function parseApifyDatasetItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Record<string, unknown>[] }).items;
  }
  return [];
}

function primaryTextFromApifyItem(item: Record<string, unknown>): string {
  const text = item.text;
  const md = item.markdown;
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (typeof md === 'string' && md.trim()) return md.trim();
  return '';
}

function extractLinksFromMarkdown(markdown: string, baseUrl: string): string[] {
  const base = new URL(normalizeUrl(baseUrl));
  const links: string[] = [];
  const seen = new Set<string>();
  const re = /\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    try {
      const resolved = new URL(m[1]);
      if (resolved.hostname !== base.hostname) continue;
      const clean = resolved.origin + resolved.pathname.replace(/\/$/, '');
      if (seen.has(clean)) continue;
      seen.add(clean);
      links.push(clean);
    } catch {
      /* skip */
    }
  }
  return links;
}

/** Una sola URL vía Apify Website Content Crawler (refuerzo tras fetch). */
async function runApifyWebsiteContentCrawler(
  pageUrl: string,
  options: { saveHtml: boolean }
): Promise<{ text: string; html: string | null; markdown: string } | null> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) return null;

  const actorId = apifyActorIdFromEnv();
  const qs = new URLSearchParams({
    timeout: String(APIFY_RUN_TIMEOUT_SEC),
    memory: '1024',
  });
  const endpoint = `${APIFY_API_BASE}/acts/${encodeURIComponent(actorId)}/runs/run-sync-get-dataset-items?${qs}`;

  const body = {
    startUrls: [{ url: pageUrl }],
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    saveHtml: options.saveHtml,
    proxyConfiguration: { useApifyProxy: true },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (APIFY_RUN_TIMEOUT_SEC + 20) * 1000);
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

    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    const items = parseApifyDatasetItems(data);
    if (items.length === 0) return null;

    const item = items[0];
    let text = primaryTextFromApifyItem(item);
    const mdRaw = item.markdown;
    const markdown = typeof mdRaw === 'string' ? mdRaw : '';
    const htmlRaw = item.html;
    const html = typeof htmlRaw === 'string' && htmlRaw.length > 0 ? htmlRaw : null;
    if (!text.trim() && html) text = extractTextFromHTML(html);
    if (!text.trim() && markdown.trim()) text = markdown.trim();
    if (!text.trim()) return null;

    return { text: text.trim(), html, markdown };
  } catch {
    return null;
  }
}

function shouldTryApifyFallback(html: string | null, extractedText: string): boolean {
  if (!process.env.APIFY_API_TOKEN?.trim()) return false;
  if (!html) return true;
  return extractedText.trim().length < MIN_TEXT_CHARS_FOR_FETCH;
}

class RealScrapingProvider implements ScrapingProvider {
  name: ScrapingSource = 'custom';

  async scrapeUrl(url: string): Promise<ScrapedPage> {
    const normalized = normalizeUrl(url);
    const html = await safeFetch(normalized);
    const textFromFetch = html ? extractTextFromHTML(html) : '';
    const fonts = html ? extractFontsFromHTML(html) : [];

    if (shouldTryApifyFallback(html, textFromFetch)) {
      const apify = await runApifyWebsiteContentCrawler(normalized, { saveHtml: false });
      if (apify) {
        const content = apify.text.substring(0, 5000);
        const fontsFromApify = apify.html ? extractFontsFromHTML(apify.html) : [];
        return {
          url: normalized,
          content,
          type: inferPageType(normalized),
          metadata: {
            scraped_at: new Date().toISOString(),
            provider: 'apify',
            fallback_from: html ? 'thin_fetch' : 'fetch_failed',
            html_length: apify.html?.length ?? apify.text.length,
            detected_fonts: fontsFromApify.length ? fontsFromApify : fonts,
          },
        };
      }
    }

    if (!html) {
      return {
        url: normalized,
        content: `[No se pudo acceder a ${normalized}]`,
        type: inferPageType(normalized),
        metadata: { scraped_at: new Date().toISOString(), provider: 'fetch', status: 0 },
      };
    }

    return {
      url: normalized,
      content: textFromFetch,
      type: inferPageType(normalized),
      metadata: {
        scraped_at: new Date().toISOString(),
        provider: 'fetch',
        status: 200,
        html_length: html.length,
        detected_fonts: fonts,
      },
    };
  }

  async scrapeMultiple(urls: string[], options?: ScrapeMultipleOptions): Promise<ScrapedPage[]> {
    const cap = Math.min(options?.maxPages ?? MAX_PAGES, 80);
    const results: ScrapedPage[] = [];
    for (const url of urls.slice(0, cap)) {
      results.push(await this.scrapeUrl(url));
      await new Promise(r => setTimeout(r, 300));
    }
    return results;
  }

  async discoverPages(baseUrl: string, options?: DiscoverPagesOptions): Promise<string[]> {
    const normalized = normalizeUrl(baseUrl);
    let html = await safeFetch(normalized);
    let linkHintMarkdown = '';

    if (!html && process.env.APIFY_API_TOKEN?.trim()) {
      const apify = await runApifyWebsiteContentCrawler(normalized, { saveHtml: true });
      if (apify?.html) html = apify.html;
      else if (apify) linkHintMarkdown = apify.markdown || apify.text;
    }

    let allLinks = html ? extractLinks(html, normalized) : [];

    if (allLinks.length === 0 && linkHintMarkdown) {
      allLinks = extractLinksFromMarkdown(linkHintMarkdown, normalized);
    }

    if (allLinks.length === 0 && html && process.env.APIFY_API_TOKEN?.trim()) {
      const apify = await runApifyWebsiteContentCrawler(normalized, { saveHtml: true });
      if (apify?.html) allLinks = extractLinks(apify.html, normalized);
      if (allLinks.length === 0 && (apify?.markdown || apify?.text)) {
        allLinks = extractLinksFromMarkdown(apify.markdown || apify.text, normalized);
      }
    }

    if (allLinks.length === 0) return [normalized];

    const homeUrl = normalized.replace(/\/$/, '');

    const scored = allLinks
      .filter(link => link !== homeUrl)
      .map(link => {
        let score = 0;
        const path = new URL(link).pathname.toLowerCase();
        const segments = path.split('/').filter(Boolean);
        if (segments.length <= 2) score += 2;
        if (segments.length === 1) score += 3;
        if (path.match(/\/(about|nosotros|quienes-somos|empresa)/)) score += 5;
        if (path.match(/\/(service|servicio|solucion|producto)/)) score += 5;
        if (path.match(/\/(contact|contacto)/)) score += 4;
        if (path.match(/\/(blog|noticias|news)/)) score += 3;
        if (path.match(/\/(price|precio|tarifa|plan)/)) score += 4;
        if (path.match(/\/(faq|preguntas)/)) score += 3;
        if (path.match(/\/(team|equipo)/)) score += 3;
        if (path.match(/\/(camper|autocaravana|furgo|van|alquiler|flota)/i)) score += 5;
        if (path.match(/\/(legal|privacy|cookie|aviso-legal|politica)/)) score -= 3;
        if (path.match(/\/(wp-admin|wp-login|feed|xmlrpc|wp-json)/)) score -= 10;
        if (path.match(/\/(cart|checkout|account|login|register)/)) score -= 5;
        return { url: link, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const extraCap = options?.maxExtraPages ?? MAX_PAGES - 1;
    const topPages = scored.slice(0, Math.max(0, extraCap)).map(s => s.url);
    return [normalized, ...topPages];
  }
}

export { extractFontsFromHTML, fetchExternalCSS, extractTextFromHTML, safeFetch, normalizeUrl, extractLinks };
