# Estado investigado — 2026-08-07

Fuentes consultadas: [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/), [Claude Desktop Extensions/MCPB](https://www.anthropic.com/engineering/desktop-extensions), [Claude local MCP](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [NotebookLM Help](https://support.google.com/notebooklm/answer/16179559), [source management](https://support.google.com/notebooklm/answer/16215270), [PleasePrompto/notebooklm-mcp](https://github.com/PleasePrompto/notebooklm-mcp), [roomi-fields/notebooklm-mcp](https://github.com/roomi-fields/notebooklm-mcp).

MCP ofrece SDK TypeScript y transportes stdio/Streamable HTTP. Claude Desktop soporta extensiones empaquetadas `.mcpb`. NotebookLM documenta chat grounded, citas y selección de fuentes, pero no se identificó una API pública oficial para este producto. Los proyectos comunitarios encontrados conducen un navegador persistente y son no oficiales; por tanto el transporte real se mantiene aislado y experimental.

Decisiones: Node/TypeScript para compatibilidad MCPB y Windows; registro JSON durable sin dependencia nativa de SQLite para reducir fricción de instalación, documentado como desviación; cache nunca autoritativo; internet separado de evidencia canónica; ningún bypass de autenticación, CAPTCHA o 2FA.
