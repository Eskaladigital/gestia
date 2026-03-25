'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchActiveProjectByIdForSession } from '@/lib/supabase/project-queries';
import type { Project, Strategy, ContentItem, Competitor } from '@/types';

interface UseProjectReturn {
  project: Project | null;
  strategy: Strategy | null;
  contentItems: ContentItem[];
  competitors: Competitor[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProject(projectId: string): UseProjectReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [projectRes, strategyRes, itemsRes, competitorsRes] = await Promise.all([
          fetchActiveProjectByIdForSession(supabase, projectId),
          supabase.from('strategies').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('content_items').select('*').eq('project_id', projectId).order('scheduled_date', { ascending: true }),
          supabase.from('competitors').select('*').eq('project_id', projectId),
        ]);

        if (projectRes.error) throw new Error(projectRes.error.message || 'Proyecto no encontrado');
        if (!projectRes.data) throw new Error('Proyecto no encontrado');
        setProject(projectRes.data);
        setStrategy(strategyRes.data || null);
        setContentItems(itemsRes.data || []);
        setCompetitors(competitorsRes.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (projectId) fetchData();
  }, [projectId, refreshKey]);

  return {
    project,
    strategy,
    contentItems,
    competitors,
    loading,
    error,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
