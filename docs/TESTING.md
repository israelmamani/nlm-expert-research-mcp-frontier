# Testing

`npm test` ejecuta tests locales deterministas: cache miss, rename/delete, evidence capsule, aislamiento, gate de internet, recuperación atómica y 100 investigaciones secuenciales. `npm run test:live` solo se habilita con `NLM_LIVE_TEST=1`; exige sesión real y no convierte mocks en live. Live NotebookLM, auth persistence, Claude Desktop y MCPB install requieren interacción externa.
