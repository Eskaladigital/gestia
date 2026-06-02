/**
 * Script puntual de mantenimiento (Nine Waves). El flujo normal ya no requiere esto:
 * la app sincroniza reglas con npm run references:sync-rules.
 * Uso: node -r ./scripts/preload-tls-local.cjs scripts/fix-nine-waves-fidelity.mjs
 * Ver README.md (junio 2026).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NINE_WAVES_PROJECT_ID = '8b6fca1c-be66-48f1-a0c1-5ecd208f1711';

const PHYSICAL_CONSTRAINTS = `Las saunas portátiles Nine Waves son saunas de BARRIL de exterior: cuerpo cilíndrico horizontal de madera oscura o negra, con bandas metálicas de refuerzo, puerta frontal con ventana (circular o rectangular pequeña) y chimenea de leña visible en un lateral o en la cubierta del barril; en uso puede salir humo o vapor blanco. NUNCA son cabañas rectangulares, tiendas de campaña de lona con ventanas triangulares ni estructuras tipo tipi o cúpula geométrica de lona.

Distribución interior (desde la entrada hacia el fondo): calentador o estufa de leña en un lateral al entrar; banco o bancos de madera a uno o ambos lados siguiendo la curvatura del barril; pasillo central bajo para los pies. La madera interior es más clara que el exterior. La luz entra por la puerta o una ventana lateral pequeña.

Las imágenes deben situar el producto en entorno natural (bosque, lago, nieve, montaña, atardecer junto al agua). Prohibido urbano, calle, parking, interior de edificio u oficina. Las personas son secundarias, naturales, en bañador o toalla; el protagonista es la sauna.

Identidad: respetar siempre la silueta de barril, la chimenea y los materiales madera oscura o negro. No inventar otra tipología de sauna ni logos o marcas ajenas como elemento principal del producto. Paleta coherente: tonos oscuros de madera, negro, humo blanco, verdes o azules del paisaje; acento cálido terracota solo en atardeceres si encaja con la escena.`;

/** Ajustes por nombre de archivo (referencias ya subidas). */
const REFERENCE_FIXES = [
  {
    match: 'double decker',
    patch: {
      reference_role: 'product',
      reference_view: 'interior',
      role_is_manual: true,
      product_identity: 'interior de sauna de barril Nine Waves',
      product_traits:
        'curvatura cilíndrica del barril · bancos de madera a los lados · estufa de leña visible · luz por ventana o puerta · madera clara en interior',
    },
  },
  {
    match: 'leaves and lake',
    patch: {
      reference_role: 'product',
      reference_view: 'exterior',
      role_is_manual: true,
      product_identity: 'sauna de barril portátil Nine Waves exterior',
      product_traits:
        'cuerpo cilíndrico horizontal · madera oscura o negra · chimenea con humo · ventana o puerta frontal · junto a agua o naturaleza',
    },
  },
  {
    match: 'guy coming out',
    patch: {
      reference_role: 'product',
      reference_view: 'exterior',
      role_is_manual: true,
      product_identity: 'sauna de barril portátil Nine Waves con puerta abierta',
      product_traits:
        'forma de barril · exterior negro o madera oscura · puerta frontal · chimenea · entorno natural',
    },
  },
  {
    match: 'two blokes',
    patch: {
      reference_role: 'product',
      reference_view: 'exterior',
      role_is_manual: true,
      product_identity: 'sauna de barril portátil Nine Waves exterior',
      product_traits:
        'cilindro horizontal · color negro o madera oscura · chimenea · ventana frontal · humo opcional',
    },
  },
  {
    match: 'sundown',
    patch: {
      reference_role: 'place',
      reference_view: null,
      role_is_manual: true,
      product_identity: null,
      product_traits: null,
    },
  },
];

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan variables Supabase en .env.local');
    process.exit(1);
  }

  const service = createClient(url, key);
  const now = new Date().toISOString();

  const { error: projErr } = await service
    .from('projects')
    .update({
      physical_constraints: PHYSICAL_CONSTRAINTS,
      physical_constraints_at: now,
    })
    .eq('id', NINE_WAVES_PROJECT_ID);

  if (projErr) {
    console.error('Error guardando reglas físicas:', projErr.message);
    process.exit(1);
  }
  console.log('✓ Reglas físicas Nine Waves actualizadas (estilo FurgoCasa, barril).');

  const { data: refs, error: refErr } = await service
    .from('project_reference_images')
    .select('id, original_filename')
    .eq('project_id', NINE_WAVES_PROJECT_ID);

  if (refErr) {
    console.error('Error leyendo referencias:', refErr.message);
    process.exit(1);
  }

  for (const ref of refs || []) {
    const name = (ref.original_filename || '').toLowerCase();
    const fix = REFERENCE_FIXES.find(f => name.includes(f.match));
    if (!fix) continue;

    const { error } = await service
      .from('project_reference_images')
      .update(fix.patch)
      .eq('id', ref.id);

    if (error) {
      console.warn(`✗ ${ref.original_filename}:`, error.message);
    } else {
      console.log(`✓ Referencia ${ref.original_filename} → ${fix.patch.reference_role}${fix.patch.reference_view ? ` / ${fix.patch.reference_view}` : ''}`);
    }
  }

  console.log('\nListo. Regenera imágenes de Nine Waves para aplicar fidelidad de barril.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
