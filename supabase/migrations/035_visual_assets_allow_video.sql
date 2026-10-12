-- 035: el bucket visual-assets acepta el MP4 del reel montado y de Runway/Veo.
-- Antes solo admitía imágenes y un tope de 20 MB; un reel 1080×1920 no cabía.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']
WHERE id = 'visual-assets';
