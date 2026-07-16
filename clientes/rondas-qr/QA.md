# QA — Rondas QR

**Fecha**: 2026-07-16 · **Resultado**: ✅ 12/12 escenarios automatizados en verde + smoke test manual en navegador. Todo en MOCK, $0 gastado, cero llamadas externas.

## Suite automatizada (`npm test`)

| Escenario | Casos del SPEC | Resultado |
|---|---|---|
| Login correcto / PIN malo | CU-01 | ✅ |
| API exige token válido | (adversarial) | ✅ |
| Paquete de rondas descargable con puntos y payloads | CU-02 | ✅ |
| Ronda completa en orden → informe `completa` + notificación sin alerta | CU-03, CU-04, CU-09 | ✅ |
| QR basura / de otro condominio / punto fuera de la ronda → rechazados | CU-05 | ✅ |
| Duplicado conserva el primero y avisa | CU-06 | ✅ |
| Código corto manual (minúsculas incluidas) | CU-13 | ✅ |
| Cierre con faltantes → `INCOMPLETA` + aviso "⚠️ ALERTA" con los puntos | CU-08, CU-10 | ✅ |
| Reenvío offline idempotente (iniciar 2 veces, ts del teléfono, flag offline) + observaciones de duración | CU-07 | ✅ |
| Orden estricto violado → `completa_obs` con el punto exacto | CU-08 | ✅ |
| CRUD admin de puntos/guardias/rondas + validaciones (PIN malo, usuario duplicado, punto ajeno) | CU-11 | ✅ |
| Hoja de QR: un PNG embebido por punto | CU-12 | ✅ |
| Aislamiento entre condominios (rondas, escaneos, informes, puntos) | CU-14 | ✅ |
| Guardia ajeno no toca la ejecución de otro; guardia no entra al panel | (adversarial) | ✅ |
| Cierre administrativo de ronda olvidada; cierre repetido inocuo; escaneo tras cierre → 409 | CU-08 (adversarial) | ✅ |

(15 verificaciones agrupadas en 12 tests de `test/rondas.test.js`.)

## Smoke test en navegador (servidor real, `npm run demo`)

1. Login guardia `pedro` → paquete descargado visible (2 rondas con reglas). ✅
2. Service worker registrado y controlando; jsQR cargado desde `/vendor`. ✅
3. Ronda "Perimetral express": 2 marcas manuales (una en minúsculas), código inválido rechazado con aviso, duplicado avisado; progreso 2/4. ✅
4. Cierre incompleto: pantalla final "⚠️ Ronda INCOMPLETA" con Piscina y Acceso trasero como faltantes; cola sincronizada a 0. ✅
5. Panel admin (`marta`): informe listado `INCOMPLETA 2/4`; pestaña Avisos muestra la notificación mock con "⚠️ ALERTA". ✅
6. Hoja de QR: 8 tarjetas con PNG renderizado. ✅
7. **Round-trip de QR**: el PNG de Portería decodificado con jsQR (el mismo motor del teléfono) devuelve exactamente `RQR:aromos:p-porteria:PRT234`. ✅

## No probado en esta pasada (requiere hardware real)

- Cámara física del teléfono (getUserMedia) — el pipeline de decodificación quedó verificado con el round-trip anterior; la captura de cámara se prueba en el teléfono de José en la revisión (DEMO.md, paso 3).
- Notificación Telegram real — queda en MOCK hasta que José apruebe activarla (token 2 del pool ya está en el `.env`, falta solo `MOCK=false` + chat_id del admin).

## Bugs encontrados y corregidos durante QA

- `npm test` con `node --test test/` no resuelve en Windows → script cambiado a `node --test` (autodescubre `test/`). Sin otros hallazgos: la suite pasó completa a la primera tras ese ajuste.
