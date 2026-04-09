import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const BUCKET = 'visual-assets';
const TEXT_MODEL = 'gpt-4o';
const BUILDER_TEMPERATURE = 0.32;
const REFINER_TEMPERATURE = 0.18;
const BUILDER_MAX_TOKENS = 900;
const REFINER_MAX_TOKENS = 900;

// Coletilla final de realismo fotográfico (adaptada del doc "agente generador de imágenes.txt").
// Se concatena SIEMPRE al prompt antes de enviarlo a gpt-image-1.5.
// Normaliza el acabado y baja el riesgo de que el modelo "embellezca" demasiado.
const IMAGE_REALISM_TAIL = [
  'Tomada como fotografia real con camara full frame profesional y optica de reportaje de alta calidad,',
  'luz existente fisicamente creible, color natural y balance de blancos realista, contraste moderado,',
  'grano minimo natural, detalle autentico en piel, telas, piedra, vegetacion o arquitectura segun la escena;',
  'sujeto u objeto principal ocupando entre un tercio y dos tercios del encuadre, con fondo real visible que contextualice;',
  'siempre de dia, luminosa y clara, nunca nocturna ni sombria;',
  'si aparecen personas, secundarias, naturales y no posadas;',
  'sin HDR agresivo, sin acabado plastico, sin render 3D, sin pintura digital, sin ilustracion, sin tipografia ni logotipos.',
].join(' ');

const MAX_PROMPT_LENGTH = 4000;
const MIN_PROMPT_LENGTH = 200;

// Palabras que el documento marca como tóxicas para realismo fotográfico.
// Si aparecen sueltas en el prompt, las eliminamos para evitar que el modelo
// las interprete y genere "look IA".
const TOXIC_WORDS = [
  'magical', 'dreamy', 'ethereal', 'stunning', 'breathtaking',
  'luxurious', 'perfect', 'mágico', 'mágica', 'onírico', 'onírica',
  'etéreo', 'etérea', 'impresionante', 'perfecto', 'perfección',
  'lujoso', 'lujosa', 'soñador', 'soñadora', 'instagramable',
  'instagrammable', 'epico', 'epica', 'de ensueño', 'de ensueno',
];

const PROMPT_BUILDER_SYSTEM = `Eres un agente senior: director de arte + location scout + especialista en prompts para generacion de imagenes fotorrealistas. Recibes un DOSSIER COMPLETO sobre un elemento de negocio (producto, articulo, categoria, servicio, publicacion de redes sociales o experiencia). Tu UNICA salida es UN parrafo en espanol que el modelo de imagen usara tal cual: debe ser la mejor posible.

ANTES de escribir (mentalmente, no lo imprimas): (1) Elige el escenario visual mas especifico y honesto con el dossier, no una escena generica ni una "postal bonita". (2) Conecta contexto, uso, materiales, publico y posicionamiento real. (3) Elige UNA luz creible de dia (manana luminosa, media manana, tarde clara o golden hour todavia alta) coherente con estacion y region. (4) Anade 2-4 sustantivos CONCRETOS de textura o material (adobe, lino, arcilla, corcho, sal, musgo, hormigon, madera envejecida, algodon lavado, piedra, arena, baldosa hidraulica) alineados con el lugar y la actividad, no adjetivos vacios. (5) Si hay conflicto entre campos, prima la descripcion del visual + idea + copy sobre suposiciones. (6) Piensa como si un fotografo profesional estuviera fisicamente alli con una camara full frame de alta gama haciendo una foto real para una portada editorial, no como si estuviera "creando arte". (7) Decide la PROPORCION del sujeto u objeto principal respecto al encuadre: el sujeto debe ocupar entre un 30% y un 60% del area visible, ni tan pequeno que se pierda en el fondo ni tan grande que parezca un packshot recortado o un primer plano artificial; el resto debe ser entorno real que contextualice la escena.

REGLAS DURAS:
- Geografia: respeta sector, ubicacion y estacion del dossier; no inventes monumentos ni ciudades que no salgan en el dossier.
- Luz/horario: PROHIBIDO noche, anochecer oscuro, hora azul, sol ya puesto, amanecer antes de salir el sol o escenas subexpuestas. La foto debe sentirse tomada con luz natural real, luminosa, clara y usable como portada.
- Proporcion sujeto/fondo: el sujeto u objeto principal debe ocupar entre un tercio y dos tercios del encuadre; el fondo real debe ser visible y contextualizar la escena. Prohibido: sujeto diminuto perdido en paisaje vacio, primer plano extremo que elimine el entorno, o packshot centrado flotando sin contexto. Describe la distancia de camara (plano medio, plano americano, plano general corto) para que la proporcion quede clara.
- Personas: como mucho pocas figuras; rostros sin identidad (espaldas, lejania, desenfoque). Si la presencia humana hace la imagen menos realista, prioriza una escena de entorno real con presencia humana minima o ninguna.
- Prohibido en la escena: texto legible, logotipos, carteles, moviles como foco, marcas, datos de contacto.
- Evita "look IA": cielos neon, piel de plastico, simetria de postal barata, oversaturacion, HDR agresivo, tonos morados irreales, niebla magica, render/pintura/ilustracion, perfeccion plastica, brillo artificial, composicion imposible o escenografia de fantasia.

FORMATO DE SALIDA (obligatorio):
- Exactamente UN parrafo en espanol, sin saltos de linea, sin vinetas, sin comillas, sin markdown.
- Entre 400 y 1100 caracteres: denso y cinematografico, pero fotografico (no guion de pelicula).
- Debe empezar con: Fotografia hiperrealista y cinematografica de
- Debe terminar integrando (en la misma frase final o penultima) la idea de: composicion editorial premium, profundidad de campo natural, texturas realistas, encuadre horizontal amplio, sin texto ni logos ni ilustracion, realismo fotografico absoluto.
- La redaccion debe sonar a encargo fotografico real: camara profesional, luz existente, color natural, detalles imperfectos creibles y atmosfera autentica.

No escribas nada antes ni despues del parrafo.`;

