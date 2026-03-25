'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ESKALA_MARKETING_DIGITAL } from '@/lib/utils';
import { isAdminRole, postLoginPathForRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const { data: { user: signedUser } } = await supabase.auth.getUser();
      let dest = postLoginPathForRole(false);
      if (signedUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', signedUser.id)
          .maybeSingle();
        dest = postLoginPathForRole(isAdminRole(profile?.role));
      }
      router.push(dest);
      router.refresh();
    }
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  }

  return (
    <div className="min-h-screen flex bg-surface-50">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-surface-900 relative overflow-hidden items-center justify-center">
        <div className="absolute top-20 left-20 w-24 h-24 bg-brand-500/20 rounded rotate-12 animate-float" />
        <div className="absolute bottom-32 right-16 w-16 h-16 bg-brand-400/30 rounded-full animate-float-slow" />
        <div className="absolute top-1/3 right-1/4 w-12 h-12 border-2 border-white/10 rounded-full" />
        <div className="relative z-10 text-center px-16">
          <h2 className="font-display text-5xl font-bold text-white uppercase tracking-tight leading-[0.95] mb-6">
            Estrategia de
            <br />
            <span className="text-brand-400">contenido</span>
            <br />
            con IA
          </h2>
          <p className="text-surface-400 text-sm max-w-sm mx-auto">
            Genera calendarios completos de contenido para redes sociales en minutos.
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
            <h1 className="font-display text-3xl font-bold tracking-tight">Bienvenido de vuelta</h1>
            <p className="text-surface-500 mt-2 text-sm">Inicia sesión en tu cuenta</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-surface-200 rounded-lg hover:border-surface-900 transition-colors text-sm font-semibold text-surface-700 mb-6"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-[10px] text-surface-400 uppercase tracking-widest font-semibold">o con email</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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
              placeholder="••••••••"
              required
            />
            {error && (
              <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-lg">{error}</p>
            )}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Iniciar sesión →
            </Button>
          </form>

          <p className="text-center text-xs text-surface-500 mt-8">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-surface-900 font-bold hover:underline">
              Regístrate gratis
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
