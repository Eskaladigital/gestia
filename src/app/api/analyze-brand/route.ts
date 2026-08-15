import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';
import { callAI, buildBrandRecognitionPrompt } from '@/lib/ai';
import {
  safeFetch,
  normalizeUrl,
  extractFontsFromHTML,
  fetchExternalCSS,
} from '@/lib/scraping/provider';
import type { BrandColorEntry, BrandFontEntry, BrandIdentityDetail } from '@/types';

export const maxDuration = 300;
export const runtime = 'nodejs';

interface BrandAnalysisResult {
  brand_colors: Array<{
    hex: string;
    name: string;
    usage: string;
    notes?: string;
    found_in?: string;
  }>;
  brand_fonts: Array<{
    name: string;
    usage: string;
    notes?: string;
    weights?: string;
    fallbacks?: string;
  }>;
  brand_logo_url: string | null;
  brand_favicon_url: string | null;
  brand_summary: string | null;
  brand_identity_detail?: BrandIdentityDetail | null;
}

function clipStr(s: unknown, max: number): string | undefined {
  if (s == null) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function sanitizeStringArray(a: unknown, maxItems: number, itemMax: number): string[] {
  if (!Array.isArray(a)) return [];
  return a
    .map(x => clipStr(x, itemMax))
    .filter((x): x is string => !!x)
    .slice(0, maxItems);
}

function sanitizeBrandIdentityDetail(raw: unknown): BrandIdentityDetail | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const detail: BrandIdentityDetail = {};

  const long = (key: keyof BrandIdentityDetail, max: number) => {
    const v = clipStr(o[key as string], max);
    if (v) (detail as Record<string, unknown>)[key as string] = v;
  };

  long('palette_analysis', 8000);
  long('typography_analysis', 8000);
  long('layout_components', 8000);
  long('imagery_iconography', 8000);
  long('accessibility_notes', 4000);

  detail.brand_feel_keywords = sanitizeStringArray(o.brand_feel_keywords, 24, 80);
  detail.rrss_practical_tips = sanitizeStringArray(o.rrss_practical_tips, 20, 500);
  detail.dos = sanitizeStringArray(o.dos, 16, 400);
  detail.donts = sanitizeStringArray(o.donts, 16, 400);

  if (Array.isArray(o.css_tokens_cited)) {
    const tokens = o.css_tokens_cited
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const it = item as Record<string, unknown>;
        const token = clipStr(it.token, 120);
        const role = clipStr(it.role, 300);
        if (!token) return null;
        return { token, role: role || '' };
      })
      .filter((x): x is { token: string; role: string } => !!x)
      .slice(0, 30);
    if (tokens.length) detail.css_tokens_cited = tokens;
  }

  const nonEmpty =
    !!detail.palette_analysis ||
    !!detail.typography_analysis ||
    !!detail.layout_components ||
    !!detail.imagery_iconography ||
    !!detail.accessibility_notes ||
    (detail.brand_feel_keywords?.length ?? 0) > 0 ||
    (detail.rrss_practical_tips?.length ?? 0) > 0 ||
    (detail.dos?.length ?? 0) > 0 ||
    (detail.donts?.length ?? 0) > 0 ||
    (detail.css_tokens_cited?.length ?? 0) > 0;

  return nonEmpty ? detail : null;
}

