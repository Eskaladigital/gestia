'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SubscriptionPlan, UserRole } from '@/types';
import { cn } from '@/lib/utils';

const ADMIN_USERS_API = '/api/administrator/users';

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string;
  company_name: string | null;
  role: UserRole;
  is_freemium: boolean;
  project_count: number;
  active_subscription: {
    plan_id: string;
    status: string;
    subscription_plans: { name: string; max_projects: number };
  } | null;
  created_at: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  agency: 'Agencia',
  user: 'Usuario',
};

const ROLE_STYLES: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800 border-red-800',
  agency: 'bg-brand-100 text-brand-800 border-brand-800',
  user: 'bg-surface-100 text-surface-700 border-surface-700',
};

export function AdminUsersClient({ plans }: { plans: SubscriptionPlan[] }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ADMIN_USERS_API);
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const { users } = await res.json();
      setUsers(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleAction(userId: string, action: string, value: any) {
    setActionLoading(`${userId}-${action}`);
    try {
      const res = await fetch(ADMIN_USERS_API, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, value }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Error');
        return;
      }
      await fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.company_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por email, nombre o empresa..."
          className="w-full sm:w-96 px-4 py-3 border-2 border-surface-900 text-sm font-medium placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total usuarios', value: users.length },
          { label: 'Admins', value: users.filter(u => u.role === 'admin').length },
          { label: 'Agencias', value: users.filter(u => u.role === 'agency').length },
          { label: 'Freemium', value: users.filter(u => u.is_freemium).length },
        ].map(stat => (
          <div key={stat.label} className="bg-white border-2 border-surface-900 shadow-brutal-sm p-4">
            <p className="font-display text-2xl font-bold text-surface-900 tabular-nums">{stat.value}</p>
            <span className="text-[10px] text-surface-500 font-bold uppercase tracking-wider">{stat.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border-2 border-surface-900 p-12 text-center">
          <p className="text-sm text-surface-500 font-medium">Cargando usuarios...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <UserCard
              key={u.id}
              user={u}
              plans={plans}
              actionLoading={actionLoading}
              onAction={handleAction}
            />
          ))}
          {filtered.length === 0 && (
            <div className="bg-white border-2 border-dashed border-surface-900 p-12 text-center">
              <p className="text-sm text-surface-500 font-medium">No se encontraron usuarios</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserCard({
  user,
  plans,
  actionLoading,
  onAction,
}: {
  user: AdminUser;
  plans: SubscriptionPlan[];
  actionLoading: string | null;
  onAction: (userId: string, action: string, value: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const maxProjects = user.is_freemium || user.role === 'admin'
    ? '∞'
    : user.active_subscription?.subscription_plans?.max_projects ?? 1;

  return (
    <div className="bg-white border-2 border-surface-900 shadow-brutal-sm">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-surface-50 transition-colors"
      >
        <div className="w-9 h-9 bg-surface-900 text-white flex items-center justify-center flex-shrink-0 font-display font-bold text-sm">
          {(user.full_name || user.email)?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-surface-900 truncate">
              {user.full_name || 'Sin nombre'}
            </span>
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 border text-[9px] font-bold uppercase tracking-widest font-mono',
              ROLE_STYLES[user.role]
            )}>
              {ROLE_LABELS[user.role]}
            </span>
            {user.is_freemium && (
              <span className="inline-flex items-center px-2 py-0.5 border border-green-700 bg-green-100 text-green-800 text-[9px] font-bold uppercase tracking-widest font-mono">
                Freemium
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5 truncate">{user.email}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-xs text-surface-500 font-medium">
          <span>{user.project_count}/{maxProjects} proyectos</span>
          <span>{user.active_subscription?.subscription_plans?.name || 'Sin plan'}</span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn('flex-shrink-0 text-surface-400 transition-transform', expanded && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t-2 border-surface-200 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-1">Empresa</span>
              <span className="font-medium text-surface-900">{user.company_name || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-1">Registrado</span>
              <span className="font-medium text-surface-900">
                {new Date(user.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-1">Proyectos</span>
              <span className="font-medium text-surface-900">{user.project_count} / {maxProjects}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Role */}
            <div>
              <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-2">Cambiar rol</label>
              <div className="flex gap-1.5">
                {(['user', 'agency', 'admin'] as UserRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => onAction(user.id, 'set_role', r)}
                    disabled={user.role === r || actionLoading === `${user.id}-set_role`}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-2 transition-all',
                      user.role === r
                        ? 'bg-surface-900 text-white border-surface-900 cursor-default'
                        : 'border-surface-300 text-surface-600 hover:border-surface-900 hover:text-surface-900 disabled:opacity-50'
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan */}
            <div>
              <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-2">Asignar plan</label>
              <select
                value={user.active_subscription?.plan_id || ''}
                onChange={e => onAction(user.id, 'assign_plan', e.target.value || null)}
                disabled={actionLoading === `${user.id}-assign_plan`}
                className="w-full px-3 py-1.5 border-2 border-surface-300 text-xs font-medium focus:outline-none focus:border-surface-900 disabled:opacity-50"
              >
                <option value="">Sin plan</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.max_projects} proy. — {p.price_monthly}€/mes
                  </option>
                ))}
              </select>
            </div>

            {/* Freemium */}
            <div>
              <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block mb-2">Freemium</label>
              <button
                onClick={() => onAction(user.id, 'set_freemium', !user.is_freemium)}
                disabled={actionLoading === `${user.id}-set_freemium`}
                className={cn(
                  'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-2 transition-all disabled:opacity-50',
                  user.is_freemium
                    ? 'bg-green-600 text-white border-green-800 hover:bg-green-700'
                    : 'border-surface-300 text-surface-600 hover:border-green-600 hover:text-green-700'
                )}
              >
                {user.is_freemium ? 'Activo — Desactivar' : 'Activar freemium'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
