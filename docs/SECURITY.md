# Seguridad

No se almacenan contraseñas, cookies ni tokens. La autenticación debe ser manual en un navegador visible; 2FA y CAPTCHA nunca se automatizan. Logs estructurados van a stderr y no contienen texto fuente completo. El directorio de datos debe limitarse al usuario del sistema. Antes de una integración live debe añadirse secret scanning y revisión de dependencias.
