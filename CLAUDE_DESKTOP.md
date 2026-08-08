# Claude Desktop

Frontier should be installed from the exact `.mcpb` produced by `npm run package:mcpb`. Remove or disable any legacy `notebooklm`, `notebooklm-mcp`, or `npx ...@latest` entry first so Claude cannot select a different server.

After installation, restart Claude Desktop once and verify these ten tools: `research`, `list_notebooks`, `list_sources`, `health`, `notebook_resolve`, `notebook_refresh`, `get_evidence`, `compare_notebooks`, `setup_auth`, and `doctor`.

Certification must use natural prompts, not explicit tool calls. With Claude still open, create a disposable `FRONTIER-CERT-*` notebook through the certified backend, add deterministic text, and ask Claude about it without restarting. Confirm same-session discovery, grounded content, correct citations, persisted authentication, and that Frontier's Chrome window neither appears nor steals focus during normal queries.

Authentication is the exception: `setup_auth` intentionally opens a visible window for manual Google login and 2FA.
