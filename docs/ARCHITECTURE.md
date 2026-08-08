# Arquitectura

`MCP server → ResearchEngine → NotebookRegistry → NotebookAdapter`.

El registro acelera resolución y perfiles, pero cada miss fuerza `listNotebooks()` remoto. El motor compila subconsultas limitadas por modo, ejecuta consultas independientes concurrentemente, crea claims/evidence/conflicts/gaps y guarda sesiones. Las capas de evidencia son canónicas, externas verificadas/candidatas e inferencia.

El adaptador `MockNotebookAdapter` permite tests deterministas. `BrowserNotebookAdapter` es un fail-closed boundary para integrar Playwright/persistent context cuando se valide la UI; no finge capacidades.
