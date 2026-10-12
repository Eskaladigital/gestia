'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clipFinal } from '@/lib/video/lab-score';
import { measureClip } from '@/lib/video/lab-metrics';

type SetRow = { id: string; name: string };
type ItemRow = {
  id: string;
  set_id: string;
  image_url: string;
  visual_brief: string | null;
  expectation: string | null;
  label: string | null;
  sort_order: number;
};
type TemplateRow = { id: string; name: string; slug: string; version: number; system_prompt: string; notes: string | null; parent_id: string | null };
type RunRow = {
  id: string;
  set_id: string;
  session_id: string;
  round: number;
  kind: string;
  status: string;
  best_score: number | null;
  stop_reason: string | null;
  budget_credits: number;
  spent_credits: number;
  created_at: string;
};
type ClipRow = {
  id: string;
  run_id: string;
  set_item_id: string;
  model: string;
  duration: number;
  template_id: string | null;
  prompt_final: string | null;
  status: string;
  failure: string | null;
  video_url: string | null;
  cost_credits: number;
  metrics: { movimiento: number; fidelidad: number; estabilidad: number } | null;
  ai_judgment: { fallos?: string[]; sugerencia?: string; movimiento_real?: number; coherencia_fisica?: number; fidelidad_marca?: number; cumple_prompt?: number; calidad_cinematografica?: number } | null;
  human_score: number | null;
  human_tags: string[] | null;
  human_comment: string | null;
  seed_sent: boolean;
};
type SearchHit = { id: string; label: string | null; brief: string | null; image_url: string; date: string | null; idea: string | null; project: string | null };

const btn = 'text-[11px] font-bold uppercase tracking-wider border-2 border-surface-900 px-3 py-2 shadow-brutal-sm hover:shadow-none disabled:opacity-50';
const TAGS = ['deforma caras', 'deforma vehículo', 'cámara loca', 'demasiado quieto', 'perfecto'];

