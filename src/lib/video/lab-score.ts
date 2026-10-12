export type AiJudgment = {
  movimiento_real?: number;
  coherencia_fisica?: number;
  fidelidad_marca?: number;
  cumple_prompt?: number;
  calidad_cinematografica?: number;
  fallos?: string[];
  sugerencia?: string;
};

const AI_KEYS = [
  'movimiento_real',
  'coherencia_fisica',
  'fidelidad_marca',
  'cumple_prompt',
  'calidad_cinematografica',
] as const;

export function aiMean(j: AiJudgment | null | undefined): number | null {
  if (!j) return null;
  const nums = AI_KEYS.map(k => Number(j[k])).filter(n => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** La nota humana (1–5, llevada a 1–10) pesa el doble que la media de la IA. */
export function finalScore(ai: number | null, human: number | null): number | null {
  const h = human != null && human >= 1 && human <= 5 ? human * 2 : null;
  if (ai != null && h != null) return (ai + 2 * h) / 3;
  if (h != null) return h;
  return ai;
}

export function clipFinal(clip: { ai_judgment?: AiJudgment | null; human_score?: number | null }): number | null {
  return finalScore(aiMean(clip.ai_judgment), clip.human_score ?? null);
}
