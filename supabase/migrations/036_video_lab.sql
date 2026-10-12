-- Laboratorio de vídeo: sets de prueba, plantillas de movimiento, rondas y clips.
-- La 035 ya es el bucket de vídeo; esta es la 036.
-- RLS: solo administradores. El API usa service role tras comprobar isAdmin.

create table if not exists public.video_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  version int not null default 1,
  system_prompt text not null,
  notes text,
  parent_id uuid references public.video_prompt_templates(id) on delete set null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.video_lab_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_lab_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.video_lab_sets(id) on delete cascade,
  sort_order smallint not null default 0,
  image_url text not null,
  visual_brief text,
  expectation text,
  source_visual_id uuid,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_lab_set_items_set on public.video_lab_set_items(set_id);

create table if not exists public.video_lab_runs (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.video_lab_sets(id) on delete cascade,
  session_id uuid not null,
  round int not null default 1,
  parent_run_id uuid references public.video_lab_runs(id) on delete set null,
  kind text not null default 'matrix' check (kind in ('matrix', 'optimize')),
  budget_credits int not null,
  session_budget_credits int not null,
  spent_credits int not null default 0,
  max_rounds int not null default 1,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'stopped', 'error')),
  best_score numeric,
  stop_reason text,
  model_lock text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_lab_runs_session on public.video_lab_runs(session_id);
create index if not exists idx_video_lab_runs_status on public.video_lab_runs(status);

create table if not exists public.video_lab_clips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.video_lab_runs(id) on delete cascade,
  set_item_id uuid not null references public.video_lab_set_items(id) on delete cascade,
  model text not null,
  duration int not null,
  ratio text not null default '720:1280',
  seed int,
  seed_sent boolean not null default false,
  template_id uuid references public.video_prompt_templates(id) on delete set null,
  prompt_final text,
  task_id text,
  status text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'error')),
  failure text,
  attempts int not null default 0,
  next_attempt_at timestamptz,
  video_url text,
  cost_credits int not null default 0,
  metrics jsonb,
  ai_judgment jsonb,
  human_score smallint check (human_score is null or human_score between 1 and 5),
  human_tags text[] not null default '{}',
  human_comment text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_lab_clips_run on public.video_lab_clips(run_id);
create index if not exists idx_video_lab_clips_status on public.video_lab_clips(status);

create table if not exists public.video_lab_settings (
  id int primary key default 1 check (id = 1),
  template_id uuid references public.video_prompt_templates(id) on delete set null,
  model text,
  duration int,
  previous jsonb,
  updated_at timestamptz not null default now()
);

insert into public.video_lab_settings (id) values (1) on conflict (id) do nothing;

alter table public.video_prompt_templates enable row level security;
alter table public.video_lab_sets enable row level security;
alter table public.video_lab_set_items enable row level security;
alter table public.video_lab_runs enable row level security;
alter table public.video_lab_clips enable row level security;
alter table public.video_lab_settings enable row level security;

drop policy if exists "Admins manage video prompt templates" on public.video_prompt_templates;
create policy "Admins manage video prompt templates" on public.video_prompt_templates
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage video lab sets" on public.video_lab_sets;
create policy "Admins manage video lab sets" on public.video_lab_sets
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage video lab set items" on public.video_lab_set_items;
create policy "Admins manage video lab set items" on public.video_lab_set_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage video lab runs" on public.video_lab_runs;
create policy "Admins manage video lab runs" on public.video_lab_runs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage video lab clips" on public.video_lab_clips;
create policy "Admins manage video lab clips" on public.video_lab_clips
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage video lab settings" on public.video_lab_settings;
create policy "Admins manage video lab settings" on public.video_lab_settings
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.video_prompt_templates (slug, name, version, system_prompt, notes, is_seed)
values
  (
    'actual',
    'Actual (producción)',
    1,
    'You write image-to-video prompts for Runway. For each scene, write ONE English prompt (max 45 words) naming ONLY what may move: hands, people, hair, clothes, a bag or loose object, leaves, steam or water, plus one slow push-in. NEVER animate or reshape the vehicle, its doors, windows, walls, cabinets, seats, tables or the interior layout. A parked camper stays parked. An open sliding door stays open and rigid. Do not invent new objects. Reply ONLY JSON: {"prompt": string}.',
    'La receta que usa hoy «Montar reel».',
    true
  ),
  (
    'minima',
    'Mínima',
    1,
    'Write ONE English image-to-video prompt of at most 25 words. Name a single main action and one camera move (slow push-in or gentle lateral). Do not describe the whole scene. Do not move vehicles, doors or furniture. Reply ONLY JSON: {"prompt": string}.',
    'Una acción y un movimiento de cámara.',
    true
  ),
  (
    'fisica',
    'Física explícita',
    1,
    'Write ONE English image-to-video prompt (max 60 words). State what moves and what stays rigid. Rigid: logos, lettering, vehicle body, doors, windows, wheels shape, walls, furniture. People and hands keep a natural anatomy (five fingers). One slow camera move. Reply ONLY JSON: {"prompt": string}.',
    'Dice qué se mueve y qué no puede deformarse.',
    true
  ),
  (
    'cinematografica',
    'Cinematográfica',
    1,
    'Write ONE English image-to-video prompt (max 50 words) like a shot list: shot size, lens feel, pace, and one concrete camera move. Motion stays natural and small. Do not morph the product, logos or architecture. Reply ONLY JSON: {"prompt": string}.',
    'Plano, lente, ritmo y cámara.',
    true
  )
on conflict (slug) do nothing;
