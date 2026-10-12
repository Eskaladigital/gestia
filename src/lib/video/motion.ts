import { callAI } from '@/lib/ai/openai-client';
import { RUNWAY_MAX_PROMPT_LENGTH } from '@/lib/ai/constants';

/** Se añade siempre: Runway deforma la carrocería si el prompt mueve puertas o muebles. */
export const LOCKED_GEOMETRY =
  'The vehicle body, doors, windows, walls, cabinets, seats, tables and the interior layout stay perfectly still and unchanged. Do not open, close, swing or reshape any door. Slow push-in only. Realistic natural motion, no morphing. Keep logos and text unchanged.';

export function lockMotionPrompt(raw: string): string {
  const kept = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => {
      const rigid = /\b(door|tailgate|hatch|window|cabinet|bodywork|body panel|sliding)\b/i.test(s);
      const moves = /\b(sway|swing|close|closes|closing|open|opens|opening|shut|slide|slides|fold|morph|reshape)\b/i.test(s);
      return !(rigid && moves);
    });
  return `${kept.join(' ')} ${LOCKED_GEOMETRY}`.replace(/\s+/g, ' ').trim().slice(0, RUNWAY_MAX_PROMPT_LENGTH);
}

/** Convierte el brief en el prompt exacto que se manda a Runway, según la plantilla. */
export async function renderMotionPrompt(opts: {
  systemPrompt: string;
  brief: string;
  expectation?: string | null;
  userId?: string;
}): Promise<string> {
  const user = [
    `Scene brief:\n${(opts.brief || '').slice(0, 1200)}`,
    opts.expectation ? `What should happen:\n${opts.expectation.slice(0, 400)}` : '',
    'Reply ONLY JSON: {"prompt": string}.',
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    const { data } = await callAI<{ prompt?: string }>(opts.systemPrompt, user, {
      userId: opts.userId,
      temperature: 0.4,
      maxTokens: 400,
    });
    const text = String(data?.prompt || '').trim();
    if (text.length >= 8) return lockMotionPrompt(text);
  } catch (err) {
    console.error('[motion] render:', err);
  }
  return lockMotionPrompt(
    'A hand, a piece of fabric or a few leaves move slightly. People, if present, make a small natural gesture. ' +
      LOCKED_GEOMETRY,
  );
}
