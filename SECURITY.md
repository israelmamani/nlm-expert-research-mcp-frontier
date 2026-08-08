# Security

The dedicated Chrome profile contains authentication cookies and must be treated as a secret. It is excluded from Git and MCPB packaging. Frontier never logs passwords, cookies, token values, full source text, or full prompts; public certification records contain only gate results and non-sensitive measurements.

The upstream dependency is pinned to `3.0.1`, lock integrity is verified, and every postinstall patch is checked by the release-integrity gate. Mutation RPCs are never automatically replayed after an uncertain result. Creation, source ingestion, and deletion reconcile remote state and fail closed when confirmation is absent.

CI runs build/tests on Node 20 and 22, dependency audit, patch/attestation integrity, secret scan, and MCPB manifest/package sanity. Report vulnerabilities privately to the repository owner before public disclosure.
