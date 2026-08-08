# Architecture

```text
Claude Desktop
  → Frontier MCP server
    → ResearchEngine
      → NotebookRegistry
        → NotebookAdapter
          → pinned NotebookLM upstream transport
            → authenticated NotebookLM RPCs
```

The registry is a cache, never the remote authority. Cache misses refresh live state; known cached items are marked `catalog_stale` when remote discovery is unavailable, while unknown items fail with `REMOTE_DISCOVERY_UNAVAILABLE` rather than false `NOT_FOUND`.

Notebook and source metadata use RPC-only paths. Mutations use RPC-only guards, are not retried by the upstream batch client, and are reconciled from remote state after uncertain timeouts. Research queries are serialized on the long-lived adapter so a watchdog restart cannot disrupt sibling calls.

The ResearchEngine separates canonical, counter, and optional external evidence; links claims only through explicit markers or material excerpt matches; fails closed on missing evidence; and returns mode-bounded capsules. Deeper stored evidence is retrieved by `get_evidence`.
