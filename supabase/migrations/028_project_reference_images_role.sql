-- ============================================================
-- 028 - Rol e identidad de producto en imágenes de referencia
-- ============================================================
-- Hasta ahora todas las referencias se trataban igual: una foto de la sauna,
-- una foto de un bosque "de estilo" y un logo entraban en el mismo saco. Eso
-- hacía que el modelo de imagen replicara cosas que no debía e inventara el
-- producto real (problema típico de Nine Waves frente a Furgocasa).
--
-- A partir de aquí, al subir cada imagen la IA la CLASIFICA por rol:
--   - product : ES el producto (la camper, la sauna). Fidelidad 100%.
--   - style   : inspiración de estética/mood. Copiar ambiente, NO formas.
--   - place   : lugar/entorno. Copiar contexto, NO formas.
--   - logo    : identidad gráfica.
--   - person  : persona/retrato.
--   - scene   : escena de uso genérica.
--   - other   : no encaja en lo anterior.
--
-- Cuando el rol es 'product', además se guarda QUÉ producto es
-- (product_identity), sus rasgos inviolables (product_traits) y la vista
-- (view: exterior / interior / detalle). Eso alimenta automáticamente las
-- reglas físicas del proyecto y el anclaje fiel en /api/generate-image.
--
-- Es genérico y retrocompatible: si la columna está vacía o el análisis falla,
-- la referencia se trata como comodín (comportamiento legacy).

ALTER TABLE public.project_reference_images
  ADD COLUMN IF NOT EXISTS reference_role TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS role_confidence REAL,
  ADD COLUMN IF NOT EXISTS role_is_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_identity TEXT,
  ADD COLUMN IF NOT EXISTS product_traits TEXT,
  ADD COLUMN IF NOT EXISTS reference_view TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_reference_images_reference_role_check'
  ) THEN
    ALTER TABLE public.project_reference_images
      ADD CONSTRAINT project_reference_images_reference_role_check
      CHECK (reference_role IN ('pending', 'product', 'style', 'place', 'logo', 'person', 'scene', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_reference_images_reference_view_check'
  ) THEN
    ALTER TABLE public.project_reference_images
      ADD CONSTRAINT project_reference_images_reference_view_check
      CHECK (reference_view IS NULL OR reference_view IN ('exterior', 'interior', 'detalle'));
  END IF;
END
$$;

COMMENT ON COLUMN public.project_reference_images.reference_role IS
  'Rol de la imagen: product / style / place / logo / person / scene / other (o pending si aún no se analizó). Clasificado por IA al subir, editable por el usuario.';
COMMENT ON COLUMN public.project_reference_images.role_confidence IS
  'Confianza 0..1 de la clasificación de rol hecha por la IA. Si es baja, la UI pide confirmación al usuario.';
COMMENT ON COLUMN public.project_reference_images.role_is_manual IS
  'Si es true, el rol lo fijó el usuario a mano y NO debe sobrescribirse al reanalizar automáticamente.';
COMMENT ON COLUMN public.project_reference_images.product_identity IS
  'Cuando reference_role = product: qué producto es (p. ej. "sauna de barril de madera exterior"). Se usa para agrupar fotos del mismo producto y construir las reglas físicas.';
COMMENT ON COLUMN public.project_reference_images.product_traits IS
  'Cuando reference_role = product: rasgos inviolables del producto separados por " · " (forma, proporciones, materiales, detalles distintivos).';
COMMENT ON COLUMN public.project_reference_images.reference_view IS
  'Punto de vista de la foto de producto: exterior / interior / detalle. Permite enviar la vista que mejor casa con cada slide.';
