/**
 * Crea (o reutiliza) el proyecto Rebel Classic Raid con configuración editorial
 * lista para pipeline: marca → web → competencia → estrategia → calendario → briefs.
 *
 * Uso:
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-rebel-classic-raid.mjs
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-rebel-classic-raid.mjs --confirm
 *
 * Por defecto solo previsualiza. Con --confirm escribe en Supabase.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OWNER_USER_ID = '36d17b7c-ec7f-454a-bcb4-6caa895477a8'; // info@chevy-one.com
const PROJECT_NAME = 'Rebel Classic Raid';
const PROJECT_URL = 'https://rebelclassicraid.com/';

const RCR_AI_RULES = `LÍNEA EDITORIAL (PRIORITARIA — define DE QUÉ VA el contenido):
- Rebel Classic Raid (RCR) NO es una cuenta que "vende una inscripción": es una cuenta de AVENTURA CLÁSICA OFFROAD, al nivel de las mejores revistas/comunidades de motos vintage y raids africanos. Primero enamoramos con la experiencia (desierto, polvo, motos clásicas, rock & roll, libertad, camaradería); la inscripción aparece como consecuencia natural, nunca como protagonista permanente.
- MENOS ficha de producto, MÁS espíritu rebelde. Reduce al mínimo los posts tipo checklist ("qué incluye", "precio", "documentación", "ferry", "pensión completa") salvo cuando aporten storytelling o urgencia real (plazas limitadas, early bird). Cuando un tema útil sea necesario, cuéntalo DESDE la emoción del raid, no como FAQ.
- Reparto editorial deseado (oriéntate a él):
  · ~45% EXPERIENCIA / LIFESTYLE DEL RAID: Marruecos en moto clásica (desiertos, montañas, pistas, atardeceres, polvo, campamentos, risas), +1800 km, espíritu de primavera y rock & roll.
  · ~20% CULTURA DE MOTOS CLÁSICAS TRAIL: Yamaha Ténéré, Honda XR/Africa Twin clásicas, BMW GS de época, KTM, Suzuki… garajes, restauración, "sacar la moto del polvo", prep mecánica con cariño (no tutorial técnico seco).
  · ~15% COMUNIDAD / TRIBU RCR: pilotos, amigos, solo o acompañado, fiesta fin de raid, vínculos que se crean en la pista, voz de Mario Montoro y el legado Veteranas Offroad sin nostalgia vacía.
  · ~20% UTILIDAD / CONVERSIÓN: requisitos de moto (pre-1999), early bird 25 plazas, fechas 2ª edición (16–24 abril 2027), CTA a reserva — siempre en minoría y con urgencia auténtica, no spam.
- Cada pieza debe transmitir DESEO de estar ahí: polvo en la cara, libertad sin reloj inteligente, moto analógica. Si solo informa y no hace soñar con Marruecos, replantéala.

VOZ Y TONO (innegociable):
- Habla de TÚ. Directo, rebelde, cercano, con humor rockero e inteligente. Guiños a los 80/90, Dakar de época, Delorean, fiestas de primavera. Sin postureo de "lujo adventure travel" ni lenguaje corporativo de tour operador.
- PROHIBIDOS clichés genéricos de agencia ("vive la experiencia única", "no te lo puedes perder", "aventura de ensueño") si no tienen sustancia concreta RCR.
- El producto es una EXPERIENCIA con plazas limitadas (2.500 € primeros 25 / 2.900 € resto), no un viaje turístico empaquetado.

HECHOS REALES QUE HAY QUE RESPETAR (no inventar):
- Evento: Rebel Classic Raid — 2ª edición, 16–24 abril 2027, Marruecos, +1800 km.
- Motos: offroad clásicas anteriores a 31/12/1999 (o diseño anterior aunque matriculadas después).
- Incluye (cuando hablemos de logística): ferry ES–MA, alojamientos, pensión completa, apoyo, asistencia mecánica/sanitaria, permisos, baliza, caja 45 L, welcome pack, fiesta fin de raid.
- No incluye: bebidas, gasolina, gastos personales.
- Organizador: Mario Montoro (ex Veteranas Offroad; colaboraciones Motosx1000, Motoviajeros, Clásicas Onroad, 1000 Dunas).
- Contacto real: info@rebelclassicraid.com / +34 642 294 797.
- Diferenciador vs raids "pro"/cronometrados: no competitivo; esencia viaje aventura, vínculos, GPS+track, espíritu vintage.

IMÁGENES — EXPERIENCIA PRIMERO:
- Prioriza escenas reales de raid/offroad clásico: motos trail vintage en pistas marroquíes, polvo, dunas, montañas del Atlas, campamentos, manos con grasa, cascos y gafas de época, atardeceres, grupo de riders, ferry, mapa/track.
- Variedad de planos: aéreo/paisaje con moto pequeña, plano medio en marcha, detalle mecánico, convivencia, noche de campamento. No repetir siempre "moto heroica en duna al atardecer".
- Presencia humana media-alta: pilotos naturales, no modelos de stock. Alterna con y sin personas.
- Estética: reportaje aventurero, luz natural (día, golden hour alto), grano/look documental; nada de look luxury safari ni póster CGI.
- PROHIBIDO inventar logos de sponsors, dorsal falso o marca de moto ilegible; si aparece moto, que sea creíble como clásica trail pre-2000.
- No hace falta que TODA imagen sea "producto RCR"; puede ser cultura clásica / deseo de África / vida de garaje.

REGLAS DE VARIEDAD ENTRE PUBLICACIONES:
- Misma cocina cromática (tierra, ocre, azul cielo, polvo, negro moto) pero sujetos y planos distintos en posts consecutivos.
- Evitar dos piezas seguidas solo comerciales o solo de precio.
- Carruseles: micro-historia (salida → pista → descanso → llegada/emoción), no álbum de la misma moto.`;

const COMPETITORS = [
  {
    name: '1000 Dunas Raid',
    url: 'https://1000dunas.com/',
    reason:
      'Raid profesional en Marruecos con categoría Classics (motos pre-2000). Competidor directo de territorio y público; más rally/crono vs espíritu no competitivo de RCR.',
  },
  {
    name: 'Motoviajeros',
    url: 'https://www.motoviajeros.es/',
    reason:
      'Comunidad y medios de viajes en moto; solapan audiencia de aventura y clásicas. Referente de tono y contenido lifestyle moto-viaje.',
  },
  {
    name: 'MotorBeach / prensa raids',
    url: 'https://motorbeach.com/',
    reason:
      'Medio que cubre raids y aventura moto (incluida cobertura RCR). Útil como referente de narrativa y ángulo editorial del sector.',
  },
];

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  loadEnvLocal();
  const confirm = hasFlag('confirm');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await sb
    .from('projects')
    .select('id, name, status, url')
    .ilike('name', '%Rebel Classic%')
    .is('deleted_at', null);

  const payload = {
    user_id: OWNER_USER_ID,
    name: PROJECT_NAME,
    url: PROJECT_URL,
    sector: 'Raids y aventura en moto clásica',
    location: 'España / Marruecos (Granada · organización)',
    description:
      'Rebel Classic Raid (RCR) es un raid de aventura en Marruecos exclusivo para motos offroad clásicas (diseño anterior a 2000). 2ª edición: 16–24 abril 2027, +1800 km de desiertos, montañas y pistas. Experiencia no competitiva impulsada por Mario Montoro (ex Veteranas Offroad): espíritu rebelde, rock & roll, camaradería y logística completa (ferry, alojamientos, pensión completa, asistencia). Early bird 2.500 € (primeros 25) / 2.900 € resto. Objetivo de marca: enamorar con la aventura clásica y llenar plazas limitadas.',
    client_type: 'b2c',
    primary_goal: 'leads',
    secondary_goals: ['branding', 'comunidad'],
    tone_formality: 28,
    tone_proximity: 22,
    tone_emotion: 78,
    tone_humor: 62,
    tone_disruption: 72,
    content_style: {
      personal: 70,
      comercial: 28,
      educativo: 32,
      corporativo: 18,
      inspiracional: 90,
      entretenimiento: 75,
    },
    commercial_level: 'medio',
    complexity: 'medio',
    human_presence: 'alta',
    experimentation: 'equilibrado',
    weekly_format_distribution: {
      story: 2,
      carrusel: 2,
      publicacion: 1,
      reel: 2,
    },
    posts_per_week: 7,
    ai_rules: RCR_AI_RULES,
    sells_physical_product: false,
    status: 'draft',
    onboarding_step: 5,
  };

  console.log(`Proyecto: ${PROJECT_NAME}`);
  console.log(`URL: ${PROJECT_URL}`);
  console.log(`Owner: ${OWNER_USER_ID}`);
  console.log(`Existentes con nombre similar: ${(existing || []).length}`);
  for (const e of existing || []) {
    console.log(`  - ${e.id} | ${e.name} | ${e.status}`);
  }

  if (!confirm) {
    console.log('\n(dry-run) Config que se aplicaría:');
    console.log(JSON.stringify({ ...payload, ai_rules: `(${RCR_AI_RULES.length} chars)` }, null, 2));
    console.log('\nCompetidores:', COMPETITORS.map(c => c.name).join(', '));
    console.log('\nPasa --confirm para crear/actualizar.');
    return;
  }

  let projectId = existing?.[0]?.id;
  if (projectId) {
    console.log(`\nActualizando proyecto existente ${projectId}…`);
    const { error } = await sb.from('projects').update(payload).eq('id', projectId);
    if (error) {
      console.error('Error update:', error.message);
      process.exit(1);
    }
    await sb.from('competitors').delete().eq('project_id', projectId);
  } else {
    console.log('\nCreando proyecto nuevo…');
    const { data, error } = await sb.from('projects').insert(payload).select('id').single();
    if (error) {
      console.error('Error insert:', error.message);
      process.exit(1);
    }
    projectId = data.id;
  }

  const { error: cErr } = await sb.from('competitors').insert(
    COMPETITORS.map(c => ({ project_id: projectId, ...c }))
  );
  if (cErr) {
    console.error('Error competidores:', cErr.message);
    process.exit(1);
  }

  console.log(`\n✓ Proyecto listo: ${projectId}`);
  console.log(`  Ficha: /projects/${projectId}`);
  console.log('  Siguiente: pipeline marca → web → competidores → estrategia → calendario agosto 2026 → briefs');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
