import { createServiceSupabase } from '@/lib/supabase/server';

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

async function dismissCookieBanners(page: import('puppeteer').Page) {
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
        b.click();
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

/**
 * Captura con Puppeteer las primeras URLs, sube JPEG al bucket `screenshots` y devuelve metadata por URL.
 * Si falta service role o Puppeteer falla, devuelve un Map vacío (el análisis web sigue).
 */
export async function captureWebScreenshotsToStorage(
  urls: string[],
  projectId: string,
  options?: { maxPages?: number }
): Promise<Map<string, ScreenshotMetadata>> {
  const results = new Map<string, ScreenshotMetadata>();
  const maxPages = options?.maxPages ?? 3;
  const list = urls.slice(0, maxPages).filter(Boolean);

  if (list.length === 0) return results;
  if (process.env.DISABLE_PUPPETEER_SCREENSHOTS === '1') {
    console.warn('[screenshots] DISABLE_PUPPETEER_SCREENSHOTS=1: capturas automáticas desactivadas');
    return results;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.warn('[screenshots] Sin SUPABASE_SERVICE_ROLE_KEY: no se suben capturas al Storage');
    return results;
  }

  let puppeteer: typeof import('puppeteer');
  try {
    puppeteer = await import('puppeteer');
  } catch (e) {
    console.warn('[screenshots] Puppeteer no disponible:', e);
    return results;
  }

  const supabase = createServiceSupabase();
  await ensureBucket(supabase);

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1400,900',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(30_000);

    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      const slug = folderSlugFromUrl(url, i);
      const safe = storageSafeSlug(slug);
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
        await dismissCookieBanners(page);
        await delay(1200);

        const heroRaw = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
        const fullRaw = await page.screenshot({ type: 'jpeg', quality: 82, fullPage: true });
        const heroBuf = Buffer.from(heroRaw);
        const fullBuf = Buffer.from(fullRaw);

        if (heroBuf.length < 500) {
          console.warn('[screenshots] Captura demasiado pequeña:', url);
          continue;
        }

        const ts = Date.now();
        const heroPath = `${projectId}/${safe}-hero-${ts}.jpg`;
        const fullPath = `${projectId}/${safe}-full-${ts}.jpg`;

        const { error: e1 } = await supabase.storage.from(BUCKET).upload(heroPath, heroBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (e1) {
          console.error('[screenshots] Upload hero:', e1.message);
          continue;
        }

        const { error: e2 } = await supabase.storage.from(BUCKET).upload(fullPath, fullBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (e2) console.error('[screenshots] Upload full:', e2.message);

        const { data: pubHero } = supabase.storage.from(BUCKET).getPublicUrl(heroPath);
        const { data: pubFull } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
        const heroUrl = pubHero?.publicUrl;
        const fullUrl = pubFull?.publicUrl || heroUrl;

        if (heroUrl) {
          results.set(url, {
            screenshot_url: heroUrl,
            portfolio_hero: heroUrl,
            portfolio_full: fullUrl || heroUrl,
            portfolio_folder: slug,
          });
        }
      } catch (err) {
        console.error('[screenshots] Error en', url, err);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
