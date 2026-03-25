import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getScrapingProvider } from '@/lib/scraping';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { project_id, url, type } = await request.json();
    if (!project_id || !url) {
      return NextResponse.json({ error: 'project_id y url son obligatorios' }, { status: 400 });
    }

    const scraper = getScrapingProvider();
    const page = await scraper.scrapeUrl(url);

    const { data, error } = await supabase
      .from('scraped_content')
      .insert({
        project_id,
        url: page.url,
        content: page.content,
        type: type || page.type,
        source: scraper.name,
        metadata: page.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, scraped: data });
  } catch (error: any) {
    console.error('[scrape] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
