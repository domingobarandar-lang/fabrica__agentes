# Vertical: Petshop / retail chico (abarrotes, mariscos, tienda de barrio)

**Base a clonar**: `chaski-agentes/agente-retail` (es exactamente este caso).

## Qué vende

Bot de catálogo y pedidos: el cliente pregunta por productos, arma su pedido conversando y lo deja listo para retiro o despacho. Dolor: el dueño atiende el WhatsApp entre medio de atender la caja, pierde pedidos y se equivoca en los encargos.

## Tools típicas

- `buscar_productos(consulta, categoria?)` — con stock y precio
- `agregar_al_pedido(producto, cantidad)` / `ver_pedido()` / `quitar_del_pedido(...)`
- `confirmar_pedido(nombre, telefono, retiro_o_despacho, direccion?)`
- `info_tienda()` — horarios, zonas de despacho, medios de pago

## Datos

Tablas: productos (nombre, categoría, precio, stock), pedidos, items_pedido. Semilla demo del rubro real del cliente: petshop → alimentos por marca/kilos, arena, antiparasitarios; abarrotes → lo básico.

## Personalización clave

- Respetar stock real: producto agotado se ofrece alternativa, nunca se promete.
- Total del pedido siempre visible al confirmar (monto en CLP + método de pago).
- En petshop preguntar mascota/tamaño cuando ayuda a recomendar (perro grande → saco 15kg).
- Despacho: validar zona ANTES de armar expectativa.

## QA mínimo

Pedido feliz multi-producto, producto sin stock, modificar pedido a mitad de camino, pregunta de precio suelto, dirección fuera de zona de despacho.

## Extras vendibles

Aviso "llegó tu marca" a clientes frecuentes, pedidos recurrentes ("lo de siempre"), reporte de productos más consultados sin stock (señal de compra).
