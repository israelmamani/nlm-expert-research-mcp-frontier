# Autenticación

`npm run setup-auth` ejecuta el flujo deliberado con `launchPersistentContext` y el perfil dedicado `.data/browser-profile` (o `NLM_BROWSER_PROFILE`). Abra la ventana visible, inicie sesión manualmente, complete 2FA y espere la verificación de NotebookLM. Nunca introduzca credenciales en variables del MCP. Las siguientes ejecuciones reutilizan el perfil; si caduca, el adapter devuelve `AUTH_REQUIRED`.
