-- Schema del agente inmobiliario (Corredora Andes Propiedades) — ejecutar en
-- el SQL Editor de Supabase SOLO para producción. La demo v1 corre con la base
-- EN MEMORIA de database/supabase.js (mismas tablas y semillas).
-- NOTA: el bot debe usar la clave service_role (la anon da "permission denied"
-- en tablas con RLS). Como alternativa para la demo, se deshabilita RLS abajo.

-- Historial de conversación por cliente (una fila por teléfono/chat)
create table if not exists inmobiliaria_sesiones (
  telefono   text primary key,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Catálogo de propiedades de la corredora.
-- Regla de moneda: venta en UF, arriendo en CLP; gastos_comunes siempre en CLP
-- (null = sin gastos comunes, típico de casas).
create table if not exists propiedades (
  id                    text primary key,               -- 'P1', 'P2', ...
  operacion             text not null check (operacion in ('venta', 'arriendo')),
  tipo                  text not null check (tipo in ('casa', 'depto')),
  comuna                text not null,
  direccion_referencial text not null,                  -- referencial: la exacta se entrega al coordinar la visita
  precio                integer not null,
  moneda                text not null check (moneda in ('UF', 'CLP')),
  gastos_comunes        integer,
  dormitorios           smallint not null,
  banos                 smallint not null,
  m2                    integer not null,
  estado                text not null default 'disponible'
                        check (estado in ('disponible', 'arrendada', 'vendida', 'reservada')),
  descripcion           text
);

-- Ventana de visitas por día de la semana (0=domingo ... 6=sábado).
-- Un día sin fila = SIN visitas ese día. Regla dura del negocio: solo lunes,
-- miércoles y jueves, de 11:00 a 14:00 (slots de 30 min los define el agente).
create table if not exists horarios_visita (
  dia_semana smallint primary key check (dia_semana between 0 and 6),
  abre       time not null,
  cierra     time not null
);

-- Visitas a propiedades agendadas por el bot. El slot es GLOBAL por fecha/hora
-- (un solo corredor acompaña las visitas), no por propiedad.
create table if not exists visitas (
  id           bigint generated always as identity primary key,
  propiedad_id text not null references propiedades (id),
  nombre       text not null,
  telefono     text not null,                            -- normalizado a solo dígitos
  fecha        date not null,
  hora         time not null,
  estado       text not null default 'agendada' check (estado in ('agendada', 'cancelada')),
  creado_en    timestamptz not null default now()
);

create index if not exists idx_visitas_fecha    on visitas (fecha) where estado = 'agendada';
create index if not exists idx_visitas_telefono on visitas (telefono);

-- Leads capturados por el bot. Un lead por teléfono (clave natural, upsert).
-- El score lo calcula la tool registrar_lead con reglas determinísticas:
-- caliente = agendó visita, o urgencia inmediata + presupuesto informado;
-- tibio = operación + comuna + presupuesto, urgencia media o no declarada;
-- frío = el resto.
create table if not exists leads (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  telefono          text not null unique,                -- normalizado a solo dígitos
  operacion         text check (operacion in ('venta', 'arriendo')),
  comuna            text,
  presupuesto       integer,                             -- CLP para arriendo, UF para venta
  urgencia          text check (urgencia in ('inmediata', 'media', 'baja')),
  propiedad_interes text references propiedades (id),
  score             text not null default 'frío' check (score in ('frío', 'tibio', 'caliente')),
  nota              text,
  actualizado_en    timestamptz not null default now()
);

-- RLS activado y SIN políticas: la clave anon no entra; solo la service_role
-- del backend (SUPABASE_SERVICE_KEY), que salta RLS. Sobre una base en uso:
-- primero la clave en el servidor y redeploy; recién después estas líneas.
alter table inmobiliaria_sesiones enable row level security;
alter table propiedades           enable row level security;
alter table horarios_visita       enable row level security;
alter table visitas               enable row level security;
alter table leads                 enable row level security;

-- ─── Datos semilla del SPEC ──────────────────────────────────────────────────

insert into horarios_visita (dia_semana, abre, cierra) values
  (1, '11:00', '14:00'),   -- lunes
  (3, '11:00', '14:00'),   -- miércoles
  (4, '11:00', '14:00')    -- jueves
on conflict (dia_semana) do nothing;

insert into propiedades (id, operacion, tipo, comuna, direccion_referencial, precio, moneda, gastos_comunes, dormitorios, banos, m2, estado, descripcion) values
  ('P1', 'arriendo', 'depto', 'Santiago Centro', 'Santa Isabel alt. 350, Santiago Centro',   420000, 'CLP', 65000,  1, 1, 45,  'disponible', 'Depto de 1 dormitorio orientación oriente, cocina equipada y conserjería 24/7. A pasos del metro Santa Isabel.'),
  ('P2', 'arriendo', 'depto', 'Ñuñoa',           'Av. Irarrázaval alt. 3400, Ñuñoa',         560000, 'CLP', 80000,  2, 1, 58,  'disponible', 'Depto luminoso de 2 dormitorios, remodelado, con logia y bodega. A 2 cuadras de la plaza de Ñuñoa.'),
  ('P3', 'arriendo', 'casa',  'Maipú',           'Av. Los Pajaritos alt. 2500, Maipú',       650000, 'CLP', null,   3, 2, 90,  'disponible', 'Casa de 3 dormitorios con patio y estacionamiento para 2 autos, cerca del metro Plaza de Maipú.'),
  ('P4', 'arriendo', 'depto', 'Providencia',     'Av. Providencia alt. 2100, Providencia',   480000, 'CLP', 70000,  1, 1, 40,  'arrendada',  'Depto de 1 dormitorio full amoblado, edificio con gimnasio y cowork. Metro Pedro de Valdivia.'),
  ('P5', 'venta',    'depto', 'Ñuñoa',           'José Pedro Alessandri alt. 1100, Ñuñoa',   3400,   'UF',  75000,  2, 2, 62,  'disponible', 'Depto de 2 dormitorios y 2 baños con terraza, edificio 2018 con quincho. Sector plaza Egaña.'),
  ('P6', 'venta',    'depto', 'San Miguel',      'Gran Avenida alt. 4900, San Miguel',       4200,   'UF',  60000,  3, 2, 78,  'disponible', 'Depto de 3 dormitorios en piso alto con vista despejada, estacionamiento y bodega. Metro San Miguel.'),
  ('P7', 'venta',    'casa',  'La Florida',      'Walker Martínez alt. 700, La Florida',     6500,   'UF',  null,   4, 3, 120, 'disponible', 'Casa de 4 dormitorios en dos pisos, patio grande con quincho. Cerca de Vespucio y metro Bellavista de La Florida.'),
  ('P8', 'venta',    'depto', 'Las Condes',      'Av. Apoquindo alt. 6300, Las Condes',      5900,   'UF',  110000, 2, 2, 70,  'disponible', 'Depto de 2 dormitorios y 2 baños con terraza vidriada, edificio con piscina y gimnasio. Metro Manquehue.')
on conflict (id) do nothing;

-- Visita semilla: Marcela Fuentes, P2, PRÓXIMO miércoles 12:00 (prueba la
-- colisión de slot de ADV-4). El CASE evita que caiga en el día de hoy.
insert into visitas (propiedad_id, nombre, telefono, fecha, hora)
select 'P2', 'Marcela Fuentes', '56987654321',
       current_date + (case when d = 0 then 7 else d end), '12:00'
from (select ((3 - extract(dow from current_date)::int) % 7 + 7) % 7 as d) x;

-- Lead semilla: mismo teléfono que la visita (prueba el upsert por teléfono)
insert into leads (nombre, telefono, operacion, comuna, presupuesto, urgencia, propiedad_interes, score)
values ('Marcela Fuentes', '56987654321', 'arriendo', 'Ñuñoa', 600000, 'inmediata', 'P2', 'caliente')
on conflict (telefono) do nothing;
