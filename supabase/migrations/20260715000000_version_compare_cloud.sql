create table public.songs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null default '',
  project text not null default '',
  general_notes jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  audio_file_order uuid[] not null default '{}',
  share_token_hash text unique,
  sharing_enabled boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.audio_files (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  title text not null,
  session_date date not null,
  notes jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  volume_db double precision not null default 0,
  duration_ms double precision not null,
  waveform jsonb not null,
  blob_pathname text,
  blob_content_type text,
  blob_size bigint,
  blob_original_name text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.annotations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  audio_file_id uuid not null references public.audio_files(id) on delete cascade,
  type text not null check (type in ('point', 'range')),
  start_ms double precision not null,
  end_ms double precision,
  title text not null default '',
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  color text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create index songs_user_updated_idx on public.songs(user_id, updated_at desc);
create index audio_files_user_song_idx on public.audio_files(user_id, song_id);
create index annotations_user_song_idx on public.annotations(user_id, song_id);
create index annotations_user_audio_file_idx on public.annotations(user_id, audio_file_id);

alter table public.songs enable row level security;
alter table public.audio_files enable row level security;
alter table public.annotations enable row level security;
alter table public.user_settings enable row level security;

create policy "Users own their songs"
  on public.songs for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users own their audio files"
  on public.audio_files for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users own their annotations"
  on public.annotations for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users own their settings"
  on public.user_settings for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_files'
  ) then
    alter publication supabase_realtime add table public.audio_files;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'annotations'
  ) then
    alter publication supabase_realtime add table public.annotations;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_settings'
  ) then
    alter publication supabase_realtime add table public.user_settings;
  end if;
end $$;
