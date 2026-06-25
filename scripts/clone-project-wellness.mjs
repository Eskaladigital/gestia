/**
 * Clona un proyecto existente (p. ej. "Retiru") en uno nuevo aplicando una
 * reconfiguración de "MEDIO DE BIENESTAR" en todas las fases de configuración,
 * para que la estrategia/calendario que se generen DESPUÉS dejen de parecer un
 * catálogo de producto y pasen a ser una revista digital de bienestar.
 *
 * Qué hace:
 *   - Copia la fila de `projects` (datos de negocio, marca, tono…) a un proyecto
 *     NUEVO del mismo usuario, sobrescribiendo las palancas estratégicas:
 *       · sells_physical_product = false  (deja de anclar imágenes a un producto)
 *       · physical_constraints = null     (sin reglas físicas de catálogo)
 *       · commercial_level = 'bajo'
 *       · primary_goal = 'comunidad'
 *       · content_style (pesos) → inspiracional/educativo altos, comercial = 5
 *       · sliders de tono → cercano, emocional, inspirador
 *       · ai_rules (prioridad nº1 "ley absoluta") → posicionamiento editorial +
 *         reparto de pilares 50/20/15/10/5 (bienestar/yoga/naturaleza/educación/promo)
 *   - (Opcional) Copia los competidores.
 *   - (Opcional) Copia las imágenes de referencia al bucket del nuevo proyecto,
 *     forzando el rol "product" → "style" (moodboard, no producto a clonar).
 *   - NO copia estrategia ni calendario: deben regenerarse con la nueva config.
 *
 * SEGURIDAD: por defecto NO escribe nada (modo previsualización). Para crear el
 * proyecto de verdad hay que pasar EXPLÍCITAMENTE --confirm.
 *
 * PERFILES MONOTEMÁTICOS (--profile): cada uno es de UN SOLO tema, sin mezclar.
 *   - yoga        : "Retiru - Yoga"        (SOLO yoga: asana, pranayama, filosofía del yoga, comunidad).
 *   - wellness    : "Retiru - Wellness"    (SOLO bienestar/vida sana: hábitos, descanso, nutrición, estrés).
 *   - mindfulness : "Retiru - Mindfulness" (SOLO mindfulness/meditación).
 *   - ayurveda    : "Retiru - Ayurveda"    (SOLO ayurveda: doshas, alimentación, rutinas).
 *   Ninguno copia referencias (no arrastra el ADN de catálogo de retiru.com).
 *
 * Uso (Windows / proxy corporativo, usa el preload TLS como en references:*):
 *   # Crear un perfil nuevo a partir del Retiru original:
 *   node -r ./scripts/preload-tls-local.cjs scripts/clone-project-wellness.mjs --source-name="RetirU" --profile=mindfulness --confirm
 *   # Reconfigurar un proyecto YA existente (sin duplicar):
 *   node -r ./scripts/preload-tls-local.cjs scripts/clone-project-wellness.mjs --update-id=<uuid> --profile=yoga --confirm
 *
 * Flags:
 *   --profile=yoga|wellness|mindfulness|ayurveda   Perfil (def: wellness).
 *   --source-name="Retiru"        Nombre del proyecto origen (ilike). Alternativa a --source-id.
 *   --source-id=<uuid>            Id exacto del proyecto origen (tiene prioridad).
 *   --update-id=<uuid>            Aplica el perfil a un proyecto YA EXISTENTE (no clona).
 *   --delete-id=<uuid>            Borra un proyecto y sus filas hijas (requiere --confirm).
 *   --tune-id=<uuid>             Ajuste fino: reescribe SOLO ai_rules (Retiru original comercial).
 *   --new-name="..."              Nombre del proyecto nuevo (def: según el perfil).
 *   --confirm                     Ejecuta la escritura. SIN este flag solo previsualiza.
 *   --references / --no-references Forzar copiar / no copiar imágenes de referencia (def: según perfil).
 *   --no-competitors              No copiar competidores.
 *   --force                       Crea aunque ya exista un proyecto con el mismo nombre.
 *   --inspect                     Solo imprime la config clave del proyecto (--source-id/--source-name) y sale.
 *
 * Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PROJECT_REFERENCE_IMAGES_BUCKET = 'project-reference-images';

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

function getArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(a => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length).trim() : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sanitizeSegment(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildReferenceStoragePath(projectId, index, filename) {
  const safe = sanitizeSegment(filename || 'referencia.png') || 'referencia.png';
  return `${projectId}/${index}-${safe}`;
}

// ============================================================
// PERFILES DE RECONFIGURACIÓN
// ============================================================
// Cada perfil es una "clonación adaptativa": sobreescribe TODAS las palancas
// estratégicas del proyecto origen para que, al pulsar las 4 fases iniciales y
// generar el calendario, salga el contenido de ese tipo de cuenta.
//
// Sliders de tono 0..100. Semántica (low → high):
//  formality: informal → profesional · proximity: cercano → corporativo
//  emotion: emocional → racional · humor: divertido → serio
//  disruption: disruptivo → conservador

// Overrides comunes a todos los perfiles monotemáticos de Retiru.
// IMPORTANTE: url = null para que "analizar web" NO scrapee retiru.com (catálogo
// de retiros) y la ficha de negocio se construya desde la descripción temática
// + ai_rules + SERP del sector correcto. Los competidores de marketplace tampoco
// se copian (copyCompetitors:false en cada perfil): la búsqueda los encuentra del
// sector real (centro de yoga, mindfulness, etc.).
const BASE_OVERRIDES = {
  client_type: 'premium',
  primary_goal: 'comunidad',
  secondary_goals: ['branding', 'leads'],
  commercial_level: 'bajo',
  complexity: 'medio',
  experimentation: 'equilibrado',
  weekly_format_distribution: { story: 1, carrusel: 2, publicacion: 1, reel: 2 },
  image_orientation: 'vertical',
  sells_physical_product: false,
  physical_constraints: null,
  physical_constraints_at: null,
  url: null,
};

// --- Perfil "yoga" (SOLO yoga) --------------------------------------------

const YOGA_AI_RULES = `POSICIONAMIENTO (OBLIGATORIO):
Cuenta de Instagram de un CENTRO DE YOGA PUNTERO. TEMA ÚNICO: YOGA. NO mezcles otros temas: NADA de meditación/mindfulness como técnica independiente, NADA de ayurveda, NADA de "bienestar" general, nutrición ni lifestyle no-yóguico. Si algo no es yoga (asana, pranayama, filosofía del yoga, práctica, profesores del centro), NO va en esta cuenta.

REPARTO DE PILARES (100%, TODO yoga):
- 40% Técnica de asana (posturas paso a paso, alineación, transiciones, drishti, errores comunes, modificaciones con props, secuencias cortas).
- 20% Pranayama y respiración aplicada a la práctica de yoga.
- 15% Estilos y filosofía del yoga (vinyasa, hatha, yin, ashtanga; los ocho miembros, yamas y niyamas, historia y tradición).
- 15% Comunidad y profesores del centro (clases reales, profesores, alumnos practicando, ambiente del estudio).
- 10% Inspiración y constancia en la práctica (motivación para volver a la esterilla, citas yóguicas).

REGLAS DE ESTILO Y VOZ:
- Tono cercano, sereno y experto, de profesor de yoga de confianza. Nada de jerga corporativa ni lenguaje de oferta.
- Presencia humana ALTA: cuerpos y edades diversos practicando asanas reales, manos, pies, esterillas y props (bloques, cinturones, bolsters), en estudio con luz natural y también yoga al aire libre.
- PROHIBIDO parecer un catálogo de instalaciones o de retiros; el espacio está al servicio de la práctica.
- Promoción solo en el CTA y de forma suave; el contenido siempre aporta valor de yoga primero.

REGLAS PARA LAS IMÁGENES (variedad):
- Varía plano, escala y momento: detalle de un pie/mano en alineación, plano general de una clase, primer plano de una respiración, cenital de esterilla con props, exterior al amanecer, interior con luz cálida.
- Luz y hora variadas (amanecer, golden hour, luz de estudio), nunca el mismo plano medio diurno repetido.
- Diversidad de cuerpos, posturas y ángulos; evita el cliché de la misma persona en la misma postura sobre el mismo fondo.`;

// --- Perfil "wellness" (SOLO bienestar/vida sana) -------------------------

const WELLNESS_AI_RULES = `POSICIONAMIENTO (OBLIGATORIO):
Cuenta de BIENESTAR Y VIDA SANA ("vivir mejor cada día"). TEMA: hábitos, descanso, nutrición consciente, energía, gestión del estrés y autocuidado. NO mezcles las disciplinas que tienen su propia cuenta: NADA de técnica de yoga (asanas), NADA de meditación/mindfulness como técnica, NADA de ayurveda. Mantente en bienestar general y hábitos saludables.

REPARTO DE PILARES (100%):
- 30% Hábitos y rutinas saludables (sueño, descanso, movilidad, energía, organización del día).
- 25% Nutrición consciente (alimentación real, hidratación, recetas sencillas, mitos).
- 20% Gestión del estrés y equilibrio (descanso activo, naturaleza, desconexión, poner límites).
- 15% Inspiración y motivación para cuidarse (citas, retos suaves, constancia).
- 10% Comunidad y testimonios (historias reales de cambio de hábitos).

REGLAS DE ESTILO Y VOZ:
- Tono cercano, motivador y práctico, sin sermones ni lenguaje de oferta.
- Imágenes de lifestyle real (luz natural, comida real, naturaleza, personas en su día a día). Presencia humana media.
- PROHIBIDO parecer catálogo o escaparate. Promoción solo en CTA suave.
- Variedad de planos, escenas y momentos del día; evita repetir siempre la misma composición.`;

// --- Perfil "mindfulness" (SOLO mindfulness/meditación) -------------------

const MINDFULNESS_AI_RULES = `POSICIONAMIENTO (OBLIGATORIO):
Cuenta de MINDFULNESS y MEDITACIÓN. TEMA ÚNICO: atención plena y meditación. NO mezcles otros temas: NADA de técnica de yoga (asanas), NADA de ayurveda, NADA de nutrición/fitness/bienestar físico general. Todo gira en torno a calmar la mente y estar presente.

REPARTO DE PILARES (100%):
- 35% Técnica de meditación y atención plena (meditaciones guiadas, anclas de atención, body scan, meditación caminando, micro-prácticas).
- 25% Respiración consciente y regulación (técnicas para calmar el sistema nervioso, ansiedad, pausa consciente).
- 20% Gestión de pensamientos y emociones (observar la mente, soltar el rumiar, aceptación, presencia).
- 15% Inspiración y filosofía contemplativa (citas, presencia, gratitud, vivir el ahora).
- 5% Comunidad y práctica compartida (retos de meditación, testimonios).

REGLAS DE ESTILO Y VOZ:
- Tono sereno, pausado y cálido, que invite a parar.
- Imágenes calmadas: personas con ojos cerrados respirando, manos en el regazo, naturaleza tranquila, luz suave, espacios despejados; deja aire/zonas limpias para texto. Presencia humana media.
- PROHIBIDO parecer catálogo o venta. Promoción solo en CTA suave.
- Variedad de planos y escenas; evita repetir siempre la misma persona meditando en el mismo sitio.`;

// --- Perfil "ayurveda" (SOLO ayurveda) ------------------------------------

const AYURVEDA_AI_RULES = `POSICIONAMIENTO (OBLIGATORIO):
Cuenta de AYURVEDA. TEMA ÚNICO: medicina y estilo de vida ayurvédicos. NO mezcles otros temas: NADA de técnica de yoga (asanas), NADA de meditación/mindfulness como técnica, NADA de "bienestar" genérico fuera del marco ayurvédico. Todo se enmarca en Ayurveda.

REPARTO DE PILARES (100%):
- 30% Doshas y constitución (vata, pitta, kapha: rasgos, equilibrio y desequilibrio, cómo identificarse).
- 30% Alimentación ayurvédica (alimentos según dosha y estación, especias, digestión/agni, recetas sencillas).
- 20% Rutinas y hábitos (dinacharya, rutina matinal, sueño, automasaje abhyanga, ritmos estacionales).
- 15% Remedios y plantas (hierbas, infusiones, remedios caseros) — informativo, SIN promesas médicas.
- 5% Inspiración y filosofía ayurvédica (equilibrio, conexión cuerpo-mente-naturaleza).

REGLAS DE ESTILO Y VOZ:
- Tono cálido, didáctico y respetuoso con la tradición; explica los términos en sánscrito de forma sencilla.
- Imágenes: especias y alimentos reales, infusiones, plantas, texturas naturales, rutinas de autocuidado, tonos cálidos y terrosos. Presencia humana media.
- PROHIBIDO hacer promesas médicas o curativas; es contenido educativo de estilo de vida.
- Variedad de planos (cenital de especias, detalle de una infusión, escena de rutina); evita repetir el mismo bodegón.`;

// --- Ajuste fino del Retiru ORIGINAL (cuenta comercial de retiros) --------
// No cambia la estrategia (sigue siendo comercial, retiros como protagonistas);
// solo reescribe ai_rules para romper la monotonía visual ("siempre el mismo
// sitio / la misma luz / el mismo plano").
const RETIROS_AI_RULES = `LOCALIZACIÓN:
Las imágenes se ambientan en el SUR DE ESPAÑA (Andalucía), pero NO siempre en el mismo lugar: alterna escenarios reales y reconocibles de la región — sierra y montaña (Sierra Nevada, Grazalema, Cazorla), costa y playa mediterránea/atlántica, pueblos blancos, cortijos y fincas con olivar, patios andaluces, campo de almendros, dehesa, ríos y albercas. Cada pieza en un entorno distinto; nunca repitas el mismo fondo dos veces seguidas.

POSICIONAMIENTO:
Cuenta comercial de RETIROS Y DESTINOS de bienestar. El retiro y el lugar SÍ son protagonistas (a diferencia de las cuentas temáticas). Muestra el espacio, la experiencia y el entorno de forma aspiracional, pero auténtica, para inspirar la reserva.

REGLAS PARA LAS IMÁGENES (VARIEDAD OBLIGATORIA, romper la monotonía):
- Varía el PLANO y la escala en cada pieza: plano general del paisaje/alojamiento, plano medio de una experiencia (yoga, comida, baño), primer plano de un detalle (manos, té, textil, piedra), cenital de una mesa o esterilla, plano desde dentro hacia el paisaje.
- Varía la HORA y la LUZ: amanecer con bruma, golden hour, mediodía luminoso, tarde cálida, atardecer, luz interior cálida de velas; no impongas siempre el mismo día soleado de mediodía.
- Varía la ESTACIÓN y el clima: primavera florida, verano seco, otoño dorado en el olivar, cielos despejados o con nubes.
- Varía la composición y el ángulo; alterna con y sin personas (huéspedes naturales, no posados).
- PROHIBIDO repetir la misma postal una y otra vez; busca diversidad de destinos, encuadres y atmósferas dentro del sur de España.`;

const PROFILES = {
  yoga: {
    name: 'Retiru - Yoga',
    copyReferences: false,
    copyCompetitors: false,
    overrides: {
      ...BASE_OVERRIDES,
      sector: 'Centro de yoga',
      description:
        'Centro de yoga puntero y comunidad de práctica. Clases de vinyasa, hatha, yin, ashtanga y restaurativo; técnica de asana, pranayama y filosofía del yoga, para practicantes de todos los niveles. La cuenta enseña yoga, inspira la práctica y crea comunidad alrededor de la esterilla.',
      human_presence: 'alta',
      content_style: { educativo: 45, inspiracional: 20, comercial: 5, entretenimiento: 5, personal: 20, corporativo: 5 },
      ai_rules: YOGA_AI_RULES,
      tone_formality: 30,
      tone_proximity: 20,
      tone_emotion: 25,
      tone_humor: 50,
      tone_disruption: 55,
    },
  },
  wellness: {
    name: 'Retiru - Wellness',
    copyReferences: false,
    copyCompetitors: false,
    overrides: {
      ...BASE_OVERRIDES,
      sector: 'Bienestar y vida sana',
      description:
        'Medio de bienestar y vida sana: hábitos saludables, descanso y sueño, nutrición consciente, energía, gestión del estrés y autocuidado. Contenido práctico para vivir mejor cada día.',
      human_presence: 'media',
      content_style: { educativo: 35, inspiracional: 30, comercial: 5, entretenimiento: 10, personal: 10, corporativo: 10 },
      ai_rules: WELLNESS_AI_RULES,
      tone_formality: 35,
      tone_proximity: 25,
      tone_emotion: 25,
      tone_humor: 55,
      tone_disruption: 60,
    },
  },
  mindfulness: {
    name: 'Retiru - Mindfulness',
    copyReferences: false,
    copyCompetitors: false,
    overrides: {
      ...BASE_OVERRIDES,
      sector: 'Mindfulness y meditación',
      description:
        'Cuenta de mindfulness y meditación: atención plena, meditación guiada, respiración consciente, gestión de pensamientos y emociones, y presencia en el día a día. Práctica para calmar la mente.',
      human_presence: 'media',
      content_style: { educativo: 35, inspiracional: 40, comercial: 5, entretenimiento: 5, personal: 10, corporativo: 5 },
      ai_rules: MINDFULNESS_AI_RULES,
      tone_formality: 35,
      tone_proximity: 25,
      tone_emotion: 20,
      tone_humor: 60,
      tone_disruption: 60,
    },
  },
  ayurveda: {
    name: 'Retiru - Ayurveda',
    copyReferences: false,
    copyCompetitors: false,
    overrides: {
      ...BASE_OVERRIDES,
      sector: 'Ayurveda y estilo de vida ayurvédico',
      description:
        'Cuenta de Ayurveda: doshas (vata, pitta, kapha), alimentación y rutinas ayurvédicas (dinacharya), hábitos según la estación, remedios naturales y autocuidado según la sabiduría ayurvédica.',
      human_presence: 'media',
      content_style: { educativo: 45, inspiracional: 25, comercial: 5, entretenimiento: 5, personal: 15, corporativo: 5 },
      ai_rules: AYURVEDA_AI_RULES,
      tone_formality: 35,
      tone_proximity: 25,
      tone_emotion: 25,
      tone_humor: 55,
      tone_disruption: 60,
    },
  },
};

async function findSourceProject(service, { sourceId, sourceName }) {
  if (sourceId) {
    const { data, error } = await service.from('projects').select('*').eq('id', sourceId).maybeSingle();
    if (error) throw new Error(`Buscando proyecto por id: ${error.message}`);
    if (!data) throw new Error(`No existe proyecto con id ${sourceId}.`);
    return data;
  }
  const { data, error } = await service.from('projects').select('*').ilike('name', `%${sourceName}%`);
  if (error) throw new Error(`Buscando proyecto por nombre: ${error.message}`);
  const matches = data || [];
  if (matches.length === 0) throw new Error(`No se encontró ningún proyecto cuyo nombre contenga "${sourceName}".`);
  if (matches.length > 1) {
    const list = matches.map(p => `  - ${p.name} (id: ${p.id})`).join('\n');
    throw new Error(`Hay varios proyectos que coinciden con "${sourceName}". Usa --source-id=<uuid>:\n${list}`);
  }
  return matches[0];
}

function printProfileSummary(profile, copyRefs) {
  const o = profile.overrides;
  console.log('Reconfiguración aplicada:');
  console.log(`  · sector = ${o.sector} · client_type = ${o.client_type} · human_presence = ${o.human_presence}`);
  console.log(`  · sells_physical_product = false · physical_constraints = null · referencias: ${copyRefs ? 'sí' : 'NO'}`);
  console.log(`  · commercial_level = ${o.commercial_level} · primary_goal = ${o.primary_goal} · orientación = ${o.image_orientation}`);
  console.log(`  · content_style = ${JSON.stringify(o.content_style)}`);
  console.log(`  · ai_rules = posicionamiento monotemático + pilares definidos (1ª línea: "${(o.ai_rules || '').split('\n')[0].slice(0, 60)}…")`);
  console.log('');
}

/** Borra un proyecto y todas sus filas hijas. Tolera tablas/columnas ausentes. */
async function deleteProject(service, projectId, dryRun) {
  const { data: proj, error } = await service
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !proj) {
    throw new Error(`No se encontró el proyecto ${projectId}: ${error?.message || 'inexistente'}`);
  }
  console.log(`Proyecto a BORRAR: "${proj.name}" (id: ${proj.id})`);

  if (dryRun) {
    console.log('✓ (dry-run) Se borraría este proyecto y todas sus filas hijas.');
    return;
  }

  const ignore = (label, err) => {
    if (err) console.warn(`  · ${label}: ${err.message}`);
  };

  // content_item_visuals cuelga de content_items, no del proyecto directamente.
  const { data: items } = await service
    .from('content_items')
    .select('id')
    .eq('project_id', projectId);
  const itemIds = (items || []).map(r => r.id);
  if (itemIds.length > 0) {
    const { error: vErr } = await service
      .from('content_item_visuals')
      .delete()
      .in('content_item_id', itemIds);
    ignore('content_item_visuals', vErr);
  }

  for (const table of ['content_items', 'strategies', 'competitors', 'scraped_content', 'project_reference_images']) {
    const { error: delErr } = await service.from(table).delete().eq('project_id', projectId);
    ignore(table, delErr);
  }

  const { error: projErr } = await service.from('projects').delete().eq('id', projectId);
  if (projErr) {
    console.error('Error borrando el proyecto:', projErr.message);
    process.exit(1);
  }
  console.log('✓ Proyecto borrado.');
}

