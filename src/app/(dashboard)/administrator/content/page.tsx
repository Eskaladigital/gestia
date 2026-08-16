import { createServiceSupabase } from '@/lib/supabase/server';
import type { ImageGenerationStatus, ImageOrientation } from '@/types';
import { AdminContentClient, type AdminContentVisual } from './AdminContentClient';

type NestedProject = {
  id: string;
  name: string;
  deleted_at: string | null;
  image_orientation: ImageOrientation | null;
};

type NestedContentItem = {
  id: string;
  project_id: string;
  scheduled_date: string;
  format: string | null;
  idea: string;
  projects: NestedProject | NestedProject[] | null;
};

type VisualRow = {
  id: string;
  content_item_id: string;
  visual_index: number;
  label: string | null;
  visual_prompt: string;
  image_url: string | null;
  edited_image_url: string | null;
  image_status: ImageGenerationStatus;
  image_error: string | null;
  image_flip_horizontal: boolean | null;
  video_url: string | null;
  video_status: string | null;
  created_at: string;
  content_items: NestedContentItem | NestedContentItem[] | null;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AdministratorContentPage() {
  const service = createServiceSupabase();

  const [{ data, error }, { count }] = await Promise.all([
    service
      .from('content_item_visuals')
      .select(
        `
        id,
        content_item_id,
        visual_index,
        label,
        visual_prompt,
        image_url,
        edited_image_url,
        image_status,
        image_error,
        image_flip_horizontal,
        video_url,
        video_status,
        created_at,
        content_items!inner (
          id,
          project_id,
          scheduled_date,
          format,
          idea,
          projects!inner (
            id,
            name,
            deleted_at,
            image_orientation
          )
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(400),
    service.from('content_item_visuals').select('id', { count: 'exact', head: true }),
  ]);

  if (error && process.env.NODE_ENV === 'development') {
    console.warn('[administrator/content]', error.message);
  }

  const visuals: AdminContentVisual[] = ((data ?? []) as VisualRow[])
    .map((row) => {
      const item = unwrap(row.content_items);
      const project = unwrap(item?.projects);
      if (!item || !project) return null;
      const displayUrl = row.edited_image_url || row.image_url;
      return {
        id: row.id,
        visualIndex: row.visual_index,
        label: row.label,
        visualPrompt: row.visual_prompt ?? '',
        imageUrl: row.image_url,
        editedImageUrl: row.edited_image_url,
        displayUrl,
        imageStatus: row.image_status,
        imageError: row.image_error,
        flipHorizontal: row.image_flip_horizontal === true && !row.edited_image_url,
        videoUrl: row.video_url,
        videoStatus: row.video_status,
        createdAt: row.created_at,
        contentItemId: row.content_item_id,
        projectId: project.id,
        projectName: project.name,
        projectDeleted: !!project.deleted_at,
        orientation: project.image_orientation,
        scheduledDate: item.scheduled_date,
        format: item.format,
        idea: item.idea ?? '',
      } satisfies AdminContentVisual;
    })
    .filter((row): row is AdminContentVisual => row !== null);

  const readyCount = visuals.filter((v) => v.displayUrl && v.imageStatus === 'ready').length;

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">
          Contenido
        </h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">
          Muro de todas las imágenes IA de la plataforma · {readyCount} listas
          {(count ?? 0) > visuals.length ? ` · mostrando las ${visuals.length} más recientes de ${count}` : ` · ${visuals.length} visuals`}
        </p>
      </div>
      <AdminContentClient visuals={visuals} totalCount={count ?? visuals.length} />
    </div>
  );
}
