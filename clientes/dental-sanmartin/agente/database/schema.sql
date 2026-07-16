-- Schema del agente de citas — ejecutar en Supabase SQL Editor.
-- NOTA: el bot debe usar la clave service_role (la anon da "permission denied"
-- en tablas con RLS). Como alternativa para la demo, se deshabilita RLS abajo.

-- Historial de conversación por cliente (una fila por teléfono)
create table if not exists sesiones (
  telefono   text primary key,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Catálogo de servicios/productos que el bot puede mostrar
create table if not exists catalogo (
  id               bigint generated always as identity primary key,
  nombre           text not null,
  descripcion      text,
  categoria        text,
  precio           integer,          -- CLP; 0 o null si no aplica
  duracion_minutos integer not null default 60,
  activo           boolean not null default true
);

-- Horario de atención por día de la semana (0=domingo ... 6=sábado).
-- Un día sin fila = cerrado.
create table if not exists horarios (
  dia_semana smallint primary key check (dia_semana between 0 and 6),
  abre       time not null,
  cierra     time not null
);

-- Citas agendadas por el bot
create table if not exists citas (
  id               bigint generated always as identity primary key,
  telefono_cliente text not null,
  nombre_cliente   text,
  servicio         text,
  fecha            date not null,
  hora             time not null,
  personas         smallint not null default 1,
  notas            text,
  estado           text not null default 'confirmada' check (estado in ('confirmada', 'cancelada')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_citas_fecha    on citas (fecha) where estado = 'confirmada';
create index if not exists idx_citas_telefono on citas (telefono_cliente);

-- Demo: sin RLS (el acceso es solo desde el backend con service_role).
alter table sesiones disable row level security;
alter table catalogo disable row level security;
alter table horarios disable row level security;
alter table citas    disable row level security;

-- ─── Datos de ejemplo ────────────────────────────────────────────────────────

insert into horarios (dia_semana, abre, cierra) values
  (1, '09:00', '19:00'),
  (2, '09:00', '19:00'),
  (3, '09:00', '19:00'),
  (4, '09:00', '19:00'),
  (5, '09:00', '19:00'),
  (6, '10:00', '14:00')
on conflict (dia_semana) do nothing;

insert into catalogo (nombre, descripcion, categoria, precio, duracion_minutos) values
  ('Consulta general',       'Evaluación inicial con el profesional', 'consulta',    25000,  30),
  ('Limpieza dental',        'Destartraje y profilaxis completa',     'dental',      45000,  60),
  ('Blanqueamiento',         'Blanqueamiento dental en 1 sesión',     'dental',      120000, 90),
  ('Mesa para 2 personas',   'Reserva de mesa estándar',              'restaurante', 0,      90),
  ('Mesa para 4-6 personas', 'Reserva de mesa grande',                'restaurante', 0,      120);
