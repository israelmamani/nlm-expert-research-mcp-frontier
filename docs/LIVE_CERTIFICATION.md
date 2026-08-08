# Live Certification

Generated from `docs/certification.json`.

- Certified code SHA: `503be3110693e03069879bbb881e59ec563da480`
- Attestation commit: `5c6937b2409aeebe53b9922906e0c7502e9b53d9`
- Timestamp: 2026-08-08T18:33:56.768Z
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
- dynamic_source: **FAIL**
- delete_invalidation: **NOT_RUN**
- rename: **NOT_RUN**

## Claude Desktop

- mcpb: **NOT_RUN**
- tools: **NOT_RUN**
- natural_invocation: **NOT_RUN**
- same_session_discovery: **NOT_RUN**
- browser_invisible: **NOT_RUN**

## Blocking gates

- `live.auth`
- `live.persistence`
- `live.enumeration`
- `live.grounded_query`
- `live.citations`
- `live.dynamic_notebook`
- `live.dynamic_source`
- `claude_desktop.mcpb`
- `claude_desktop.natural_invocation`
- `claude_desktop.same_session_discovery`
- `claude_desktop.browser_invisible`

MCPB SHA-256: `0532BEE7A5966EBAF744C9D2A6351B5151A0A414481B32B9FFFD2AB5A522D50C`
