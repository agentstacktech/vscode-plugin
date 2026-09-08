import type { McpActionRow } from "./tenantActionFilter";

type CatalogPayload = {
  actions?: McpActionRow[];
  domains?: Record<string, McpActionRow[]>;
};

/** Normalize GET /mcp/actions into flat action rows. */
export function flattenMcpActionsCatalog(payload: unknown): McpActionRow[] {
  if (!payload || typeof payload !== "object") return [];
  const catalog = payload as CatalogPayload;
  if (Array.isArray(catalog.actions)) {
    return catalog.actions.filter((row) => row && typeof row.action === "string");
  }
  const domains = catalog.domains;
  if (!domains || typeof domains !== "object") return [];
  const out: McpActionRow[] = [];
  for (const list of Object.values(domains)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && typeof row.action === "string") out.push(row);
    }
  }
  return out;
}