const REALISM_REFINER_SYSTEM = `Eres un editor fotografico obsesionado con el hiperrealismo. Recibes un borrador de prompt de imagen y el DOSSIER original.

TU UNICA TAREA: reescribir el borrador para que parezca todavia MAS una foto real tomada por un profesional con camara y luz existente. NO anadiras instrucciones tecnicas ni meta-lenguaje; solo reescribiras la escena de forma mas concreta, sobria y fotografica.

Checklist mental (no lo imprimas):
1. Si el borrador suena a "arte generativo", "poster" o "catalogo fake", rebajalo: menos adjetivos grandilocuentes, mas sustantivos reales.
2. Asegurate de que la luz descrita sea natural y de dia (NO noche, NO hora azul, NO escena subexpuesta).
3. Si hay personas innecesarias o con caras visibles de cerca, reduce su protagonismo o giralas de espaldas.
4. Sustituye adjetivos abstractos ("increible", "vibrante", "epico", "de ensueno", "magico") por detalles fisicos concretos: material, temperatura de color, tipo de superficie, desgaste, textura tactil.
5. Verifica que la escena es coherente con la ubicacion, estacion y sector del dossier.
6. Si algo suena inverosimil (dos lugares a la vez, objeto imposible, composicion de fantasia), simplificalo.
7. Revisa la proporcion sujeto/fondo: el sujeto u objeto protagonista debe ocupar entre un tercio y dos tercios del encuadre, con fondo real visible que contextualice. Si el borrador describe un paisaje vacio sin sujeto claro, acerca la camara. Si describe un primer plano extremo sin entorno, alejala. Asegurate de que el prompt menciona un tipo de plano concreto (plano medio, plano americano o plano general corto).

FORMATO DE SALIDA (obligatorio):
- Exactamente UN parrafo en espanol, sin saltos de linea, sin vinetas, sin comillas, sin markdown.
- Entre 400 y 1100 caracteres.
- Debe empezar con: Fotografia hiperrealista y cinematografica de
- Debe terminar integrando naturalmente la idea de: composicion editorial premium, profundidad de campo, texturas realistas, sin texto ni logos ni ilustracion, realismo fotografico absoluto.
- Tono: encargo fotografico real y sobrio, no guion artistico.

No escribas nada antes ni despues del parrafo.`;

