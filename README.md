# NLM Expert Research MCP — Frontier

Frontier is a Windows-first Claude Desktop MCP that researches one authenticated NotebookLM notebook at a time and returns compact, source-locked evidence capsules. Its default Internet policy is `LOCKED`; external search requires explicit opt-in and is kept separate from canonical notebook evidence.

## Release status

The published certification state is authoritative: see `docs/certification.json` and `docs/LIVE_CERTIFICATION.md`. A green local suite is not presented as live or Claude Desktop certification.

Frontier pins `@roomi-fields/notebooklm-mcp` exactly to `3.0.1` and applies reproducible postinstall patches for current host compatibility, citation/source provenance, RPC-only metadata, mutation safety, authentication ownership, and bounded browser lifecycle. NotebookLM has no official public API for these operations; upstream changes can still require a compatibility update.

## Quick start

```powershell
npm ci
npm test
npm run setup-auth -- --force
npm run certify:live
npm run package:mcpb
```

Google login, 2FA, and CAPTCHA are always completed by the user in a visible Chrome window. Normal research runs use a dedicated persistent Chrome profile and hide only Frontier-owned browser windows on Windows.

## Public MCP tools

`research`, `list_notebooks`, `list_sources`, `health`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `setup_auth`, and `doctor`.

The upstream MCP remains an internal transport; its low-level tools are not exposed to Claude. The server writes JSON-RPC only to stdout and structured logs to stderr.

## Development and release gates

```powershell
npm run certify:local
npm run check:package
npm audit --omit=dev --audit-level=high
npm run scan:secrets
```

`npm run certify:live` creates and deletes a disposable `FRONTIER-CERT-*` notebook, adds deterministic text, verifies citations and claim linkage over five runs, performs a ten-query soak, tests persistence and invalidation, then checks clean shutdown. It must never be substituted with mocks.

See [INSTALL.md](INSTALL.md), [CLAUDE_DESKTOP.md](CLAUDE_DESKTOP.md), [AUTH.md](AUTH.md), [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [OPERATIONS.md](OPERATIONS.md), and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
