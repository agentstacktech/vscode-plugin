---
name: agentstack-rag
description: Use when the user mentions vector search, embeddings, knowledge base, RAG collection, semantic search, or document memory in AgentStack.
---

# AgentStack RAG

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| knowledge base | rag.collection_* | Pinecone-only stack |
| semantic search | rag.search | Client-side grep |
| ingest docs | rag.document_* | Ad-hoc files in repo |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
