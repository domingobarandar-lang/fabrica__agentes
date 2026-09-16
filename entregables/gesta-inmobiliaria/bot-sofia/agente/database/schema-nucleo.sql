-- Tablas que el NÚCLEO necesita para funcionar en producción.
-- Las del vertical (propiedades, citas, catálogo…) van en database/schema.sql,
-- que es del cliente y este archivo no toca.
--
-- CÓMO SE USA: reemplaza {{PREFIJO}} por el valor de `datos.prefijo` de
-- agente.config.json y corre esto en el SQL editor de Supabase. Si prefieres no
-- editar a mano:
--
--   node scripts/schema-nucleo.js > /tmp/schema.sql
--
-- que hace la sustitución leyendo la config.
--
-- POR QUÉ EL PREFIJO NO ES OPCIONAL: el proyecto Supabase está COMPARTIDO entre
-- agentes. Una tabla `estado_canal` sin prefijo la comparten todos los bots, y
-- entonces derivar a una persona en un negocio deja mudo al bot de otro si
-- coinciden los canal_id. database/nucleo-db.js se niega a conectarse si el
-- prefijo no está resuelto.

-- ─── Historial conversacional ────────────────────────────────────────────────
-- canal_id: E.164 sin "+" (WhatsApp) o "tg<chatId>" (Telegram).
create table if not exists {{PREFIJO}}_sesiones (
  canal_id    text primary key,
  messages    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ─── Estado de derivación a humano ───────────────────────────────────────────
-- modo_humano = true significa que hay una persona atendiendo y el bot NO habla.
-- humano_desde permite el retorno por timeout, que está APAGADO por defecto
-- (handoff.timeout_min = null): la derivación es definitiva salvo que el cliente
-- decida lo contrario.
--
-- agente_actual: con qué agente del flujo quedó esta conversación, cuando el
-- cliente declaró `flujo.agentes`. Vacío en un agente único, que es el default.
-- lead: lo que ya se sabe de la persona (`lead.campos`), para que el agente no
-- vuelva a preguntar lo que ya le dijeron — sobre todo al cambiar de agente.
--
-- Las columnas de acá tienen que coincidir con CAMPOS_ESTADO de
-- database/nucleo-db.js: un upsert con una columna que no existe falla entero, y
-- este es el camino por el que se marca modo_humano. La prueba de humo compara
-- las dos listas.
create table if not exists {{PREFIJO}}_estado_canal (
  canal_id        text primary key,
  modo_humano     boolean not null default false,
  humano_desde    timestamptz,
  motivo          text,
  fallos_seguidos integer not null default 0,
  agente_actual   text,
  lead            jsonb,
  updated_at      timestamptz not null default now()
);

-- ─── Métricas por turno ──────────────────────────────────────────────────────
-- Una fila por interacción. Registrar una métrica NUNCA puede romper una
-- respuesta al cliente: agent/metricas.js traga los errores a propósito. Y
-- justamente por eso las columnas de acá tienen que coincidir con la lista
-- CAMPOS de agent/metricas.js: un INSERT con una columna que no existe falla
-- entero, el error se traga, y la fila se pierde sin que nadie se entere hasta
-- mirar una tabla vacía. La prueba de humo compara las dos listas.
--
-- hito: hecho del NEGOCIO ocurrido en ese turno (agendó, calificó, no supe).
-- Lo marca una tool del cliente con metricas.marcarHito(canalId, 'agendo') y
-- los que importan se declaran en `metricas.hitos` de agente.config.json.
create table if not exists {{PREFIJO}}_metricas (
  id               bigserial primary key,
  ts               timestamptz not null default now(),
  canal_id         text,
  resultado        text,
  motivo           text,
  duracion_ms      integer,
  rondas_tool      integer,
  tools            jsonb,
  partes_agrupadas integer,
  reintentos       integer,
  tokens_entrada   integer,
  tokens_salida    integer,
  hito             text,
  agente           text
);

create index if not exists {{PREFIJO}}_metricas_ts_idx on {{PREFIJO}}_metricas (ts desc);
create index if not exists {{PREFIJO}}_metricas_canal_idx on {{PREFIJO}}_metricas (canal_id, ts);

-- ─── Si ya aplicaste una versión anterior de este archivo ────────────────────
-- `create table if not exists` NO agrega columnas a una tabla que ya existe:
-- corre esto. Es seguro correrlo aunque las columnas ya estén.
--
-- Del núcleo 1.4.0 (panel de métricas):
alter table {{PREFIJO}}_metricas add column if not exists tokens_entrada integer;
alter table {{PREFIJO}}_metricas add column if not exists tokens_salida  integer;
alter table {{PREFIJO}}_metricas add column if not exists hito           text;

-- Del núcleo 1.5.0 (flujo multi-agente y datos de la persona). Las dos de
-- estado_canal son OBLIGATORIAS aunque no uses el flujo: sin ellas, el día que
-- lo actives el upsert falla entero y con él la derivación a humano.
alter table {{PREFIJO}}_estado_canal add column if not exists agente_actual text;
alter table {{PREFIJO}}_estado_canal add column if not exists lead          jsonb;
alter table {{PREFIJO}}_metricas     add column if not exists agente        text;
