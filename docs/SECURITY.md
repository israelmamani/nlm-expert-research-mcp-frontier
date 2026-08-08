# Seguridad

No se almacenan contrasenas, cookies ni tokens. La autenticacion debe ser manual en un navegador visible; 2FA y CAPTCHA nunca se automatizan. Logs estructurados van a stderr y no contienen texto fuente completo. El directorio de datos debe limitarse al usuario del sistema. CI ejecuta `npm audit --omit=dev --audit-level=high`, `npm run check:integrity` y `npm run scan:secrets`. La certificacion publica nunca incluye perfiles, cookies, rutas personales ni texto privado.
