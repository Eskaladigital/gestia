import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { captureWebScreenshotsToStorage } from '@/lib/scraping/screenshots-puppeteer';

export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * GET /api/debug-screenshots?url=https://example.com
 * Diagnóstico: intenta capturar una sola URL y devuelve el resultado detallado.
 * Solo accesible para usuarios autenticados con rol admin.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const testUrl = request.nextUrl.searchParams.get('url') || 'https://example.com';

  const env = {
    DISABLE_PUPPETEER_SCREENSHOTS: process.env.DISABLE_PUPPETEER_SCREENSHOTS || '(no definida)',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ definida' : '✗ FALTA',
    isVercel: !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME,
    NODE_ENV: process.env.NODE_ENV,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };

  const start = Date.now();
  const result = await captureWebScreenshotsToStorage([testUrl], 'debug-test', { maxPages: 1 });
  const elapsed = Date.now() - start;

  const screenshotEntry = result.screenshots.get(testUrl);

  return NextResponse.json({
    ok: result.succeeded > 0,
    test_url: testUrl,
    elapsed_ms: elapsed,
    environment: env,
    result: {
      attempted: result.attempted,
      succeeded: result.succeeded,
      skipped_reason: result.skipped_reason,
      errors: result.errors,
      screenshot_url: screenshotEntry?.screenshot_url || null,
    },
  });
}