/** Ajuste fino: actualiza SOLO ai_rules de un proyecto (no toca el resto). */
async function tuneAiRules(service, projectId, newRules, dryRun) {
  const { data: existing, error } = await service
    .from('projects')
    .select('id, name, ai_rules')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`No se encontró el proyecto ${projectId}: ${error?.message || 'inexistente'}`);
  }
  console.log(`Proyecto a ajustar: "${existing.name}" (id: ${existing.id})`);
  console.log(`ai_rules ANTES:\n${(existing.ai_rules || '(vacío)').split('\n').map(l => '    ' + l).join('\n')}`);
  console.log(`\nai_rules DESPUÉS (solo cambia este campo):\n${newRules.split('\n').map(l => '    ' + l).join('\n')}\n`);

  if (dryRun) {
    console.log('✓ (dry-run) Se actualizaría únicamente ai_rules.');
    return;
  }
  const { error: upErr } = await service.from('projects').update({ ai_rules: newRules }).eq('id', projectId);
  if (upErr) {
    console.error('Error actualizando ai_rules:', upErr.message);
    process.exit(1);
  }
  console.log('✓ ai_rules actualizado (estrategia y demás config intactas).');
}

/** Aplica los overrides de un perfil a un proyecto YA EXISTENTE (sin clonar). */
async function applyProfileToExisting(service, projectId, profile, newName, dryRun) {
  const { data: existing, error } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`No se encontró el proyecto ${projectId}: ${error?.message || 'inexistente'}`);
  }

  const update = {};
  for (const [k, v] of Object.entries(profile.overrides)) {
    if (k in existing) update[k] = v;
    else console.warn(`  ⚠ Columna "${k}" no existe en la BD (migración pendiente); se omite.`);
  }
  if (newName) update.name = newName;

  console.log(`Proyecto a actualizar: "${existing.name}" (id: ${existing.id})`);
  console.log(`Nuevo nombre:          "${update.name || existing.name}"`);
  printProfileSummary(profile, false);

  if (dryRun) {
    console.log('✓ (dry-run) Se actualizaría el proyecto con la config anterior.');
    if (profile.copyCompetitors === false) {
      console.log('  · (dry-run) Además se borrarían los competidores heredados (perfil temático).');
    }
    return;
  }
  const { error: upErr } = await service.from('projects').update(update).eq('id', projectId);
  if (upErr) {
    console.error('Error actualizando el proyecto:', upErr.message);
    process.exit(1);
  }
  console.log('✓ Proyecto actualizado.');

  // Perfiles temáticos: eliminar competidores heredados del marketplace de retiros
  // para que "analizar competidores" descubra los del sector real (vía SERP).
  if (profile.copyCompetitors === false) {
    const { data: comps } = await service
      .from('competitors')
      .select('id, name')
      .eq('project_id', projectId);
    if (comps && comps.length > 0) {
      const { error: delErr } = await service.from('competitors').delete().eq('project_id', projectId);
      if (delErr) console.warn('  ⚠ No se pudieron borrar competidores heredados:', delErr.message);
      else console.log(`✓ Competidores de marketplace eliminados: ${comps.length} (se descubrirán del sector).`);
    }
  }
}

