import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { fetchProjectImageGenerationMeta } from '@/lib/supabase/project-queries';
import {
  DEFAULT_IMAGE_ORIENTATION,
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_QUALITY,
  IMAGE_PROMPT_REFINER_MODEL,
  resolveImageSize,
} from '@/lib/ai/constants';
import {
  assessProductFidelity,
  DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
  downloadReferenceImagesAsFiles,
  isOpenAIReferenceImageRejection,
  listProjectReferenceImages,
  selectRelevantReferenceImages,
} from '@/lib/projects/reference-images';
import type { ProductFidelityResult } from '@/lib/projects/reference-images';
import type { ImageOrientation, Project, ProjectReferenceImage } from '@/types';
import {
  effectiveReferenceRoleForPipeline,
  projectUsesProductImageFidelity,
} from '@/lib/projects/product-fidelity';

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
function appendReferenceHandlingInstructions(
  prompt: string,
  referenceCount: number,
  productFidelityMode: boolean
): string {
  if (referenceCount <= 0) return prompt;
  if (productFidelityMode) {
    return `${prompt}

USO DE LAS IMÁGENES DE REFERENCIA (dos ejes que NO debes mezclar):
- IDENTIDAD DEL PRODUCTO (inviolable): reproduce con total fidelidad la forma, geometría, proporciones, materiales, colores estructurales y rasgos distintivos del producto que aparece en las referencias. No cambies su tipología ni inventes un producto genérico: debe ser EL MISMO producto real.
- DIRECCIÓN DE ESCENA (libre): el ángulo, la altura de cámara, la distancia, el encuadre, la luz, la hora y el contexto los decide ESTE prompt, no las referencias. Varía el plano entre piezas manteniendo siempre intacta la identidad del producto.`;
  }
  return `${prompt}

USO DE LAS IMÁGENES DE REFERENCIA (MOODBOARD DE ESTILO — el cliente NO vende un producto físico que clonar):
- Inspiran paleta, luz, contraste y energía visual; NO copies literalmente el mismo objeto de una referencia en cada imagen.
- Cada generación debe VARIAR sujetos y metáforas según ESTE prompt; prohibido repetir la misma tipología (p. ej. la misma máquina expendedora) en todas las piezas.
- El encuadre, la escena y los personajes los decide ESTE prompt, no las referencias.`;
}

/**
 * Antepone al prompt las CORRECCIONES OBLIGATORIAS del usuario: una lista de
 * errores reportados sobre la versión anterior de esta misma imagen que deben
 * quedar resueltos en la siguiente generación.
 *
 * El bloque se inserta DESPUÉS del refiner para que no sea reescrito ni
 * diluido, y antes de la cola de realismo para que todas las instrucciones
 * fotográficas finales sigan aplicando.
 */
/**
 * Añade al prompt una explicación de qué muestra CADA referencia que se le va
 * a pasar a OpenAI, en el mismo orden en que se mandan. Sirve para que la IA
 * no se confunda y para que respete la distribución (interior) o la silueta
 * (exterior) según la pieza.
 */
