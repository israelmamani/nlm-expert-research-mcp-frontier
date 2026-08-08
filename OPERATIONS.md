# Operations

Use `npm run doctor` for passive diagnostics. Use `npm run setup-auth -- --force` only when establishing or deliberately replacing authentication. Use `npm run certify:live` for the destructive-but-contained certification lifecycle; it creates and deletes only a uniquely named `FRONTIER-CERT-*` notebook.

Absolute operation budgets are 60 seconds for health/list, 90 seconds for source metadata, 180 seconds for queries, and 240 seconds for mutations. Progress notifications do not extend deadlines. A genuine transport stall may restart once; a second stall returns `UPSTREAM_TRANSPORT_UNSTABLE`. Mutations are not replayed.

Normal shutdown closes the MCP transport, its upstream Node process tree, the exact Frontier-profile Chrome processes, and the Frontier window-hide watcher. Unrelated user Chrome processes are outside scope.

Release evidence lives in `docs/certification.json`; no field defaults to PASS. The attestation commit may change only `docs/certification.json` and `docs/LIVE_CERTIFICATION.md` after the certified code SHA.
