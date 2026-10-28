-- One preferred preview per song. Clients fall back to the newest imported file
-- when this is unset or the referenced file no longer exists.
alter table public.songs
  add column starred_audio_file_id uuid;
