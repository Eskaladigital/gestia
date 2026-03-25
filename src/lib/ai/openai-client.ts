// ============================================================
// Cliente IA centralizado - Multi-proveedor
// ============================================================

import type { AgentKey, AIProvider } from '@/types';
import { createProviderWithResolvedKey } from './providers';
import { AGENT_DEFAULTS, resolveSupportedModel } from './constants';
import { createServiceSupabase } from '@/lib/supabase/server';

export const AI_MODEL = 'gpt-4o';

export interface AIResponse<T> {
  data: T;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function mapOpenAIError(err: unknown): string {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 429) return 'El servicio de IA está saturado. Espera un minuto e inténtalo de nuevo.';
    if (status === 401) return 'La API de IA rechazó la clave. Revisa las credenciales en el servidor.';
    if (status === 503) return 'El servicio de IA no está disponible temporalmente. Inténtalo más tarde.';
  }
  if (err instanceof Error) return err.message;
  return 'Error desconocido al contactar la IA';
}

interface AgentConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string | null;
}

function composeSystemPrompt(baseSystemPrompt: string, customInstructions: string | null): string {
  const extra = customInstructions?.trim();
  if (!extra) return baseSystemPrompt;

  return `${baseSystemPrompt}

---

INSTRUCCIONES ADICIONALES DEL USUARIO PARA ESTE AGENTE:
- Estas instrucciones complementan el prompt base; NO sustituyen las restricciones dinámicas ni el formato de salida requerido.
- Si alguna instrucción adicional entra en conflicto con el formato JSON, las fechas, los cupos, las reglas de validación o las restricciones técnicas del sistema, prioriza siempre las restricciones del sistema.

${extra}`;
}

async function getAgentConfig(agentKey: AgentKey, userId?: string): Promise<AgentConfig> {
  const defaults = AGENT_DEFAULTS[agentKey];

  if (userId) {
    try {
      const supabase = createServiceSupabase();
      const { data } = await supabase
        .from('ai_agent_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_key', agentKey)
        .maybeSingle();

      if (data) {
        const provider = data.provider as AIProvider;
        return {
          provider,
          model: resolveSupportedModel(provider, data.model),
          temperature: data.temperature,
          maxTokens: data.max_tokens,
          systemPromptOverride: data.system_prompt_override,
        };
      }
    } catch {
      // Si falla la consulta a BD, usamos defaults
    }
  }

  return {
    provider: defaults.provider,
    model: resolveSupportedModel(defaults.provider, defaults.model),
    temperature: defaults.temperature,
    maxTokens: defaults.maxTokens,
    systemPromptOverride: null,
  };
}

export async function callAI<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    agentKey?: AgentKey;
    userId?: string;
  }
): Promise<AIResponse<T>> {
  const agentKey = options?.agentKey;
  const config = agentKey
    ? await getAgentConfig(agentKey, options?.userId)
    : {
        provider: 'openai' as AIProvider,
        model: resolveSupportedModel('openai', AI_MODEL),
        temperature: 0.7,
        maxTokens: 4096,
        systemPromptOverride: null,
      };

  const provider = await createProviderWithResolvedKey(config.provider, config.model, options?.userId);
  const finalSystem = composeSystemPrompt(systemPrompt, config.systemPromptOverride);
  const temp = options?.temperature ?? config.temperature;
  const maxTok = options?.maxTokens ?? config.maxTokens;

  const result = await provider.chat(finalSystem, userPrompt, {
    temperature: temp,
    maxTokens: maxTok,
    jsonMode: true,
  });

  if (!result.content) {
    throw new Error('La IA devolvió una respuesta vacía');
  }

  let parsed: T;
  try {
    parsed = JSON.parse(result.content) as T;
  } catch {
    throw new Error(`La respuesta de la IA no es JSON válido: ${result.content.substring(0, 200)}`);
  }

  return {
    data: parsed,
    usage: {
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
    },
  };
}
