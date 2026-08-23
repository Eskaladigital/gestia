/**
 * Crea (o reutiliza) el proyecto Tricholand con configuración editorial
 * lista para pipeline: marca → web → competencia → estrategia → calendario → briefs.
 *
 * Uso:
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-tricholand.mjs
 *   node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-tricholand.mjs --confirm
 *
 * Por defecto solo previsualiza. Con --confirm escribe en Supabase.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OWNER_USER_ID = 'df2d8193-943a-4637-83e7-5025c4adae0e'; // contacto@eskaladigital.com
const PROJECT_NAME = 'Tricholand';
const PROJECT_URL = 'https://www.tricholand.com/';

const TRICHOLAND_AI_RULES = `LÍNEA EDITORIAL (PRIORITARIA — define DE QUÉ VA el contenido):
- Tricholand NO es una cuenta de "plantas mágicas" ni una tienda de 1 unidad. Es un VIVERO PRODUCTOR de Trichocereus y cactáceas columnares. El protagonista NO es solo el packing ni el SKU: es la COLUMNA como planta ornamental (cómo crece, cómo se planta, cómo se ve en un jardín) y, cuando toca, el oficio de producirla.
- El CTA comercial sigue siendo B2B (viveros, garden centers, distribuidores, paisajistas; mínimo 750 uds; presupuesto a info@tricholand.com). Eso NO significa que cada post sea una ficha de compra. El slider educativo del proyecto es alto: abre el espectro. Un post divulgativo o de paisajismo es válido aunque no mencione pedido, pasaporte ni calibre.
- Pedido mínimo real: 750 unidades (se pueden mezclar variedades y tamaños). Presupuesto en menos de 24 h laborables. Pago por transferencia. No hay checkout de particular. No uses "compra el tuyo" ni "envío a casa" como CTA.
- Reparto editorial deseado (OBLIGATORIO — si el mes no lo cumple, reescríbelo):
  · ~25% OFICIO DE VIVERO: Murcia, 2.500 m², semilla/esqueje, densidades, aclimatación, calidad. NO más de un tercio del mes.
  · ~15% CATÁLOGO / SURTIDO: variedades, siluetas, códigos TRI-, cuándo Pachanoi vs Terscheckii.
  · ~25% PAISAJISMO Y DESTINO: cómo decorar e implantar columnares en jardín mediterráneo / xeropaisajismo europeo; composiciones, densidades de plantación, acompañantes (grava, olivo, arquitectura sencilla, lineal de garden). La planta YA plantada, no en maceta negra de vivero.
  · ~20% DIVULGATIVO: diferencias entre especies, anatomía de la columna, luz, riego, suelo, clima, mitos vs realidad ornamental, Trichocereus vs Echinopsis. Enseña de verdad, no conviertas cada consejo en un checklist de comprador.
  · ~15% OPERATIVA B2B (logística + conversión JUNTAS): pasaporte, packing, plazos, 750 uds, reserva de campaña. Es MINORÍA. Si el muro parece una agencia de aduanas, has fallado.
- PROHIBIDO que más de la mitad de los posts del mes ocurran en umbráculo / bancada / caja / pasaporte / mesa de etiquetas. El vivero existe; no es el único set.
- Un post puede ser solo bello o solo didáctico si aporta una idea concreta de planta, jardín o cultivo. No lo mates por "falta de argumento de trade".

TERRITORIO Y POSICIONAMIENTO:
- Especialistas en Trichocereus, no un vivero generalista de cactus y crasas. Eso diferencia frente a Elche/Mediflora (gran formato y catálogo amplio) y frente a tiendas coleccionistas (unidades sueltas).
- Producción propia en clima mediterráneo de Murcia: plantas aclimatadas, vigor y documentación en regla. No revendemos de terceros.
- Tono: productor serio que habla de tú al gremio. Técnico cuando aporta (calibre, C.12, pasaporte, densidades). Cercano, sin jerga de agencia ni romanticismo New Age.
- Idioma de marca: español. Nombres botánicos en cursiva o con T. + epíteto (T. pachanoi). Nombre comercial de catálogo en mayúsculas de marca (Tricholand) y códigos SKU (TRI-PAC, TRI-PER, TRI-BRI, TRI-TER, TRI-COL).

HECHOS REALES QUE HAY QUE RESPETAR (no inventar):
- Empresa: Tricholand. Vivero productor. Murcia, España. Contacto: info@tricholand.com.
- Instalaciones: 2.500 m² de cultivo. Producción propia. Vivero activo.
- Volumen declarado: 25K+ unidades/año. 5+ variedades de Trichocereus. 18 países UE. 99% entrega OK.
- Catálogo principal:
  · T. Pachanoi (TRI-PAC) — San Pedro · Echinopsis pachanoi — disponible, varios tamaños.
  · T. Peruvianus (TRI-PER) — Antorcha Peruana · Echinopsis peruviana — disponible.
  · T. Bridgesii (TRI-BRI) — Achuma / Wachuma · Echinopsis lageniformis — stock limitado.
  · T. Terscheckii (TRI-TER) — Cardón Grande · Echinopsis terscheckii — disponible.
  · Otros cactus (TRI-COL) — colección, variable.
- También producen Macrogonus, Spachianus, híbridos, formas crestadas y variedades raras bajo criterio ornamental.
- Condiciones: pedido mínimo 750 uds; preparación 7 días laborables + transporte; ES 48–72 h; UE 3 días; UK 5–7 días; embalaje y temperatura controlada (frío o calor según estación); pasaporte de planta UE incluido; certificado fitosanitario extra-UE ~60 €; cultivo por encargo y reserva de campaña.
- Web y tienda B2B: tricholand.com (ES/EN/DE/FR/IT/NL/PT). Presupuesto, no cobro automático.
- PROHIBIDO inventar precios, lotes, CIF, dirección física exacta, nombres de personas del equipo, certificados que no existan, o "venta al detalle".

PROHIBIDO — LÍNEA ROJA (innegociable):
- Cualquier marco psicoactivo, enteógeno, ritual, chamánico, medicinal, "viaje", mescalina o consumo humano. Aunque el mercado coleccionista use esos ángulos, Tricholand es ORNAMENTAL y VIVERÍSTICO.
- Nombres comunes (San Pedro, Achuma, Wachuma) SOLO como nombre hortícola de catálogo, nunca como gancho etnobotánico. El blog propio lo deja claro: "sin enfoque etnobotánico".
- No vender a particulares en el copy. No "compra el tuyo", "envío a casa", "ideal para tu terraza" como CTA de Tricholand.
- No clichés de agencia ("vive la experiencia", "conecta con la naturaleza", "planta sagrada", "energía del desierto").
- No peyote, no Lophophora, no plantas globosas tipo "asiento de suegra" como si fueran el producto. El producto son COLUMNAS.

VOZ:
- De tú, profesional de gremio. Frases claras, datos concretos (m², uds, plazos, códigos). Orgullo de productor murciano, sin costumbrismo vacío.
- Autoridad hortícola: sustrato, riego, aclimatación post-transporte, etiquetado Trichocereus vs Echinopsis, packing list. Eso es contenido, no postureo.
- CTA recurrentes: solicitar presupuesto, indicar variedades/tamaños/cantidades, cultivo por encargo, escribir a info@tricholand.com.

IMÁGENES:
- Dos territorios visuales OBLIGATORIOS en el mismo mes: (1) vivero / oficio y (2) DESTINO — jardín mediterráneo europeo, patio seco, grava, muro encalado, lineal de garden, columna YA plantada en suelo. Como mínimo 1 de cada 3 teselas de feed debe ocurrir FUERA del umbráculo.
- El cactus es columnar (costillas verticales, areolas, porte de candelabro o columna simple). Nunca un cactus bola, nunca saguaro del far west como si fuera Trichocereus. Reportaje real, no stock de desierto americano ni Arizona de película.
- Presencia humana baja: viverista o paisajista plantando, no modelos, no yoga, no ritual.
- Paleta de marca: negro #1a1a1a, crudo #f5f2eb, naranja #c4652a, verde oliva #3d5a3d, terracota #b85c38. Logo cactus amarillo sobre oscuro; no recolorarlo ni inventar otro isotipo.
- EL FEED ES LA UNIDAD: el muro no puede ser un tapiz de "guante + columna + umbráculo" ni un tapiz de cajas y pasaportes. Reparte tipos de escena (detalle, lote, oficio, DESTINO/jardín, documento, divulgación). PROHIBIDO dos teselas seguidas con el mismo gesto icónico. Fidelidad a las refs = morfología real, no el mismo fotograma de bancada.`;

const TRICHOLAND_PHYSICAL_CONSTRAINTS = `PRODUCTO: cactus columnares del género Trichocereus (sin. Echinopsis para muchos autores), cultivados en vivero en Murcia. Tallo cilíndrico vertical con costillas longitudinales, areolas y espinas según taxón; epidermis verde, glauca o verde-azulada. NO son cactus globosos, NO son Opuntia/chumbera, NO son saguaros Carnegiea, NO son ágaves ni yucas.

Especies reales del catálogo (respetar morfología si se nombra la variedad):
- T. pachanoi (San Pedro): columna relativamente lisa, pocas espinas cortas, verde-glauco, crecimiento rápido.
- T. peruvianus (Antorcha Peruana): más robusto y espinoso que pachanoi.
- T. bridgesii (Achuma/Wachuma): más delgado, espinas largas; stock limitado — no mostrarlo como "siempre a palé lleno".
- T. terscheckii (Cardón Grande): porte más monumental, costillas marcadas.
- T. macrogonus, T. spachianus, crestados y otros cactus de colección: solo si el copy lo pide; el héroe de marca es Trichocereus columnar.

CONTEXTO FÍSICO DEL NEGOCIO:
- Vivero de producción (2.500 m²): bancadas, macetas de cultivo (Ø típico de lineal C.12 y superiores), malla/invernadero mediterráneo, suelo de cultivo, cajas y pallets para mayorista.
- Destino de las plantas (TERRITORIO VISUAL DE PRIMER ORDEN, no extra): jardín mediterráneo europeo, patio, grava, sol, arquitectura sencilla, lineal de garden center, xeropaisajismo. En estas escenas la columna va PLANTADA o expuesta como planta ornamental, no en maceta negra de cultivo. PROHIBIDO: desierto hollywoodiense, pirámides, altares, humo ceremonial, gente en trance.
- Logística real: cajas ventiladas, etiquetas, pasaporte de planta UE, camión. No Amazon envelope ni maceta de decoración de IKEA como packaging de marca.

IDENTIDAD:
- Logo: cactus columnar amarillo/dorado simplificado (archivo logo_tricho_yellow). Palabra "Tricholand" en sans condensada (Archivo Narrow), uppercase. Tagline: Productores de Trichocereus.
- Colores: negro carbón #1a1a1a, crudo #f5f2eb, naranja #c4652a, verde #3d5a3d, verde oscuro #1b3a2f, terracota #b85c38. No paleta neón, no jungla tropical, no rosa.
- PROHIBIDO inventar otros logos, banderas de "shaman shop", setas, o copy superpuesto tipo feria psicodélica.

HUMANOS: secundarios o ausentes. Si aparecen, son viveristas o trade (ropa de trabajo, no recinto ceremonial). Ningún consumo, corte de tallo para "té" ni primer plano de cuchillo sobre pulpa.`;

const TRICHOLAND_PILLARS = [
  {
    name: 'Oficio de columnares',
    percentage: 25,
    description:
      'Producción propia en Murcia: bancadas, esqueje, aclimatación y criterio de calidad. Existe para mostrar autoridad de vivero, no para ocupar el muro entero.',
    content_types: ['Reel de proceso', 'Carrusel técnico', 'Story de bancada'],
    example_topics: [
      'De esqueje a columna lista: qué cambia en 2.500 m² de Murcia',
      'Densidad de bancada y homogeneidad de un lote',
      'Qué se mira en un corte de columna antes de propagar',
    ],
  },
  {
    name: 'Surtido que se entiende',
    percentage: 15,
    description:
      'Comparar siluetas y usos de T. pachanoi, peruvianus, bridgesii y terscheckii para que garden y paisajista elijan, sin convertir cada pieza en ficha SKU.',
    content_types: ['Carrusel comparativo', 'Reel de lectura visual', 'Publicación de silueta'],
    example_topics: [
      'TRI-PAC vs TRI-PER: dos lecturas de columna',
      'Cuándo un proyecto pide T. terscheckii y cuándo no',
      'Bridgesii como complemento, no como base de reposición',
    ],
  },
  {
    name: 'Paisajismo con Trichocereus',
    percentage: 25,
    description:
      'Cómo se plantan, se agrupan y se leen las columnas en un jardín mediterráneo o un lineal europeo. Este pilar abre el espectro: destino, decoración, composición. La planta ya está en el suelo o en exposición, no en la maceta negra del umbráculo.',
    content_types: [
      'Carrusel de composiciones',
      'Publicación de jardín implantado',
      'Reel de plantación',
      'Story de detalle de grava y porte',
    ],
    example_topics: [
      'Tres composiciones con columnares: patio, grava y muro encalado',
      'Densidad de plantación: una columna solitaria vs un ritmo de tres',
      'Cómo vestir un lineal de garden para que el columnar se lea de lejos',
      'Acompañantes mediterráneos que no compiten con la vertical (oliva, grava, tapizantes secos)',
    ],
  },
  {
    name: 'Divulgación ornamental',
    percentage: 20,
    description:
      'Enseñar de verdad: anatomía, clima, riego, luz, diferencias entre especies, mitos vs realidad. El lector sale sabiendo algo de la planta, no solo cómo pedir un presupuesto.',
    content_types: ['Carrusel didáctico', 'Reel corto de un solo dato', 'Story de mito vs hecho'],
    example_topics: [
      'Costilla, areola y ápice: cómo leer una columna sin ser botánico',
      'Trichocereus y Echinopsis: por qué ves los dos nombres en la misma planta',
      'Sol, riego y suelo: lo que aguanta un columnar en clima mediterráneo',
      'No es un cactus bola ni un saguaro de película: qué lo hace columnar',
    ],
  },
  {
    name: 'Operativa B2B',
    percentage: 15,
    description:
      'Logística, pasaporte UE, plazos y cómo pedir presupuesto. Pilar de conversión: minoría del mes. Si aparece más de ~15%, el feed se vuelve aduana.',
    content_types: ['Carrusel de expedición', 'Publicación de CTA', 'Story de consulta'],
    example_topics: [
      'Qué datos mandar a info@tricholand.com para un presupuesto útil',
      '750 uds: cómo mezclar variedades y tamaños',
      'Pasaporte UE y plazos reales de recepción',
    ],
  },
];

const TRICHOLAND_THEMES = [
  {
    theme: 'Jardín mediterráneo con columnas',
    frequency: 'semanal',
    description:
      'Serie de destino: implantación, composición y decoración con Trichocereus en Europa. Cubre el hueco de un muro que solo mostraba vivero.',
    example_topics: [
      'Una columna junto a un muro encalado: escala y sombra',
      'Ritmo de tres T. pachanoi sobre grava',
      'Qué variedad para un patio seco y cuál para un proyecto más monumental',
    ],
  },
  {
    theme: 'Escuela de la columna',
    frequency: 'semanal',
    description:
      'Divulgación corta y concreta: anatomía, cultivo, nombres botánicos, mitos. El educativo del proyecto vive aquí, no en checklists de comprador.',
    example_topics: [
      'Cómo se lee un ápice de Trichocereus',
      'Riego después del trasplante: menos de lo que parece',
      'San Pedro como nombre hortícola, no como gancho etnobotánico',
    ],
  },
  {
    theme: 'Parte de vivero Murcia',
    frequency: 'quincenal',
    description:
      'Oficio real, a menor cadencia que antes: bancadas, esquejes, aclimatación. Documenta producción propia sin tapizar el mes.',
    example_topics: [
      'Qué se ve en una bancada antes de seleccionar lote',
      'Por qué la aclimatación en Murcia se nota en destino',
    ],
  },
  {
    theme: 'Consulta profesional',
    frequency: 'quincenal',
    description:
      'La vía de conversión: 750 uds, mezcla de referencias, reserva de campaña. Pocas piezas, claras.',
    example_topics: [
      'Ejemplo de consulta completa a info@tricholand.com',
      'Cuándo reservar campaña de TRI-PAC',
    ],
  },
];

const TRICHOLAND_RECS =
  'Reparto 25/15/25/20/15: oficio, surtido, PAISAJISMO, divulgación, operativa. El mes debe leerse como una cuenta de planta ornamental columnar, no como el manual de expedición de un mayorista. Al menos un tercio de las teselas de feed ocurren fuera del umbráculo (jardín, patio, lineal, planta en suelo). El educativo enseña cultivo y composición; la venta directa se concentra en pocas piezas (750 uds, presupuesto, reserva). Mantener la línea roja etnobotánica. Frente a generalistas de Elche, Tricholand gana por especialidad de columna Y por enseñar cómo se planta, no solo cómo se embala.';

const COMPETITORS = [
  {
    name: 'Mediflora',
    url: 'https://mediflora.es/',
    reason:
      'Vivero mayorista de Elche (Alicante) con cactus y suculentas de gran formato, incluido Trichocereus, orientado a paisajismo. Competidor de territorio Levante y de buyer profesional; catálogo amplio vs especialización Trichocereus de Tricholand.',
  },
  {
    name: 'Canarius',
    url: 'https://www.canarius.com/',
    reason:
      'Vivero canario de plantas raras y coleccionismo (incluye Trichocereus). Útil como contrapunto: más B2C/coleccionista y unidad suelta, frente al modelo mayorista 750 uds y garden center de Tricholand.',
  },
  {
    name: 'Cactus Plaza',
    url: 'https://www.cactusplaza.com/',
    reason:
      'Mayorista europeo de cactus (Países Bajos) con catálogo generalista y red de garden centers. Referente de cómo se comunica el cactus ornamental B2B en el norte de Europa; menos foco en Trichocereus como género experto.',
  },
];

const BRAND_COLORS = [
  {
    hex: '#1a1a1a',
    name: 'Negro carbón',
    usage: 'primary',
    notes: 'Fondo de header, bloques de autoridad y contraste alto. Color estructural de la web.',
    found_in: '--color-negro:#1a1a1a; header.bg-negro',
  },
  {
    hex: '#c4652a',
    name: 'Naranja de marca',
    usage: 'accent',
    notes: 'CTA, estados activos de navegación (Tienda B2B) y acentos de interfaz.',
    found_in: '--color-naranja:#c4652a; .text-naranja; .bg-naranja',
  },
  {
    hex: '#3d5a3d',
    name: 'Verde oliva vivero',
    usage: 'secondary',
    notes: 'Verde de cultivo; hover de nav y superficies vegetales. No es un verde césped saturado.',
    found_in: '--color-verde:#3d5a3d',
  },
  {
    hex: '#f5f2eb',
    name: 'Crudo',
    usage: 'background',
    notes: 'Papel/arena clara. Texto sobre negro y fondos de ficha.',
    found_in: '--color-crudo:#f5f2eb; .text-crudo; .bg-crudo',
  },
  {
    hex: '#b85c38',
    name: 'Terracota',
    usage: 'accent',
    notes: 'Tierra cocida; apoyo cálido al naranja, coherente con maceta y suelo de cultivo.',
    found_in: '--color-terracota:#b85c38',
  },
  {
    hex: '#1b3a2f',
    name: 'Verde oscuro',
    usage: 'secondary',
    notes: 'Profundidad vegetal sobre fondos oscuros.',
    found_in: '--color-verde-oscuro:#1b3a2f',
  },
  {
    hex: '#faf9f7',
    name: 'Blanco cálido',
    usage: 'background',
    notes: 'Blancos de superficie; no es blanco puro de clínica.',
    found_in: '--color-blanco:#faf9f7',
  },
  {
    hex: '#3d3730',
    name: 'Marrón',
    usage: 'secondary',
    notes: 'Tierra y texto secundario (marrón claro en fichas de variedad).',
    found_in: '--color-marron:#3d3730; --color-marron-claro:#6b6258',
  },
];

const BRAND_FONTS = [
  {
    name: 'Archivo Narrow',
    usage: 'Titulares, nav y wordmark',
    notes: 'Sans condensada en uppercase. Voz de catálogo industrial/vivero, no script ni serif editorial.',
    weights: '700',
    fallbacks: 'Arial Narrow, sans-serif',
  },
  {
    name: 'Sans de interfaz (body)',
    usage: 'Cuerpo de ficha y blog',
    notes: 'Texto de trabajo: plazos, variedades, condiciones. Legible, no display.',
    weights: '400, 600',
    fallbacks: 'system-ui, sans-serif',
  },
];

const BRAND_IDENTITY_DETAIL = {
  palette_analysis:
    'Sistema desierto-vivero: negro carbón para autoridad B2B, crudo como papel de catálogo, naranja terracota como único grito comercial, verdes oliva tomados del tallo y no de un césped stock. El logo amarillo del cactus columnar es el único amarillo permitido; no extenderlo a fondos.',
  typography_analysis:
    'Archivo Narrow en caja alta para marca y secciones (Catálogo producción, Servicios). Cuerpo sans funcional. Sensación de packing list y ficha técnica, no de revista lifestyle.',
  layout_components:
    'Header negro con wordmark + isotipo amarillo; nav uppercase; hero de productor con métricas (25K+, 2.500 m², 18 países); grid de variedades con código TRI-xxx; bloques de servicio 01–04; CTA de presupuesto por email.',
  imagery_iconography:
    'Fotografía real de columnas y de instalación. Iconografía mínima. El cactus del logo es columnar simplificado, no un globo ni un saguaro de souvenir.',
  brand_feel_keywords: [
    'productor',
    'mayorista',
    'columnar',
    'Murcia',
    'fitosanitario',
    'catálogo',
    'oficio',
    'mediterráneo',
  ],
  accessibility_notes:
    'Texto crudo sobre negro y naranja sobre negro con buen contraste en CTA. Evitar naranja sobre verde oliva. No texto fino blanco sobre foto de invernadero sin velo oscuro.',
  rrss_practical_tips: [
    'Plantillas con fondo #1a1a1a o #f5f2eb; acento #c4652a en un solo elemento (SKU, CTA, filete).',
    'Wordmark Tricholand en condensed uppercase; no forzar el logo amarillo en todas las slides.',
    'Una variedad por pieza de catálogo; el código TRI- visible si es ficha.',
    'Métricas reales (750 uds, 7 días, pasaporte UE) como dato, no como sticker decorativo vacío.',
  ],
  dos: [
    'Mostrar la planta real, el vivero y el packing de mayorista.',
    'Usar nombre botánico + nombre común hortícola.',
    'Hablar a compradores de lineal y de obra.',
    'Citar plazos, mínimo de pedido y documentación UE cuando el post sea de servicio.',
  ],
  donts: [
    'Estética psicodélica, ritual o "planta sagrada".',
    'Cactus bola, far west o stock de Arizona como si fueran el producto.',
    'CTA a particular o ecommerce de 1 unidad.',
    'Inventar el equipo, la finca o un certificado no mencionado en la web.',
  ],
  css_tokens_cited: [
    { token: '--color-negro', role: 'fondo primario / autoridad' },
    { token: '--color-naranja', role: 'acento CTA' },
    { token: '--color-verde', role: 'secundario vegetal' },
    { token: '--color-crudo', role: 'fondo y texto sobre oscuro' },
    { token: '--font-archivo-narrow', role: 'titulares y marca' },
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
    .ilike('name', '%Tricholand%')
    .is('deleted_at', null);

  const now = new Date().toISOString();
  const payload = {
    user_id: OWNER_USER_ID,
    name: PROJECT_NAME,
    url: PROJECT_URL,
    sector: 'Vivero productor de Trichocereus y cactus columnares (mayorista B2B)',
    location: 'Murcia, España',
    description:
      'Tricholand es un vivero productor en Murcia (2.500 m²) especializado en el cultivo y la distribución mayorista de cactus del género Trichocereus y otras cactáceas columnares. Venta exclusiva B2B a viveros, garden centers, distribuidores y paisajistas de Europa: pedido mínimo 750 unidades, producción propia (25K+ uds/año), pasaporte de planta UE incluido y envíos a 18 países. Catálogo: T. pachanoi (San Pedro), T. peruvianus (Antorcha Peruana), T. bridgesii (Achuma/Wachuma, stock limitado), T. terscheckii (Cardón Grande), Macrogonus, Spachianus y otros. Preparación 7 días laborables; ES 48–72 h, UE 3 días, UK 5–7 días, con embalaje y temperatura controlada. Presupuesto en menos de 24 h laborables (info@tricholand.com). Posicionamiento: productor especialista ornamental, no tienda de coleccionista ni vivero generalista de crasas.',
    client_type: 'b2b',
    primary_goal: 'leads',
    secondary_goals: ['branding', 'ventas'],
    tone_formality: 68,
    tone_proximity: 38,
    tone_emotion: 62,
    tone_humor: 72,
    tone_disruption: 74,
    content_style: {
      educativo: 82,
      corporativo: 58,
      comercial: 70,
      inspiracional: 42,
      personal: 18,
      entretenimiento: 22,
    },
    commercial_level: 'alto',
    complexity: 'experto',
    human_presence: 'baja',
    experimentation: 'conservador',
    weekly_format_distribution: {
      story: 2,
      carrusel: 2,
      publicacion: 1,
      reel: 1,
    },
    posts_per_week: 6,
    ai_rules: TRICHOLAND_AI_RULES,
    physical_constraints: TRICHOLAND_PHYSICAL_CONSTRAINTS,
    physical_constraints_at: now,
    sells_physical_product: true,
    image_orientation: 'vertical',
    visual_creative_direction: 'literal',
    image_aesthetic: 'profesional',
    brand_colors: BRAND_COLORS,
    brand_fonts: BRAND_FONTS,
    brand_logo_url: 'https://www.tricholand.com/images/icons/logo_tricho_yellow_200_200.webp',
    brand_favicon_url: 'https://www.tricholand.com/favicon.png',
    brand_summary:
      'Tricholand se presenta como vivero productor B2B, no como boutique de plantas. Identidad de catálogo industrial mediterráneo: header negro, wordmark en Archivo Narrow uppercase, isotipo de cactus columnar amarillo y una paleta de carbón, crudo, naranja terracota y verde oliva extraída de los tokens CSS (--color-negro, --color-crudo, --color-naranja, --color-verde). La web (ES + 6 idiomas) mezcla métricas de producción (25K+, 2.500 m², 18 países, 99% entrega OK) con fichas de variedad (códigos TRI-PAC/PER/BRI/TER) y servicios de mayorista (mínimo 750 uds, pasaporte UE, cultivo por encargo). Para RRSS: reportaje de oficio y producto real; el naranja es el único grito; jamás estética etnobotánica.',
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
          ai_rules: `(${TRICHOLAND_AI_RULES.length} chars)`,
          physical_constraints: `(${TRICHOLAND_PHYSICAL_CONSTRAINTS.length} chars)`,
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
      console.error('No hay proyecto Tricholand que actualizar.');
      process.exit(1);
    }
    const projectPatch = spectrumOnly
      ? {
          ai_rules: TRICHOLAND_AI_RULES,
          physical_constraints: TRICHOLAND_PHYSICAL_CONSTRAINTS,
          physical_constraints_at: new Date().toISOString(),
        }
      : { ai_rules: TRICHOLAND_AI_RULES };
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
            content_pillars: TRICHOLAND_PILLARS,
            thematic_lines: TRICHOLAND_THEMES,
            recommendations: TRICHOLAND_RECS,
          })
          .eq('id', strat.id);
        if (uErr) {
          console.error('Error update estrategia:', uErr.message);
          process.exit(1);
        }
        console.log(`✓ estrategia ${strat.id} reabierta (paisajismo 25% + divulgación 20%)`);
      } else {
        console.log('⚠ No hay estrategia que actualizar; regenera estrategia después.');
      }
    }
    console.log(`\n✓ proyecto ${projectId} actualizado (${TRICHOLAND_AI_RULES.length} chars de ai_rules)`);
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
  console.log('  Siguiente: pipeline web → competidores → estrategia (marca ya cargada).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
