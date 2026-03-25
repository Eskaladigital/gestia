-- Reglas IA personalizadas por proyecto.
-- Texto libre que se inyecta en los prompts de estrategia y calendario.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_rules TEXT;
