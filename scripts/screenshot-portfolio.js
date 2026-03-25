/**
 * Capturas con Puppeteer → bucket Supabase `screenshots` (público) + URLs en metadata.
 *
 *   npm run screenshot:portfolio -- --project-id=<uuid>
 *     → scraped_content: captura cada URL, sube hero.jpg + full al Storage, actualiza metadata.
 *
 *   PORTFOLIO_WEBS no vacío + --project-id=...
 *     → Misma subida al Storage (no toca la BD).
 *
 *   PORTFOLIO_WEBS sin --project-id
 *     → Solo public/portfolio/{slug}/ (local).
 *
 * .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORTFOLIO_DIR = path.join(ROOT, 'public', 'portfolio');
const BUCKET = 'screenshots';

/** @type {{ url: string, slug: string, name?: string }[]} */
const PORTFOLIO_WEBS = [
  // { url: 'https://ejemplo.com', slug: 'ejemplo', name: 'Ejemplo' },
];

const VIEWPORT = { width: 1400, height: 900 };
const NAV_TIMEOUT_MS = 30000;
const EXTRA_WAIT_MS = 1200;

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

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseProjectIdArg() {
  const arg = process.argv.find(a => a.startsWith('--project-id='));
  if (!arg) return null;
  return arg.split('=')[1]?.trim() || null;
}

