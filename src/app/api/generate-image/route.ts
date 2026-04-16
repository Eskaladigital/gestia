import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const BUCKET = 'visual-assets';
const REFINER_MODEL = 'gpt-4o';
const REFINER_TEMPERATURE = 0.18;
const REFINER_MAX_TOKENS = 1200;

const REALISM_REFINER_SYSTEM = `Eres un retocador de prompts para generacion de imagenes fotorrealistas. Recibes el prompt visible que el usuario ya ha aprobado. Tu trabajo es RETOCARLO para que el modelo de imagen lo interprete de la forma mas fotorrealista posible.

REGLAS ESTRICTAS:
- NO cambies la escena, los sujetos, los objetos, la accion ni la idea del prompt original. La escena que describe el usuario es sagrada.
- NO inventes elementos nuevos que no esten en el prompt original.
- NO elimines sujetos, objetos ni acciones que el prompt mencione.
- SI puedes: mejorar la descripcion de la luz para que suene a luz natural real, sustituir adjetivos vagos por materiales o texturas concretas, añadir detalles de camara (tipo de plano, profundidad de campo) si no los tiene, y rebajar cualquier frase que suene a "arte generativo" o "poster de IA".
- Si el prompt menciona personas, mantenlas pero asegurate de que la descripcion las presente naturales y no posadas.
- Si hay indicaciones de video (frame rate, travelling, motion blur), respetalas pero adaptalas para que funcionen como fotograma fijo: describe el instante congelado, no la secuencia.
- Quita referencias a logotipos, marcas o texto visible que el modelo de imagen no puede renderizar bien.

FORMATO DE SALIDA:
- Un unico bloque de texto en espanol, sin saltos de linea, sin vinetas, sin comillas, sin markdown.
- Debe sonar a encargo fotografico profesional, no a instruccion artistica.
- No escribas nada antes ni despues del prompt retocado.`;

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

const TOXIC_WORDS = [
  'magical', 'dreamy', 'ethereal', 'stunning', 'breathtaking',
  'luxurious', 'perfect', 'mágico', 'mágica', 'onírico', 'onírica',
  'etéreo', 'etérea', 'impresionante', 'perfecto', 'perfección',
  'lujoso', 'lujosa', 'soñador', 'soñadora', 'instagramable',
  'instagrammable', 'epico', 'epica', 'de ensueño', 'de ensueno',
];

/**
 * Toma el prompt visible del usuario, lo refina con una sola pasada
 * de GPT-4o para mejorar el realismo fotográfico (sin cambiar la
 * escena ni la idea), y le añade la cola de realismo.
 *
 * El prompt visible sigue siendo el que manda: la pasada de refinamiento
 * solo retoca vocabulario y detalles técnicos fotográficos.
 */
async function buildFinalPrompt(openai: OpenAI, rawPrompt: string): Promise<string> {
  const cleaned = cleanPrompt(rawPrompt);

  let prompt: string;
  try {
    const response = await openai.chat.completions.create({
      model: REFINER_MODEL,
      messages: [
        { role: 'system', content: REALISM_REFINER_SYSTEM },
        { role: 'user', content: cleaned },
      ],
      temperature: REFINER_TEMPERATURE,
      max_tokens: REFINER_MAX_TOKENS,
    });
    prompt = cleanPrompt(response.choices[0]?.message?.content || cleaned);
  } catch {
    prompt = cleaned;
  }

  if (!/fotograf[íi]a\s+hiperrealista/i.test(prompt)) {
    prompt = `Fotografia hiperrealista y cinematografica de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
  }

  prompt = `${prompt}\n\n${IMAGE_REALISM_TAIL}`;

  if (prompt.length > MAX_PROMPT_LENGTH) {
    prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
  }
  if (prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error(`El prompt visual es demasiado corto (${prompt.length} chars)`);
  }
  return prompt;
}

function cleanPrompt(raw: string): string {
  let p = raw.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  p = p.replace(/\s{2,}/g, ' ');
  for (const word of TOXIC_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    p = p.replace(re, '');
  }
  p = p.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
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
        id, project_id,
        projects!inner( id, user_id )
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
    const { error: markGenErr } = await service
      .from('content_item_visuals')
      .update({ image_status: 'generating', image_error: null })
      .eq('id', visual_id);
    if (markGenErr) {
      console.error(`[generate-image] mark-generating failed for ${visual_id}:`, markGenErr);
    }

    const apiKey = await resolveOpenAIKey(user.id);
    if (!apiKey) {
      throw new Error('No se encontró API key de OpenAI. Configúrala en Ajustes → Proveedores IA.');
    }

    const openai = new OpenAI({ apiKey });
    const prompt = await buildFinalPrompt(openai, visual.visual_prompt);

    console.log(`[generate-image] visual ${visual_id}, prompt: ${prompt.length} chars`);

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

    // 1) UPDATE CRÍTICO: url/status/error. Si esto falla, abortamos y devolvemos
    //    error al cliente. Nunca decimos "ready" si la BD no está realmente persistida.
    const { data: savedRow, error: saveErr } = await service
      .from('content_item_visuals')
      .update({
        image_url: imageUrl,
        image_status: 'ready',
        image_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visual_id)
      .select('id, image_url, image_status')
      .maybeSingle();

    if (saveErr || !savedRow) {
      throw new Error(
        `No se pudo guardar la imagen en la base de datos: ${saveErr?.message || 'fila no encontrada tras UPDATE'}`
      );
    }

    if (savedRow.image_url !== imageUrl || savedRow.image_status !== 'ready') {
      throw new Error(
        `La BD no refleja la imagen recién generada (url=${savedRow.image_url}, status=${savedRow.image_status})`
      );
    }

    // 2) Reset opcional del flip horizontal. Puede fallar en entornos donde la
    //    migración 019 todavía no se aplicó: lo toleramos para no bloquear la
    //    generación de imágenes.
    const { error: flipErr } = await service
      .from('content_item_visuals')
      .update({ image_flip_horizontal: false })
      .eq('id', visual_id);
    if (flipErr) {
      console.warn(
        `[generate-image] no se pudo resetear image_flip_horizontal para ${visual_id} ` +
        `(quizá la migración 019 no está aplicada): ${flipErr.message}`
      );
    }

    console.log(`[generate-image] ✓ Visual ${visual_id} → ${imageUrl} (${(buffer.length / 1024).toFixed(0)} KB)`);

    return NextResponse.json({ image_url: imageUrl, status: 'ready' });
  } catch (err: any) {
    console.error(`[generate-image] ✗ Visual ${visual_id}:`, err?.message || err);

    const errorMsg = err?.message || 'Error desconocido generando la imagen';
    const { error: markErr } = await service
      .from('content_item_visuals')
      .update({
        image_status: 'error',
        image_error: errorMsg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visual_id);
    if (markErr) {
      console.error(`[generate-image] mark-error fallback also failed for ${visual_id}:`, markErr);
    }

    const status = err?.status === 429 ? 429 : err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
