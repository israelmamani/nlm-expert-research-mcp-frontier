# Estado investigado

El transporte NotebookLM es no oficial y depende de `@roomi-fields/notebooklm-mcp` 3.0.1. Frontier lo mantiene aislado detras de un adapter, con parche de compatibilidad validado en `scripts/check-release-integrity.mjs`.

Estados que no deben mezclarse:

- `IMPLEMENTED`: existe codigo para la capacidad.
- `TESTED`: existe una prueba reproducible local o mock.
- `CERTIFIED`: existe evidencia live para el SHA de codigo indicado en `docs/certification.json`.

Decisiones de V1:

- `LOCKED` es la politica de Internet predeterminada.
- Las consultas externas requieren opt-in y pasan por sanitizacion; sus resultados son `CANDIDATE_EXTERNAL` y `UNVERIFIED`.
- Las escrituras del registro se serializan dentro del proceso mediante `Store.update`.
- Los claims solo reciben evidencia especifica; la negacion incompatible falla cerrada.
- La contraevidencia se consulta como pasada separada y se conserva en `counterEvidenceIds`.
- No se automatizan contrasenas, 2FA ni CAPTCHA.

La certificacion live, persistencia de autenticacion, dynamic discovery y Claude Desktop permanecen pendientes hasta ejecutarse con credenciales humanas. La fuente de verdad es `docs/certification.json`; el Markdown se genera con `node scripts/generate-certification-ledger.mjs`.
