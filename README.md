# NLM Expert Research MCP — Frontier

MCP para Claude Desktop que trata cada notebook como un corpus cerrado, conserva la procedencia de la evidencia y entrega cápsulas compactas para que Claude razone sobre fuentes verificables.

## Estado honesto

La rama de cierre usa por defecto `UpstreamNotebookLmAdapter`, que consume por stdio el transporte live de `@roomi-fields/notebooklm-mcp` 3.0.1 (Patchright, perfil persistente, RPC con fallback DOM). `NotebookLmBrowserAdapter` queda como fallback experimental propio y `NLM_ADAPTER=mock` solo para tests. Consulte `THIRD_PARTY_NOTICES.md`.

## Desarrollo

```powershell
npm install
npm test
npm run doctor
npm run setup-auth -- --force
npm run package:mcpb
```

El servidor stdio escribe exclusivamente JSON-RPC en stdout; logs van a stderr. El adaptador real se selecciona por defecto. `NLM_ADAPTER=mock` queda reservado para tests deterministas. Google revoca la sesión de esta cuenta al automatizar Chrome headless, por lo que producción usa Chrome real con perfil persistente y oculta su ventana mediante la API nativa de Windows. `NLM_HIDE_BROWSER=0` permite mostrarla para diagnóstico. Con `NLM_AUTO_REAUTH=1` (predeterminado), una expiración confirmada abre una sola ventana visible de login, guarda la nueva sesión y reintenta la operación original una vez; `setup_auth` conserva el disparo manual.

## Herramientas MCP

`research`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `setup_auth`, `doctor`.

## Documentación

Consulta `docs/` para arquitectura, autenticación, instalación Windows, modos, privacidad, testing, limitaciones y certificación.
