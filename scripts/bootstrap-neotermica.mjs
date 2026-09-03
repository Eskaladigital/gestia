/**
 * Crea (o reutiliza) el proyecto Neotérmica en Gestia.
 * Solo RRSS. La web www.neotermica.com no se toca.
 *
 * Moldes vivos (revisados 2 sep 2026 en rrss_gestia):
 *   - Clínica Ruiz Estrada: servicio local Murcia, sin producto físico,
 *     pilares de duda/criterio + proceso + conversión minoritaria.
 *   - Furgocasa: la cuenta no explica el producto; lidera con deseo/experiencia.
 *   - Tricholand: hechos que no se inventan + reparto editorial obligatorio.
 *
 * Uso:
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-neotermica.mjs
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-neotermica.mjs --confirm
 *
 * Por defecto solo previsualiza. Con --confirm escribe en Supabase Gestia.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OWNER_USER_ID = 'df2d8193-943a-4637-83e7-5025c4adae0e'; // contacto@eskaladigital.com
const PROJECT_NAME = 'Neotérmica';
const PROJECT_URL = 'https://www.neotermica.com/';

const NEOTERMICA_AI_RULES = `LÍNEA EDITORIAL (PRIORITARIA — define DE QUÉ VA el contenido):
- Neotérmica NO es una cuenta que recita oficios ("instalamos splits, conductos, aerotermia…"). Es una cuenta de OFICIO LOCAL + CONFORT en Murcia: hogar o empresa. Primero resolvemos una duda o un deseo de temperatura; el presupuesto aparece como consecuencia, nunca como protagonista permanente.
- Molde Ruiz Estrada (servicio local): cada pieza parte de UNA duda concreta (ruido, corriente en el dormitorio, calor en agosto, ACS, local que no refresca) y cierra hacia una visita, no hacia un catálogo de 8 servicios.
- Molde Furgocasa (anti-catálogo): si una publicación solo informa y no hace sentir el confort o el criterio del oficio, replantéala.
- Reparto editorial deseado (OBLIGATORIO — si el mes no lo cumple, reescríbelo):
  · ~30% OFICIO Y OBRA HECHA: instalación limpia, técnico trabajando, formalidad/puntualidad, revisión. José Carlos y el equipo existen; no conviertas la cuenta en marca personal ni inventes caras.
  · ~25% CONFORT / ESTANCIA: el clima YA en el espacio (salón, dormitorio, oficina, local, clínica). El "modo rayos X" de la web: ves el sistema funcionando, no la ficha del aparato.
  · ~25% CRITERIO ÚTIL MURCIA: señales que no conviene normalizar (ruido, goteo, corriente nocturna, factura, equipo viejo). Enseña de verdad; no conviertas cada consejo en un checklist de comprador.
  · ~20% VISITA / CONVERSIÓN: pedir visita o presupuesto en neotermica.com/contacto, tel 678 495 046, info@neotermica.es. Es MINORÍA. Si el muro parece un folleto de instalador, has fallado.
- PROHIBIDO que más de la mitad de los posts del mes sean "instalamos X en Murcia" con foto de máquina. El oficio existe; no es el único set.

TERRITORIO Y POSICIONAMIENTO:
- Empresa de climatización en Murcia capital, pedanías y radio ~50 km. Desde 2012. Fundador José Carlos Moya. Certificación del Ministerio de Industria.
- Hogar o empresa. Ocho oficios reales: splits, conductos, aerotermia, suelo radiante, calderas, radiadores, ventilación, reparación/revisión/renovación.
- Marcas con las que trabajan (cuando el tema lo pide, no como sticker): Daikin, Fujitsu, Mitsubishi Electric, Toshiba, Gree, Panasonic.
- Tono: de TÚ, oficio cercano, formalidad y puntualidad. Ni clínica de usted (Ruiz Estrada) ni lifestyle de escapada (Furgocasa) ni catálogo B2B (Tricholand).
- Diferenciador vs instaladores que venden financiación 0% o radio de toda España: radio honesto, visita antes que número fino, horquilla orientativa no es presupuesto.

HECHOS REALES QUE HAY QUE RESPETAR (no inventar):
- Empresa: Neotérmica Climatización. Murcia, España. Tel 678 495 046. Mail info@neotermica.es. Horario web: lunes a viernes 9:00–14:00 y 15:30–19:00.
- NAP = teléfono + mail + Murcia. SIN calle en la web. No inventar dirección, NIF, coordenadas de taller ni "ven a la tienda".
- CTA de la web: pedir visita / presupuesto en /contacto#formulario. El chat de la web es Nora (asistente de NEOTERMICA). En RRSS no prometas WhatsApp como canal oficial ni pidas fotos al visitante.
- La calculadora de la home es una HORQUILLA orientativa; el número fino sale en la visita. No publiques precios, % de ahorro ni plazos de obra como si fueran tarifario.
- Reseñas Google reales (Isabel, Belén Morales, Josefa — 2026): profesionalidad, puntualidad, instalación limpia. No inventar testimonios ni notas.
- PROHIBIDO inventar subvenciones, financiación 0%, RITE inventado, número de obras, plantilla, o que cubren Cartagena/costa como mercado propio.

VOZ:
- De tú, con cercanía murciana y un punto de chispa. Ni catálogo técnico plano ni "profesional que observa y cumple" a secas: se nota una persona de oficio que habla claro y con criterio, sin costumbrismo vacío, sin chiste fácil y sin "el calor de Murcia" como único gancho.
- Frases claras, datos concretos (2012, 50 km, 8 oficios, visita).
- CTA recurrentes: pedir visita, escribir a info@neotermica.es, llamar al 678 495 046, ir a neotermica.com/contacto.
- PROHIBIDOS clichés de agencia ("vive el confort", "soluciones a medida", "el mejor clima", "no te lo puedes perder").

IMÁGENES — MEZCLA OBLIGATORIA (molde Ruiz Estrada, adaptado a oficio):
- En cada carrusel o reel mezcla, a partes parecidas: (1) estancia / confort (espacio ya climatizado, luz real de Murcia); (2) oficio en curso (manos, herramienta, unidad interior/exterior en obra limpia); (3) detalle técnico (rejilla, split bien colocado, tubo, termostato) SIN ficha de catálogo; (4) dato o zona (mapa de radio, horario, CTA visita) como mucho 1 tesela por pieza.
- REGLA DURA: AL MENOS 1 de cada 3 teselas del feed es una ESTANCIA CON VIDA (espacio real usado: salón, dormitorio, oficina, local), no un aparato. PROHIBIDO que el mes sea un álbum de unidades interiores/exteriores, rejillas y termostatos, por muy bien colocados que estén. El aparato es prueba de oficio, no el héroe del muro.
- Ningún tipo en más de la mitad de los slides. Una pieza no puede ser solo máquinas ni solo salones de stock. Prioriza el piso/local murciano creíble sobre el interior nórdico de banco de imágenes.
- PROHIBIDO ARTEFACTOS (fotorrealismo estricto — el aire no se ve):
  · NUNCA representar el aire, el flujo o el frío/calor con líneas, haces, chorros, vaho, niebla, humo o estelas visibles sobre paredes o en el ambiente. El confort se sugiere solo con luz natural, postura y como mucho una cortina que se mueve de forma SUTIL y creíble; jamás "aire dibujado" saliendo del split.
  · Herramientas (flexómetro, cinta métrica, medidor láser, manómetro, destornillador) solo si están midiendo o apoyadas en una superficie REAL, o en la mano en reposo. Nunca flotando en el aire sin medir nada, ni dos herramientas fusionadas en un solo objeto imposible.
  · Nada de texto inventado ilegible como protagonista, manos con dedos de más, ni objetos que se atraviesan. Si una idea abstracta no se puede fotografiar de forma creíble, resuélvela con composición real, no con un símbolo pintado.
- Presencia humana media: técnico anónimo de oficio, no modelos, no "familia feliz de anuncio". No retratar a José Carlos ni al equipo hasta que haya fotos de referencia. Dentro de una misma pieza (carrusel o reel), el técnico y el espacio son SIEMPRE los mismos: misma ropa de trabajo, mismo dormitorio/salón; no cambies de persona ni de estancia entre slides.
- ESTANCIA ÚNICA POR PIEZA: si el post ocurre en un dormitorio, salón, oficina o local, escribe UNA ficha de espacio (hueco de ventana, cortina sí/no, cabecero sí/no, suelo, split y pared) y COPIA ESA MISMA REDACCIÓN en todos los slides. No reescribas el espacio ni lo “varíes”. Cambia solo el encuadre y la acción. Si slide 1 tiene cortina y cabecero, slide 2 y 3 también.
- Paleta de marca: tinta #16202b, pizarra #597D95, acento clima #cb0a3d, fondos #f5f8fb / #eef3f8. Titulares Space Grotesk. No clínica azul, no naranja de ferretería, no stock de desierto.
- Luz: verano murciano (claro, duro, mediodía o tarde), no atardeceres morados ni interiores nórdicos. Cocina cromática estable en todo el mes.
- PROHIBIDO inventar logos de Daikin/Mitsubishi como marca de la cuenta; si aparece un aparato, que sea creíble, no un packshot de tienda.
- EL FEED ES LA UNIDAD: dos posts consecutivos no pueden compartir el mismo gesto icónico (split en pared blanca + técnico de espaldas). Variedad de plano, lugar y tipo de escena.

REGLAS DE VARIEDAD ENTRE PUBLICACIONES:
- Evitar dos piezas seguidas solo comerciales o solo de un mismo oficio (p. ej. dos splits).
- Carruseles: micro-historia (problema → criterio → oficio/estancia → visita), no álbum del mismo aparato.`;

const NEOTERMICA_PHYSICAL_CONSTRAINTS = `SERVICIO, NO PRODUCTO SKU: Neotérmica instala, repara y renueva climatización. No hay un único objeto a clonar (no es la Ducato de Furgocasa ni el columnar de Tricholand). Las refs, si las hay, son estilo / lugar / oficio.

ESCENAS PERMITIDAS:
- Vivienda o espacio de trabajo en el sureste español: piso, chalet, oficina, local, clínica, gimnasio, nave. Arquitectura mediterránea creíble (no loft nórdico, no loft industrial de stock).
- Oficio: técnico con ropa de trabajo, herramientas, unidad interior split, unidad exterior en azotea/patio, conductos, caldera, radiador, suelo radiante, aerotermia. Obra limpia. Formalidad.
- Destino: la estancia YA en uso (salón fresco, dormitorio sin corriente directa, mostrador de local). El aparato puede estar, no tiene que ser el héroe.

IDENTIDAD:
- Marca: Neotérmica / Neotérmica Climatización. Wordmark + acento rojo clima #cb0a3d sobre pizarra #597D95 y tinta #16202b.
- Logo real: wordmark de la web (logo_gcon). No inventar isotipo de copo/llama ni otro logotipo.
- PROHIBIDO inventar calle, fachada de taller, rotulación de furgoneta con dirección, NIF o "tienda Neotérmica".

HUMANOS: técnicos anónimos o ausentes. No son José Carlos ni un equipo con nombre hasta que existan fotos de referencia. Sin modelos de anuncio, sin familia stock sonriendo al mando.

PROHIBIDO:
- Packshot de catálogo de marca (caja Daikin, mural de logos).
- Financiación 0%, "oferta del mes", cupones, stock de "aire acondicionado barato".
- Sangre, avería sucia de clickbait, techos destrozados como estética.
- WhatsApp verde flotante como identidad de marca.
- Pueblo en la URL o copy de doorway ("aire acondicionado El Palmar" como eslogan). El pueblo, si sale, es obra real en una frase, no plantilla.`;

const NEOTERMICA_PILLARS = [
  {
    name: 'Oficio y obra hecha',
    percentage: 30,
    description:
      'Autoridad de instalador en Murcia: formalidad, puntualidad, obra limpia, revisión. Existe para que se vea el criterio del oficio, no para tapizar el muro de máquinas. Molde Ruiz Estrada (proceso) + Tricholand (oficio minoritario respecto al destino).',
    content_types: ['Reel de proceso', 'Carrusel de obra', 'Story de jornada'],
    example_topics: [
      'Qué se mira en una visita antes de hablar de presupuesto',
      'Instalación limpia: por qué la unidad interior no va donde «queda bonita»',
      'Revisión de un equipo que «aún enfría» pero ya hace ruido',
    ],
  },
  {
    name: 'Confort en la estancia',
    percentage: 25,
    description:
      'El clima ya en el espacio: dormitorio sin corriente, local que aguanta agosto, ACS en invierno. Analogía Furgocasa: deseo y uso, no ficha. Hueco frente a instaladores que solo muestran el aparato.',
    content_types: [
      'Publicación de estancia',
      'Carrusel problema → estancia resuelta',
      'Reel de un solo espacio',
    ],
    example_topics: [
      'El split del dormitorio: por qué el chorro no puede ir a la cama',
      'Un local en Murcia en agosto: qué se decide en la visita',
      'Frío, calor y ACS: cuándo la aerotermia entra en la conversación',
    ],
  },
  {
    name: 'Señales que no conviene normalizar',
    percentage: 25,
    description:
      'Criterio útil (molde Ruiz «señales»): ruido, goteo, corriente, factura, equipo viejo. El lector sale sabiendo algo; la visita es el siguiente paso, no el titular.',
    content_types: ['Carrusel de señales', 'Reel de un solo dato', 'Story mito vs hecho'],
    example_topics: [
      'Ruido del aire: qué es normal y qué pide revisión',
      'Goteo en el split: cuándo no es «cosa del calor»',
      'Splits viejos vs caldera de gas: la horquilla no es el presupuesto',
    ],
  },
  {
    name: 'La visita en Murcia',
    percentage: 20,
    description:
      'Conversión en minoría: radio 50 km, cómo pedir visita, qué datos mandar. Si supera ~20%, el feed se vuelve folleto. Frente a competidores de financiación 0% o radio nacional, Neotérmica gana por radio honesto y número fino en la visita.',
    content_types: ['Publicación de CTA', 'Carrusel de cómo pedir visita', 'Story de horario'],
    example_topics: [
      'Qué escribir a info@neotermica.es para que la visita sirva',
      'Murcia y 50 km: pregunta si encaja, no fingimos Cartagena',
      'Horquilla en la web, presupuesto en la visita: 678 495 046',
    ],
  },
];

const NEOTERMICA_THEMES = [
  {
    theme: 'Agosto y el resto del año',
    frequency: 'semanal',
    description:
      'Confort según estación murciana: calor, noche, invierno, ACS. Evita que el mes sea solo «aire acondicionado».',
    example_topics: [
      'Noche en el dormitorio sin corriente directa',
      'Cuando el local no llega a las 14:00',
    ],
  },
  {
    theme: 'Escuela del aparato',
    frequency: 'semanal',
    description:
      'Un dato concreto por pieza: ruido, colocación, revisión. Educativo de verdad, no checklist de comprador.',
    example_topics: [
      'Dónde no va un split',
      'Qué se revisa en una renovación',
    ],
  },
  {
    theme: 'Parte de oficio',
    frequency: 'quincenal',
    description:
      'Obra y criterio, a menor cadencia que el confort. Documenta formalidad sin tapizar el mes.',
    example_topics: [
      'Visita: qué se mira antes de hablar de máquina',
      'Obra limpia en un piso de Murcia',
    ],
  },
  {
    theme: 'Pedir visita',
    frequency: 'quincenal',
    description:
      'La vía de conversión: formulario, mail, teléfono. Pocas piezas, claras.',
    example_topics: [
      'Datos que hacen útil una visita',
      'Radio 50 km: si no encaja, se dice',
    ],
  },
];

const NEOTERMICA_RECS =
  'Reparto 30/25/25/20: oficio, confort, criterio, visita. El mes debe leerse como una cuenta de oficio local que enseña y enseña a pedir visita, no como el catálogo de un instalador. Al menos un tercio de las teselas ocurre en ESTANCIA (destino), no en packshot. Concentrar la venta directa en ~1 de cada 5 piezas. Frente a Prointer (ingeniería/solar), Instalfrica (financiación 0% y radio amplio) y Jomclima (promo y 0%), Neotérmica gana por radio 50 km honesto, visita antes que número y formalidad de José Carlos. No inventar calle, precios ni WhatsApp como canal de marca.';

const COMPETITORS = [
  {
    name: 'Prointer Murcia',
    url: 'https://prointermurcia.es/',
    reason:
      'Instalador local con ingeniería, solar y climatización industrial. Competidor de territorio Murcia; más amplio (fotovoltaica, industrial) vs oficio cercano de Neotérmica (visita, hogar/empresa, radio 50 km).',
  },
  {
    name: 'Instalfrica',
    url: 'https://instalfrica.es/',
    reason:
      'Instalador de aire y aerotermia con financiación 0% y radio que sale de Murcia. Contrapunto comercial: ellos empujan precio/financiación; Neotérmica, horquilla + visita y plaza honesta.',
  },
  {
    name: 'Jomclima',
    url: 'https://www.jomclima.com/',
    reason:
      'Instalador de El Palmar (Murcia) centrado en splits/conductos y financiación 0%. Competidor de plaza y de tono promo; útil para no copiar el eslogan de oferta.',
  },
];

const BRAND_COLORS = [
  {
    hex: '#cb0a3d',
    name: 'Clima / acento',
    usage: 'accent',
    notes: 'Rojo corporativo de la web (--clima). CTA y acento único. El termostato de la home lo varía; en RRSS se fija este valor.',
    found_in: '--clima:#cb0a3d; .btn-primary',
  },
  {
    hex: '#597D95',
    name: 'Pizarra',
    usage: 'primary',
    notes: 'Azul pizarra de marca. Titulares secundarios y superficies frías.',
    found_in: 'theme.colors.brand #597D95',
  },
  {
    hex: '#16202b',
    name: 'Tinta',
    usage: 'primary',
    notes: 'Texto e ink. Autoridad de oficio, no negro puro.',
    found_in: 'theme.colors.ink #16202b',
  },
  {
    hex: '#f5f8fb',
    name: 'Papel frío',
    usage: 'background',
    notes: 'Fondo de página. No es blanco de clínica.',
    found_in: 'theme.colors.page #f5f8fb',
  },
  {
    hex: '#eef3f8',
    name: 'Soft',
    usage: 'background',
    notes: 'Superficie suave; chips y bloques.',
    found_in: 'theme.colors.soft #eef3f8',
  },
  {
    hex: '#41617a',
    name: 'Pizarra oscura',
    usage: 'secondary',
    notes: 'Hover y profundad de marca.',
    found_in: 'theme.colors.brand.dark #41617a',
  },
];

const BRAND_FONTS = [
  {
    name: 'Space Grotesk',
    usage: 'Titulares',
    notes: 'Única webfont de la web. Display 500–700. No script ni serif wellness.',
    weights: '500, 600, 700',
    fallbacks: 'system-ui, sans-serif',
  },
  {
    name: 'Sans de sistema',
    usage: 'Cuerpo',
    notes: 'Segoe / system-ui. Texto de oficio, no display.',
    weights: '400, 600',
    fallbacks: 'system-ui, sans-serif',
  },
];

const BRAND_IDENTITY_DETAIL = {
  palette_analysis:
    'Azul pizarra + rojo clima. El rojo es el único grito (CTA, acento). Fondos fríos papel, no blanco clínico ni oscuro de agencia. El termostato de la web mueve --clima; en RRSS se ancla #cb0a3d.',
  typography_analysis:
    'Space Grotesk en titulares; cuerpo de sistema. Sensación de oficio contemporáneo, no catálogo de ferretería ni revista wellness.',
  layout_components:
    'Nav flotante, hero con termostato, calculadora de horquilla, recorrido 3D de estancias, 8 money pages, form solo en /contacto, Nora en widget.',
  imagery_iconography:
    'Fotografía de oficio y estancia. Iconografía mínima. No isotipo inventado de copo/llama.',
  brand_feel_keywords: [
    'oficio',
    'Murcia',
    'confort',
    'formalidad',
    'visita',
    '50 km',
    'industria',
    'hogar o empresa',
  ],
  accessibility_notes:
    'Texto tinta sobre papel frío. CTA rojo sobre blanco o tinta. Evitar rojo sobre pizarra. No texto fino blanco sobre foto de obra sin velo.',
  rrss_practical_tips: [
    'Plantillas con fondo #f5f8fb o #16202b; acento #cb0a3d en un solo elemento (CTA, filete).',
    'Wordmark Neotérmica; no forzar logo en todas las slides.',
    'Una duda o una estancia por pieza; no los 8 oficios en un carrusel.',
    'Métricas reales (2012, 50 km, visita) como dato, no sticker vacío.',
  ],
  dos: [
    'Mostrar oficio limpio y estancia en uso.',
    'Hablar de tú a particular y a empresa.',
    'Citar visita, mail y teléfono cuando el post sea de conversión.',
    'Respetar radio 50 km y la ausencia de calle.',
  ],
  donts: [
    'Catálogo de 8 servicios en cada pieza.',
    'Financiación 0%, precios o % de ahorro como tarifario.',
    'Inventar calle, equipo o certificados.',
    'WhatsApp o fotos del cliente como CTA de marca.',
    'Doorway de pedanías.',
  ],
  css_tokens_cited: [
    { token: '--clima', role: 'acento CTA' },
    { token: 'brand', role: 'pizarra primaria' },
    { token: 'ink', role: 'texto / autoridad' },
    { token: '--font-display', role: 'titulares Space Grotesk' },
  ],
};

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
  const aiRulesOnly = hasFlag('ai-rules-only');
  const spectrumOnly = hasFlag('spectrum');
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
    .ilike('name', '%Neotérmica%')
    .is('deleted_at', null);

  const now = new Date().toISOString();
  const payload = {
    user_id: OWNER_USER_ID,
    name: PROJECT_NAME,
    url: PROJECT_URL,
    sector: 'Climatización (instalación, reparación y renovación)',
    location: 'Murcia y radio 50 km, España',
    description:
      'Neotérmica es la empresa de climatización de José Carlos Moya en Murcia (desde 2012): instalación, reparación y renovación de aire acondicionado (splits y conductos), aerotermia, suelo radiante, calderas, radiadores y ventilación. Trabaja hogar y empresa en Murcia capital, pedanías y un radio de unos 50 km. Certificación del Ministerio de Industria. NAP: 678 495 046 · info@neotermica.es · Murcia (sin calle pública). CTA: visita / presupuesto en neotermica.com/contacto; la horquilla de la web no es el número fino. Posicionamiento: oficio cercano y formal, no instalador de financiación 0% ni ingeniería industrial.',
    client_type: 'b2c',
    primary_goal: 'leads',
    secondary_goals: ['branding', 'comunidad'],
    tone_formality: 58,
    tone_proximity: 30,
    tone_emotion: 55,
    tone_humor: 68,
    tone_disruption: 62,
    content_style: {
      educativo: 70,
      inspiracional: 45,
      comercial: 45,
      corporativo: 40,
      personal: 35,
      entretenimiento: 20,
    },
    commercial_level: 'medio',
    complexity: 'medio',
    human_presence: 'media',
    experimentation: 'conservador',
    weekly_format_distribution: {
      story: 1,
      carrusel: 2,
      publicacion: 1,
      reel: 1,
    },
    posts_per_week: 5,
    ai_rules: NEOTERMICA_AI_RULES,
    physical_constraints: NEOTERMICA_PHYSICAL_CONSTRAINTS,
    physical_constraints_at: now,
    sells_physical_product: false,
    image_orientation: 'vertical',
    visual_creative_direction: 'literal',
    image_aesthetic: 'profesional',
    brand_colors: BRAND_COLORS,
    brand_fonts: BRAND_FONTS,
    brand_logo_url: 'https://www.neotermica.com/images/logo_gcon.svg',
    brand_favicon_url: 'https://www.neotermica.com/favicon.ico',
    brand_summary:
      'Neotérmica se presenta como oficio de climatización en Murcia, no como tienda de aparatos. Identidad pizarra + rojo clima (#597D95 / #cb0a3d) extraída de los tokens de la web Next (08-definitiva). Space Grotesk en titulares. Para RRSS: reportaje de oficio y estancia; el rojo es el único grito; jamás packshot ni doorway de pueblo.',
    brand_analyzed_at: now,
    brand_identity_detail: BRAND_IDENTITY_DETAIL,
    status: 'draft',
    onboarding_step: 5,
  };

  console.log(`Proyecto: ${PROJECT_NAME}`);
  console.log(`URL: ${PROJECT_URL}`);
  console.log(`Owner: ${OWNER_USER_ID} (contacto@eskaladigital.com)`);
  console.log(`Existentes con nombre similar: ${(existing || []).length}`);
  for (const e of existing || []) {
    console.log(`  - ${e.id} | ${e.name} | ${e.status}`);
  }

  if (!confirm && !aiRulesOnly && !spectrumOnly) {
    console.log('\n(dry-run) Config que se aplicaría:');
    console.log(
      JSON.stringify(
        {
          ...payload,
          ai_rules: `(${NEOTERMICA_AI_RULES.length} chars)`,
          physical_constraints: `(${NEOTERMICA_PHYSICAL_CONSTRAINTS.length} chars)`,
          brand_identity_detail: '(objeto identidad)',
        },
        null,
        2
      )
    );
    console.log('\nCompetidores:', COMPETITORS.map((c) => c.name).join(', '));
    console.log('\nPasa --confirm para crear/actualizar.');
    return;
  }

  let projectId = existing?.[0]?.id;
  if (aiRulesOnly || spectrumOnly) {
    if (!projectId) {
      console.error('No hay proyecto Neotérmica que actualizar.');
      process.exit(1);
    }
    const projectPatch = spectrumOnly
      ? {
          ai_rules: NEOTERMICA_AI_RULES,
          physical_constraints: NEOTERMICA_PHYSICAL_CONSTRAINTS,
          physical_constraints_at: new Date().toISOString(),
        }
      : { ai_rules: NEOTERMICA_AI_RULES };
    const { error } = await sb.from('projects').update(projectPatch).eq('id', projectId);
    if (error) {
      console.error('Error update proyecto:', error.message);
      process.exit(1);
    }
    if (spectrumOnly) {
      const { data: strat, error: sErr } = await sb
        .from('strategies')
        .select('id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sErr) {
        console.error('Error leyendo estrategia:', sErr.message);
        process.exit(1);
      }
      if (strat?.id) {
        const { error: uErr } = await sb
          .from('strategies')
          .update({
            content_pillars: NEOTERMICA_PILLARS,
            thematic_lines: NEOTERMICA_THEMES,
            recommendations: NEOTERMICA_RECS,
          })
          .eq('id', strat.id);
        if (uErr) {
          console.error('Error update estrategia:', uErr.message);
          process.exit(1);
        }
        console.log(`✓ estrategia ${strat.id} reabierta (30/25/25/20)`);
      } else {
        console.log('⚠ No hay estrategia que actualizar; regenera estrategia después.');
      }
    }
    console.log(`\n✓ proyecto ${projectId} actualizado (${NEOTERMICA_AI_RULES.length} chars de ai_rules)`);
    return;
  }

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
    COMPETITORS.map((c) => ({ project_id: projectId, ...c }))
  );
  if (cErr) {
    console.error('Error competidores:', cErr.message);
    process.exit(1);
  }

  console.log(`\n✓ Proyecto listo: ${projectId}`);
  console.log(`  Ficha: /projects/${projectId}`);
  console.log('  Siguiente: pipeline marca → web → competidores → estrategia. Sin calendario ni briefs hasta revisión.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
