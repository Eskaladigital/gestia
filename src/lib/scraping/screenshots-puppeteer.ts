import { createServiceSupabase } from '@/lib/supabase/server';
import type { Browser, Page } from 'puppeteer-core';
/**
 * Node-native require invisible al bundler (Turbopack no resuelve serverExternalPackages
 * correctamente — vercel/next.js#65828). eval('require') evita el análisis estático.
 */
// eslint-disable-next-line no-eval
const nativeRequire: NodeRequire = eval('require');

const BUCKET = 'screenshots';

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#cookiescript_accept',
  'button#cookiescript_accept',
  '.cc-allow',
  '.js-cookie-accept',
  '[aria-label="Accept cookies"]',
  '[aria-label="Aceptar"]',
  'button.cookie-accept',
  '.cmplz-accept',
  '#didomi-notice-agree-button',
];

export type ScreenshotMetadata = {
  screenshot_url: string;
  portfolio_hero: string;
  portfolio_full: string;
  portfolio_folder: string;
};

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function folderSlugFromUrl(url: string, index: number): string {
  try {
    const u = new URL(url);
    let s = `${u.hostname}${u.pathname}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    if (!s) s = 'page';
    return `${String(index).padStart(2, '0')}-${s}`.slice(0, 80);
  } catch {
    return `page-${index}`;
  }
}

function storageSafeSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

async function launchBrowser(): Promise<Browser> {
  if (isVercel) {
    const chromium: any = nativeRequire('@sparticuz/chromium');
    const puppeteerCore: any = nativeRequire('puppeteer-core');
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport ?? { width: 1400, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Browser;
  }

  const puppeteer: any = nativeRequire('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1400,900',
    ],
  }) as unknown as Browser;
}

async function dismissCookieBanners(page: Page) {
  for (const sel of COOKIE_SELECTORS) {
    try {
      const h = await page.$(sel);
      if (h) {
        await h.click({ delay: 50 });
        await delay(400);
        break;
      }
    } catch {
      /* ignore */
    }
  }
  await page.evaluate(() => {
    const texts = ['Aceptar', 'Accept all', 'Accept', 'Acepto', 'Okay', 'Entendido', 'I agree', 'Agree'];
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[href="#"]'));
    for (const b of nodes) {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (texts.some(x => t === x || t.startsWith(`${x} `))) {
        (b as HTMLElement).click();
        return;
      }
    }
  });
  await delay(300);
}

async function ensureBucket(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error && !String(error.message || '').includes('already exists')) {
    console.error('[screenshots] createBucket:', error.message);
  }
}

export type ScreenshotResult = {
  screenshots: Map<string, ScreenshotMetadata>;
  attempted: number;
  succeeded: number;
  skipped_reason: string | null;
  errors: string[];
};

/**
 * Captura con Puppeteer/Chromium las primeras URLs, sube JPEG al bucket `screenshots` y devuelve metadata por URL.
 * En Vercel usa @sparticuz/chromium (headless serverless); en local usa puppeteer con Chrome bundled.
 * Devuelve siempre un ScreenshotResult con detalles de éxito/fallo para diagnóstico.
 */
export async function captureWebScreenshotsToStorage(
  urls: string[],
  projectId: string,
  options?: { maxPages?: number }
): Promise<ScreenshotResult> {
  console.log(`[screenshots] ▶ captureWebScreenshotsToStorage llamada con ${urls.length} URLs, projectId=${projectId}`);
  console.log(`[screenshots]   URLs recibidas:`, urls.slice(0, 5));
  console.log(`[screenshots]   ENV: DISABLE=${process.env.DISABLE_PUPPETEER_SCREENSHOTS || '(no)'}, SERVICE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'sí (' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ' chars)' : 'NO'}, isVercel=${isVercel}`);

  const result: ScreenshotResult = {
    screenshots: new Map(),
    attempted: 0,
    succeeded: 0,
    skipped_reason: null,
    errors: [],
  };
  const maxPages = options?.maxPages ?? 3;
  const list = urls.slice(0, maxPages).filter(Boolean);

  if (list.length === 0) {
    result.skipped_reason = 'No hay URLs para capturar';
    console.warn('[screenshots] ⚠ list vacía tras filter(Boolean). URLs originales:', urls);
    return result;
  }
  if (process.env.DISABLE_PUPPETEER_SCREENSHOTS === '1') {
    result.skipped_reason = 'DISABLE_PUPPETEER_SCREENSHOTS=1';
    console.warn('[screenshots]', result.skipped_reason);
    return result;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    result.skipped_reason = 'Sin SUPABASE_SERVICE_ROLE_KEY: no se suben capturas al Storage';
    console.warn('[screenshots]', result.skipped_reason);
    return result;
  }

  let browser: Browser;
  try {
    console.log('[screenshots] Lanzando navegador…', isVercel ? '(Vercel / @sparticuz/chromium)' : '(local / puppeteer)');
    browser = await launchBrowser();
    console.log('[screenshots] Navegador lanzado OK');
  } catch (e: any) {
    const msg = `No se pudo lanzar el navegador: ${e?.message || e}`;
    result.skipped_reason = msg;
    result.errors.push(msg);
    console.error('[screenshots]', msg);
    return result;
  }

  const supabase = createServiceSupabase();
  try {
    await ensureBucket(supabase);
  } catch (e: any) {
    const msg = `Error creando bucket: ${e?.message || e}`;
    result.errors.push(msg);
    console.error('[screenshots]', msg);
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(30_000);

    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      result.attempted++;
      const slug = folderSlugFromUrl(url, i);
      const safe = storageSafeSlug(slug);
      try {
        console.log(`[screenshots] (${i + 1}/${list.length}) Navegando a ${url}…`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
        await dismissCookieBanners(page);
        await delay(1200);

        const heroRaw = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
        const fullRaw = await page.screenshot({ type: 'jpeg', quality: 82, fullPage: true });
        const heroBuf = Buffer.from(heroRaw);
        const fullBuf = Buffer.from(fullRaw);

        if (heroBuf.length < 500) {
          const msg = `Captura demasiado pequeña (${heroBuf.length} bytes) para ${url}`;
          result.errors.push(msg);
          console.warn('[screenshots]', msg);
          continue;
        }

        const ts = Date.now();
        const heroPath = `${projectId}/${safe}-hero-${ts}.jpg`;
        const fullPath = `${projectId}/${safe}-full-${ts}.jpg`;

        console.log(`[screenshots] Subiendo hero (${(heroBuf.length / 1024).toFixed(0)} KB) y full (${(fullBuf.length / 1024).toFixed(0)} KB)…`);

        const { error: e1 } = await supabase.storage.from(BUCKET).upload(heroPath, heroBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (e1) {
          const msg = `Upload hero falló para ${url}: ${e1.message}`;
          result.errors.push(msg);
          console.error('[screenshots]', msg);
          continue;
        }

        const { error: e2 } = await supabase.storage.from(BUCKET).upload(fullPath, fullBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (e2) {
          const msg = `Upload full falló para ${url}: ${e2.message}`;
          result.errors.push(msg);
          console.error('[screenshots]', msg);
        }

        const { data: pubHero } = supabase.storage.from(BUCKET).getPublicUrl(heroPath);
        const { data: pubFull } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
        const heroUrl = pubHero?.publicUrl;
        const fullUrl = pubFull?.publicUrl || heroUrl;

        if (heroUrl) {
          result.screenshots.set(url, {
            screenshot_url: heroUrl,
            portfolio_hero: heroUrl,
            portfolio_full: fullUrl || heroUrl,
            portfolio_folder: slug,
          });
          result.succeeded++;
          console.log(`[screenshots] ✓ ${url} → ${heroUrl}`);
        }
      } catch (err: any) {
        const msg = `Error capturando ${url}: ${err?.message || err}`;
        result.errors.push(msg);
        console.error('[screenshots]', msg);
      }
    }
  } finally {
    await browser.close();
    console.log(`[screenshots] Resultado: ${result.succeeded}/${result.attempted} capturas OK`);
  }

  return result;
}
