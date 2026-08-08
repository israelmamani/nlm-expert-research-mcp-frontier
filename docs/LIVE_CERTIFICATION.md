# Live Certification

Generated from `docs/certification.json`.

- Certified code SHA: `728cad207b0975f49413044147d2d4c8dd59f43b`
- Attestation commit: `ccf6774dc13fe0dc2e9320250c096f7bcb857d1f`
- Timestamp: 2026-08-08T19:36:02.814Z
- Verdict: **RELEASE_BLOCKED**

## Local gates

- build: **PASS**
- tests: **PASS**
- integrity: **PASS**
- secrets: **PASS**
- audit: **PASS**

## Live gates

- auth: **PASS**
- persistence: **PASS**
- enumeration: **PASS**
- grounded_query: **PASS**
- citations: **PASS**
- dynamic_notebook: **PASS**
- dynamic_source: **PASS**
- delete_invalidation: **PASS**
- rename: **NOT_RUN**
- locked_engine: **FAIL**

## Claude Desktop

- mcpb: **NOT_RUN**
- tools: **NOT_RUN**
- natural_invocation: **NOT_RUN**
- same_session_discovery: **NOT_RUN**
- browser_invisible: **NOT_RUN**

## Blocking gates

- `live.locked_engine`
- `claude_desktop.mcpb`
- `claude_desktop.tools`
- `claude_desktop.natural_invocation`
- `claude_desktop.same_session_discovery`
- `claude_desktop.browser_invisible`

MCPB SHA-256: `NOT_BUILT`

## Open P1

- `live.locked_engine.claim_evidence_linkage`: The live LOCKED capsule returned cited evidence but no claim-to-evidence link in two full certification runs; an isolated retry passed.
