import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  DEFAULT_IMAGE_ORIENTATION,
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_QUALITY,
  IMAGE_PROMPT_REFINER_MODEL,
  resolveImageSize,
} from '@/lib/ai/constants';
import type { ImageOrientation } from '@/types';
import {
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  downloadReferenceImagesAsFiles,
  isOpenAIReferenceImageRejection,
  listProjectReferenceImages,
} from '@/lib/projects/reference-images';

// CRÍTICO: esta ruta usa `sharp` para normalizar referencias antes de
// enviarlas a OpenAI y tarda ~2-3 min con gpt-image-2 + referencias.
// - runtime nodejs: sharp no funciona en Edge.
// - maxDuration 300: con 4 referencias la edición de imagen puede pasar
//   de 60s de Vercel Pro por defecto.
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'visual-assets';
const REFINER_MODEL = IMAGE_PROMPT_REFINER_MODEL;
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
function appendReferenceHandlingInstructions(prompt: string, referenceCount: number): string {
  if (referenceCount <= 0) return prompt;
  return `${prompt}

Si hay imágenes de referencia del producto, úsalas para respetar forma, proporciones, acabados, colores y rasgos distintivos del producto real, pero NO copies necesariamente el mismo ángulo, la misma altura de cámara, la misma distancia ni el mismo encuadre de esas referencias. La composición final debe obedecer a la escena descrita en este prompt y mantener variedad de planos entre piezas del proyecto.`;
}

async function buildFinalPrompt(openai: OpenAI, rawPrompt: string, referenceCount = 0): Promise<string> {
  const cleaned = cleanPrompt(rawPrompt);

  let prompt: string;
  try {
    const response = await openai.chat.completions.create({
      model: REFINER_MODEL,
      messages: [
        { role: 'system', content: REALISM_REFINER_SYSTEM },
        { role: 'user', content: appendReferenceHandlingInstructions(cleaned, referenceCount) },
      ],
      temperature: REFINER_TEMPERATURE,
      max_completion_tokens: REFINER_MAX_TOKENS,
    });
    prompt = cleanPrompt(response.choices[0]?.message?.content || cleaned);
  } catch {
    prompt = cleaned;
  }

  if (!/fotograf[íi]a\s+hiperrealista/i.test(prompt)) {
    prompt = `Fotografia hiperrealista y cinematografica de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
  }

  prompt = `${appendReferenceHandlingInstructions(prompt, referenceCount)}\n\n${IMAGE_REALISM_TAIL}`;

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

  const VISUAL_SELECT_WITH_ORIENTATION = `
      *,
      content_items!inner(
        id, project_id,
        projects!inner( id, user_id, image_orientation )
      )
    `;
  const VISUAL_SELECT_LEGACY = `
      *,
      content_items!inner(
        id, project_id,
        projects!inner( id, user_id )
      )
    `;

  let { data: visual, error: vErr } = await service
    .from('content_item_visuals')
    .select(VISUAL_SELECT_WITH_ORIENTATION)
    .eq('id', visual_id)
    .maybeSingle();

  // Fallback si la migración 022 (image_orientation) aún no está aplicada.
  if (vErr && /image_orientation/i.test(String(vErr.message || ''))) {
    const retry = await service
      .from('content_item_visuals')
      .select(VISUAL_SELECT_LEGACY)
      .eq('id', visual_id)
      .maybeSingle();
    visual = retry.data;
    vErr = retry.error;
  }

  if (vErr || !visual) {
    return NextResponse.json({ error: 'Visual no encontrado' }, { status: 404 });
  }

  const project = (visual as any).content_items?.projects;
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado para este proyecto' }, { status: 403 });
  }

  const projectOrientation: ImageOrientation =
    (project.image_orientation as ImageOrientation | undefined) || DEFAULT_IMAGE_ORIENTATION;
  const imageSize = resolveImageSize(projectOrientation);

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
    const referenceImages = await listProjectReferenceImages(
      service,
      project.id,
      DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI
    );
    const prompt = await buildFinalPrompt(openai, visual.visual_prompt, referenceImages.length);

    console.log(
      `[generate-image] visual ${visual_id}, prompt: ${prompt.length} chars, refs: ${referenceImages.length}, ` +
      `orientation: ${projectOrientation} (${imageSize})`
    );

    async function generateWithoutReferences() {
      return openai.images.generate({
        model: IMAGE_GENERATION_MODEL,
        prompt,
        n: 1,
        size: imageSize as `${number}x${number}`,
        quality: IMAGE_GENERATION_QUALITY,
      });
    }

    let response: Awaited<ReturnType<typeof openai.images.generate>>;
    if (referenceImages.length > 0) {
      try {
        const referenceFiles = await downloadReferenceImagesAsFiles(referenceImages);
        response = await openai.images.edit({
          model: IMAGE_GENERATION_MODEL,
          image: referenceFiles,
          prompt,
          size: imageSize as `${number}x${number}`,
          quality: IMAGE_GENERATION_QUALITY,
        });
      } catch (editErr) {
        if (!isOpenAIReferenceImageRejection(editErr)) {
          throw editErr;
        }
        console.warn(
          `[generate-image] ${visual_id}: OpenAI rechazó las referencias (${(editErr as any)?.message}). ` +
          `Volviendo a generar sin referencias para no bloquear la pieza.`
        );
        response = await generateWithoutReferences();
      }
    } else {
      response = await generateWithoutReferences();
    }

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
