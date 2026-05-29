---
name: agentstack-storage
description: Use when the user mentions upload file, storage quota, list files, avatar, attachment, or media in AgentStack project storage.
---

# AgentStack Storage

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| upload file | storage.* + POST /api/storage/upload | Direct S3 |
| list files | storage.list_files | Custom bucket browser |
| quota | storage.get_quota | Guessing limits |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