function normalizeBrandHex(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || /^null$/i.test(s)) return null;

  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Math.min(255, Math.max(0, parseInt(rgb[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgb[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgb[3], 10)));
    return (
      '#' +
      [r, g, b]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  if (!s.startsWith('#')) s = `#${s.replace(/^#/, '')}`;
  let h = s
    .slice(1)
    .replace(/[^0-9a-fA-F]/g, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return null;
  return `#${h.toLowerCase()}`;
}

function hslToHex(h: number, s: number, l: number): string | null {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  const hex = `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  return hex.length === 7 ? hex : null;
}

function extractColorLiterals(text: string): string[] {
  const set = new Set<string>();

  const hexRe = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  let m;
  while ((m = hexRe.exec(text)) !== null) {
    const n = normalizeBrandHex(m[0]);
    if (n) set.add(n);
  }

  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
  while ((m = rgbRe.exec(text)) !== null) {
    const n = normalizeBrandHex(m[0]);
    if (n) set.add(n);
  }

  const hslRe = /hsla?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%/gi;
  while ((m = hslRe.exec(text)) !== null) {
    const n = hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    if (n) set.add(n);
  }

  const varRe = /--[\w-]*(?:color|bg|background|border|text|accent|primary|secondary|brand|surface)[\w-]*\s*:\s*([^;}{]+)/gi;
  while ((m = varRe.exec(text)) !== null) {
    const val = m[1].trim();
    const innerHex = val.match(/#([0-9a-fA-F]{3,8})\b/);
    if (innerHex) {
      const n = normalizeBrandHex(innerHex[0]);
      if (n) set.add(n);
    }
    const innerRgb = val.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (innerRgb) {
      const n = normalizeBrandHex(innerRgb[0]);
      if (n) set.add(n);
    }
  }

  return [...set];
}

function sanitizeBrandColors(colors: BrandAnalysisResult['brand_colors'] | null | undefined): BrandColorEntry[] {
  if (!colors?.length) return [];
  const map = new Map<string, BrandColorEntry>();
  for (const c of colors) {
    const hex = normalizeBrandHex(c.hex);
    if (!hex) continue;
    const key = hex.toLowerCase();
    const notes = clipStr(c.notes, 800);
    const found_in = clipStr(c.found_in, 400);
    const entry: BrandColorEntry = {
      hex,
      name: (c.name || 'Color').trim(),
      usage: (c.usage || 'primary').trim(),
      ...(notes ? { notes } : {}),
      ...(found_in ? { found_in } : {}),
    };
    const prev = map.get(key);
    if (!prev) {
      map.set(key, entry);
    } else {
      if (notes) {
        prev.notes = prev.notes ? `${prev.notes} · ${notes}` : notes;
      }
      if (found_in && !prev.found_in) prev.found_in = found_in;
    }
  }
  return [...map.values()].slice(0, 24);
}

function warmAccentScore(hex: string): number {
  const n = normalizeBrandHex(hex);
  if (!n) return 0;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  if (r < 170) return 0;
  if (b > 130 && b >= r - 30) return 0;
  if (g < 40 || g > 235) return 0;
  if (r >= g && g > b && r - b > 35) return 80 + (r - b) / 5;
  if (Math.abs(r - g) < 55 && r > 155 && b < 100) return 55;
  return 0;
}

function ensureSecondaryColor(colors: BrandColorEntry[], samples: string[]): BrandColorEntry[] {
  if (colors.some(c => c.usage === 'secondary')) return colors;
  const used = new Set(colors.map(c => c.hex.toLowerCase()));
  const primary = colors.find(c => c.usage === 'primary');
  if (!primary) return colors;
  const pHex = normalizeBrandHex(primary.hex);
  if (!pHex) return colors;
  const pR = parseInt(pHex.slice(1, 3), 16);
  const pG = parseInt(pHex.slice(3, 5), 16);
  const pB = parseInt(pHex.slice(5, 7), 16);

  const candidates = samples
    .map(h => normalizeBrandHex(h))
    .filter((h): h is string => !!h && !used.has(h.toLowerCase()))
    .map(h => {
      const r = parseInt(h.slice(1, 3), 16);
      const g = parseInt(h.slice(3, 5), 16);
      const b = parseInt(h.slice(5, 7), 16);
      const dist = Math.sqrt((r - pR) ** 2 + (g - pG) ** 2 + (b - pB) ** 2);
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      if (dist < 40 || lum > 240 || lum < 15) return null;
      return { h, dist };
    })
    .filter((x): x is { h: string; dist: number } => !!x)
    .sort((a, b) => b.dist - a.dist);

  const best = candidates[0];
  if (!best) return colors;
  return [...colors, { hex: best.h, name: 'Color secundario', usage: 'secondary' }];
}

function ensureAccentColor(colors: BrandColorEntry[], samples: string[]): BrandColorEntry[] {
  if (colors.some(c => c.usage === 'accent')) return colors;
  const used = new Set(colors.map(c => c.hex.toLowerCase()));
  const candidates = samples
    .map(h => normalizeBrandHex(h))
    .filter((h): h is string => !!h && !used.has(h.toLowerCase()))
    .map(h => ({ h, s: warmAccentScore(h) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const best = candidates[0];
  if (!best) return colors;
  return [...colors, { hex: best.h, name: 'Color de acento', usage: 'accent' }];
}

function isJunkFontName(name: string): boolean {
  const raw = name.trim();
  if (!raw) return true;
  if (/^var\s*\(/i.test(raw)) return true;
  const n = raw.toLowerCase();
  if (n.startsWith('--')) return true;
  if (/^font-(sans|serif|mono|heading|body|display|medium|bold|light|thin|black|extralight|semibold|extrabold|normal)$/.test(n)) return true;
  if (n.startsWith('font-[')) return true;
  return false;
}

function sanitizeBrandFonts(
  aiFonts: BrandAnalysisResult['brand_fonts'] | null | undefined,
  detected: string[]
): BrandFontEntry[] {
  const fromAi = (aiFonts || []).filter(f => f?.name && !isJunkFontName(f.name));
  const byKey = new Map<string, BrandFontEntry>();
  for (const f of fromAi) {
    const key = f.name.trim().toLowerCase();
    if (!byKey.has(key)) {
      const notes = clipStr(f.notes, 800);
      const weights = clipStr(f.weights, 200);
      const fallbacks = clipStr(f.fallbacks, 400);
      byKey.set(key, {
        name: f.name.trim(),
        usage: (f.usage || 'Uso en la web').trim(),
        ...(notes ? { notes } : {}),
        ...(weights ? { weights } : {}),
        ...(fallbacks ? { fallbacks } : {}),
      });
    }
  }
  let result = [...byKey.values()];

  const addDetected = () => {
    const have = new Set(result.map(r => r.name.toLowerCase()));
    for (const n of detected) {
      if (!n || isJunkFontName(n)) continue;
      const key = n.trim().toLowerCase();
      if (have.has(key)) continue;
      have.add(key);
      result.push({ name: n.trim(), usage: 'Detectada en la web' });
    }
  };

  if (result.length === 0) {
    result = detected
      .filter(n => n && !isJunkFontName(n))
      .map(n => ({ name: n.trim(), usage: 'Detectada en la web' }));
  } else {
    addDetected();
  }

  const seen = new Set<string>();
  return result.filter(r => {
    const k = r.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 16);
}

function extractRelevantHTML(html: string): string {
  const parts: string[] = [];

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) parts.push(headMatch[1]);

  const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (styleMatches) parts.push(styleMatches.slice(0, 8).join('\n'));

  const headerMatch = html.match(/<header[^>]*>([\s\S]*?)<\/header>/i);
  if (headerMatch) parts.push(headerMatch[0]);

  const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  if (footerMatch) parts.push(footerMatch[0].substring(0, 2000));

  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) parts.push(navMatch[0]);

  const inlineStyles = html.match(/style="[^"]*"/gi);
  if (inlineStyles) parts.push(inlineStyles.slice(0, 30).join('\n'));

  const linkTags = html.match(/<link[^>]*>/gi);
  if (linkTags) parts.push(linkTags.join('\n'));

  const metaTags = html.match(/<meta[^>]*>/gi);
  if (metaTags) parts.push(metaTags.join('\n'));

  const imgTags = html.match(/<img[^>]*>/gi);
  if (imgTags) parts.push(imgTags.slice(0, 20).join('\n'));

  return parts.join('\n\n--- SECCION ---\n\n').substring(0, 28000);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { project_id } = await request.json();
    if (!project_id) {
      return NextResponse.json({ error: 'project_id es obligatorio' }, { status: 400 });
    }

    const { project } = await fetchAccessibleProject(
      supabase,
      user.id,
      project_id,
      'id, name, url'
    );

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Sin URL no hay web de la que extraer identidad de marca. No es un error:
    // los proyectos temáticos conservan la marca copiada al clonar. Saltamos
    // este paso para no romper el "Todo en uno".
    if (!project.url) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'El proyecto no tiene URL; se mantiene la identidad de marca existente.',
      });
    }

    const url = normalizeUrl(project.url);
    const html = await safeFetch(url);
    if (!html) {
      return NextResponse.json({ error: `No se pudo acceder a ${url}` }, { status: 502 });
    }

    const externalCSS = await fetchExternalCSS(html, url);
    const detectedFonts = extractFontsFromHTML(html + '\n' + externalCSS);
    const relevantHTML = extractRelevantHTML(html);

    const enrichedContent = [
      relevantHTML,
      '\n\n--- CSS EXTERNO (extracto) ---\n\n',
      externalCSS.substring(0, 12000),
      '\n\n--- TIPOGRAFÍAS DETECTADAS POR PARSER ---\n\n',
      detectedFonts.length > 0
        ? detectedFonts.map(f => `- ${f}`).join('\n')
        : '(ninguna detectada)',
    ].join('');

    const hexSamples = extractColorLiterals(enrichedContent);

    const { system, user: userPrompt } = buildBrandRecognitionPrompt(
      project.name,
      project.url,
      enrichedContent,
      hexSamples
    );

    const aiResponse = await callAI<BrandAnalysisResult>(system, userPrompt, {
      agentKey: 'brand_recognition',
      userId: user.id,
      maxTokens: 12000,
    });

    const brandData = aiResponse.data;

    function resolveUrl(path: string | null, base: string): string | null {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      try {
        return new URL(path, base.startsWith('http') ? base : `https://${base}`).href;
      } catch {
        return path;
      }
    }

    let brand_colors = sanitizeBrandColors(brandData.brand_colors);
    brand_colors = ensureSecondaryColor(brand_colors, hexSamples);
    brand_colors = ensureAccentColor(brand_colors, hexSamples);
    const brand_fonts = sanitizeBrandFonts(brandData.brand_fonts, detectedFonts);
    const brand_identity_detail = sanitizeBrandIdentityDetail(brandData.brand_identity_detail);

    const updatePayload = {
      brand_colors,
      brand_fonts,
      brand_logo_url: resolveUrl(brandData.brand_logo_url, project.url),
      brand_favicon_url: resolveUrl(brandData.brand_favicon_url, project.url),
      brand_summary: clipStr(brandData.brand_summary, 8000) ?? null,
      brand_identity_detail,
      brand_analyzed_at: new Date().toISOString(),
    };

    await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', project_id);

    return NextResponse.json({
      success: true,
      brand: updatePayload,
      usage: aiResponse.usage,
      detected_fonts: detectedFonts,
    });
  } catch (error: any) {
    console.error('[analyze-brand] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
