create table public.playlists (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  audio_file_ids uuid[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index playlists_user_order_idx
  on public.playlists(user_id, sort_order, created_at);

alter table public.playlists enable row level security;

create policy "Users own their playlists"
  on public.playlists for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'playlists'
  ) then
    alter publication supabase_realtime add table public.playlists;
  end if;
end $$;
