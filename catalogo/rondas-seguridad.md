# Vertical: rondas-seguridad (condominios y edificios)

**Cliente típico**: administrador de condominio/edificio con guardias que hacen rondas nocturnas; hoy controla con botones físicos (iButton/"chapitas") y una lectora que se descarga a mano en un PC.

**Dolor**: el administrador se entera tarde (o nunca) de rondas incompletas; la lectora es cara, se pierde, y el informe hay que armarlo a mano.

**Producto de la fábrica**: app de rondas con QR.
- Puntos de control = láminas QR impresas por sector (se generan desde el panel, costo de reposición ~$0 vs chapitas).
- El guardia usa su teléfono: PWA con la ronda descargada (funciona sin señal, sincroniza al volver la conexión).
- Informe automático al administrador al cerrar cada ronda, con alerta si se saltó un punto, si el orden no se respetó o si tomó demasiado tiempo.
- Notificación opcional por Telegram al administrador.

**Sin LLM en runtime**: flujo determinista, costo por uso $0. El valor está en el control y el informe, no en conversación.

**Datos que pide al cliente**: nombre del condominio, lista de sectores/puntos, nómina de guardias, definición de rondas (qué puntos, en qué orden, cada cuánto, duración máxima).

**Referencia construida**: `clientes/rondas-qr/` (primera implementación, 2026-07-16).
