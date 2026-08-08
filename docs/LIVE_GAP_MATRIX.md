# Live gap matrix — audit branch

| Requirement | Status | Evidence |
|---|---|---|
| Real browser transport | IMPLEMENTED_REAL / UNTESTED_AUTH | `src/browser-adapter.ts`; `npm run doctor` reached NotebookLM and returned `AUTH_REQUIRED` |
| Persistent profile | IMPLEMENTED_REAL / UNTESTED_AUTH | Playwright `launchPersistentContext`, dedicated lock/profile |
| Notebook listing | IMPLEMENTED_REAL / UNTESTED_AUTH | DOM enumeration with URL/ID extraction |
| Refresh-on-miss | IMPLEMENTED_REAL / UNTESTED_AUTH | registry calls adapter live on miss |
| Source listing | IMPLEMENTED_REAL / UNTESTED_AUTH | `.single-source-container` extraction |
| Q&A wait | IMPLEMENTED_REAL / UNTESTED_AUTH | bounded stability polling |
| Citations | IMPLEMENTED_REAL / UNTESTED_AUTH | citation marker + highlighted passage extraction |
| Citation verification | PARTIAL | deterministic token-overlap classification; no second model |
| Internet challenger | IMPLEMENTED_REAL / UNTESTED_NETWORK | opt-in DuckDuckGo candidate retrieval, quarantined |
| Token governor | PARTIAL | bounded capsule fields and `get_evidence`; no configurable token estimator |
| Atomic persistence | IMPLEMENTED_REAL | temp write, backup and corruption recovery |
| MCPB dependency bundling | IMPLEMENTED_REAL / INSTALL_UNTESTED | staging installs production dependencies |
| Claude Desktop E2E | NOT_TESTED | requires local Claude Desktop interaction |

Mocks remain test-only and are not evidence for live gates.
