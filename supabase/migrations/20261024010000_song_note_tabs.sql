-- Named note documents retain plain text. The first document mirrors general_notes
-- for older clients; subsequent documents are independent of the first.
alter table public.songs
  add column note_tabs jsonb not null default '[]'::jsonb
  check (jsonb_typeof(note_tabs) = 'array');
