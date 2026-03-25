'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';
import { isAdminRole, postLoginPathForRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const PLAN_LABELS: Record<string, string> = {
  user_basic: 'Basico',
  agency_starter: 'Agencia Start',
  agency_pro: 'Agencia Pro',
  agency_elite: 'Agencia Elite',
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const meta: Record<string, string> = { full_name: fullName };
    if (selectedPlan) meta.selected_plan = selectedPlan;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const { data: { user: newUser } } = await supabase.auth.getUser();
      let dest = postLoginPathForRole(false);
      if (newUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', newUser.id)
          .maybeSingle();
        dest = postLoginPathForRole(isAdminRole(profile?.role));
      }
      router.push(dest);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex bg-surface-50">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-surface-900 relative overflow-hidden items-center justify-center">
        <div className="absolute top-32 right-20 w-20 h-20 bg-brand-400/20 rounded-full animate-float" />
        <div className="absolute bottom-20 left-24 w-16 h-16 bg-amber-400/20 rounded rotate-45 animate-float-slow" />
        <div className="absolute top-1/2 left-16 w-10 h-10 border-2 border-white/10 rounded" />
        <div className="relative z-10 text-center px-16">
          <h2 className="font-display text-5xl font-bold text-white uppercase tracking-tight leading-[0.95] mb-6">
            Empieza a crear
            <br />
            <span className="text-brand-400">estrategias</span>
            <br />
            hoy
          </h2>
          <p className="text-surface-400 text-sm max-w-sm mx-auto">
            Sin tarjeta de crédito. Gratis durante la beta.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <Link href="/" className="inline-flex items-center mb-8">
              <img src="/images/logo/logo_gestia.png" alt="GestIA" className="h-10 w-auto" />
            </Link>
            <h1 className="font-display text-3xl font-bold tracking-tight">Crea tu cuenta</h1>
            <p className="text-surface-500 mt-2 text-sm">Empieza a crear estrategias con IA</p>
            {selectedPlan && (
              <div className="mt-4 inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-800 px-4 py-2 rounded-lg text-sm font-medium">
                <span className="text-brand-600">Plan:</span>
                <span className="font-bold">{PLAN_LABELS[selectedPlan] || selectedPlan}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              label="Nombre completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
            />
            {error && (
              <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-lg">{error}</p>
            )}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Crear cuenta →
            </Button>
          </form>

          <p className="text-center text-xs text-surface-500 mt-8">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-surface-900 font-bold hover:underline">
              Inicia sesión
            </Link>
          </p>
          <p className="text-center text-[10px] text-surface-400 mt-6 leading-relaxed">
            <a
              href={ESKALA_MARKETING_DIGITAL.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-surface-500 hover:text-brand-600 transition-colors"
            >
              {ESKALA_MARKETING_DIGITAL.name}
            </a>
            <span className="mx-1">·</span>
            {ESKALA_MARKETING_DIGITAL.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