function buildClonedProjectRow(source, profile, newName) {
  const row = { ...source };
  // Quitar identificadores y timestamps gestionados por la BD.
  delete row.id;
  delete row.created_at;
  delete row.updated_at;
  delete row.deleted_at;

  row.name = newName;
  // El proyecto nuevo debe regenerar estrategia/calendario con la nueva config.
  row.status = 'draft';

  // Aplicar overrides del perfil. Solo se tocan columnas que existan en la BD
  // (source viene de SELECT *), así toleramos migraciones no aplicadas
  // (ai_rules/010, image_orientation/022, physical_constraints/025, sells_physical_product/029).
  for (const [k, v] of Object.entries(profile.overrides)) {
    if (k in source) row[k] = v;
    else console.warn(`  ⚠ Columna "${k}" no existe en la BD (migración pendiente); se omite ese override.`);
  }

  return row;
}

async function copyCompetitors(service, sourceId, newId, dryRun) {
  const { data, error } = await service.from('competitors').select('*').eq('project_id', sourceId);
  if (error) {
    console.warn('⚠ No se pudieron leer competidores:', error.message);
    return 0;
  }
  const competitors = data || [];
  if (competitors.length === 0) return 0;
  if (dryRun) return competitors.length;

  const rows = competitors.map(c => {
    const r = { ...c };
    delete r.id;
    delete r.created_at;
    r.project_id = newId;
    return r;
  });
  const { error: insErr } = await service.from('competitors').insert(rows);
  if (insErr) {
    console.warn('⚠ No se pudieron copiar competidores:', insErr.message);
    return 0;
  }
  return rows.length;
}