function applyReferenceCaptionsToPrompt(
  prompt: string,
  selected: ProjectReferenceImage[],
  selectorReasoning: string | undefined,
  productFidelityMode: boolean,
  sellsPhysicalProduct?: boolean | null
): string {
  if (selected.length === 0) return prompt;
  const lines: string[] = [];
  lines.push('REFERENCIAS VISUALES PARA ESTE SLIDE EN CONCRETO (las imágenes adjuntas, EN ESTE ORDEN):');
  selected.forEach((image, idx) => {
    const cap = (image.caption || '').trim() || 'imagen sin descripción';
    const roleRaw = image.reference_role && image.reference_role !== 'pending' ? image.reference_role : null;
    const role = roleRaw
      ? effectiveReferenceRoleForPipeline(roleRaw, sellsPhysicalProduct)
      : null;
    const view = image.reference_view ? `, vista ${image.reference_view}` : '';
    if (role === 'product') {
      const identity = (image.product_identity || '').trim();
      lines.push(`${idx + 1}. [PRODUCTO${view}] ${identity ? `${identity}. ` : ''}${cap}`);
    } else if (role) {
      const roleLabel = role === 'style' ? 'ESTILO/INSPIRACIÓN' : role === 'place' ? 'LUGAR/CONTEXTO' : role.toUpperCase();
      lines.push(`${idx + 1}. [${roleLabel}] ${cap}`);
    } else {
      lines.push(`${idx + 1}. ${cap}`);
    }
  });
  lines.push('');
  lines.push('Cómo usar cada referencia según su etiqueta:');
  if (productFidelityMode) {
    lines.push('- [PRODUCTO]: es EL producto real del cliente. Reproduce con total fidelidad su forma, proporciones, materiales, colores estructurales y rasgos distintivos (y, en interiores, la distribución espacial exacta). Es inviolable: nunca lo sustituyas por un producto genérico de otra tipología.');
    lines.push('- [ESTILO/INSPIRACIÓN] y [LUGAR/CONTEXTO]: úsalas solo para el ambiente, la paleta o el entorno. NO copies de ellas la forma del producto.');
    lines.push('Decides libremente ángulo, plano, luz y encuadre según ESTE prompt; lo único que no cambia es la identidad del producto.');
  } else {
    lines.push('- Todas las referencias son INSPIRACIÓN DE ESTILO: extrae mood, paleta y actitud; NO clones el mismo objeto concreto en cada pieza.');
    lines.push('- Varía metáforas y sujetos según ESTE prompt. Si una referencia muestra una máquina u objeto surreal, NO lo repitas salvo que el prompt lo exija explícitamente.');
    lines.push('Decides libremente escena, encuadre y luz según ESTE prompt.');
  }
  if (selectorReasoning) {
    lines.push(`(Selector: ${selectorReasoning})`);
  }
  return `${prompt}\n\n${lines.join('\n')}`;
}

function applyUserFeedbackToPrompt(
  prompt: string,
  userFeedback: string | null | undefined,
  productFidelityMode = true
): string {
  const feedback = (userFeedback || '').trim();
  if (!feedback) return prompt;
  const productGuard = productFidelityMode
    ? '\n\nLas correcciones del usuario NO pueden contradecir las REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES DEL PRODUCTO ni sustituir el producto real por uno genérico de otra tipología.'
    : '\n\nLas correcciones del usuario no deben forzar la repetición literal del mismo objeto de las referencias de estilo en todas las piezas.';
  return `${prompt}

CORRECCIONES OBLIGATORIAS DEL USUARIO SOBRE LA VERSIÓN ANTERIOR DE ESTA MISMA IMAGEN (prioridad absoluta; si la nueva imagen repite cualquiera de estos errores se considerará fallida):
${feedback}

Aplica esas correcciones SIN cambiar la escena, los sujetos, la acción ni el encuadre principal descritos en el prompt: solo arréglalas de forma natural.${productGuard}`;
}

/**
 * Inyecta al final del prompt las REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES
 * del proyecto (planta de un espacio, identidad de marca, sujetos prohibidos…).
 * Es el último seguro: aunque el visual_prompt se haya escrito ignorando estas
 * reglas, el modelo de imagen las recibe en el último kilómetro como verdad
 * ineludible y las prioriza sobre cualquier descripción genérica.
 */
/** Sufijo fijo de reglas físicas (no truncar a la hora de recortar el cuerpo del prompt). */
function physicalConstraintsSuffix(physicalConstraints: string | null | undefined): string {
  const text = (physicalConstraints || '').trim();
  if (!text) return '';
  return `

REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES DEL PRODUCTO (prioridad máxima — si la imagen las contradice, se considerará fallida):
${text}

PROHIBIDO contradecir lo anterior: la geometría espacial, las adyacencias entre zonas, la identidad de marca y los sujetos/objetos prohibidos son fijos. Acabados, luz, hora, color y ángulo siguen siendo libres.

Las «Reglas IA» del cliente (piscina, personas extra, estilo viral, etc.) son secundarias: solo pueden enriquecer la escena si no rompen la identidad del producto anterior.`;
}

