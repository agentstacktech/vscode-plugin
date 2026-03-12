/**
 * MCP API types for AgentStack (get_projects, get_project, get_stats, get_users).
 * Aligned with UNIFIED data architecture: data + config in project.data.
 */

export interface McpError {
  error: string;
}

/** Project list item (get_projects). */
export interface ProjectListItem {
  id?: number;
  project_id?: number;
  name?: string;
  description?: string;
  is_active?: boolean;
  stats?: { requests?: number; active_buffs?: number; [key: string]: unknown };
  active_buffs?: number;
  [key: string]: unknown;
}

export interface ProjectsResponse {
  projects: ProjectListItem[];
  count?: number;
}

/** Full project (get_project) — includes data (8DNA). */
export interface ProjectData {
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProjectFull {
  id?: number;
  project_id?: number;
  name?: string;
  description?: string;
  is_active?: boolean;
  data?: ProjectData;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ProjectStats {
  requests?: number;
  active_buffs?: number;
  users?: number;
  [key: string]: unknown;
}

export interface ProjectUser {
  id?: number;
  user_id?: number;
  project_id?: number;
  email?: string;
  role?: string;
  is_active?: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProjectUsersResponse {
  users?: ProjectUser[];
  count?: number;
}

/** Asset (assets.get, assets.list item). */
export interface Asset {
  id?: string;
  name?: string;
  type?: string;
  price_usdt?: string;
  project_id?: number;
  components?: Record<string, unknown>;
  created_at?: string;
  [key: string]: unknown;
}

/** Response from assets.list. */
export interface AssetsListResponse {
  assets?: Asset[];
  total?: number;
  limit?: number;
  offset?: number;
}

/** Active buff (buffs.list_active_buffs item). */
export interface ActiveBuff {
  buff_id?: string;
  name?: string;
  state?: string;
  expires_at?: string;
  category?: string;
  [key: string]: unknown;
}

/** Response from buffs.list_active_buffs. */
export interface ListActiveBuffsResponse {
  active_buffs?: ActiveBuff[];
  entity_id?: number;
  entity_kind?: string;
}

/** Response from payments.get_balance. */
export interface GetBalanceResponse {
  balance?: number;
  currency?: string;
  project_id?: number;
  updated_at?: string;
}

/** Logic rule (logic.list item or logic.get). */
export interface LogicRule {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  triggers?: unknown[];
  schedulers?: unknown[];
  space?: unknown[];
  [key: string]: unknown;
}

/** Response from logic.list. */
export interface LogicListResponse {
  logic?: LogicRule[];
  count?: number;
}
