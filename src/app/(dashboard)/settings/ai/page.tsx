'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AVAILABLE_MODELS, getModelsForProvider } from '@/lib/ai/constants';
import type { AIProvider, AgentKey } from '@/types';

interface AgentConfigUI {
  agent_key: AgentKey;
  label: string;
  description: string;
  icon: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt_override: string | null;
  default_system_prompt: string;
  is_active: boolean;
  is_custom: boolean;
  id: string | null;
}

interface ProviderStatus {
  provider: AIProvider;
  has_key: boolean;
  is_valid: boolean;
  last_verified_at: string | null;
}

const PROVIDER_META: Record<AIProvider, { label: string; color: string; bgActive: string; borderActive: string; dotColor: string; placeholder: string; prefix: string }> = {
  openai: {
    label: 'OpenAI',
    color: 'text-emerald-700',
    bgActive: 'bg-emerald-50',
    borderActive: 'border-emerald-300',
    dotColor: 'bg-emerald-500',
    placeholder: 'sk-proj-...',
    prefix: 'sk-',
  },
  anthropic: {
    label: 'Anthropic',
    color: 'text-orange-700',
    bgActive: 'bg-orange-50',
    borderActive: 'border-orange-300',
    dotColor: 'bg-orange-500',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
  },
  google: {
    label: 'Google AI',
    color: 'text-blue-700',
    bgActive: 'bg-blue-50',
    borderActive: 'border-blue-300',
    dotColor: 'bg-blue-500',
    placeholder: 'AIza...',
    prefix: 'AIza',
  },
};

const PROVIDER_ORDER: AIProvider[] = ['openai', 'anthropic', 'google'];

