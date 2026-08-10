# Live Certification

Generated from `docs/certification.json`. No gate defaults to PASS.

- Product version: `1.0.0`
- Certified code SHA: `62076639d8972b7b13596c33907e887dfbaa35d8`
- Attestation commit: `PENDING_ATTESTATION_COMMIT`
- Generated from HEAD: `62076639d8972b7b13596c33907e887dfbaa35d8`
- Timestamp: 2026-08-10T16:34:42.415Z
- NotebookLM live ready: **YES**
- Claude Desktop ready: **YES**
- Verdict: **PRODUCTION_READY_WITH_EXTERNAL_DEPENDENCIES**

## Local gates

- build: **PASS**
- tests: **PASS**
- integrity: **PASS**
- secrets: **PASS**
- audit: **PASS**
- package_sanity: **PASS**

## Targeted stability

- status: **PASS**
- runs: **5**
- citation_linkage: **5/5**
- semantic_verified: **5/5**
- external_leakage: **0/5**
- wrong_assignment: **0/5**
- stalls: **0**
- recoveries: **0**
- orphan_processes: **0**

## Soak

- status: **PASS**
- queries: **10**
- success: **10**
- fail: **0**
- stalls: **0**
- recoveries: **0**
- median_ms: **10514**
- max_ms: **14128**

## Backend live gates

- auth: **PASS**
- persistence: **PASS**
- enumeration: **PASS**
- grounded_query: **PASS**
- citations: **PASS**
- claim_linkage: **PASS**
- dynamic_notebook: **PASS**
- dynamic_source: **PASS**
- delete_invalidation: **PASS**
- locked_engine: **PASS**
- clean_shutdown: **PASS**

## Claude Desktop

- mcpb_installation: **PASS**
- server_startup: **PASS**
- tool_enumeration: **PASS**
- natural_invocation: **PASS**
- same_session_discovery: **PASS**
- grounded_query: **PASS**
- citation_correctness: **PASS**
- browser_invisible: **PASS**
- auth_persistence: **PASS**

## MCPB

- build: **PASS**
- validation: **PASS**
- filename: **NLM-Expert-Research-MCP-Frontier-1.0.0.mcpb**
- sha256: **A963E4439A3E19B347100920732FA14771D1A116462D73441DA0554F77619067**

## Blocking gates

- None

## Open defects

- P0: None
- P1: None