function folderSlugFromUrl(url, index) {
  try {
    const u = new URL(url);
    let s = `${u.hostname}${u.pathname}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    if (!s) s = 'page';
    s = `${String(index).padStart(2, '0')}-${s}`.slice(0, 80);
    return s;
  } catch {
    return `page-${index}`;
  }
}

function storageSafeSlug(slug) {
  return String(slug).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function dismissCookieBanners(page) {
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

/**
 * @param {import('puppeteer').Page} page
 * @param {{ url: string, slug: string, name?: string }} entry
 * @param {{ saveLocal: boolean }} opts
 */
async function captureBuffers(page, entry, opts = { saveLocal: false }) {
  console.log(`→ ${entry.name || entry.slug}: ${entry.url}`);

  await page.goto(entry.url, {
    waitUntil: 'networkidle2',
    timeout: NAV_TIMEOUT_MS,
  });

  await dismissCookieBanners(page);
  await delay(EXTRA_WAIT_MS);

  const hero = await page.screenshot({
    type: 'jpeg',
    quality: 88,
    fullPage: false,
  });

  const full = await page.screenshot({
    type: 'jpeg',
    quality: 82,
    fullPage: true,
  });

  if (opts.saveLocal) {
    const outDir = path.join(PORTFOLIO_DIR, entry.slug);
    fs.mkdirSync(outDir, { recursive: true });
    const heroPath = path.join(outDir, 'hero.jpg');
    const fullPath = path.join(outDir, 'screenshot-full.jpg');
    fs.writeFileSync(heroPath, hero);
    fs.writeFileSync(fullPath, full);
    console.log(`  ✓ local ${path.relative(ROOT, heroPath)}`);
  }

  return { hero, full };
}

async function ensureBucket(supabase) {
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} slug
 * @param {Buffer} heroBuf
 * @param {Buffer} fullBuf
 */
async function uploadToStorage(supabase, projectId, slug, heroBuf, fullBuf) {
  const safe = storageSafeSlug(slug);
  const ts = Date.now();
  const heroPath = `${projectId}/${safe}-hero-${ts}.jpg`;
  const fullPath = `${projectId}/${safe}-full-${ts}.jpg`;

  if (!heroBuf?.length || heroBuf.length < 500) {
    console.error('  ✗ Buffer hero demasiado pequeño, se omite subida');
    return { heroUrl: null, fullUrl: null };
  }

  const { error: e1 } = await supabase.storage.from(BUCKET).upload(heroPath, heroBuf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (e1) {
    console.error('  ✗ Upload hero:', e1.message);
    return { heroUrl: null, fullUrl: null };
  }

  const { error: e2 } = await supabase.storage.from(BUCKET).upload(fullPath, fullBuf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (e2) console.error('  ✗ Upload full:', e2.message);

  const { data: pubHero } = supabase.storage.from(BUCKET).getPublicUrl(heroPath);
  const { data: pubFull } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);

  const heroUrl = pubHero?.publicUrl || null;
  const fullUrl = pubFull?.publicUrl || null;
  console.log(`  ✓ Storage hero → ${heroUrl}`);
  if (fullUrl) console.log(`  ✓ Storage full → ${fullUrl}`);
  return { heroUrl, fullUrl };
}

/**
 * @param {{ url: string, slug: string, name?: string }[]} list
 * @param {{ projectId: string | null, supabase: any | null, saveLocal: boolean }} ctx
 */
async function runCaptures(list, ctx) {
  fs.mkdirSync(PORTFOLIO_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  });

  const results = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    for (const entry of list) {
      try {
        const saveLocal = ctx.saveLocal && !ctx.supabase;
        const { hero, full } = await captureBuffers(page, entry, { saveLocal });

        let heroUrl = null;
        let fullUrl = null;
        if (ctx.supabase && ctx.projectId) {
          await ensureBucket(ctx.supabase);
          const up = await uploadToStorage(ctx.supabase, ctx.projectId, entry.slug, hero, full);
          heroUrl = up.heroUrl;
          fullUrl = up.fullUrl;
        }

        results.push({ entry, heroUrl, fullUrl });
      } catch (err) {
        console.error(`  ✗ Error en ${entry.url}:`, err.message || err);
        results.push({ entry, heroUrl: null, fullUrl: null, error: err });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function runFromSupabaseProject(projectId) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from('scraped_content')
    .select('id, url, metadata')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase:', error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.error('No hay filas en scraped_content para este proyecto. Ejecuta antes "Analizar web".');
    process.exit(1);
  }

  const list = rows.map((row, i) => ({
    url: row.url,
    slug: folderSlugFromUrl(row.url, i),
    name: row.url,
  }));

  const results = await runCaptures(list, { projectId, supabase, saveLocal: false });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const r = results[i];
    if (!r?.heroUrl) continue;

    const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
    const slug = list[i].slug;
    meta.portfolio_folder = slug;
    meta.screenshot_url = r.heroUrl;
    meta.portfolio_hero = r.heroUrl;
    meta.portfolio_full = r.fullUrl || meta.portfolio_full;

    const { error: upErr } = await supabase.from('scraped_content').update({ metadata: meta }).eq('id', row.id);
    if (upErr) console.error(`No se pudo actualizar ${row.id}:`, upErr.message);
    else console.log(`  DB ✓ ${row.id}`);
  }

  console.log('\nListo. Miniaturas en Storage (`screenshots`). Recarga la ficha del proyecto.');
}

async function main() {
  loadEnvLocal();
  const projectId = parseProjectIdArg();

  if (PORTFOLIO_WEBS.length > 0) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let supabase = null;
    if (url && key) {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(url, key);
    }
    if (projectId && supabase) {
      await runCaptures(PORTFOLIO_WEBS, { projectId, supabase, saveLocal: false });
      console.log(
        '\nSubido al bucket `screenshots`. Esta lista no actualiza `scraped_content` (solo URLs manuales).'
      );
      return;
    }
    if (!projectId && supabase) {
      console.warn('PORTFOLIO_WEBS: añade --project-id=<uuid> para subir miniaturas a Supabase Storage.\n');
    }
    await runCaptures(PORTFOLIO_WEBS, { projectId: null, supabase: null, saveLocal: true });
    console.log('\nHecho (solo archivos locales en public/portfolio/).');
    return;
  }

  if (projectId) {
    await runFromSupabaseProject(projectId);
    return;
  }

  console.log(`Uso principal (miniaturas en Storage + metadata):
  npm run screenshot:portfolio -- --project-id=<uuid>

Tras "Analizar web", el script captura cada URL de scraped_content, sube a bucket \`screenshots\` y guarda las URLs en metadata.

Opcional: entradas en PORTFOLIO_WEBS + mismo --project-id → sube esas URLs al Storage (sin actualizar BD).
`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