export default function AISettingsPage() {
  const [configs, setConfigs] = useState<AgentConfigUI[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<AIProvider, string>>({ openai: '', anthropic: '', google: '' });
  const [keyEditing, setKeyEditing] = useState<AIProvider | null>(null);
  const [keySaving, setKeySaving] = useState<AIProvider | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/settings/ai');
    const data = await res.json();
    if (data.configs) setConfigs(data.configs);
    if (data.providers) setProviders(data.providers);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeProviders = providers.filter(p => p.has_key).map(p => p.provider);

  async function saveApiKey(provider: AIProvider) {
    const key = keyInputs[provider]?.trim();
    if (!key || key.length < 10) return;

    setKeySaving(provider);
    await fetch('/api/settings/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_provider_key', provider, api_key: key }),
    });
    setKeyInputs(prev => ({ ...prev, [provider]: '' }));
    setKeyEditing(null);
    setKeySaving(null);
    await fetchData();
  }

  async function deleteApiKey(provider: AIProvider) {
    if (!confirm(`¿Eliminar la API key de ${PROVIDER_META[provider].label}? Los agentes que la usen dejarán de funcionar.`)) return;
    await fetch('/api/settings/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_provider_key', provider }),
    });
    await fetchData();
  }

  async function saveAgent(agentKey: string) {
    const config = configs.find(c => c.agent_key === agentKey);
    if (!config) return;
    setSaving(agentKey);
    await fetch('/api/settings/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_key: config.agent_key,
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        system_prompt_override: config.system_prompt_override,
        is_active: config.is_active,
      }),
    });
    setSaving(null);
    await fetchData();
  }

  async function resetAgent(agentKey: string) {
    await fetch('/api/settings/ai', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_key: agentKey }),
    });
    await fetchData();
  }

  function updateAgent(agentKey: string, updates: Partial<AgentConfigUI>) {
    setConfigs(prev => prev.map(c =>
      c.agent_key === agentKey ? { ...c, ...updates } : c
    ));
  }

  function handleProviderChange(agentKey: string, provider: AIProvider) {
    const models = getModelsForProvider(provider);
    updateAgent(agentKey, { provider, model: models[0]?.id || '' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-surface-900 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-[10px] font-bold text-surface-900 uppercase tracking-[0.2em] mb-2">
          <Link href="/administrator/dashboard" className="hover:text-brand-600 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-surface-400">Configurar IA</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight leading-none">Configuración de IA</h1>
        <p className="text-surface-500 mt-2 text-sm font-medium">Conecta tus proveedores y configura cada agente del pipeline</p>
      </div>

      {/* SECCIÓN 1: PROVEEDORES */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xl">🔌</span>
          <h2 className="font-display text-lg font-bold text-surface-900">Proveedores conectados</h2>
          <span className="text-[10px] font-mono font-bold bg-surface-900 text-white px-2 py-0.5 uppercase tracking-widest">
            {activeProviders.length}/{PROVIDER_ORDER.length}
          </span>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {PROVIDER_ORDER.map(providerId => {
            const meta = PROVIDER_META[providerId];
            const status = providers.find(p => p.provider === providerId);
            const hasKey = status?.has_key ?? false;
            const isEditing = keyEditing === providerId;
            const isSaving = keySaving === providerId;

            return (
              <div
                key={providerId}
                className={`border-2 border-surface-900 transition-all overflow-hidden ${
                  hasKey
                    ? 'bg-white shadow-brutal'
                    : 'bg-surface-50 border-dashed'
                }`}
              >
                {/* Color strip */}
                <div className={`h-2 w-full ${hasKey ? meta.dotColor : 'bg-surface-300'}`} />

                <div className="p-5">
                  {/* Provider header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3 h-3 ${hasKey ? meta.dotColor : 'bg-surface-300'}`} />
                      <span className={`font-display font-bold text-base ${hasKey ? 'text-surface-900' : 'text-surface-500'}`}>
                        {meta.label}
                      </span>
                    </div>
                    {hasKey && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 border-2 border-emerald-300 px-2 py-0.5">
                        Conectado
                      </span>
                    )}
                  </div>

                  {/* Models preview */}
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Modelos</p>
                    <div className="flex flex-wrap gap-1">
                      {getModelsForProvider(providerId).map(m => (
                        <span key={m.id} className={`text-[10px] px-1.5 py-0.5 border font-mono ${hasKey ? 'border-surface-300 bg-white text-surface-700' : 'border-surface-200 bg-surface-100 text-surface-400'}`}>
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Key management — same layout for all states */}
                  <div className="space-y-2">
                    {hasKey && !isEditing ? (
                      <>
                        <div className="w-full bg-surface-100 border-2 border-surface-300 px-3 py-2 text-xs text-surface-500 font-mono">
                          •••••••••••••{meta.prefix.slice(-3)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setKeyEditing(providerId)}
                            className="flex-1 px-3 py-2 bg-surface-100 text-surface-900 border-2 border-surface-900 text-xs font-bold uppercase tracking-wider hover:bg-surface-200 transition-colors"
                          >
                            Cambiar
                          </button>
                          <button
                            onClick={() => deleteApiKey(providerId)}
                            className="flex-1 px-3 py-2 bg-red-50 text-red-600 border-2 border-surface-900 text-xs font-bold uppercase tracking-wider hover:bg-red-100 transition-colors"
                          >
                            Quitar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="password"
                          value={keyInputs[providerId]}
                          onChange={(e) => setKeyInputs(prev => ({ ...prev, [providerId]: e.target.value }))}
                          placeholder={meta.placeholder}
                          className="w-full px-3 py-2 border-2 border-surface-900 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveApiKey(providerId)}
                            disabled={isSaving || !keyInputs[providerId]?.trim()}
                            className="flex-1 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white border-2 border-surface-900 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                          >
                            {isSaving ? 'Guardando...' : hasKey ? 'Actualizar key' : 'Conectar'}
                          </button>
                          {isEditing && (
                            <button
                              onClick={() => { setKeyEditing(null); setKeyInputs(prev => ({ ...prev, [providerId]: '' })); }}
                              className="px-3 py-2 bg-surface-100 text-surface-900 border-2 border-surface-900 text-xs font-bold uppercase tracking-wider hover:bg-surface-200 transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECCIÓN 2: AGENTES */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xl">🤖</span>
          <h2 className="font-display text-lg font-bold text-surface-900">Agentes del pipeline</h2>
        </div>

        {activeProviders.length === 0 && (
          <div className="bg-amber-50 border-2 border-surface-900 p-6 text-center mb-6">
            <p className="text-amber-900 font-bold">Conecta al menos un proveedor arriba para configurar los agentes</p>
            <p className="text-amber-700 text-sm mt-1 font-medium">Necesitas una API key válida para que los agentes funcionen</p>
          </div>
        )}

        <div className="space-y-5">
          {configs.map((config, idx) => {
            const providerModels = getModelsForProvider(config.provider);
            const isSaving = saving === config.agent_key;
            const isEditing = editingPrompt === config.agent_key;
            const stepNumber = idx + 1;

            return (
              <div
                key={config.agent_key}
                className={`bg-white border-2 border-surface-900 transition-all overflow-hidden ${
                  config.is_active ? 'shadow-brutal' : 'opacity-50'
                }`}
              >
                {/* Agent header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 bg-surface-50 border-b-2 border-surface-900">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-8 h-8 flex items-center justify-center bg-surface-900 text-white text-sm font-mono font-bold">{stepNumber}</span>
                      <span className="text-2xl">{config.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-surface-900 truncate">{config.label}</h3>
                        {config.is_custom && (
                          <span className="text-[10px] bg-brand-600 text-white px-2 py-0.5 font-bold uppercase tracking-wider border border-surface-900">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 font-medium">{config.description}</p>
                    </div>
                  </div>
                  {/* Brutalist toggle */}
                  <button
                    type="button"
                    onClick={() => updateAgent(config.agent_key, { is_active: !config.is_active })}
                    className={`shrink-0 w-12 h-7 border-2 border-surface-900 relative transition-colors duration-150 ${
                      config.is_active ? 'bg-brand-600' : 'bg-surface-200'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white border-2 border-surface-900 transition-all duration-150 ${
                      config.is_active ? 'left-[calc(100%-22px)]' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Agent body */}
                <div className="p-5">
                  {/* Row 1: Provider + Model + Temp + Tokens
                      En tablet (sm a lg) los 4 controles se reparten en 2 filas de 2 columnas
                      para evitar que se aprieten o queden ilegibles. En desktop (lg+) van todos en línea. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 mb-5">
                    <div className="lg:col-span-3">
                      <label className="block text-[10px] font-bold text-surface-900 uppercase tracking-wider mb-1.5">Proveedor</label>
                      <select
                        value={config.provider}
                        onChange={(e) => handleProviderChange(config.agent_key, e.target.value as AIProvider)}
                        className="w-full px-3 py-2 border-2 border-surface-900 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 appearance-none cursor-pointer"
                      >
                        {PROVIDER_ORDER.map(pid => {
                          const pmeta = PROVIDER_META[pid];
                          const available = activeProviders.includes(pid) || pid === 'openai';
                          return (
                            <option key={pid} value={pid} disabled={!available}>
                              {pmeta.label}{!available ? ' (sin key)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="lg:col-span-4">
                      <label className="block text-[10px] font-bold text-surface-900 uppercase tracking-wider mb-1.5">Modelo</label>
                      <select
                        value={config.model}
                        onChange={(e) => updateAgent(config.agent_key, { model: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-surface-900 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 appearance-none cursor-pointer"
                      >
                        {providerModels.map(m => (
                          <option key={m.id} value={m.id}>{m.label} ({m.context})</option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-[10px] font-bold text-surface-900 uppercase tracking-wider mb-1.5">
                        Temp: <span className="font-mono">{config.temperature.toFixed(1)}</span>
                      </label>
                      <div className="relative h-8 flex items-center">
                        <div className="absolute inset-x-0 h-3 border-2 border-surface-900 bg-surface-100">
                          <div className="h-full bg-brand-500" style={{ width: `${(config.temperature / 2) * 100}%` }} />
                        </div>
                        <input
                          type="range"
                          min={0} max={2} step={0.1}
                          value={config.temperature}
                          onChange={(e) => updateAgent(config.agent_key, { temperature: parseFloat(e.target.value) })}
                          className="relative z-10 w-full h-3 appearance-none cursor-pointer bg-transparent
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                            [&::-webkit-slider-thumb]:bg-surface-900 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-900
                            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
                            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-surface-900
                            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-900 [&::-moz-range-thumb]:rounded-none
                            [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-0"
                        />
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-surface-400 uppercase tracking-wider mt-0.5">
                        <span>Preciso</span>
                        <span>Creativo</span>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-bold text-surface-900 uppercase tracking-wider mb-1.5">Tokens</label>
                      <input
                        type="number"
                        min={256} max={32768} step={256}
                        value={config.max_tokens}
                        onChange={(e) => updateAgent(config.agent_key, { max_tokens: parseInt(e.target.value) || 4096 })}
                        className="w-full px-3 py-2 border-2 border-surface-900 bg-white text-sm font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Prompts */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-surface-900 uppercase tracking-wider">Instrucciones adicionales</label>
                        {config.system_prompt_override ? (
                          <span className="text-[10px] bg-amber-400 text-surface-900 px-2 py-0.5 font-bold uppercase border border-surface-900">Activas</span>
                        ) : (
                          <span className="text-[10px] bg-surface-200 text-surface-500 px-2 py-0.5 font-bold uppercase border border-surface-300">Vacías</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {!isEditing && (
                          <button
                            onClick={() => setEditingPrompt(config.agent_key)}
                            className="text-xs text-brand-600 hover:text-brand-700 font-bold uppercase tracking-wider"
                          >
                            Editar
                          </button>
                        )}
                        {isEditing && (
                          <>
                            {config.system_prompt_override && (
                              <button
                                onClick={() => {
                                  updateAgent(config.agent_key, { system_prompt_override: null });
                                  setEditingPrompt(null);
                                }}
                                className="text-xs text-red-600 hover:text-red-700 font-bold uppercase tracking-wider"
                              >
                                Reset
                              </button>
                            )}
                            <button
                              onClick={() => setEditingPrompt(null)}
                              className="text-xs text-surface-500 hover:text-surface-900 font-bold uppercase tracking-wider"
                            >
                              Cerrar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Prompt base del sistema</p>
                      <div className="bg-surface-50 border-2 border-surface-300 px-4 py-3 text-[11px] text-surface-600 font-mono leading-relaxed whitespace-pre-wrap max-h-[180px] overflow-y-auto">
                        {config.default_system_prompt}
                      </div>
                    </div>

                    {isEditing ? (
                      <>
                        <p className="text-xs text-surface-500 mb-2 font-medium">
                          Estas instrucciones se <strong>añaden</strong> al prompt base. No sustituyen fechas, cupos, JSON ni reglas técnicas.
                        </p>
                        <textarea
                          value={config.system_prompt_override || ''}
                          onChange={(e) => updateAgent(config.agent_key, { system_prompt_override: e.target.value.trim() ? e.target.value : null })}
                          rows={8}
                          placeholder="Ej. Prioriza claridad sobre creatividad. Evita tecnicismos innecesarios."
                          className="w-full px-4 py-3 border-2 border-amber-500 bg-amber-50/30 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y font-mono text-[11px] leading-relaxed"
                        />
                      </>
                    ) : (
                      <div
                        className="bg-amber-50/40 border-2 border-amber-300 px-4 py-3 text-[11px] text-surface-700 font-mono leading-relaxed whitespace-pre-wrap max-h-[160px] overflow-y-auto cursor-pointer hover:bg-amber-50 transition-colors"
                        onClick={() => setEditingPrompt(config.agent_key)}
                      >
                        {config.system_prompt_override || 'Sin instrucciones adicionales. Click para editar.'}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t-2 border-surface-200">
                    <div>
                      {config.is_custom && (
                        <button
                          onClick={() => resetAgent(config.agent_key)}
                          className="text-xs text-red-600 hover:text-red-700 font-bold uppercase tracking-wider transition-colors"
                        >
                          Restaurar por defecto
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => saveAgent(config.agent_key)}
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white border-2 border-surface-900 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
