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
