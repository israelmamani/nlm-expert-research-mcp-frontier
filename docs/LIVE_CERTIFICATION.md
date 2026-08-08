# Live Certification

Generated from `docs/certification.json`.

- Certified code SHA: `75b39515dd0a056b489600cc8afcee78652279a7`
- Attestation commit: `526e867970a365a1252a237907af6a85977d3554`
- Timestamp: 2026-08-08T20:11:12.760Z
- Verdict: **RELEASE_BLOCKED**

## Local gates

- build: **PASS**
- tests: **PASS**
- integrity: **PASS**
- secrets: **PASS**
- audit: **PASS**

## Live gates

- auth: **NOT_RUN**
- persistence: **NOT_RUN**
- enumeration: **NOT_RUN**
- grounded_query: **NOT_RUN**
- citations: **NOT_RUN**
- dynamic_notebook: **NOT_RUN**
- dynamic_source: **NOT_RUN**
- delete_invalidation: **NOT_RUN**
- rename: **NOT_RUN**
- locked_engine: **BLOCKED**

## Claude Desktop

- mcpb: **NOT_RUN**
- tools: **NOT_RUN**
- natural_invocation: **NOT_RUN**
- same_session_discovery: **NOT_RUN**
- browser_invisible: **NOT_RUN**

## Blocking gates

- `live.locked_engine`
- `live.auth`
- `live.persistence`
- `live.enumeration`
- `live.grounded_query`
- `live.citations`
- `live.dynamic_notebook`
- `live.dynamic_source`
- `live.delete_invalidation`
- `claude_desktop.mcpb`
- `claude_desktop.tools`
- `claude_desktop.natural_invocation`
- `claude_desktop.same_session_discovery`
- `claude_desktop.browser_invisible`

MCPB SHA-256: `NOT_BUILT`

## Open P1

- `live.locked_engine.notebooklm_transport`: The deterministic live candidate could not create its disposable notebook after three empty notebook listings; upstream UI navigation timed out at `page.waitForURL`.
