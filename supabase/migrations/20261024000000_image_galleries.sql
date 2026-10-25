-- Gallery metadata follows its owning record and the existing owner-only RLS.
-- Private image originals and thumbnails live in Vercel Blob, never in this JSON.
alter table public.songs
  add column gallery_images jsonb not null default '[]'::jsonb
  check (jsonb_typeof(gallery_images) = 'array');
alter table public.audio_files
  add column gallery_images jsonb not null default '[]'::jsonb
  check (jsonb_typeof(gallery_images) = 'array');
