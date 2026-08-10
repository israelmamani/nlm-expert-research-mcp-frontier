# Architecture

See the canonical current architecture in [../ARCHITECTURE.md](../ARCHITECTURE.md). Research calls on the shared long-lived adapter are serialized, metadata is RPC-only, and remote discovery failures are distinct from not-found results.
