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
create table if not exists {{PREFIJO}}_estado_canal (
  canal_id        text primary key,
  modo_humano     boolean not null default false,
  humano_desde    timestamptz,
  motivo          text,
  fallos_seguidos integer not null default 0,
  updated_at      timestamptz not null default now()
);

-- ─── Métricas por turno ──────────────────────────────────────────────────────
-- Una fila por interacción. Registrar una métrica NUNCA puede romper una
-- respuesta al cliente: agent/metricas.js traga los errores a propósito.
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
  reintentos       integer
);

create index if not exists {{PREFIJO}}_metricas_ts_idx on {{PREFIJO}}_metricas (ts desc);
