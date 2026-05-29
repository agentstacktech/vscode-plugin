---
name: agentstack-commerce-assets
description: Digital goods, asset presets, inventory wizard, marketplace items. Prefer assets.* and sdk.commerce.assets over custom product tables.
---

# AgentStack Commerce Assets

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| Digital item / preset | assets.*, asset_presets_v1 | Custom SKU tables |
| Compose / wizard | @agentstack/sdk/commerce/assets | Hand-built forms |
| Payments / wallet | agentstack-commerce skill | assets.* for money |

## References

- Genes: sdk.commerce.assets.gen1, frontend.commerce.assets.wizard.gen1
- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
