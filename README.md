# NLM Expert Research MCP — Frontier

MCP para Claude Desktop que trata cada notebook como un corpus cerrado, conserva la procedencia de la evidencia y entrega cápsulas compactas para que Claude razone sobre fuentes verificables.

## Estado honesto

La versión `0.1.0` es un release candidate de software con adaptador local determinista y contrato preparado para un transporte de navegador. El transporte real de NotebookLM requiere autenticación Google interactiva y validación contra la UI actual; no se reporta como live E2E hasta ejecutar esa validación en la máquina del usuario.

## Desarrollo

```powershell
npm install
npm test
npm run doctor
npm run package:mcpb
```

El servidor stdio escribe exclusivamente JSON-RPC en stdout; logs van a stderr. El adaptador local se selecciona por defecto. `NLM_ADAPTER=browser` falla cerrado hasta configurar el transporte real.

## Herramientas MCP

`research`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `doctor`.

## Documentación

Consulta `docs/` para arquitectura, autenticación, instalación Windows, modos, privacidad, testing, limitaciones y certificación.
