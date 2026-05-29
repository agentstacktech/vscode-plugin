import { z } from "zod";
import type { McpError, ProjectListItem, ProjectsResponse } from "../types";

const projectListItemSchema = z
  .object({
    id: z.number().optional(),
    project_id: z.number().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const projectsResponseSchema = z.object({
  projects: z.array(projectListItemSchema).optional(),
  count: z.number().optional(),
});

export function parseProjectsResponse(raw: unknown): ProjectsResponse | McpError {
  const parsed = projectsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `Invalid projects response: ${parsed.error.message}` };
  }
  const projects = (parsed.data.projects ?? []) as ProjectListItem[];
  const count = parsed.data.count ?? projects.length;
  return { projects, count };
}

const projectStatsSchema = z
  .object({
    stats: z.record(z.string(), z.unknown()).optional(),
    project_id: z.number().optional(),
  })
  .passthrough();

export function parseProjectStats(raw: unknown): Record<string, unknown> | McpError {
  const parsed = projectStatsSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `Invalid stats response: ${parsed.error.message}` };
  }
  return parsed.data as Record<string, unknown>;
}
