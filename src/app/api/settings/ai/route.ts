import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { AGENT_DEFAULTS, AGENT_PIPELINE_ORDER, resolveSupportedModel } from '@/lib/ai/constants';
import type { AgentKey, AIProvider } from '@/types';

const VALID_KEYS = AGENT_PIPELINE_ORDER;
const VALID_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'google'];

function resolveTemperature(provider: AIProvider, model: string, temperature: number): number {
  return provider === 'openai' && (model === 'gpt-5.6' || model.startsWith('gpt-5.6-'))
    ? 1
    : temperature;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const [{ data: configs }, { data: providerKeys }] = await Promise.all([
      supabase.from('ai_agent_configs').select('*').eq('user_id', user.id),
      supabase.from('provider_api_keys').select('provider, is_valid, last_verified_at, created_at').eq('user_id', user.id),
    ]);

    const agents = VALID_KEYS.map(key => {
      const saved = configs?.find((c: any) => c.agent_key === key);
      const defaults = AGENT_DEFAULTS[key];
      const provider = (saved?.provider ?? defaults.provider) as AIProvider;
      const model = resolveSupportedModel(provider, saved?.model ?? defaults.model);
      return {
        agent_key: key,
        label: defaults.label,
        description: defaults.description,
        icon: defaults.icon,
        provider,
        model,
        temperature: resolveTemperature(
          provider,
          model,
          saved?.temperature ?? defaults.temperature
        ),
        max_tokens: saved?.max_tokens ?? defaults.maxTokens,
        system_prompt_override: saved?.system_prompt_override ?? null,
        default_system_prompt: defaults.defaultSystemPrompt,
        is_active: saved?.is_active ?? true,
        is_custom: !!saved,
        id: saved?.id ?? null,
      };
    });

    const providers = VALID_PROVIDERS.map(p => {
      const saved = providerKeys?.find((k: any) => k.provider === p);
      return {
        provider: p,
        has_key: !!saved,
        is_valid: saved?.is_valid ?? false,
        last_verified_at: saved?.last_verified_at ?? null,
      };
    });

    return NextResponse.json({ configs: agents, providers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json();

    if (body.action === 'save_provider_key') {
      const { provider, api_key } = body;
      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 });
      }

      if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
        return NextResponse.json({ error: 'API key inválida' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('provider_api_keys')
        .upsert(
          { user_id: user.id, provider, api_key: api_key.trim(), is_valid: true, last_verified_at: new Date().toISOString() },
          { onConflict: 'user_id,provider' }
        )
        .select('provider, is_valid, last_verified_at')
        .single();

      if (error) throw error;
      return NextResponse.json({ provider_key: data });
    }

    if (body.action === 'delete_provider_key') {
      const { provider } = body;
      await supabase
        .from('provider_api_keys')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider);
      return NextResponse.json({ success: true });
    }

    const { agent_key, provider, model, temperature, max_tokens, system_prompt_override, is_active } = body;

    if (typeof agent_key !== 'string' || !VALID_KEYS.includes(agent_key as AgentKey)) {
      return NextResponse.json({ error: 'agent_key inválido' }, { status: 400 });
    }

    const agentKey = agent_key as AgentKey;
    const defaults = AGENT_DEFAULTS[agentKey];
    const resolvedProvider = (provider ?? defaults.provider) as AIProvider;
    const resolvedModel = resolveSupportedModel(resolvedProvider, model ?? defaults.model);
    const resolvedTemperature = resolveTemperature(
      resolvedProvider,
      resolvedModel,
      temperature ?? defaults.temperature
    );

    const upsertData = {
      user_id: user.id,
      agent_key: agentKey,
      provider: resolvedProvider,
      model: resolvedModel,
      temperature: resolvedTemperature,
      ...(max_tokens !== undefined && { max_tokens }),
      ...(system_prompt_override !== undefined && { system_prompt_override }),
      ...(is_active !== undefined && { is_active }),
    };

    const { data, error } = await supabase
      .from('ai_agent_configs')
      .upsert(upsertData, { onConflict: 'user_id,agent_key' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ config: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { agent_key } = await request.json();

    await supabase
      .from('ai_agent_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('agent_key', agent_key);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
