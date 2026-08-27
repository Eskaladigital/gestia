/**
 * Auxiliar de depuración: sugiere texto para "REGLAS FÍSICAS E IDENTITARIAS
 * INVIOLABLES" a partir del dossier y fotos de referencia (gpt-4o + visión).
 *
 * NO escribe en BD. El flujo de producción usa syncProjectPhysicalConstraintsFromReferences
 * (automático al subir/reclasificar referencias con rol product). Ver README § Fidelidad de producto.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { fetchAccessibleProject } from '@/lib/auth/roles';
import {
  listProjectReferenceImages,
  resolveOpenAIKeyForUser,
} from '@/lib/projects/reference-images';
import type { Project } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 90;

const SUGGEST_MODEL = 'gpt-5.6-terra';

const SUGGEST_SYSTEM = `Eres un director de arte y consultor de identidad de marca. Tu tarea es leer la información disponible de un proyecto (descripción del negocio, identidad de marca, reglas IA y descripciones de las imágenes de referencia que el usuario ha subido) y, si es posible, también las propias imágenes, y redactar un bloque corto en español llamado "REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES DEL PRODUCTO".

Este bloque debe recoger SOLO hechos sobre la realidad del producto que un modelo de imagen NUNCA debe contradecir al generar contenido para este cliente. NO es un manual de estilo de comunicación (eso son las reglas blandas). Son reglas DURAS sobre qué existe físicamente.

INCLUYE, cuando aplique al proyecto:
- Si el producto es un ESPACIO con planta (vehículo, vivienda, restaurante, gym, hotel, tienda…): describe la geometría real (de delante a atrás / de izquierda a derecha), las zonas y sus adyacencias. Indica qué adyacencias están PROHIBIDAS porque no existen físicamente (p. ej. "la cama nunca está pegada a la cabina porque hay baño y armarios en medio").
- Si la marca tiene IDENTIDAD GRÁFICA fija (logo, colores corporativos, packaging, uniforme): descríbela de forma concreta. Indica variantes prohibidas.
- Si hay SUJETOS u OBJETOS permitidos / prohibidos en las imágenes (razas, edades, tipo de ropa, accesorios, comida, plantas, herramientas): enuméralos.
- Si hay LUGARES o ESCENARIOS típicos o prohibidos.

EVITA:
- Adjetivos vacíos ("bonito", "elegante").
- Reglas de tono, copy, voz, hashtags (eso es ai_rules, no esto).
- Inventar datos que no estén en el dossier ni en las imágenes.

FORMATO:
- Texto plano en español, sin markdown ni listas con guiones largos. Pueden usarse guiones simples para enumerar.
- 60–250 palabras.
- Devuelve SOLO el texto del bloque, sin comillas, sin saludo, sin explicación.
- Si la información disponible es claramente insuficiente para escribir reglas físicas/identitarias útiles, devuelve la cadena exacta "INSUFICIENTE" (sin nada más). En ese caso el usuario lo redactará a mano.`;

function buildDossier(project: Project, captions: string[]): string {
  const lines: string[] = [];
  lines.push(`Nombre del proyecto: ${project.name}`);
  if (project.sector) lines.push(`Sector: ${project.sector}`);
  if (project.location) lines.push(`Ubicación: ${project.location}`);
  if (project.description) lines.push(`Descripción del negocio: ${project.description}`);
  if (project.brand_summary) lines.push(`Resumen de marca: ${project.brand_summary}`);
  if (project.ai_rules?.trim()) lines.push(`Reglas IA del proyecto (tono/comunicación, NO físicas): ${project.ai_rules.trim()}`);
  if (captions.length > 0) {
    lines.push('Descripciones de las imágenes de referencia subidas por el usuario:');
    captions.forEach((cap, idx) => lines.push(`  ${idx + 1}. ${cap}`));
  } else {
    lines.push('No hay descripciones de imágenes de referencia disponibles todavía.');
  }
  return lines.join('\n');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { project } = await fetchAccessibleProject(supabase, user.id, id);
    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const service = createServiceSupabase();
    const allReferences = await listProjectReferenceImages(service, id);
    const captions = allReferences
      .map(image => (image.caption || '').trim())
      .filter(cap => cap.length > 0);

    const apiKey = await resolveOpenAIKeyForUser(service, user.id);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No hay API key de OpenAI configurada para sugerir reglas.' },
        { status: 422 }
      );
    }

    const dossier = buildDossier(project, captions);

    // Si hay imágenes de referencia con caption listo, también las pasamos como
    // input visual al modelo (visión) para que pueda inferir geometría real
    // mirando las fotos, no solo leyendo descripciones. Limitamos a 6 para no
    // disparar el coste/timeout.
    const visionRefs = allReferences
      .filter(image => image.caption_status === 'ready')
      .slice(0, 6);

    const userContentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    > = [
      {
        type: 'text',
        text: `## DOSSIER DEL PROYECTO\n${dossier}\n\nRedacta el bloque "REGLAS FÍSICAS E IDENTITARIAS INVIOLABLES DEL PRODUCTO" siguiendo las instrucciones del sistema. Si las imágenes adjuntas muestran un espacio interior, describe su distribución de delante a atrás. Si muestran un logo o un packaging, describe su forma exacta. Si muestran sujetos (personas, animales), comenta qué tipo aparece. Solo hechos verificables.`,
      },
    ];
    for (const ref of visionRefs) {
      userContentParts.push({
        type: 'image_url',
        image_url: { url: ref.image_url, detail: 'high' as const },
      });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SUGGEST_MODEL,
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: SUGGEST_SYSTEM },
        { role: 'user', content: userContentParts },
      ],
    });

    const raw = response.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/^["'`]+|["'`]+$/g, '').trim();

    if (!cleaned || cleaned.toUpperCase() === 'INSUFICIENTE') {
      return NextResponse.json({
        success: true,
        suggestion: '',
        insufficient: true,
        message:
          'No hay suficiente información todavía para sugerir reglas físicas/identitarias. Sube algunas imágenes de referencia con descripción IA, o rellena la descripción del proyecto, y vuelve a intentarlo.',
      });
    }

    return NextResponse.json({
      success: true,
      suggestion: cleaned.slice(0, 20000),
      sources: {
        captions: captions.length,
        vision_images: visionRefs.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error generando la sugerencia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
