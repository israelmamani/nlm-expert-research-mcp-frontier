# NLM Expert Research MCP - Frontier

MCP para Claude Desktop que trata cada notebook como un corpus cerrado, conserva la procedencia de la evidencia y entrega capsulas compactas para razonar sobre fuentes verificables.

## Estado honesto

La rama de cierre usa por defecto `UpstreamNotebookLmAdapter`, que consume por stdio el transporte live no oficial de `@roomi-fields/notebooklm-mcp` 3.0.1. `NotebookLmBrowserAdapter` queda como fallback experimental propio y `NLM_ADAPTER=mock` solo para tests. La certificacion live y Claude Desktop se registran por separado en `docs/certification.json` y `docs/LIVE_CERTIFICATION.md`.

## Desarrollo

```powershell
npm install
npm test
npm run certify:local
npm run doctor
npm run setup-auth -- --force
npm run package:mcpb
```

El servidor stdio escribe exclusivamente JSON-RPC en stdout; logs van a stderr. El adaptador real se selecciona por defecto. `NLM_ADAPTER=mock` queda reservado para tests deterministas. La politica de Internet predeterminada es `LOCKED`: no se consulta la web externa salvo opt-in explicito. Google requiere Chrome real con perfil persistente; la ventana normal se oculta en Windows y la autenticacion permanece visible. Con `NLM_AUTO_REAUTH=1` (predeterminado), una expiracion confirmada abre una sola ventana visible de login, guarda la nueva sesion y reintenta la operacion original una vez.

## Herramientas MCP

`research`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `setup_auth`, `doctor`.

## Documentacion

Consulta `docs/` para arquitectura, autenticacion, instalacion Windows, modos, privacidad, testing, limitaciones y certificacion. No se declara produccion hasta superar las compuertas live y Claude Desktop.
