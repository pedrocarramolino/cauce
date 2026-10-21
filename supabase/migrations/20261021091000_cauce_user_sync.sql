-- Cauce: tareas y ajustes de cada usuario en la nube (sincronización entre dispositivos).
create table cauce.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb,                       -- la tarea tal cual la guarda la app (null si se borró)
  updated_at bigint not null,       -- marca de tiempo del cliente (ms): gana la más reciente
  deleted boolean not null default false,
  synced_at timestamptz not null default now(), -- cuándo llegó al servidor (para pedir cambios)
  primary key (user_id, id)
);
create index tasks_user_synced_idx on cauce.tasks (user_id, synced_at);

create table cauce.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  synced_at timestamptz not null default now()
);

alter table cauce.tasks enable row level security;
alter table cauce.user_settings enable row level security;
revoke all on cauce.tasks, cauce.user_settings from public, anon, authenticated;

-- Cambios desde «since» (null = todo). Devuelve también la hora del servidor para la próxima vez.
create or replace function public.cauce_pull(since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'now', now(),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'data', t.data, 'updated_at', t.updated_at, 'deleted', t.deleted))
      from cauce.tasks t
      where t.user_id = uid and (since is null or t.synced_at > since - interval '5 seconds')
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object('data', s.data, 'updated_at', s.updated_at) from cauce.user_settings s where s.user_id = uid)
  );
end; $$;

-- Sube cambios. Cada tarea solo se guarda si es más reciente que la que hay en el servidor.
create or replace function public.cauce_push(tasks jsonb default '[]'::jsonb, settings jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t jsonb; n int := 0;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(tasks) <> 'array' or jsonb_array_length(tasks) > 2000 then
    raise exception 'invalid tasks' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(tasks) loop
    if coalesce(length(t->>'id'), 0) not between 1 and 64 or pg_column_size(t->'data') > 32768 then continue; end if;
    insert into cauce.tasks as c (user_id, id, data, updated_at, deleted, synced_at)
    values (uid, t->>'id', case when coalesce((t->>'deleted')::boolean, false) then null else t->'data' end,
            (t->>'updated_at')::bigint, coalesce((t->>'deleted')::boolean, false), now())
    on conflict (user_id, id) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, synced_at = now()
      where c.updated_at < excluded.updated_at;
    n := n + 1;
  end loop;
  if settings is not null and pg_column_size(settings->'data') <= 8192 then
    insert into cauce.user_settings as s (user_id, data, updated_at, synced_at)
    values (uid, settings->'data', (settings->>'updated_at')::bigint, now())
    on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at, synced_at = now()
      where s.updated_at < excluded.updated_at;
  end if;
  return jsonb_build_object('ok', true, 'tasks', n, 'now', now());
end; $$;

revoke execute on function public.cauce_pull(timestamptz), public.cauce_push(jsonb, jsonb) from public, anon;
grant execute on function public.cauce_pull(timestamptz), public.cauce_push(jsonb, jsonb) to authenticated;
