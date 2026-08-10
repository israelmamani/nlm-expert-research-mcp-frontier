# Troubleshooting

- `AUTH_REQUIRED` or `AUTH_FAILED`: run `npm run setup-auth -- --force`, complete Google login/2FA, and wait for normal exit.
- `REMOTE_DISCOVERY_UNAVAILABLE`: NotebookLM could not be enumerated. Known cached notebooks remain explicitly stale; unknown notebooks are not reported as missing.
- `REMOTE_SOURCE_LIST_UNAVAILABLE`: the authoritative RPC metadata path failed or returned no source ID. Frontier will not fall back to DOM scraping.
- `CREATE_NOT_CONFIRMED`, `SOURCE_INGESTION_NOT_CONFIRMED`, or `DELETE_NOT_CONFIRMED`: remote state could not confirm an uncertain mutation. Inspect NotebookLM before repeating it manually.
- `UPSTREAM_TRANSPORT_UNSTABLE`: the operation stalled after its one bounded recovery. Preserve logs and do not loop retries.
- Claude shows no tools: remove legacy NotebookLM MCP entries, reinstall the exact MCPB, restart Claude Desktop, and inspect Claude's MCP logs.
- Chrome appears during ordinary research: verify `NLM_HIDE_BROWSER=1`. Authentication windows are intentionally visible.

Run `npm run doctor`, `npm test`, and `npm run check:package` before reporting an issue. Never attach the `.data` directory or Chrome profile to a public issue.
