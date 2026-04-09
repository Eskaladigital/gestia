import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const BUCKET = 'visual-assets';

// Coletilla final de realismo fotográfico (adaptada del doc "agente generador de imágenes.txt").
// Se concatena SIEMPRE al prompt antes de enviarlo a gpt-image-1.5.
// Normaliza el acabado y baja el riesgo de que el modelo "embellezca" demasiado.
const IMAGE_REALISM_TAIL = [
  'Tomada como fotografia real con camara full frame profesional y optica de reportaje de alta calidad,',
  'luz existente fisicamente creible, color natural y balance de blancos realista, contraste moderado,',
  'grano minimo natural, detalle autentico en piel, telas, arena, piedra, vegetacion o arquitectura segun la escena;',
  'siempre de dia, luminosa y clara, nunca nocturna ni sombria, con sensacion de franja horaria util y luz comercial aprovechable;',
  'si aparecen personas, secundarias, naturales y no posadas, sin expresiones de anuncio ni poses artificiales;',
  'sin HDR agresivo, sin acabado plastico, sin render 3D, sin pintura digital, sin ilustracion, sin tipografia ni logotipos;',
  'sin cielos neon, sin piel de plastico, sin simetria de postal barata, sin oversaturacion, sin glow fantasioso,',
  'sin niebla magica, sin perfeccion plastica, sin brillo artificial, sin composicion imposible, sin escenografia de fantasia;',
  'profundidad de campo natural, texturas realistas, imperfecciones creibles, composicion editorial premium,',
  'encuadre horizontal amplio, realismo fotografico absoluto.',
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
  'lujoso', 'lujosa', 'soñador', 'soñadora',
];

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
    .select('*, content_items!inner(id, project_id, projects!inner(id, user_id, name, sector, location))')
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

    let prompt = cleanPrompt(visual.visual_prompt);

    // Forzar que arranque con la frase canónica del documento si no la tiene
    const hasPhotoPreamble = /fotograf[íi]a\s+hiperrealista/i.test(prompt);
    if (!hasPhotoPreamble) {
      prompt = `Fotografia hiperrealista y cinematografica de ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;
    }

    // Concatenar la cola fija de realismo (paso 4 del doc)
    prompt = `${prompt}\n\n${IMAGE_REALISM_TAIL}`;

    // Truncar a 4000 chars (paso 6 del doc)
    if (prompt.length > MAX_PROMPT_LENGTH) {
      prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
    }

    const apiKey = await resolveOpenAIKey(user.id);
    if (!apiKey) {
      throw new Error('No se encontró API key de OpenAI. Configúrala en Ajustes → Proveedores IA.');
    }

    const openai = new OpenAI({ apiKey });

    console.log(`[generate-image] Generando imagen para visual ${visual_id}, prompt: ${prompt.length} chars`);

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