async function copyReferenceImages(service, sourceId, newId, dryRun) {
  const { data, error } = await service
    .from('project_reference_images')
    .select('*')
    .eq('project_id', sourceId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.warn('⚠ No se pudieron leer imágenes de referencia:', error.message);
    return 0;
  }
  const images = data || [];
  if (images.length === 0) return 0;
  if (dryRun) return images.length;

  let copied = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      const res = await fetch(img.image_url);
      if (!res.ok) {
        console.warn(`  ⚠ Saltada ${img.original_filename}: HTTP ${res.status}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = img.mime_type || res.headers.get('content-type') || 'image/png';
      const newPath = buildReferenceStoragePath(newId, i + 1, img.original_filename);

      const { error: upErr } = await service.storage
        .from(PROJECT_REFERENCE_IMAGES_BUCKET)
        .upload(newPath, buffer, { contentType, upsert: true });
      if (upErr) {
        console.warn(`  ⚠ No se pudo subir ${img.original_filename}:`, upErr.message);
        continue;
      }

      const { data: pub } = service.storage.from(PROJECT_REFERENCE_IMAGES_BUCKET).getPublicUrl(newPath);

      // Producto → estilo: el nuevo proyecto es un moodboard, no clona un producto.
      const isProduct = img.reference_role === 'product';
      const newRow = { ...img };
      delete newRow.id;
      delete newRow.created_at;
      delete newRow.updated_at;
      newRow.project_id = newId;
      newRow.storage_path = newPath;
      newRow.image_url = pub?.publicUrl || img.image_url;
      if (isProduct) {
        newRow.reference_role = 'style';
        newRow.role_is_manual = true;
        newRow.product_identity = null;
        newRow.product_traits = null;
        newRow.reference_view = null;
      }

      const { error: insErr } = await service.from('project_reference_images').insert(newRow);
      if (insErr) {
        // Reintento sin columnas de rol (migración 028 no aplicada).
        const fallback = { ...newRow };
        delete fallback.reference_role;
        delete fallback.role_confidence;
        delete fallback.role_is_manual;
        delete fallback.product_identity;
        delete fallback.product_traits;
        delete fallback.reference_view;
        const retry = await service.from('project_reference_images').insert(fallback);
        if (retry.error) {
          console.warn(`  ⚠ No se pudo registrar ${img.original_filename}:`, retry.error.message);
          continue;
        }
      }
      copied++;
    } catch (err) {
      console.warn(`  ⚠ Error copiando ${img.original_filename}:`, err?.message || err);
    }
  }
  return copied;
}

async function main() {
  loadEnvLocal();

  const sourceId = getArg('source-id');
  const sourceName = getArg('source-name') || 'Retiru';
  const profileKey = (getArg('profile') || 'wellness').toLowerCase();
  const profile = PROFILES[profileKey];
  if (!profile) {
    console.error(`Perfil desconocido "${profileKey}". Opciones: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }
  // Seguridad: solo escribe si se pasa --confirm. Por defecto, previsualiza.
  const dryRun = !hasFlag('confirm');
  const force = hasFlag('force');
  // Copia de referencias: el perfil define el default; --references / --no-references lo fuerzan.
  const copyRefs = hasFlag('no-references') ? false : hasFlag('references') ? true : profile.copyReferences !== false;
  const copyComp = !hasFlag('no-competitors') && profile.copyCompetitors !== false;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const service = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    dryRun
      ? '— MODO PREVISUALIZACIÓN (no se escribe nada). Añade --confirm para crear. —\n'
      : '— MODO ESCRITURA (--confirm) —\n'
  );

  // Modo borrar un proyecto (no clona).
  const deleteId = getArg('delete-id');
  if (deleteId) {
    await deleteProject(service, deleteId, dryRun);
    console.log('\nListo.');
    return;
  }

  // Modo ajuste fino: solo reescribe ai_rules (para el Retiru ORIGINAL comercial).
  const tuneId = getArg('tune-id');
  if (tuneId) {
    await tuneAiRules(service, tuneId, RETIROS_AI_RULES, dryRun);
    console.log('\nListo.');
    if (!dryRun) {
      console.log('Siguiente: en la app, regenera briefs/imágenes para que tomen las nuevas reglas.');
    }
    return;
  }

  // Modo actualizar un proyecto existente (no clona): aplica el perfil in situ.
  const updateId = getArg('update-id');
  if (updateId) {
    await applyProfileToExisting(service, updateId, profile, getArg('new-name') || null, dryRun);
    console.log('\nListo.');
    if (!dryRun) {
      console.log('Siguiente: en la app, regenera ESTRATEGIA, calendario y briefs para que tomen la nueva config.');
    }
    return;
  }

  const source = await findSourceProject(service, { sourceId, sourceName });

  if (hasFlag('inspect')) {
    console.log(`Config de "${source.name}" (id: ${source.id}):`);
    console.log(`  status                  = ${source.status}`);
    console.log(`  primary_goal            = ${source.primary_goal}`);
    console.log(`  commercial_level        = ${source.commercial_level}`);
    console.log(`  sells_physical_product  = ${source.sells_physical_product}`);
    console.log(`  physical_constraints    = ${source.physical_constraints ? '(con texto)' : 'null'}`);
    console.log(`  content_style           = ${JSON.stringify(source.content_style)}`);
    console.log(`  tono (form/prox/emo/hum/disr) = ${source.tone_formality}/${source.tone_proximity}/${source.tone_emotion}/${source.tone_humor}/${source.tone_disruption}`);
    console.log(`  ai_rules:\n${(source.ai_rules || '(vacío)').split('\n').map(l => '    ' + l).join('\n')}`);
    process.exit(0);
  }

  const newName = getArg('new-name') || profile.name || `${source.name} ${profile.nameSuffix}`;

  // Evitar duplicados: avisar si ya existe un proyecto con ese nombre para el usuario.
  const { data: existing } = await service
    .from('projects')
    .select('id, name, created_at')
    .eq('user_id', source.user_id)
    .ilike('name', newName);
  if (existing && existing.length > 0) {
    console.log(`⚠ Ya existe ${existing.length} proyecto(s) con el nombre "${newName}":`);
    for (const e of existing) console.log(`    - id: ${e.id} (creado ${e.created_at})`);
    if (!dryRun && !force) {
      console.log('\nNo creo otro para evitar duplicados. Usa --force si de verdad quieres otro, o borra el anterior en la app.');
      process.exit(0);
    }
    console.log('');
  }

  console.log(`Proyecto origen: "${source.name}" (id: ${source.id})`);
  console.log(`Proyecto nuevo:  "${newName}"  [perfil: ${profileKey}]`);
  printProfileSummary(profile, copyRefs);

  const clonedRow = buildClonedProjectRow(source, profile, newName);

  let newId = '(dry-run)';
  if (!dryRun) {
    const { data: inserted, error: insErr } = await service
      .from('projects')
      .insert(clonedRow)
      .select('id')
      .single();
    if (insErr) {
      console.error('Error creando el proyecto clonado:', insErr.message);
      process.exit(1);
    }
    newId = inserted.id;
    console.log(`✓ Proyecto creado: ${newId}`);
  } else {
    console.log('✓ (dry-run) Se crearía el proyecto con la config anterior.');
  }

  if (copyComp) {
    const n = await copyCompetitors(service, source.id, newId, dryRun);
    console.log(`${dryRun ? '·' : '✓'} Competidores ${dryRun ? 'a copiar' : 'copiados'}: ${n}`);
  }

  if (copyRefs) {
    const n = await copyReferenceImages(service, source.id, newId, dryRun);
    console.log(`${dryRun ? '·' : '✓'} Imágenes de referencia ${dryRun ? 'a copiar' : 'copiadas'}: ${n} (rol "product" → "style")`);
  }

  console.log('\nListo.');
  if (!dryRun) {
    console.log('Siguientes pasos en la app:');
    console.log('  1. Abre el nuevo proyecto y revisa Ajustes (tono, reglas IA, estilos).');
    console.log('  2. Fase 1: pulsa las 4 fases (analizar web, competidores, marca) y GENERAR ESTRATEGIA.');
    console.log('  3. Comprueba que los content_pillars reflejan los pilares del perfil; ajusta si hace falta.');
    console.log('  4. Fase 2/3: generar calendario, briefs e imágenes.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
