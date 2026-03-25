-- ============================================================
-- 017 - Tabla content_item_visuals
-- ============================================================
-- Almacena un prompt de IA generativa individual por cada imagen/slide/escena
-- de una publicación del calendario. Permite generar prompts ultra-detallados
-- ejecutando 1 llamada a la IA por cada visual en vez de todo junto.

CREATE TABLE IF NOT EXISTS content_item_visuals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  visual_index SMALLINT NOT NULL DEFAULT 0,
  label TEXT,
  visual_prompt TEXT NOT NULL,
  visual_brief TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_item_id, visual_index)
);

CREATE INDEX idx_civ_content_item ON content_item_visuals(content_item_id);

ALTER TABLE content_item_visuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visuals_select_own" ON content_item_visuals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = content_item_visuals.content_item_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "visuals_all_service" ON content_item_visuals
  FOR ALL USING (true) WITH CHECK (true);
