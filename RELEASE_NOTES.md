# NLM Frontier V1.0.0 release notes

NLM Frontier is a Windows-first Claude Desktop MCP for research grounded in one authenticated NotebookLM notebook at a time.

## Highlights

- Live, dynamic NotebookLM notebook discovery, including same-session discovery after a new notebook is created.
- Source-grounded research with structured claim-to-evidence and citation linkage.
- `LOCKED` is the default corpus policy; external information requires an explicit, separated opt-in.
- RPC-first notebook metadata and source handling, with authoritative source IDs and fail-closed mutation reconciliation.
- Persistent Google authentication profile with bounded recovery, a transport watchdog, single safe recovery, and circuit breaker.
- Exact Windows process-tree cleanup and a Frontier-owned browser runtime that remains hidden during normal queries.
- Claude Desktop MCPB installation, natural tool invocation, grounded responses, and same-session catalog refresh.

## Security and privacy

The package excludes runtime data, credentials, Chrome profiles, logs, screenshots, test artifacts, and Git metadata. Frontier does not store Google passwords and redacts operational logs. Canonical research evidence remains separated from optional external information.

## External dependency disclosure

NotebookLM and Google authentication remain external dependencies. This personal integration uses an unofficial NotebookLM transport with browser-based authentication; it does not use an official public Google NotebookLM API. Upstream NotebookLM changes, Google sign-in controls, or account access can affect availability.
