---
name: agentstack-8dna
description: Applies AgentStack 8DNA (JSON+): structured JSON data model with built-in support for variants (e.g. A/B tests). Use when the user mentions data store, database, structured data, A/B tests, experiments, or design of AgentStack data (data/config/protected).
---

# AgentStack 8DNA — JSON+ (Structured JSON and Built-in Variants)

**8DNA is AgentStack's data model (JSON+):** structured JSON storage with built-in support for organizing data and running variants (e.g. A/B tests). Business data and config live in `data` (and `data.config`); secrets live in `protected`.

**Data store (the "database"):** Each project and each user has a JSON document. Nested leaves: MCP `projects.patch_data` / `projects.get_data` with `write_mode` (REST `PATCH /api/projects/{id}/data`). `projects.update_project` is name/settings only. Key-value `GET/POST /api/dna/data` is the same leaf SET. See repo **docs/architecture/DNA_KEY_VALUE_API.md**.

**What you can do with JSON+:** Store all business data and public config in `data` (with optional `data.config`); keep secrets in `protected`; use dot-notation keys for consistent access; use built-in support for variants (e.g. A/B tests). APIs and MCP operate on this same structure.

## When to use

- User asks where data is stored or how to use the database.
- User mentions structured data, config, or design of AgentStack `data` / `config` / `protected`.
- User asks about A/B tests, experiments, or variants.
- Design or code reviews of AgentStack data and config structure.

## Capabilities

- **Structure (`data` / `protected`):** All business data and public config in `data` (e.g. `data.config`, `data.system.config`); sensitive data only in `protected` (keys, secrets), never logged or exposed. Dot-notation keys (e.g. `config.webhooks.timeout_ms`, `config.permissions.read`) for consistent access.
- **Built-in variants:** JSON+ supports organizing data and running variants (e.g. A/B tests). For advanced usage see repo docs.

## Instructions

1. Store business data and config in `data` (and `data.config`); never put secrets in `data` — use `protected` and documented key paths.
2. Use dot-notation keys in `data` and `config` for consistency.
3. For "where is the database?" or "how do I read/write?": use `projects.patch_data` / `projects.get_data` (`write_mode` replace|merge|delete) or REST `PATCH /projects/{id}/data`. `projects.update_project` is name/settings only.
4. For A/B tests or variants: JSON+ has built-in support; refer the user to repo docs for details.

## Examples

- **"Where is data stored?"** → Project and user each have a JSON document (`project.data`, `user.data`). Nested leaves: `projects.patch_data` (`write_mode`). See DNA_KEY_VALUE_API in repo.
- **"Store project config"** → Use `projects.patch_data` with path `config.<path>` and `write_mode=merge` or `replace`.
- **"A/B tests or experiments?"** → JSON+ supports variants (e.g. A/B); for implementation details see repo docs.

## References

- **DNA Key-Value API (data store)** — docs/architecture/DNA_KEY_VALUE_API.md in repo: how to read/write project.data and user.data via GET/POST /data or project API.
- **MCP_CAPABILITY_MATRIX** — repo docs/MCP_CAPABILITY_MATRIX.md, generated from `GET /mcp/actions`.