function sessionId() {
  const key = 'gestia-video-lab-session';
  const cur = sessionStorage.getItem(key);
  if (cur) return cur;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export function VideoLab() {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [setId, setSetId] = useState<string>('');
  const [runId, setRunId] = useState<string>('');
  const [error, setError] = useState('');
  const [q, setQ] = useState('Furgocasa');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [models, setModels] = useState<string[]>(['gen4_turbo']);
  const [durations, setDurations] = useState<number[]>([5]);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [seed, setSeed] = useState('');
  const [roundBudget, setRoundBudget] = useState(600);
  const [sessionBudget, setSessionBudget] = useState(600);
  const [maxRounds, setMaxRounds] = useState(3);
  const [confirm, setConfirm] = useState<null | { kind: 'matrix' | 'optimize'; credits: number; n: number }>(null);
  const [ab, setAb] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const sid = sessionId();
    const res = await fetch(`/api/video-lab?session=${sid}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'No se pudo cargar el laboratorio');
      return;
    }
    setError('');
    setSets(json.sets || []);
    setItems(json.items || []);
    setTemplates(json.templates || []);
    setRuns(json.runs || []);
    setClips(json.clips || []);
    setSettings(json.settings || null);
    setBalance(json.balance ?? null);
    setSpent(json.session_spent || 0);
    setSetId(cur => cur || json.sets?.[0]?.id || '');
    setTemplateIds(cur => (cur.length ? cur : (json.templates || []).filter((t: TemplateRow) => t.slug === 'actual' || t.slug === 'fisica').map((t: TemplateRow) => t.id)));
    setRunId(cur => cur || json.runs?.[0]?.id || '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const judgeOne = useCallback(async (clip: ClipRow, imageUrl: string) => {
    if (!clip.video_url || clip.ai_judgment) return;
    setBusy('Midiendo un clip…');
    try {
      const measured = await measureClip(clip.video_url, imageUrl);
      await fetch('/api/video-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'metrics',
          clip_id: clip.id,
          metrics: { movimiento: measured.movimiento, fidelidad: measured.fidelidad, estabilidad: measured.estabilidad },
        }),
      });
      await fetch('/api/video-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'judge', clip_id: clip.id, frames: measured.frames }),
      });
    } catch (err: any) {
      setError(err?.message || 'No se pudo evaluar el clip');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        await fetch('/api/video-lab/tick');
        await load();
      })();
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (busy) return;
    const pending = clips.find(c => c.status === 'ready' && c.video_url && !c.ai_judgment);
    if (!pending) return;
    const item = items.find(i => i.id === pending.set_item_id);
    if (!item) return;
    void judgeOne(pending, item.image_url).then(() => load());
  }, [clips, items, busy, judgeOne, load]);

  const bank = items.filter(i => i.set_id === setId);
  const runClips = clips.filter(c => c.run_id === runId);
  const tplName = (id: string | null) => templates.find(t => t.id === id)?.name || '—';

  const estimate = useMemo(() => {
    const per: Record<string, number> = { 'gen4.5': 12, gen4_turbo: 5 };
    let credits = 0;
    for (const m of models) for (const d of durations) credits += (per[m] || 0) * d * bank.length * templateIds.length;
    return { credits, n: bank.length * models.length * durations.length * templateIds.length };
  }, [models, durations, bank.length, templateIds]);

  async function post(body: Record<string, unknown>) {
    setError('');
    const res = await fetch('/api/video-lab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Error');
      return null;
    }
    await load();
    return json;
  }

  async function search() {
    const res = await fetch(`/api/video-lab?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || 'Búsqueda fallida');
    else setHits(json.visuals || []);
  }

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  }

  const rounds = runs
    .filter(r => r.session_id && runs.find(x => x.id === runId)?.session_id === r.session_id)
    .slice()
    .sort((a, b) => a.round - b.round);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Laboratorio de vídeo</h1>
          <p className="text-sm text-surface-600 mt-1">Prueba prompts de movimiento sobre las mismas imágenes, sin pasar del presupuesto.</p>
        </div>
        <div className="text-right text-xs">
          <p>Sesión: <strong>{spent}</strong> créditos · tope {sessionBudget} (${(sessionBudget * 0.01).toFixed(2)})</p>
          <p>Saldo Runway: {balance == null ? 'no disponible en la API' : `${balance} créditos`}</p>
          {busy && <p className="text-amber-700">{busy}</p>}
        </div>
      </div>
      {error && <p className="text-sm text-red-700 border-2 border-red-600 bg-red-50 px-3 py-2">{error}</p>}

      <section className="border-2 border-surface-900 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest">Banco de pruebas</h2>
        <div className="flex flex-wrap gap-2">
          <select className="border-2 border-surface-900 px-2 py-1 text-sm" value={setId} onChange={e => setSetId(e.target.value)}>
            {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            type="button"
            className={`${btn} bg-white`}
            onClick={async () => {
              const name = window.prompt('Nombre del set', 'Furgocasa prueba');
              if (!name) return;
              const json = await post({ action: 'create_set', name });
              if (json?.set?.id) setSetId(json.set.id);
            }}
          >
            Nuevo set
          </button>
          {setId && (
            <button type="button" className={`${btn} bg-white`} onClick={() => void post({ action: 'delete_set', set_id: setId })}>
              Borrar set
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="border-2 border-surface-900 px-2 py-1 text-sm flex-1 min-w-[12rem]" value={q} onChange={e => setQ(e.target.value)} placeholder="Proyecto, fecha o idea" />
          <button type="button" className={`${btn} bg-amber-200`} onClick={() => void search()}>Buscar imágenes</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {hits.map(h => (
            <button
              key={h.id}
              type="button"
              className="text-left border-2 border-surface-900 disabled:opacity-40"
              disabled={!setId || bank.length >= 6}
              onClick={() =>
                void post({
                  action: 'add_item',
                  set_id: setId,
                  image_url: h.image_url,
                  visual_brief: h.brief || '',
                  label: `${h.project || ''} · ${h.date || ''}`.trim(),
                  source_visual_id: h.id,
                  expectation: '',
                })
              }
            >
              <img src={h.image_url} alt="" className="aspect-[9/16] object-cover w-full" />
              <span className="block text-[10px] p-1">{h.project} · {h.date}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="border-2 border-surface-900 px-2 py-1 text-sm flex-1" value={urlDraft} onChange={e => setUrlDraft(e.target.value)} placeholder="O pega una URL https de imagen" />
          <button
            type="button"
            className={`${btn} bg-white`}
            disabled={!setId || !urlDraft}
            onClick={() => {
              void post({ action: 'add_item', set_id: setId, image_url: urlDraft, label: 'URL pegada', expectation: '' });
              setUrlDraft('');
            }}
          >
            Añadir URL
          </button>
        </div>
        <div className="grid gap-3">
          {bank.map(item => (
            <div key={item.id} className="flex gap-3 border-2 border-surface-200 p-2">
              <img src={item.image_url} alt="" className="w-16 aspect-[9/16] object-cover border border-surface-900" />
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-bold">{item.label || 'Imagen'}</p>
                <textarea
                  className="w-full border-2 border-surface-900 text-xs p-1"
                  rows={2}
                  defaultValue={item.expectation || ''}
                  placeholder="Qué debería pasar (ej. la furgo no se deforma, el logo sigue igual)"
                  onBlur={e => void post({ action: 'update_item', item_id: item.id, expectation: e.target.value })}
                />
              </div>
              <button type="button" className="text-xs underline" onClick={() => void post({ action: 'remove_item', item_id: item.id })}>Quitar</button>
            </div>
          ))}
          {!bank.length && <p className="text-sm text-surface-500">El set está vacío. Máximo 6 imágenes.</p>}
        </div>
      </section>

      <section className="border-2 border-surface-900 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest">Matriz de variantes</h2>
        <p className="text-xs text-surface-600">Gen-4.5 y Gen-4 Turbo, 5 o 10 s, vertical 720:1280. El seed se guarda pero estos modelos no lo aceptan: no se envía.</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {['gen4.5', 'gen4_turbo'].map(m => (
            <label key={m} className="flex items-center gap-1">
              <input type="checkbox" checked={models.includes(m)} onChange={() => toggle(models, m, setModels)} />
              {m === 'gen4.5' ? 'Gen-4.5 (12 cr/s)' : 'Gen-4 Turbo (5 cr/s)'}
            </label>
          ))}
          {[5, 10].map(d => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={durations.includes(d)} onChange={() => setDurations(durations.includes(d) ? durations.filter(x => x !== d) : [...durations, d])} />
              {d} s
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map(t => (
            <label key={t.id} className={`text-[11px] border-2 px-2 py-1 ${templateIds.includes(t.id) ? 'border-surface-900 bg-amber-100' : 'border-surface-200'}`}>
              <input type="checkbox" className="mr-1" checked={templateIds.includes(t.id)} onChange={() => toggle(templateIds, t.id, setTemplateIds)} />
              {t.name} v{t.version}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm items-end">
          <label>Seed <input className="border-2 border-surface-900 w-24 px-1" value={seed} onChange={e => setSeed(e.target.value)} placeholder="opcional" /></label>
          <label>Tope ronda (créditos) <input type="number" className="border-2 border-surface-900 w-24 px-1" value={roundBudget} onChange={e => setRoundBudget(Number(e.target.value))} /></label>
          <label>Tope sesión <input type="number" className="border-2 border-surface-900 w-24 px-1" value={sessionBudget} onChange={e => setSessionBudget(Number(e.target.value))} /></label>
          <label>Rondas a optimizar <input type="number" min={1} max={5} className="border-2 border-surface-900 w-16 px-1" value={maxRounds} onChange={e => setMaxRounds(Number(e.target.value))} /></label>
        </div>
        <p className="text-sm">
          {estimate.n} clips · {estimate.credits} créditos · <strong>${(estimate.credits * 0.01).toFixed(2)}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-brand-600 text-white`} disabled={!setId || !estimate.n} onClick={() => setConfirm({ kind: 'matrix', ...estimate })}>
            Lanzar matriz
          </button>
          <button type="button" className={`${btn} bg-surface-900 text-white`} disabled={!setId || !estimate.n} onClick={() => setConfirm({ kind: 'optimize', ...estimate })}>
            Optimizar {maxRounds} rondas
          </button>
        </div>
      </section>

      <section className="border-2 border-surface-900 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest">Cola</h2>
        <div className="flex flex-wrap gap-2">
          {runs.slice(0, 8).map(r => (
            <button key={r.id} type="button" className={`${btn} ${r.id === runId ? 'bg-amber-200' : 'bg-white'}`} onClick={() => setRunId(r.id)}>
              R{r.round} {r.kind} · {r.status} · {r.spent_credits}/{r.budget_credits} cr
            </button>
          ))}
        </div>
        <ul className="text-sm space-y-1">
          {runClips.map(c => (
            <li key={c.id}>
              {tplName(c.template_id)} · {c.model} · {c.duration}s · {c.status}
              {c.cost_credits ? ` · ${c.cost_credits} cr` : ''}
              {c.failure ? ` · ${c.failure}` : ''}
            </li>
          ))}
        </ul>
        {rounds.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2">Mejor nota por ronda</p>
            <div className="flex items-end gap-2 h-24">
              {rounds.map(r => (
                <div key={r.id} className="flex-1 text-center">
                  <div className="bg-brand-600 mx-auto w-8" style={{ height: `${Math.max(4, (Number(r.best_score) || 0) * 8)}px` }} />
                  <p className="text-[10px] mt-1">R{r.round} {r.best_score != null ? Number(r.best_score).toFixed(1) : '…'}</p>
                </div>
              ))}
            </div>
            {runs.find(r => r.id === runId)?.stop_reason && (
              <p className="text-xs text-surface-600 mt-2">{runs.find(r => r.id === runId)?.stop_reason}</p>
            )}
          </div>
        )}
      </section>

      <section className="border-2 border-surface-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest">Comparador</h2>
          <button type="button" className={`${btn} bg-white`} onClick={() => setAb(true)}>A/B</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {runClips.map(c => {
            const item = items.find(i => i.id === c.set_item_id);
            const score = clipFinal(c);
            return (
              <article key={c.id} className="border-2 border-surface-900">
                {c.video_url ? (
                  <video className="lab-clip w-full aspect-[9/16] object-cover bg-black" src={c.video_url} muted loop playsInline controls />
                ) : (
                  <img src={item?.image_url} alt="" className="w-full aspect-[9/16] object-cover opacity-60" />
                )}
                <div className="p-2 text-[11px] space-y-1">
                  <p className="font-bold">{tplName(c.template_id)} · {c.model} · {c.duration}s · {c.cost_credits || 0} cr</p>
                  <p>Nota {score != null ? score.toFixed(1) : '—'} {c.human_score ? `· tú ${c.human_score}/5` : ''}</p>
                  {c.metrics && <p>Mov {c.metrics.movimiento} · fiel {c.metrics.fidelidad} · estable {c.metrics.estabilidad}</p>}
                  {c.ai_judgment?.fallos?.length ? <p>{c.ai_judgment.fallos.join(' · ')}</p> : null}
                  <p className="text-surface-500 line-clamp-3">{c.prompt_final}</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" className={`border border-surface-900 px-1 ${c.human_score === n ? 'bg-amber-300' : 'bg-white'}`} onClick={() => void post({ action: 'rate', clip_id: c.id, score: n, tags: c.human_tags || [], comment: c.human_comment || '' })}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className={`border px-1 ${(c.human_tags || []).includes(tag) ? 'bg-surface-900 text-white' : ''}`}
                        onClick={() => {
                          const tags = new Set(c.human_tags || []);
                          if (tags.has(tag)) tags.delete(tag);
                          else tags.add(tag);
                          void post({ action: 'rate', clip_id: c.id, score: c.human_score || 3, tags: [...tags], comment: c.human_comment || '' });
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-2 border-surface-900 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest">Plantillas y receta de producción</h2>
        <p className="text-sm">
          Activa: {settings?.video_prompt_templates?.name || settings?.video_prompt_templates?.[0]?.name || 'la de siempre (sin plantilla guardada)'}
          {settings?.model ? ` · modelo ${settings.model}` : ''}
          {settings?.duration ? ` · ${settings.duration} s` : ''}
        </p>
        {settings?.previous && (
          <button type="button" className={`${btn} bg-white`} onClick={() => void post({ action: 'revert' })}>Volver a la anterior</button>
        )}
        <div className="space-y-3">
          {templates.map(t => {
            const parent = templates.find(p => p.id === t.parent_id);
            const scores = clips.filter(c => c.template_id === t.id).map(c => clipFinal(c)).filter((n): n is number => n != null);
            const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            return (
              <div key={t.id} className="border-2 border-surface-200 p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{t.name} · v{t.version} {mean != null ? `· media ${mean.toFixed(1)}` : ''}</p>
                  <button
                    type="button"
                    className={`${btn} bg-brand-600 text-white`}
                    onClick={() => void post({ action: 'apply', template_id: t.id, model: models[0] || 'gen4_turbo', duration: durations[0] || 5 })}
                  >
                    Usar en producción
                  </button>
                </div>
                {parent && (
                  <div className="grid md:grid-cols-2 gap-2 mt-2">
                    <pre className="whitespace-pre-wrap bg-surface-50 p-2">{parent.system_prompt}</pre>
                    <pre className="whitespace-pre-wrap bg-amber-50 p-2">{t.system_prompt}</pre>
                  </div>
                )}
                {!parent && <p className="text-surface-500 mt-1">{t.notes}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {confirm && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white border-2 border-surface-900 shadow-brutal max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold uppercase tracking-wide text-sm">Confirmar gasto</h3>
            <p className="text-sm">
              {confirm.n} clips · {confirm.credits} créditos · ${(confirm.credits * 0.01).toFixed(2)}. Tope de ronda {roundBudget} créditos y de sesión {sessionBudget}. No se lanza nada por encima.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" className={`${btn} bg-white`} onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                type="button"
                className={`${btn} bg-brand-600 text-white`}
                onClick={() => {
                  const kind = confirm.kind;
                  setConfirm(null);
                  void post({
                    action: 'launch',
                    kind,
                    set_id: setId,
                    models,
                    durations,
                    template_ids: templateIds,
                    seed: seed.trim() === '' ? null : Number(seed),
                    ratio: '720:1280',
                    budget_credits: roundBudget,
                    session_budget_credits: sessionBudget,
                    session_id: sessionId(),
                    max_rounds: kind === 'optimize' ? maxRounds : 1,
                  });
                }}
              >
                Lanzar
              </button>
            </div>
          </div>
        </div>
      )}

      {ab && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col" onClick={() => setAb(false)}>
          <div className="flex justify-between text-white p-3 text-sm">
            <span>A/B · muteados</span>
            <button type="button" onClick={() => setAb(false)}>Cerrar</button>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2 p-3" onClick={e => e.stopPropagation()}>
            {runClips.filter(c => c.video_url).slice(0, 2).map(c => (
              <video key={c.id} src={c.video_url!} className="w-full h-full object-contain" muted loop autoPlay playsInline controls />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
