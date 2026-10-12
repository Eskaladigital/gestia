'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  parent_run_id: string | null;
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

const btn = 'text-[11px] font-bold border border-surface-900 px-2 py-1 disabled:opacity-50';

function clipStatusLabel(status: string) {
  if (status === 'queued') return 'en cola';
  if (status === 'generating') return 'Runway lo está haciendo';
  if (status === 'ready') return 'listo';
  if (status === 'error') return 'falló';
  return status;
}

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
  const [roundBudget, setRoundBudget] = useState(600);
  const [sessionBudget, setSessionBudget] = useState(600);
  const [maxRounds, setMaxRounds] = useState(3);
  const [confirm, setConfirm] = useState<null | { kind: 'matrix' | 'optimize'; credits: number; n: number; auto?: boolean; templateIds?: string[]; setId?: string }>(null);
  const [ab, setAb] = useState(false);
  const [busy, setBusy] = useState('');
  const [step, setStep] = useState<'fotos' | 'probar' | 'ver'>('fotos');
  const [more, setMore] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [notice, setNotice] = useState('');
  const [rootId, setRootId] = useState('');
  const appliedClip = useRef('');

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
    if (sessionStorage.getItem('gestia-video-lab-autopilot') === sessionId()) setAutopilot(true);
    setRootId(sessionStorage.getItem('gestia-video-lab-root') || '');
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

  useEffect(() => {
    if (!autopilot || busy) return;
    const root = sessionStorage.getItem('gestia-video-lab-root');
    if (!root) return;
    const mine: RunRow[] = [];
    const seen = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const run of runs) {
        if (seen.has(run.id)) continue;
        if (run.id === root || (run.parent_run_id && seen.has(run.parent_run_id))) {
          seen.add(run.id);
          mine.push(run);
          grew = true;
        }
      }
    }
    if (!mine.length) return;
    if (mine.some(r => r.status === 'queued' || r.status === 'running')) return;
    const lastRound = Math.max(...mine.map(r => r.round));
    const last = mine.find(r => r.round === lastRound);
    if (last?.stop_reason === 'Pasó a la ronda siguiente') return;
    const ids = new Set(mine.map(r => r.id));
    const mineClips = clips.filter(c => ids.has(c.run_id));
    if (!mineClips.length) return;
    if (mineClips.some(c => c.status === 'queued' || c.status === 'generating')) return;
    if (mineClips.some(c => c.status === 'ready' && !c.ai_judgment && c.human_score == null)) return;
    const best = mineClips
      .filter(c => c.status === 'ready' && c.template_id)
      .map(c => ({ c, score: clipFinal(c) ?? -1 }))
      .sort((a, b) => b.score - a.score)[0];
    const stop = (text: string) => {
      setAutopilot(false);
      sessionStorage.removeItem('gestia-video-lab-autopilot');
      sessionStorage.removeItem('gestia-video-lab-root');
      setNotice(text);
    };
    if (!best || best.score < 6) {
      stop(best ? `La mejor nota es ${best.score.toFixed(1)}. Por debajo de 6 no cambio el calendario.` : 'Terminó sin un vídeo puntuado. El calendario sigue igual.');
      return;
    }
    if (appliedClip.current === best.c.id) return;
    appliedClip.current = best.c.id;
    void post({
      action: 'apply',
      template_id: best.c.template_id,
      model: best.c.model,
      duration: best.c.duration,
    }).then(json => {
      if (!json) {
        stop('No he podido dejar esa animación en el calendario.');
        return;
      }
      stop(`Listo. El calendario usará «${tplName(best.c.template_id)}» (${best.score.toFixed(1)}/10). Si no te convence, Deshacer.`);
    });
  }, [autopilot, runs, clips, busy]);

  const bank = items.filter(i => i.set_id === setId);
  const runClips = clips.filter(c => c.run_id === runId);
  const tplName = (id: string | null) => templates.find(t => t.id === id)?.name || '—';

  const pilot = useMemo(() => {
    const start = rootId || runs.find(r => r.status === 'queued' || r.status === 'running')?.id || '';
    const mine: RunRow[] = [];
    const seen = new Set<string>();
    let grew = true;
    while (start && grew) {
      grew = false;
      for (const run of runs) {
        if (seen.has(run.id)) continue;
        if (run.id === start || (run.parent_run_id && seen.has(run.parent_run_id))) {
          seen.add(run.id);
          mine.push(run);
          grew = true;
        }
      }
    }
    const ids = new Set(mine.map(r => r.id));
    const list = clips.filter(c => ids.has(c.run_id));
    const ready = list.filter(c => c.status === 'ready').length;
    const generating = list.filter(c => c.status === 'generating').length;
    const queued = list.filter(c => c.status === 'queued').length;
    const failed = list.filter(c => c.status === 'error').length;
    const judged = list.filter(c => c.status === 'ready' && (c.ai_judgment || c.human_score != null)).length;
    const round = mine.reduce((m, r) => Math.max(m, r.round), 0);
    return { list, ready, generating, queued, failed, judged, round, total: list.length };
  }, [rootId, runs, clips]);

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

  async function prepararTodo() {
    setError('');
    setNotice('');
    setBusy('Buscando fotos…');
    try {
      let sid = setId;
      if (!sid) {
        const created = await post({ action: 'create_set', name: 'Prueba automática' });
        sid = created?.set?.id || '';
        if (!sid) return;
        setSetId(sid);
      }
      const fresh = await fetch(`/api/video-lab?session=${sessionId()}`).then(r => r.json());
      let count = ((fresh.items || []) as ItemRow[]).filter(i => i.set_id === sid).length;
      if (!count) {
        const found = await fetch(`/api/video-lab?q=${encodeURIComponent(q || 'Furgocasa')}`).then(r => r.json());
        const picks = ((found.visuals || []) as SearchHit[]).filter(h => h.image_url?.startsWith('https://')).slice(0, 5);
        if (!picks.length) {
          setError(`No hay fotos listas de «${q || 'Furgocasa'}». Escribe otro proyecto en el paso 1.`);
          return;
        }
        for (const h of picks) {
          const added = await post({
            action: 'add_item',
            set_id: sid,
            image_url: h.image_url,
            visual_brief: h.brief || '',
            label: `${h.project || ''} · ${h.date || ''}`.trim(),
            source_visual_id: h.id,
            expectation: 'El producto, el logo y las personas no se deforman.',
          });
          if (!added) return;
        }
        count = picks.length;
      }
      const pool = ((fresh.templates || templates) as TemplateRow[]).filter(t => !t.parent_id);
      const chosen = pool.filter(t => t.slug === 'actual' || t.slug === 'fisica');
      const use = (chosen.length ? chosen : pool.slice(0, 2)).map(t => t.id);
      if (!use.length) {
        setError('No hay formas de animar guardadas.');
        return;
      }
      const n = count * use.length;
      const credits = n * 5 * 5;
      setConfirm({ kind: 'optimize', credits, n, auto: true, templateIds: use, setId: sid });
    } finally {
      setBusy('');
    }
  }

  const steps = [
    { id: 'fotos' as const, n: '1', label: 'Elige fotos' },
    { id: 'probar' as const, n: '2', label: 'Prueba cómo se mueven' },
    { id: 'ver' as const, n: '3', label: 'Mira los vídeos' },
  ];

  return (
    <div className="max-w-3xl space-y-4 text-sm">
      <div>
        <h1 className="text-base font-bold">Probar animaciones</h1>
        <p className="text-surface-600 mt-1">
          Prueba cómo se mueven las fotos de un reel. El botón lo hace solo: coge fotos, genera, puntúa y, si una animación saca al menos un 6, la deja en el calendario.
        </p>
        <button
          type="button"
          className="mt-3 bg-brand-600 text-white text-sm font-bold px-4 py-2 border border-surface-900 disabled:opacity-50"
          disabled={!!busy || autopilot}
          onClick={() => void prepararTodo()}
        >
          {autopilot ? 'Arreglando… deja esta página abierta' : 'Hazlo todo y arréglate'}
        </button>
        <p className="text-xs text-surface-500 mt-1">
          Opción barata, 5 segundos. La primera ronda sale sobre 2,50 $. No pasa de 6 $. Hay que dejar la página abierta: el juez mira los vídeos en este navegador.
        </p>
        {notice && <p className="text-sm mt-2 border border-surface-900 bg-amber-50 px-3 py-2">{notice}</p>}
        {(autopilot || busy || pilot.generating > 0 || pilot.queued > 0) && (
          <div className="mt-3 border border-surface-900 p-3 space-y-2" aria-live="polite">
            <p className="font-bold">
              {busy
                ? busy
                : pilot.total === 0
                  ? 'Enviando la prueba a Runway…'
                  : pilot.generating || pilot.queued
                    ? `Runway va por el vídeo ${pilot.ready + pilot.failed + 1} de ${pilot.total}`
                    : pilot.judged < pilot.ready
                      ? `Puntuando los vídeos: ${pilot.judged} de ${pilot.ready}`
                      : 'Cerrando la prueba…'}
            </p>
            <div className="h-2 bg-surface-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pilot.total ? Math.round(((pilot.ready + pilot.failed) / pilot.total) * 100) : 0}>
              <div
                className={`h-2 bg-brand-600 ${pilot.generating || pilot.queued || busy ? 'animate-pulse' : ''}`}
                style={{ width: `${pilot.total ? Math.max(8, Math.round(((pilot.ready + pilot.failed) / pilot.total) * 100)) : 12}%` }}
              />
            </div>
            <p className="text-xs text-surface-600">
              {pilot.total
                ? `${pilot.ready} listos · ${pilot.generating} haciéndose · ${pilot.queued} en cola${pilot.failed ? ` · ${pilot.failed} fallidos` : ''}${pilot.round ? ` · ronda ${pilot.round} de 3` : ''}. Cada vídeo tarda unos minutos. No cierres esta página.`
                : 'En unos segundos aparecen aquí. No cierres esta página.'}
            </p>
            {!!pilot.list.length && (
              <ul className="text-xs space-y-0.5">
                {pilot.list.map(c => (
                  <li key={c.id}>
                    {tplName(c.template_id)} · {clipStatusLabel(c.status)}
                    {c.ai_judgment || c.human_score != null ? ` · nota ${(clipFinal(c) ?? 0).toFixed(1)}` : ''}
                    {c.failure ? ` · ${c.failure}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {steps.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`px-3 py-1.5 text-xs font-bold border-2 border-surface-900 ${step === s.id ? 'bg-surface-900 text-white' : 'bg-white'}`}
          >
            {s.n}. {s.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-surface-500">
          Gastado en esta visita: {spent} cr
          {balance != null ? ` · saldo ${balance}` : ''}
          {busy ? ` · ${busy}` : ''}
        </span>
      </div>
      {error && <p className="text-sm text-red-700 border border-red-600 bg-red-50 px-3 py-2">{error}</p>}

      {step === 'fotos' && (
      <section className="border border-surface-300 p-3 space-y-3">
        <p>Busca fotos que ya tengas y pulsa las que quieras probar. Máximo 6. Luego pasa al paso 2.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="border border-surface-900 px-2 py-1 text-xs" value={setId} onChange={e => setSetId(e.target.value)}>
            <option value="">Sin grupo</option>
            {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            type="button"
            className={`${btn} bg-white`}
            onClick={async () => {
              const name = window.prompt('Nombre del grupo', 'Furgocasa prueba');
              if (!name) return;
              const json = await post({ action: 'create_set', name });
              if (json?.set?.id) setSetId(json.set.id);
            }}
          >
            Nuevo grupo
          </button>
          {setId && (
            <button type="button" className={`${btn} bg-white`} onClick={() => void post({ action: 'delete_set', set_id: setId })}>
              Borrar grupo
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="border border-surface-900 px-2 py-1 text-xs flex-1 min-w-[10rem]" value={q} onChange={e => setQ(e.target.value)} placeholder="Proyecto, por ejemplo Furgocasa" />
          <button type="button" className={`${btn} bg-amber-200`} onClick={() => void search()}>Buscar</button>
        </div>
        {!!hits.length && (
          <div className="flex flex-wrap gap-2">
            {hits.map(h => (
              <button
                key={h.id}
                type="button"
                title={`${h.project || ''} ${h.date || ''} ${h.idea || ''}`}
                className="w-16 text-left border border-surface-900 disabled:opacity-40"
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
                <img src={h.image_url} alt="" className="h-24 w-16 object-cover" />
                <span className="block text-[9px] leading-tight p-0.5 truncate">{h.date || h.project}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input className="border border-surface-900 px-2 py-1 text-xs flex-1" value={urlDraft} onChange={e => setUrlDraft(e.target.value)} placeholder="O pega una URL https" />
          <button
            type="button"
            className={`${btn} bg-white`}
            disabled={!setId || !urlDraft}
            onClick={() => {
              void post({ action: 'add_item', set_id: setId, image_url: urlDraft, label: 'URL pegada', expectation: '' });
              setUrlDraft('');
            }}
          >
            Añadir
          </button>
        </div>
        <p className="text-xs text-surface-500">Elegidas: {bank.length}/6. Si no hay grupo, crea uno antes de pulsar una foto.</p>
        <div className="flex flex-wrap gap-2">
          {bank.map(item => (
            <div key={item.id} className="w-36 border border-surface-300 p-1">
              <img src={item.image_url} alt="" className="h-24 w-full object-cover" />
              <p className="text-[10px] truncate mt-1">{item.label || 'Imagen'}</p>
              <input
                className="w-full border border-surface-300 text-[10px] px-1 py-0.5 mt-1"
                defaultValue={item.expectation || ''}
                placeholder="Qué no debe fallar"
                onBlur={e => void post({ action: 'update_item', item_id: item.id, expectation: e.target.value })}
              />
              <button type="button" className="text-[10px] underline" onClick={() => void post({ action: 'remove_item', item_id: item.id })}>Quitar</button>
            </div>
          ))}
        </div>
        <button type="button" className={`${btn} bg-surface-900 text-white`} disabled={!bank.length} onClick={() => setStep('probar')}>
          Seguir: cómo se mueven
        </button>
      </section>
      )}

      {step === 'probar' && (
      <section className="border border-surface-300 p-3 space-y-3">
        <p>
          Vas a animar las {bank.length} fotos de varias formas. Cada casilla marcada es un vídeo de más.
          Para empezar basta Gen-4 Turbo, 5 segundos y dos formas.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          {['gen4.5', 'gen4_turbo'].map(m => (
            <label key={m} className="flex items-center gap-1">
              <input type="checkbox" checked={models.includes(m)} onChange={() => toggle(models, m, setModels)} />
              {m === 'gen4.5' ? 'Gen-4.5, más caro' : 'Gen-4 Turbo, más barato'}
            </label>
          ))}
          {[5, 10].map(d => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={durations.includes(d)} onChange={() => setDurations(durations.includes(d) ? durations.filter(x => x !== d) : [...durations, d])} />
              {d} segundos
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {templates.filter(t => !t.parent_id).map(t => (
            <label key={t.id} title={t.notes || ''} className={`text-[11px] border px-2 py-1 ${templateIds.includes(t.id) ? 'border-surface-900 bg-amber-100' : 'border-surface-200'}`}>
              <input type="checkbox" className="mr-1" checked={templateIds.includes(t.id)} onChange={() => toggle(templateIds, t.id, setTemplateIds)} />
              {t.name.replace(' (producción)', '')}
            </label>
          ))}
        </div>
        <p>
          {estimate.n || 0} vídeos · {estimate.credits} créditos · <strong>${(estimate.credits * 0.01).toFixed(2)}</strong>
          {' '}(tope {roundBudget} cr, unos ${(roundBudget * 0.01).toFixed(0)})
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-brand-600 text-white`} disabled={!setId || !estimate.n} onClick={() => setConfirm({ kind: 'matrix', ...estimate })}>
            Generar estos vídeos
          </button>
          <button type="button" className="text-xs underline" onClick={() => setMore(v => !v)}>{more ? 'Ocultar ajustes' : 'Ajustes'}</button>
        </div>
        {more && (
          <div className="flex flex-wrap gap-3 text-xs items-end">
            <label>Tope de esta prueba
              <input type="number" className="border border-surface-900 w-20 px-1 ml-1" value={roundBudget} onChange={e => setRoundBudget(Number(e.target.value))} />
            </label>
            <label>Tope de la visita
              <input type="number" className="border border-surface-900 w-20 px-1 ml-1" value={sessionBudget} onChange={e => setSessionBudget(Number(e.target.value))} />
            </label>
            <button type="button" className={`${btn} bg-white`} disabled={!setId || !estimate.n} onClick={() => setConfirm({ kind: 'optimize', ...estimate })}>
              Dejar que proponga {maxRounds} rondas
            </button>
          </div>
        )}
      </section>
      )}

      {step === 'ver' && (
      <section className="space-y-3">
        <p>Aquí salen los vídeos de la prueba. Pulsa una nota del 1 al 5. Si uno te convence, «Usar en el calendario» hace que Montar reel copie esa forma de animar.</p>
        <div className="flex flex-wrap gap-1">
          {runs.slice(0, 8).map(r => (
            <button key={r.id} type="button" className={`text-[11px] border px-2 py-1 ${r.id === runId ? 'bg-amber-200 border-surface-900' : 'border-surface-300'}`} onClick={() => setRunId(r.id)}>
              Prueba {r.round} · {r.status} · {r.spent_credits} cr
            </button>
          ))}
          {runClips.some(c => c.video_url) && (
            <button type="button" className="text-[11px] underline ml-2" onClick={() => setAb(true)}>Ver dos a la vez</button>
          )}
        </div>
        {!runClips.length && (
          <p className="text-surface-500">
            {autopilot ? 'Los vídeos salen aquí cuando Runway termina cada uno. El primero tarda unos minutos.' : 'Todavía no hay vídeos. Vuelve al paso 2 y genera.'}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {runClips.map(c => {
            const item = items.find(i => i.id === c.set_item_id);
            const score = clipFinal(c);
            return (
              <article key={c.id} className="w-40 border border-surface-300">
                {c.video_url ? (
                  <video className="lab-clip w-40 h-64 object-cover bg-black" src={c.video_url} muted loop playsInline controls />
                ) : (
                  <div className="w-40 h-64 bg-surface-100 flex items-end">
                    <img src={item?.image_url} alt="" className="w-full h-full object-cover opacity-70" />
                  </div>
                )}
                <div className="p-1.5 text-[10px] space-y-1">
                  <p className="font-bold leading-tight">{tplName(c.template_id)}</p>
                  <p>{c.status}{c.cost_credits ? ` · ${c.cost_credits} cr` : ''}{score != null ? ` · ${score.toFixed(1)}` : ''}</p>
                  {c.failure && <p className="text-red-700 line-clamp-2">{c.failure}</p>}
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" className={`border border-surface-900 px-1 ${c.human_score === n ? 'bg-amber-300' : 'bg-white'}`} onClick={() => void post({ action: 'rate', clip_id: c.id, score: n, tags: c.human_tags || [], comment: c.human_comment || '' })}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {c.status === 'ready' && c.template_id && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void post({ action: 'apply', template_id: c.template_id, model: c.model, duration: c.duration })}
                    >
                      Usar en el calendario
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="text-[11px] text-surface-500">
          En el calendario ahora: {settings?.video_prompt_templates?.name || settings?.video_prompt_templates?.[0]?.name || 'la forma de siempre'}
          {settings?.model ? `, ${settings.model}` : ''}.
          {settings?.previous && (
            <button type="button" className="underline ml-2" onClick={() => void post({ action: 'revert' })}>Deshacer</button>
          )}
        </p>
      </section>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white border-2 border-surface-900 shadow-brutal max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold uppercase tracking-wide text-sm">{confirm.auto ? 'Hazlo todo' : 'Confirmar gasto'}</h3>
            <p className="text-sm">
              {confirm.auto
                ? `${confirm.n} vídeos en la primera ronda · ${confirm.credits} créditos · $${(confirm.credits * 0.01).toFixed(2)}. Puede pedir hasta 2 rondas más, sin pasar de 6 $. Si la mejor nota llega a 6, esa animación queda en el calendario. Deja esta página abierta.`
                : `${confirm.n} clips · ${confirm.credits} créditos · $${(confirm.credits * 0.01).toFixed(2)}. Tope de ronda ${roundBudget} créditos y de sesión ${sessionBudget}. No se lanza nada por encima.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" className={`${btn} bg-white`} onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                type="button"
                className={`${btn} bg-brand-600 text-white`}
                onClick={() => {
                  const kind = confirm.kind;
                  const auto = Boolean(confirm.auto);
                  const launchSet = confirm.setId || setId;
                  const launchTemplates = confirm.templateIds?.length ? confirm.templateIds : templateIds;
                  const launchCredits = confirm.credits;
                  setConfirm(null);
                  setStep('ver');
                  if (auto) {
                    setAutopilot(true);
                    sessionStorage.setItem('gestia-video-lab-autopilot', sessionId());
                  }
                  void post({
                    action: 'launch',
                    kind,
                    set_id: launchSet,
                    models: auto ? ['gen4_turbo'] : models,
                    durations: auto ? [5] : durations,
                    template_ids: launchTemplates,
                    seed: null,
                    ratio: '720:1280',
                    budget_credits: auto ? launchCredits : roundBudget,
                    session_budget_credits: auto ? Math.max(sessionBudget, launchCredits) : sessionBudget,
                    session_id: sessionId(),
                    max_rounds: auto ? 3 : kind === 'optimize' ? maxRounds : 1,
                  }).then(json => {
                    if (!auto) return;
                    if (!json?.run_id) {
                      setAutopilot(false);
                      sessionStorage.removeItem('gestia-video-lab-autopilot');
                      sessionStorage.removeItem('gestia-video-lab-root');
                      return;
                    }
                    sessionStorage.setItem('gestia-video-lab-root', json.run_id);
                    setRootId(json.run_id);
                    setRunId(json.run_id);
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
