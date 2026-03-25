-- Variante de email corporativo (contacto@eskala.digital.com) frente a eskaladigital.com en 012.
UPDATE public.profiles
  SET role = 'admin', is_freemium = true
  WHERE id = (
    SELECT id FROM auth.users WHERE email = 'contacto@eskala.digital.com' LIMIT 1
  );

-- Entorno con un único usuario en auth: asegura admin en public.profiles (la app lee esta tabla, no el panel Authentication).
UPDATE public.profiles p
  SET role = 'admin', is_freemium = true
  FROM (SELECT COUNT(*)::int AS c FROM auth.users) AS cnt
  WHERE cnt.c = 1 AND p.id = (SELECT id FROM auth.users LIMIT 1);