const MAX_PHYSICAL_IN_IMAGE_PROMPT = 1800;

function shrinkPhysicalSuffixForApi(suffix: string): string {
  if (suffix.length <= MAX_PHYSICAL_IN_IMAGE_PROMPT) return suffix;
  return `${suffix.slice(0, MAX_PHYSICAL_IN_IMAGE_PROMPT - 40)}… [reglas recortadas; se regeneran desde fotos de producto]`;
}

async function buildFinalPrompt(
  openai: OpenAI,
  rawPrompt: string,
  referenceCount = 0,
  userFeedback: string | null = null,
  physicalConstraints: string | null = null,
  productFidelityMode = true,
): Promise<string> {
  const cleaned = cleanPrompt(rawPrompt);

  let prompt: string;
  try {
    const response = await openai.chat.completions.create({
      model: REFINER_MODEL,
      messages: [
        { role: 'system', content: REALISM_REFINER_SYSTEM },
        {
          role: 'user',
          content: appendReferenceHandlingInstructions(cleaned, referenceCount, productFidelityMode),
        },
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

  prompt = appendReferenceHandlingInstructions(prompt, referenceCount, productFidelityMode);
  prompt = applyUserFeedbackToPrompt(prompt, userFeedback, productFidelityMode);

  const physSource = productFidelityMode ? physicalConstraints : null;
  let phys = shrinkPhysicalSuffixForApi(physicalConstraintsSuffix(physSource));
  const tail = `\n\n${IMAGE_REALISM_TAIL}`;
  let roomForCore = MAX_PROMPT_LENGTH - phys.length - tail.length;
  if (roomForCore < MIN_PROMPT_LENGTH) {
    const need = MIN_PROMPT_LENGTH - roomForCore + 80;
    phys = phys.length > need ? `${phys.slice(0, phys.length - need)}…` : '';
    roomForCore = MAX_PROMPT_LENGTH - phys.length - tail.length;
  }
  if (prompt.length > roomForCore) {
    prompt = prompt.slice(0, Math.max(MIN_PROMPT_LENGTH, roomForCore));
  }

  prompt = `${prompt}${phys}${tail}`;

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

  const { sellsPhysicalProduct, physicalConstraints: projectPhysicalConstraintsFromDb } =
    await fetchProjectImageGenerationMeta(service, project.id);

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
    // Traemos TODAS las referencias (no solo las 4 principales): así las fotos
    // de producto nunca quedan fuera del catálogo del selector ni del anclaje.
    const allReferenceImages = await listProjectReferenceImages(service, project.id);
    const projectForFidelity: Pick<Project, 'sells_physical_product'> = {
      sells_physical_product: sellsPhysicalProduct,
    };
    const useProductFidelity = projectUsesProductImageFidelity(projectForFidelity, allReferenceImages);
    const productReferenceImages = useProductFidelity
      ? allReferenceImages.filter(image => image.reference_role === 'product')
      : [];
    const userFeedback: string | null =
      typeof (visual as any).user_feedback === 'string' && (visual as any).user_feedback.trim()
        ? (visual as any).user_feedback.trim()
        : null;

    const refsWithCaption = allReferenceImages.filter(
      image => image.caption && image.caption_status === 'ready'
    );
    let selectedReferenceImages = allReferenceImages.slice(0, DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI);
    let selectorReasoning = '';
    if (refsWithCaption.length > 0) {
      const selection = await selectRelevantReferenceImages({
        apiKey,
        visualPrompt: visual.visual_prompt,
        catalog: refsWithCaption.map(image => ({
          id: image.id,
          caption: image.caption || '',
          role: effectiveReferenceRoleForPipeline(image.reference_role, sellsPhysicalProduct),
          view: image.reference_view ?? null,
        })),
        maxResults: DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI,
        sellsPhysicalProduct,
      });
      if (selection) {
        selectorReasoning = selection.reasoning;
        if (selection.selectedIds.length > 0) {
          const order = new Map(selection.selectedIds.map((id, idx) => [id, idx]));
          selectedReferenceImages = allReferenceImages
            .filter(image => order.has(image.id))
            .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        } else {
          // El selector no ve referencias útiles (p. ej. una cita sobre color).
          selectedReferenceImages = [];
        }
      }
    }

    if (useProductFidelity && productReferenceImages.length > 0) {
      const alreadyHasProduct = selectedReferenceImages.some(
        image => image.reference_role === 'product'
      );
      if (!alreadyHasProduct) {
        const anchor =
          productReferenceImages.find(image => image.is_primary) || productReferenceImages[0];
        selectedReferenceImages = [anchor, ...selectedReferenceImages];
        selectorReasoning = selectorReasoning
          ? `${selectorReasoning} (+ancla de producto)`
          : 'ancla de producto garantizada';
      }
    }

    // Nunca pasamos más referencias de las que admite la edición.
    selectedReferenceImages = selectedReferenceImages.slice(0, DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI);

    const projectPhysicalConstraints = useProductFidelity ? projectPhysicalConstraintsFromDb : null;

    let prompt = await buildFinalPrompt(
      openai,
      visual.visual_prompt,
      selectedReferenceImages.length,
      userFeedback,
      projectPhysicalConstraints,
      useProductFidelity
    );
    if (selectedReferenceImages.length > 0) {
      prompt = applyReferenceCaptionsToPrompt(
        prompt,
        selectedReferenceImages,
        selectorReasoning,
        useProductFidelity,
        sellsPhysicalProduct
      );
    }

    const productAnchor = useProductFidelity
      ? selectedReferenceImages.find(image => image.reference_role === 'product')
      : undefined;

    console.log(
      `[generate-image] visual ${visual_id}, prompt: ${prompt.length} chars, refs ` +
      `seleccionadas/totales: ${selectedReferenceImages.length}/${allReferenceImages.length}, ` +
      `fidelidad_producto: ${useProductFidelity}, refs_producto: ${productReferenceImages.length}, ` +
      `orientation: ${projectOrientation} (${imageSize})` +
      (selectorReasoning ? `, selector: "${selectorReasoning}"` : '') +
      (userFeedback ? `, user_feedback: ${userFeedback.length} chars` : '') +
      (projectPhysicalConstraints ? `, physical_constraints: ${projectPhysicalConstraints.length} chars` : '')
    );

    // Genera una imagen con (o sin) referencias. Si OpenAI rechaza las
    // referencias, reintenta sin ellas para no bloquear la pieza.
    async function generateImageB64(
      genPrompt: string,
      refs: ProjectReferenceImage[]
    ): Promise<string> {
      let resp: Awaited<ReturnType<typeof openai.images.generate>>;
      if (refs.length > 0) {
        try {
          const referenceFiles = await downloadReferenceImagesAsFiles(refs);
          resp = await openai.images.edit({
            model: IMAGE_GENERATION_MODEL,
            image: referenceFiles,
            prompt: genPrompt,
            size: imageSize,
            quality: IMAGE_GENERATION_QUALITY,
          });
        } catch (editErr) {
          if (!isOpenAIReferenceImageRejection(editErr)) throw editErr;
          console.warn(
            `[generate-image] ${visual_id}: OpenAI rechazó las referencias (${(editErr as any)?.message}). ` +
            `Generando sin referencias para no bloquear la pieza.`
          );
          resp = await openai.images.generate({
            model: IMAGE_GENERATION_MODEL,
            prompt: genPrompt,
            n: 1,
            size: imageSize,
            quality: IMAGE_GENERATION_QUALITY,
          });
        }
      } else {
        resp = await openai.images.generate({
          model: IMAGE_GENERATION_MODEL,
          prompt: genPrompt,
          n: 1,
          size: imageSize,
          quality: IMAGE_GENERATION_QUALITY,
        });
      }
      const out = resp.data?.[0]?.b64_json;
      if (!out) throw new Error('La API de OpenAI no devolvió imagen (b64_json vacío)');
      return out;
    }

    let b64 = await generateImageB64(prompt, selectedReferenceImages);

    // === QA visual de fidelidad ===
    // Solo cuando hay un producto anclado. Comparamos la imagen generada con la
    // foto real del producto (solo identidad, no escena). Es informativo: la
    // puntuación se devuelve al cliente pero NO regeneramos por defecto.
    //
    // El reintento automático (otra generación HIGH completa, ~2 min) duplicaba
    // la latencia y empujaba la petición cerca del límite de 300 s de Vercel,
    // provocando timeouts. Queda detrás de IMAGE_FIDELITY_AUTO_RETRY=true para
    // quien priorice fidelidad sobre velocidad.
    const AUTO_RETRY_FIDELITY = process.env.IMAGE_FIDELITY_AUTO_RETRY === 'true';
    let fidelity: ProductFidelityResult | null = null;
    if (productAnchor) {
      fidelity = await assessProductFidelity({
        apiKey,
        generatedImageUrl: `data:image/png;base64,${b64}`,
        product: {
          identity: productAnchor.product_identity ?? null,
          traits: productAnchor.product_traits ?? null,
          imageUrl: productAnchor.image_url,
        },
      });
      console.log(
        `[generate-image] ${visual_id}: fidelidad inicial = ${fidelity ? `${fidelity.score} (${fidelity.verdict})` : 'n/d'}` +
        (AUTO_RETRY_FIDELITY ? '' : ' (auto-retry desactivado)')
      );

      if (AUTO_RETRY_FIDELITY && fidelity && fidelity.verdict === 'fail') {
        const violationsText = fidelity.violations.length
          ? fidelity.violations.map(v => `- ${v}`).join('\n')
          : '- El producto generado no coincide con el producto real de las referencias.';
        const retryPrompt = applyUserFeedbackToPrompt(prompt, violationsText, true);
        const retryRefs = productReferenceImages.slice(0, DEFAULT_PROJECT_REFERENCE_IMAGES_FOR_AI);
        try {
          const b64Retry = await generateImageB64(
            retryPrompt,
            retryRefs.length > 0 ? retryRefs : selectedReferenceImages
          );
          const fidelityRetry = await assessProductFidelity({
            apiKey,
            generatedImageUrl: `data:image/png;base64,${b64Retry}`,
            product: {
              identity: productAnchor.product_identity ?? null,
              traits: productAnchor.product_traits ?? null,
              imageUrl: productAnchor.image_url,
            },
          });
          console.log(
            `[generate-image] ${visual_id}: fidelidad reintento = ${fidelityRetry ? `${fidelityRetry.score} (${fidelityRetry.verdict})` : 'n/d'}`
          );
          // Nos quedamos con la mejor de las dos versiones.
          if (!fidelityRetry || fidelityRetry.score >= fidelity.score) {
            b64 = b64Retry;
            fidelity = fidelityRetry ?? fidelity;
          }
        } catch (retryErr) {
          console.warn(
            `[generate-image] ${visual_id}: reintento de fidelidad falló, conservamos la primera versión: ${(retryErr as Error)?.message}`
          );
        }
      }
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
    //    Si había feedback del usuario, lo limpiamos ahora: la regeneración ya lo
    //    aplicó y no debe arrastrarse a próximas regeneraciones.
    const { data: savedRow, error: saveErr } = await service
      .from('content_item_visuals')
      .update({
        image_url: imageUrl,
        image_status: 'ready',
        image_error: null,
        user_feedback: null,
        user_feedback_at: null,
        edited_image_url: null,
        image_edit_json: null,
        image_edited_at: null,
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

    console.log(
      `[generate-image] ✓ Visual ${visual_id} → ${imageUrl} (${(buffer.length / 1024).toFixed(0)} KB)` +
      (fidelity ? `, fidelidad ${fidelity.score} (${fidelity.verdict})` : '')
    );

    return NextResponse.json({
      image_url: imageUrl,
      status: 'ready',
      ...(fidelity
        ? {
            fidelity: {
              score: fidelity.score,
              verdict: fidelity.verdict,
              violations: fidelity.violations,
            },
          }
        : {}),
    });
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
