-- Cauce (agenda): notificaciones push. Esquema propio, separado del resto del proyecto Supabase.
-- Aplicada en el proyecto «AulaMia» (gudvgxzraisolcpwprlz).
create schema if not exists cauce;
revoke all on schema cauce from public, anon, authenticated;

-- Dispositivos suscritos a notificaciones (uno por navegador/app instalada)
create table cauce.devices (
  id uuid primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- Avisos pendientes de enviar
create table cauce.reminders (
  id bigint generated always as identity primary key,
  device_id uuid not null references cauce.devices(id) on delete cascade,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  tag text not null default '',
  sent_at timestamptz
);
create index reminders_due_idx on cauce.reminders (fire_at) where sent_at is null;
create index reminders_device_idx on cauce.reminders (device_id);

-- Configuración interna (claves VAPID, secreto de la tarea programada).
-- Las claves VAPID las genera la función cauce-sync la primera vez que se le pide la pública.
create table cauce.config (
  key text primary key,
  value text not null
);
insert into cauce.config (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

-- Sin políticas a propósito: solo las funciones (conexión directa a la base de datos) acceden
alter table cauce.devices enable row level security;
alter table cauce.reminders enable row level security;
alter table cauce.config enable row level security;
revoke all on all tables in schema cauce from public, anon, authenticated;
