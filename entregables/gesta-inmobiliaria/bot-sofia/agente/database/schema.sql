-- Tablas del dominio de Gesta. Las tres del núcleo (sesiones, estado_canal,
-- metricas) salen de `npm run schema`, que ya les pone el prefijo.
--
-- TODA TABLA VA PREFIJADA: el proyecto Supabase está compartido entre los
-- agentes de la fábrica, y una tabla `visitas` sin prefijo mezcla los leads de
-- dos negocios distintos.
--
-- LAS PROPIEDADES NO ESTÁN ACÁ, y es a propósito: viven en la planilla de
-- Google que la corredora ya mantiene. Duplicarlas en una tabla sería pedirle
-- que cargue todo dos veces, y la copia de la base sería la que envejece.

-- Visitas que un interesado pidió coordinar.
create table if not exists gesta_sofia_visitas (
  id               bigserial primary key,
  canal_id         text not null,              -- teléfono del interesado (E.164 sin +)
  propiedad_id     text,                       -- código del link publicado
  propiedad_texto  text,                       -- cómo se la describió a la persona
  nombre           text,
  preferencia_1    text not null,              -- primera fecha/hora que propuso
  preferencia_2    text,                       -- segunda opción
  notas            text,
  creado_en        timestamptz not null default now()
);

create index if not exists gesta_sofia_visitas_canal on gesta_sofia_visitas (canal_id);
create index if not exists gesta_sofia_visitas_fecha on gesta_sofia_visitas (creado_en desc);

-- Propietarios que quieren vender o arrendar CON Gesta.
create table if not exists gesta_sofia_captaciones (
  id               bigserial primary key,
  canal_id         text not null,
  operacion        text,                       -- vender | arrendar
  region_metropolitana boolean not null,
  comuna           text,
  tipo             text,
  detalle          text,                       -- lo que contó la persona, tal cual
  nombre           text,
  creado_en        timestamptz not null default now()
);

create index if not exists gesta_sofia_captaciones_canal on gesta_sofia_captaciones (canal_id);
create index if not exists gesta_sofia_captaciones_fecha on gesta_sofia_captaciones (creado_en desc);
