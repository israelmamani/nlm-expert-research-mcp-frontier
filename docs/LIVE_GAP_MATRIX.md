# Live gap matrix

| Requisito | Implementacion | Estado de certificacion |
|---|---|---|
| Transporte real NotebookLM | `UpstreamNotebookLmAdapter` 3.0.1 | IMPLEMENTED / NOT_CERTIFIED |
| Perfil persistente y recuperacion | `src/upstream-adapter.ts`, `src/auth-recovery.ts` | IMPLEMENTED / NOT_CERTIFIED |
| Enumeracion y refresh-on-miss | `NotebookRegistry` | MOCK_TESTED / LIVE_PENDING |
| Fuentes y citas | `src/browser-adapter.ts` | IMPLEMENTED / LIVE_PENDING |
| Contraevidencia | pasada `counter` en `ResearchEngine` | LOCAL_TESTED / LIVE_PENDING |
| Politica de Internet | `LOCKED` por defecto + sanitizacion | LOCAL_TESTED |
| Persistencia | `Store.update`, backup y rename atomico | LOCAL_TESTED |
| MCPB | staging instala dependencias de produccion | PACKAGE_VALIDATED / INSTALL_PENDING |
| Claude Desktop E2E | requiere cliente y login humanos | NOT_RUN |

Los tests mock no constituyen evidencia live. La fuente de verdad de la certificacion es `docs/certification.json`.
