# Estado certificado — 2026-08-08

Fuentes consultadas: [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/), [Claude Desktop Extensions/MCPB](https://www.anthropic.com/engineering/desktop-extensions), [Claude local MCP](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [NotebookLM Help](https://support.google.com/notebooklm/answer/16179559), [source management](https://support.google.com/notebooklm/answer/16215270), [PleasePrompto/notebooklm-mcp](https://github.com/PleasePrompto/notebooklm-mcp), [roomi-fields/notebooklm-mcp](https://github.com/roomi-fields/notebooklm-mcp).

MCP ofrece SDK TypeScript y transporte stdio. Claude Desktop soporta bundles `.mcpb` con `manifest.json`; este proyecto usa el esquema 0.3. NotebookLM documenta chat grounded, citas y selección de fuentes, pero no se identificó una API pública oficial para este producto. El transporte real permanece no oficial y aislado detrás de `UpstreamNotebookLmAdapter`.

Dependencias auditadas: MCP SDK `1.30.x`, `@roomi-fields/notebooklm-mcp` `3.0.1`, TypeScript 5.9, Node types 22 y Zod 3. `npm audit --omit=dev` y el árbol de producción del MCPB reportan 0 vulnerabilidades. El código MIT reutilizado se atribuye en `THIRD_PARTY_NOTICES.md`.

Decisiones: Node/TypeScript para MCPB y Windows; registro JSON durable sin dependencia nativa; caché nunca autoritativo; fuentes se refrescan de forma dirigida mediante `content_list`; internet separado de evidencia canónica; ningún bypass de autenticación, CAPTCHA o 2FA. Producción usa Chrome real porque Google revocó repetidamente las sesiones headless de la cuenta certificada, pero oculta su ventana con `ShowWindowAsync(SW_HIDE)` mediante un watcher Win32 ligado al proceso upstream. El postinstall aplica tres parches reproducibles al upstream: soporte del host actual `notebook.google.com` al crear notebooks, arranque visible minimizado y cesión inmediata de la recuperación de sesión expirada a Frontier.

Compuertas superadas en vivo:

- Autenticación forzada con perfil persistente y verificación después de reiniciar el transporte.
- Enumeración de 22 notebooks reales.
- Consulta grounded con citas estructuradas.
- Ciclo dinámico en el mismo proceso: crear notebook, descubrirlo por refresh-on-miss, añadir e indexar fuente, responder un dato determinista con citas, borrar y confirmar `NOTEBOOK_NOT_FOUND`.
- Motor Frontier `STANDARD`: cápsula bloqueada al corpus, dos consultas, evidencia enlazada y cero evidencia externa.
- Modo invisible certificado: ocho procesos Chrome headful, cero ventanas visibles y consulta live grounded aprobada; la autenticación interactiva permanece visible deliberadamente. Ante expiración inequívoca, Frontier abre una sola ventana, guarda el perfil y reintenta la operación una vez sin bucles.
- Suite local 13/13, incluyendo recuperación, cancelación, concurrencia y progreso MCP de autenticación; soak de 100 investigaciones y compuerta stdio del staging MCPB (`initialize`, siete herramientas y `doctor`).
- Bundle validado por `@anthropic-ai/mcpb` 2.1.2; SHA-256 registrado junto al artefacto de release.
