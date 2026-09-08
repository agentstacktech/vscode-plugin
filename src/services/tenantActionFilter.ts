/**
 * Tenant-facing MCP action filter — mirrors shared/mcp/doc_audience.py.
 * @see docs.public.classification.gen1
 */

const OPERATOR_CATEGORIES = new Set(["admin"]);

const OPERATOR_PREFIXES = [
  "social.admin.",
  "rest.admin.",
  "agentnet.admin.",
  "grants.",
  "fundraising.",
];

const OPERATOR_ACTIONS = new Set([
  "integrations.get_platform_diagnostics",
  "scheduler.get_all_db_tasks",
]);

const FORBIDDEN_DESCRIPTION_PATTERNS = [
  /platform_db_init/i,
  /platform_schema_migrations/i,
  /database_migrations/i,
  /pg_bus_enabled/i,
  /\bdata_channels\b/i,
  /DNA ring/i,
  /ecosystem owner/i,
  /platform admin/i,
  /\bOps:/i,
];

export type McpActionRow = {
  action: string;
  category?: string;
  summary?: string;
  doc_audience?: string;
};

export function inferDocAudience(
  action: string,
  meta: Partial<McpActionRow> = {},
): "tenant" | "operator" | "internal" {
  const explicit = meta.doc_audience;
  if (explicit === "tenant" || explicit === "operator" || explicit === "internal") {
    return explicit;
  }

  const actionL = String(action || "").toLowerCase();
  const cat = String(meta.category || action.split(".", 1)[0] || "").toLowerCase();
  let audience: "tenant" | "operator" | "internal" = "tenant";

  if (OPERATOR_CATEGORIES.has(cat)) {
    audience = "operator";
  } else if (OPERATOR_PREFIXES.some((p) => actionL.startsWith(p))) {
    audience = "operator";
  } else if (OPERATOR_ACTIONS.has(action)) {
    audience = "operator";
  } else {
    const summaryL = String(meta.summary || "").toLowerCase();
    if (
      summaryL.includes("ecosystem owner") ||
      summaryL.includes("platform admin") ||
      summaryL.includes("operator:") ||
      summaryL.startsWith("ops:")
    ) {
      audience = "operator";
    }
  }

  if (audience === "tenant" && meta.summary) {
    for (const pattern of FORBIDDEN_DESCRIPTION_PATTERNS) {
      if (pattern.test(meta.summary)) {
        return "operator";
      }
    }
  }

  return audience;
}

export function isTenantDocAction(row: McpActionRow): boolean {
  return inferDocAudience(row.action, row) === "tenant";
}

export function filterTenantActions(rows: McpActionRow[]): McpActionRow[] {
  return rows.filter((row) => isTenantDocAction(row));
}
