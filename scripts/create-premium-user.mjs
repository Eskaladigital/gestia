/**
 * Crea un usuario premium (no admin) con proyectos ilimitados.
 *
 * Uso:
 *   node -r ./scripts/preload-tls-local.cjs scripts/create-premium-user.mjs --email=usuario@ejemplo.com --password="TuContraseña"
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function getArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(a => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length).trim() : '';
}

async function main() {
  loadEnvLocal();
  const email = getArg('email').toLowerCase();
  const password = getArg('password');
  const fullName = getArg('name') || email.split('@')[0];

  if (!email || !password) {
    console.error('Uso: node scripts/create-premium-user.mjs --email=... --password="..." [--name="Nombre"]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const service = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users || []).find(u => (u.email || '').toLowerCase() === email);

  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`Usuario ya existe (${userId}). Actualizando contraseña y perfil…`);
    const { error: updErr } = await service.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error('Error actualizando usuario:', updErr.message);
      process.exit(1);
    }
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, selected_plan: 'agency_elite' },
    });
    if (error) {
      console.error('Error creando usuario:', error.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✓ Usuario creado: ${userId}`);
  }

  // Perfil (el trigger on_auth_user_created lo crea; aseguramos campos premium)
  const { data: profile } = await service.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!profile) {
    const { error: insErr } = await service.from('profiles').insert({
      id: userId,
      full_name: fullName,
      role: 'user',
      is_freemium: true,
    });
    if (insErr) {
      console.error('Error creando perfil:', insErr.message);
      process.exit(1);
    }
  } else {
    const { error: profErr } = await service
      .from('profiles')
      .update({ role: 'user', is_freemium: true, full_name: fullName })
      .eq('id', userId);
    if (profErr) {
      console.error('Error actualizando perfil:', profErr.message);
      process.exit(1);
    }
  }
  console.log('✓ Perfil: role=user, is_freemium=true (proyectos ilimitados, no admin)');

  // Suscripción activa Agencia Elite (referencia de plan premium)
  await service
    .from('user_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('status', ['active', 'trial']);

  const { error: subErr } = await service.from('user_subscriptions').insert({
    user_id: userId,
    plan_id: 'agency_elite',
    status: 'active',
    started_at: new Date().toISOString(),
  });
  if (subErr) {
    console.warn('⚠ Suscripción agency_elite:', subErr.message, '(el freemium ya da acceso ilimitado)');
  } else {
    console.log('✓ Suscripción activa: agency_elite');
  }

  console.log('\nListo. El usuario puede entrar en /login con su email y contraseña.');
  console.log('  Email:', email);
  console.log('  Admin: no | Proyectos: ilimitados (freemium)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
