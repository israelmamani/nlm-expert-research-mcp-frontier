# NLM Expert Research MCP — Frontier

MCP para Claude Desktop que trata cada notebook como un corpus cerrado, conserva la procedencia de la evidencia y entrega cápsulas compactas para que Claude razone sobre fuentes verificables.

## Estado honesto

La rama de cierre incorpora un adaptador real `NotebookLmBrowserAdapter` basado en Playwright, perfil persistente y selectores resistentes. Requiere login Google manual y validación live contra la cuenta/instalación de NotebookLM del usuario; ningún gate live se reporta como PASS desde mocks.

## Desarrollo

```powershell
npm install
npm test
npm run doctor
npm run package:mcpb
```

El servidor stdio escribe exclusivamente JSON-RPC en stdout; logs van a stderr. El adaptador real se selecciona por defecto. `NLM_ADAPTER=mock` queda reservado para tests deterministas.

## Herramientas MCP

`research`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `doctor`.

## Documentación

Consulta `docs/` para arquitectura, autenticación, instalación Windows, modos, privacidad, testing, limitaciones y certificación.