function clip(text: unknown, max = 2800): string {
  const s = typeof text === 'string' ? text.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

function inferSeason(dateValue?: string | null): string {
  if (!dateValue) return 'sin datos';
  const date = new Date(dateValue);
  const month = Number.isNaN(date.getTime()) ? NaN : date.getMonth() + 1;
  if (!month) return 'sin datos';
  if (month >= 3 && month <= 5) return 'primavera';
  if (month >= 6 && month <= 8) return 'verano';
  if (month >= 9 && month <= 11) return 'otono';
  return 'invierno';
}

function buildDossier(visual: any): string {
  const item = visual.content_items || {};
  const project = item.projects || {};
  const visualLabel = visual.label || `Visual ${Number(visual.visual_index || 0) + 1}`;
  const projectName = clip(project.name, 200) || 'Proyecto sin nombre';
  const projectSector = clip(project.sector, 200) || '';
  const projectLocation = clip(project.location, 200) || '';
  const projectDescription = clip(project.description, 1200) || '';
  const itemIdea = clip(item.idea, 400);
  const itemCopy = clip(item.copy, 800);
  const format = clip(item.format, 80);
  const visualBrief = clip(visual.visual_brief || item.visual_brief, 1200);
  const season = inferSeason(item.scheduled_date);
  const sceneSummary = item.production_specs?.scene_summary
    ? clip(item.production_specs.scene_summary, 600)
    : '';

  const parts: string[] = [
    '=== DOSSIER DEL ELEMENTO ===',
    'Tu salida final sera SOLO el parrafo-prompt para el modelo de imagen.',
    '',
    `Titulo: ${itemIdea || 'sin titulo'}`,
  ];

  if (itemCopy) parts.push(`Resumen: ${itemCopy}`);

  parts.push('');
  parts.push('--- Contexto ---');
  parts.push(`Proyecto: ${projectName}`);
  if (projectSector) parts.push(`Sector: ${projectSector}`);
  if (projectLocation) parts.push(`Lugar: ${projectLocation}`);
  if (projectDescription) parts.push(`Descripcion: ${projectDescription}`);
  if (season !== 'sin datos') parts.push(`Estacion: ${season}`);
  if (format) parts.push(`Formato: ${format}`);

  parts.push('');
  parts.push('--- Escena visual ---');
  parts.push(`Visual: ${visualLabel}`);
  if (visualBrief) parts.push(`Brief visual: ${visualBrief}`);
  if (sceneSummary) parts.push(`Descripcion de escena: ${sceneSummary}`);

  parts.push('');
  parts.push('--- Prohibido en la imagen ---');
  parts.push('Texto legible, logotipos, interfaces, carteles, moviles como foco, poses artificiales, luz falsa, look render, estetica de ilustracion o CGI.');

  return parts.join('\n');
}

async function callTextPass(
  openai: OpenAI,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  const text = response.choices[0]?.message?.content || '';
  return cleanPrompt(text);
}

async function buildFinalPrompt(openai: OpenAI, visual: any): Promise<string> {
  const dossier = buildDossier(visual);
  const firstPass = await callTextPass(
    openai,
    PROMPT_BUILDER_SYSTEM,
    dossier,
    BUILDER_TEMPERATURE,
    BUILDER_MAX_TOKENS,
  );
  const secondPass = await callTextPass(
    openai,
    REALISM_REFINER_SYSTEM,
    `DOSSIER:\n${dossier}\n\nPRIMER PROMPT:\n${firstPass}`,
    REFINER_TEMPERATURE,
    REFINER_MAX_TOKENS,
  );

  let prompt = cleanPrompt(secondPass || firstPass || visual.visual_prompt);
  const hasPhotoPreamble = /fotograf[íi]a\s+hiperrealista/i.test(prompt);
  if (!hasPhotoPreamble) {
    prompt = `Fotografia hiperrealista y cinematografica de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
  }
  prompt = `${prompt}\n\n${IMAGE_REALISM_TAIL}`;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
  }
  if (prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error(`El prompt final refinado es demasiado corto (${prompt.length} chars)`);
  }
  return prompt;
}

function cleanPrompt(raw: string): string {
  let p = raw.trim();
  // 1. Quitar comillas iniciales o finales
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  // 2. Colapsar espacios múltiples
  p = p.replace(/\s{2,}/g, ' ');
  // 3. Eliminar palabras tóxicas que empujan al modelo hacia look IA
  for (const word of TOXIC_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    p = p.replace(re, '');
  }
  // 4. Limpiar espacios residuales tras borrar palabras
  p = p.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
  // 5. Quitar marcadores --ar que van para Midjourney pero no para gpt-image-1.5
  p = p.replace(/--ar\s+\d+:\d+/gi, '').trim();
  return p;
}

async function resolveOpenAIKey(userId: string): Promise<string> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('provider_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .maybeSingle();
  return data?.api_key || process.env.OPENAI_API_KEY || '';
}

async function ensureBucket(supabase: ReturnType<typeof createServiceSupabase>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error && !String(error.message || '').includes('already exists')) {
    console.error('[generate-image] createBucket:', error.message);
  }
}

export async function POST(request: NextRequest) {
  const authSupabase = await createServerSupabase();
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { visual_id } = await request.json();
  if (!visual_id) {
    return NextResponse.json({ error: 'visual_id es obligatorio' }, { status: 400 });
  }

  const service = createServiceSupabase();

  const { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select(`
      *,
      content_items!inner(
        id, project_id, scheduled_date, format,
        idea, copy, visual_brief, production_specs,
        projects!inner(
          id, user_id, name, sector, location, description
        )
      )
    `)
    .eq('id', visual_id)
    .maybeSingle();

  if (vErr || !visual) {
    return NextResponse.json({ error: 'Visual no encontrado' }, { status: 404 });
  }

  const project = (visual as any).content_items?.projects;
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado para este proyecto' }, { status: 403 });
  }

  if (!visual.visual_prompt || visual.visual_prompt.trim().length < MIN_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `El prompt visual es demasiado corto (${visual.visual_prompt?.length || 0} chars, mínimo ${MIN_PROMPT_LENGTH}). Genera primero los briefs visuales.` },
      { status: 422 }
    );
  }

  try {
    await service
      .from('content_item_visuals')
      .update({ image_status: 'generating', image_error: null })
      .eq('id', visual_id);

    const apiKey = await resolveOpenAIKey(user.id);
    if (!apiKey) {
      throw new Error('No se encontró API key de OpenAI. Configúrala en Ajustes → Proveedores IA.');
    }

    const openai = new OpenAI({ apiKey });
    const prompt = await buildFinalPrompt(openai, visual);

    console.log(`[generate-image] Generando imagen para visual ${visual_id}, prompt refinado: ${prompt.length} chars`);

    const response = await openai.images.generate({
      model: 'gpt-image-1.5',
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('La API de OpenAI no devolvió imagen (b64_json vacío)');
    }

    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length < 1000) {
      throw new Error(`Imagen generada demasiado pequeña (${buffer.length} bytes)`);
    }

    await ensureBucket(service);

    const contentItemId = visual.content_item_id;
    const projectId = (visual as any).content_items?.project_id;
    const ts = Date.now();
    const storagePath = `${projectId}/${contentItemId}/${visual.visual_index}-${ts}.png`;

    const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

    if (uploadErr) {
      throw new Error(`Error subiendo imagen a Storage: ${uploadErr.message}`);
    }

    const { data: pubData } = service.storage.from(BUCKET).getPublicUrl(storagePath);
    const imageUrl = pubData?.publicUrl;

    if (!imageUrl) {
      throw new Error('No se pudo obtener la URL pública de la imagen');
    }

    await service
      .from('content_item_visuals')
      .update({
        image_url: imageUrl,
        image_status: 'ready',
        image_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visual_id);

    console.log(`[generate-image] ✓ Visual ${visual_id} → ${imageUrl} (${(buffer.length / 1024).toFixed(0)} KB)`);

    return NextResponse.json({ image_url: imageUrl, status: 'ready' });
  } catch (err: any) {
    console.error(`[generate-image] ✗ Visual ${visual_id}:`, err?.message || err);

    const errorMsg = err?.message || 'Error desconocido generando la imagen';
    await service
      .from('content_item_visuals')
      .update({
        image_status: 'error',
        image_error: errorMsg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visual_id);

    const status = err?.status === 429 ? 429 : err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
