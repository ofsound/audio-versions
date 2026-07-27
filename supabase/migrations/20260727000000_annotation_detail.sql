alter table public.annotations
  add column detail jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  drop column title,
  drop column body;
