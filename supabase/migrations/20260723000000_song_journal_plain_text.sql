create function pg_temp.audio_versions_rich_text_to_text(node jsonb)
returns text
language plpgsql
immutable
as $$
declare
  child jsonb;
  result text := '';
  node_type text;
begin
  if node is null or node = 'null'::jsonb then
    return '';
  end if;

  if jsonb_typeof(node) = 'string' then
    return node #>> '{}';
  end if;

  if jsonb_typeof(node) = 'array' then
    for child in select value from jsonb_array_elements(node)
    loop
      result := result || pg_temp.audio_versions_rich_text_to_text(child);
    end loop;
    return result;
  end if;

  node_type := node ->> 'type';
  if node_type = 'text' then
    return coalesce(node ->> 'text', '');
  end if;
  if node_type = 'hardBreak' then
    return E'\n';
  end if;

  for child in
    select value from jsonb_array_elements(coalesce(node -> 'content', '[]'::jsonb))
  loop
    result := result || pg_temp.audio_versions_rich_text_to_text(child);
  end loop;

  if node_type in ('paragraph', 'heading', 'blockquote') then
    result := result || E'\n\n';
  elsif node_type = 'listItem' then
    result := result || E'\n';
  end if;

  return result;
end;
$$;

alter table public.songs
  alter column general_notes drop default;

alter table public.songs
  alter column general_notes type text
  using regexp_replace(
    pg_temp.audio_versions_rich_text_to_text(general_notes),
    E'\n+$',
    ''
  );

alter table public.songs
  alter column general_notes set default '';
