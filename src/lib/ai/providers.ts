import type { AIProvider } from '@/types';
import OpenAI from 'openai';
import { sleep } from '@/lib/utils';
import { createServiceSupabase } from '@/lib/supabase/server';

export interface LLMResponse {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface LLMProvider {
  chat(
    system: string,
    user: string,
    opts: { temperature: number; maxTokens: number; jsonMode?: boolean; inputImages?: string[] }
  ): Promise<LLMResponse>;
}

function httpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

function isRetriable(err: unknown): boolean {
  const s = httpStatus(err);
  return s === 429 || s === 503;
}

/** Límite por petición al proveedor (calendarios grandes pueden tardar >90s en generar JSON). */
const PER_CALL_TIMEOUT_MS = 240_000;

function withTimeout<T>(promise: Promise<T>, ms = PER_CALL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: la llamada a la IA tardó más de ${ms / 1000}s`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await withTimeout(fn());
    } catch (err) {
      if (isRetriable(err) && attempt < maxAttempts - 1) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error('No se pudo completar la solicitud');
}

const ENV_KEY_MAP: Record<AIProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
};

async function resolveApiKey(provider: AIProvider, userId?: string): Promise<string | undefined> {
  if (userId) {
    try {
      const supabase = createServiceSupabase();
      const { data } = await supabase
        .from('provider_api_keys')
        .select('api_key')
        .eq('user_id', userId)
        .eq('provider', provider)
        .maybeSingle();
      if (data?.api_key) return data.api_key;
    } catch {}
  }
  return process.env[ENV_KEY_MAP[provider]];
}

// ---- OpenAI Provider ----
class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(model: string, apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
    this.model = model;
  }

  async chat(system: string, user: string, opts: { temperature: number; maxTokens: number; jsonMode?: boolean; inputImages?: string[] }): Promise<LLMResponse> {
    return withRetry(async () => {
      const content = opts.inputImages?.length
        ? [
            { type: 'text' as const, text: user },
            ...opts.inputImages.map(url => ({
              type: 'image_url' as const,
              image_url: { url, detail: 'high' as const },
            })),
          ]
        : user;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens,
        ...(opts.jsonMode !== false ? { response_format: { type: 'json_object' as const } } : {}),
      });

      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
        },
      };
    });
  }
}

// ---- Anthropic Provider ----
class AnthropicProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('API key de Anthropic no configurada. Añádela en Configuración IA → Proveedores.');
    this.apiKey = key;
    this.model = model;
  }

  async chat(system: string, user: string, opts: { temperature: number; maxTokens: number; inputImages?: string[] }): Promise<LLMResponse> {
    const apiKey = this.apiKey;

    return withRetry(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`Anthropic ${res.status}: ${body}`) as any;
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      return {
        content: text,
        usage: {
          prompt_tokens: data.usage?.input_tokens ?? 0,
          completion_tokens: data.usage?.output_tokens ?? 0,
        },
      };
    });
  }
}

// ---- Google Gemini Provider ----
class GoogleProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error('API key de Google AI no configurada. Añádela en Configuración IA → Proveedores.');
    this.apiKey = key;
    this.model = model;
  }

  async chat(system: string, user: string, opts: { temperature: number; maxTokens: number; inputImages?: string[] }): Promise<LLMResponse> {
    const apiKey = this.apiKey;

    return withRetry(async () => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: opts.temperature,
            maxOutputTokens: opts.maxTokens,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`Google AI ${res.status}: ${body}`) as any;
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        content: text,
        usage: {
          prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
          completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    });
  }
}

// ---- Factory ----
export function createProvider(provider: AIProvider, model: string, apiKey?: string): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(model, apiKey);
    case 'anthropic':
      return new AnthropicProvider(model, apiKey);
    case 'google':
      return new GoogleProvider(model, apiKey);
    default:
      return new OpenAIProvider(model, apiKey);
  }
}

export async function createProviderWithResolvedKey(
  provider: AIProvider,
  model: string,
  userId?: string
): Promise<LLMProvider> {
  const apiKey = await resolveApiKey(provider, userId);
  return createProvider(provider, model, apiKey);
}
