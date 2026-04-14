'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AdministratorTrashedProjectActions({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<'restore' | 'delete' | null>(null);
  const [error, setError] = useState('');

  async function restore() {
    setError('');
    setLoading('restore');
    try {
      const res = await fetch(`/api/administrator/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error al restaurar');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  async function permanentDelete() {
    if (
      !confirm(
        `¿Eliminar definitivamente «${projectName}»? Se borrarán estrategia, calendario y datos asociados del cliente. No se puede deshacer.`
      )
    ) {
      return;
    }
    setError('');
    setLoading('delete');
    try {
      const res = await fetch(`/api/administrator/projects/${projectId}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <div className="flex flex-col items-end gap-1 min-w-[140px]">
      {error ? (
        <span className="text-[10px] font-bold text-red-600 max-w-[220px] text-right leading-snug">{error}</span>
      ) : null}
      <div className="flex flex-wrap justify-end gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void restore()}
          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 border-2 border-surface-900 bg-surface-100 text-surface-900 hover:bg-surface-200 transition-colors disabled:opacity-50"
        >
          {loading === 'restore' ? '…' : 'Restaurar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void permanentDelete()}
          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 border-2 border-surface-900 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {loading === 'delete' ? '…' : 'Eliminar'}
        </button>
      </div>
    </div>
  );
}
