alter table public.audio_files
  add column if not exists loudness jsonb;
